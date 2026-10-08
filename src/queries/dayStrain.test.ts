// The Strain day view's running Day Strain: on the stored Strain's own inputs and math, its last point is the day's
// Strain to the bit, it never falls, and each minute counts exactly the readings (and ended workouts' muscular load)
// before it.
import { describe, expect, it } from "vitest";
import { banisterRate, cardioTrimp, effortOfTrimp, muscularTrimp, strain, toStrainScale } from "@/core/scoring/strain";
import type { HrSample } from "@/core/scoring/types";
import { strainOfTrimp } from "@/live/liveStrain";
import { strainCurve, type StrainInputs, type StrainWorkout } from "./dayStrain";

const REST = 60;
const MAX = 190; // reserve 130
const FLOOR = 0.14; // the day's waking floor, a share of the reserve (about 78 bpm)
const START = 1_790_000_000; // a local midnight, unix seconds
const END = START + 86_400;
const at = (min: number) => START + min * 60;

/** Readings every `stepS` seconds from `fromMin` to `toMin` (minutes into the day) at `bpm(minute)`. */
function readings(fromMin: number, toMin: number, bpm: (m: number) => number, stepS = 15): HrSample[] {
  const out: HrSample[] = [];
  for (let t = START + fromMin * 60; t < START + toMin * 60; t += stepS) out.push({ ts: t, bpm: bpm((t - START) / 60) });
  return out;
}

/** A day: asleep and still overnight, a run at 07:00, a quiet afternoon, a gap while the band charged, a lift at 18:00. */
const DAY: HrSample[] = [
  ...readings(0, 420, () => 55),
  ...readings(420, 465, (m) => (m < 430 ? 130 : m < 455 ? 158 : 171)),
  ...readings(465, 720, (m) => 66 + (m % 4)),
  // 12:00–14:00: the band was off.
  ...readings(840, 1080, (m) => 64 + (m % 5)),
  ...readings(1080, 1140, (m) => (m < 1100 ? 115 : 125)),
  ...readings(1140, 1440, () => 64),
];
/** The run and the lift; the lift's 60 minutes carry its muscular load. */
const WORKOUTS: StrainWorkout[] = [
  { start: at(420), end: at(465), muscularTrimp: 0 },
  { start: at(1080), end: at(1140), muscularTrimp: muscularTrimp("STRENGTH_TRAINING", 60) },
];

/** The day's stored Effort, as stage 1 scores it: heart rate above the floor outside workouts, plus muscular load. */
function inputs(hr: HrSample[], workouts: StrainWorkout[] = WORKOUTS): StrainInputs {
  const exempt = (ts: number) => workouts.some((w) => ts >= w.start && ts <= w.end);
  const cardio = cardioTrimp(hr, MAX, REST, { floor: { x: FLOOR, exempt } });
  const muscular = workouts.reduce((a, w) => a + (w.muscularTrimp ?? 0), 0);
  return { effort: cardio == null ? null : effortOfTrimp(cardio + muscular), restingHr: REST, maxHr: MAX, lastHrTs: hr.at(-1)?.ts ?? null, floorHrr: FLOOR };
}
const curveOf = (hr: HrSample[], s1 = inputs(hr), end = END, toLast = false, workouts = WORKOUTS) => strainCurve(hr, s1, START, end, toLast, workouts);

