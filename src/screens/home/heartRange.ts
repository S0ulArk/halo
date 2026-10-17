// The Heart Rate card's numbers, kept apart from the card so the tests run them in node: how long ago a reading was
// taken, and the recent readings gathered into equal stretches, each with its lowest and highest bpm (the range
// capsules Apple Health draws).
import { ago, clock } from "@/lib/format";
import { localDay } from "@/lib/time";

/** One stretch of readings: its lowest and highest bpm. */
export type BpmRange = { min: number; max: number };

/** "2 minutes ago" under an hour; "Updated 14:32" later the same day; "14 hours ago" / "2 days ago" beyond. */
export function readingAge(ts: number, now: number, timeZone: string) {
  const ms = ts * 1000;
  if (now - ms < 60 * 60_000) return ago(ms, now);
  if (localDay(ts, timeZone) === localDay(Math.floor(now / 1000), timeZone)) return `Updated ${clock(ms, timeZone)}`;
  return ago(ms, now);
}

/**
 * The `minutes` of readings (unix seconds) ending at the newest one, as `slots` equal stretches, oldest first: each
 * stretch's low and high, or null where it holds no reading (a gap stays a gap).
 */
export function rangeSlots(samples: readonly { ts: number; bpm: number }[], latestTs: number, slots: number, minutes: number): (BpmRange | null)[] {
  const out: (BpmRange | null)[] = Array.from({ length: Math.max(0, slots) }, () => null);
  if (!(slots > 0) || !(minutes > 0)) return out;
  const span = (minutes * 60) / slots;
  const start = latestTs - minutes * 60;
  for (const s of samples) {
    if (s.ts <= start || s.ts > latestTs || !(s.bpm > 0)) continue;
    const k = Math.min(slots - 1, Math.floor((s.ts - start) / span));
    const r = out[k];
    out[k] = r ? { min: Math.min(r.min, s.bpm), max: Math.max(r.max, s.bpm) } : { min: s.bpm, max: s.bpm };
  }
  return out;
}
