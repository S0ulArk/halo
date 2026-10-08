// Daily extras Health Connect doesn't carry, derived from the band's heart rate and steps: Fitbit's Active Zone
// Minutes, its active / light / sedentary minutes and the day's average heart rate. Pure: the sync calls it once per
// local day with what it just read (sync.ts), and the tests feed it hand-built minute arrays. The demo seed writes its
// own values for these keys, so the pipeline never touches them.
//
// The approximation. Fitbit's own rules run on METs from the accelerometer, which Health Connect doesn't expose, so
// steps per minute and the minute's mean heart rate stand in:
//   • Active Zone Minutes: per minute with heart rate, 1 minute in Fitbit's fat burn (moderate) zone, 40–59 % of
//     heart-rate reserve, and 2 minutes in its cardio and peak zones, 60 % of reserve and above. Fitbit sets its zones
//     on heart-rate reserve, resting + share × (max − resting) (Google Health Help, "Track your heart rate with your
//     Pixel Watch or Fitbit device"), not on a share of max HR: on max HR alone, an unfit person with a resting HR of
//     78 earned zone minutes from 95 bpm, a slow walk. Max HR is the profile's (own or Tanaka), as everywhere in
//     Pulse (Fitbit's own is 220 − age); resting HR is the day's (restingHrOn).
//   • Active minutes (moderate + vigorous): a minute is active with 60 steps or more, or a mean HR in the fat burn zone
//     or above; it counts only inside a bout of 10 or more consecutive active minutes (Fitbit awards active minutes after
//     10 minutes of continuous moderate-to-intense activity). The minutes of a shorter bout count as light instead.
//   • Light minutes: 1–59 steps in the minute, or HR at 30 % of heart-rate reserve or above (ACSM's "light" floor,
//     Garber 2011 Table 2: 30–39 % HRR), when the minute is not active. On 40 % of max HR (the old rule) a still minute
//     at 76 bpm was already light, so for anyone resting near 76 bpm almost no awake minute was ever sedentary.
//   • Sedentary minutes: minutes with heart rate (the band on) outside sleep sessions and workouts, with no steps
//     and HR below 30 % of reserve. Minutes without heart rate are never sedentary (Fitbit counts sedentary time only
//     while worn), so today's remaining minutes don't count either.
// Steps per minute are the day's largest source's (sync.ts, largestSourceSteps), not the max across sources: a phone
// that writes an hour's steps as one record spreads them over every minute of the hour, which made each one light.
//   • Average heart rate: the mean of the day's samples, 1 dp.
// A day without heart rate gets active and light minutes from its steps alone (a phone counts those too); the three
// heart-rate values need heart rate. A day with neither gets nothing.
import { minuteMeanHr } from "@/core/algorithms/stress";
import { defaultRestingHR } from "@/core/scoring/strain";
import { MODERATE_FROM_HRR } from "@/pipeline/intensity";
import type { HrSample, StepsMinute } from "@/data/types";

export type Interval = { startTs: number; endTs: number };

export type DeriveInput = {
  /** Local midnight that starts the day and the next one, unix seconds: minute m is [start + 60m, start + 60m + 60). */
  start: number;
  end: number;
  /** The day's samples, and its largest source's steps per minute; anything outside [start, end) is ignored. */
  hr: HrSample[];
  steps: StepsMinute[];
  maxHr: number;
  /** The day's resting HR, bpm (restingHrOn): the bottom of the heart-rate reserve Fitbit's zones sit on. */
  restingHr: number;
  /** Sleep sessions (main and naps) and workouts touching the day: their minutes are never sedentary. */
  sleep: Interval[];
  exercises: Interval[];
};

/** The `daily_values` keys written (src/queries/_lib.ts EXTRA_METRICS), in this order. */
export const DERIVED_KEYS = ["active_minutes", "light_minutes", "azm", "sedentary_minutes", "avg_hr"] as const;
export type DerivedKey = (typeof DERIVED_KEYS)[number];
export type DerivedValue = { key: DerivedKey; value: number };

