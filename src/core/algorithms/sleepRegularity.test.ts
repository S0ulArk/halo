import { describe, expect, it } from "vitest";
import { laggedPairs, poolPairs, sleepRegularityIndex, sriConsistency, sriDisplay, sriOf, sriPairs, whoopConsistency } from "./sleepRegularity";

const H = 3600;
const DAY = 24 * H;
const ws = 1_790_000_000 - (1_790_000_000 % DAY); // a UTC midnight
/** A session on day i from hour a to hour b (b may pass 24). */
const at = (i: number, a: number, b: number) => ({ start: ws + i * DAY + a * H, end: ws + i * DAY + b * H });

describe("sleepRegularityIndex", () => {
  it("an identical schedule every day gives 100", () => {
    // 23:00–07:00, including the night that runs into the first day.
    const sessions = Array.from({ length: 8 }, (_, i) => at(i - 1, 23, 31));
    expect(sleepRegularityIndex(sessions, ws)).toBe(100);
  });

  it("schedules 12 h apart on alternate days give SRI ≤ 0, shown as 0", () => {
    const sessions = Array.from({ length: 7 }, (_, i) => (i % 2 === 0 ? at(i, 0, 8) : at(i, 12, 20)));
    const sri = sleepRegularityIndex(sessions, ws)!;
    // Both awake 08–12 and 20–24 only: P = 8/24.
    expect(sri).toBeCloseTo(-100 / 3, 10);
    expect(sriDisplay(sri)).toBe(0);
    expect(sriConsistency(sri)).toBe(0);
  });

  it("pairs touching a day without data are excluded", () => {
    const sessions = [0, 1, 2, 4, 5, 6].map((i) => at(i, 0, 8));
    const covered = [true, true, true, false, true, true, true];
    expect(sleepRegularityIndex(sessions, ws, covered)).toBe(100);
    // Treated as worn, the missing night counts as awake: 2 of 6 pairs differ for 8 h.
    expect(sleepRegularityIndex(sessions, ws)).toBeCloseTo(-100 + 200 * (1 - 960 / (6 * 1440)), 10);
  });

  it("no pair of consecutive covered days gives null", () => {
    expect(sleepRegularityIndex([at(0, 0, 8)], ws, [true, false, true])).toBeNull();
    expect(sleepRegularityIndex([], ws, [true])).toBeNull();
  });

  it("a nap counts as sleep", () => {
    const nights = Array.from({ length: 7 }, (_, i) => at(i, 0, 8));
    const sri = sleepRegularityIndex([...nights, at(3, 14, 15)], ws)!;
    expect(sri).toBeCloseTo(-100 + 200 * (1 - 120 / (6 * 1440)), 10);
  });

  it("sessions outside the window are ignored", () => {
    const sessions = [...Array.from({ length: 7 }, (_, i) => at(i, 0, 8)), at(-3, 10, 12), at(9, 10, 12)];
    expect(sleepRegularityIndex(sessions, ws)).toBe(100);
  });
});

describe("display helpers", () => {
  it("clip at 0 and scale to [0, 1]", () => {
    expect(sriDisplay(-20)).toBe(0);
    expect(sriDisplay(85)).toBe(85);
    expect(sriConsistency(85)).toBe(0.85);
    expect(sriConsistency(null)).toBeNull();
  });
});

describe("sriPairs and pooling", () => {
  it("pooling every pair gives the window's SRI, and a pair touching an uncovered day is null", () => {
    const sessions = [at(0, 0, 8), at(1, 1, 8), at(2, 0, 8), at(4, 0, 8)];
    const covered = [true, true, true, false, true];
    const pairs = sriPairs(sessions, ws, covered);
    expect(pairs.map((p) => p && p.same)).toEqual([1440 - 60, 1440 - 60, null, null]);
    const all = poolPairs(pairs)!;
    expect(sriOf(all.same, all.pairs)).toBeCloseTo(sleepRegularityIndex(sessions, ws, covered)!, 10);
    expect(poolPairs([null, undefined])).toBeNull();
  });
});

describe("WHOOP-style Sleep Consistency: the last 24 hours against each of the 4 days before", () => {
  it("an identical schedule over 5 days gives 100", () => {
    const sessions = Array.from({ length: 6 }, (_, i) => at(i - 1, 23, 31));
    expect(whoopConsistency(laggedPairs(sessions, ws))).toBe(100);
  });

  it("compares the last day with each earlier one, not consecutive days", () => {
    const sessions = Array.from({ length: 5 }, (_, i) => at(i, 0, 8));
    const pairs = laggedPairs(sessions, ws);
    expect(pairs).toHaveLength(4);
    // Last night 3 h later than the four before: 6 of 24 hours differ in each pair.
    const shifted = [...sessions.slice(0, 4), at(4, 3, 11)];
    expect(whoopConsistency(laggedPairs(shifted, ws))).toBeCloseTo(-100 + 200 * (18 / 24), 10);
    expect(whoopConsistency(laggedPairs(shifted, ws))!).toBeLessThan(100);
  });

  it("one odd night four days ago costs a quarter as much as the same odd night last night", () => {
    const base = Array.from({ length: 5 }, (_, i) => at(i, 0, 8));
    const oldOdd = [at(0, 3, 11), ...base.slice(1)];
    const newOdd = [...base.slice(0, 4), at(4, 3, 11)];
    const lossOld = 100 - whoopConsistency(laggedPairs(oldOdd, ws))!;
    const lossNew = 100 - whoopConsistency(laggedPairs(newOdd, ws))!;
    expect(lossOld * 4).toBeCloseTo(lossNew, 8);
  });

  it("skips days without data, and is null when the last day has none; never below 0", () => {
    const sessions = Array.from({ length: 5 }, (_, i) => at(i, 0, 8));
    expect(whoopConsistency(laggedPairs(sessions, ws, [true, false, true, true, true]))).toBe(100);
    expect(whoopConsistency(laggedPairs(sessions, ws, [true, true, true, true, false]))).toBeNull();
    const flipped = [at(0, 12, 20), at(1, 12, 20), at(2, 12, 20), at(3, 12, 20), at(4, 0, 8)];
    expect(whoopConsistency(laggedPairs(flipped, ws))).toBe(0);
  });
});
