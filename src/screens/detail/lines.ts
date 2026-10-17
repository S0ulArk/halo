// The detail screens' small pure helpers, kept apart from their views so vitest runs them: the words a Strain band
// goes by, the day against its Strain Target in a line, a night's dates as Apple Health writes them, and a daily series
// from the chart explorer's query cut to end on the day a screen shows.
import { DAY, formatDay, formatValue } from "@/lib/format";
import { localDay } from "@/lib/time";
import type { ChartSeriesVM } from "@/queries/chart";
import type { TrendPoint } from "@/ui/components/TrendChart";

/** The Strain bands as "How Strain works" names them: 0-9.9 light, 10-13.9 moderate, 14-17.9 strenuous, 18-21 all out. */
export function strainWord(v: number): string {
  const s = Math.round(v * 10) / 10;
  return s >= 18 ? "All out" : s >= 14 ? "Strenuous" : s >= 10 ? "Moderate" : "Light";
}

/** The day against its Strain Target, in a line: below it (by how much), inside it, or past it; nothing without both. */
export function targetLine(strain: number | null, t: { low: number; high: number } | null): string | null {
  if (strain === null || !t) return null;
  if (strain < t.low) return `${formatValue("decimal1", t.low - strain)} below today’s Strain Target of ${formatValue("decimal1", t.low)} – ${formatValue("decimal1", t.high)}.`;
  return strain > t.high ? "Past today’s Strain Target: prioritise sleep tonight." : "Inside today’s Strain Target.";
}

/** A night's dates as Apple Health writes them: "Oct 16–17" across midnight, "Oct 17" within a day, "Sep 30 – Oct 1". */
export function nightDates(bed: number, wake: number, timeZone: string): string {
  const from = localDay(Math.floor(bed / 1000), timeZone);
  const to = localDay(Math.floor(wake / 1000), timeZone);
  if (from === to) return formatDay(to, DAY.monthDay);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${formatDay(from, DAY.monthDay)}–${Number(to.slice(8))}`;
  return `${formatDay(from, DAY.monthDay)} – ${formatDay(to, DAY.monthDay)}`;
}

/** A daily series from the chart explorer's query as a trend's points, ending on `day` (a year at most). */
export function seriesPoints(s: Pick<ChartSeriesVM, "days" | "values" | "provisional">, day: string): TrendPoint[] {
  const end = s.days.findIndex((x) => x > day);
  const upto = end === -1 ? s.days.length : end;
  const from = Math.max(0, upto - 365);
  return s.days.slice(from, upto).map((date, i) => ({ date, value: s.values[from + i], provisional: s.provisional[from + i] }));
}
