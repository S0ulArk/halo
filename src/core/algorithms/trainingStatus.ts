// Training Status: Halo's own implementation of Garmin's published Training Status (Garmin running-science pages,
// "Training Status", accessed 2026-10; Forerunner 970 manual 2026; logic from Firstbeat's 2018 patent US20180174685A1,
// older but still the method per Garmin's pages): what your recent training is doing, from the VO2max trend, the load and
// HRV Status. Halo's VO2max is Fitbit's estimate, which moves slowly and with resting heart rate, so its trend is read over
// 28 days rather than Garmin's 14 (docs/research/whoop-garmin.md N-5, 2026-10-09).

export const trainingStatusConfig = {
  /** VO2max trend window, days, and the monthly change that counts as rising or falling (published ±1.5 a month). */
  vo2Days: 28,
  vo2MinPoints: 3,
  vo2Change: 1.5,
  /** Detraining: acute load under this share of the 12-week median for 7 days or more (guess, report N-5). */
  detrainShare: 0.2,
  detrainDays: 7,
  medianDays: 84,
  /** Load falling: today's acute load under this share of a week ago (guess). */
  fallingShare: 0.9,
  /** Strained after this many days in a row of HRV Unbalanced below the band (guess, report N-5). */
  strainedHrvDays: 3,
};

export type TrainingStatusKind =
  | "detraining"
  | "strained"
  | "overreaching"
  | "recovery"
  | "peaking"
  | "productive"
  | "unproductive"
  | "maintaining";

export interface TrainingStatusInput {
  /** VO2max readings in the last 28 days: days before today (0 = today) and values. */
  vo2: { daysAgo: number; value: number }[];
  /** Garmin-style load ratio today, or null. */
  loadRatio: number | null;
  /** Acute load today, a week ago, and the last 84 days' (oldest first, null where none). */
  acute: number | null;
  acuteWeekAgo: number | null;
  acuteHistory: (number | null)[];
  /** HRV Status today and, for Strained, the last few days' (oldest first). */
  hrv: { status: "balanced" | "unbalanced" | "low" | null; direction: "high" | "low" | null }[];
  /** A VO2max in the last 30 days (Training Status needs one or an HRV Status). */
  hasRecentVo2: boolean;
}

/** Recency-weighted least-squares slope of VO2max, per 30 days: weights fall from 1 today to 0.5 at the window's start. */
export function vo2Trend(points: { daysAgo: number; value: number }[]): number | null {
  const c = trainingStatusConfig;
  const xs = points.filter((p) => p.daysAgo >= 0 && p.daysAgo < c.vo2Days);
  if (xs.length < c.vo2MinPoints) return null;
  const w = xs.map((p) => 1 - (0.5 * p.daysAgo) / c.vo2Days);
  const sw = w.reduce((a, b) => a + b, 0);
  const mx = xs.reduce((a, p, i) => a + w[i] * -p.daysAgo, 0) / sw;
  const my = xs.reduce((a, p, i) => a + w[i] * p.value, 0) / sw;
  let num = 0;
  let den = 0;
  xs.forEach((p, i) => {
    num += w[i] * (-p.daysAgo - mx) * (p.value - my);
    den += w[i] * (-p.daysAgo - mx) ** 2;
  });
  return den > 0 ? (num / den) * 30 : 0;
}

export type TrainingStatus = {
  status: TrainingStatusKind;
  /** VO2max change per month, or null without enough readings. */
  vo2PerMonth: number | null;
  loadFalling: boolean;
};

/** Training Status, or null ("No status") without a load ratio, or without both a recent VO2max and an HRV Status. */
export function trainingStatus(a: TrainingStatusInput): TrainingStatus | null {
  const c = trainingStatusConfig;
  const today = a.hrv.at(-1) ?? null;
  if (a.loadRatio == null || a.acute == null || (!a.hasRecentVo2 && !today?.status)) return null;
  const slope = vo2Trend(a.vo2);
  const rising = slope != null && slope >= c.vo2Change;
  const falling = slope != null && slope <= -c.vo2Change;
  const r = a.loadRatio;
  const loadFalling = a.acuteWeekAgo != null && a.acute < c.fallingShare * a.acuteWeekAgo;
  const known = a.acuteHistory.filter((v): v is number => v != null).sort((x, y) => x - y);
  const median = known.length ? known[Math.floor(known.length / 2)] : null;
  const recent = a.acuteHistory.slice(-c.detrainDays);
  const detraining = median != null && median > 0 && recent.length >= c.detrainDays && recent.every((v) => v != null && v < c.detrainShare * median);
  const hrvLow = today?.status === "low";
  const streak = a.hrv.slice(-c.strainedHrvDays);
  const unbalancedLow = streak.length >= c.strainedHrvDays && streak.every((h) => h.status === "unbalanced" && h.direction === "low");
  const productiveLoad = r >= 0.8 && r < 1.5;
  let status: TrainingStatusKind;
  if (detraining) status = "detraining";
  else if ((hrvLow || unbalancedLow) && r >= 0.8) status = "strained";
  else if (r >= 1.5 && (falling || hrvLow)) status = "overreaching";
  else if (r < 0.8 && loadFalling) status = "recovery";
  else if (rising && loadFalling) status = "peaking";
  else if (productiveLoad && (rising || (today?.status === "balanced" && r >= 1.0))) status = "productive";
  else if (productiveLoad && falling) status = "unproductive";
  else status = "maintaining";
  return { status, vo2PerMonth: slope, loadFalling };
}
