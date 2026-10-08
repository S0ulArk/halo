// Strain: cardiovascular (and, for strength-type sessions, muscular) load from heart rate on a 0–21 log scale, stored
// as "Effort" on 0–100 (Effort = Strain × 100 / 21). Halo's own implementation of WHOOP's published structure (The
// Locker, "WHOOP Strain Explained", 2026-02-10; patent US12318226B2, granted 2025-06-03): load is integrated over time
// on heart-rate reserve, mapped through a log so it gets harder to add the higher it already is, and a day's Strain is
// the map of the day's whole load, never a sum of activities. WHOOP's weights and map constants are unpublished, so:
// - the per-minute load is Banister's TRIMP (published physiology: Banister 1991; Morton et al. 1990), continuous on the
//   reserve, so a walk earns some Strain (Halo's earlier Edwards zones gave nothing below 50 % of the reserve);
// - the map is 5.05 · ln(1 + 0.09 · TRIMP), capped at 21, calibrated by least squares to WHOOP's published member
//   averages (1 h walk 6.5, 1 h run 12.0, 1 h functional fitness 10.1, 90-minute hike 10–11, marathon 20.4, a second
//   marathon 20.6): RMSE 0.69 Strain points (docs/research/whoop-garmin.md §2A W-2, fitted 2026-10-09);
// - a day's load subtracts a waking floor, the load of the person's own typical still heart rate, from every minute
//   outside a workout (as OpenStrap does, code dated 2026-08), so ordinary waking hours don't add up to a hard day.
import type { HrSample } from "./types";

/** Dense gate (≈10 min at 1 Hz). */
export const minReadings = 600;
/** Sparse gate: at least this many samples spanning minSpanSeconds. */
export const minSparseReadings = 20;
export const minSpanSeconds = 600;
export const maxStrain = 100.0;
export const strainScaleMax = 21.0;
export const fallbackSampleMin = 1.0 / 60.0;
export const defaultAge = 30;
export const defaultRestingHR = 60.0;
export const hrmaxMinSamples = 600;
export const hrmaxPercentile = 99.5;

/**
 * Banister's TRIMP weighting, per minute at x = share of heart-rate reserve: x · k · e^(b·x). Published: Banister 1991
 * and Morton et al. 1990 (J Appl Physiol 69:1171), men k 0.64, b 1.92; women k 0.86, b 1.67.
 */
export const banister = {
  male: { k: 0.64, b: 1.92 },
  female: { k: 0.86, b: 1.67 },
} as const;

/**
 * Strain = min(21, scale · ln(1 + rate · TRIMP)). Calibrated 2026-10-09 by least squares to WHOOP's published member
 * averages (WHOOP, "WHOOP Strain Explained", 2026-02-10), with the sessions at 30 % (walk), 75 % (run), 60 %
 * (functional), 55 % (hike) and 80 % (marathon, 230 min) of the reserve: walk 5.3, run 12.5, functional 10.2, hike 11.2,
 * marathon 19.8, a second marathon at the cap.
 */
export const strainMap = { scale: 5.05, rate: 0.09 };

/** Longest span one reading may be credited with, minutes, when it or the next is at 50 % of the reserve or more. */
export const maxSampleGapMin = 2.0;
/**
 * Longest span, minutes, when both a reading and the next are under `restingGapBelowHrr` of the reserve. Calibrated
 * (2026-10-09): Fitbit's off-exercise heart rate in Health Connect comes a few minutes apart, and a 2-minute cap dropped
 * up to 60 % of quiet daytime; exercise-level heart rate is still never stretched across a gap.
 */
export const maxRestingGapMin = 10.0;
export const restingGapBelowHrr = 0.5;

/**
 * The waking floor's ceiling, as a share of the reserve. Inferred from OpenStrap (open-source WHOOP-style Strain,
 * github.com/OpenStrap/analytics, code dated 2026-08), which caps its median waking %HRR at 0.40.
 */
