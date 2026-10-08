import { describe, expect, it } from "vitest";
import {
  activityClass,
  addRecovery,
  aerobicTE,
  countdownRate,
  epocDecay,
  intensityOf,
  maxHrSplit,
  peakEpoc,
  primaryBenefit,
  sessionRecoveryHours,
  steadyEpoc,
  teLabel,
  teLines,
} from "./trainingEffect";

describe("EPOC from heart rate (fitted to Firstbeat's EPOC white paper, Figure 5)", () => {
  // Figure 5's EPOC (ml/kg) at a steady share of VO2max, ±5.
  it.each([
    [0.8, 30, 155],
    [0.7, 60, 137],
    [0.6, 10, 20],
    [0.9, 10, 88],
    [0.8, 10, 55],
    [0.7, 10, 33],
    [0.7, 30, 85],
    [0.6, 60, 60],
    [0.5, 30, 21],
  ])("%f of VO2max for %i minutes ≈ %i", (i, minutes, figure) => {
    expect(Math.abs(steadyEpoc(i, minutes) - figure)).toBeLessThanOrEqual(5);
  });

  it("decays with k(I) linear between knots, flat outside them", () => {
    expect(epocDecay(0.65)).toBeCloseTo((0.035 + 0.018) / 2, 12);
    expect(epocDecay(0.1)).toBe(0.14);
    expect(epocDecay(1.1)).toBe(0);
  });

  it("reads intensity from heart-rate reserve: %VO2R ≈ %HRR", () => {
    expect(intensityOf(0, 35)).toBeCloseTo(0.1, 12);
    expect(intensityOf(1, 35)).toBeCloseTo(1, 12);
    expect(intensityOf(0.5, 50)).toBeCloseTo(0.5 * (1 - 0.07) + 0.07, 12);
  });

  it("peaks during a session and falls after it", () => {
    const rest = 60;
    const max = 190;
    const vo2 = 50;
    // %HRR giving 80 % of VO2max at VO2max 50: (0.8 − 0.07) / 0.93.
    const x = (0.8 - 0.07) / 0.93;
    const run = Array.from({ length: 30 * 12 }, (_, j) => ({ ts: j * 5, bpm: rest + x * (max - rest) }));
    const after = Array.from({ length: 10 * 12 }, (_, j) => ({ ts: 1800 + j * 5, bpm: rest + 10 }));
    const peak = peakEpoc([...run, ...after], rest, max, vo2);
    expect(Math.abs(peak - 155)).toBeLessThanOrEqual(5);
    // Gaps count at most 10 s: a dropout is not effort.
    const gappy = [run[0], { ts: 3600, bpm: run[0].bpm }];
    expect(peakEpoc(gappy, rest, max, vo2)).toBeLessThan(2);
  });
});

describe("Aerobic Training Effect", () => {
  it("TE 3.0 at EPOC 60.6 and TE 4.7 at EPOC 190 for activity class 7", () => {
    expect(teLines(7)[2]).toBeCloseTo(60.6, 10);
    expect(aerobicTE(60.6, 7)).toBe(3);
    expect(aerobicTE(190, 7)).toBe(4.7);
  });

  it("is linear between the lines, below TE 1 in proportion, capped at 5", () => {
    const [l1, l2, l3] = teLines(5);
    expect(aerobicTE(l1 / 2, 5)).toBe(0.5);
    expect(aerobicTE((l2 + l3) / 2, 5)).toBe(2.5);
    expect(aerobicTE(1e4, 5)).toBe(5);
    expect(aerobicTE(0, 5)).toBe(0);
    // A fitter, busier athlete gets less from the same session.
    expect(aerobicTE(100, 9)).toBeLessThan(aerobicTE(100, 5));
  });

  it("labels on Garmin's bands", () => {
    expect([0.5, 1, 2.4, 3, 4.2, 5].map(teLabel)).toEqual(["no_benefit", "minor", "maintaining", "improving", "highly_improving", "overreaching"]);
  });

  it("activity class: the higher of Jackson's VO2max inversion (0–7) and weekly training hours", () => {
    // A 35-year-old man, BMI 24, VO2max 45: (45 − 56.363 + 13.335 + 18.096 − 10.987) / 1.921 = 4.73.
    expect(activityClass(45, 35, 24, true, 0)).toBeCloseTo(9.081 / 1.921, 10);
    // Jackson's PA-R hours under 5 a week: over 3 h → 7, 1–3 h → 6, 30–60 min → 5.
    expect(activityClass(30, 35, 24, true, 4)).toBe(7);
    expect(activityClass(30, 35, 24, true, 2)).toBe(6);
    expect(activityClass(30, 35, 24, true, 0.75)).toBe(5);
    expect(activityClass(45, 35, 24, true, 3)).toBe(6);
    expect(activityClass(70, 35, 24, true, 3)).toBe(7);
    expect(activityClass(45, 35, 24, true, 8)).toBe(8);
    expect(activityClass(45, 35, 24, true, 16)).toBe(10);
  });

  it("names the primary benefit from TE and the time by % of max HR", () => {
    expect(primaryBenefit(1.5, { below80: 3000, from80: 0, above90: 0 })).toBe("recovery");
    expect(primaryBenefit(2.8, { below80: 3000, from80: 300, above90: 0 })).toBe("base");
    expect(primaryBenefit(3.2, { below80: 2000, from80: 1000, above90: 0 })).toBe("tempo");
    expect(primaryBenefit(3.8, { below80: 1000, from80: 2000, above90: 300 })).toBe("threshold");
    expect(primaryBenefit(4.3, { below80: 1000, from80: 2000, above90: 900 })).toBe("vo2max");
    expect(maxHrSplit([{ ts: 0, bpm: 150 }, { ts: 5, bpm: 175 }, { ts: 10, bpm: 140 }, { ts: 15, bpm: 140 }], 190)).toEqual({ below80: 10, from80: 5, above90: 5 });
  });
});

describe("Recovery Time", () => {
  it("TE 3.5 adds about 24 h, TE 5 adds 72, TE 1 or under nothing", () => {
    expect(sessionRecoveryHours(3.5)).toBeCloseTo(24.2, 1);
    expect(sessionRecoveryHours(5)).toBeCloseTo(72, 10);
    expect(sessionRecoveryHours(1)).toBe(0);
  });

  it("two sessions combine as max + 0.25 × min, up to 96, ×1.15 on a high load ratio", () => {
    expect(addRecovery(20, 24, 1)).toBeCloseTo(24 + 5, 10);
    expect(addRecovery(30, 10, null)).toBeCloseTo(32.5, 10);
    expect(addRecovery(80, 72, 1)).toBe(96);
    expect(addRecovery(20, 24, 1.6)).toBeCloseTo((24 + 5) * 1.15, 10);
    expect(addRecovery(12, 0, 2)).toBe(12);
  });

  it("a good night speeds the countdown; stress or a poor night slows it", () => {
    expect(countdownRate({ asleep: true, nightPerformance: 90, stress: null })).toBe(1.4);
    expect(countdownRate({ asleep: true, nightPerformance: 75, stress: null })).toBe(1);
    expect(countdownRate({ asleep: true, nightPerformance: 60, stress: null })).toBe(0.7);
    expect(countdownRate({ asleep: false, nightPerformance: 90, stress: 2.3 })).toBe(0.7);
    expect(countdownRate({ asleep: false, nightPerformance: 65, stress: 0.5 })).toBe(0.7);
    expect(countdownRate({ asleep: false, nightPerformance: 90, stress: 0.5 })).toBe(1);
  });
});
