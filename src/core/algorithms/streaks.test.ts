// Fixtures mirror noop's StreakCalculator tests: runs anchored at today or yesterday, gaps, duplicates, bad keys.
import { describe, expect, it } from "vitest";
import { streaks, weekStreaks } from "./streaks";

const run = (days: string[], today: string, met = days.map(() => true)) => streaks(days, met, today);

describe("streaks", () => {
  it("is (0, 0) with nothing qualifying", () => {
    expect(run([], "2026-10-07")).toEqual({ current: 0, longest: 0 });
    expect(streaks(["2026-10-06", "2026-10-07"], [false, false], "2026-10-07")).toEqual({ current: 0, longest: 0 });
  });

  it("counts the run ending today", () => {
    expect(run(["2026-10-05", "2026-10-06", "2026-10-07"], "2026-10-07")).toEqual({ current: 3, longest: 3 });
  });

  it("keeps yesterday's run while today hasn't qualified yet", () => {
    expect(run(["2026-10-05", "2026-10-06"], "2026-10-07")).toEqual({ current: 2, longest: 2 });
  });

  it("a missed day ends the current run; the longest is anywhere", () => {
    const days = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-04", "2026-10-05"];
    expect(run(days, "2026-10-07")).toEqual({ current: 0, longest: 4 });
    expect(run(days, "2026-10-06")).toEqual({ current: 2, longest: 4 });
  });

  it("crosses month and year ends", () => {
    expect(run(["2025-12-30", "2025-12-31", "2026-01-01"], "2026-01-01")).toEqual({ current: 3, longest: 3 });
    expect(run(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01")).toEqual({ current: 3, longest: 3 });
  });

  it("ignores duplicates, bad keys and the longer list's excess", () => {
    expect(streaks(["2026-10-06", "2026-10-06", "nope", "2026-10-07", "2026-10-05"], [true, true, true, true], "2026-10-07")).toEqual({ current: 2, longest: 2 });
  });
});

describe("weekStreaks", () => {
  // Mondays 2026-09-07 … 2026-10-05; today is Wednesday 2026-10-07 in the week of 2026-10-05.
  const mondays = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"];

  it("counts weeks in a row, this week once met", () => {
    expect(weekStreaks(mondays, [true, true, true, true, true], "2026-10-07")).toEqual({ current: 5, longest: 5 });
  });

  it("this week still open: the run ends with last week", () => {
    expect(weekStreaks(mondays, [false, true, true, true, false], "2026-10-07")).toEqual({ current: 3, longest: 3 });
  });

  it("a missed week breaks it", () => {
    expect(weekStreaks(mondays, [true, true, false, true, false], "2026-10-07")).toEqual({ current: 1, longest: 2 });
    expect(weekStreaks(mondays, [true, true, true, false, false], "2026-10-07")).toEqual({ current: 0, longest: 3 });
  });

  it("any day of a week keys it, across the year end", () => {
    // Sun 2025-12-28 (week of Dec 22), Thu 2026-01-01 (week of Dec 29), Mon 2026-01-05.
    expect(weekStreaks(["2025-12-28", "2026-01-01", "2026-01-05"], [true, true, true], "2026-01-09")).toEqual({ current: 3, longest: 3 });
  });
});