describe("strainCurve", () => {
  it("ends exactly on the day's Strain", () => {
    const s1 = inputs(DAY);
    const curve = curveOf(DAY, s1);
    expect(s1.effort).not.toBeNull();
    expect(curve.ys.at(-1)).toBe(toStrainScale(s1.effort!));
    // A past day runs to midnight.
    expect(curve.xs.at(-1)).toBe(1440);
  });

  it("starts at the first reading from zero and never falls", () => {
    const curve = curveOf(DAY);
    expect(curve.xs[0]).toBe(0);
    expect(curve.ys[0]).toBe(0);
    for (let i = 1; i < curve.ys.length; i++) {
      expect(curve.xs[i]).toBe(curve.xs[i - 1] + 1);
      expect(curve.ys[i]).toBeGreaterThanOrEqual(curve.ys[i - 1]);
    }
    for (const y of curve.ys) expect(y).toBeLessThanOrEqual(21);
  });

  it("stays flat under the waking floor and builds in the workouts, the lift's muscular load once it ends", () => {
    const curve = curveOf(DAY);
    const y = (m: number) => curve.ys[curve.xs.indexOf(m)];
    // Asleep and the quiet afternoon sit under the floor (78 bpm); the band-off gap adds nothing.
    expect(y(420)).toBe(0);
    expect(y(466)).toBeGreaterThan(5);
    expect(y(840)).toBe(y(720));
    expect(y(1080)).toBe(y(840));
    // The lift's heart rate counts as it happens (no floor in a workout); its muscular load when it has ended.
    expect(y(1140)).toBeGreaterThan(y(1080));
    expect(y(1141)).toBeGreaterThan(y(1140));
    expect(y(1440)).toBe(y(1141));
  });

  it("counts at each minute exactly the readings before it, on the stored Strain's durations", () => {
    const curve = curveOf(DAY);
    const inWorkout = (ts: number) => WORKOUTS.some((w) => ts >= w.start && ts <= w.end);
    for (const m of [430, 445, 600, 1100, 1300]) {
      const before = DAY.filter((s) => s.ts < at(m));
      // Each reading credited for the gap to its own next one (2 minutes at most; 15 s here), above the floor outside
      // the workouts; the lift's muscular load once it has ended.
      let trimp = 0;
      before.forEach((s, i) => {
        const d = Math.min((DAY[i + 1].ts - s.ts) / 60, 2);
        const x = Math.max(0, (s.bpm - REST) / (MAX - REST));
        if (x > 0) trimp += d * Math.max(banisterRate(x) - (inWorkout(s.ts) ? 0 : banisterRate(FLOOR)), 0);
      });
      if (m > 1140) trimp += WORKOUTS[1].muscularTrimp!;
      expect(curve.ys[curve.xs.indexOf(m)]).toBeCloseTo(strainOfTrimp(trimp), 9);
    }
  });

  it("runs today to the minute after the last reading stage 1 scored", () => {
    const morning = DAY.filter((s) => s.ts < at(500));
    const s1 = inputs(morning, WORKOUTS.slice(0, 1));
    // Heart rate synced after the last scoring run waits for the next one.
    const synced = [...morning, ...readings(500, 520, () => 175)];
    const curve = curveOf(synced, s1, END, true, WORKOUTS.slice(0, 1));
    expect(curve.xs.at(-1)).toBe(500);
    expect(curve.ys.at(-1)).toBe(toStrainScale(s1.effort!));
  });

  it("has no curve for a day without a Strain", () => {
    const few = readings(600, 605, () => 150);
    expect(strain(few, MAX, REST)).toBeNull();
    expect(curveOf(few)).toEqual({ xs: [], ys: [] });
    expect(strainCurve(DAY, null, START, END)).toEqual({ xs: [], ys: [] });
    expect(strainCurve([], { effort: 10, restingHr: REST, maxHr: MAX, lastHrTs: null }, START, END)).toEqual({ xs: [], ys: [] });
    // A broken profile (max at or under resting) scores nothing, as strain() does.
    expect(strainCurve(DAY, { effort: 10, restingHr: 190, maxHr: 190, lastHrTs: null }, START, END)).toEqual({ xs: [], ys: [] });
  });

  it("runs a 25-hour day (the clocks went back) to its own end", () => {
    const long = [...DAY, ...readings(1440, 1500, () => 150)];
    const s1 = inputs(long);
    const curve = curveOf(long, s1, START + 25 * 3600);
    expect(curve.xs.at(-1)).toBe(1500);
    expect(curve.ys.at(-1)).toBe(toStrainScale(s1.effort!));
  });

  it("starts at the first reading of a day the band went on late", () => {
    const late = readings(540, 1440, (m) => (m < 600 ? 150 : 70));
    const s1 = inputs(late, []);
    const curve = curveOf(late, s1, END, false, []);
    expect(curve.xs[0]).toBe(540);
    expect(curve.ys[0]).toBe(0);
    expect(curve.ys.at(-1)).toBe(toStrainScale(s1.effort!));
  });
});
