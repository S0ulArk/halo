// Ports IllnessSignalEngine.kt (multi-signal heads-up with corroboration and confounder suppression) and
// the illness half of V5HealthSignals.kt (trailing-window z-scores and the per-signal trust gate).
// Not ported: IllnessDistance, the cycle and body-clock engines. Wellness only, never a diagnosis.
import { hrvCfg, respCfg, restingHRCfg, skinTempCfg } from "./baselines";

export const raiseThreshold = 50.0;
export const mildThreshold = 25.0;
export const minCorroboratingSignals = 2;
export const signalZThreshold = 2.0;
export const kZToScore = 22.0;
export const perSignalCap = 40.0;
export const confounderDampen = 0.45;
export const disclaimerTail = "On-device estimate - not a diagnosis.";

/** V5HealthSignals: trailing nights for the rolling z baseline, and the minimum before a z is trusted. */
export const illnessBaselineWindow = 30;
export const illnessMinBaselineNights = 14;

export type IllnessSignalKey = "restingHR" | "skinTemp" | "hrv" | "respiration";

/** z oriented so positive is more illness-like (HRV passes its negated z). `present: false` skips it. */
export interface SignalReading {
  zIllnessward: number;
  present?: boolean;
}

export type IllnessInputs = Partial<Record<IllnessSignalKey, SignalReading | null>>;

/** Same-day confounders. `baselineTrusted: false` keeps the engine silent. */
export interface IllnessContext {
  alcohol?: boolean;
  stress?: boolean;
  sauna?: boolean;
  hardOrLateWorkout?: boolean;
  travelPhaseJump?: boolean;
  alreadyUnwell?: boolean;
  baselineTrusted?: boolean;
}

export type IllnessLevel = "quiet" | "mild" | "raised" | "suppressed" | "alreadyUnwell";

export interface IllnessResult {
  score: number;
  level: IllnessLevel;
  /** Labels (from firedLabels) of the signals that cleared signalZThreshold, in fixed key order. */
  firedSignals: string[];
  suppressedBy: string[];
  signalCount: number;
  copy: string;
}

const order: IllnessSignalKey[] = ["restingHR", "skinTemp", "hrv", "respiration"];

export function evaluate(
  inputs: IllnessInputs,
  context: IllnessContext = {},
  firedLabels: Partial<Record<IllnessSignalKey, string>> = {},
): IllnessResult {
  let rawScore = 0.0;
  const firedKeys: IllnessSignalKey[] = [];
  for (const key of order) {
    const r = inputs[key];
    if (!r || r.present === false) continue;
    const over = r.zIllnessward - signalZThreshold;
    if (over <= 0) continue;
    firedKeys.push(key);
    rawScore += Math.min(perSignalCap, kZToScore * over);
  }
  const score = Math.min(100.0, rawScore);
  const signalCount = firedKeys.length;
  const firedSignals = firedKeys.map((k) => firedLabels[k]).filter((l): l is string => l != null);
  const result = (s: number, level: IllnessLevel, copy: string, suppressedBy: string[] = []): IllnessResult => ({
    score: s,
    level,
    firedSignals,
    suppressedBy,
    signalCount,
    copy,
  });

  if (!(context.baselineTrusted ?? true)) return result(score, "quiet", "Still learning your baseline - keeping an eye out.");

  if (context.alreadyUnwell) {
    const agreeing = score >= mildThreshold && signalCount >= 1;
    const copy = agreeing
      ? `Rest up - you logged feeling unwell, and your numbers agree. ${disclaimerTail}`
      : `Rest up - you logged feeling unwell. Take it easy today. ${disclaimerTail}`;
    return result(score, "alreadyUnwell", copy);
  }

  if (signalCount < minCorroboratingSignals || score < mildThreshold) {
    return result(score, "quiet", "Nothing notable - your signals look like your normal range.");
  }

  const suppressedBy: string[] = [];
  if (context.alcohol) suppressedBy.push("alcohol");
  if (context.stress) suppressedBy.push("stress");
  if (context.sauna) suppressedBy.push("sauna");
  if (context.hardOrLateWorkout) suppressedBy.push("a hard or late workout");
  if (context.travelPhaseJump) suppressedBy.push("travel");

  const signalsPhrase = firedSignals.length === 0 ? "Some signals are up" : firedSignals.join(", ");

  if (suppressedBy.length > 0) {
    const copy =
      `Some signals are up (${signalsPhrase}), but you logged ${joinReasons(suppressedBy)} - likely that, ` +
      `not illness. ${disclaimerTail}`;
    return result(score * confounderDampen, "suppressed", copy, suppressedBy);
  }

  if (score < raiseThreshold) {
    return result(score, "mild", `A few signals are mildly up (${signalsPhrase}). Nothing alarming - worth a calmer day. ${disclaimerTail}`);
  }
  return result(
    score,
    "raised",
    `Heads-up - your body looks strained. ${signalsPhrase}. With no alcohol or travel logged, consider taking it easy. ${disclaimerTail}`,
  );
}

