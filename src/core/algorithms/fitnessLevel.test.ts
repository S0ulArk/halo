import { describe, expect, it } from "vitest";
import {
  FRIEND_TREADMILL,
  fitnessAge,
  fitnessCategory,
  fitnessEstimate,
  fitnessLevel,
  nesVo2max,
  physicalActivityIndex,
  uthVo2max,
  vo2maxPercentile,
} from "./fitnessLevel";

describe("vo2maxPercentile (FRIEND 2015 Table 2)", () => {
  it("returns the published percentile at sampled ages and sexes", () => {
    expect(vo2maxPercentile(48.0, 25, "male")).toBeCloseTo(50, 10);
    expect(vo2maxPercentile(49.2, 35, "male")).toBeCloseTo(75, 10);
    expect(vo2maxPercentile(31.9, 49, "male")).toBeCloseTo(25, 10);
    expect(vo2maxPercentile(16.3, 72, "male")).toBeCloseTo(5, 10);
    expect(vo2maxPercentile(51.3, 20, "female")).toBeCloseTo(90, 10);
    expect(vo2maxPercentile(23.4, 52, "female")).toBeCloseTo(50, 10);
    expect(vo2maxPercentile(23.8, 60, "female")).toBeCloseTo(75, 10);
  });

  it("interpolates linearly between published columns", () => {
    expect(vo2maxPercentile((48.0 + 55.2) / 2, 25, "male")).toBeCloseTo(62.5, 10);
    expect(vo2maxPercentile(30.2 + (36.1 - 30.2) * 0.2, 33, "female")).toBeCloseTo(55, 10);
  });

  it("clamps to [5, 95] and uses the edge decades outside 20–79", () => {
    expect(vo2maxPercentile(10, 30, "male")).toBeCloseTo(5, 10);
    expect(vo2maxPercentile(90, 30, "male")).toBeCloseTo(95, 10);
    expect(vo2maxPercentile(48.0, 18, "male")).toBeCloseTo(50, 10);
    expect(vo2maxPercentile(18.3, 85, "female")).toBeCloseTo(50, 10);
  });

  it("every published row increases", () => {
    for (const rows of Object.values(FRIEND_TREADMILL))
      for (const row of rows) for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThan(row[i - 1]);
  });
});

describe("fitnessCategory", () => {
  it("cuts at Garmin's 40 / 60 / 80 / 95 (Cooper Institute percentiles, Forerunner 970 manual 2026)", () => {
    expect(fitnessCategory(39.99)).toBe("poor");
    expect(fitnessCategory(40)).toBe("fair");
    expect(fitnessCategory(59.99)).toBe("fair");
    expect(fitnessCategory(60)).toBe("good");
    expect(fitnessCategory(79.99)).toBe("good");
    expect(fitnessCategory(80)).toBe("excellent");
    expect(fitnessCategory(94.99)).toBe("excellent");
    expect(fitnessCategory(95)).toBe("superior");
  });

  it("a 30-year-old man at 48 ml/kg/min, about the 71st FRIEND percentile, reads good (it read excellent at 60)", () => {
    const r = fitnessLevel(48, 30, "male");
    expect(Math.abs(r.percentile - 71)).toBeLessThan(2);
    expect(r.category).toBe("good");
  });

  it("fitnessLevel combines both", () => {
    expect(fitnessLevel(49.2, 35, "male").percentile).toBeCloseTo(75, 10);
    expect(fitnessLevel(49.2, 35, "male").category).toBe("good");
    expect(fitnessLevel(16.0, 45, "female")).toEqual({ percentile: 5, category: "poor" });
  });
});

