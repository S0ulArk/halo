/// <reference types="node" />
// The chart explorer's queries on the in-memory Store over the 180-day demo seed (as reports.test.ts): every metric's
// whole history matches what Trends shows, and the day views come back in minutes from local midnight.
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { seedDemo } from "@/data/seed";
import type { Profile } from "@/data/types";
import { addDays } from "@/lib/time";
import { runPipeline } from "@/pipeline";
import { compareDomain, dailySeries, daySeries, runningStats, windowFor, yDomain } from "@/screens/chart/model";
import { CHART_GROUPS, CHART_METRICS, chartDef, DAY_VIEW, getChartDay, getChartSeries } from "./chart";
import { loadDays, toStrain } from "./common";
import type { QueryCtx } from "./ctx";
import { getStrain } from "./strain";
import { getTrends } from "./trends";

const TZ = "Asia/Kolkata";
const TODAY = "2026-10-02";
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
const PROFILE: Profile = { birthDate: "1990-01-01", sex: "male", maxHr: 183, heightCm: 178, timeZone: TZ };

let ctx: QueryCtx;
beforeAll(async () => {
  const store = new MemoryStore();
  await seedDemo(store, { today: TODAY, timeZone: TZ, now: NOW });
  await runPipeline(store, PROFILE, { today: TODAY });
  ctx = { store, profile: PROFILE, timeZone: TZ, today: TODAY, now: NOW, sync: await store.getSyncState() };
});

describe("catalogue", () => {
  it("has one entry per key, every one in a picker section", () => {
    const keys = CHART_METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(CHART_GROUPS.flatMap((g) => g.metrics).length).toBe(keys.length);
    // The keys the chart cards open.
    for (const k of ["recovery", "strain", "hrv", "rhr", "steps", "calories", "efficiency", "debt", "restorative", "workouts", "spo2", "skin_temp", "vo2max", "pulse_age", "energy", "stress", "avg_hr", "hours"])
      expect(chartDef(k), k).not.toBeNull();
    expect(chartDef("nope")).toBeNull();
  });
});

describe("getChartSeries", () => {
  it("covers every stored day up to today and agrees with Trends", async () => {
    const vm = await getChartSeries("recovery", ctx);
    expect(vm.days.at(-1)).toBe(TODAY);
    expect(vm.days.length).toBe(vm.values.length);
    for (let i = 1; i < vm.days.length; i++) expect(vm.days[i]).toBe(addDays(vm.days[i - 1], 1));
    const trends = await getTrends("recovery", ctx);
    const byDay = new Map(vm.days.map((d, i) => [d, vm.values[i]]));
    for (const p of trends.points.value ?? []) if (byDay.has(p.day)) expect(byDay.get(p.day)).toBe(p.value);
    expect(vm.values.some((v) => v !== null)).toBe(true);
  });

  it("draws today's running total, flagged so-far, and keeps it out of the normal range", async () => {
    const steps = await getChartSeries("steps", ctx);
    expect(steps.values.at(-1)).not.toBeNull();
    expect(steps.partial.at(-1)).toBe(true);
    expect(steps.partial.slice(0, -1).every((p) => !p)).toBe(true);
    expect(steps.reference).toEqual({ y: 7000, label: "7,000" });
    // A reading (not a running total) is never partial.
    expect((await getChartSeries("hrv", ctx)).partial.every((p) => !p)).toBe(true);
  });

  it("shades a normal range for vitals and labels Pulse Age with your age", async () => {
    const hrv = await getChartSeries("hrv", ctx);
    expect(hrv.baseline?.sd).toBeGreaterThan(0);
    const age = await getChartSeries("pulse_age", ctx);
    expect(age.reference?.label).toBe("Your age");
    age.days.forEach((d, i) => {
      if (age.values[i] !== null) expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(0);
    });
  });

  it("returns finite numbers or gaps for every metric, and the explorer's axes stay finite", async () => {
    for (const def of CHART_METRICS) {
      const vm = await getChartSeries(def.key, ctx);
      for (const v of vm.values) if (v !== null) expect(Number.isFinite(v), def.key).toBe(true);
      const s = dailySeries(def, vm);
      const w = windowFor("m", s, s.xs.length - 1);
      const d = yDomain(s, w.start, w.start + w.span, { bars: def.mark === "bar" });
      expect([d.lo, d.hi, ...d.ticks].every(Number.isFinite), def.key).toBe(true);
      const c = compareDomain(s, w.start, w.start + w.span, d.ticks.length);
      expect(c.ticks).toHaveLength(d.ticks.length);
    }
  });
});

