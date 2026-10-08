// Own algorithm (the web's docs/algorithms/fitness-level.md): VO2max percentile for age decade and sex from the FRIEND
// treadmill reference standards and a category from the percentile. Mobile addition at the end: Fitness Age and a
// non-exercise VO2max estimate, ported from noop's FitnessAgeEngine.kt.

export type Sex = "male" | "female";

/** [x, y] points with ascending x. */
export type Knots = readonly (readonly [number, number])[];

/** Linear between knots, flat beyond the first and last. */
export function piecewiseLinear(knots: Knots, x: number): number {
  if (x <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i];
    if (x <= x1) {
      const [x0, y0] = knots[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return knots[knots.length - 1][1];
}

/** Column percentiles of the FRIEND table. */
export const FRIEND_PERCENTILES: readonly number[] = [5, 10, 25, 50, 75, 90, 95];

/**
 * Measured treadmill VO2max (mL O2·kg⁻¹·min⁻¹), rows 20–29 … 70–79. Kaminsky et al. 2015, Mayo Clin Proc
 * 90(11):1515–1523, Table 2 ("Men/Women from FRIEND"; 7,783 tests, RER ≥ 1.0, no CVD).
 */
export const FRIEND_TREADMILL: Record<Sex, readonly (readonly number[])[]> = {
  male: [
    [29.0, 32.1, 40.1, 48.0, 55.2, 61.8, 66.3],
    [27.2, 30.2, 35.9, 42.4, 49.2, 56.5, 59.8],
    [24.2, 26.8, 31.9, 37.8, 45.0, 52.1, 55.6],
    [20.9, 22.8, 27.1, 32.6, 39.7, 45.6, 50.7],
    [17.4, 19.8, 23.7, 28.2, 34.5, 40.3, 43.0],
    [16.3, 17.1, 20.4, 24.4, 30.4, 36.6, 39.7],
  ],
  female: [
    [21.7, 23.9, 30.5, 37.6, 44.7, 51.3, 56.0],
    [19.0, 20.9, 25.3, 30.2, 36.1, 41.4, 45.8],
    [17.0, 18.8, 22.1, 26.7, 32.4, 38.4, 41.7],
    [16.0, 17.3, 19.9, 23.4, 27.6, 32.0, 35.9],
    [13.4, 14.6, 17.2, 20.0, 23.8, 27.0, 29.4],
    [13.1, 13.6, 15.6, 18.3, 20.8, 23.1, 24.1],
  ],
};

export const fitnessLevelConfig = {
  /**
   * Lowest percentile of each category; below `fair` is poor. Garmin's cut-offs since version 19 (published: Forerunner
   * 970 manual, 2026, on the Cooper Institute's percentiles: Superior from the 95th, Excellent 80th, Good 60th, Fair 40th),
   * read here on the FRIEND percentiles; were 20 / 40 / 60 / 80.
   */
  categoryFloors: { fair: 40, good: 60, excellent: 80, superior: 95 },
};

export type FitnessCategory = "poor" | "fair" | "good" | "excellent" | "superior";

/** Under 20 uses the 20–29 row; 80 and over uses 70–79. */
const decadeRow = (age: number, sex: Sex) =>
  FRIEND_TREADMILL[sex][Math.min(5, Math.max(0, Math.floor(age / 10) - 2))];

/** Percentile for a VO2max, linear between the published columns and clamped to [5, 95]. */
export function vo2maxPercentile(vo2max: number, age: number, sex: Sex): number {
  return piecewiseLinear(
    decadeRow(age, sex).map((v, i) => [v, FRIEND_PERCENTILES[i]] as const),
    vo2max,
  );
}

export function fitnessCategory(percentile: number): FitnessCategory {
  const f = fitnessLevelConfig.categoryFloors;
  if (percentile >= f.superior) return "superior";
  if (percentile >= f.excellent) return "excellent";
  if (percentile >= f.good) return "good";
  if (percentile >= f.fair) return "fair";
  return "poor";
}

export function fitnessLevel(vo2max: number, age: number, sex: Sex): { percentile: number; category: FitnessCategory } {
  const percentile = vo2maxPercentile(vo2max, age, sex);
  return { percentile, category: fitnessCategory(percentile) };
}

// ── Fitness Age and an estimated VO2max (mobile) ─────────────────────────────
// Ported from noop's analytics/FitnessAgeEngine.kt (Copyright 2026 NoopApp, PolyForm Noncommercial 1.0.0), a fitness
// comparison rather than a medical test:
//  - VO2max: Nes et al. 2011 (Med Sci Sports Exerc 43:2024), the HUNT non-exercise model, waist-circumference variant
//    (SEE ≈ 5.7 mL/kg/min for men, 5.1 for women). noop deliberately has no BMI variant (the circulating coefficients
//    couldn't be confirmed against the paper), so neither does Pulse: without a waist in the profile it falls back, as
//    noop's IntelligenceEngine.fitnessAgeRows does, to Uth et al. 2004 (Eur J Appl Physiol 91:111): 15.3 × HRmax / RHR.
//  - Physical-activity index: the HUNT1 questionnaire's frequency × intensity × duration on [0, 15] (Kurtze 2008),
//    rebuilt from measured weekly zone minutes (noop's physicalActivityIndex).
//  - Fitness Age: the same Nes equation inverted against a reference peer (resting HR 65, index 5); the waist term
//    cancels, so it needs only age, sex, resting HR and activity.

/** Nes 2011 waist variant: VO2max = intercept − age·a + activity·p − waist·w − restingHr·r (mL/kg/min). */
export const NES_2011: Record<Sex, { intercept: number; age: number; waist: number; restingHr: number; activity: number }> = {
  male: { intercept: 100.27, age: 0.296, waist: 0.369, restingHr: 0.155, activity: 0.226 },
  female: { intercept: 74.74, age: 0.247, waist: 0.259, restingHr: 0.114, activity: 0.198 },
};

export const fitnessAgeConfig = {
  /** noop's reference peer: at this resting HR and activity index, Fitness Age = age. */
  restingHrReference: 65,
  activityReference: 5,
  /** Fitness Age is clamped to this range (noop). */
  minAge: 20,
  maxAge: 80,
  /** Uth 2004: VO2max ≈ 15.3 × HRmax / HRrest. */
  uthFactor: 15.3,
  /** Days the estimate reads, ending on the day (noop: the last 7). */
  windowDays: 7,
  /** Of those, days needed with a resting HR, and with a full day of heart rate for activity (noop's minCoverageDays). */
  minDays: 4,
  /** Minutes at 40 % of heart-rate reserve or more (Pulse Age's bout-counted zone time) that make a day active. */
  activeDayMinutes: 10,
};

export function nesVo2max(age: number, sex: Sex, waistCm: number, restingHr: number, activityIndex: number): number {
  const c = NES_2011[sex];
  return c.intercept - c.age * age + c.activity * activityIndex - c.waist * waistCm - c.restingHr * restingHr;
}

export const uthVo2max = (maxHr: number, restingHr: number): number => (fitnessAgeConfig.uthFactor * maxHr) / restingHr;

/** FA = age + (r·(RHR − 65) − p·(PAI − 5)) / a, clamped to [20, 80]. */
export function fitnessAge(age: number, sex: Sex, restingHr: number, activityIndex: number): number {
  const c = NES_2011[sex];
  const cfg = fitnessAgeConfig;
  const fa = age + (c.restingHr * (restingHr - cfg.restingHrReference) - c.activity * (activityIndex - cfg.activityReference)) / c.age;
  return Math.min(cfg.maxAge, Math.max(cfg.minAge, fa));
}

/**
 * The HUNT physical-activity index on [0, 15] (noop's physicalActivityIndex; bucket edges from the HUNT1 answers):
 * frequency {0, 0.5, 1, 2.5, 5} from active days a week, intensity {1, 2, 3} from the share of active time in zones 4–5,
 * duration {0.10, 0.38, 0.75, 1.0} from active minutes per active day.
 */
export function physicalActivityIndex(activeDaysPerWeek: number, avgActiveMinutesPerDay: number, highIntensityFraction: number): number {
  const d = activeDaysPerWeek;
  const frequency = d < 1 ? 0 : d === 1 ? 0.5 : d === 2 ? 1 : d <= 4 ? 2.5 : 5;
  if (frequency === 0) return 0;
  const intensity = highIntensityFraction < 0.15 ? 1 : highIntensityFraction < 0.5 ? 2 : 3;
  const m = avgActiveMinutesPerDay;
  const duration = m < 15 ? 0.1 : m < 30 ? 0.38 : m < 60 ? 0.75 : 1;
  return frequency * intensity * duration;
}

/**
 * One day as the estimate reads it: Fitbit's resting HR, and Pulse Age's bout-counted zone minutes (null on a day without
 * 12 h of HR), each minute counted once: `zone13Min` is real minutes at 40–80 % of the reserve, not Pulse Age's
 * moderate-equivalent dose, which counts a 60–80 % minute twice.
 */
export interface FitnessEstimateDay {
  restingHr?: number | null;
  zone13Min?: number | null;
  zone45Min?: number | null;
}

export interface FitnessEstimate {
  /** mL/kg/min: Nes 2011 with a waist, else Uth 2004. */
  vo2max: number;
  method: "nes" | "uth";
  /** Years, on [20, 80]. */
  fitnessAge: number;
  /** HUNT index on [0, 15]. */
  activityIndex: number;
  /** Median of the window's resting HRs, bpm. */
  restingHr: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Fitness Age and an estimated VO2max from `days` (the last `windowDays`, oldest first), or null with fewer than
 * `minDays` resting HRs or full days of heart rate. Activity days are scaled to a week when some days lack coverage.
 */
export function fitnessEstimate(
  days: readonly FitnessEstimateDay[],
  p: { age: number; sex: Sex; maxHr: number; waistCm?: number | null },
): FitnessEstimate | null {
  const cfg = fitnessAgeConfig;
  const window = days.slice(-cfg.windowDays);
  const rhrs = window.map((d) => d.restingHr).filter((x): x is number => x != null && x > 0);
  const covered = window.filter((d) => d.zone13Min != null && d.zone45Min != null);
  if (p.age <= 0 || rhrs.length < cfg.minDays || covered.length < cfg.minDays) return null;
  const active = covered.map((d) => ({ mod: d.zone13Min!, vig: d.zone45Min! })).filter((d) => d.mod + d.vig >= cfg.activeDayMinutes);
  const activeMin = active.reduce((a, d) => a + d.mod + d.vig, 0);
  const activityIndex = physicalActivityIndex(
    Math.round((active.length * 7) / covered.length),
    active.length ? activeMin / active.length : 0,
    activeMin > 0 ? active.reduce((a, d) => a + d.vig, 0) / activeMin : 0,
  );
  const restingHr = median(rhrs);
  const nes = p.waistCm != null && p.waistCm > 0;
  return {
    vo2max: nes ? nesVo2max(p.age, p.sex, p.waistCm!, restingHr, activityIndex) : uthVo2max(p.maxHr, restingHr),
    method: nes ? "nes" : "uth",
    fitnessAge: fitnessAge(p.age, p.sex, restingHr, activityIndex),
    activityIndex,
    restingHr,
  };
}