/** "a", "a and b", "a, b and c". */
export function joinReasons(reasons: string[]): string {
  if (reasons.length === 0) return "something";
  if (reasons.length === 1) return reasons[0];
  return `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
}

// ── V5HealthSignals adapter ────────────────────────────────────────────────

/** One nightly row. `skinTempDev` is °C from the personal baseline. */
export interface IllnessDay {
  day: string;
  rhr?: number | null;
  hrv?: number | null;
  skinTempDev?: number | null;
  resp?: number | null;
}

/**
 * The smallest SD each signal's z divides by (mobile addition): half the baselines' σ floor, 0.5 × 1.253 × floorSpread
 * (Baselines.kt metricCfg spreads are mean absolute deviations; σ ≈ 1.253 × spread): 1.25 bpm, 3.1 ms, 0.31 rpm,
 * 0.19 °C. Without a floor a near-constant history made any change fire: 20 nights of a resting HR of 72 and then 73
 * read as a z in the millions. The full σ floor (2.5 bpm, 6.3 ms, 0.63 rpm, 0.38 °C) is above ordinary night-to-night
 * spreads (the demo's 30 nights before its illness peak: 1.9 bpm, 7.9 ms, 0.35 rpm, 0.20 °C), and silenced the signal
 * there entirely; half keeps it and still needs about +3 bpm on a flat resting HR.
 */
export const illnessSdFloorShare = 0.5;
export const illnessSdFloor = {
  restingHR: illnessSdFloorShare * 1.253 * restingHRCfg.floorSpread,
  hrv: illnessSdFloorShare * 1.253 * hrvCfg.floorSpread,
  respiration: illnessSdFloorShare * 1.253 * respCfg.floorSpread,
  skinTemp: illnessSdFloorShare * 1.253 * skinTempCfg.floorSpread,
} satisfies Record<IllnessSignalKey, number>;

/** Rolling mean + sample SD z (SD floored at `sdFloor`), or null when the value is absent or the window holds < 14 values. */
function zAgainst(value: number | null | undefined, window: (number | null | undefined)[], sdFloor: number): number | null {
  if (value == null) return null;
  const xs = window.filter((v): v is number => v != null);
  if (xs.length < illnessMinBaselineNights) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / Math.max(xs.length - 1, 1);
  return (value - mean) / Math.max(Math.sqrt(variance), sdFloor);
}

const hasAnyVital = (d: IllnessDay) => d.rhr != null || d.hrv != null || d.skinTempDev != null || d.resp != null;

/**
 * The illness read for the newest of `days` (oldest first), each signal z-scored against the 30 rows before
 * it. Trusted once the RHR or HRV signal alone has 14 nights in that window.
 */
export function illnessFromDays(days: IllnessDay[], journal: Omit<IllnessContext, "baselineTrusted"> = {}): IllnessResult & { baselineTrusted: boolean } {
  const prior = days.slice(0, -1).slice(-illnessBaselineWindow);
  const withVitals = prior.filter(hasAnyVital);
  const baselineTrusted =
    withVitals.filter((d) => d.rhr != null).length >= illnessMinBaselineNights ||
    withVitals.filter((d) => d.hrv != null).length >= illnessMinBaselineNights;

  const latest = days.at(-1);
  const z = (f: (d: IllnessDay) => number | null | undefined, floor: number) => (latest ? zAgainst(f(latest), prior.map(f), floor) : null);
  const rhrZ = z((d) => d.rhr, illnessSdFloor.restingHR);
  const tempZ = z((d) => d.skinTempDev, illnessSdFloor.skinTemp);
  const hrvZ = z((d) => d.hrv, illnessSdFloor.hrv);
  const respZ = z((d) => d.resp, illnessSdFloor.respiration);

  const labels: Partial<Record<IllnessSignalKey, string>> = {};
  if (rhrZ != null && rhrZ >= signalZThreshold) labels.restingHR = "RHR up";
  if (tempZ != null && tempZ >= signalZThreshold) labels.skinTemp = "skin temp up";
  if (hrvZ != null && -hrvZ >= signalZThreshold) labels.hrv = "HRV down";
  if (respZ != null && respZ >= signalZThreshold) labels.respiration = "respiration up";

  const reading = (v: number | null) => (v == null ? null : { zIllnessward: v });
  const result = evaluate(
    { restingHR: reading(rhrZ), skinTemp: reading(tempZ), hrv: reading(hrvZ == null ? null : -hrvZ), respiration: reading(respZ) },
    { ...journal, baselineTrusted },
    labels,
  );
  return { ...result, baselineTrusted };
}
