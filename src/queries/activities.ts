// Activities `/activities`. Ported from Pulse's src/server/queries/activities.ts.
import { addDays } from "@/lib/time";
import { detectedItem, getActivityCost } from "./activityCost";
import { activityItem, loadDays, type QueryCtx, todayOf, toStrain } from "./common";
import type { ActivitiesVM } from "./types";

/** Days per page of `/activities`; "Show older" adds another page. */
export const ACTIVITY_PAGE_DAYS = 30;

/**
 * Activities `/activities`: every workout in the last `days` days, newest first, grouped by local day. Only days with a
 * workout get a group, except today, which always leads so the page answers "anything yet today?". Mobile: a day's
 * detected activities (stretches of elevated HR with no workout recorded) ride along, and a day with only those gets a
 * group too; Activity Cost covers every kind over all history.
 */
export async function getActivities(days = ACTIVITY_PAGE_DAYS, ctx: QueryCtx): Promise<ActivitiesVM> {
  const today = todayOf(ctx);
  const from = addDays(today, -(days - 1));
  const [rows, all, cost] = await Promise.all([loadDays(ctx, from, today), ctx.store.allExercises(), getActivityCost(ctx)]);
  const exs = all.filter((e) => e.day >= from && e.day <= today).sort((a, b) => a.startTs - b.startTs || a.id.localeCompare(b.id));
  const byDay = new Map<string, typeof exs>([[today, []]]);
  for (const e of exs) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  for (const [day, row] of rows) if (row.detected.length && !byDay.has(day)) byDay.set(day, []);

  const groups = [...byDay.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((day) => {
      const row = rows.get(day);
      const items = byDay.get(day)!.map((e) => activityItem(e, row)).sort((a, b) => b.start - a.start);
      const minutes = items.reduce((m, a) => m + (a.end - a.start) / 60_000, 0);
      return {
        day,
        items,
        minutes,
        steps: row?.metrics?.steps ?? null,
        dayStrain: row?.s1?.effort != null ? toStrain(row.s1.effort) : null,
        detected: (row?.detected ?? []).map(detectedItem).sort((a, b) => b.start - a.start),
      };
    });
  const older = all.some((e) => e.day < from);
  return { today, days, groups, older, cost };
}
