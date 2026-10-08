// Aerobic Training Effect (0–5) and Recovery Time: Halo's own implementation of Garmin's published method (Firstbeat,
// now Garmin Jyväskylä Oy). A session's effect comes from its peak EPOC (excess post-exercise oxygen consumption, ml/kg)
// against what that person's fitness makes routine (published: Firstbeat white papers "Indirect EPOC prediction method"
// 2005/2012 and "EPOC based training effect assessment" 2005/2012, which Garmin's running-science pages, accessed
// 2026-10, still call the core). Garmin estimates EPOC from heart rate and beat-to-beat data with unpublished constants;
// this reads heart rate only, through an ODE whose constants were fitted to the EPOC white paper's Figure 5
// (docs/research/whoop-garmin.md G-1, N-3, 2026-10-09). Anaerobic Training Effect needs pace or power to be honest, so it
// is left out.

/** The EPOC ODE: dE/dt = a(I) − k(I)·E per minute, I the share of VO2max. */
export const epocConfig = {
  /** a(I) = scale · e^(rise · (I − 1)) ml/kg/min (fitted to Figure 5, report G-1). */
  scale: 13.2,
  rise: 4.2,
  /**
   * k(I) per minute, linear between knots (fitted to Figure 5, report G-1; k at 0.7 calibrated 2026-10-09 to 0.018 from
   * the report's 0.020, which put 60 minutes at 70 % at 131 ml/kg against the figure's 137).
   */
  k: [
    [0.3, 0.14],
    [0.4, 0.1],
    [0.5, 0.065],
    [0.6, 0.035],
    [0.7, 0.018],
    [0.8, 0.007],
    [0.9, 0.002],
    [1.0, 0],
  ] as readonly (readonly [number, number])[],
  /** Readings further apart than this are integrated as this many seconds (a gap is not 10 minutes of effort). */
  maxStepS: 10,
};

