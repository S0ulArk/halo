// Live Strain for Live Workout (`/workout-live`): the day's Strain building beat by beat from the band's Bluetooth
// heart rate, on the app's own Strain math (src/core/scoring/strain.ts: Banister TRIMP on heart-rate reserve, each
// reading credited with the gap to the next up to 2 minutes, the same log map onto 0–21, no waking floor inside a
// workout). Today's stored Effort is turned back into its TRIMP, so the live number carries on from the Strain on Home
// instead of starting from zero. The accumulator follows noop's analytics/LiveSessionEngine.kt (© 2026 NoopApp,
// PolyForm Noncommercial 1.0.0): one instance per session, time passed in with every sample so a session replays
// deterministically in tests, and impossible samples rejected before they count.
//
// Display-only: nothing here is written to the Store. The workout counts for real when Fitbit syncs it to Health
// Connect, so a beat never counts twice.
import {
  banisterRate,
  defaultRestingHR,
  effortOfTrimp,
  JUMP_WINDOW_S,
  MAX_JUMP_BPM,
  MAX_PLAUSIBLE_BPM,
  maxSampleGapMin,
  MIN_PLAUSIBLE_BPM,
  pctHRR,
  toStrainScale,
  trimpForStrain,
  trimpOfEffort,
} from "@/core/scoring/strain";
import { zoneNumber, zones } from "@/core/scoring/zones";

export { MAX_JUMP_BPM, MAX_PLAUSIBLE_BPM, MIN_PLAUSIBLE_BPM };
/** A jump larger than MAX_JUMP_BPM within this of the last accepted reading is an artifact (noop: 45 bpm in 12 s). */
export const JUMP_WINDOW_MS = JUMP_WINDOW_S * 1000;
/** The window the current rate (TRIMP a minute) is read over, for "minutes to target". */
export const RATE_WINDOW_MS = 3 * 60_000;
/** Below this TRIMP a minute (about 13 % of the reserve) the rate is too low to reach a target. */
export const MIN_TARGET_RATE = 0.1;

/** The TRIMP a stored Effort (0–100) stands for: the Strain map run backwards. Null or ≤ 0 is none. */
export const effortToTrimp = (effort: number | null | undefined): number => trimpOfEffort(effort);

export { trimpForStrain };

/** TRIMP → Day Strain 0–21, the stored Effort's own rounding (2 dp of Effort) included. */
export const strainOfTrimp = (trimp: number): number => toStrainScale(effortOfTrimp(trimp));

export type LiveStrainConfig = {
  restingHr: number;
  maxHr: number;
  /** Banister's weighting differs by sex (strain.ts); male when absent. */
  sex?: string;
  /** Today's stored Effort (0–100) before the workout; null when there is none yet. */
  baseEffort: number | null;
};

export class LiveStrain {
  readonly restingHr: number;
  readonly maxHr: number;
  readonly reserve: number;
  readonly sex: string;
  private readonly zoneSet: ReturnType<typeof zones>;
  /** TRIMP of the day before the workout. */
  readonly baseTrimp: number;
  /** The workout's TRIMP so far. */
  trimp = 0;
  /** Credited seconds below Zone 1 ([0]) and in Zones 1–5. */
  readonly zoneSeconds = [0, 0, 0, 0, 0, 0];
  maxBpm: number | null = null;
  private last: { t: number; bpm: number } | null = null;
  private hrSum = 0;
  private hrMin = 0;
  /** Credited TRIMP with the time it was credited, for the recent rate. */
  private credits: { t: number; trimp: number; min: number }[] = [];

  constructor(c: LiveStrainConfig) {
    this.restingHr = c.restingHr > 0 ? c.restingHr : defaultRestingHR;
    this.maxHr = c.maxHr;
    // A reserve under 1 bpm (bad profile data) is treated as 1, as zones() does.
    this.reserve = Math.max(1, c.maxHr - this.restingHr);
    this.sex = c.sex ?? "male";
    this.zoneSet = zones(this.restingHr, c.maxHr);
    this.baseTrimp = effortToTrimp(c.baseEffort);
  }

