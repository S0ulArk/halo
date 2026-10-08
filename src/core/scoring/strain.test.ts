import { describe, expect, it } from "vitest";
import {
  banister,
  banisterRate,
  banisterTRIMP,
  cardioTrimp,
  effectiveEffort,
  effortFromStrainScale,
  effortOfTrimp,
  estimateHRmax,
  exerciseHrForMax,
  fallbackSampleMin,
  maxRestingGapMin,
  maxSampleGapMin,
  maxStrain,
  minSpanSeconds,
  muscularRates,
  muscularTrimp,
  percentile,
  sampleDurationsMinutes,
  strain,
  strainFromTrimp,
  strainMap,
  strainScaleMax,
  toStrainScale,
  trimpForStrain,
  trimpOfEffort,
} from "./strain";
import type { HrSample } from "./types";

const EPS = 9; // toBeCloseTo digits ≈ 1e-9
const every = (bpm: number, n: number, stepS = 1, from = 0): HrSample[] => Array.from({ length: n }, (_, i) => ({ ts: from + i * stepS, bpm }));
const REST = 60;
const MAX = 190;
const RESERVE = MAX - REST;
/** `minutes` of readings every 5 s at `x` of the reserve. */
const session = (x: number, minutes: number, from = 0) => every(REST + x * RESERVE, (minutes * 60) / 5, 5, from);
/** Activity Strain on 0–21 (no floor). */
const strain21 = (hr: HrSample[], extraTrimp = 0) => toStrainScale(strain(hr, MAX, REST, { extraTrimp })!);

describe("the 0–21 axis and Effort", () => {
  it("is a pure rescale of Effort 0–100", () => {
    expect([maxStrain, strainScaleMax]).toEqual([100, 21]);
    const cases: [number, number][] = [
      [0, 0], [1, 4.761904761904762], [3.5, 16.666666666666668], [7, 33.333333333333336], [10.5, 50],
      [12.5, 59.523809523809526], [14, 66.66666666666667], [17.5, 83.33333333333333], [20, 95.23809523809524], [21, 100],
    ];
    for (const [s, effort] of cases) expect(effortFromStrainScale(s)).toBe(effort);
    expect(toStrainScale(100)).toBe(21);
    expect(toStrainScale(50)).toBe(10.5);
    expect(toStrainScale(0)).toBe(0);
  });
});

describe("Banister TRIMP (Banister 1991; Morton 1990)", () => {
  it("weights a minute at x of the reserve x · k · e^(b·x): men 0.64, 1.92; women 0.86, 1.67", () => {
    expect(banister).toEqual({ male: { k: 0.64, b: 1.92 }, female: { k: 0.86, b: 1.67 } });
    expect(banisterRate(0.75)).toBeCloseTo(0.75 * 0.64 * Math.exp(1.44), EPS);
    expect(banisterRate(0.75, "female")).toBeCloseTo(0.75 * 0.86 * Math.exp(0.75 * 1.67), EPS);
    for (const s of ["f", "F", "Female"]) expect(banisterRate(0.5, s)).toBe(banisterRate(0.5, "female"));
    expect(banisterRate(0)).toBe(0);
  });

  it("is continuous: a walk at 30 % of the reserve earns load (Edwards' zones gave nothing under 50 %)", () => {
    const walk = session(0.3, 60);
    expect(cardioTrimp(walk, MAX, REST)!).toBeCloseTo(60 * banisterRate(0.3), 6);
    expect(strain21(walk)).toBeGreaterThan(4);
  });
});