export const wakingFloorCap = 0.4;
/**
 * The floor while there are no still waking minutes to learn it from. Calibrated (2026-10-09): a sedentary adult's still
 * daytime heart rate sits about 10–20 % of the reserve above resting.
 */
export const wakingFloorDefault = 0.15;

/**
 * Muscular load, TRIMP per minute of a strength-type session, by Health Connect exercise type. WHOOP added passive
 * muscular load to Strain in 2026 (The Locker, "How WHOOP measures muscular load", 2026-04-23): estimated from activity
 * type and duration, with no logging. Its rates are unpublished; these are calibrated (2026-10-09) so a 60-minute lift at
 * an average 45 % of the reserve scores about 10.5, in line with WHOOP's published 1 h functional-fitness average of
 * 10.1 (docs/research/whoop-garmin.md C3): lifting and HIIT 0.6, climbing and rowing 0.35, yoga and Pilates 0.25.
 * Health Connect's EXERCISE_CLASS is left out: it says nothing about whether a class was strength.
 */
export const muscularRates: Readonly<Record<string, number>> = {
  STRENGTH_TRAINING: 0.6,
  WEIGHTLIFTING: 0.6,
  CALISTHENICS: 0.6,
  HIGH_INTENSITY_INTERVAL_TRAINING: 0.6,
  BOOT_CAMP: 0.6,
  ROCK_CLIMBING: 0.35,
  ROWING: 0.35,
  ROWING_MACHINE: 0.35,
  PADDLING: 0.35,
  PILATES: 0.25,
  YOGA: 0.25,
};

/** A strength-type session's muscular TRIMP: its minutes × its type's rate; 0 for any other type. */
export const muscularTrimp = (type: string, minutes: number): number => Math.max(0, minutes) * (muscularRates[type] ?? 0);

/** Edwards zones (%HRR threshold, weight), highest first. Only Energy Bank's per-minute load still reads them. */
export const edwardsZones: readonly [number, number][] = [
  [90.0, 5],
  [80.0, 4],
  [70.0, 3],
  [60.0, 2],
  [50.0, 1],
];

/** 0–21 → Effort 0–100 (pre-divided ratio, for bit parity with earlier rows). */
export const effortFromStrainScale = (value: number): number => value * (maxStrain / strainScaleMax);

/** Effort 0–100 → the 0–21 Day Strain axis. */
export const toStrainScale = (effort: number): number => (effort * strainScaleMax) / maxStrain;

const coefficients = (sex: string) => (sex.toLowerCase().startsWith("f") ? banister.female : banister.male);

/** Banister TRIMP per minute at `x` (share of the reserve, 0–1). */
export const banisterRate = (x: number, sex = "male"): number => {
  const c = coefficients(sex);
  return x * c.k * Math.exp(c.b * x);
};

/** Day Strain (0–21, unrounded) of a TRIMP: min(21, 5.05 · ln(1 + 0.09 · TRIMP)); 0 for none. */
export function strainFromTrimp(trimp: number): number {
  if (!(trimp > 0)) return 0.0;
  return Math.min(strainScaleMax, strainMap.scale * Math.log(1.0 + strainMap.rate * trimp));
}

/** The TRIMP a Strain (0–21) stands for: the map run backwards; 21 gives the cap's TRIMP. */
export function trimpForStrain(strain: number): number {
  if (!(strain > 0)) return 0.0;
  return (Math.exp(Math.min(strain, strainScaleMax) / strainMap.scale) - 1.0) / strainMap.rate;
}

/** Effort 0–100 of a TRIMP, rounded to 2 dp as stored. */
export function effortOfTrimp(trimp: number): number {
  const scaled = effortFromStrainScale(strainFromTrimp(trimp)) * 100;
  return Math.round(scaled) / 100;
}

/** The TRIMP a stored Effort (0–100) stands for. Null or ≤ 0 is none. */
export const trimpOfEffort = (effort: number | null | undefined): number =>
  effort == null || !(effort > 0) ? 0.0 : trimpForStrain(toStrainScale(effort));

