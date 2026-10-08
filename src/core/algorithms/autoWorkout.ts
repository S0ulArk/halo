// Auto-detected workouts: stretches of sustained elevated heart rate with no workout recorded, labelled by the steps
// in them. Shown on the day's activities as "Detected activity" and never scored (Strain already counts all HR).
// Ported from NOOP's analytics/AutoWorkoutDetector.kt (Copyright 2026 NoopApp, PolyForm Noncommercial 1.0.0): the gate
// at resting HR + 30 bpm, the 90 s dip allowance, the 5-minute merge and the overlap rule are its (its 12-minute minimum
// is WHOOP's 10 here, since 2026). Mobile changes: a gap in the samples longer than Strain's 2-minute sample cap closes
// a span too (NOOP's strap
// streams every second, a band's samples can stop), sleep is excluded as well as recorded workouts, and per-minute steps
// label each window walking, running or other cardio in place of NOOP's WorkoutTypeClassifier (which reads its strap's
// gait ticks). Steps also stand in for NOOP's motion confirmation: a window without them (cycling, rowing, or sitting
// with a raised pulse) must average Zone 1 (half the heart-rate reserve, the app's zones) to count.
import { maxSampleGapMin } from "@/core/scoring/strain";
import type { HrSample } from "@/core/scoring/types";

export const autoWorkoutConfig = {
  /** A sample is elevated at resting HR + this many bpm. */
  elevatedMarginBpm: 30,
  /**
   * A span must hold for this long, first to last elevated sample: 10 minutes, WHOOP's auto-detect minimum since January
   * 2026 (published: WHOOP, "2026 What's New", 2026-03-31); was 12.
   */
  minSustainedMin: 10,
  /** A run of samples under the gate no longer than this doesn't break the span (a red light, a sip of water). */
  maxDipS: 90,
  /** Kept spans closer than this are merged. */
  mergeGapS: 5 * 60,
  /** Mobile: no sample for longer than this ends the span (Strain's cap on what one reading covers). */
  maxGapS: maxSampleGapMin * 60,
  /** Resting HR when the day has none. */
  defaultRestingHr: 60,
  /** Mobile: a minute with this many steps is on foot (a slow walk's cadence). */
  footCadence: 60,
  /** Mobile: on-foot minutes at this median cadence or above are running. */
  runCadence: 140,
  /** Mobile: the share of the window's minutes on foot that makes it a walk or run rather than other cardio. */
  footShare: 0.5,
  /**
   * Mobile: other cardio must average this share of the heart-rate reserve: half, Zone 1's lower bound until version 15
   * moved Zone 1 to 40 % (zones.ts); kept, so a raised pulse at rest isn't read as cardio.
   */
  cardioHrr: 0.5,
};

/**
 * Bump when detection changes: stage 1's memo key holds it, so every day is detected again (no scores change, so
 * SCORING_VERSION stays).
 */
export const AUTO_WORKOUT_VERSION = 2;

export type DetectedKind = "walk" | "run" | "cardio";

/** A detected window. Times are unix seconds; bpm are whole; `steps` is null with no step data in the window. */
export type DetectedWorkout = { start: number; end: number; avgHr: number; maxHr: number; minutes: number; kind: DetectedKind; steps: number | null };

/** As stage 1 stores it (`daily_scores.detected`): the window plus its Effort (0–100, null with too little HR), shown only. */
export type DetectedActivity = DetectedWorkout & { effort: number | null };

export type Window = { start: number; end: number };

export type DetectOptions = {
  /** The day's resting HR; null is 60 bpm. */
  restingHr: number | null;
  /** Max HR for other cardio's Zone 1 floor; null keeps NOOP's HR-only rule for it. */
  maxHr?: number | null;
  /** Steps per minute, `ts` the minute's start. */
  steps?: { ts: number; steps: number }[];
  /** Recorded workouts and sleep: a window touching one is dropped. */
  excluded?: Window[];
};

/** The windows of sustained elevated HR in `hr` (ascending). */
export function detectWorkouts(hr: HrSample[], { restingHr, maxHr = null, steps = [], excluded = [] }: DetectOptions): DetectedWorkout[] {
  const { elevatedMarginBpm, minSustainedMin, maxDipS, mergeGapS, maxGapS, defaultRestingHr, cardioHrr } = autoWorkoutConfig;
  const rest = restingHr ?? defaultRestingHr;
  const floor = rest + elevatedMarginBpm;
  const cardioFloor = maxHr === null ? -Infinity : rest + cardioHrr * Math.max(1, maxHr - rest);

  // Grow spans over elevated samples; a dip longer than maxDipS (or a gap longer than maxGapS) closes one. A span runs
  // from its first to its last elevated sample.
  const spans: Window[] = [];
  let spanStart: number | null = null;
  let spanEnd = 0;
  let dipStart: number | null = null;
  let prev = -Infinity;
  const close = () => {
    if (spanStart !== null && spanEnd - spanStart >= minSustainedMin * 60) spans.push({ start: spanStart, end: spanEnd });
    spanStart = null;
    dipStart = null;
  };
  for (const s of hr) {
    if (spanStart !== null && s.ts - prev > maxGapS) close();
    prev = s.ts;
    if (s.bpm >= floor) {
      spanStart ??= s.ts;
      spanEnd = s.ts;
      dipStart = null;
    } else if (spanStart !== null) {
      dipStart ??= s.ts;
      if (s.ts - dipStart > maxDipS) close();
    }
  }
  close();

  // Merge spans less than mergeGapS apart (they are in start order).
  const merged: Window[] = [];
  for (const w of spans) {
    const last = merged.at(-1);
    if (last && w.start - last.end < mergeGapS) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }

  const out: DetectedWorkout[] = [];
  for (const w of merged) {
    // Closed intervals, as NOOP's: touching counts as overlapping.
    if (excluded.some((x) => w.start <= x.end && x.start <= w.end)) continue;
    const bpm = hr.filter((s) => s.ts >= w.start && s.ts <= w.end).map((s) => s.bpm);
    if (!bpm.length) continue;
    const avg = bpm.reduce((a, b) => a + b, 0) / bpm.length;
    const label = labelBySteps(steps, w.start, w.end);
    if (label.kind === "cardio" && avg < cardioFloor) continue;
    out.push({ start: w.start, end: w.end, avgHr: Math.round(avg), maxHr: Math.max(...bpm), minutes: Math.floor((w.end - w.start) / 60), ...label });
  }
  return out;
}

/**
 * Walking or running when at least `footShare` of the window's minutes have a walking cadence (running when their
 * median cadence is a runner's), else other cardio (cycling, rowing, a class). No step data in the window is cardio.
 */
export function labelBySteps(steps: { ts: number; steps: number }[], start: number, end: number): { kind: DetectedKind; steps: number | null } {
  const { footCadence, runCadence, footShare } = autoWorkoutConfig;
  // The minutes overlapping [start, end].
  const rows = steps.filter((s) => s.ts > start - 60 && s.ts <= end);
  if (!rows.length) return { kind: "cardio", steps: null };
  const total = Math.round(rows.reduce((a, s) => a + s.steps, 0));
  const foot = rows.map((s) => s.steps).filter((v) => v >= footCadence).sort((a, b) => a - b);
  const minutes = Math.max(1, Math.round((end - start) / 60));
  if (foot.length < footShare * minutes) return { kind: "cardio", steps: total };
  const median = foot.length % 2 ? foot[foot.length >> 1] : (foot[foot.length / 2 - 1] + foot[foot.length / 2]) / 2;
  return { kind: median >= runCadence ? "run" : "walk", steps: total };
}
