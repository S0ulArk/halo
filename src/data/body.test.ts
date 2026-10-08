import { describe, expect, it } from "vitest";
import { metricsWithLoggedBody } from "./body";
import { openMemoryStore } from "./memory";
import { emptyMetrics } from "./types";

const at = (iso: string) => Date.parse(iso) / 1000;

describe("metricsWithLoggedBody", () => {
  it("leaves metrics alone without logged entries", async () => {
    const store = openMemoryStore();
    await store.upsertMetrics([{ ...emptyMetrics("2026-10-01"), weightKg: 80 }]);
    expect((await metricsWithLoggedBody(store)).map((m) => m.weightKg)).toEqual([80]);
  });

  it("puts the latest logged weight and body fat of a day over Health Connect's, and adds days that had none", async () => {
    const store = openMemoryStore();
    await store.upsertMetrics([{ ...emptyMetrics("2026-10-01"), weightKg: 80, bodyFatPct: 20 }, { ...emptyMetrics("2026-10-02"), hrvMs: 50 }]);
    await store.addLoggedEntries([
      { id: "a", type: "weight", ts: at("2026-10-01T07:00:00+05:30"), day: "2026-10-01", data: { kg: 79.2 }, createdAt: 1, source: "pulse" },
      { id: "b", type: "weight", ts: at("2026-10-01T21:00:00+05:30"), day: "2026-10-01", data: { kg: 79.8 }, createdAt: 2, source: "pulse" },
      { id: "c", type: "body-fat", ts: at("2026-10-03T07:00:00+05:30"), day: "2026-10-03", data: { pct: 18.4 }, createdAt: 3, source: "pulse" },
      { id: "d", type: "hydration-log", ts: at("2026-10-02T07:00:00+05:30"), day: "2026-10-02", data: { ml: 250 }, createdAt: 4, source: "pulse" },
    ]);
    const rows = await metricsWithLoggedBody(store);
    expect(rows.map((m) => [m.day, m.weightKg, m.bodyFatPct, m.hrvMs])).toEqual([
      ["2026-10-01", 79.8, 20, null],
      ["2026-10-02", null, null, 50],
      ["2026-10-03", null, 18.4, null],
    ]);
  });

  it("puts logged blood oxygen on its day (Health Connect gets none from Google Health)", async () => {
    const store = openMemoryStore();
    await store.upsertMetrics([{ ...emptyMetrics("2026-10-06"), hrvMs: 50 }]);
    await store.addLoggedEntries([
      { id: "a", type: "oxygen-saturation", ts: at("2026-10-06T08:00:00+05:30"), day: "2026-10-06", data: { pct: 95 }, createdAt: 1, source: "pulse" },
      { id: "b", type: "oxygen-saturation", ts: at("2026-10-06T09:00:00+05:30"), day: "2026-10-06", data: { pct: 96 }, createdAt: 2, source: "pulse" },
    ]);
    expect((await metricsWithLoggedBody(store)).map((m) => [m.day, m.spo2Pct, m.hrvMs])).toEqual([["2026-10-06", 96, 50]]);
  });
});
