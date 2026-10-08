// Ports ReadinessEngine.kt (HRV / RHR / resp z-signals, ACWR, Foster monotony → a level) and the
// evaluateWithTrainingLoad wrapper from ReadinessTrainingLoad.kt. Not ported: the memo cache and copy ids. Since version
// 18 the load is Garmin's (Halo's own implementation of its published model): a linear daily load (Strain's TRIMP, not
// the log-compressed Effort), a 10-day decaying acute load normalised to 7 days, a chronic load that is the 28-day mean
// of the acute one, and Garmin's 2026 ratio bands.
import { foldHistory, isUsable, readinessHRVLnCfg, restingHRCfg } from "./baselines";
import { readiness as readinessConfidence } from "./confidence";
import { evaluate as evaluateTrainingLoad, standardConfig, type TrainingLoadConfig, type TrainingLoadResult } from "./trainingLoad";
import type { MetricCfg, ScoreConfidence } from "./types";

/** One DailyMetric row's readiness fields. `load` is the day's linear load (Strain's TRIMP); `effort` is Effort 0–100. */
export interface ReadinessDay {
  day: string;
  hrv?: number | null;
  rhr?: number | null;
  resp?: number | null;
  effort?: number | null;
  /** The day's training load, Banister TRIMP (stage 1's `trimp`); null on a day without one. */
  load?: number | null;
}

export type ReadinessLevel = "primed" | "balanced" | "strained" | "rundown" | "insufficient";
export type ReadinessFlag = "good" | "neutral" | "watch" | "bad";
export type ReadinessSignalKey = "hrv" | "rhr" | "respRate" | "acwr" | "monotony";
export type ReadinessDetail =
  | "HRV_GOOD" | "HRV_WATCH" | "HRV_BAD"
  | "RHR_GOOD" | "RHR_WATCH" | "RHR_BAD"
  | "RESP_WATCH" | "RESP_BAD"
  | "NORMAL_RANGE"
  | AcwrBand
  | "MONOTONY_WATCH";

export type ReadinessEvidence =
  | { kind: "metricVsBaseline"; value: number; baseline: number; decimals: number; unit: "ms" | "bpm" | "rpm" }
  | { kind: "monotony"; value: number }
  | { kind: "trainingLoad"; acute: number; chronic: number };

export interface ReadinessSignal {
  key: ReadinessSignalKey;
  flag: ReadinessFlag;
  detail: ReadinessDetail;
  evidence: ReadinessEvidence | null;
}

export interface Readiness {
  level: ReadinessLevel;
  signals: ReadinessSignal[];
  /** Acute:chronic load ratio (Garmin's Load Ratio), or null without enough load history. */
  acwr: number | null;
  /** Garmin-style acute load (acuteLoad), or null. */
  acute: number | null;
  /** Garmin-style chronic load (the 28-day mean of the acute load), or null. */
  chronic: number | null;
  /** Foster monotony over the last week, or null. */
  monotony: number | null;
  confidence: ScoreConfidence;
}

export const baselineWindow = 30;
export const minBaseline = 7;
/** Foster monotony's window, days. */
export const acuteWindow = 7;
/**
 * Garmin's acute load: each day's load counts in full, then "gradually expires during the next 10 days", normalised to a
 * 7-day window (published: Garmin, "Training Load", running-science pages, accessed 2026-10). The linear weights are
 * inferred from Garmin's numbers (Garmin Forums acute-load threads, ~2022–2026, within about ±2): ATL = (7 / 5.5) ×
 * Σᵢ₌₀..₉ (1 − 0.1·i) · L(d − i).
 */
export const acuteDays = 10;
/** The acute load needs this many of its 10 days with a load (guess, report C7); missing days renormalise the weights. */
export const minAcuteDays = 7;
/** The chronic load: the mean of the last 28 acute loads (inferred: Garmin's 4-week chronic load); needs minChronic of them. */
export const chronicWindow = 28;
export const minChronic = 14;
export const respZWatch = 1.5;
export const respZBad = 2.0;
/** SleepStager.respPlausibleRangeBpm, inclusive. */
export const respPlausibleRange = { min: 8.0, max: 25.0 };
export const monotonyWatch = 2.0;

const inResp = (v: number) => v >= respPlausibleRange.min && v <= respPlausibleRange.max;

export const mean = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Sample SD (n − 1); null for fewer than 2 points. */
export function sampleSD(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs) as number;
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (xs.length - 1));
}

const pick = (rows: ReadinessDay[], f: (d: ReadinessDay) => number | null | undefined): number[] =>
  rows.map(f).filter((v): v is number => v != null);

