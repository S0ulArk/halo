// Training Readiness (1–100): Halo's own implementation of Garmin's published Training Readiness (Garmin running-science
// pages, "Training Readiness", accessed 2026-10; Forerunner 970 manual, 2026). Garmin publishes the factors (sleep score,
// recovery time, HRV status, acute load, sleep history, stress history), that sleep and recovery time weigh most, and the
// bands; it doesn't publish weights. These are the report's guess (docs/research/whoop-garmin.md N-2, 2026-10-09).
import type { HrvStatus } from "./hrvStatus";

export const trainingReadinessConfig = {
  weights: { sleep: 0.25, recoveryTime: 0.25, hrv: 0.15, load: 0.15, sleepHistory: 0.1, stressHistory: 0.1 },
  /** Recovery time's factor: 100 · (1 − min(h, 72) / 72)^1.3 (guess). */
  recoveryHorizonHours: 72,
  recoveryPower: 1.3,
  /** HRV Status's factor (guess): Balanced 100, Unbalanced above 75, below 55, Low 25. */
  hrv: { balanced: 100, high: 75, low: 55, poor: 25 },
  /**
   * The load ratio's factor: 100 across Garmin's optimal 0.8–1.5, falling linearly to 30 at 2.0 and staying there; 90 under
   * 0.8. The report's guess put full marks at 0.8–1.3; Halo ends them at Garmin's 2026 optimal edge, 1.5, to agree with its
   * load bands.
   */
  load: { optimalFrom: 0.8, optimalTo: 1.5, floorAt: 2.0, floor: 30, under: 90 },
  /** Stress history: 100 − 50 × the 3-day mean awake stress (0–3) beyond 0.75 (guess). */
  stressFrom: 0.75,
  stressPerPoint: 50,
  /** The score is at most the weakest factor + this (guess: one very poor factor caps it). */
  capAboveWeakest: 30,
  /** More than this many hours awake before last night's sleep takes this off (guess; Garmin: very long time awake lowers it). */
  longDayHours: 18,
  longDayPenalty: 10,
};

/** Garmin's Training Readiness bands (published). */
export type ReadinessBand = "prime" | "high" | "moderate" | "low" | "poor";
export const readinessBand = (score: number): ReadinessBand =>
  score >= 95 ? "prime" : score >= 75 ? "high" : score >= 50 ? "moderate" : score >= 25 ? "low" : "poor";

export type ReadinessFactorKey = keyof typeof trainingReadinessConfig.weights;

export interface TrainingReadinessInput {
  /** Last night's Sleep Performance, 0–100. */
  sleep: number | null;
  /** Recovery Time left, hours. */
  recoveryHours: number | null;
  hrvStatus: Pick<Extract<HrvStatus, { status: string }>, "status" | "direction"> | null;
  /** Garmin-style load ratio. */
  loadRatio: number | null;
  /** The last 3 nights' Sleep Performance. */
  sleepHistory: (number | null)[];
  /** The last 3 days' mean awake stress, 0–3. */
  stressHistory: (number | null)[];
  /** Hours from the wake before last night's sleep to its start, or null. */
  hoursAwake: number | null;
}

export const recoveryTimeFactor = (hours: number) => {
  const c = trainingReadinessConfig;
  return 100 * (1 - Math.min(Math.max(hours, 0), c.recoveryHorizonHours) / c.recoveryHorizonHours) ** c.recoveryPower;
};

export function loadFactor(ratio: number): number {
  const l = trainingReadinessConfig.load;
  if (ratio < l.optimalFrom) return l.under;
  if (ratio <= l.optimalTo) return 100;
  if (ratio >= l.floorAt) return l.floor;
  return 100 - ((ratio - l.optimalTo) / (l.floorAt - l.optimalTo)) * (100 - l.floor);
}

const meanOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Each factor on 0–100, null when its input is missing. */
export function readinessFactors(a: TrainingReadinessInput): Record<ReadinessFactorKey, number | null> {
  const c = trainingReadinessConfig;
  const h = a.hrvStatus;
  const stress = meanOf(a.stressHistory);
  return {
    sleep: a.sleep == null ? null : Math.min(100, Math.max(0, a.sleep)),
    recoveryTime: a.recoveryHours == null ? null : recoveryTimeFactor(a.recoveryHours),
    hrv: !h?.status ? null : h.status === "balanced" ? c.hrv.balanced : h.status === "low" ? c.hrv.poor : h.direction === "high" ? c.hrv.high : c.hrv.low,
    load: a.loadRatio == null ? null : loadFactor(a.loadRatio),
    sleepHistory: meanOf(a.sleepHistory),
    stressHistory: stress == null ? null : Math.max(0, Math.min(100, 100 - c.stressPerPoint * Math.max(0, stress - c.stressFrom))),
  };
}

export type TrainingReadiness = {
  score: number;
  band: ReadinessBand;
  factors: Record<ReadinessFactorKey, number | null>;
  /** The factor that limits the score most (the lowest), for the card's line. */
  limiting: ReadinessFactorKey | null;
  longDay: boolean;
};

/**
 * Training Readiness 1–100: the factors' weighted mean (a missing factor's weight shared among the rest), at most the
 * weakest factor + 30, less 10 after a very long day awake. Null without last night's sleep or recovery time and with
 * fewer than three factors.
 */
export function trainingReadiness(a: TrainingReadinessInput): TrainingReadiness | null {
  const c = trainingReadinessConfig;
  const factors = readinessFactors(a);
  const present = (Object.keys(c.weights) as ReadinessFactorKey[]).filter((k) => factors[k] != null);
  if (present.length < 3 || (factors.sleep == null && factors.recoveryTime == null)) return null;
  const total = present.reduce((s, k) => s + c.weights[k], 0);
  let score = present.reduce((s, k) => s + c.weights[k] * factors[k]!, 0) / total;
  const weakest = present.reduce((w, k) => (factors[k]! < factors[w]! ? k : w), present[0]);
  score = Math.min(score, factors[weakest]! + c.capAboveWeakest);
  const longDay = a.hoursAwake != null && a.hoursAwake > c.longDayHours;
  if (longDay) score -= c.longDayPenalty;
  score = Math.round(Math.min(100, Math.max(1, score)));
  return { score, band: readinessBand(score), factors, limiting: factors[weakest]! < 75 ? weakest : null, longDay };
}
