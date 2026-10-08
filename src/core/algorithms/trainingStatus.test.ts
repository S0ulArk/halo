import { describe, expect, it } from "vitest";
import { trainingStatus, vo2Trend, type TrainingStatusInput } from "./trainingStatus";

const flatVo2 = (v = 45) => Array.from({ length: 10 }, (_, i) => ({ daysAgo: i * 3, value: v }));
const risingVo2 = () => Array.from({ length: 10 }, (_, i) => ({ daysAgo: i * 3, value: 45 - 0.1 * i * 3 })); // +3 a month
const fallingVo2 = () => Array.from({ length: 10 }, (_, i) => ({ daysAgo: i * 3, value: 45 + 0.1 * i * 3 }));
const balanced = { status: "balanced" as const, direction: null };
const base: TrainingStatusInput = {
  vo2: flatVo2(),
  loadRatio: 1.1,
  acute: 400,
  acuteWeekAgo: 380,
  acuteHistory: Array(84).fill(380),
  hrv: [balanced, balanced, balanced],
  hasRecentVo2: true,
};
const status = (over: Partial<TrainingStatusInput>) => trainingStatus({ ...base, ...over })?.status;

describe("VO2max trend", () => {
  it("is the recency-weighted slope per 30 days", () => {
    expect(vo2Trend(flatVo2())).toBeCloseTo(0, 10);
    expect(vo2Trend(risingVo2())).toBeCloseTo(3, 8);
    expect(vo2Trend([{ daysAgo: 0, value: 45 }])).toBeNull();
  });
});

describe("Training Status rules (Garmin-style), one scenario each", () => {
  it("Detraining: acute load under 20 % of the 12-week median for 7 days", () => {
    expect(status({ acute: 50, loadRatio: 0.3, acuteHistory: [...Array(77).fill(380), ...Array(7).fill(50)] })).toBe("detraining");
  });
  it("Strained: HRV Low, or Unbalanced below for 3 days, with load at 0.8 or more", () => {
    expect(status({ hrv: [balanced, balanced, { status: "low", direction: null }] })).toBe("strained");
    const below = { status: "unbalanced" as const, direction: "low" as const };
    expect(status({ hrv: [below, below, below] })).toBe("strained");
    expect(status({ hrv: [balanced, below, below] })).toBe("maintaining"); // two days below is not yet Strained
  });
  it("Overreaching: a ratio of 1.5 or more with VO2max falling", () => {
    expect(status({ loadRatio: 1.7, vo2: fallingVo2() })).toBe("overreaching");
  });
  it("Recovery: a low ratio and the load falling", () => {
    expect(status({ loadRatio: 0.7, acute: 300, acuteWeekAgo: 400 })).toBe("recovery");
  });
  it("Peaking: VO2max rising while the load falls", () => {
    expect(status({ vo2: risingVo2(), acute: 300, acuteWeekAgo: 400, loadRatio: 0.9 })).toBe("peaking");
  });
  it("Productive: a productive load with VO2max rising, or HRV Balanced at a ratio of 1.0 or more", () => {
    expect(status({ vo2: risingVo2() })).toBe("productive");
    expect(status({ loadRatio: 1.05 })).toBe("productive");
  });
  it("Unproductive: a productive load but VO2max falling", () => {
    expect(status({ vo2: fallingVo2(), hrv: [{ status: "unbalanced", direction: "high" }] })).toBe("unproductive");
  });
  it("Maintaining: otherwise", () => {
    expect(status({ loadRatio: 0.9, hrv: [{ status: "unbalanced", direction: "high" }] })).toBe("maintaining");
  });
  it("No status without a load ratio, or without a recent VO2max and an HRV Status", () => {
    expect(trainingStatus({ ...base, loadRatio: null })).toBeNull();
    expect(trainingStatus({ ...base, hasRecentVo2: false, hrv: [{ status: null, direction: null }] })).toBeNull();
    expect(trainingStatus({ ...base, hasRecentVo2: false })).not.toBeNull();
  });
});