function zSignal(
  value: number | null | undefined,
  baseline: number[],
  key: "hrv" | "rhr",
  unit: "ms" | "bpm",
  higherIsBetter: boolean,
  cfg: MetricCfg,
  logDomain: boolean,
): ReadinessSignal | null {
  if (value == null || baseline.length < minBaseline) return null;
  // HRV is z-scored on lnRMSSD; the trailing window re-folds with hard-outlier rejection off.
  const tv = logDomain ? Math.log(Math.max(value, 1.0)) : value;
  const tb = logDomain ? baseline.map((b) => Math.log(Math.max(b, 1.0))) : baseline;
  const state = foldHistory(tb, cfg, false);
  if (!isUsable(state)) return null;
  const sigma = Math.max(1.253 * state.spread, 1e-9);
  if (sigma <= 0) return null;
  const m = state.baseline;
  const z = (higherIsBetter ? tv - m : m - tv) / sigma;
  const prefix = key === "hrv" ? "HRV" : "RHR";
  let flag: ReadinessFlag;
  let detail: ReadinessDetail;
  if (z >= 0.5) [flag, detail] = ["good", `${prefix}_GOOD`];
  else if (z >= -0.5) [flag, detail] = ["neutral", "NORMAL_RANGE"];
  else if (z >= -1.0) [flag, detail] = ["watch", `${prefix}_WATCH`];
  else [flag, detail] = ["bad", `${prefix}_BAD`];
  const evidence: ReadinessEvidence = { kind: "metricVsBaseline", value, baseline: logDomain ? Math.exp(m) : m, decimals: 0, unit };
  return { key, flag, detail, evidence };
}

export type AcwrBand = "LOAD_RAMPING_DOWN" | "LOAD_SWEET_SPOT" | "LOAD_BUILDING_FAST" | "LOAD_SPIKING";

/**
 * The one load-ratio banding, Garmin's (published: Forerunner 970 owner's manual, build 2026-09-28): Low < 0.8, Optimal
 * 0.8–1.4, High 1.5–1.9, Very High ≥ 2.0; so < 0.8 ramping down, [0.8, 1.5) sweet spot, [1.5, 2.0) building fast,
 * ≥ 2.0 spiking. Readiness, Reports and Fitness all band through this, so an edge reads the same everywhere.
 */
export function acwrBand(ratio: number): AcwrBand {
  if (ratio < 0.8) return "LOAD_RAMPING_DOWN";
  if (ratio < 1.5) return "LOAD_SWEET_SPOT";
  if (ratio < 2.0) return "LOAD_BUILDING_FAST";
  return "LOAD_SPIKING";
}

/**
 * The acute load on `day` from loads by day: 7 × the weighted mean load over the 10 days to `day`, weights 1, 0.9 … 0.1
 * (the same as (7 / 5.5) × Σ weight × load with all ten present); missing days are left out and the weights renormalised.
 * Null with fewer than minAcuteDays of the 10.
 */
export function acuteLoad(loadOf: (day: string) => number | null | undefined, day: string): number | null {
  let sum = 0;
  let weights = 0;
  let n = 0;
  for (let i = 0; i < acuteDays; i++) {
    const l = loadOf(shiftDay(day, -i));
    if (l == null) continue;
    const w = 1 - 0.1 * i;
    sum += w * l;
    weights += w;
    n++;
  }
  return n < minAcuteDays ? null : (7 * sum) / weights;
}

/** The chronic load on `day`: the mean of the acute loads over the 28 days to it; null with fewer than minChronic. */
export function chronicLoad(acuteOf: (day: string) => number | null, day: string): number | null {
  const xs: number[] = [];
  for (let i = 0; i < chronicWindow; i++) {
    const a = acuteOf(shiftDay(day, -i));
    if (a != null) xs.push(a);
  }
  return xs.length < minChronic ? null : (mean(xs) as number);
}

const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const ACWR_FLAG: Record<AcwrBand, ReadinessFlag> = { LOAD_RAMPING_DOWN: "watch", LOAD_SWEET_SPOT: "good", LOAD_BUILDING_FAST: "watch", LOAD_SPIKING: "bad" };

export function acwrSignal(ratio: number, acute: number, chronic: number): ReadinessSignal {
  const detail = acwrBand(ratio);
  return { key: "acwr", flag: ACWR_FLAG[detail], detail, evidence: { kind: "trainingLoad", acute, chronic } };
}

