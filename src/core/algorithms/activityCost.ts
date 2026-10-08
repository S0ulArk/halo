// Activity Cost: per kind of workout, how far next-morning Recovery sits from the person's baseline after it, and how
// many mornings the averaged Recovery takes to come back. Plain means over aligned days; nothing is learned.
// Ported from NOOP's analytics/ActivityCostEngine.kt (Copyright 2026 NoopApp, PolyForm Noncommercial 1.0.0): the
// tunables, the rest-day baseline, the D+1 pairing, the bounce-back trajectory and the ranking are its. Mobile changes:
// `change` is signed the other way (next morning minus baseline, so a cost is negative, as the screens show it), a kind
// under the minimum is kept as "not enough data" instead of dropped, and with too few untouched days the baseline falls
// back to the average of every day with a Recovery.
import { addDays } from "@/lib/time";

export const activityCostConfig = {
  /** Workout days with a next-morning Recovery below which a kind has "not enough data" (NOOP's minSessions). */
  minSessions: 4,
  /** Workout days at or above which the result is solid rather than building (NOOP's solidSessions). */
  solidSessions: 8,
  /** Mornings after a workout the bounce-back looks at, D+1 … D+7; also the after-effect window a rest day avoids. */
  maxLookahead: 7,
  /** Recovery points under the baseline that count as bounced back. */
  tolerance: 3,
  /** |change| under this many points "barely moves" Recovery. */
  barelyMoves: 1,
  /** Mobile: untouched days needed for the rest-day baseline; fewer and it is every day's average instead. */
  minRestDays: 7,
};

export type CostConfidence = "building" | "solid";

export type ActivityCostItem<K extends string = string> =
  | {
      kind: K;
      /** Workout days with a Recovery the next morning. */
      sessions: number;
      reason: null;
      /** Mean next-morning Recovery minus the baseline, points; negative is a cost. */
      change: number;
      /** Mean next-morning Recovery, 0–100. */
      nextMorning: number;
      /** Mornings until the averaged Recovery is back within `tolerance` of the baseline; null when not within a week. */
      daysToBaseline: number | null;
      confidence: CostConfidence;
    }
  | { kind: K; sessions: number; reason: "not_enough_data" };

export type ActivityCostResult<K extends string = string> = {
  /** Mean Recovery the kinds are measured against, 0–100; null with no Recovery at all. */
  baseline: number | null;
  /** "rest": days with no workout and none in the 7 days before. "all": every day with a Recovery (too few rest days). */
  baselineKind: "rest" | "all";
  baselineDays: number;
  /** Measured kinds by |change| (solid first on a tie, then kind), then the ones short of data by sessions. */
  items: ActivityCostItem<K>[];
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Each kind's recovery cost. `daysByKind`: the local days each kind of workout started on (a day with two runs counts
 * once). `recovery`: Recovery (0–100) by day, days without one left out.
 */
export function activityCost<K extends string>(daysByKind: Map<K, Set<string>>, recovery: Map<string, number>): ActivityCostResult<K> {
  const { maxLookahead, minRestDays, minSessions, solidSessions } = activityCostConfig;
  // NOOP: rest days have a Recovery and are neither a workout day nor in the after-effect window of one, so the
  // mornings a workout suppresses don't dilute the bar it is measured against.
  const affected = new Set<string>();
  for (const days of daysByKind.values())
    for (const d of days) for (let k = 0; k <= maxLookahead; k++) affected.add(addDays(d, k));
  const rest = [...recovery].filter(([d]) => !affected.has(d)).map(([, v]) => v);
  const all = [...recovery.values()];
  const baselineKind = rest.length >= minRestDays ? "rest" : "all";
  const base = baselineKind === "rest" ? rest : all;
  const baseline = base.length ? mean(base) : null;

  const measured: Extract<ActivityCostItem<K>, { reason: null }>[] = [];
  const short: Extract<ActivityCostItem<K>, { reason: "not_enough_data" }>[] = [];
  for (const kind of [...daysByKind.keys()].sort()) {
    const days = daysByKind.get(kind)!;
    const next = [...days].flatMap((d) => {
      const v = recovery.get(addDays(d, 1));
      return v === undefined ? [] : [v];
    });
    if (baseline === null || next.length < minSessions) {
      short.push({ kind, sessions: next.length, reason: "not_enough_data" });
      continue;
    }
    const nextMorning = mean(next);
    measured.push({
      kind,
      sessions: next.length,
      reason: null,
      change: r1(nextMorning - baseline),
      nextMorning: r1(nextMorning),
      daysToBaseline: daysToBaseline(days, recovery, baseline),
      confidence: next.length >= solidSessions ? "solid" : "building",
    });
  }
  // NOOP's rank: biggest |change| first, solid ahead of building on a tie, then kind.
  measured.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || +(b.confidence === "solid") - +(a.confidence === "solid") || (a.kind < b.kind ? -1 : 1));
  short.sort((a, b) => b.sessions - a.sessions || (a.kind < b.kind ? -1 : 1));
  return { baseline: baseline === null ? null : r1(baseline), baselineKind, baselineDays: base.length, items: [...measured, ...short] };
}

/**
 * The first k in 1 … maxLookahead where the mean Recovery k mornings after the workout days (those with a value then)
 * is within `tolerance` of the baseline; null when it never gets there in the window.
 */
export function daysToBaseline(days: Set<string>, recovery: Map<string, number>, baseline: number): number | null {
  const { maxLookahead, tolerance } = activityCostConfig;
  for (let k = 1; k <= maxLookahead; k++) {
    const vals = [...days].flatMap((d) => {
      const v = recovery.get(addDays(d, k));
      return v === undefined ? [] : [v];
    });
    if (vals.length && mean(vals) >= baseline - tolerance) return k;
  }
  return null;
}

/** "barely moves" under a point, else the signed points. */
export const barelyMoves = (change: number) => Math.abs(change) < activityCostConfig.barelyMoves;
