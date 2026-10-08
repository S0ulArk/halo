import { describe, expect, it } from "vitest";
import { loadFactor, readinessBand, recoveryTimeFactor, trainingReadiness, trainingReadinessConfig, type TrainingReadinessInput } from "./trainingReadiness";

const ideal: TrainingReadinessInput = {
  sleep: 100,
  recoveryHours: 0,
  hrvStatus: { status: "balanced", direction: null },
  loadRatio: 1.0,
  sleepHistory: [100, 100, 100],
  stressHistory: [0.3, 0.4, 0.5],
  hoursAwake: 16,
};

describe("Training Readiness (Garmin-style, 1–100)", () => {
  it("all factors ideal gives 95 or more (Prime)", () => {
    const r = trainingReadiness(ideal)!;
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.band).toBe("prime");
    expect(r.limiting).toBeNull();
  });

  it("one factor at 20 caps the score at 50", () => {
    const r = trainingReadiness({ ...ideal, sleep: 20 })!;
    expect(r.score).toBe(50);
    expect(r.limiting).toBe("sleep");
  });

  it("is monotonic in each factor", () => {
    const at = (over: Partial<TrainingReadinessInput>) => trainingReadiness({ ...ideal, sleep: 80, ...over })!.score;
    const nonIncreasing = (xs: number[]) => xs.every((x, i) => i === 0 || x <= xs[i - 1]);
    const nonDecreasing = (xs: number[]) => xs.every((x, i) => i === 0 || x >= xs[i - 1]);
    expect(nonDecreasing([40, 60, 80, 100].map((sleep) => at({ sleep })))).toBe(true);
    expect(nonIncreasing([0, 12, 24, 48, 72].map((recoveryHours) => at({ recoveryHours })))).toBe(true);
    expect(nonIncreasing([1.0, 1.5, 1.7, 2.0, 2.5].map((loadRatio) => at({ loadRatio })))).toBe(true);
    expect(nonIncreasing([0.5, 1, 2, 3].map((s) => at({ stressHistory: [s, s, s] })))).toBe(true);
    expect(nonDecreasing([50, 70, 90].map((s) => at({ sleepHistory: [s, s, s] })))).toBe(true);
    const hrv = (["low", "unbalanced", "balanced"] as const).map((status) => at({ hrvStatus: { status, direction: status === "unbalanced" ? "low" : null } }));
    expect(nonDecreasing(hrv)).toBe(true);
  });

  it("factors: recovery time over 72 h, load ratio on Garmin's bands", () => {
    expect(recoveryTimeFactor(0)).toBe(100);
    expect(recoveryTimeFactor(36)).toBeCloseTo(100 * 0.5 ** 1.3, 10);
    expect(recoveryTimeFactor(96)).toBe(0);
    expect(loadFactor(0.7)).toBe(90);
    expect(loadFactor(1.5)).toBe(100);
    expect(loadFactor(1.75)).toBeCloseTo(65, 10);
    expect(loadFactor(2.4)).toBe(30);
  });

  it("a very long day awake takes 10 off; missing factors share their weight", () => {
    expect(trainingReadiness({ ...ideal, sleep: 80, hoursAwake: 20 })!.score).toBe(trainingReadiness({ ...ideal, sleep: 80 })!.score - trainingReadinessConfig.longDayPenalty);
    const partial = trainingReadiness({ ...ideal, hrvStatus: null, loadRatio: null })!;
    expect(partial.factors.hrv).toBeNull();
    expect(partial.score).toBeGreaterThanOrEqual(95);
    expect(trainingReadiness({ ...ideal, sleep: null, recoveryHours: null })).toBeNull();
  });

  it("bands at Garmin's 95 / 75 / 50 / 25", () => {
    expect([100, 95, 94, 75, 74, 50, 49, 25, 24, 1].map(readinessBand)).toEqual(["prime", "prime", "high", "high", "moderate", "moderate", "low", "low", "poor", "poor"]);
  });
});
