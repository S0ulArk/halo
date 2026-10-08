// What the Google source keeps between syncs, outside the Store (it describes the Google account, not Pulse's rows),
// in AsyncStorage like the Health Connect import's state (src/health/importState.ts): the connected account and the
// scopes it granted, and each data type's sync cursor and last outcome (the web's sync_state rows).
import AsyncStorage from "@react-native-async-storage/async-storage";

export const CONNECTION_KEY = "pulse.google.connection";
export const SYNC_KEY = "pulse.google.sync";

/** The Google account Pulse reads. No token: Google Play services keeps the grant and hands out tokens. */
export type GoogleConnection = {
  /** The account's email (userinfo), or null when Google didn't say. */
  email: string | null;
  /** The scopes the account granted; the silent sign-in before each sync asks for exactly these. */
  scopes: string[];
  /** Epoch ms of the Connect that made it. */
  connectedAt: number;
};

/** One data type's progress (the web's sync_state row). Times are unix seconds. */
export type JobState = {
  /** The end of the last window written; null before the first. */
  syncedThrough: number | null;
  /** First-sync progress in local days, `backfillDone` of `backfillTotal`. */
  backfillDone: number;
  backfillTotal: number;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  /** The GoogleError's safe message ("[google] sleep: INVALID_ARGUMENT (HTTP 400)"), or null. */
  lastError: string | null;
  /** A type Google refuses to serve (a roll-up it doesn't offer) is left alone until then. */
  skipUntil?: number | null;
};

export type SyncDoc = {
  /** The importer's mapping version the cursors were written under (sync.ts GOOGLE_IMPORT_VERSION). */
  version: number;
  jobs: Record<string, JobState>;
  /** The last clear paired-device answer: "none" says the account has no Fitbit paired in Google Health. */
  devices: "some" | "none" | null;
};

export const EMPTY_SYNC_DOC: SyncDoc = { version: 0, jobs: {}, devices: null };

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function readConnection(): Promise<GoogleConnection | null> {
  const c = await readJson<Partial<GoogleConnection>>(CONNECTION_KEY);
  if (!c || !Array.isArray(c.scopes) || typeof c.connectedAt !== "number") return null;
  return { email: typeof c.email === "string" ? c.email : null, scopes: c.scopes.filter((s): s is string => typeof s === "string"), connectedAt: c.connectedAt };
}

export async function saveConnection(c: GoogleConnection): Promise<void> {
  await AsyncStorage.setItem(CONNECTION_KEY, JSON.stringify(c));
}

export async function clearConnection(): Promise<void> {
  await AsyncStorage.multiRemove([CONNECTION_KEY]).catch(() => {});
}

export async function readSyncDoc(): Promise<SyncDoc> {
  const d = await readJson<Partial<SyncDoc>>(SYNC_KEY);
  if (!d || typeof d.jobs !== "object" || d.jobs === null) return { ...EMPTY_SYNC_DOC, jobs: {} };
  return { version: typeof d.version === "number" ? d.version : 0, jobs: d.jobs, devices: d.devices === "some" || d.devices === "none" ? d.devices : null };
}

export async function writeSyncDoc(d: SyncDoc): Promise<void> {
  await AsyncStorage.setItem(SYNC_KEY, JSON.stringify(d)).catch(() => {});
}

/**
 * Forget every cursor, so the next sync backfills the whole history window again. Call whenever the Store's imported
 * rows are cleared (another source, demo data, Remove all data) or the account changes.
 */
export async function forgetGoogleSync(): Promise<void> {
  await AsyncStorage.multiRemove([SYNC_KEY]).catch(() => {});
}
