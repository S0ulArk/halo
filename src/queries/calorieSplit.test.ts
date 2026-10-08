import { describe, expect, it } from "vitest";
import { timeInZone, zones } from "@/core/scoring/zones";
import type { DayRow } from "./common";
import { calorieSplit, zoneBounds } from "./strain";

describe("zoneBounds", () => {
  it("shows each zone from the first whole bpm that counts in it", () => {
    // Resting 56, max 183: edges 106.8, 132.2, 144.9, 157.6, 170.3 (40/60/70/80/90 % of the reserve).
    const set = zones(56, 183);
    const rows = zoneBounds(set.zones.map((z) => z.lower));
    expect(rows.map((r) => [r.min, r.max])).toEqual([
      [107, 132],
      [133, 144],
      [145, 157],
      [158, 170],
      [171, null],
    ]);
    // Every whole bpm is counted in the zone whose displayed range holds it (one second at each).
    for (let bpm = 107; bpm <= 183; bpm++) {
      const t = timeInZone([{ ts: 0, bpm }], set);
      const counted = t.seconds.findIndex((s) => s > 0) + 1;
      const shown = rows.find((r) => bpm >= r.min && (r.max === null || bpm <= r.max))!.zone;
      expect(shown, `${bpm} bpm`).toBe(counted);
    }
  });
});

const row = (day: string, calories: number | null, active?: number) => ({ day, metrics: { calories }, extra: active === undefined ? {} : { active_calories: active } }) as unknown as DayRow;

describe("calorieSplit", () => {
  it("splits the day into resting, everyday movement and workouts", () => {
    const rows = new Map([["2026-10-06", row("2026-10-06", 3000, 1000)]]);
    const [p] = calorieSplit(rows, "2026-10-06", undefined, 1, new Map([["2026-10-06", 350]]));
    expect(p.parts).toEqual({ resting: 2000, everyday: 650, workouts: 350 });
  });

  it("caps workouts at active and active at the total, and never guesses a split without active calories", () => {
    const rows = new Map([
      ["2026-10-05", row("2026-10-05", 2500, 3000)],
      ["2026-10-06", row("2026-10-06", 2800)],
    ]);
    const [a, b] = calorieSplit(rows, "2026-10-06", undefined, 2, new Map([["2026-10-05", 4000]]));
    expect(a.parts).toEqual({ resting: 0, everyday: 0, workouts: 2500 });
    expect(b).toMatchObject({ value: 2800, parts: null });
  });
});
