// Google sign-in for the Google Health API source: Connect (Google's consent screen), the silent token before each sync
// and each live heart-rate pull, and Disconnect (revoke). Google Play services holds the grant (modules/pulse-google);
// Pulse keeps the account's email and the granted scopes (state.ts) and, in memory, the current access token. No client
// secret, no refresh token, nothing sent anywhere but Google.
import * as native from "../../modules/pulse-google";
import { GoogleSignInError } from "../../modules/pulse-google/errors";
import { createGoogleClient, revokeToken } from "./client";
import { clearConnection, readConnection, saveConnection, type GoogleConnection } from "./state";

const health = (s: string) => `https://www.googleapis.com/auth/googlehealth.${s}`;

/**
 * Every read scope the Google Health API has (the web's SCOPES without its write-only ones: on the phone Pulse writes
 * nothing to Google). settings.readonly is what the paired-device check needs; profile.readonly the identity check.
 */
export const HEALTH_SCOPES = [
  "activity_and_fitness.readonly",
  "health_metrics_and_measurements.readonly",
  "sleep.readonly",
  "ecg.readonly",
  "irn.readonly",
  "nutrition.readonly",
  "profile.readonly",
  "settings.readonly",
].map(health);
/** The account's email, to name the connected account in Settings. */
export const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
export const ALL_SCOPES = [...HEALTH_SCOPES, EMAIL_SCOPE];
/** What the scores need: without these Connect fails with scope_not_granted. */
export const REQUIRED_SCOPES = [health("activity_and_fitness.readonly"), health("health_metrics_and_measurements.readonly"), health("sleep.readonly")];

/** What each scope reads, for Settings' "not allowed" line. */
export const SCOPE_LABEL: Record<string, string> = {
  [health("activity_and_fitness.readonly")]: "activity",
  [health("health_metrics_and_measurements.readonly")]: "health metrics",
  [health("sleep.readonly")]: "sleep",
  [health("ecg.readonly")]: "ECG",
  [health("irn.readonly")]: "irregular rhythm",
  [health("nutrition.readonly")]: "food and water",
  [health("profile.readonly")]: "profile",
  [health("settings.readonly")]: "paired devices",
  [EMAIL_SCOPE]: "email address",
};

/** Play services' tokens last about an hour: Pulse asks again after 45 minutes, sooner after a 401. */
const TOKEN_TTL_MS = 45 * 60_000;
/** A silent sign-in Play services doesn't answer (no network) fails the run rather than holding it. */
const SILENT_TIMEOUT_MS = 45_000;

let cached: { token: string; at: number } | null = null;
let inflight: Promise<string> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GoogleSignInError("network", "Google Play services didn’t answer. Try again in a moment.")), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/**
 * The access token for the sync and the live pull, never with any UI: the cached one while it is young, else Google
 * Play services' (the silent re-auth). `force` after the API answered 401: the old token is dropped from Play
 * services' cache first, so a new one is minted. Throws GoogleSignInError ("needs_sign_in" when Google wants the
 * person: an expired or revoked grant, or no account connected).
 */
export async function googleToken(force = false): Promise<string> {
  if (force && cached) {
    const old = cached.token;
    cached = null;
    await native.clearToken(old).catch(() => {});
  }
  if (!force && cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token;
  inflight ??= (async () => {
    const conn = await readConnection();
    if (!conn) throw new GoogleSignInError("needs_sign_in");
    const r = await withTimeout(native.authorize(conn.scopes.length ? conn.scopes : ALL_SCOPES, false, conn.email), SILENT_TIMEOUT_MS);
    cached = { token: r.accessToken, at: Date.now() };
    return r.accessToken;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export type ConnectResult = {
  connection: GoogleConnection;
  /** Optional scopes the person left unticked (ECG, food…): those types sync nothing until a new Connect. */
  missing: string[];
  /** Another account than the one connected before: what Pulse imported from the old one should go. */
  changedAccount: boolean;
};

/**
 * Connect: Google's account picker and consent screen (interactive authorize), then two checks before anything is
 * saved: the scopes the scores need were granted, and the account has a Google Health profile (and the Cloud project
 * has the API on). Throws GoogleSignInError with a typed code.
 */
export async function connectGoogleAccount(): Promise<ConnectResult> {
  const r = await native.authorize(ALL_SCOPES, true);
  const granted = r.grantedScopes;
  const lacking = REQUIRED_SCOPES.filter((s) => !granted.includes(s));
  if (lacking.length) throw new GoogleSignInError("scope_not_granted", undefined, lacking.map((s) => SCOPE_LABEL[s] ?? s).join(", "));
  cached = { token: r.accessToken, at: Date.now() };

  const client = createGoogleClient({ token: async () => r.accessToken, timeZone: "UTC", maxTries: 2 });
  const identity = await client.identity().catch(() => "unknown" as const);
  if (identity === "not_linked") throw new GoogleSignInError("account_not_linked");
  if (identity === "api_disabled") throw new GoogleSignInError("api_disabled");
  const email = granted.includes(EMAIL_SCOPE) ? await client.userEmail().catch(() => null) : null;

  const previous = await readConnection();
  const scopes = ALL_SCOPES.filter((s) => granted.includes(s));
  const connection: GoogleConnection = { email, scopes, connectedAt: Date.now() };
  await saveConnection(connection);
  return {
    connection,
    missing: HEALTH_SCOPES.filter((s) => !granted.includes(s)),
    changedAccount: !!previous?.email && !!email && previous.email !== email,
  };
}

/**
 * Disconnect: revokes the grant at Google (every scope, as removing Pulse under Google Account › Security ›
 * Third-party access does) and forgets the account here. `revoked` is false when Google couldn't be reached; the
 * account is forgotten on the phone anyway, and access can be removed from the Google Account page.
 */
export async function disconnectGoogleAccount(): Promise<{ revoked: boolean }> {
  const conn = await readConnection();
  let token = cached?.token ?? null;
  if (!token && conn) token = await withTimeout(native.authorize(conn.scopes.length ? conn.scopes : ALL_SCOPES, false, conn.email), SILENT_TIMEOUT_MS).then((r) => r.accessToken, () => null);
  let revoked = token ? await revokeToken(token) : false;
  if (conn?.email) revoked = (await native.revokeAccess(conn.scopes.length ? conn.scopes : ALL_SCOPES, conn.email).then(() => true, () => false)) || revoked;
  if (token) await native.clearToken(token).catch(() => {});
  cached = null;
  await clearConnection();
  return { revoked };
}

/** Forgets the token kept in memory (Remove all data, another source). */
export function forgetGoogleToken(): void {
  cached = null;
}

export { readConnection as googleConnection };
export const googleSignInAvailable = native.isAvailable;
export const playServices = native.playServices;
