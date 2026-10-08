// Energy Bank: a 5–100 energy reserve that runs around the clock, Halo's own implementation of Garmin's published Body
// Battery structure (Garmin health-science pages, "Body Battery", accessed 2026-10; Forerunner 970 manual, 2026; patent
// US20200215299, sleep pressure). Sleep charges it, in proportion to how restful the night was; awake it drains with
// activity, with stress and a steady sleep pressure, and calm still minutes give a little back. Each day carries on from
// the level the day before ended at (since version 18; before, each morning restarted from Recovery and sleep). Garmin's
// rates are unpublished: the ones here are a guess calibrated to the report's targets (docs/research/whoop-garmin.md
// G-9 and C9, 2026-10-09): a full night of normal sleep +65, an hour's stress or hard run −15 to −25; the sleep pressure
// is calibrated so a typical day spends about what a night restores.
import { banisterRate } from "../scoring/strain";
import type { Interval } from "./stress";

export const energyBankConfig = {
  /** The reserve's range (published: Body Battery runs 5–100). */
  min: 5,
  max: 100,
  /** The first day's level at wake, with nothing to carry on from: 0.6 × Recovery + 0.4 × Sleep Performance (Halo's earlier start). */
  wRecovery: 0.6,
  wSleep: 0.4,
  /** A night of the person's sleep need at typical stages and baseline HRV charges this much (guess, report C9). */
  sleepNormalCharge: 65,
  /** The stage weights' average over a typical night (calibrated: light 55 %, deep 15 %, REM 22 %, awake 8 %). */
  typicalStageWeight: 0.93,
  /** Charge per asleep minute by stage, relative (guess, report G-9): deep sleep restores most, an awake minute nothing. */
  stageWeight: { deep: 1.2, rem: 0.9, light: 1.0, awake: 0 } as Record<string, number>,
  /** Night quality q = clamp(0.6 + 0.4 × last night's HRV / baseline, 0.5, 1.3) (guess, report G-9). */
  qBase: 0.6,
  qPerRatio: 0.4,
  qRange: [0.5, 1.3] as readonly [number, number],
  /**
   * Halo's Stress Monitor (0–3) on Garmin's 0–100 stress scale: s = stress × 100 / 3. Garmin counts under 25 as rest
   * (published); a still minute under it charges (25 − s) / 25 × 2.5 an hour, one over it drains (s − 25) / 75 × 9 an hour
   * (guess, report G-9).
   */
  restBelow: 25,
  calmChargePerHour: 2.5,
  stressDrainPerHour: 9,
  /**
   * Sleep pressure: every awake minute drains this an hour. Calibrated 2026-10-09 on the demo seed: the report's guess of
   * 0.8 left almost every morning at 100, because Halo's still daytime minutes mostly read as rest on its Stress scale and
   * charge; 3.0 wakes at about 90 on average after a good night and ends the day near 35. Garmin's patent drains
   * 100 / (1440 − need) a minute (about 6 an hour) but has no calm charge (US20200215299, published 2020).
   */
  pressurePerHour: 3.0,
  /** Activity drains this per TRIMP (guess, report C9): an hour's hard run of about 120 TRIMP takes about 20. */
  drainPerTrimp: 0.17,
  /** A stress value holds across this many minutes without one (calibrated: Fitbit's still heart rate is sparse). */
  holdStressMin: 10,
  /** Drain minutes this close together join one episode. */
  episodeGapMin: 5,
};

/** Garmin's Body Battery bands (published): 5–25 very low, 26–50 low, 51–75 medium, 76–100 high. */
export type EnergyBand = "very_low" | "low" | "medium" | "high";
export const energyBand = (level: number): EnergyBand => (level > 75 ? "high" : level > 50 ? "medium" : level > 25 ? "low" : "very_low");

/** Night quality from last night's HRV against its baseline: clamp(0.6 + 0.4 × ratio, 0.5, 1.3); 1 without either. */
export function nightQuality(hrv: number | null, baseline: number | null): number {
  const c = energyBankConfig;
  if (hrv == null || baseline == null || !(baseline > 0)) return 1;
  return Math.min(c.qRange[1], Math.max(c.qRange[0], c.qBase + (c.qPerRatio * hrv) / baseline));
}

/**
 * Each minute's training load (Banister TRIMP for one minute at its mean heart rate), less the waking floor's outside a
 * workout (`exempt`), as Day Strain counts it (strain.ts); null without heart rate.
 */
export function minuteTrimp(
  meanHr: (number | null)[],
  restingHR: number,
  maxHR: number,
  sex: string,
  floorX: number,
  exempt: (m: number) => boolean = () => false,
): (number | null)[] {
  const reserve = Math.max(1, maxHR - restingHR);
  const floor = banisterRate(floorX, sex);
  return meanHr.map((bpm, m) => {
    if (bpm == null) return null;
    const x = Math.min(1, Math.max(0, (bpm - restingHR) / reserve));
    return Math.max(0, banisterRate(x, sex) - (exempt(m) ? 0 : floor));
  });
}

