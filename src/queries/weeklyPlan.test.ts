// The Weekly Plan over the demo seed, scored by the pipeline: the stored days map into the plan's inputs (zone minutes
// from stage 1, strength sessions from the workouts, steps, consistency and sleep against need), and the week of
// Friday 2026-10-02 adds up from them.
import { beforeAll, describe, expect, it } from "vitest";
import { PLAN_DEFAULTS, withPlanEnabled } from "@/core/algorithms/weeklyPlan";
import { MemoryStore } from "@/data/memory";
import { seedDemo } from "@/data/seed";
import type { Profile } from "@/data/types";
import { addDays } from "@/lib/time";
import { runPipeline } from "@/pipeline";
import { exercisesBetween, loadDays } from "./common";
import type { QueryCtx } from "./ctx";
import { getWeeklyPlan, PLAN_KEYS, planDays, RESISTANCE_TYPES } from "./weeklyPlan";

const TZ = "Asia/Kolkata";
/** A Friday; its ISO week runs 2026-09-28 to 2026-10-04. */
const TODAY = "2026-10-02";
const MONDAY = "2026-09-28";
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
const DAYS = 35;
const PROFILE: Profile = { birthDate: "1990-01-01", sex: "male", maxHr: 183, heightCm: 178, timeZone: TZ };

let ctx: QueryCtx;
beforeAll(async () => {
  const store = new MemoryStore();
  await seedDemo(store, { today: TODAY, timeZone: TZ, now: NOW, days: DAYS });
  await runPipeline(store, PROFILE, { today: TODAY });
  ctx = { store, profile: PROFILE, timeZone: TZ, today: TODAY, now: NOW, sync: { lastSyncTs: NOW, firstDay: addDays(TODAY, 1 - DAYS), lastError: null } };
});

describe("RESISTANCE_TYPES", () => {
  it("counts strength, weights, HIIT and calisthenics, not cardio", () => {
    for (const t of ["STRENGTH_TRAINING", "WEIGHTLIFTING", "HIGH_INTENSITY_INTERVAL_TRAINING", "CALISTHENICS", "DEADLIFT"]) expect(RESISTANCE_TYPES.test(t), t).toBe(true);
    for (const t of ["RUNNING", "BIKING", "WALKING", "YOGA", "OTHER_WORKOUT"]) expect(RESISTANCE_TYPES.test(t), t).toBe(false);
  });
});

describe("planDays", () => {
  it("maps stage 1's zones, the workouts, steps and the sleep row into the plan's inputs", async () => {
    const rows = await loadDays(ctx, MONDAY, TODAY);
    const exs = await exercisesBetween(ctx, MONDAY, TODAY);
    const days = planDays(rows, exs);
    expect(days.map((d) => d.day)).toEqual([MONDAY, "2026-09-29", "2026-09-30", "2026-10-01", TODAY]);
    for (const d of days) {
      const r = rows.get(d.day)!;
      const z = r.s1!.zoneSeconds;
      expect(d.zone13Min).toBeCloseTo(((r.s1!.moderateSeconds ?? 0) + z[0] + z[1] + z[2]) / 60, 10);
      expect(d.zone45Min).toBeCloseTo((z[3] + z[4]) / 60, 10);
      expect(d.steps).toBe(r.metrics?.steps ?? null);
      expect(d.strengthSessions).toBe(exs.filter((e) => e.day === d.day && RESISTANCE_TYPES.test(e.type)).length);
      if (r.sleep?.main) expect(d.needMin).toBeCloseTo(r.sleep.needMin!, 10);
    }
    // The demo lifts most Mondays.
    const all = planDays(await loadDays(ctx, addDays(TODAY, 1 - DAYS), TODAY), await exercisesBetween(ctx, addDays(TODAY, 1 - DAYS), TODAY));
    expect(all.reduce((a, d) => a + d.strengthSessions, 0)).toBeGreaterThanOrEqual(2);
  });
});

describe("getWeeklyPlan", () => {
  it("scores this week against the defaults, with Pulse Age's years per habit", async () => {
    const vm = await getWeeklyPlan(TODAY, ctx, PLAN_DEFAULTS);
    expect(vm).toMatchObject({ monday: MONDAY, sunday: "2026-10-04", day: TODAY, today: TODAY, isCurrentWeek: true, elapsed: 4 });
    expect(vm.items.map((i) => i.key)).toEqual(PLAN_KEYS);
    const days = planDays(await loadDays(ctx, MONDAY, TODAY), await exercisesBetween(ctx, MONDAY, TODAY));
    const by = Object.fromEntries(vm.items.map((i) => [i.key, i]));
    expect(by.zone13.value).toBeCloseTo(days.reduce((a, d) => a + (d.zone13Min ?? 0), 0), 8);
    expect(by.strength.value).toBe(days.reduce((a, d) => a + d.strengthSessions, 0));
    expect(by.consistency.value).toBe(days.findLast((d) => d.consistency !== null)?.consistency ?? null);
    expect(by.zone13).toMatchObject({ label: "Moderate activity", unit: "min", target: 150 });
    for (const i of vm.items) {
      expect(i.progress).toBeGreaterThanOrEqual(0);
      expect(i.progress).toBeLessThanOrEqual(1);
      expect(i.days).toHaveLength(7);
      expect(i.weeks).toHaveLength(8);
      expect(i.ageYears === null || Number.isFinite(i.ageYears)).toBe(true);
    }
    // Five weeks of history: a streak can't be longer than the weeks with data.
    expect(vm.planStreak.longest).toBeLessThanOrEqual(6);
  });

  it("leaves switched-off targets out, and a past week is not the current one", async () => {
    const vm = await getWeeklyPlan("2026-09-20", ctx, withPlanEnabled(PLAN_DEFAULTS, "steps", false));
    expect(vm.items.map((i) => i.key)).not.toContain("steps");
    expect(vm).toMatchObject({ monday: "2026-09-14", isCurrentWeek: false, elapsed: 7 });
    expect(vm.items.every((i) => i.status === "done" || i.status === "missed" || i.status === "no_data")).toBe(true);
  });
});
