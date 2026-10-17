// The Heart Rate card's numbers: the range capsules' stretches and the reading's age.
import { describe, expect, it } from "vitest";
import { rangeSlots, readingAge } from "./heartRange";

describe("rangeSlots", () => {
  const end = 1_800_000_000;
  it("gathers 30 minutes into equal stretches, each its low and high, oldest first", () => {
    const samples = [
      { ts: end - 29 * 60, bpm: 60 },
      { ts: end - 28 * 60, bpm: 72 },
      { ts: end - 2 * 60, bpm: 90 },
      { ts: end, bpm: 84 },
    ];
    const r = rangeSlots(samples, end, 6, 30);
    expect(r).toHaveLength(6);
    expect(r[0]).toEqual({ min: 60, max: 72 });
    expect(r.slice(1, 5)).toEqual([null, null, null, null]);
    expect(r[5]).toEqual({ min: 84, max: 90 });
  });

  it("leaves out readings before the window, after the newest, and without a rate", () => {
    const samples = [
      { ts: end - 31 * 60, bpm: 50 },
      { ts: end - 10 * 60, bpm: 0 },
      { ts: end + 60, bpm: 120 },
    ];
    expect(rangeSlots(samples, end, 3, 30)).toEqual([null, null, null]);
  });

  it("returns nothing to draw for no stretches", () => {
    expect(rangeSlots([{ ts: end, bpm: 70 }], end, 0, 30)).toEqual([]);
  });
});

describe("readingAge", () => {
  it("says how long ago a reading under an hour old was taken", () => {
    const now = 1_800_000_000_000;
    expect(readingAge(now / 1000 - 120, now, "UTC")).toMatch(/^2\sminutes ago$/);
  });

  it("gives the clock time for an older reading the same day", () => {
    // 15:00 UTC, read at 18:00 UTC.
    const ts = Date.UTC(2026, 9, 17, 15, 0) / 1000;
    expect(readingAge(ts, Date.UTC(2026, 9, 17, 18, 0), "UTC")).toBe("Updated 15:00");
  });
});