describe("the log map, 5.05 · ln(1 + 0.09 · TRIMP) capped at 21", () => {
  it("has the calibrated constants", () => {
    expect(strainMap).toEqual({ scale: 5.05, rate: 0.09 });
  });

  it("is 0 for no load, monotonic, and capped at exactly 21", () => {
    expect(strainFromTrimp(0)).toBe(0);
    expect(strainFromTrimp(-3)).toBe(0);
    let prev = 0;
    for (let t = 1; t <= 2000; t += 7) {
      const s = strainFromTrimp(t);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(strainFromTrimp(1e6)).toBe(21);
    expect(strainFromTrimp(trimpForStrain(21))).toBeCloseTo(21, EPS);
  });

  it("runs backwards exactly: Strain → TRIMP → Strain, and Effort → TRIMP → Effort", () => {
    for (const s of [0.5, 4, 10.1, 14, 18.7, 20.9]) expect(strainFromTrimp(trimpForStrain(s))).toBeCloseTo(s, EPS);
    for (const e of [1.23, 33.33, 50, 87.65, 100]) expect(effortOfTrimp(trimpOfEffort(e))).toBe(e);
    expect(trimpOfEffort(null)).toBe(0);
    expect(trimpOfEffort(0)).toBe(0);
  });
});

describe("WHOOP's published anchors (The Locker, 2026-02-10), on Halo's fit", () => {
  // The report's golden values (docs/research/whoop-garmin.md C2), ±0.3.
  it.each([
    ["1 h walk at 30 % of the reserve", 0.3, 60, 5.3],
    ["1 h run at 75 %", 0.75, 60, 12.5],
    ["90 minutes at 55 %", 0.55, 90, 11.2],
    ["a marathon, 230 minutes at 80 %", 0.8, 230, 19.8],
  ])("%s scores %f", (_, x, minutes, golden) => {
    expect(Math.abs(strain21(session(x, minutes)) - golden)).toBeLessThanOrEqual(0.3);
  });

  it("lands within 1.3 of each member average WHOOP publishes (the fit's RMSE is 0.69)", () => {
    const whoop: [number, number, number][] = [
      [0.3, 60, 6.5], // 1 h walk
      [0.75, 60, 12.0], // 1 h run
      [0.6, 60, 10.1], // 1 h functional fitness
      [0.55, 90, 10.5], // 90-minute hike, average person 10–11
      [0.8, 230, 20.4], // marathon
    ];
    const sq: number[] = [];
    for (const [x, minutes, w] of whoop) {
      const s = strain21(session(x, minutes));
      expect(Math.abs(s - w), `${x} × ${minutes} min`).toBeLessThan(1.3);
      sq.push((s - w) ** 2);
    }
    expect(Math.sqrt(sq.reduce((a, b) => a + b, 0) / sq.length)).toBeLessThan(0.8);
  });

  it("activities don't add up: a second marathon takes the day to the cap, never past it", () => {
    const one = session(0.8, 230);
    const two = [...one, ...session(0.8, 230, 230 * 60)];
    expect(strain21(two)).toBe(21);
    expect(strain21(two)).toBeGreaterThan(strain21(one));
  });
});

describe("Day Strain's waking floor", () => {
  const floor = (x: number, exempt?: (ts: number) => boolean) => ({ floor: { x, exempt } });

  it("a 16 h day at the floor's own heart rate scores 0", () => {
    const day = session(0.14, 16 * 60);
    expect(strain(day, MAX, REST, floor(0.14))).toBe(0);
    expect(strain(day, MAX, REST)).toBeGreaterThan(0); // without the floor it would count
  });

  it("subtracts the floor's rate from each reading, never below 0, and spares workout readings", () => {
    const day = [...session(0.1, 60), ...session(0.75, 60, 3600)];
    const inRun = (ts: number) => ts >= 3600;
    const durations = sampleDurationsMinutes(day, REST, RESERVE);
    const spared = banisterTRIMP(day, REST, RESERVE, durations, "male", { x: 0.14, exempt: inRun });
    expect(spared).toBeCloseTo(cardioTrimp(session(0.75, 60, 3600), MAX, REST)!, 6);
    // Day Strain is never under its biggest activity's Strain.
    expect(strain(day, MAX, REST, floor(0.14, inRun))!).toBeGreaterThanOrEqual(strain(session(0.75, 60, 3600), MAX, REST)!);
    const floored = banisterTRIMP(day, REST, RESERVE, durations, "male", { x: 0.14 });
    expect(floored).toBeCloseTo(60 * (banisterRate(0.75) - banisterRate(0.14)), 4);
  });

  it("sparse 5-minute readings at rest score the same Day Strain as 1-minute ones, ±0.3", () => {
    const quiet = (stepS: number) =>
      Array.from({ length: (16 * 3600) / stepS }, (_, i) => ({ ts: i * stepS, bpm: REST + RESERVE * (0.12 + 0.06 * Math.sin(i * stepS / 3600)) }));
    const a = toStrainScale(strain(quiet(60), MAX, REST, floor(0.14))!);
    const b = toStrainScale(strain(quiet(300), MAX, REST, floor(0.14))!);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(0.3);
  });
});

describe("sample durations", () => {
  const hard = Math.trunc(REST + 0.85 * RESERVE);
  const at = (...ts: number[]): HrSample[] => ts.map((t) => ({ ts: t, bpm: hard }));

  it("a dropout gap is clamped to 2 minutes; a 30 s cadence is not", () => {
    expect(sampleDurationsMinutes(at(0, 3 * 3600))).toEqual([maxSampleGapMin, maxSampleGapMin]);
    expect(sampleDurationsMinutes(every(hard, 3, 30))).toEqual([0.5, 0.5, 0.5]);
    expect(sampleDurationsMinutes([{ ts: 0, bpm: 150 }, { ts: 30, bpm: 150 }, { ts: 630, bpm: 150 }, { ts: 660, bpm: 150 }])).toEqual([0.5, 2, 0.5, 0.5]);
  });

  it("between two quiet readings (both under half the reserve) a gap counts up to 10 minutes", () => {
    const quiet = REST + 0.2 * RESERVE;
    const xs = [{ ts: 0, bpm: quiet }, { ts: 300, bpm: quiet }, { ts: 1500, bpm: quiet }, { ts: 1800, bpm: hard }, { ts: 2100, bpm: hard }];
    expect(sampleDurationsMinutes(xs, REST, RESERVE)).toEqual([5, maxRestingGapMin, maxSampleGapMin, maxSampleGapMin, maxSampleGapMin]);
    // Without the reserve, the plain 2-minute rule.
    expect(sampleDurationsMinutes(xs)).toEqual([2, 2, 2, 2, 2]);
  });

  it("edges match the old fallbacks", () => {
    expect(sampleDurationsMinutes([])).toEqual([]);
    expect(sampleDurationsMinutes(at(5))).toEqual([fallbackSampleMin]);
    expect(sampleDurationsMinutes(at(7, 7))).toEqual([fallbackSampleMin, fallbackSampleMin]);
  });

  it("adding context around a window never shrinks its TRIMP", () => {
    const workout = Array.from({ length: 120 }, (_, i) => ({ ts: 1000 + i * 30, bpm: hard }));
    const day = [...every(55, 60), ...workout];
    expect(cardioTrimp(day, MAX, REST)!).toBeGreaterThanOrEqual(cardioTrimp(workout, MAX, REST)! - 1e-9);
  });
});

describe("gates", () => {
  it("null with too few samples or an invalid reserve", () => {
    expect(strain(every(135, 599), 160, 60)).toBeNull();
    expect(strain(every(135, 600), 60, 60)).toBeNull();
  });

  it("under 20 readings is null even over a long span; 20 under 600 s is null; 20 over 600 s scores", () => {
    expect(strain(every(150, 19, 60), 190, 60)).toBeNull();
    expect(strain(every(150, 20, 30), 190, 60)).toBeNull(); // spans 570 s
    expect(strain(every(150, 20, 32), 190, 60)).not.toBeNull(); // spans 608 s
    const sparse = every(155, 30, 30);
    expect(sparse.at(-1)!.ts - sparse[0].ts).toBeGreaterThanOrEqual(minSpanSeconds);
    expect(strain(sparse, 160, 60)).not.toBeNull();
  });

  it("resting heart rate scores 0", () => {
    expect(strain(every(60, 1200), 184, 60)).toBe(0);
  });
});

describe("muscular load (WHOOP 2026: from activity type and duration)", () => {
  it("maps Health Connect's strength-type sessions to a TRIMP a minute, and every other type to 0", () => {
    expect(muscularRates).toEqual({
      STRENGTH_TRAINING: 0.6,
      WEIGHTLIFTING: 0.6,
      CALISTHENICS: 0.6,
      HIGH_INTENSITY_INTERVAL_TRAINING: 0.6,
      BOOT_CAMP: 0.6,
      ROCK_CLIMBING: 0.35,
      ROWING: 0.35,
      ROWING_MACHINE: 0.35,
      PADDLING: 0.35,
      PILATES: 0.25,
      YOGA: 0.25,
    });
    expect(muscularTrimp("STRENGTH_TRAINING", 60)).toBe(36);
    expect(muscularTrimp("YOGA", 60)).toBe(15);
    for (const t of ["RUNNING", "BIKING", "WALKING", "EXERCISE_CLASS", "SWIMMING_POOL"]) expect(muscularTrimp(t, 60)).toBe(0);
    expect(muscularTrimp("WEIGHTLIFTING", -5)).toBe(0);
  });

  it("a 60-minute lift at 45 % of the reserve: 7.8 on heart rate alone, 10.5 with its muscular load (WHOOP's 1 h functional fitness: 10.1)", () => {
    const lift = session(0.45, 60);
    expect(strain21(lift)).toBeCloseTo(7.8, 1);
    expect(strain21(lift, muscularTrimp("STRENGTH_TRAINING", 60))).toBeCloseTo(10.5, 1);
    expect(strain21(lift, muscularTrimp("STRENGTH_TRAINING", 60))).toBeGreaterThan(strain21(lift));
    expect(strain21(lift, muscularTrimp("RUNNING", 60))).toBe(strain21(lift));
  });
});

describe("max HR", () => {
  it("is the 99.5th percentile of workout heart rate once there are 600 readings, never under Tanaka", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    const hist = Array.from({ length: 600 }, (_, i) => 100 + (i % 50)); // observed tops out under Tanaka
    expect(estimateHRmax(hist, 30)).toEqual({ hrmax: 187, source: "tanaka" });
    expect(estimateHRmax(hist, null).source).toBe("observed");
    expect(estimateHRmax([150], 40)).toEqual({ hrmax: 180, source: "tanaka" });
    expect(estimateHRmax([150], null)).toEqual({ hrmax: 0, source: "unknown" });
  });

  it("a 40-year-old (Tanaka 180) whose workouts reach a 99.5th percentile of 196 gets 196", () => {
    // 1,000 readings: 994 climbing from 150 to 195, then six at 196 (the top 0.6 %).
    const hr = [...Array.from({ length: 994 }, (_, i) => 150 + Math.floor((i * 46) / 994)), ...Array(6).fill(196)];
    expect(estimateHRmax(hr, 40)).toEqual({ hrmax: 196, source: "observed" });
  });

  it("drops artefacts before the percentile: out of range, or a jump over 45 bpm within 12 s", () => {
    const xs: HrSample[] = [
      { ts: 0, bpm: 140 },
      { ts: 5, bpm: 220 }, // +80 in 5 s: an artefact
      { ts: 10, bpm: 145 },
      { ts: 30, bpm: 196 }, // +51 but 20 s later: real
      { ts: 31, bpm: 250 }, // out of range
      { ts: 35, bpm: 20 },
    ];
    expect(exerciseHrForMax(xs)).toEqual([140, 145, 196]);
  });
});

