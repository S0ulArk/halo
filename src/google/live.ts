// The live reading with Google as the source (the web's pullHeartRate): one heart-rate list from the newest stored
// sample, less LIVE_OVERLAP_S and never before today's local midnight, to now; written as the sync writes heart rate
// (new or changed samples only, their day marked dirty for the next scoring run). No retries: a 429 or a sign-in
// problem fails at once and the ticker tries again later. Fitbit uploads every ~15 minutes, so a pull is skipped when
// the last one was under MIN_GAP_S ago.
import type { Store } from "@/data/store";
import { localDay, localMidnight } from "@/lib/time";
import { createGoogleClient, type TokenProvider } from "./client";
import { heartRate, writer } from "./sync";

/** The live pull re-fetches from the newest stored sample minus this. */
export const LIVE_OVERLAP_S = 600;
/** Pulls closer together than this are skipped (the foreground ticker runs every minute). */
export const MIN_GAP_S = 4 * 60;

let lastPull = 0;

export type GooglePullOptions = {
  token: TokenProvider;
  timeZone: string;
  /** Unix seconds (tests); default now. */
  now?: number;
  fetch?: typeof fetch;
  /** Pull even when the last pull was under MIN_GAP_S ago. */
  force?: boolean;
};

/** Samples this pull added or changed in the Store. */
export async function pullGoogleHeartRate(store: Store, opts: GooglePullOptions): Promise<number> {
  const tz = opts.timeZone;
  const t = opts.now ?? Math.floor(Date.now() / 1000);
  if (!opts.force && t - lastPull < MIN_GAP_S && t >= lastPull) return 0;
  lastPull = t;
  const last = (await store.hrBounds())?.last ?? 0;
  const start = Math.max(localMidnight(localDay(t, tz), tz), Math.floor((last - LIVE_OVERLAP_S) / 60) * 60);
  if (start >= t) return 0;
  const client = createGoogleClient({ token: opts.token, timeZone: tz, fetch: opts.fetch, maxTries: 1 });
  return writer(store, tz).writeHr(await heartRate(client, { start, end: t }));
}

/** Tests: forget the last pull's time. */
export function resetGooglePullClock(): void {
  lastPull = 0;
}
