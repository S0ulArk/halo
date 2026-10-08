// Ports RecoveryScorer.kt (Charge: z-scores against personal baselines through a logistic) and the
// daily-aggregate gate from WatchRecovery.kt. Fitbit nightly HRV is a daily aggregate, so Recovery waits
// for minBaselineNights accepted prior nights. Since version 17 the inputs follow WHOOP's 2026 description (The Locker,
// "Recovery 101", 2026-01-30: HRV, resting HR, Sleep Performance and respiratory rate; skin temperature and SpO2 are shown
// in Health Monitor, not scored): HRV on a log scale, respiratory rate only ever lowering the score (WHOOP, "Adding
// respiratory rate to Recovery", 2020-07-27, still current per the 2026 page), no skin temperature. Halo's own
// implementation; WHOOP's weights are unpublished.
import { foldHistory, isUsable, recoveryHRVLnCfg, restingHRCfg } from "./baselines";
import { forCharge } from "./confidence";
import type { BaselineState, ScoreConfidence } from "./types";

/**
 * Weights on the z-scores (guess, docs/research/whoop-garmin.md C6, 2026-10-09): HRV-dominant, as WHOOP describes
 * Recovery, with the 0.05 that respiratory rate and skin temperature each had before folded into the other three.
 */
export const wHRV = 0.58;
export const wRHR = 0.22;
export const wSleep = 0.2;
/**
 * Respiratory rate lowers the score only when it is up: past respPenaltyFromZ baseline SDs above your baseline, the
 * composite z drops respPenaltyPerZ per SD beyond, twice as much when the rest already points down (WHOOP: the rate
 * matters most when Recovery is already suppressed). Guess, report C6.
 */
export const respPenaltyFromZ = 1.0;
export const respPenaltyPerZ = 0.15;
export const respPenaltyLowFactor = 2;
export const wRecoveryIndex = 0.05;
export const recoveryIndexScaleBpmPerHr = 2.0;
export const wActivityBalance = 0.05;
export const logisticK = 1.6;
/** Z = 0 maps to ~58%. */
export const logisticZ0 = -0.2;
export const populationMean = 58.0;
export const bandRedMax = 34.0;
export const bandYellowMax = 67.0;
export const sleepPerfCenter = 0.85;
export const sleepPerfScale = 0.12;

// Parasympathetic-saturation guard: detected and reported, deliberately NOT applied to the score.
export const satEnterZ = 0.5;
export const satFullZ = 1.5;
export const satMaxDampFraction = 0.5;

/** Accepted (nValid) prior nights before a daily-aggregate HRV source is scored. */
export const minBaselineNights = 7;

export interface ParasympatheticSaturation {
  /** The HRV z the easing WOULD use. Never fed to the score. */
  easedHrvZ: number;
  active: boolean;
  dampFraction: number;
}

/** `hrvZ` and `rhrZ` as recovery() builds them: higher is better for both. */
export function parasympatheticSaturation(hrvZ: number, rhrZ: number | null): ParasympatheticSaturation {
  const inactive = { easedHrvZ: hrvZ, active: false, dampFraction: 0.0 };
  if (rhrZ == null) return inactive;
  const hrvLow = -hrvZ;
  const rhrLow = rhrZ;
  if (hrvLow < satEnterZ || rhrLow < satEnterZ) return inactive;
  const couplingStrength = Math.min(hrvLow, rhrLow);
  const s = Math.max(0.0, Math.min(1.0, (couplingStrength - satEnterZ) / (satFullZ - satEnterZ)));
  const dampFraction = satMaxDampFraction * s;
  return { easedHrvZ: hrvZ * (1.0 - dampFraction), active: dampFraction > 0.0, dampFraction };
}

export type RecoveryBand = "red" | "yellow" | "green";

export function band(score: number): RecoveryBand {
  if (score < bandRedMax) return "red";
  if (score < bandYellowMax) return "yellow";
  return "green";
}

/** Mean and spread in abs-dev units, as in BaselineState. */
export interface DriverBaseline {
  mean: number;
  spread: number;
}

export const driverBaseline = (s: BaselineState): DriverBaseline => ({ mean: s.baseline, spread: s.spread });

/** (value − mean) / (1.253 × spread). */
export function zScore(value: number, mean: number, spread: number): number {
  return (value - mean) / Math.max(1.253 * spread, 1e-9);
}

export interface RecoveryArgs {
  /** RMSSD-like nightly HRV, ms; scored as ln(ms) against `hrvBaseline`. */
  hrv: number;
  /** Resting HR, bpm. null drops the term (noop takes a non-null value; the term also needs a baseline). */
  rhr: number | null;
  resp?: number | null;
  /** In ln(ms) (recoveryHRVLnCfg). Required: null returns null. */
  hrvBaseline: DriverBaseline | null;
  rhrBaseline?: DriverBaseline | null;
  respBaseline?: DriverBaseline | null;
  /** Rest composite / 100, or efficiency, in [0, 1]. */
  sleepPerf?: number | null;
  hrvBaselineUsable?: boolean;
  /** Overnight resting-HR slope, bpm/hour (negative = declining = good). */
  recoveryIndexSlope?: number | null;
  effortBaseline?: DriverBaseline | null;
  /** Yesterday's Effort, 0–100. */
  priorDayEffort?: number | null;
}