// noop's FitnessAgeEngineTest.kt, same inputs and expected numbers (parity guard).
describe("Fitness Age and the Nes 2011 estimate (noop's FitnessAgeEngine)", () => {
  it("Nes 2011 waist variant", () => {
    expect(nesVo2max(40, "male", 90, 65, 5)).toBeCloseTo(46.275, 3);
    expect(nesVo2max(40, "female", 80, 65, 5)).toBeCloseTo(37.72, 3);
  });

  it("a reference peer (resting HR 65, activity index 5) is their own age; fitter is younger, less fit older", () => {
    expect(fitnessAge(40, "male", 65, 5)).toBeCloseTo(40, 9);
    expect(fitnessAge(55, "female", 65, 5)).toBeCloseTo(55, 9);
    expect(fitnessAge(40, "male", 50, 10)).toBeCloseTo(28.33, 1);
    expect(fitnessAge(40, "male", 80, 2)).toBeCloseTo(50.15, 1);
    expect(fitnessAge(75, "male", 120, 0)).toBe(80);
    expect(fitnessAge(25, "male", 35, 15)).toBe(20);
  });

  it("the HUNT activity index", () => {
    expect(physicalActivityIndex(0, 0, 0)).toBe(0);
    expect(physicalActivityIndex(7, 75, 0.8)).toBe(15);
    expect(physicalActivityIndex(3, 40, 0.3)).toBeCloseTo(3.75, 9);
  });

  it("Uth 2004: 15.3 × HRmax / resting HR", () => {
    expect(uthVo2max(189, 78)).toBeCloseTo(37.07, 2);
  });
});

describe("fitnessEstimate (7 days of resting HR and zone minutes)", () => {
  const week = (rhr: number, mod: number, vig = 0) => Array.from({ length: 7 }, () => ({ restingHr: rhr, zone13Min: mod, zone45Min: vig }));

  it("the 27-year-old man (resting HR 78, a short walk now and then, nothing vigorous) is plausibly older than 27", () => {
    const e = fitnessEstimate(week(78, 40 / 7), { age: 27, sex: "male", maxHr: 189 })!;
    expect(e).toMatchObject({ method: "uth", activityIndex: 0, restingHr: 78 });
    expect(e.fitnessAge).toBeGreaterThan(30);
    expect(e.fitnessAge).toBeLessThan(45);
    expect(e.vo2max).toBeGreaterThan(30);
    expect(e.vo2max).toBeLessThan(45);
    // A daily 30-minute walk: 5+ active days of 30–59 minutes, easy → index 3.75, a little younger.
    const walking = fitnessEstimate(week(78, 30), { age: 27, sex: "male", maxHr: 189 })!;
    expect(walking.activityIndex).toBeCloseTo(3.75, 9);
    expect(walking.fitnessAge).toBeGreaterThan(27);
    expect(walking.fitnessAge).toBeLessThan(e.fitnessAge);
  });

  it("uses Nes 2011 with a waist, else Uth", () => {
    const withWaist = fitnessEstimate(week(65, 40, 20), { age: 40, sex: "male", maxHr: 180, waistCm: 90 })!;
    expect(withWaist.method).toBe("nes");
    expect(withWaist.vo2max).toBeCloseTo(nesVo2max(40, "male", 90, 65, withWaist.activityIndex), 9);
    expect(fitnessEstimate(week(65, 40, 20), { age: 40, sex: "male", maxHr: 180 })!.vo2max).toBeCloseTo(uthVo2max(180, 65), 9);
  });

  it("needs 4 of the 7 days with a resting HR and with a full day of heart rate; scales activity to a week", () => {
    const p = { age: 40, sex: "female" as const, maxHr: 180 };
    expect(fitnessEstimate(week(65, 30).map((d, i) => (i < 4 ? { ...d, restingHr: null } : d)), p)).toBeNull();
    expect(fitnessEstimate(week(65, 30).map((d, i) => (i < 4 ? { ...d, zone13Min: null, zone45Min: null } : d)), p)).toBeNull();
    // 4 covered days, 2 of them active: 2 × 7/4 = 3.5 → 4 a week.
    const half = week(65, 0).map((d, i) => (i < 3 ? { ...d, zone13Min: null, zone45Min: null } : i < 5 ? { ...d, zone13Min: 45 } : d));
    expect(fitnessEstimate(half, p)!.activityIndex).toBeCloseTo(physicalActivityIndex(4, 45, 0), 9);
  });
});
