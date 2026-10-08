import { describe, expect, it } from "vitest";
import { banisterRate } from "../scoring/strain";
import { energyBand, energyBank, energyBankConfig, minuteTrimp, nightQuality, type EnergyBankInput } from "./energyBank";

const start = 1_790_000_000 - (1_790_000_000 % 86_400);
const N = 1440;
const ts = (h: number, min = 0) => start + (h * 60 + min) * 60;
const fill = <T>(v: T, f: (m: number) => T | undefined = () => undefined): T[] => Array.from({ length: N }, (_, m) => f(m) ?? v);
const inHours = (a: number, b: number) => (m: number) => m >= a * 60 && m < b * 60;
const c = energyBankConfig;
/** Awake all day, unscored stress (only sleep pressure), no load. */
const day = (over: Partial<EnergyBankInput> = {}): EnergyBankInput => ({
  start,
  from: start,
  until: start + 86_400,
  startLevel: 60,
  needHours: 8,
  asleep: fill(0),
  load: fill<number | null>(null),
  stress: fill<number | null>(null),
  ...over,
});
/** A typical night's stage weights in order: 55 % light, 15 % deep, 22 % REM, 8 % awake, at quality q. */
const night = (minutes: number, q = 1) => {
  const w: number[] = [];
  for (let m = 0; m < minutes; m++) {
    const f = (m % 100) / 100;
    w.push(q * (f < 0.55 ? c.stageWeight.light : f < 0.7 ? c.stageWeight.deep : f < 0.92 ? c.stageWeight.rem : c.stageWeight.awake));
  }
  return w;
};

describe("Energy Bank (a Body Battery-style 24-hour reserve)", () => {
  it("an 8 h night of typical sleep at baseline HRV, from 30, ends at about 95", () => {
    const asleep = fill(0, (m) => (m < 480 ? night(480)[m] : undefined));
    const r = energyBank(day({ startLevel: 30, until: ts(8), asleep }));
    expect(r.current).toBeGreaterThan(93);
    expect(r.current).toBeLessThan(97);
    // The night's awake minutes (8 %) count as awake: they don't charge, and sleep pressure applies.
    expect(r.charged + r.drained).toBeCloseTo(r.current - 30, 8);
  });

  it("charges more after a high-HRV night and less after a low one", () => {
    expect(nightQuality(60, 50)).toBeCloseTo(1.08, 10);
    expect(nightQuality(25, 50)).toBeCloseTo(0.8, 10);
    expect(nightQuality(200, 50)).toBe(1.3);
    expect(nightQuality(5, 50)).toBeCloseTo(0.64, 10);
    expect(nightQuality(null, 50)).toBe(1);
    const run = (q: number) => energyBank(day({ startLevel: 20, until: ts(8), asleep: fill(0, (m) => (m < 480 ? night(480, q)[m] : undefined)) })).current;
    expect(run(1.2)).toBeGreaterThan(run(1));
    expect(run(0.8)).toBeLessThan(run(1));
  });

  it("a 1 h hard run (about 120 TRIMP) drains 15–25", () => {
    const load = fill<number | null>(null, (m) => (inHours(18, 19)(m) ? 2 : undefined));
    const rest = energyBank(day({ from: ts(18), until: ts(19) }));
    const run = energyBank(day({ from: ts(18), until: ts(19), load, workouts: [{ start: ts(18), end: ts(19), label: "Tempo run" }] }));
    expect(rest.current - run.current).toBeCloseTo(120 * c.drainPerTrimp, 8);
    expect(60 - run.current).toBeGreaterThanOrEqual(15);
    expect(60 - run.current).toBeLessThanOrEqual(25);
    expect(run.topDrains[0]).toMatchObject({ label: "Tempo run", kind: "workout", start: ts(18), end: ts(19) });
  });

  it("a day without heart rate is flat apart from sleep pressure", () => {
    const r = energyBank(day({ from: ts(7), until: ts(23), startLevel: 80 }));
    expect(r.current).toBeCloseTo(80 - 16 * c.pressurePerHour, 8);
    expect(r.topDrains).toEqual([]);
    for (let m = 7 * 60 + 1; m < 23 * 60; m++) expect(r.curve[m]!).toBeLessThan(r.curve[m - 1]!);
  });

  it("stress above Garmin's rest level drains; calm still minutes charge; a value holds across short gaps", () => {
    // To noon, so the level stays clear of the floor.
    const morning = (over: Partial<EnergyBankInput> = {}) => day({ until: ts(12), ...over });
    const base = energyBank(morning()).current;
    const stressed = energyBank(morning({ stress: fill<number | null>(null, (m) => (inHours(10, 11)(m) ? 2.4 : undefined)) }));
    // s = 80 on Garmin's scale: (80 − 25) / 75 × 9 an hour, for the hour and the 10 minutes it holds after.
    expect(base - stressed.current).toBeCloseTo(((80 - 25) / 75) * 9 * (70 / 60), 6);
    expect(stressed.topDrains[0]).toMatchObject({ label: "Stress", kind: "stress" });
    const calm = energyBank(morning({ stress: fill<number | null>(null, (m) => (inHours(10, 11)(m) ? 0.3 : undefined)) })).current;
    expect(calm).toBeGreaterThan(base);
    // One reading every 5 minutes holds for the minutes between (and 10 after the last, at 10:55): 66 minutes in all.
    const sparse = energyBank(morning({ stress: fill<number | null>(null, (m) => (inHours(10, 11)(m) && m % 5 === 0 ? 2.4 : undefined)) })).current;
    expect(base - sparse).toBeCloseTo(((80 - 25) / 75) * 9 * (66 / 60), 6);
  });

  it("never leaves 5–100", () => {
    const drained = energyBank(day({ load: fill<number | null>(5), stress: fill<number | null>(3) }));
    expect(drained.current).toBe(5);
    expect(Math.min(...drained.curve.filter((v): v is number => v != null))).toBe(5);
    const full = energyBank(day({ startLevel: 99, asleep: fill(1.3) }));
    expect(full.current).toBe(100);
    expect(energyBank(day({ startLevel: 0, until: start + 60 })).curve[0]).toBe(5);
  });

  it("bands at Garmin's 25 / 50 / 75", () => {
    expect([5, 25, 26, 50, 51, 75, 76, 100].map(energyBand)).toEqual(["very_low", "very_low", "low", "low", "medium", "medium", "high", "high"]);
  });

  it("drains by each minute's TRIMP, less the waking floor outside a workout", () => {
    const xs = minuteTrimp([60, 120, 160, null], 60, 190, "male", 0.14, (m) => m === 2);
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBeCloseTo(banisterRate(60 / 130) - banisterRate(0.14), 12);
    expect(xs[2]).toBeCloseTo(banisterRate(100 / 130), 12);
    expect(xs[3]).toBeNull();
  });
});
