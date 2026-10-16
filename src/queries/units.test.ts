// Settings › Units through the view models, on the demo seed: the same queries read with metric and with US units give
// the same numbers converted (weight ×2.2046, distance ÷1.6093, skin temperature's change from baseline ×9/5 without
// +32), every average and spread with them, and the coach's tools (no units in their context) stay metric.
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { seedDemo } from "@/data/seed";
import type { Profile } from "@/data/types";
import { IMPERIAL, KG_PER_LB, KM_PER_MI, METRIC } from "@/lib/units";
import { runPipeline } from "@/pipeline";
import { getActivities } from "./activities";
import { getActivity } from "./activity";
import { getChartSeries } from "./chart";
import type { QueryCtx } from "./ctx";
import { getMonitor } from "./health";
import { getHome } from "./home";
import { describeEntry } from "./log";
import { getMetricDetail } from "./metric";
import { getRecovery } from "./recovery";
import { getTrends } from "./trends";
import { localizeDef, localizeStat, unitsOf } from "./units";
import type { KeyStat } from "./types";

const TZ = "Asia/Kolkata";
const TODAY = "2026-10-02";
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
const PROFILE: Profile = { birthDate: "1990-01-01", sex: "male", maxHr: 183, heightCm: 178, timeZone: TZ };
const LB = 1 / KG_PER_LB;

let metric: QueryCtx;
let us: QueryCtx;
beforeAll(async () => {
  const store = new MemoryStore();
  await seedDemo(store, { today: TODAY, timeZone: TZ, now: NOW, days: 40 });
  await runPipeline(store, PROFILE, { today: TODAY });
  metric = { store, profile: PROFILE, timeZone: TZ, today: TODAY, now: NOW, sync: await store.getSyncState() };
  us = { ...metric, units: IMPERIAL };
});

describe("the helpers", () => {
  it("reads metric when a context carries no units", () => {
    expect(unitsOf({})).toEqual(METRIC);
    expect(unitsOf({ units: IMPERIAL })).toEqual(IMPERIAL);
  });

  it("converts a stat's value and average, and its SD by the factor alone; a change from baseline has no +32", () => {
    const weight: KeyStat = { key: "weight", label: "Weight", unit: "kg", metric: { value: 80, reason: null, provisional: false }, average: 79, sd: 1, direction: "neutral" };
    const lb = localizeStat(weight, IMPERIAL);
    expect(lb.unit).toBe("lb");
    expect(lb.metric.value).toBeCloseTo(80 * LB, 10);
    expect(lb.average).toBeCloseTo(79 * LB, 10);
    expect(lb.sd).toBeCloseTo(LB, 10);
    expect(localizeStat(weight, METRIC)).toBe(weight);

    const skin: KeyStat = { key: "skin", label: "Skin", unit: "°C", metric: { value: 0.5, reason: null, provisional: false }, average: 0.1, sd: 0.2, direction: "toward_zero" };
    const f = localizeStat(skin, IMPERIAL, true);
    expect(f).toMatchObject({ unit: "°F" });
    expect(f.metric.value).toBeCloseTo(0.9, 10);
    expect(f.average).toBeCloseTo(0.18, 10);
    expect(f.sd).toBeCloseTo(0.36, 10);
    // The same number as a reading would be 32.9 °F.
    expect(localizeStat(skin, IMPERIAL).metric.value).toBeCloseTo(32.9, 10);
  });

  it("wraps a catalogue metric's pick, keeping missing values missing", () => {
    const def = { unit: "km", pick: (r: { v: number | null }) => r.v };
    const mi = localizeDef(def as never, IMPERIAL) as unknown as typeof def;
    expect(mi.unit).toBe("mi");
    expect(mi.pick({ v: 1.609344 })).toBeCloseTo(1, 12);
    expect(mi.pick({ v: null })).toBeNull();
  });
});

