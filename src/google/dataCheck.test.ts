// The Google data check over a stubbed API and an in-memory Store: per day, Google's values next to Pulse's.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {}, multiRemove: async () => {} } }));
vi.mock("react-native-health-connect", () => ({}));

const { MemoryStore } = await import("@/data/memory");
const { emptyMetrics } = await import("@/data/types");
const { runGoogleDataCheck } = await import("./dataCheck");

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-10-02T06:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fixture = (name: string): unknown[] => {
  const j = JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), "utf8"));
  return j.dataPoints ?? j.rollupDataPoints;
};

describe("Google data check", () => {
  it("shows each day's Google values by source beside Pulse's, and says what it couldn't read", async () => {
    const store = new MemoryStore();
    await store.upsertMetrics([{ ...emptyMetrics("2026-10-01"), rhrBpm: 57, steps: 8421, spo2Pct: 96.4 }]);
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const [, type, rollup] = /dataTypes\/([^/]+)\/dataPoints(:dailyRollUp)?$/.exec(url.pathname)!;
      if (type === "daily-respiratory-rate") return json({ error: { status: "INVALID_ARGUMENT" } }, 400);
      if (rollup) return json({ rollupDataPoints: type === "steps" ? fixture("steps.dailyRollUp") : [] });
      const known = ["daily-resting-heart-rate", "daily-oxygen-saturation", "sleep"];
      return json({ dataPoints: known.includes(type) ? fixture(type) : [] });
    }) as unknown as typeof globalThis.fetch;

    const r = await runGoogleDataCheck(store, { timeZone: TZ, token: async () => "at", now: NOW, days: 3, fetch, sleep: async () => {} });
    expect(r.days.map((d) => d.day)).toEqual(["2026-10-02", "2026-10-01", "2026-09-30"]);
    const oct1 = r.days[1];
    const line = (k: string) => oct1.metrics.find((m) => m.key === k)!;
    expect(line("rhr")).toMatchObject({ pulse: 57, sources: [{ source: "Fitbit/<device>", value: 57, records: 1, detail: "derived" }] });
    expect(line("steps")).toMatchObject({ pulse: 8421, sources: [{ source: "Google daily roll-up", value: 8421 }] });
    expect(line("spo2").sources[0].value).toBe(96.4);
    expect(oct1.sleep.sources.map((x) => x.detail)).toEqual(["23:30–07:10, 6 stages [SUCCEEDED], main"]);
    expect(r.errors).toEqual(["Breathing: [google] daily-respiratory-rate: INVALID_ARGUMENT (HTTP 400)"]);
    expect(r.text).toContain("Halo data check — Google Health API");
    expect(r.text).toContain("Resting HR: Halo 57 bpm");
    expect(r.text).toContain("Not read:");
  });
});
