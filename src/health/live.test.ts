// The live reading without a device: Health Connect is mocked, the Store is in memory.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/data/memory";
import { availability, permissionState, readAll } from "@/health/connect";
import { localDay } from "@/lib/time";
import { refreshRecentHeartRate } from "./live";

vi.mock("react-native-health-connect", () => ({}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {}, multiRemove: async () => {} },
}));
vi.mock("@/health/connect", () => ({
  availability: vi.fn(),
  permissionState: vi.fn(),
  readAll: vi.fn(),
  ensureInitialized: vi.fn(),
}));

const TZ = "Asia/Kolkata";
/** 2026-10-07 10:25:00 IST. */
const NOW = Math.floor(Date.parse("2026-10-07T10:25:00+05:30") / 1000);
const at = (offsetS: number) => NOW + offsetS;
const iso = (ts: number) => new Date(ts * 1000).toISOString();

/** One sample every 15 s over [from, to], the bpm cycling up from `base`. */
function series(from: number, to: number, base: number) {
  const out: { ts: number; bpm: number }[] = [];
  for (let ts = from, i = 0; ts <= to; ts += 15, i++) out.push({ ts, bpm: base + (i % 20) });
  return out;
}

/** A Health Connect HeartRate record carrying `samples`. */
const record = (samples: { ts: number; bpm: number }[]) => ({
  metadata: { id: "h1", dataOrigin: "com.fitbit.FitbitMobile" },
  startTime: iso(samples[0].ts),
  endTime: iso(samples[samples.length - 1].ts + 1),
  samples: samples.map((s) => ({ time: iso(s.ts), beatsPerMinute: s.bpm })),
});

const hc = { availability: vi.mocked(availability), permissionState: vi.mocked(permissionState), readAll: vi.mocked(readAll) };
const answer = (samples: { ts: number; bpm: number }[]) => hc.readAll.mockResolvedValue(samples.length ? ([record(samples)] as never) : []);

beforeEach(() => {
  vi.clearAllMocks();
  hc.availability.mockResolvedValue("available");
  hc.permissionState.mockResolvedValue({ granted: ["HeartRate"], missing: [], history: true, background: true });
  hc.readAll.mockResolvedValue([]);
});

describe("refreshRecentHeartRate: demo", () => {
  it("reads the Store only and returns the newest sample with the 30 minutes ending there", async () => {
    const store = new MemoryStore();
    const earlier = series(at(-3 * 3600), at(-3 * 3600 + 600), 60);
    const latest = series(at(-45 * 60), at(-5 * 60), 70);
    await store.putHr([...earlier, ...latest]);

    const r = await refreshRecentHeartRate(store, { source: "demo", now: NOW, timeZone: TZ });

    expect(hc.readAll).not.toHaveBeenCalled();
    expect(hc.permissionState).not.toHaveBeenCalled();
    expect(hc.availability).not.toHaveBeenCalled();
    expect(r.error).toBeUndefined();
    expect(r.added).toBe(0);
    expect(r.latest).toEqual(latest[latest.length - 1]);
    const lo = latest[latest.length - 1].ts - 30 * 60;
    expect(r.samples).toEqual(latest.filter((s) => s.ts >= lo));
    expect(r.samples).toHaveLength(30 * 4 + 1);
  });

  it("has no reading with an empty Store, and no error", async () => {
    const r = await refreshRecentHeartRate(new MemoryStore(), { source: "demo", now: NOW, timeZone: TZ });
    expect(r).toEqual({ latest: null, samples: [], added: 0 });
  });
});