describe("getChartDay", () => {
  const day = addDays(TODAY, -1);

  it("gives a day of heart rate in minutes from local midnight, with ascending zones", async () => {
    const vm = await getChartDay("hr", day, ctx);
    expect(vm.xs.length).toBe(vm.ys.length);
    expect(vm.xs.length).toBeGreaterThan(0);
    expect(vm.xs[0]).toBeGreaterThanOrEqual(0);
    expect(vm.xs.at(-1)!).toBeLessThan(1441);
    for (let i = 1; i < vm.zones.length; i++) expect(vm.zones[i].min).toBeGreaterThan(vm.zones[i - 1].min);
    const s = daySeries(vm, DAY_VIEW.hr.label, DAY_VIEW.hr.unit, DAY_VIEW.hr.format);
    expect(windowFor("day", s, 0).span).toBeGreaterThan(0);
  });

  it("gives the night's heart rate and stages around bed and wake", async () => {
    const vm = await getChartDay("sleep", day, ctx);
    expect(vm.bed).not.toBeNull();
    expect(vm.wake!).toBeGreaterThan(vm.bed!);
    expect(vm.from).toBeLessThanOrEqual(vm.bed!);
    expect(vm.to).toBeGreaterThanOrEqual(vm.wake!);
    for (const g of vm.stages) expect(g.to).toBeGreaterThan(g.from);
  });

  it("builds Day Strain minute by minute and ends exactly on the day's Strain", async () => {
    for (const dd of [day, addDays(TODAY, -3), TODAY]) {
      const vm = await getChartDay("strain", dd, ctx);
      const row = (await loadDays(ctx, dd, dd)).get(dd)!;
      expect(row.s1?.effort, dd).not.toBeNull();
      expect(vm.xs.length, dd).toBeGreaterThan(60);
      expect(vm.xs.length).toBe(vm.ys.length);
      // The number on the Strain screen and in the explorer's daily strain series, to the bit.
      const shown = (await getStrain(dd, ctx)).strain.value;
      expect(vm.ys.at(-1), dd).toBe(shown);
      expect(vm.ys.at(-1)).toBe(toStrain(row.s1!.effort!));
      const daily = await getChartSeries("strain", ctx);
      expect(daily.values[daily.days.indexOf(dd)]).toBe(vm.ys.at(-1));
      // Never falls, minutes ascending inside the day, on the Strain scale.
      for (let i = 1; i < vm.ys.length; i++) {
        expect(vm.xs[i]).toBeGreaterThan(vm.xs[i - 1]);
        expect(vm.ys[i]!).toBeGreaterThanOrEqual(vm.ys[i - 1]!);
      }
      expect(vm.xs[0]).toBeGreaterThanOrEqual(0);
      expect(vm.xs.at(-1)!).toBeLessThanOrEqual(1440);
      for (const y of vm.ys) expect(y!).toBeLessThanOrEqual(21);
      // The window's numbers over the whole day: from nothing to the day's Strain.
      const s = daySeries(vm, DAY_VIEW.strain.label, DAY_VIEW.strain.unit, DAY_VIEW.strain.format);
      expect(s.cumulative).toBe(true);
      const run = runningStats(s, vm.from, vm.to);
      expect(run.end).toBe(shown);
      expect(run.start).toBe(0);
      // Its axis starts at zero.
      expect(yDomain(s, vm.from, vm.to, { bars: false }).lo).toBe(0);
    }
    // A past day runs to midnight; today stops at the last reading, marked "now".
    expect((await getChartDay("strain", day, ctx)).xs.at(-1)).toBe(1440);
    const today = await getChartDay("strain", TODAY, ctx);
    expect(today.now).not.toBeNull();
    expect(today.xs.at(-1)!).toBeLessThanOrEqual(Math.floor(today.now!) + 1);
  });

  it("shades the day's Strain Target under Day Strain", async () => {
    const vm = await getChartDay("strain", day, ctx);
    const target = (await getStrain(day, ctx)).target.value;
    if (target) expect(vm.band).toEqual({ lo: target.low, hi: target.high });
    else expect(vm.band).toBeNull();
  });

  it("gives a heart-rate day its resting and average heart rate, each the metric's own value", async () => {
    const vm = await getChartDay("hr", day, ctx);
    const row = (await loadDays(ctx, day, day)).get(day)!;
    expect(vm.refs.resting).toBe(row.metrics?.rhrBpm ?? null);
    expect(vm.refs.average).toBe(row.extra.avg_hr ?? null);
    const rhr = await getChartSeries("rhr", ctx);
    expect(vm.refs.resting).toBe(rhr.values[rhr.days.indexOf(day)]);
    const avg = await getChartSeries("avg_hr", ctx);
    expect(vm.refs.average).toBe(avg.values[avg.days.indexOf(day)]);
  });

  it("opens Strain on its own day view, and the heart-rate metrics and workouts on heart rate", () => {
    expect(chartDef("strain")?.day).toBe("strain");
    for (const key of ["rhr", "avg_hr", "workouts"]) expect(chartDef(key)?.day, key).toBe("hr");
    expect(chartDef("stress")?.day).toBe("stress");
    expect(chartDef("energy")?.day).toBe("energy");
    for (const key of ["sleep", "hours", "consistency", "efficiency", "restorative", "debt"]) expect(chartDef(key)?.day, key).toBe("sleep");
  });

  it("gives stress and the Energy Bank on the same clock", async () => {
    const stress = await getChartDay("stress", day, ctx);
    expect(stress.xs.length).toBe(stress.ys.length);
    for (const v of stress.ys) if (v !== null) expect(v).toBeGreaterThanOrEqual(0);
    const energy = await getChartDay("energy", day, ctx);
    for (const v of energy.ys) if (v !== null) expect(v).toBeLessThanOrEqual(100);
    expect(energy.to).toBeGreaterThan(energy.from);
  });
});