describe("the screens' view models", () => {
  it("Trends: weight in pounds, distance in miles, every point and average converted", async () => {
    for (const [key, k] of [["weight", LB], ["distance", 1 / KM_PER_MI]] as const) {
      const [a, b] = await Promise.all([getTrends(key, metric), getTrends(key, us)]);
      expect(b.unit).toBe(key === "weight" ? "lb" : "mi");
      expect(a.unit).toBe(key === "weight" ? "kg" : "km");
      const pa = a.points.value ?? [];
      const pb = b.points.value ?? [];
      expect(pa.some((p) => p.value !== null)).toBe(true);
      pa.forEach((p, i) => (p.value === null ? expect(pb[i].value).toBeNull() : expect(pb[i].value).toBeCloseTo(p.value * k, 9)));
      a.periods.forEach((p, i) => {
        if (p.average.value !== null) expect(b.periods[i].average.value).toBeCloseTo(p.average.value * k, 9);
      });
    }
  });

  it("Health Monitor: skin temperature's change, its range and trend ×9/5 with no +32; the status is the same", async () => {
    const [a, b] = await Promise.all([getMonitor(TODAY, metric), getMonitor(TODAY, us)]);
    const sa = a.vitals.find((v) => v.key === "skinTempDev")!;
    const sb = b.vitals.find((v) => v.key === "skinTempDev")!;
    expect(sa.unit).toBe("°C");
    expect(sb.unit).toBe("°F");
    expect(sb.status).toBe(sa.status);
    expect(sa.metric.value).not.toBeNull();
    expect(sb.metric.value).toBeCloseTo(sa.metric.value! * 1.8, 9);
    expect(sa.range).not.toBeNull();
    if (sa.range) {
      expect(sb.range!.low).toBeCloseTo(sa.range.low * 1.8, 9);
      expect(sb.range!.high).toBeCloseTo(sa.range.high * 1.8, 9);
    }
    sa.trend.points.forEach((p, i) => p.value !== null && expect(sb.trend.points[i].value).toBeCloseTo(p.value * 1.8, 9));
    // The other vitals have no unit choice.
    expect(b.vitals.find((v) => v.key === "hrv")).toEqual(a.vitals.find((v) => v.key === "hrv"));
    // Weight among the measurements, in pounds.
    const wa = a.measurements.find((m) => m.key === "weight")!;
    const wb = b.measurements.find((m) => m.key === "weight")!;
    expect(wb.unit).toBe("lb");
    expect(wb.metric.value).toBeCloseTo(wa.metric.value! * LB, 9);
  });

  it("Recovery: the skin-temperature contributor and its baseline spread ×9/5", async () => {
    const [a, b] = await Promise.all([getRecovery(TODAY, metric), getRecovery(TODAY, us)]);
    const ca = a.contributors.find((c) => c.key === "skinTemp")!;
    const cb = b.contributors.find((c) => c.key === "skinTemp")!;
    expect(cb.unit).toBe("°F");
    expect(ca.metric.value).not.toBeNull();
    expect(ca.baseline).not.toBeNull();
    expect(cb.metric.value).toBeCloseTo(ca.metric.value! * 1.8, 9);
    expect(cb.baseline).toEqual({ mean: ca.baseline!.mean * 1.8, sd: expect.closeTo(ca.baseline!.sd * 1.8, 9) });
    expect(cb.points).toBe(ca.points);
    expect(b.contributors.find((c) => c.key === "hrv")).toEqual(a.contributors.find((c) => c.key === "hrv"));
  });

  it("Home's dashboard rows: skin temperature signed in °F, weight in lb, distance in miles", async () => {
    const keys = ["skin", "weight", "distance", "steps"];
    // A day with a weigh-in (the seed weighs every 30 days), so every row has a value.
    const weighIn = (await getTrends("weight", metric)).points.value!.findLast((p) => p.value !== null)!.day;
    const [a, b] = await Promise.all([getHome(weighIn, metric, { dashboardKeys: keys }), getHome(weighIn, us, { dashboardKeys: keys })]);
    const by = (vm: typeof a, k: string) => vm.keyStats.find((s) => s.key === k)!;
    expect(by(b, "skin")).toMatchObject({ unit: "°F", format: "signed1" });
    expect(by(b, "weight").unit).toBe("lb");
    expect(by(b, "distance").unit).toBe("mi");
    expect(by(b, "steps")).toEqual(by(a, "steps"));
    const k = { skin: 1.8, weight: LB, distance: 1 / KM_PER_MI } as const;
    for (const key of ["skin", "weight", "distance"] as const) {
      const sa = by(a, key);
      const sb = by(b, key);
      expect(sa.metric.value).not.toBeNull();
      expect(sb.metric.value).toBeCloseTo(sa.metric.value! * k[key], 9);
      if (sa.average !== null) expect(sb.average).toBeCloseTo(sa.average * k[key], 9);
      if (sa.sd !== undefined) expect(sb.sd).toBeCloseTo(sa.sd * k[key], 9);
    }
  });

  it("the chart explorer: skin temperature's values and normal range ×9/5", async () => {
    const [a, b] = await Promise.all([getChartSeries("skin_temp", metric), getChartSeries("skin_temp", us)]);
    expect(b.unit).toBe("°F");
    a.values.forEach((v, i) => (v === null ? expect(b.values[i]).toBeNull() : expect(b.values[i]).toBeCloseTo(v * 1.8, 9)));
    expect(a.baseline).not.toBeNull();
    if (a.baseline) {
      expect(b.baseline!.mean).toBeCloseTo(a.baseline.mean * 1.8, 9);
      expect(b.baseline!.sd).toBeCloseTo(a.baseline.sd * 1.8, 9);
    }
  });

  it("Distance's own screen: the value, history, range totals and the workouts' split in miles", async () => {
    const day = "2026-10-01";
    const [a, b] = await Promise.all([getMetricDetail("distance", day, metric), getMetricDetail("distance", day, us)]);
    const k = 1 / KM_PER_MI;
    expect(b.unit).toBe("mi");
    expect(b.value.value).toBeCloseTo(a.value.value! * k, 9);
    expect(b.ranges.m.total).toBeCloseTo(a.ranges.m.total! * k, 9);
    const ha = a.history.value ?? [];
    const hb = b.history.value ?? [];
    expect(ha.filter((p) => p.parts && p.parts.workouts > 0).length).toBeGreaterThan(0);
    ha.forEach((p, i) => {
      if (p.value === null) return;
      expect(hb[i].value).toBeCloseTo(p.value * k, 9);
      if (p.parts) {
        expect(hb[i].parts!.workouts).toBeCloseTo(p.parts.workouts * k, 9);
        expect(hb[i].parts!.workouts + hb[i].parts!.everyday).toBeCloseTo(hb[i].value!, 9);
      }
    });
  });

  it("a workout: distance in miles and pace per mile, from the same km and seconds per km", async () => {
    const groups = (await getActivities(30, metric)).groups;
    const run = groups.flatMap((g) => g.items).find((i) => i.activityKind === "run" && i.distanceKm !== null);
    if (!run) throw new Error("no run in the seed");
    const [a, b] = await Promise.all([getActivity(run.id, metric), getActivity(run.id, us)]);
    const stat = (vm: typeof a, k: string) => vm!.stats.find((s) => s.key === k)!;
    expect(stat(b, "distance").unit).toBe("mi");
    expect(stat(b, "distance").metric.value).toBeCloseTo(stat(a, "distance").metric.value! / KM_PER_MI, 9);
    expect(stat(b, "pace").unit).toBe("/mi");
    expect(stat(b, "pace").metric.value).toBeCloseTo(stat(a, "pace").metric.value! * KM_PER_MI, 9);
    expect(stat(b, "avgHr")).toEqual(stat(a, "avgHr"));
  });

  it("the coach's tools read a context without units, so everything stays metric", async () => {
    const t = await getTrends("weight", metric);
    expect(t.unit).toBe("kg");
  });

  it("the log's lines: water and weight in the chosen units", () => {
    expect(describeEntry("hydration-log", { ml: 330 })).toEqual({ title: "Water", detail: "330 ml" });
    expect(describeEntry("hydration-log", { ml: 330 }, IMPERIAL).detail).toBe("11.2 fl oz");
    expect(describeEntry("weight", { kg: 72.4 })).toEqual({ title: "Weight", detail: "72.4 kg" });
    expect(describeEntry("weight", { kg: 72.4 }, IMPERIAL).detail).toBe("159.6 lb");
  });
});