/** Share of heart-rate reserve where Fitbit's fat burn zone (1 AZM/min) and cardio zone (2 AZM/min) start. */
export const FAT_BURN_FROM = MODERATE_FROM_HRR;
export const CARDIO_FROM = 0.6;
/** Share of heart-rate reserve from which a still minute is light rather than sedentary (ACSM's light floor). */
export const LIGHT_FROM = 0.3;
/** Days a resting HR reading still stands for a day without one. */
export const RESTING_HR_CARRY_DAYS = 30;
/** Steps in a minute that make it active (a brisk walk) rather than light. */
export const ACTIVE_STEPS = 60;
/** Fitbit's bout rule: active minutes count after this many in a row. */
export const BOUT_MIN = 10;

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * The resting HR for `day`: its own reading, else the newest one in the RESTING_HR_CARRY_DAYS before it (resting HR
 * moves slowly, and Fitbit sets zones on your typical resting HR), else Strain's default of 60 bpm. `readings` are
 * `[yyyy-MM-dd, bpm]` in any order; of several for one day, the last in the list wins.
 */
export function restingHrOn(day: string, readings: readonly (readonly [string, number])[]): number {
  const oldest = new Date(Date.parse(`${day}T00:00:00Z`) - RESTING_HR_CARRY_DAYS * 86_400_000).toISOString().slice(0, 10);
  let best: readonly [string, number] | null = null;
  for (const r of readings) if (r[0] <= day && r[0] >= oldest && r[1] > 0 && (!best || r[0] >= best[0])) best = r;
  return best ? best[1] : defaultRestingHR;
}

export function deriveDayExtras(input: DeriveInput): DerivedValue[] {
  const { start, end, maxHr, restingHr } = input;
  // As zones.ts: a reserve under 1 bpm (bad profile data) is treated as 1.
  const reserve = Math.max(1, maxHr - restingHr);
  const means = minuteMeanHr(input.hr, start, end);
  const n = means.length;
  const steps = new Array<number>(n).fill(0);
  for (const s of input.steps) {
    const m = Math.floor((s.ts - start) / 60);
    if (m >= 0 && m < n && s.v > 0) steps[m] += s.v;
  }
  const hasHr = means.some((v) => v != null);
  const hasSteps = steps.some((v) => v > 0);
  if (!hasHr && !hasSteps) return [];

  // Minute m overlaps [s, e) when start + 60m < e and start + 60m + 60 > s (as the Stress Monitor masks them).
  const blocked = new Uint8Array(n);
  for (const { startTs: s, endTs: e } of [...input.sleep, ...input.exercises]) {
    for (let m = Math.max(0, Math.floor((s - start) / 60)); m < Math.min(n, Math.ceil((e - start) / 60)); m++) blocked[m] = 1;
  }

  let azm = 0;
  let active = 0;
  let light = 0;
  let sedentary = 0;
  let bout = 0;
  const closeBout = () => {
    if (bout >= BOUT_MIN) active += bout;
    else light += bout;
    bout = 0;
  };
  for (let m = 0; m < n; m++) {
    const bpm = means[m];
    /** Share of heart-rate reserve: Fitbit's zones and the light / sedentary split. */
    const hrr = bpm == null ? null : (bpm - restingHr) / reserve;
    const s = steps[m];
    if (hrr != null) azm += hrr >= CARDIO_FROM ? 2 : hrr >= FAT_BURN_FROM ? 1 : 0;
    if (s >= ACTIVE_STEPS || (hrr != null && hrr >= FAT_BURN_FROM)) {
      bout++;
      continue;
    }
    closeBout();
    if (s > 0 || (hrr != null && hrr >= LIGHT_FROM)) light++;
    else if (hrr != null && !blocked[m]) sedentary++; // no steps and HR under 30 % of reserve, awake and not working out
  }
  closeBout();

  const out: DerivedValue[] = [
    { key: "active_minutes", value: active },
    { key: "light_minutes", value: light },
  ];
  if (hasHr) {
    let sum = 0;
    let count = 0;
    for (const s of input.hr) {
      if (s.ts < start || s.ts >= end) continue;
      sum += s.bpm;
      count++;
    }
    out.push({ key: "azm", value: azm }, { key: "sedentary_minutes", value: sedentary }, { key: "avg_hr", value: round1(sum / count) });
  }
  return out;
}