/** k(I), linear between the knots, flat beyond them. */
export function epocDecay(i: number): number {
  const ks = epocConfig.k;
  if (i <= ks[0][0]) return ks[0][1];
  for (let j = 1; j < ks.length; j++) {
    const [x1, y1] = ks[j];
    if (i <= x1) {
      const [x0, y0] = ks[j - 1];
      return y0 + ((i - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return ks[ks.length - 1][1];
}

/** Intensity as a share of VO2max from heart rate: %VO2R ≈ %HRR (Swain & Leutholtz 1997), so I = x·(1 − r) + r, r = 3.5 / VO2max. */
export const intensityOf = (hrrShare: number, vo2max: number): number => {
  const r = 3.5 / Math.max(vo2max, 3.6);
  return Math.min(1.2, Math.max(0, hrrShare) * (1 - r) + r);
};

/** EPOC (ml/kg) one step of `minutes` at intensity i, from e: the ODE solved exactly for a constant i. */
function epocStep(e: number, i: number, minutes: number): number {
  const a = epocConfig.scale * Math.exp(epocConfig.rise * (i - 1));
  const k = epocDecay(i);
  if (k <= 0) return e + a * minutes;
  const eq = a / k;
  return eq + (e - eq) * Math.exp(-k * minutes);
}

/** EPOC after `minutes` at a steady intensity, from 0 (for checks against Figure 5). */
export const steadyEpoc = (i: number, minutes: number): number => epocStep(0, i, minutes);

/**
 * Peak EPOC (ml/kg) over a session's heart rate (time-ordered), each reading held until the next one (at most maxStepS).
 */
export function peakEpoc(hr: readonly { ts: number; bpm: number }[], restingHr: number, maxHr: number, vo2max: number): number {
  const reserve = Math.max(1, maxHr - restingHr);
  let e = 0;
  let peak = 0;
  for (let j = 0; j + 1 < hr.length; j++) {
    const dt = Math.min(Math.max(0, hr[j + 1].ts - hr[j].ts), epocConfig.maxStepS) / 60;
    if (dt <= 0) continue;
    e = epocStep(e, intensityOf((hr[j].bpm - restingHr) / reserve, vo2max), dt);
    if (e > peak) peak = e;
  }
  return peak;
}

/**
 * Activity class 0–10: the training background Training Effect is judged against (published: Firstbeat; Garmin uses the
 * higher of the class from VO2max and from recent training, US20230414143A1, 2023). From VO2max, Jackson et al. 1990's
 * non-exercise model inverted (inferred, report G-2): PA-R = (VO2max − 56.363 + 0.381·age + 0.754·BMI − 10.987·male) /
 * 1.921, within 0–7. From training, weekly hours of workouts: over 15 h → 10, 13–15 → 9.5, 11–13 → 9, 9–11 → 8.5, 7–9 → 8,
 * 5–7 → 7.5 (published, Firstbeat's table, report G-2); below 5 h, Jackson's own PA-R descriptors for running or
 * comparable activity (published, Jackson et al. 1990): over 3 h a week → 7, 1–3 h → 6, 30–60 min → 5, under 30 min → 4.
 * The report used hours only from 5 h; without the PA-R steps a runner doing 4–5 h a week sat near class 5 and long easy
 * runs read Overreaching (calibrated on the demo seed, 2026-10-09).
 */
export function activityClass(vo2max: number, age: number, bmi: number, male: boolean, weeklyHours: number): number {
  const fromVo2 = Math.min(7, Math.max(0, (vo2max - 56.363 + 0.381 * age + 0.754 * bmi - 10.987 * (male ? 1 : 0)) / 1.921));
  const h = weeklyHours;
  const fromHours = h > 15 ? 10 : h > 13 ? 9.5 : h > 11 ? 9 : h > 9 ? 8.5 : h > 7 ? 8 : h >= 5 ? 7.5 : h > 3 ? 7 : h >= 1 ? 6 : h >= 0.5 ? 5 : h > 0 ? 4 : 0;
  return Math.max(fromVo2, fromHours);
}

/**
 * The EPOC (ml/kg) at Training Effect 1–5 for an activity class: lines read off the Training Effect white paper's
 * Figure 2 (inferred, report G-2): TE 2 = 3 + 2.4·AC, 3 = 6 + 7.8·AC, 4 = 10 + 18.2·AC, 5 = 15 + 28.7·AC; TE 1 = 0.3 × the
 * TE 2 line (guess). Checked against the patent's TE 3.0 = 62 ml/kg at AC 7 (60.6 here).
 */
export function teLines(ac: number): [number, number, number, number, number] {
  const l2 = 3 + 2.4 * ac;
  return [0.3 * l2, l2, 6 + 7.8 * ac, 10 + 18.2 * ac, 15 + 28.7 * ac];
}

/** Aerobic Training Effect 0–5 (1 dp) from peak EPOC and activity class: linear between the lines, capped at 5.0. */
export function aerobicTE(epoc: number, ac: number): number {
  const lines = teLines(ac);
  if (!(epoc > 0)) return 0;
  let te: number;
  if (epoc < lines[0]) te = epoc / lines[0];
  else if (epoc >= lines[4]) te = 5;
  else {
    let k = 0;
    while (k < 3 && epoc >= lines[k + 1]) k++;
    te = k + 1 + (epoc - lines[k]) / (lines[k + 1] - lines[k]);
  }
  return Math.round(Math.min(5, te) * 10) / 10;
}

/** Garmin's Training Effect labels (published: Forerunner 970 manual, 2026). */
export type TeLabel = "no_benefit" | "minor" | "maintaining" | "improving" | "highly_improving" | "overreaching";
export const teLabel = (te: number): TeLabel =>
  te >= 5 ? "overreaching" : te >= 4 ? "highly_improving" : te >= 3 ? "improving" : te >= 2 ? "maintaining" : te >= 1 ? "minor" : "no_benefit";

/** The session's main benefit, aerobic only (Garmin's labels; the heart-rate split is a guess, report N-3). */
export type PrimaryBenefit = "recovery" | "base" | "tempo" | "threshold" | "vo2max";

/**
 * Primary benefit from TE and the session's time by % of max HR: Recovery under TE 2; VO2 max at TE 4+ with over 10
 * minutes above 90 %; Threshold when most of it was at 80 % or more; Tempo when a quarter or more was; else Base.
 */
export function primaryBenefit(te: number, seconds: { below80: number; from80: number; above90: number }): PrimaryBenefit {
  const total = seconds.below80 + seconds.from80;
  if (te < 2 || total <= 0) return "recovery";
  if (te >= 4 && seconds.above90 > 600) return "vo2max";
  const hard = seconds.from80 / total;
  return hard >= 0.5 ? "threshold" : hard >= 0.25 ? "tempo" : "base";
}

/** Seconds below 80 %, at 80 % and over, and over 90 % of max HR (each reading held until the next, at most maxStepS). */
export function maxHrSplit(hr: readonly { ts: number; bpm: number }[], maxHr: number) {
  const out = { below80: 0, from80: 0, above90: 0 };
  for (let j = 0; j + 1 < hr.length; j++) {
    const dt = Math.min(Math.max(0, hr[j + 1].ts - hr[j].ts), epocConfig.maxStepS);
    const share = hr[j].bpm / maxHr;
    if (share >= 0.8) out.from80 += dt;
    else out.below80 += dt;
    if (share > 0.9) out.above90 += dt;
  }
  return out;
}

// ── Recovery Time ───────────────────────────────────────────────────────────

export const recoveryTimeConfig = {
  /**
   * Hours added by a session: 72 · ((TE − 1) / 4)^p, through Garmin's 2023 patent table (published, US20230414143A1: TE 1
   * → 0.1 h, 3.5 → 24.2, 5 → 72). The report's p = 2.25 gives 25.0 at TE 3.5; p = 2.32 meets it (inferred, 2026-10-09).
   */
  scaleHours: 72,
  power: 2.32,
  /** Never more than this (published: Garmin, up to 96 hours). */
  maxHours: 96,
  /** A new session on top of time left: max + 0.25 × min (guess, report G-6). */
  overlap: 0.25,
  /** × this with a load ratio of 1.5 or more (guess, report N-4). */
  highLoadFactor: 1.15,
  highLoadFrom: 1.5,
  /** Hours counted down per hour: asleep after a good night (Sleep Performance 85+) faster, stressed or after a poor night slower (guess). */
  goodSleepRate: 1.4,
  slowRate: 0.7,
  goodSleepFrom: 85,
  poorSleepBelow: 70,
  stressedFrom: 2,
};

/** The hours a session adds: 0 at TE 1 or under. */
export function sessionRecoveryHours(te: number): number {
  const c = recoveryTimeConfig;
  return te <= 1 ? 0 : c.scaleHours * ((Math.min(5, te) - 1) / 4) ** c.power;
}

/** Recovery time after a session of `hours` on top of `left` hours, at a load ratio: capped at 96. */
export function addRecovery(left: number, hours: number, loadRatio: number | null): number {
  const c = recoveryTimeConfig;
  if (!(hours > 0)) return Math.min(c.maxHours, left);
  const combined = Math.max(left, hours) + c.overlap * Math.min(left, hours);
  return Math.min(c.maxHours, combined * (loadRatio != null && loadRatio >= c.highLoadFrom ? c.highLoadFactor : 1));
}

/**
 * How fast recovery time counts down (hours per hour): asleep after a good night faster; asleep after a poor night, in a
 * stressed hour or awake the day after a poor night slower; else 1. `nightPerformance` is that night's Sleep Performance.
 */
export function countdownRate(o: { asleep: boolean; nightPerformance: number | null; stress: number | null }): number {
  const c = recoveryTimeConfig;
  if (o.asleep) {
    if (o.nightPerformance != null && o.nightPerformance >= c.goodSleepFrom) return c.goodSleepRate;
    if (o.nightPerformance != null && o.nightPerformance < c.poorSleepBelow) return c.slowRate;
    return 1;
  }
  // Awake: slower in a stressed hour, or on the day after a poor night.
  const poorNight = o.nightPerformance != null && o.nightPerformance < c.poorSleepBelow;
  return (o.stress != null && o.stress >= c.stressedFrom) || poorNight ? c.slowRate : 1;
}