/** The HRV z Recovery uses: ln(ms) against the ln baseline. */
export const hrvLnZ = (hrv: number, b: DriverBaseline): number => zScore(Math.log(Math.max(hrv, 1)), b.mean, b.spread);

/** How far the composite z drops for a respiratory-rate z (one-sided: 0 at or under respPenaltyFromZ). */
export function respPenalty(respZ: number, compositeZ: number): number {
  if (!(respZ > respPenaltyFromZ)) return 0;
  return respPenaltyPerZ * (respZ - respPenaltyFromZ) * (compositeZ < 0 ? respPenaltyLowFactor : 1);
}

/** Charge in [0, 100], or null on cold start or a missing HRV baseline. Missing terms drop and renormalize. */
export function recovery(a: RecoveryArgs): number | null {
  if (!(a.hrvBaselineUsable ?? true)) return null;
  const hrvB = a.hrvBaseline;
  if (!hrvB) return null;

  const terms: [z: number, w: number][] = [];
  // ln HRV z: the saturation easing is not applied here (instrument-first).
  terms.push([hrvLnZ(a.hrv, hrvB), wHRV]);
  if (a.rhrBaseline && a.rhr != null) terms.push([zScore(a.rhrBaseline.mean, a.rhr, a.rhrBaseline.spread), wRHR]);
  if (a.sleepPerf != null) terms.push([(a.sleepPerf - sleepPerfCenter) / sleepPerfScale, wSleep]);
  if (a.recoveryIndexSlope != null) terms.push([-a.recoveryIndexSlope / recoveryIndexScaleBpmPerHr, wRecoveryIndex]);
  if (a.priorDayEffort != null && a.effortBaseline) {
    terms.push([zScore(a.effortBaseline.mean, a.priorDayEffort, a.effortBaseline.spread), wActivityBalance]);
  }

  const totalWeight = terms.reduce((s, [, w]) => s + w, 0);
  if (totalWeight <= 0.0) return null;
  let z = terms.reduce((s, [t, w]) => s + t * w, 0) / totalWeight;
  if (a.resp != null && a.respBaseline) z -= respPenalty(zScore(a.resp, a.respBaseline.mean, a.respBaseline.spread), z);
  return logisticScore(z);
}

export function logisticScore(compositeZ: number): number {
  const score = 100.0 / (1.0 + Math.exp(-logisticK * (compositeZ - logisticZ0)));
  return Math.max(0.0, Math.min(100.0, score));
}

export interface RecoveryStateArgs
  extends Omit<RecoveryArgs, "hrvBaseline" | "rhrBaseline" | "respBaseline" | "effortBaseline" | "hrvBaselineUsable"> {
  hrvBaseline: BaselineState;
  rhrBaseline?: BaselineState | null;
  respBaseline?: BaselineState | null;
  effortBaseline?: BaselineState | null;
}

/** The BaselineState overload: gates on hrvBaseline usable, and treats an unusable RHR baseline as absent. */
export function recoveryFromStates(a: RecoveryStateArgs): number | null {
  return recovery({
    ...a,
    hrvBaseline: driverBaseline(a.hrvBaseline),
    rhrBaseline: a.rhrBaseline && isUsable(a.rhrBaseline) ? driverBaseline(a.rhrBaseline) : null,
    respBaseline: a.respBaseline ? driverBaseline(a.respBaseline) : null,
    effortBaseline: a.effortBaseline ? driverBaseline(a.effortBaseline) : null,
    hrvBaselineUsable: isUsable(a.hrvBaseline),
  });
}

export interface GatedRecoveryArgs extends Omit<RecoveryStateArgs, "hrv"> {
  hrv: number | null;
}

/**
 * WatchRecovery's honesty gate over the full term set: null + calibrating unless tonight's HRV exists, the
 * HRV baseline is usable, and it has accepted at least minBaselineNights nights.
 */
export function gatedRecovery(a: GatedRecoveryArgs): { recovery: number | null; confidence: ScoreConfidence } {
  const calibrating = { recovery: null, confidence: "calibrating" as const };
  const { hrv, hrvBaseline } = a;
  if (hrv == null || !isUsable(hrvBaseline) || hrvBaseline.nValid < minBaselineNights) return calibrating;
  const score = recoveryFromStates({ ...a, hrv });
  if (score == null) return calibrating;
  return { recovery: score, confidence: forCharge(hrv, hrvBaseline) };
}

/** WatchRecovery.compute: HRV + RHR only, baselines folded from raw histories (oldest first; HRV in ms, folded as ln). */
export function watchRecovery(
  todayHrv: number | null,
  todayRhr: number | null,
  hrvHistory: number[],
  rhrHistory: number[],
): { recovery: number | null; confidence: ScoreConfidence } {
  return gatedRecovery({
    hrv: todayHrv,
    rhr: todayRhr,
    hrvBaseline: foldHistory(hrvHistory.map(lnHrv), recoveryHRVLnCfg),
    rhrBaseline: foldHistory(rhrHistory, restingHRCfg),
  });
}

/** ln of a nightly HRV for the Recovery baseline (null and non-positive pass as missing). */
export const lnHrv = (ms: number | null | undefined): number | null => (ms != null && ms > 0 ? Math.log(ms) : null);