describe("refreshRecentHeartRate: Health Connect", () => {
  it("reads the last 20 minutes, writes only the samples the Store lacks, marks their day dirty and merges the window", async () => {
    const store = new MemoryStore();
    // The full sync wrote everything up to 10 minutes ago; the next Fitbit sync has landed 9 more minutes since.
    const synced = series(at(-25 * 60), at(-10 * 60), 60);
    const newer = series(at(-10 * 60 + 15), at(-60), 80);
    await store.putHr(synced);
    await store.takeIntradayDirty();
    answer([...synced.filter((s) => s.ts >= at(-20 * 60)), ...newer]);

    const r = await refreshRecentHeartRate(store, { now: NOW, timeZone: TZ });

    expect(hc.readAll).toHaveBeenCalledTimes(1);
    const [type, range] = hc.readAll.mock.calls[0];
    expect(type).toBe("HeartRate");
    expect(range.start.getTime()).toBe(at(-20 * 60) * 1000);
    expect(range.end.getTime()).toBe(NOW * 1000);
    expect(r.error).toBeUndefined();
    expect(r.added).toBe(newer.length);
    expect(r.latest).toEqual(newer[newer.length - 1]);
    expect(await store.takeIntradayDirty()).toEqual([localDay(NOW, TZ)]);
    // No duplicates, ascending, the two stretches joined.
    const all = await store.readHr(0, NOW + 1);
    expect(all).toEqual([...synced, ...newer]);
    const lo = newer[newer.length - 1].ts - 30 * 60;
    expect(r.samples).toEqual(all.filter((s) => s.ts >= lo));
  });

  it("leaves the Store and the dirty set alone when nothing is new", async () => {
    const store = new MemoryStore();
    const synced = series(at(-15 * 60), at(-5 * 60), 60);
    await store.putHr(synced);
    await store.takeIntradayDirty();
    answer(synced);

    const r = await refreshRecentHeartRate(store, { now: NOW, timeZone: TZ });

    expect(r.added).toBe(0);
    expect(r.latest).toEqual(synced[synced.length - 1]);
    expect(await store.takeIntradayDirty()).toEqual([]);
  });

  it("rewrites a stored second whose bpm changed", async () => {
    const store = new MemoryStore();
    await store.putHr([{ ts: at(-120), bpm: 64 }]);
    await store.takeIntradayDirty();
    answer([{ ts: at(-120), bpm: 66 }]);

    const r = await refreshRecentHeartRate(store, { now: NOW, timeZone: TZ });

    expect(r.added).toBe(1);
    expect(r.latest).toEqual({ ts: at(-120), bpm: 66 });
    expect(await store.takeIntradayDirty()).toEqual([localDay(NOW, TZ)]);
  });

  it("drops samples outside the asked window", async () => {
    const store = new MemoryStore();
    answer([
      { ts: at(-25 * 60), bpm: 60 },
      { ts: at(30), bpm: 61 },
    ]);
    const r = await refreshRecentHeartRate(store, { now: NOW, timeZone: TZ });
    expect(r.added).toBe(0);
    expect(r.latest).toBeNull();
    expect(await store.takeIntradayDirty()).toEqual([]);
  });

  it("honours `minutes`", async () => {
    await refreshRecentHeartRate(new MemoryStore(), { now: NOW, timeZone: TZ, minutes: 5 });
    expect(hc.readAll.mock.calls[0][1].start.getTime()).toBe(at(-5 * 60) * 1000);
  });

  it("does not read without the heart-rate permission, and still answers from the Store", async () => {
    const store = new MemoryStore();
    const synced = series(at(-15 * 60), at(-5 * 60), 60);
    await store.putHr(synced);
    hc.permissionState.mockResolvedValue({ granted: [], missing: ["HeartRate"], history: false, background: false });

    const r = await refreshRecentHeartRate(store, { now: NOW, timeZone: TZ });

    expect(hc.readAll).not.toHaveBeenCalled();
    expect(r.error).toMatch(/permission/i);
    expect(r.added).toBe(0);
    expect(r.latest).toEqual(synced[synced.length - 1]);
    expect(r.samples).toEqual(synced);
  });

  it("does not read when Health Connect is unavailable", async () => {
    hc.availability.mockResolvedValue("unavailable");
    const r = await refreshRecentHeartRate(new MemoryStore(), { now: NOW, timeZone: TZ });
    expect(hc.permissionState).not.toHaveBeenCalled();
    expect(hc.readAll).not.toHaveBeenCalled();
    expect(r.error).toMatch(/not available/i);
    expect(r.latest).toBeNull();
  });

  it("swallows a failed read into `error` and keeps the Store's reading", async () => {
    const store = new MemoryStore();
    await store.putHr([{ ts: at(-300), bpm: 58 }]);
    hc.readAll.mockRejectedValue(new Error("boom"));

    const r = await refreshRecentHeartRate(store, { now: NOW, timeZone: TZ });

    expect(r.error).toBe("boom");
    expect(r.latest).toEqual({ ts: at(-300), bpm: 58 });
    expect(r.samples).toEqual([{ ts: at(-300), bpm: 58 }]);
  });
});
