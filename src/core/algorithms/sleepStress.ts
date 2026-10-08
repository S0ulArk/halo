// Sleep Stress: the share of a night's sleep spent in a high-stress state, one of the four parts of WHOOP's Sleep
// Performance since May 2025 (published as a part: Gadgets & Wearables 2025-05-05; WHOOP 2025-12-15). WHOOP computes it
// from heart-rate variability and breathing disturbances, which Halo doesn't have minute by minute; its own Stress
// Monitor patent allows a heart-rate-only model (WO2024129679A2). So this is a heart-rate proxy (docs/research/
// whoop-garmin.md C13, 2026-10-09): an asleep minute is stressed when its heart rate stays well above the night's own
// calm level (its 20th percentile) for a few minutes running.

export const sleepStressConfig = {
  /** The night's calm level: this percentile of its asleep minutes' heart rate (guess, report C13). */
  calmPercentile: 0.2,
  /** Above calm by at least this many bpm … (guess, report C13). */
  minLiftBpm: 6,
  /** … or this share of the heart-rate reserve, whichever is more (guess, report C13). */
  liftHrr: 0.08,
  /** A stressed stretch lasts at least this many minutes (guess, report C13). */
  minRunMin: 3,
  /**
   * Minutes without heart rate a stretch may span and still count as one (calibrated, 2026-10-09: Fitbit's sleeping heart
   * rate in Health Connect can come a few minutes apart, and a strict minute-by-minute run would never form).
   */
  maxGapMin: 5,
  /** Asleep minutes with heart rate a night needs for a value (calibrated). */
  minMinutes: 60,
};

export type SleepStressResult = { pct: number; stressedMin: number; minutes: number };

/** Linear-interpolated quantile of a sorted list. */
function quantile(sorted: number[], q: number): number {
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Sleep Stress over one night, from per-minute mean heart rate (`hr[m]`, null without a reading) and whether each minute
 * was asleep. Null without stages or with under minMinutes asleep minutes with heart rate.
 */
export function sleepStress(hr: readonly (number | null)[], asleep: readonly boolean[], restingHr: number, maxHr: number): SleepStressResult | null {
  const c = sleepStressConfig;
  const minutes: number[] = [];
  for (let m = 0; m < hr.length; m++) if (asleep[m] && hr[m] != null) minutes.push(m);
  if (minutes.length < c.minMinutes) return null;
  const calm = quantile(minutes.map((m) => hr[m]!).sort((a, b) => a - b), c.calmPercentile);
  const threshold = calm + Math.max(c.minLiftBpm, c.liftHrr * Math.max(0, maxHr - restingHr));
  // Stretches of asleep minutes at or above the threshold; a gap of up to maxGapMin minutes without heart rate (or
  // awake) doesn't break one, a minute under the threshold does.
  let stressed = 0;
  let run: number[] = [];
  const close = () => {
    if (run.length && run[run.length - 1] - run[0] + 1 >= c.minRunMin) stressed += run.length;
    run = [];
  };
  for (const m of minutes) {
    if (hr[m]! >= threshold) {
      if (run.length && m - run[run.length - 1] - 1 > c.maxGapMin) close();
      run.push(m);
    } else close();
  }
  close();
  return { pct: Math.round((1000 * stressed) / minutes.length) / 10, stressedMin: stressed, minutes: minutes.length };
}
