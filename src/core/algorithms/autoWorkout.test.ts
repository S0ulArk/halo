import { describe, expect, it } from "vitest";
import type { HrSample } from "@/core/scoring/types";
import { detectWorkouts, labelBySteps } from "./autoWorkout";

const T0 = 1_780_000_000 - (1_780_000_000 % 60);
const min = (m: number) => T0 + m * 60;

/** One sample every `every` seconds over [from, to) minutes, at `bpm(minute)`. */
function hr(from: number, to: number, bpm: (m: number) => number, every = 5): HrSample[] {
  const out: HrSample[] = [];
  for (let t = min(from); t < min(to); t += every) out.push({ ts: t, bpm: bpm((t - T0) / 60) });
  return out;
}
const steps = (from: number, to: number, perMin: number) => Array.from({ length: to - from }, (_, i) => ({ ts: min(from + i), steps: perMin }));

describe("detectWorkouts", () => {
  it("finds 20 minutes at resting + 30 or more, with its average, peak and whole minutes", () => {
    const xs = hr(0, 60, (m) => (m >= 10 && m < 30 ? (m < 20 ? 110 : 130) : 65));
    const [w, ...rest] = detectWorkouts(xs, { restingHr: 60 });
    expect(rest).toEqual([]);
    expect(w).toMatchObject({ start: min(10), end: min(30) - 5, maxHr: 130, minutes: 19, kind: "cardio", steps: null });
    expect(w.avgHr).toBe(120);
  });

  it("ignores spans under 10 minutes (WHOOP's minimum since 2026) and HR under the gate", () => {
    expect(detectWorkouts(hr(0, 60, (m) => (m >= 10 && m < 19 ? 120 : 65)), { restingHr: 60 })).toEqual([]);
    expect(detectWorkouts(hr(0, 60, (m) => (m >= 10 && m < 21 ? 120 : 65)), { restingHr: 60 })).toHaveLength(1);
    expect(detectWorkouts(hr(0, 60, (m) => (m >= 10 && m < 40 ? 89 : 65)), { restingHr: 60 })).toEqual([]);
    // No resting HR: 60 bpm is assumed, so 90 is elevated.
    expect(detectWorkouts(hr(0, 60, (m) => (m >= 10 && m < 40 ? 90 : 65)), { restingHr: null })).toHaveLength(1);
  });

  it("bridges a dip of 90 s but not a longer one", () => {
    const dip = (secs: number) => hr(0, 60, (m) => (m >= 10 && m < 30 && !(m >= 20 && m < 20 + secs / 60) ? 120 : 65), 5);
    expect(detectWorkouts(dip(90), { restingHr: 60 })).toMatchObject([{ start: min(10) }]);
    // A 3-minute dip splits it into two short halves (10 min and 7 min): nothing.
    expect(detectWorkouts(dip(180), { restingHr: 60 })).toEqual([]);
  });

  it("merges two sustained spans less than 5 minutes apart", () => {
    const xs = hr(0, 80, (m) => ((m >= 10 && m < 25) || (m >= 28 && m < 45) ? 120 : 65));
    expect(detectWorkouts(xs, { restingHr: 60 })).toMatchObject([{ start: min(10), end: min(45) - 5 }]);
    const apart = hr(0, 80, (m) => ((m >= 10 && m < 25) || (m >= 31 && m < 45) ? 120 : 65));
    expect(detectWorkouts(apart, { restingHr: 60 })).toHaveLength(2);
  });

  it("closes a span at a gap in the samples longer than 2 minutes (mobile)", () => {
    // Elevated before and after a 10-minute hole: two 8-minute spans, not one of 26.
    const xs = [...hr(0, 8, () => 120), ...hr(18, 26, () => 120)];
    expect(detectWorkouts(xs, { restingHr: 60 })).toEqual([]);
    // Sparse but regular samples (one a minute) still count.
    expect(detectWorkouts(hr(0, 20, () => 120, 60), { restingHr: 60 })).toHaveLength(1);
  });

  it("drops a window overlapping a recorded workout or sleep", () => {
    const xs = hr(0, 120, (m) => ((m >= 10 && m < 30) || (m >= 60 && m < 90) ? 120 : 65));
    expect(detectWorkouts(xs, { restingHr: 60, excluded: [{ start: min(70), end: min(100) }] })).toMatchObject([{ start: min(10) }]);
    expect(detectWorkouts(xs, { restingHr: 60, excluded: [{ start: min(0), end: min(10) }] })).toMatchObject([{ start: min(60) }]);
  });

  it("labels from the steps in the window", () => {
    const xs = hr(0, 60, (m) => (m >= 10 && m < 40 ? 120 : 65));
    expect(detectWorkouts(xs, { restingHr: 60, steps: steps(10, 40, 110) })).toMatchObject([{ kind: "walk", steps: 3300 }]);
    expect(detectWorkouts(xs, { restingHr: 60, steps: steps(10, 40, 165) })).toMatchObject([{ kind: "run" }]);
    expect(detectWorkouts(xs, { restingHr: 60, steps: steps(10, 40, 12) })).toMatchObject([{ kind: "cardio", steps: 360 }]);
  });

  it("with a max HR, keeps other cardio (no walking steps) only at Zone 1 or above, a walk at any elevated HR (mobile)", () => {
    // Resting 60, max 180: Zone 1 starts at 120 bpm. 110 bpm sitting still is a raised pulse, not a workout.
    const at = (bpm: number) => hr(0, 60, (m) => (m >= 10 && m < 40 ? bpm : 65));
    expect(detectWorkouts(at(110), { restingHr: 60, maxHr: 180 })).toEqual([]);
    expect(detectWorkouts(at(121), { restingHr: 60, maxHr: 180 })).toMatchObject([{ kind: "cardio", avgHr: 121 }]);
    expect(detectWorkouts(at(110), { restingHr: 60, maxHr: 180, steps: steps(10, 40, 105) })).toMatchObject([{ kind: "walk" }]);
  });
});

describe("labelBySteps", () => {
  it("needs half the minutes on foot, and a runner's median cadence for a run", () => {
    // 30 minutes: 14 walking minutes is under half, 15 is half.
    expect(labelBySteps(steps(0, 14, 100), min(0), min(30)).kind).toBe("cardio");
    expect(labelBySteps(steps(0, 15, 100), min(0), min(30)).kind).toBe("walk");
    expect(labelBySteps([...steps(0, 10, 100), ...steps(10, 30, 150)], min(0), min(30)).kind).toBe("run");
    expect(labelBySteps([...steps(0, 20, 100), ...steps(20, 30, 150)], min(0), min(30)).kind).toBe("walk");
  });

  it("counts the minutes overlapping the window, and none is no step data", () => {
    expect(labelBySteps(steps(0, 60, 100), min(10) + 30, min(20))).toEqual({ kind: "walk", steps: 1100 });
    expect(labelBySteps([], min(0), min(30))).toEqual({ kind: "cardio", steps: null });
  });
});
