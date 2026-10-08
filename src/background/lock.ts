// The run lock: one sync + scoring run at a time across the app's and the background task's JavaScript runtimes
// (WorkManager may wake the task while the app is open, in its own runtime). AsyncStorage is what both can see; the
// timestamp makes a lock left behind by a killed process expire. Not atomic (AsyncStorage has no compare-and-set), so
// it guards against the common overlap, not every race; runSync.ts adds an in-memory join within one runtime.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const LOCK_KEY = "pulse.background.lock";
/** A lock older than this is abandoned: a first 180-day import takes minutes, a killed process never releases. */
export const LOCK_STALE_MS = 20 * 60_000;

export type RunOwner = "app" | "task";
export type RunLock = { owner: RunOwner; ts: number };

/** Pure: who holds a live lock at `now` (ms), or null when it is free or stale. */
export function lockHolder(lock: RunLock | null, now: number, staleMs = LOCK_STALE_MS): RunOwner | null {
  if (!lock || !Number.isFinite(lock.ts)) return null;
  return now - lock.ts < staleMs ? lock.owner : null;
}

export async function readLock(): Promise<RunLock | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCK_KEY);
    return raw ? (JSON.parse(raw) as RunLock) : null;
  } catch {
    return null;
  }
}

/** Takes the lock for `owner`, or reports who holds it. An owner may re-take its own (the in-memory join makes that safe). */
export async function takeLock(owner: RunOwner, now = Date.now()): Promise<{ taken: true } | { taken: false; holder: RunOwner }> {
  const holder = lockHolder(await readLock(), now);
  if (holder && holder !== owner) return { taken: false, holder };
  await AsyncStorage.setItem(LOCK_KEY, JSON.stringify({ owner, ts: now } satisfies RunLock));
  return { taken: true };
}

/** Releases the lock when `owner` holds it; one the other owner took over after it went stale is left alone. */
export async function releaseLock(owner: RunOwner): Promise<void> {
  const lock = await readLock();
  if (lock && lock.owner !== owner) return;
  await AsyncStorage.removeItem(LOCK_KEY).catch(() => {});
}

/** Polls until the other owner's lock is gone or stale, or `maxMs` pass. True when free. */
export async function waitForLock(owner: RunOwner, maxMs: number, everyMs = 1500): Promise<boolean> {
  const until = Date.now() + maxMs;
  for (;;) {
    const holder = lockHolder(await readLock(), Date.now());
    if (!holder || holder === owner) return true;
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
