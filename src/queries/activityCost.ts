// Mobile: Activity Cost and detected activities for the Activities and Activity screens, Insights and the coach. Activity
// Cost is stage 2's stored result (src/core/algorithms/activityCost.ts) with the screens' names; the wording lives here
// so every surface says the same thing.
import { activityCostConfig, barelyMoves } from "@/core/algorithms/activityCost";
import type { DetectedActivity, DetectedKind } from "@/core/algorithms/autoWorkout";
import { ACTIVITY_NAME, ms, type QueryCtx, toStrain } from "./common";
import { FORMATS } from "./_lib";
import type { ActivityCostEntry, ActivityCostVM, ActivityKind, DetectedItem } from "./types";

/** Every kind's Activity Cost, measured kinds first; null before stage 2 has stored one. */
export async function getActivityCost(ctx: QueryCtx): Promise<ActivityCostVM | null> {
  const r = await ctx.store.getActivityCost();
  if (!r) return null;
  return {
    baseline: r.baseline,
    baselineKind: r.baselineKind,
    minSessions: activityCostConfig.minSessions,
    items: r.items.map((i) => ({ ...i, kind: i.kind as ActivityKind, name: ACTIVITY_NAME[i.kind as ActivityKind] ?? ACTIVITY_NAME.workout })),
  };
}

const PLURAL: Record<ActivityKind, string> = { run: "runs", ride: "rides", walk: "walks", strength: "strength sessions", workout: "workouts" };
const GERUND: Record<ActivityKind, string> = { run: "running", ride: "cycling", walk: "walking", strength: "strength training", workout: "a workout" };
const AGAINST: Record<ActivityCostVM["baselineKind"], string> = { rest: "your rest days", all: "your average" };

/** "−8%", "+3%": the change in next-morning Recovery; null when not measured. */
export const costValue = (e: ActivityCostEntry) => (e.reason === null ? `${FORMATS.signedInt(e.change)}%` : null);

/** Which way the change goes, for its colour: a cost, a lift, or barely any. */
export const costTone = (e: ActivityCostEntry): "cost" | "lift" | "flat" =>
  e.reason !== null || barelyMoves(e.change) ? "flat" : e.change < 0 ? "cost" : "lift";

/** The bounce-back: "Back in about 2 days", or what the change means when there is nothing to bounce back from. */
export function bounceText(e: ActivityCostEntry): string {
  if (e.reason !== null) return "Not enough data yet";
  if (barelyMoves(e.change)) return "Barely moves next-morning Recovery";
  if (e.change > 0) return "Higher Recovery the next morning";
  if (e.daysToBaseline === null) return "Not back to baseline within a week";
  return e.daysToBaseline === 1 ? "Back to baseline the next morning" : `Back to baseline in about ${e.daysToBaseline} days`;
}

/** The row caption: the bounce-back and how many workouts it rests on, or how many more it needs. */
export function costCaption(e: ActivityCostEntry, minSessions: number): string {
  if (e.reason !== null) return `Not enough data yet: ${e.sessions} of ${minSessions} ${PLURAL[e.kind]}`;
  return `${bounceText(e)} · ${e.sessions} ${PLURAL[e.kind]}${e.confidence === "building" ? ", early estimate" : ""}`;
}

/** One plain sentence for the Activity screen and the coach. */
export function costSentence(e: ActivityCostEntry, vm: Pick<ActivityCostVM, "baselineKind" | "minSessions">): string {
  const after = `After ${GERUND[e.kind]}`;
  if (e.reason !== null)
    return `Halo needs ${vm.minSessions} ${PLURAL[e.kind]} with a Recovery the next morning to measure what they cost you; it has ${e.sessions} so far.`;
  const against = AGAINST[vm.baselineKind];
  if (barelyMoves(e.change)) return `${after}, your next-morning Recovery is about the same as on ${against}.`;
  const pts = Math.round(Math.abs(e.change));
  if (e.change > 0) return `${after}, your Recovery the next morning averages ${pts}% above ${against}.`;
  const head = `${after}, your Recovery the next morning averages ${pts}% below ${against}`;
  if (e.daysToBaseline === null) return `${head} and is still lower a week later.`;
  if (e.daysToBaseline === 1) return `${head}, close enough to count as recovered.`;
  return `${head} and takes about ${e.daysToBaseline} days to come back.`;
}

/** "Measured against your rest days (64%)". */
export const baselineText = (vm: Pick<ActivityCostVM, "baseline" | "baselineKind">) =>
  vm.baseline === null ? null : `Measured against ${AGAINST[vm.baselineKind]} (${FORMATS.int(vm.baseline)}%)`;

/** The coach's digest (get_activities): each kind's change in Recovery points and bounce-back, or why it isn't measured. */
export function costDigest(vm: ActivityCostVM) {
  return {
    unit: "Recovery percentage points",
    baseline: vm.baseline === null ? null : Math.round(vm.baseline),
    baselineIs: vm.baselineKind === "rest" ? "mean Recovery on days with no workout that day or in the 7 days before" : "mean Recovery over every day (too few rest days)",
    kinds: vm.items.map((e) =>
      e.reason === null
        ? { activity: e.name, workoutsMeasured: e.sessions, nextMorningChange: Math.round(e.change), daysToBaseline: e.daysToBaseline, confidence: e.confidence, summary: costSentence(e, vm), reason: null }
        : { activity: e.name, workoutsMeasured: e.sessions, needed: vm.minSessions, reason: e.reason },
    ),
  };
}

export const DETECTED_LABEL: Record<DetectedKind, string> = { walk: "Walking", run: "Running", cardio: "Other cardio" };

/** A stored detected window as the screens show it. */
export const detectedItem = (d: DetectedActivity): DetectedItem => ({
  kind: d.kind,
  label: DETECTED_LABEL[d.kind],
  start: ms(d.start),
  end: ms(d.end),
  avgHr: d.avgHr,
  maxHr: d.maxHr,
  strain: d.effort == null ? null : toStrain(d.effort),
  steps: d.steps,
});