/** Tanaka (2001): 208 − 0.7 × age. */
export const tanakaHRmax = (age: number): number => 208.0 - 0.7 * age;

export const defaultMaxHR = (age: number = defaultAge): number => 220 - age;

/** Linear-interpolated percentile of a sorted array (numpy-style). */
export function percentile(sortedValues: number[], pct: number): number {
  const n = sortedValues.length;
  if (n === 0) return 0.0;
  if (n === 1) return sortedValues[0];
  const position = (pct / 100.0) * (n - 1);
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, n - 1);
  return sortedValues[lower] + (position - lower) * (sortedValues[upper] - sortedValues[lower]);
}

/**
 * Max HR from heart-rate history: the 99.5th percentile once there are hrmaxMinSamples readings, never below Tanaka's
 * estimate (WHOOP learns max HR from your data starting from an age formula, The Locker "Calculating max heart rate",
 * 2026-04-08; Garmin auto-detects it upward, Forerunner 970 manual 2026). Pass exercise heart rate only, with artefacts
 * dropped (exerciseHrForMax), so a spike outside a workout can't move it.
 */
export function estimateHRmax(
  hrHistory: number[],
  age: number | null,
): { hrmax: number; source: "observed" | "tanaka" | "unknown" } {
  const tanaka = age != null ? tanakaHRmax(age) : null;
  if (hrHistory.length >= hrmaxMinSamples) {
    const observed = percentile([...hrHistory].sort((a, b) => a - b), hrmaxPercentile);
    if (tanaka == null || observed >= tanaka) return { hrmax: observed, source: "observed" };
    return { hrmax: tanaka, source: "tanaka" };
  }
  if (tanaka != null) return { hrmax: tanaka, source: "tanaka" };
  return { hrmax: 0.0, source: "unknown" };
}

/** Below this a reading is noise (noop: 25 bpm). */
export const MIN_PLAUSIBLE_BPM = 25;
export const MAX_PLAUSIBLE_BPM = 240;
/** A jump larger than this within JUMP_WINDOW_S of the last accepted reading is an artefact (noop: 45 bpm in 12 s). */
export const MAX_JUMP_BPM = 45;
export const JUMP_WINDOW_S = 12;

/** The bpm of the readings that pass the artefact rules (plausible range, no impossible jump), time-ordered input. */
export function exerciseHrForMax(hr: readonly HrSample[]): number[] {
  const out: number[] = [];
  let last: HrSample | null = null;
  for (const s of hr) {
    if (!(s.bpm >= MIN_PLAUSIBLE_BPM && s.bpm <= MAX_PLAUSIBLE_BPM)) continue;
    if (last && s.ts - last.ts <= JUMP_WINDOW_S && Math.abs(s.bpm - last.bpm) > MAX_JUMP_BPM) continue;
    out.push(s.bpm);
    last = s;
  }
  return out;
}

/** Karvonen %HRR, clamped to [0, 100]. */
export function pctHRR(bpm: number, restingHR: number, hrReserve: number): number {
  const pct = ((bpm - restingHR) / hrReserve) * 100.0;
  return Math.min(100, Math.max(0, pct));
}

/** Edwards zone weight 0–5 from unclamped %HRR (Energy Bank's per-minute load). */
export function zoneWeight(bpm: number, restingHR: number, hrReserve: number): number {
  const pct = ((bpm - restingHR) / hrReserve) * 100.0;
  for (const [threshold, weight] of edwardsZones) if (pct >= threshold) return weight;
  return 0;
}

/** Live vs stored Effort for a day: the max, so a read-out never drops; two zeros give +0. */
export function effectiveEffort(live: number | null, stored: number | null): number | null {
  if (live == null) return stored;
  if (stored == null) return live;
  if (live === 0 && stored === 0) return 0.0;
  return Math.max(live, stored);
}

/**
 * Each reading covers the gap to the next, clamped to maxSampleGapMin; the last reuses the gap before it. With the
 * reserve, a gap between two readings both under restingGapBelowHrr of it is clamped to maxRestingGapMin instead.
 */
