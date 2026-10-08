// HRV for Breathe from the band's live beat-to-beat (RR) intervals: a spot reading over a minute, before and after a
// session, and how far the heart rate swings with each paced breath. Ported from noop's analytics/SpotHrvReading.kt
// (the honesty gates: enough clean beats, not too many thrown away, otherwise no number) and ResonanceEngine.kt's
// per-pace RSA score (© 2026 NoopApp, PolyForm Noncommercial 1.0.0). The artifact rejection and the RMSSD are the
// app's own (src/health/bleHr.ts), so a spot reading agrees with the live HRV line on Home. Pure, for vitest.
//
// Display-only, like every live reading: nothing here is written to the Store.
import { cleanRr, rmssd, type RrBeat } from "@/health/bleHr";

/** Clean intervals a spot reading needs (noop's HrvAnalyzer.MIN_BEATS). */
export const SPOT_MIN_BEATS = 20;
/** More than this share of the minute thrown away as noise and the reading is refused (noop's spot gate). */
export const SPOT_MAX_REJECTED = 0.35;
/** A spot reading's window. */
export const SPOT_WINDOW_MS = 60_000;

export type SpotHrv =
  | { kind: "reading"; /** ms */ rmssd: number; /** Mean bpm over the clean beats. */ hr: number | null; beats: number }
  | { kind: "insufficient"; clean: number; needed: number; input: number };

/**
 * One spot RMSSD over `rrMs` (capture order). A number only when at least SPOT_MIN_BEATS intervals survive the
 * artifact rejection and no more than SPOT_MAX_REJECTED of them were dropped; otherwise how many survived, so the
 * screen can say "sit still" rather than show a made-up value.
 */
export function spotHrv(rrMs: readonly number[]): SpotHrv {
  const kept = cleanRr(rrMs).filter((x): x is number => x !== null);
  const insufficient: SpotHrv = { kind: "insufficient", clean: kept.length, needed: SPOT_MIN_BEATS, input: rrMs.length };
  if (kept.length < SPOT_MIN_BEATS) return insufficient;
  if ((rrMs.length - kept.length) / rrMs.length > SPOT_MAX_REJECTED) return insufficient;
  const value = rmssd(rrMs);
  if (value === null) return insufficient;
  const meanNN = kept.reduce((a, b) => a + b, 0) / kept.length;
  return { kind: "reading", rmssd: value, hr: meanNN > 0 ? 60_000 / meanNN : null, beats: kept.length };
}

/** The intervals that ended in [from, to) (epoch ms). */
export const rrIn = (beats: readonly RrBeat[], from: number, to: number): number[] => beats.filter((b) => b.t >= from && b.t < to).map((b) => b.rr);

const readingOf = (s: SpotHrv) => (s.kind === "reading" ? s.rmssd : null);

/**
 * HRV before and after a session that ran [start, end): "before" is the minute before it began (`preRr`, the live
 * buffer at the tap) or, when that minute had too few clean beats, the session's own first minute if the session is
 * long enough for the two minutes not to overlap; "after" is its last minute. Null where there is no honest reading.
 */
export function hrvBeforeAfter(preRr: readonly number[], beats: readonly RrBeat[], start: number, end: number): { before: number | null; after: number | null } {
  const pre = readingOf(spotHrv(preRr));
  const length = end - start;
  const firstMinute = pre === null && length >= 2 * SPOT_WINDOW_MS ? readingOf(spotHrv(rrIn(beats, start, start + SPOT_WINDOW_MS))) : null;
  const before = pre ?? firstMinute;
  // With the first minute standing in for "before", "after" starts where it ended at the earliest.
  const afterFrom = Math.max(end - SPOT_WINDOW_MS, pre === null && firstMinute !== null ? start + SPOT_WINDOW_MS : start);
  const after = readingOf(spotHrv(rrIn(beats, afterFrom, end + 1)));
  return { before, after };
}

// ── RSA amplitude (ResonanceEngine.scorePace) ────────────────────────────────

/** The settling time dropped from the start before the swing is measured (noop: 30 s), at most a quarter of the session. */
export const TRANSIENT_MS = 30_000;
/** Paced breaths with a measurable swing needed before the mean means anything. */
export const MIN_SWING_CYCLES = 3;

export type Rsa = { /** Mean peak-to-trough heart rate per breath, bpm; null when unscored. */ rsa: number | null; cycles: number; beats: number };

/**
 * Respiratory sinus arrhythmia over a paced session: the heart speeds up on the inhale and slows on the exhale, so
 * within each paced breath the instantaneous heart rate (60000 / RR) swings; the mean swing is the RSA amplitude,
 * and it peaks at the resonance pace. Unlike noop, which buckets breaths from the first clean beat, breaths here are
 * the paced cycles themselves (we know when each began): after the settling time, rounded up to a breath boundary,
 * each whole cycle inside [start, end) with two or more clean beats gives one swing. Fewer than SPOT_MIN_BEATS clean
 * beats or MIN_SWING_CYCLES swings leave it unscored.
 */
export function rsaAmplitude(beats: readonly RrBeat[], start: number, end: number, cycleMs: number): Rsa {
  if (!(cycleMs > 0) || !(end > start)) return { rsa: null, cycles: 0, beats: 0 };
  const settle = Math.min(TRANSIENT_MS, (end - start) / 4);
  const from = start + Math.ceil(settle / cycleMs) * cycleMs;
  const steady = beats.filter((b) => b.t >= from && b.t < end).sort((a, b) => a.t - b.t);
  const clean = cleanRr(steady.map((b) => b.rr));
  const kept = steady.filter((_, k) => clean[k] !== null);
  if (kept.length < SPOT_MIN_BEATS) return { rsa: null, cycles: 0, beats: kept.length };
  const byCycle = new Map<number, { hi: number; lo: number; n: number }>();
  for (const b of kept) {
    const k = Math.floor((b.t - from) / cycleMs);
    // Only whole breaths: one cut short by the end would understate its swing.
    if (from + (k + 1) * cycleMs > end) continue;
    const hr = 60_000 / b.rr;
    const c = byCycle.get(k);
    if (c) {
      c.hi = Math.max(c.hi, hr);
      c.lo = Math.min(c.lo, hr);
      c.n++;
    } else byCycle.set(k, { hi: hr, lo: hr, n: 1 });
  }
  const swings = [...byCycle.values()].filter((c) => c.n >= 2).map((c) => c.hi - c.lo);
  if (swings.length < MIN_SWING_CYCLES) return { rsa: null, cycles: swings.length, beats: kept.length };
  return { rsa: swings.reduce((a, b) => a + b, 0) / swings.length, cycles: swings.length, beats: kept.length };
}