export interface EnergyBankInput {
  /** Local midnight that starts the minute grid, unix seconds (the same grid as stress()). */
  start: number;
  /** Where the curve starts, unix seconds: the grid's start when carrying on from yesterday, else the wake time. */
  from: number;
  /** Last moment to compute, unix seconds. */
  until: number;
  /** The level at `from`. */
  startLevel: number;
  /** The person's sleep need, hours: a night of it at typical stages charges sleepNormalCharge. */
  needHours: number;
  /** Per minute, the asleep charge weight (stage weight × night quality); 0 or absent when awake. */
  asleep: (number | null)[];
  /** Per minute, the training load (minuteTrimp). */
  load: (number | null)[];
  /** stress().minutes. */
  stress: (number | null)[];
  /** Workouts, so a load inside one is labelled with its name. */
  workouts?: (Interval & { label: string })[];
}

export interface Drain {
  /** The workout's label, "Activity" for load outside workouts, or "Stress". */
  label: string;
  kind: "workout" | "activity" | "stress";
  /** Unix seconds, [start, end). */
  start: number;
  end: number;
  /** Energy points drained. */
  amount: number;
}

export interface EnergyBankResult {
  /** Level at the end of each grid minute from `from` to `until`; null outside that span. */
  curve: (number | null)[];
  /** The last computed level. */
  current: number;
  /** Points gained (asleep and calm), and lost (negative), before the 5–100 clamp. */
  charged: number;
  drained: number;
  /** The three biggest drain episodes, largest first. Sleep pressure is not listed. */
  topDrains: Drain[];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function energyBank(input: EnergyBankInput): EnergyBankResult {
  const c = energyBankConfig;
  const { start, load, stress, asleep } = input;
  const n = Math.max(load.length, stress.length, asleep.length);
  const minuteOf = (ts: number) => clamp(Math.floor((ts - start) / 60), 0, n);
  const inAny = <T extends Interval>(ts: number, xs: T[] = []) => xs.find((x) => ts < x.end && ts + 60 > x.start);
  const sleepRate = c.sleepNormalCharge / (Math.max(input.needHours, 1) * 60 * c.typicalStageWeight);

  const curve: (number | null)[] = new Array(n).fill(null);
  const open = new Map<string, Drain>();
  const episodes: Drain[] = [];
  const drain = (label: string, kind: Drain["kind"], ts: number, amount: number) => {
    const ep = open.get(label);
    if (ep && ts - ep.end <= c.episodeGapMin * 60) {
      ep.end = ts + 60;
      ep.amount += amount;
      return;
    }
    const next = { label, kind, start: ts, end: ts + 60, amount };
    open.set(label, next);
    episodes.push(next);
  };

  let level = clamp(input.startLevel, c.min, c.max);
  let charged = 0;
  let drained = 0;
  let held: { value: number; at: number } | null = null;
  const until = Math.min(n, Math.ceil((input.until - start) / 60));
  for (let m = minuteOf(input.from); m < until; m++) {
    const ts = start + m * 60;
    let delta = 0;
    const w = asleep[m] ?? 0;
    if (w > 0) {
      delta += sleepRate * w;
      held = null;
    } else {
      delta -= c.pressurePerHour / 60;
      const l = load[m] ?? 0;
      if (l > 0) {
        const workout = inAny(ts, input.workouts);
        drain(workout ? workout.label : "Activity", workout ? "workout" : "activity", ts, c.drainPerTrimp * l);
        delta -= c.drainPerTrimp * l;
      }
      // A minute's stress, or the last one within holdStressMin while still (no activity load).
      const sNow = stress[m];
      if (sNow != null) held = { value: sNow, at: m };
      const st = sNow ?? (held && m - held.at <= c.holdStressMin && !(l > 0) ? held.value : null);
      if (st != null) {
        const s = (st * 100) / 3;
        if (s < c.restBelow) delta += ((c.restBelow - s) / c.restBelow) * (c.calmChargePerHour / 60);
        else if (s > c.restBelow) {
          const amount = ((s - c.restBelow) / (100 - c.restBelow)) * (c.stressDrainPerHour / 60);
          drain("Stress", "stress", ts, amount);
          delta -= amount;
        }
      }
    }
    if (delta > 0) charged += delta;
    else drained += delta;
    level = clamp(level + delta, c.min, c.max);
    curve[m] = level;
  }

  const topDrains = episodes.sort((a, b) => b.amount - a.amount).slice(0, 3);
  return { curve, current: level, charged, drained, topDrains };
}