describe("EffectiveEffortTest", () => {
  it("resolves live against stored with a never-drop max", () => {
    expect(effectiveEffort(2.3, 0.5)).toBe(2.3);
    expect(effectiveEffort(0.0, 38.3)).toBe(38.3);
    expect(effectiveEffort(null, 12.5)).toBe(12.5);
    expect(effectiveEffort(4.0, null)).toBe(4.0);
    expect(effectiveEffort(null, null)).toBeNull();
    expect(effectiveEffort(0, 0)).toBe(0);
    expect(effectiveEffort(null, 0)).toBe(0);
    expect(effectiveEffort(7.25, 7.25)).toBe(7.25);
  });

  it("two present zeros canonicalize to +0; a single source passes through", () => {
    for (const [l, s] of [[0, 0], [0, -0], [-0, 0], [-0, -0]]) expect(Object.is(effectiveEffort(l, s), 0)).toBe(true);
    for (const v of [0, -0, 7.25, -7.25, Infinity, -Infinity]) {
      expect(Object.is(effectiveEffort(v, null), v)).toBe(true);
      expect(Object.is(effectiveEffort(null, v), v)).toBe(true);
    }
    expect(Number.isNaN(effectiveEffort(NaN, null))).toBe(true);
  });

  it("non-zero and NaN pairs keep max semantics", () => {
    expect(effectiveEffort(Infinity, 12)).toBe(Infinity);
    expect(effectiveEffort(12, Infinity)).toBe(Infinity);
    expect(effectiveEffort(-Infinity, -Infinity)).toBe(-Infinity);
    expect(Number.isNaN(effectiveEffort(NaN, 1))).toBe(true);
    expect(Number.isNaN(effectiveEffort(1, NaN))).toBe(true);
  });
});
