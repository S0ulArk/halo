// Whether a launch needs the launch sync (an import and a rescore, seconds of JS work). Pure, for the tests.
import { localDay } from "@/lib/time";

/** A launch this soon after the last import skips the launch sync (the same 10 minutes as a return from the background). */
export const FRESH_SYNC_S = 10 * 60;

/** Imported under FRESH_SYNC_S ago (by the app or the background task) and still the same local day. */
export const syncedRecently = (lastSyncTs: number | null, timeZone: string, now = Date.now() / 1000): boolean =>
  lastSyncTs != null && now >= lastSyncTs && now - lastSyncTs < FRESH_SYNC_S && localDay(lastSyncTs, timeZone) === localDay(now, timeZone);
