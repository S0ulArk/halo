// The web app's pullHeartRate tests, for the phone's Google live pull.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {}, multiRemove: async () => {} } }));

const { MemoryStore } = await import("@/data/memory");
const { GoogleError } = await import("./client");
const { MIN_GAP_S, pullGoogleHeartRate, resetGooglePullClock } = await import("./live");

const TZ = "Asia/Kolkata";
const NOW = Date.parse("2026-10-02T06:00:00Z") / 1000;
const sec = (iso: string) => Date.parse(iso) / 1000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const hrPoint = (iso: string, bpm: number) => ({
  dataSource: { platform: "FITBIT", recordingMethod: "PASSIVELY_MEASURED" },
  heartRate: { beatsPerMinute: String(bpm), sampleTime: { physicalTime: iso } },
});
const lower = (f: string | null) => /"([^"]+)"/.exec(f!)![1];
const upper = (f: string | null) => /< "([^"]+)"/.exec(f!)![1];

function setup(answer: () => Response) {
  const filters: (string | null)[] = [];
  const fetch = vi.fn(async (input: string | URL | Request) => {
    filters.push(new URL(String(input)).searchParams.get("filter"));
    return answer();
  }) as unknown as typeof globalThis.fetch;
  return { fetch, filters };
}

let store: InstanceType<typeof MemoryStore>;
beforeEach(() => {
  store = new MemoryStore();
  resetGooglePullClock();
});

describe("pullGoogleHeartRate (the live reading)", () => {
  it("lists heart-rate once, from the newest stored sample minus 10 minutes to now, and merges it", async () => {
    await store.putHr([{ ts: sec("2026-10-02T05:50:30Z"), bpm: 60 }]);
    const { fetch, filters } = setup(() => json({ dataPoints: [hrPoint("2026-10-02T05:50:30Z", 60), hrPoint("2026-10-02T05:58:00Z", 77)] }));
    expect(await pullGoogleHeartRate(store, { token: async () => "at", timeZone: TZ, now: NOW, fetch })).toBe(1);
    expect(filters).toHaveLength(1);
    expect(lower(filters[0])).toBe("2026-10-02T05:40:00.000Z"); // minute-aligned, 10 min before 05:50:30
    expect(upper(filters[0])).toBe("2026-10-02T06:00:00.000Z");
    expect(await store.readHr(sec("2026-10-02T05:00:00Z"), sec("2026-10-02T07:00:00Z"))).toEqual([
      { ts: sec("2026-10-02T05:50:30Z"), bpm: 60 },
      { ts: sec("2026-10-02T05:58:00Z"), bpm: 77 },
    ]);
    expect(await store.takeIntradayDirty()).toEqual(["2026-10-02"]); // the next scoring run rescores it
  });

  it("with nothing stored (or only older days), starts at today's local midnight", async () => {
    await store.putHr([{ ts: sec("2026-09-28T05:00:00Z"), bpm: 60 }]);
    const { fetch, filters } = setup(() => json({}));
    await pullGoogleHeartRate(store, { token: async () => "at", timeZone: TZ, now: NOW, fetch });
    expect(lower(filters[0])).toBe("2026-10-01T18:30:00.000Z"); // 00:00 in Asia/Kolkata
  });

  it("does not retry a 429: it throws at once for the ticker to try later", async () => {
    const { fetch, filters } = setup(() => json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429));
    const err = await pullGoogleHeartRate(store, { token: async () => "at", timeZone: TZ, now: NOW, fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoogleError);
    expect((err as InstanceType<typeof GoogleError>).status).toBe(429);
    expect(filters).toHaveLength(1);
  });

  it("skips a pull within MIN_GAP_S of the last one, unless forced", async () => {
    const { fetch, filters } = setup(() => json({}));
    await pullGoogleHeartRate(store, { token: async () => "at", timeZone: TZ, now: NOW, fetch });
    await pullGoogleHeartRate(store, { token: async () => "at", timeZone: TZ, now: NOW + 60, fetch });
    expect(filters).toHaveLength(1);
    await pullGoogleHeartRate(store, { token: async () => "at", timeZone: TZ, now: NOW + 60, fetch, force: true });
    await pullGoogleHeartRate(store, { token: async () => "at", timeZone: TZ, now: NOW + 60 + MIN_GAP_S, fetch });
    expect(filters).toHaveLength(3);
  });
});
