import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/time";
import { activityCost, activityCostConfig, daysToBaseline } from "./activityCost";

const D0 = "2026-01-01";
const day = (i: number) => addDays(D0, i);

/** `n` days of Recovery at `base`, then `edit` applied. */
function series(n: number, base: number, edit: (i: number) => number | undefined = () => undefined) {
  const m = new Map<string, number>();
  for (let i = 0; i < n; i++) m.set(day(i), edit(i) ?? base);
  return m;
}

describe("activityCost", () => {
  it("measures next-morning Recovery against untouched days and counts the mornings back", () => {
    // Runs every 10 days from day 30; the morning after sits at 52, the one after that 60, then back to 70.
    const runs = [30, 40, 50, 60, 70].map(day);
    const rec = series(100, 70, (i) => (i >= 30 && i <= 71 ? (i % 10 === 1 ? 52 : i % 10 === 2 ? 60 : undefined) : undefined));
    const r = activityCost(new Map([["run", new Set(runs)]]), rec);
    expect(r.baselineKind).toBe("rest");
    expect(r.baseline).toBe(70);
    expect(r.items).toEqual([{ kind: "run", sessions: 5, reason: null, change: -18, nextMorning: 52, daysToBaseline: 3, confidence: "building" }]);
  });

  it("leaves the after-effect window out of the rest-day baseline", () => {
    // Untouched days at 70; the 7 mornings after each walk at 60. Counting them as rest would pull the baseline down.
    const walks = [0, 20, 40, 60].map(day);
    const rec = series(90, 70, (i) => (i % 20 >= 1 && i % 20 <= 7 && i <= 67 ? 60 : undefined));
    const r = activityCost(new Map([["walk", new Set(walks)]]), rec);
    expect(r.baseline).toBe(70);
    expect(r.items[0]).toMatchObject({ change: -10, daysToBaseline: null });
  });

  it("falls back to every day's average with too few untouched days", () => {
    // A workout every other day: no day is outside a week-long after-effect window.
    const days = Array.from({ length: 20 }, (_, i) => day(i * 2));
    const rec = series(40, 60, (i) => (i % 2 ? 50 : 70));
    const r = activityCost(new Map([["workout", new Set(days)]]), rec);
    expect(r.baselineKind).toBe("all");
    expect(r.baselineDays).toBe(40);
    expect(r.baseline).toBe(60);
    expect(r.items[0]).toMatchObject({ kind: "workout", change: -10, nextMorning: 50, confidence: "solid", sessions: 20 });
  });

  it("says not enough data under the minimum, counting only workout days with a Recovery the next morning", () => {
    const rec = series(60, 65);
    rec.delete(day(31)); // no Recovery the morning after one ride
    const r = activityCost(new Map([["ride", new Set([day(30), day(40), day(50), day(59)])]]), rec); // day 60 has none either
    expect(r.items).toEqual([{ kind: "ride", sessions: 2, reason: "not_enough_data" }]);
    expect(activityCostConfig.minSessions).toBe(4);
  });

  it("ranks by |change|, solid ahead of building on a tie, then kind; short kinds last by sessions", () => {
    const rec = new Map<string, number>();
    for (let i = 0; i < 400; i++) rec.set(day(i), 70);
    const kinds = new Map<string, Set<string>>();
    // Each kind's workout days every 30 days in its own stretch, with its own next-morning Recovery.
    const add = (kind: string, from: number, n: number, next: number) => {
      const s = new Set<string>();
      for (let j = 0; j < n; j++) {
        s.add(day(from + j * 9));
        rec.set(day(from + j * 9 + 1), next);
      }
      kinds.set(kind, s);
    };
    add("b", 0, 4, 64); // −6, building
    add("a", 40, 8, 64); // −6, solid
    add("c", 120, 4, 75); // +5
    add("d", 160, 2, 40); // short
    add("e", 190, 3, 40); // short
    // Untouched days between the stretches keep the baseline at 70.
    const r = activityCost(kinds, rec);
    expect(r.baseline).toBe(70);
    expect(r.items.map((i) => i.kind)).toEqual(["a", "b", "c", "e", "d"]);
  });

  it("returns no baseline and only short kinds without any Recovery", () => {
    const r = activityCost(new Map([["run", new Set([day(0)])]]), new Map());
    expect(r).toEqual({ baseline: null, baselineKind: "all", baselineDays: 0, items: [{ kind: "run", sessions: 0, reason: "not_enough_data" }] });
  });
});

describe("daysToBaseline", () => {
  it("is the first morning the averaged Recovery is within 3 points, skipping mornings with no value", () => {
    const rec = new Map([
      [day(1), 50],
      [day(3), 66],
      [day(11), 40],
      [day(13), 68],
    ]);
    // k=1: (50+40)/2 = 45; k=2: no value; k=3: (66+68)/2 = 67 ≥ 70 − 3.
    expect(daysToBaseline(new Set([day(0), day(10)]), rec, 70)).toBe(3);
    expect(daysToBaseline(new Set([day(0), day(10)]), rec, 71)).toBeNull();
  });
});