function synthesize(signals: ReadinessSignal[], hasHistory: boolean): ReadinessLevel {
  if (!hasHistory || signals.length === 0) return "insufficient";
  const bad = signals.filter((s) => s.flag === "bad").length;
  const watch = signals.filter((s) => s.flag === "watch").length;
  const good = signals.filter((s) => s.flag === "good").length;
  const recoveryDown = signals.some((s) => (s.key === "hrv" || s.key === "rhr" || s.key === "respRate") && s.flag === "bad");
  const loadHigh = signals.some((s) => s.key === "acwr" && s.flag === "bad");
  if (bad >= 2 || (recoveryDown && loadHigh)) return "rundown";
  if (recoveryDown || loadHigh || bad >= 1) return "strained";
  if (good >= 2 && watch === 0) return "primed";
  return "balanced";
}

/**
 * Readiness from daily rows in any order. "Today" is the row for `today` when given (none → insufficient),
 * else the newest row. The load ratio and monotony read the rows up to today.
 */
export function evaluate(days: ReadinessDay[], today: string | null = null): Readiness {
  const sorted = [...days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const latest = today != null ? sorted.find((d) => d.day === today) : sorted.at(-1);
  if (!latest) return { level: "insufficient", signals: [], acwr: null, acute: null, chronic: null, monotony: null, confidence: "calibrating" };
  const history = sorted.filter((d) => d.day < latest.day);
  const recent = history.slice(-baselineWindow);
  const signals: ReadinessSignal[] = [];

  const hrv = zSignal(latest.hrv, pick(recent, (d) => d.hrv), "hrv", "ms", true, readinessHRVLnCfg, true);
  if (hrv) signals.push(hrv);
  const rhr = zSignal(latest.rhr, pick(recent, (d) => d.rhr), "rhr", "bpm", false, restingHRCfg, false);
  if (rhr) signals.push(rhr);

  const rr = latest.resp;
  if (rr != null && inResp(rr)) {
    const base = pick(recent, (d) => d.resp);
    const m = mean(base);
    const sd = sampleSD(base);
    if (base.length >= minBaseline && m != null && inResp(m) && sd != null && sd > 0) {
      const z = (rr - m) / sd;
      const evidence: ReadinessEvidence = { kind: "metricVsBaseline", value: rr, baseline: m, decimals: 1, unit: "rpm" };
      if (z >= respZBad) signals.push({ key: "respRate", flag: "bad", detail: "RESP_BAD", evidence });
      else if (z >= respZWatch) signals.push({ key: "respRate", flag: "watch", detail: "RESP_WATCH", evidence });
    }
  }

  // Garmin-style acute and chronic load on the daily load (rows up to `latest`; a row after it never counts).
  const loadBy = new Map(sorted.filter((d) => d.day <= latest.day).map((d) => [d.day, d.load ?? null]));
  const acuteMemo = new Map<string, number | null>();
  const acuteOf = (day: string) => {
    if (!acuteMemo.has(day)) acuteMemo.set(day, acuteLoad((x) => loadBy.get(x), day));
    return acuteMemo.get(day)!;
  };
  const acute = acuteOf(latest.day);
  const chronic = acute == null ? null : chronicLoad(acuteOf, latest.day);
  let acwr: number | null = null;
  let monotony: number | null = null;
  if (acute != null && chronic != null && chronic > 0) {
    acwr = acute / chronic;
    signals.push(acwrSignal(acwr, acute, chronic));
  }
  // Foster monotony over the last 7 days' load.
  const week = Array.from({ length: acuteWindow }, (_, i) => loadBy.get(shiftDay(latest.day, -i))).filter((v): v is number => v != null);
  const sd = sampleSD(week);
  const m = mean(week);
  if (week.length >= 4 && sd != null && sd > 0 && m != null) {
    monotony = m / sd;
    if (monotony >= monotonyWatch) {
      signals.push({ key: "monotony", flag: "watch", detail: "MONOTONY_WATCH", evidence: { kind: "monotony", value: monotony } });
    }
  }

  const level = synthesize(signals, history.length > 0 || acwr != null);
  const confidence = readinessConfidence(level !== "insufficient", pick(recent, (d) => d.hrv).length, baselineWindow);
  return { level, signals, acwr, acute, chronic, monotony, confidence };
}

/** Readiness plus CTL/ATL/TSB over the same rows; training load never feeds the readiness level. */
export function evaluateWithTrainingLoad(
  days: ReadinessDay[],
  today: string | null = null,
  config: TrainingLoadConfig = standardConfig,
): { readiness: Readiness; trainingLoad: TrainingLoadResult } {
  return {
    readiness: evaluate(days, today),
    // Fitness, fatigue and form as EWMAs of the linear daily load (version 18; Effort before).
    trainingLoad: evaluateTrainingLoad(
      days.map((d) => ({ day: d.day, load: d.load ?? null })),
      today,
      config,
    ),
  };
}
