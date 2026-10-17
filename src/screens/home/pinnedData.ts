// What Today's Health cards draw beyond the day's numbers: the last seven days of each pinned metric (ending on the
// day shown, oldest first) for the small chart on the right, and the night's hours asleep for the hero's Sleep line.
// One light read of seven days (loadDays), each day's values through the Home query's own `keyStats`, so a chart's
// last bar is exactly the number beside it, in the person's units. Shared through the query cache for the scoring run.
import { addDays } from "@/lib/time";
import { keyStats, loadDays, todayOf, type DashboardKey, type QueryCtx } from "@/queries";
import { unitsOf } from "@/queries/units";

/** Days the small charts show. */
export const PINNED_DAYS = 7;

export type PinnedData = {
  day: string;
  /** Each pinned metric's values, oldest first, one per day ending on `day`. */
  series: Record<string, (number | null)[]>;
  /** The main sleep that ended on `day`, minutes asleep. */
  asleepMin: number | null;
};

/** The cache key: one entry per day and list of metrics. */
export const pinnedKey = (day: string, keys: readonly string[]) => `pinned:${day}:${keys.join(",")}`;

export async function pinnedData(ctx: QueryCtx, day: string, keys: DashboardKey[]): Promise<PinnedData> {
  const from = addDays(day, -(PINNED_DAYS - 1));
  const rows = await loadDays(ctx, from, day);
  const today = todayOf(ctx);
  const units = unitsOf(ctx);
  const series: Record<string, (number | null)[]> = Object.fromEntries(keys.map((k) => [k, []]));
  for (let k = 0; k < PINNED_DAYS; k++) {
    const d = addDays(from, k);
    for (const s of keyStats(rows, d, d === today, keys, units)) series[s.key].push(s.metric.value);
  }
  return { day, series, asleepMin: rows.get(day)?.sleep?.main?.asleepMin ?? null };
}
