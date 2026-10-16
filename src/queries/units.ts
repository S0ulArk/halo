// The view models' side of Settings › Units: a number a query labels with a metric unit ("kg", "km", "m", "/km", "°C",
// "ml") is converted here, as the view model is built, into the person's units (ctx.units; metric when absent, as the
// coach's tools read them). Picks are wrapped, so averages, spreads, trends and ranges all come out in the shown unit
// and a chart's ticks are round in it. A temperature that is a difference from a baseline (skin temperature) is marked
// `delta` and converts without the +32. The Store and the scores never see a converted number.
import { conversionFor, mapFinite, METRIC, shown, shownSpread, type Conversion, type Units } from "@/lib/units";
import type { DayRow } from "./common";
import type { QueryCtx } from "./ctx";
import type { KeyStat } from "./types";

/** The units a query shows: the person's, or metric. */
export const unitsOf = (ctx: Pick<QueryCtx, "units">): Units => ctx.units ?? METRIC;

type Pick_<R> = (r: R) => number | null | undefined;

/** `pick` reading its value as shown in `conv` (the pick itself with no conversion). */
export function shownPick<R>(pick: Pick_<R>, conv: Conversion | null): Pick_<R> {
  if (!conv) return pick;
  return (r) => mapFinite(pick(r), (v) => shown(v, conv));
}

/**
 * A catalogue metric (a Trends or chart metric, an extra, a dashboard row) in `units`: its shown unit and a pick that
 * reads the shown value. Unchanged when nothing converts. `delta`: the metric is a difference from a baseline.
 */
export function localizeDef<T extends { unit?: string; pick?: Pick_<DayRow> }>(def: T, units: Units, delta = false): T {
  const conv = conversionFor(def.unit, units, { delta });
  if (!conv) return def;
  return { ...def, unit: conv.unit, ...(def.pick && { pick: shownPick(def.pick, conv) }) };
}

/** A KeyStat in `units`: its value and average converted, its SD by the factor alone. `delta`: a difference from a baseline. */
export function localizeStat<S extends KeyStat>(s: S, units: Units, delta = false): S {
  const conv = conversionFor(s.unit, units, { delta });
  if (!conv) return s;
  const to = (v: number) => shown(v, conv);
  return {
    ...s,
    unit: conv.unit,
    metric: { ...s.metric, value: mapFinite(s.metric.value, to) },
    average: mapFinite(s.average, to),
    ...(s.sd !== undefined && { sd: shownSpread(s.sd, conv) }),
  };
}
