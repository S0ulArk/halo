// Day Strain as it builds through a day, for the chart explorer's Strain day view. It is the day's stored Strain run
// minute by minute, on the same inputs and the same math (src/pipeline/stage1.ts, core/scoring/strain.ts): the day's raw
// heart-rate samples, each credited at its Banister rate for the gap to the next reading (at most 2 minutes, or 10
// between two quiet readings under half the reserve; the last reusing the gap before it), less the day's waking floor
// outside workouts; a strength-type workout's muscular load counts once it ends. The running TRIMP goes through Live
// Workout's strainOfTrimp (src/live/liveStrain.ts), the same log map onto 0–21 with the stored Effort's rounding. The
// heart-rate TRIMP is summed in the same order as stage 1 sums it, so the last point is exactly the day's Strain.
import { banisterRate, pctHRR, sampleDurationsMinutes, wakingFloorDefault } from "@/core/scoring/strain";
import type { HrSample } from "@/core/scoring/types";
import { strainOfTrimp } from "@/live/liveStrain";

/** What the day's stored Strain was scored with (stage 1's row: `Stage1Day`). */
export type StrainInputs = { effort: number | null; restingHr: number; maxHr: number; lastHrTs: number | null; floorHrr?: number };

/** A workout touching the day: its span (unix seconds, inclusive, as stage 1 reads it) and its muscular TRIMP. */
export type StrainWorkout = { start: number; end: number; muscularTrimp?: number };

/** A running Day Strain: x minutes from the day's start, y the Strain (0–21) of every reading before that minute. */
export type StrainCurve = { xs: number[]; ys: number[] };

const EMPTY: StrainCurve = { xs: [], ys: [] };

/**
 * Day Strain at each whole minute of [start, end) (unix seconds), from the minute of the first reading. The value at
 * minute m counts the readings before `start + 60·m` and the muscular load of the workouts ended by then; the curve runs
 * to the end of the day, or (`toLast`, today) to the minute after the last reading, so its last point counts every
 * reading. Only the readings stage 1 scored count (up to the row's last one): heart rate synced since then waits for the
 * next scoring run, as the stored Strain does. A day without a Strain (too little heart rate, or none) has no curve.
 * `sex` picks Banister's weighting, as the profile did for the stored Strain.
 */
export function strainCurve(
  hr: readonly HrSample[],
  s1: StrainInputs | null,
  start: number,
  end: number,
  toLast = false,
  workouts: readonly StrainWorkout[] = [],
  sex = "male",
): StrainCurve {
  if (!s1 || s1.effort == null) return EMPTY;
  const reserve = s1.maxHr - s1.restingHr;
  if (!(reserve > 0)) return EMPTY;
  // Stage 1's samples: the day's [start, end), up to the last one it scored.
  let n = 0;
  while (n < hr.length && hr[n].ts < end && (s1.lastHrTs == null || hr[n].ts <= s1.lastHrTs)) n++;
  let first = 0;
  while (first < n && hr[first].ts < start) first++;
  const samples = hr.slice(first, n);
  if (!samples.length) return EMPTY;
  const durations = sampleDurationsMinutes(samples, s1.restingHr, reserve);
  const floorRate = banisterRate(s1.floorHrr ?? wakingFloorDefault, sex);
  const credit = (i: number) => {
    const s = samples[i];
    const x = pctHRR(s.bpm, s1.restingHr, reserve) / 100;
    if (x <= 0) return 0;
    const exempt = workouts.some((w) => s.ts >= w.start && s.ts <= w.end);
    return durations[i] * Math.max(banisterRate(x, sex) - (exempt ? 0 : floorRate), 0);
  };
  /** The muscular TRIMP of the workouts ended before `t`, summed in their order (stage 1's). */
  const muscularBefore = (t: number) => workouts.reduce((a, w) => a + (w.end < t ? (w.muscularTrimp ?? 0) : 0), 0);
  const dayMinutes = Math.round((end - start) / 60);
  const firstMinute = Math.max(0, Math.floor((samples[0].ts - start) / 60));
  const lastMinute = toLast ? Math.min(dayMinutes, Math.floor((samples[samples.length - 1].ts - start) / 60) + 1) : dayMinutes;
  const xs: number[] = [];
  const ys: number[] = [];
  let trimp = 0;
  let i = 0;
  for (let m = firstMinute; m <= lastMinute; m++) {
    const t = start + m * 60;
    while (i < samples.length && samples[i].ts < t) trimp += credit(i++);
    xs.push(m);
    ys.push(strainOfTrimp(trimp + muscularBefore(t)));
  }
  // Every reading and every workout's muscular load count by the last point (the last minute is past the last reading;
  // this only guards the bounds).
  for (; i < samples.length; i++) trimp += credit(i);
  ys[ys.length - 1] = strainOfTrimp(trimp + muscularBefore(Infinity));
  return { xs, ys };
}
