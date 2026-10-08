// Own algorithm (docs/algorithms/sleep-regularity.md): the Sleep Regularity Index (Phillips et al. 2017,
// Sci Rep 7:3216). Each minute of the window is asleep or awake, and
// SRI = −100 + 200 · P(same state at t and t + 24 h), over minute pairs whose two days both have data.

export const sleepRegularityConfig = {
  /** Days in the window (*tunable*; the plan's "last 7 days", as in UK Biobank's 7-day SRI). */
  windowDays: 7,
};

const MIN_PER_DAY = 1440;

/** One pair of consecutive days: the minutes in the same state (asleep or awake) on both, of the minutes compared. */
export type SriPair = { same: number; pairs: number };

/** SRI on [−100, 100] from matching minutes over minutes compared (pooled over any number of day pairs). */
export const sriOf = (same: number, pairs: number): number => -100 + (200 * same) / pairs;

/**
 * Each pair of consecutive days in the window, day d against day d + 1: its counts, or null when either day has no data
 * (band not worn), so the pair is skipped.
 * @param sessions every sleep session (main sleep and naps), unix seconds; naps count as sleep.
 * @param windowStart unix seconds where the first day starts (the pipeline uses local noon, so days run noon to noon).
 * @param covered one flag per day: false when the day has no data.
 */
export function sriPairs(
  sessions: { start: number; end: number }[],
  windowStart: number,
  covered: boolean[] = Array(sleepRegularityConfig.windowDays).fill(true),
): (SriPair | null)[] {
  const asleep = asleepMask(sessions, windowStart, covered.length);
  // ponytail: t + 24 h is absolute time, so a DST night compares clock times 1 h apart; fine for a 7-day score.
  const out: (SriPair | null)[] = [];
  for (let d = 0; d + 1 < covered.length; d++) out.push(covered[d] && covered[d + 1] ? comparePair(asleep, d, d + 1) : null);
  return out;
}

/** Minute m of `days` days from windowStart (windowStart + 60m) is 1 when a session covers its start. */
function asleepMask(sessions: { start: number; end: number }[], windowStart: number, days: number): Uint8Array {
  const n = days * MIN_PER_DAY;
  const asleep = new Uint8Array(n);
  const minute = (ts: number) => Math.min(n, Math.max(0, Math.ceil((ts - windowStart) / 60)));
  for (const s of sessions) asleep.fill(1, minute(s.start), minute(s.end));
  return asleep;
}

/** Day a's minutes against day b's, minute for minute. */
function comparePair(asleep: Uint8Array, a: number, b: number): SriPair {
  let same = 0;
  const off = (b - a) * MIN_PER_DAY;
  for (let m = a * MIN_PER_DAY; m < (a + 1) * MIN_PER_DAY; m++) if (asleep[m] === asleep[m + off]) same++;
  return { same, pairs: MIN_PER_DAY };
}

/**
 * Days WHOOP's Sleep Consistency compares the last 24 hours with (published: The Locker, "Sleep Consistency",
 * 2026-05-22: "the last 24 hours against the previous 4 days").
 */
export const WHOOP_CONSISTENCY_DAYS = 4;

/**
 * WHOOP-style Sleep Consistency's pairs: the window's last day against each earlier day of it (with five days, the last 24
 * hours against each of the previous four), minute for minute; null where either day has no data. The pooled score is
 * max(0, −100 + 200 · same / compared), an SRI over those lagged pairs (inferred from WHOOP's description and its note that
 * it reads a little lower than SRI because of the longer baseline).
 */
export function laggedPairs(
  sessions: { start: number; end: number }[],
  windowStart: number,
  covered: boolean[] = Array(WHOOP_CONSISTENCY_DAYS + 1).fill(true),
): (SriPair | null)[] {
  const last = covered.length - 1;
  const asleep = asleepMask(sessions, windowStart, covered.length);
  const out: (SriPair | null)[] = [];
  for (let d = 0; d < last; d++) out.push(covered[d] && covered[last] ? comparePair(asleep, d, last) : null);
  return out;
}

/** WHOOP-style Sleep Consistency 0–100 from laggedPairs, or null when no pair was compared. */
export function whoopConsistency(pairs: (SriPair | null)[]): number | null {
  const all = poolPairs(pairs);
  return all === null ? null : Math.max(0, sriOf(all.same, all.pairs));
}

/** Sums pairs' counts: null when none was compared. */
export function poolPairs(pairs: (SriPair | null | undefined)[]): SriPair | null {
  let same = 0;
  let compared = 0;
  for (const p of pairs) {
    if (!p) continue;
    same += p.same;
    compared += p.pairs;
  }
  return compared === 0 ? null : { same, pairs: compared };
}

/**
 * SRI on [−100, 100], or null when no pair of consecutive covered days exists.
 * @param sessions every sleep session (main sleep and naps), unix seconds; naps count as sleep.
 * @param windowStart unix seconds where the first day starts (the pipeline uses local noon, so days run noon to noon).
 * @param covered one flag per day: false when the day has no data (band not worn), so its pairs are skipped.
 */
export function sleepRegularityIndex(
  sessions: { start: number; end: number }[],
  windowStart: number,
  covered: boolean[] = Array(sleepRegularityConfig.windowDays).fill(true),
): number | null {
  const all = poolPairs(sriPairs(sessions, windowStart, covered));
  return all === null ? null : sriOf(all.same, all.pairs);
}

/** The 0–100 display value: max(0, SRI). */
export const sriDisplay = (sri: number): number => Math.max(0, sri);

/** The display value on [0, 1], for sleep.rest()'s `consistency` parameter. */
export const sriConsistency = (sri: number | null): number | null => (sri == null ? null : sriDisplay(sri) / 100);