  /** Whether a reading at `t` (epoch ms) counts: in range and not an impossible jump from the last one. */
  plausible(t: number, bpm: number): boolean {
    if (!(bpm >= MIN_PLAUSIBLE_BPM && bpm <= MAX_PLAUSIBLE_BPM)) return false;
    const l = this.last;
    return !(l && t - l.t <= JUMP_WINDOW_MS && Math.abs(bpm - l.bpm) > MAX_JUMP_BPM);
  }

  /**
   * One reading. The reading before it is credited with the gap up to this one (at most 2 minutes, the stored
   * Strain's rule inside a workout) at its own Banister rate; this one waits for the next. False when it was rejected.
   */
  add(t: number, bpm: number): boolean {
    const l = this.last;
    if (l && t <= l.t) return false;
    if (!this.plausible(t, bpm)) return false;
    if (l) {
      const min = Math.min((t - l.t) / 60_000, maxSampleGapMin);
      const credit = banisterRate(pctHRR(l.bpm, this.restingHr, this.reserve) / 100, this.sex) * min;
      this.trimp += credit;
      this.zoneSeconds[this.zoneOf(l.bpm)] += min * 60;
      this.hrSum += l.bpm * min;
      this.hrMin += min;
      this.credits.push({ t, trimp: credit, min });
      if (this.credits[0].t < t - RATE_WINDOW_MS) this.credits = this.credits.filter((c) => c.t >= t - RATE_WINDOW_MS);
    }
    this.last = { t, bpm };
    this.maxBpm = this.maxBpm === null ? bpm : Math.max(this.maxBpm, bpm);
    return true;
  }

  /** Heart-rate zone 1–5 of `bpm`, 0 below Zone 1 (the display zones, zones.ts: 40/60/70/80/90 % of the reserve). */
  zoneOf(bpm: number): number {
    return zoneNumber(this.zoneSet, bpm);
  }

  /** The workout's own Strain, 0–21. */
  get sessionStrain(): number {
    return strainOfTrimp(this.trimp);
  }

  /** Day Strain before the workout, 0–21. */
  get dayStartStrain(): number {
    return strainOfTrimp(this.baseTrimp);
  }

  /** Day Strain now, 0–21: the day's TRIMP before the workout plus the workout's. */
  get dayStrain(): number {
    return strainOfTrimp(this.baseTrimp + this.trimp);
  }

  /** Time-weighted mean bpm of the credited readings; null before two. */
  get avgHr(): number | null {
    return this.hrMin > 0 ? Math.round(this.hrSum / this.hrMin) : null;
  }

  /** TRIMP a minute over the last RATE_WINDOW_MS of credited time before `now`; null with under a minute of it. */
  rate(now: number, windowMs = RATE_WINDOW_MS): number | null {
    const recent = this.credits.filter((c) => c.t >= now - windowMs);
    const min = recent.reduce((a, c) => a + c.min, 0);
    if (min < 1) return null;
    return recent.reduce((a, c) => a + c.trimp, 0) / min;
  }

  /**
   * Minutes at the current rate until Day Strain reaches `strain` (0–21): 0 when it already has; null when the rate
   * is unknown or too low to get there (under MIN_TARGET_RATE TRIMP a minute).
   */
  minutesTo(strain: number, now: number): number | null {
    const need = trimpForStrain(strain) - (this.baseTrimp + this.trimp);
    if (need <= 0) return 0;
    const r = this.rate(now);
    if (r === null || r < MIN_TARGET_RATE) return null;
    return need / r;
  }
}

/** A crossing of the target's edges between two Day Strain readings: "low" into the range, "high" past it. */
export function targetCrossing(prev: number, next: number, target: readonly [number, number] | null): "low" | "high" | null {
  if (!target) return null;
  if (prev < target[1] && next >= target[1]) return "high";
  if (prev < target[0] && next >= target[0]) return "low";
  return null;
}