export function sampleDurationsMinutes(hr: HrSample[], restingHR?: number, hrReserve?: number): number[] {
  if (hr.length === 0) return [];
  if (hr.length === 1) return [fallbackSampleMin];
  const quiet = (bpm: number) => restingHR != null && hrReserve != null && hrReserve > 0 && (bpm - restingHR) / hrReserve < restingGapBelowHrr;
  const out: number[] = [];
  for (let i = 0; i < hr.length - 1; i++) {
    const deltaS = Math.abs(hr[i + 1].ts - hr[i].ts);
    const cap = quiet(hr[i].bpm) && quiet(hr[i + 1].bpm) ? maxRestingGapMin : maxSampleGapMin;
    out.push(Math.min(deltaS > 0 ? deltaS / 60.0 : fallbackSampleMin, cap));
  }
  out.push(out[out.length - 1]);
  return out;
}

/** A waking floor: its share of the reserve, and which readings it spares (those inside a workout). */
export type WakingFloor = { x: number; exempt?: (ts: number) => boolean };

/**
 * Banister TRIMP: Σ rate(x) × minutes. With a floor, each reading outside the floor's exempt spans adds only what its
 * rate is above the floor's, never less than 0.
 */
export function banisterTRIMP(
  hr: HrSample[],
  restingHR: number,
  hrReserve: number,
  durations: number[],
  sex = "male",
  floor: WakingFloor | null = null,
): number {
  const floorRate = floor ? banisterRate(Math.min(Math.max(floor.x, 0), 1), sex) : 0.0;
  let acc = 0.0;
  for (let i = 0; i < hr.length; i++) {
    const x = pctHRR(hr[i].bpm, restingHR, hrReserve) / 100.0;
    if (x <= 0) continue;
    const f = floor && !floor.exempt?.(hr[i].ts) ? floorRate : 0.0;
    acc += durations[i] * Math.max(banisterRate(x, sex) - f, 0.0);
  }
  return acc;
}

/** Enough heart rate to score: minReadings, or minSparseReadings spanning minSpanSeconds. */
export function enoughHr(hr: HrSample[]): boolean {
  if (hr.length >= minReadings) return true;
  if (hr.length < minSparseReadings) return false;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of hr) {
    lo = Math.min(lo, s.ts);
    hi = Math.max(hi, s.ts);
  }
  return hi - lo >= minSpanSeconds;
}

export type StrainOptions = {
  sex?: string;
  /** The waking floor (Day Strain); none for an activity. */
  floor?: WakingFloor | null;
  /** Muscular TRIMP added before the map. */
  extraTrimp?: number;
};

/**
 * The cardiovascular TRIMP of a time-ordered HR series (with the floor, if any), or null when there is too little data
 * (fewer than minReadings and not minSparseReadings spanning minSpanSeconds) or maxHR ≤ restingHR.
 */
export function cardioTrimp(hr: HrSample[], maxHR: number | null = null, restingHR: number = defaultRestingHR, opts: StrainOptions = {}): number | null {
  const effMax = maxHR ?? defaultMaxHR();
  if (!enoughHr(hr) || effMax <= restingHR) return null;
  const hrReserve = effMax - restingHR;
  return banisterTRIMP(hr, restingHR, hrReserve, sampleDurationsMinutes(hr, restingHR, hrReserve), opts.sex ?? "male", opts.floor ?? null);
}

/**
 * Effort 0–100 from a time-ordered HR series: its TRIMP (cardioTrimp) plus `extraTrimp`, through the log map. Null when
 * there is too little data or maxHR ≤ restingHR.
 */
export function strain(hr: HrSample[], maxHR: number | null = null, restingHR: number = defaultRestingHR, opts: StrainOptions = {}): number | null {
  const t = cardioTrimp(hr, maxHR, restingHR, opts);
  return t == null ? null : effortOfTrimp(t + (opts.extraTrimp ?? 0));
}
