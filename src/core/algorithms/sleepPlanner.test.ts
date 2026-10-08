import { describe, expect, it } from "vitest";
import { debtNeedMin, isWeekendDay, sleepPlan, sleepPlannerConfig, strainNeedMin, type SleepPlannerInput, type WakeNight } from "./sleepPlanner";

const iso = (d: number) => new Date(Date.UTC(2026, 8, d)).toISOString().slice(0, 10); // September 2026
/** 14 nights, Sep 17–30: weekdays wake 07:00, weekends 09:00, efficiency 0.9. */
const nights: WakeNight[] = Array.from({ length: 14 }, (_, i) => {
  const day = iso(17 + i);
  return { day, wakeMin: isWeekendDay(day) ? 540 : 420, efficiency: 0.9 };
});
const input = (over: Partial<SleepPlannerInput> = {}): SleepPlannerInput => ({
  baselineNeedHours: 8,
  strain: null,
  debtMin: 0,
  napMin: 0,
  nights,
  wakeDay: "2026-10-01", // a Thursday
  ...over,
});

describe("sleepPlan need: baseline + strain + debt − naps (WHOOP's patent)", () => {
  it("no strain, no debt and no naps gives need = baseline", () => {
    const p = sleepPlan(input());
    expect(p.needMin).toBeCloseTo(480, 10);
    expect(p.parts).toEqual({ baselineMin: 480, strainMin: 0, debtMin: 0, napMin: 0 });
  });

  it("the strain term is 1.7 / (1 + e^((17 − S) / 3.5)) hours: 11 → 16 min, 14 → 30, 18 → 58, 21 → 77", () => {
    expect(sleepPlannerConfig.strainTerm).toEqual({ maxHours: 1.7, mid: 17, width: 3.5 });
    for (const [s, min] of [[11, 16], [14, 30], [18, 58], [21, 77]]) expect(Math.abs(strainNeedMin(s) - min)).toBeLessThan(0.5);
    expect(strainNeedMin(21) / 60).toBeCloseTo(1.289, 3);
    expect(sleepPlan(input({ strain: 18 })).parts.strainMin).toBeCloseTo(strainNeedMin(18), 10);
    expect(strainNeedMin(null)).toBe(0);
    // A strain-18 day adds about 58 minutes, a strain-8 day about 7.
    expect(strainNeedMin(18)).toBeCloseTo(58, 0);
    expect(strainNeedMin(8)).toBeCloseTo(7, 0);
  });

  it("the debt term is half the debt, capped at 60 minutes", () => {
    expect(sleepPlan(input({ debtMin: 60 })).needMin).toBeCloseTo(510, 10);
    expect(debtNeedMin(90)).toBe(45);
    expect(debtNeedMin(200)).toBe(60);
    expect(sleepPlan(input({ debtMin: 500 })).parts.debtMin).toBe(60);
    expect(debtNeedMin(-5)).toBe(0);
  });

  it("a 30-minute nap subtracts 30", () => {
    expect(sleepPlan(input({ napMin: 30 })).needMin).toBeCloseTo(450, 10);
  });

  it("stays within 6.5–11 h", () => {
    expect(sleepPlan(input({ napMin: 200 })).needMin).toBe(390);
    expect(sleepPlan(input({ baselineNeedHours: 8.5, strain: 21, debtMin: 300 })).needMin).toBeCloseTo(8.5 * 60 + strainNeedMin(21) + 60, 8);
    expect(sleepPlan(input({ baselineNeedHours: 10.5, strain: 21, debtMin: 300 })).needMin).toBe(660);
  });
});

describe("sleepPlan bedtimes", () => {
  it("orders 100 % earliest, then 85 %, then 70 %", () => {
    const p = sleepPlan(input());
    expect(p.plans.map((x) => x.share)).toEqual(sleepPlannerConfig.shares);
    const [a, b, c] = p.plans.map((x) => x.bedtimeMin);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // 480 / 0.9 = 533.3 min in bed before 07:00: 22:07 the evening before.
    expect(a).toBeCloseTo(420 - 480 / 0.9, 8);
    expect(p.plans[0].inBedMin).toBeCloseTo(533.33, 1);
  });

  it("uses weekday and weekend wake times", () => {
    const weekday = sleepPlan(input({ wakeDay: "2026-10-01" }));
    const weekend = sleepPlan(input({ wakeDay: "2026-10-03" })); // a Saturday
    expect(weekday).toMatchObject({ weekend: false, wakeMin: 420 });
    expect(weekend).toMatchObject({ weekend: true, wakeMin: 540 });
    expect(weekend.plans[0].bedtimeMin - weekday.plans[0].bedtimeMin).toBeCloseTo(120, 10);
  });

  it("takes the median wake time and efficiency over the last 14 nights", () => {
    const older = Array.from({ length: 10 }, (_, i) => ({ day: iso(1 + i), wakeMin: 300, efficiency: 0.5 }));
    const odd = nights.map((n, i) => (i === 0 ? { ...n, wakeMin: 480, efficiency: null } : n));
    const p = sleepPlan(input({ nights: [...older, ...odd] }));
    expect(p.wakeMin).toBe(420);
    expect(p.efficiency).toBe(0.9);
  });

  it("leaves the typical minutes to fall asleep, so bedtime moves earlier by them", () => {
    // The same sleep once asleep (efficiency 0.95 after sleep onset): one set falls asleep at once, the other after 30 min.
    const quick = nights.map((n) => ({ ...n, efficiency: 0.95, latencyMin: 0, inBedMin: 500 }));
    const slow = nights.map((n) => ({ ...n, efficiency: 475 / 530, latencyMin: 30, inBedMin: 530 }));
    const a = sleepPlan(input({ nights: quick }));
    const b = sleepPlan(input({ nights: slow }));
    expect(b.latencyMin).toBe(30);
    expect(a.plans[0].inBedMin).toBeCloseTo(480 / 0.95, 8);
    expect(b.plans[0].inBedMin).toBeCloseTo(30 + 480 / 0.95, 8);
    expect(a.plans[0].bedtimeMin - b.plans[0].bedtimeMin).toBeCloseTo(30, 8);
  });

  it("falls back to all nights, then to no plan", () => {
    const weekdaysOnly = nights.filter((n) => !isWeekendDay(n.day));
    expect(sleepPlan(input({ nights: weekdaysOnly, wakeDay: "2026-10-03" })).wakeMin).toBe(420);
    const none = sleepPlan(input({ nights: [] }));
    expect(none).toMatchObject({ wakeMin: null, plans: [], efficiency: sleepPlannerConfig.defaultEfficiency });
    expect(none.needMin).toBeCloseTo(480, 10);
  });
});
