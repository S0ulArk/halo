// The resting-HR chain for days without Fitbit's daily value or a sleep-session estimate (mobile addition).
import { describe, expect, it } from "vitest";
import { carriedRestingHr, estimateRestingHr, resolveRestingHr } from "./restingHr";

const START = 1_790_000_000 - (1_790_000_000 % 60);

describe("carriedRestingHr", () => {
  const known = new Map([
    ["2026-09-01", 70],
    ["2026-09-20", 78],
  ]);
  it("takes the newest known value of the 30 days before, never the day's own", () => {
    expect(carriedRestingHr("2026-09-21", known)).toBe(78);
    expect(carriedRestingHr("2026-09-20", known)).toBe(70); // its own value is not "carried"
    expect(carriedRestingHr("2026-10-20", known)).toBe(78); // 30 days on
    expect(carriedRestingHr("2026-10-21", known)).toBeNull(); // 31 days on
    expect(carriedRestingHr("2026-09-01", known)).toBeNull();
  });
});

describe("estimateRestingHr", () => {
  /** A 1,440-minute day: `night` bpm for the first 7 h, `day` bpm after, with steps on every 10th awake minute. */
  const day = (night: number | null, awake: number) => {
    const hr: (number | null)[] = Array.from({ length: 1440 }, (_, m) => (m < 420 ? night : awake));
    const steps: number[] = Array.from({ length: 1440 }, (_, m) => (m >= 420 && m % 10 === 0 ? 40 : 0));
    return { hr, steps };
  };

  it("is the lowest 30-minute mean of still minutes, the night included", () => {
    const { hr, steps } = day(64, 88);
    expect(estimateRestingHr(hr, steps, START, [])).toBe(64);
  });

  it("leaves out minutes near steps and inside workouts", () => {
    // Awake only: every 10th minute has steps, so 5 of each 10 minutes are still (±2 minutes): 15 in a 30-minute window,
    // under the 20 needed. Nothing qualifies.
    const { hr, steps } = day(null, 88);
    expect(estimateRestingHr(hr, steps, START, [])).toBeNull();
    // Without the steps the awake hours qualify.
    expect(estimateRestingHr(hr, new Array(1440).fill(0), START, [])).toBe(88);
    // A quiet hour of 70 bpm inside a workout doesn't count.
    const quiet = hr.map((v, m) => (m >= 600 && m < 660 ? 70 : v));
    const noSteps = new Array(1440).fill(0);
    expect(estimateRestingHr(quiet, noSteps, START, [])).toBe(70);
    expect(estimateRestingHr(quiet, noSteps, START, [{ start: START + 600 * 60, end: START + 660 * 60 }])).toBe(88);
  });

  it("needs 20 resting minutes in a window and a plausible 30–120 bpm result", () => {
    const sparse: (number | null)[] = Array.from({ length: 1440 }, (_, m) => (m % 2 === 0 ? 60 : null)); // 15 per window
    expect(estimateRestingHr(sparse, [], START, [])).toBeNull();
    expect(estimateRestingHr(new Array(1440).fill(25), [], START, [])).toBeNull();
    expect(estimateRestingHr(new Array(1440).fill(125), [], START, [])).toBeNull();
    expect(estimateRestingHr([], [], START, [])).toBeNull();
  });
});

describe("resolveRestingHr", () => {
  const est = (v: number | null) => () => v;
  it("daily → session → carried → estimated → default", () => {
    expect(resolveRestingHr(70, 66, 75, est(80), 60)).toEqual({ restingHr: 70, source: "daily" });
    expect(resolveRestingHr(null, 66, 75, est(80), 60)).toEqual({ restingHr: 66, source: "session" });
    expect(resolveRestingHr(null, null, 75, est(80), 60)).toEqual({ restingHr: 75, source: "carried" });
    expect(resolveRestingHr(null, null, null, est(80), 60)).toEqual({ restingHr: 80, source: "estimated" });
    expect(resolveRestingHr(null, null, null, est(null), 60)).toEqual({ restingHr: 60, source: "default" });
  });
});
