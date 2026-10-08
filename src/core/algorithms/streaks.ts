// Streaks: the current and longest unbroken runs of qualifying days, or of qualifying ISO weeks. Ported from noop's
// analytics/StreakCalculator.kt (© 2026 NoopApp, PolyForm Noncommercial 1.0.0); weeks are a phone addition (the
// Weekly Plan). Civil-day arithmetic is the TZ-free epoch day from baselines.ts, as noop's Baselines.isoEpochDay.
import { isoEpochDay } from "../scoring/baselines";

/** The current and longest consecutive runs. */
export type Streaks = { current: number; longest: number };

/** The ISO week (Monday to Sunday) an epoch day falls in, as a running index: 1970-01-05, a Monday, starts week 1. */
const weekIndex = (epochDay: number) => Math.floor((epochDay + 3) / 7);

/** Runs over a set of qualifying units; the current run ends on `now`, or on `now − 1` while `now` hasn't qualified. */
function runs(units: Set<number>, now: number | null): Streaks {
  if (units.size === 0) return { current: 0, longest: 0 };
  // Longest: start at each unit whose predecessor is absent, then count forward.
  let longest = 0;
  for (const u of units) {
    if (units.has(u - 1)) continue;
    let len = 1;
    while (units.has(u + len)) len++;
    longest = Math.max(longest, len);
  }
  let current = 0;
  if (now !== null) {
    // The grace: a day (or week) still in progress doesn't break the run until it is over.
    const anchor = units.has(now) ? now : units.has(now - 1) ? now - 1 : null;
    if (anchor !== null) {
      current = 1;
      while (units.has(anchor - current)) current++;
    }
  }
  return { current, longest };
}

/** Distinct qualifying units from parallel keys / flags; unparseable keys and the excess of the longer list are ignored. */
function unitsOf(keys: readonly string[], qualified: readonly boolean[], unit: (epochDay: number) => number): Set<number> {
  const out = new Set<number>();
  const n = Math.min(keys.length, qualified.length);
  for (let i = 0; i < n; i++) {
    if (!qualified[i]) continue;
    const e = isoEpochDay(keys[i]);
    if (e !== null) out.add(unit(e));
  }
  return out;
}

/**
 * Day streaks from parallel `dayKeys` (`YYYY-MM-DD`) and their qualify flags, as of `today`. `current` is the run
 * ending today, or yesterday while today hasn't qualified (a score lands after the night, so it must not read 0 all
 * day); a missed day ends it. `longest` is the longest run anywhere. `(0, 0)` when nothing qualifies.
 */
export function streaks(dayKeys: readonly string[], qualified: readonly boolean[], today: string): Streaks {
  return runs(
    unitsOf(dayKeys, qualified, (e) => e),
    isoEpochDay(today),
  );
}

/**
 * Week streaks: `weekKeys` is any day of each week (its Monday, usually) and `today` any day of the current week.
 * The current week counts once it qualifies; until then the run ends with last week.
 */
export function weekStreaks(weekKeys: readonly string[], qualified: readonly boolean[], today: string): Streaks {
  const t = isoEpochDay(today);
  return runs(unitsOf(weekKeys, qualified, weekIndex), t === null ? null : weekIndex(t));
}
