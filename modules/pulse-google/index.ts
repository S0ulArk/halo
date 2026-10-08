// Google sign-in through Google Play services (android/…/PulseGoogleModule.kt): an OAuth access token for the Google
// Health API's scopes, with no client secret and no refresh token on the phone. Google matches Pulse to its Android
// OAuth client by package name (app.halo.health) and signing-certificate SHA-1, so no client ID is in the code.
// Every failure is a GoogleSignInError with a typed `code` (errors.ts). Without the native module (tests, an old build)
// every call fails with "unavailable".
import { requireOptionalNativeModule } from "expo-modules-core";
import { GoogleSignInError, toSignInError } from "./errors";

export { GoogleSignInError, isSignInError, SIGN_IN_MESSAGES, signInCodeOf, toSignInError, type GoogleSignInCode } from "./errors";

export type PlayServices = "available" | "missing" | "update_required" | "updating" | "disabled" | "invalid" | "unknown";
export type Authorization = { accessToken: string; grantedScopes: string[] };

type Native = {
  playServices(): PlayServices;
  authorize(scopes: string[], interactive: boolean, account: string | null): Promise<Authorization>;
  clearToken(token: string): Promise<boolean>;
  revokeAccess(scopes: string[], email: string): Promise<boolean>;
};

const native = requireOptionalNativeModule<Native>("PulseGoogle");

const unavailable = () => new GoogleSignInError("unavailable");

/** Whether this build has the native module. */
export const isAvailable = (): boolean => native != null;

/** Google Play services' state on this phone ("unknown" without the module). */
export function playServices(): PlayServices {
  try {
    return native?.playServices() ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * An access token for `scopes`. Interactive, Google shows its account picker and consent screen when the grant needs
 * it; non-interactive (the silent re-auth before a sync) never shows anything and fails with "needs_sign_in" instead.
 * `grantedScopes` may be a subset of `scopes`: the person can untick some. `account` (an email) asks for that Google
 * account, so a phone with several never needs the picker for the silent call.
 */
export async function authorize(scopes: string[], interactive: boolean, account?: string | null): Promise<Authorization> {
  if (!native) throw unavailable();
  try {
    const r = await native.authorize(scopes, interactive, account ?? null);
    return { accessToken: r.accessToken, grantedScopes: [...(r.grantedScopes ?? [])] };
  } catch (e) {
    throw toSignInError(e);
  }
}

/** Drops `token` from Play services' cache (after the API answered 401), so the next authorize() mints a new one. */
export async function clearToken(token: string): Promise<void> {
  if (!native) throw unavailable();
  try {
    await native.clearToken(token);
  } catch (e) {
    throw toSignInError(e);
  }
}

/**
 * Revokes the grant: every scope the account gave Pulse, as removing Pulse under Google Account › Security ›
 * Third-party access does. Needs the account's email (Google names the account to revoke for).
 */
export async function revokeAccess(scopes: string[], email: string): Promise<void> {
  if (!native) throw unavailable();
  try {
    await native.revokeAccess(scopes, email);
  } catch (e) {
    throw toSignInError(e);
  }
}
