// The Halo Age screen's pure sums: the age scale's span around two ages, and the week-on-week change's reading from
// the weekly history.
import { describe, expect, it } from "vitest";
import { ageSpan, weekBefore } from "./format";

describe("ageSpan", () => {
  it("spans whole fives with a few years of air around both ages", () => {
    expect(ageSpan(36.8, 34.0)).toEqual([30, 45]);
    expect(ageSpan(34.0, 36.8)).toEqual([30, 45]);
  });

  it("is at least ten years wide", () => {
    expect(ageSpan(30, 30)).toEqual([25, 35]);
    const [lo, hi] = ageSpan(41, 41.2);
    expect(hi - lo).toBeGreaterThanOrEqual(10);
  });

  it("keeps both ages well inside it", () => {
    for (const [a, b] of [
      [22, 29.5],
      [61.3, 55],
      [45, 45.1],
    ]) {
      const [lo, hi] = ageSpan(a, b);
      expect(Math.min(a, b) - lo).toBeGreaterThanOrEqual(4);
      expect(hi - Math.max(a, b)).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("weekBefore", () => {
  const history = [
    { day: "2026-09-27", value: 35.4 },
    { day: "2026-10-04", value: 35.1 },
    { day: "2026-10-11", value: 34.9 },
  ];

  it("reads the week before the shown one", () => {
    expect(weekBefore(history, "2026-10-11")).toBe(35.1);
  });

  it("skips a week without a value but never reaches back past 7 days", () => {
    const gap = [...history.slice(0, 2), { day: "2026-10-11", value: null }];
    expect(weekBefore(gap, "2026-10-18")).toBeNull();
    expect(weekBefore(gap, "2026-10-11")).toBe(35.1);
  });

  it("is null without an earlier reading", () => {
    expect(weekBefore([], "2026-10-11")).toBeNull();
    expect(weekBefore(history.slice(0, 1), "2026-09-27")).toBeNull();
  });
});
