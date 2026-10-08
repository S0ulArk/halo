// The typed errors of Google sign-in, kept apart from index.ts so code that only needs the types and messages (and its
// tests, which can't load the native module) imports nothing native.

export type GoogleSignInCode =
  /** No Android OAuth client in Google Cloud matches Pulse's package and signing certificate (or no consent screen). */
  | "not_configured"
  /** The person backed out of Google's consent screen. */
  | "cancelled"
  /** Google Play services is missing, off, updating or too old. */
  | "no_play_services"
  /** Google didn't grant the scopes Pulse needs (the person unticked them). */
  | "scope_not_granted"
  /** The silent sign-in before a sync needs the person: a grant that expired or was revoked, or a new scope. */
  | "needs_sign_in"
  /** The Google account has no Google Health profile (never set up, or a Fitbit account not moved to Google). */
  | "account_not_linked"
  /** The Google Cloud project doesn't have the Google Health API enabled. */
  | "api_disabled"
  /** Google couldn't be reached. */
  | "network"
  /** An interactive sign-in with no screen to show it on. */
  | "no_activity"
  /** No native module (an old build, tests). */
  | "unavailable"
  | "failed";

/** What each failure tells the person. Setup steps live in README.md › "Google account setup". */
export const SIGN_IN_MESSAGES: Record<GoogleSignInCode, string> = {
  not_configured:
    "Google sign-in isn’t set up for Halo yet. In Google Cloud: enable the Google Health API, set up the OAuth consent screen (External, Testing) with your Google account as a test user and the Google Health scopes, then create an Android OAuth client for app.halo.health with Halo’s SHA-1. The steps are in the README under “Google account setup”.",
  cancelled: "Google sign-in was cancelled. If Google said access was blocked, add your Google account as a test user on the OAuth consent screen and try again.",
  no_play_services: "Google sign-in needs Google Play services, which isn’t available or needs an update on this phone.",
  scope_not_granted: "Google didn’t give Halo access to your activity, health metrics and sleep. Connect again and tick every box.",
  needs_sign_in: "Google needs you to sign in again. Tap Connect under Settings › Data source.",
  account_not_linked: "That Google account has no Google Health profile. Sign in to the Google Health app with it first, or connect the account your Fitbit uses.",
  api_disabled: "The Google Health API isn’t enabled in your Google Cloud project. Enable it under APIs & Services › Library, then connect again.",
  network: "Couldn’t reach Google. Check the connection and try again.",
  no_activity: "Open Halo to sign in with Google.",
  unavailable: "This build of Halo can’t sign in with Google. Install the latest APK.",
  failed: "Google sign-in failed.",
};

export class GoogleSignInError extends Error {
  override name = "GoogleSignInError";
  constructor(
    readonly code: GoogleSignInCode,
    message?: string,
    /** The native or HTTP detail behind it ("status 8"), for logs and the "failed" message. */
    readonly detail?: string,
  ) {
    super(message ?? (code === "failed" && detail ? detail : SIGN_IN_MESSAGES[code]));
  }
}

/** The native module's rejection codes (PulseGoogleModule.kt). */
const NATIVE_CODES: Record<string, GoogleSignInCode> = {
  ERR_NOT_CONFIGURED: "not_configured",
  ERR_CANCELLED: "cancelled",
  ERR_NO_PLAY_SERVICES: "no_play_services",
  ERR_SCOPE_NOT_GRANTED: "scope_not_granted",
  ERR_NEEDS_SIGN_IN: "needs_sign_in",
  ERR_NO_ACTIVITY: "no_activity",
  ERR_NETWORK: "network",
  ERR_AUTHORIZE_FAILED: "failed",
};

/** Any rejection as a GoogleSignInError: the native module's coded errors by their code, anything else as "failed". */
export function toSignInError(e: unknown): GoogleSignInError {
  if (e instanceof GoogleSignInError) return e;
  const native = (e as { code?: unknown } | null)?.code;
  const message = e instanceof Error ? e.message : String(e);
  const code = typeof native === "string" ? NATIVE_CODES[native] : undefined;
  return code ? new GoogleSignInError(code, undefined, message) : new GoogleSignInError("failed", undefined, message);
}

export const isSignInError = (e: unknown, ...codes: GoogleSignInCode[]): e is GoogleSignInError =>
  e instanceof GoogleSignInError && (codes.length === 0 || codes.includes(e.code));

/**
 * The code behind a sign-in failure's message, as saved in the Store's sync state (lastError) after a failed run, so
 * Settings can offer Connect again; null for any other message.
 */
export function signInCodeOf(message: string | null | undefined): GoogleSignInCode | null {
  if (!message) return null;
  return (Object.keys(SIGN_IN_MESSAGES) as GoogleSignInCode[]).find((k) => k !== "failed" && SIGN_IN_MESSAGES[k] === message) ?? null;
}
