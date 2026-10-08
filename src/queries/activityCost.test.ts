import { describe, expect, it } from "vitest";
import { bounceText, costCaption, costDigest, costSentence, costTone, costValue, detectedItem } from "./activityCost";
import type { ActivityCostEntry, ActivityCostVM } from "./types";

const run = (change: number, daysToBaseline: number | null, sessions = 12): ActivityCostEntry => ({
  kind: "run",
  name: "Running",
  sessions,
  reason: null,
  change,
  nextMorning: 64 + change,
  daysToBaseline,
  confidence: sessions >= 8 ? "solid" : "building",
});
const short: ActivityCostEntry = { kind: "strength", name: "Strength training", sessions: 2, reason: "not_enough_data" };
const vm: ActivityCostVM = { baseline: 64.2, baselineKind: "rest", minSessions: 4, items: [run(-8, 2), short] };

describe("Activity Cost wording", () => {
  it("shows the change as signed Recovery points and colours a dip, a lift or barely any", () => {
    expect(costValue(run(-8.4, 2))).toBe("−8%");
    expect(costValue(run(3, 1))).toBe("+3%");
    expect(costValue(short)).toBeNull();
    expect([run(-8, 2), run(3, 1), run(0.6, 1), short].map(costTone)).toEqual(["cost", "lift", "flat", "flat"]);
  });

  it("says how long the dip lasts, or what the change means when there is none", () => {
    expect(bounceText(run(-8, 2))).toBe("Back to baseline in about 2 days");
    expect(bounceText(run(-2, 1))).toBe("Back to baseline the next morning");
    expect(bounceText(run(-12, null))).toBe("Not back to baseline within a week");
    expect(bounceText(run(4, 1))).toBe("Higher Recovery the next morning");
    expect(bounceText(run(-0.5, 1))).toBe("Barely moves next-morning Recovery");
  });

  it("captions how many workouts it rests on, or how many more it needs", () => {
    expect(costCaption(run(-8, 2), 4)).toBe("Back to baseline in about 2 days · 12 runs");
    expect(costCaption(run(-8, 2, 5), 4)).toBe("Back to baseline in about 2 days · 5 runs, early estimate");
    expect(costCaption(short, 4)).toBe("Not enough data yet: 2 of 4 strength sessions");
  });

  it("writes one sentence against the baseline it used", () => {
    expect(costSentence(run(-8, 2), vm)).toBe("After running, your Recovery the next morning averages 8% below your rest days and takes about 2 days to come back.");
    expect(costSentence(run(-8, null), { ...vm, baselineKind: "all" })).toBe("After running, your Recovery the next morning averages 8% below your average and is still lower a week later.");
    expect(costSentence(run(3, 1), vm)).toBe("After running, your Recovery the next morning averages 3% above your rest days.");
    expect(costSentence(short, vm)).toBe("Halo needs 4 strength sessions with a Recovery the next morning to measure what they cost you; it has 2 so far.");
  });

  it("digests every kind for the coach, with reasons for the short ones", () => {
    expect(costDigest(vm)).toMatchObject({
      baseline: 64,
      kinds: [
        { activity: "Running", workoutsMeasured: 12, nextMorningChange: -8, daysToBaseline: 2, confidence: "solid", reason: null },
        { activity: "Strength training", workoutsMeasured: 2, needed: 4, reason: "not_enough_data" },
      ],
    });
  });
});

describe("detectedItem", () => {
  it("is the stored window in epoch ms with its label and Effort on the 0–21 scale", () => {
    const d = detectedItem({ start: 1000, end: 2800, avgHr: 118, maxHr: 131, minutes: 30, kind: "walk", steps: 3200, effort: null });
    expect(d).toEqual({ kind: "walk", label: "Walking", start: 1_000_000, end: 2_800_000, avgHr: 118, maxHr: 131, strain: null, steps: 3200 });
  });
});
