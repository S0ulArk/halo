// Google Health API v4 client, ported from the web app's src/server/sources/google/client.ts: local-day windows,
// pagination, a 4 req/s limiter, retries (429 waits Retry-After, 5xx and network failures back off), and one fresh
// token after a 401. Two differences on the phone:
//   • No client secret and no refresh token. `token(force)` asks Google Play services for the access token
//     (src/google/auth.ts); `force`, after a 401, drops the cached one first. A second 401 is `auth_revoked`.
//   • No raw archive: the web keeps a week of pages as evidence for schema drift; the phone keeps only its rows.
//
// Times are unix seconds and days are local `YYYY-MM-DD`, as in the Store. Errors carry status and code only, never
// a token or a body.
import { addDays, localDay, localMidnight, wall } from "@/lib/time";
import { DATA_TYPES, type DataType, type DataTypeId, type FilterMember } from "./catalogue";

const API = "https://health.googleapis.com/v4/users/me/dataTypes";
const DEVICES_API = "https://health.googleapis.com/v4/users/me/pairedDevices";
/** Answers 200 for an account with a Google Health profile, ACCOUNT_NOT_LINKED for one without (the web's requireHealthProfile). */
export const IDENTITY_URL = "https://health.googleapis.com/v4/users/me/identity";
/** The signed-in account's email (the userinfo.email scope), to name the connected account in Settings. */
export const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
/** Revokes a token and the grant behind it (Disconnect). */
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const MIN_GAP_MS = 250; // 4 req/s, under the documented 5 QPS per user
const MAX_TRIES = 5; // per request, for 429, 5xx and network failures
const BACKOFF_MS = 1000;
// Longest Retry-After waited out inside a run. A longer one fails the type now; the next sync tries again, so a quota
// hit can't hold one run for hours (5 tries x many requests x a long wait).
const MAX_WAIT_MS = 60_000;
const MAX_PAGES = 1000; // a nextPageToken that never advances must not loop forever
/** Longest dailyRollUp range: every roll-up-only type uses 14 days (Hælan's probe); a daily type's 90-day list window is not assumed. */
const ROLLUP_MAX_DAYS = 14;
export const FETCH_TIMEOUT_MS = 30_000;

// --- Errors -------------------------------------------------------------------------------------

/**
 * `code` is ours (`auth_revoked`, `network`, `http_503`, ...) or Google's own error code (`INVALID_ARGUMENT`,
 * `ACCOUNT_NOT_LINKED`). Safe to store and to log: never a token or a body.
 */
export class GoogleError extends Error {
  override name = "GoogleError";
  constructor(
    readonly code: string,
    readonly status?: number,
    readonly where?: string,
  ) {
    super(`[google] ${where ? `${where}: ` : ""}${code}${status ? ` (HTTP ${status})` : ""}`);
  }
}

/** JSON.parse that never throws (its own error quotes the input, which could be a body). */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Google's error code from a token-endpoint (`{error: "invalid_grant"}`) or API (`{error: {status, details}}`) body. */
export function errorCode(body: unknown): string | undefined {
  const e = (body as { error?: unknown } | null | undefined)?.error;
  const { details, status } = (e ?? {}) as { status?: unknown; details?: unknown };
  const reason = Array.isArray(details) ? (details.find((d) => (d as { reason?: unknown } | null)?.reason) as { reason?: unknown } | undefined)?.reason : undefined;
  const code = typeof e === "string" ? e : (reason ?? status);
  // Only enum-shaped codes: a free-text field must never reach a log.
  return typeof code === "string" && /^[A-Za-z_]{1,64}$/.test(code) ? code : undefined;
}

// --- Local days ---------------------------------------------------------------------------------

/** The first local midnight at or after `s`. */
function ceilMidnight(s: number, tz: string): number {
  const m = localMidnight(localDay(s, tz), tz);
  return m >= s ? m : localMidnight(addDays(localDay(s, tz), 1), tz);
}

export type TimeWindow = { start: number; end: number };

/** Splits [from, to) at local midnights into windows of at most `maxDays` local days, with no gap or overlap. */
export function localWindows(from: number, to: number, maxDays: number, tz: string): TimeWindow[] {
  const out: TimeWindow[] = [];
  let day = localDay(from, tz);
  for (let start = from; start < to; ) {
    day = addDays(day, maxDays);
    const end = Math.min(to, localMidnight(day, tz));
    if (end <= start) continue; // only in a zone whose midnight falls in a DST gap
    out.push({ start, end });
    start = end;
  }
  return out;
}

const civilDate = (day: string) => {
  const [year, month, d] = day.split("-").map(Number);
  return { date: { year, month, day: d } };
};

/** `<snake_type>.<member> >= X AND < Y`. Civil members are written in `tz`; `date` rounds the end up to a whole day. */
export function buildFilter(type: DataTypeId, member: FilterMember, w: TimeWindow, tz: string): string {
  const field = `${type.replaceAll("-", "_")}.${member}`;
  const [lo, hi] =
    member === "date"
      ? [localDay(w.start, tz), localDay(ceilMidnight(w.end, tz), tz)]
      : member === "interval.civil_start_time"
        ? [w.start, w.end].map((s) => {
            const { day, time } = wall(s, tz);
            return `${day}T${time}`;
          })
        : [w.start, w.end].map((s) => new Date(s * 1000).toISOString());
  // "Only filtering by start time is supported for ECG", and only with >= (dataPoints.list reference).
  if (type === "electrocardiogram") return `${field} >= "${lo}"`;
  return `${field} >= "${lo}" AND ${field} < "${hi}"`;
}

/** `a=1&b=2`, encoded by hand: React Native's URLSearchParams is partial. */
const query = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

/** An abort signal that fires after `ms` (AbortSignal.timeout isn't on every runtime). */
function timeout(ms: number): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(timer) };
}

// --- Paired devices -----------------------------------------------------------------------------

export type DeviceCheck = "some" | "none" | "unknown";

/**
 * A `pairedDevices.list` body as "some", "none" or "unknown". The documented shape is
 * `{ pairedDevices: [...], nextPageToken? }`, and proto3 JSON drops an empty list, so `{}` is "none".
 * Anything else (not an object, `pairedDevices` not an array, fields we don't know) is "unknown",
 * never "none": a shape change must not tell a person their band is missing.
 */
export function parsePairedDevices(body: string): DeviceCheck {
  const j = parseJson(body);
  if (typeof j !== "object" || j === null || Array.isArray(j)) return "unknown";
  const { pairedDevices: list = [], ...rest } = j as Record<string, unknown>;
  if (!Array.isArray(list)) return "unknown";
  if (list.length) return "some";
  return Object.keys(rest).length ? "unknown" : "none";
}

// --- Client -------------------------------------------------------------------------------------

/** The access token; `force` after a 401: drop the cached one and get a new one. May throw a GoogleSignInError. */
export type TokenProvider = (force: boolean) => Promise<string>;

export type ClientDeps = {
  token: TokenProvider;
  timeZone: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds. */
  now?: () => number;
  /** Attempts per request for 429, 5xx and network failures. 1: fail fast, no waiting (the live heart-rate pull). */
  maxTries?: number;
};

/** Whether the account behind the token has a Google Health profile, and whether the project has the API on. */
export type IdentityCheck = "linked" | "not_linked" | "api_disabled" | "unknown";

/** Create one per sync run: the 4 req/s limiter lives in the instance. */
export function createGoogleClient({
  token: getToken,
  timeZone: tz,
  fetch: fetchFn = (...args) => fetch(...args),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now,
  maxTries = MAX_TRIES,
}: ClientDeps) {
  let nextSlot = 0;
  async function throttle() {
    const t = now();
    const wait = Math.max(0, nextSlot - t);
    nextSlot = Math.max(t, nextSlot) + MIN_GAP_MS;
    if (wait) await sleep(wait);
  }

  function retryAfterMs(header: string | null): number | undefined {
    if (!header) return undefined;
    const ms = /^\d+$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - now();
    return Number.isNaN(ms) ? undefined : ms;
  }

  const codeOf = async (res: Response) => errorCode(parseJson(await res.text().catch(() => "")));

  /** The 200 body. One fresh token on 401, then `auth_revoked`; 429 waits Retry-After; 5xx and network failures back off. */
  async function request(url: string, where: string, body?: string): Promise<string> {
    let tries = 0; // failed attempts that may be retried: 429, 5xx, network
    let refreshed = false;
    let force = false; // set for the one attempt right after a 401
    for (;;) {
      const token = await getToken(force);
      force = false;
      await throttle();
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      if (body !== undefined) headers["content-type"] = "application/json";
      const t = timeout(FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetchFn(url, { method: body !== undefined ? "POST" : "GET", headers, body, signal: t.signal });
        // Inside the try: a body cut off mid-read is a network failure too.
        if (res.ok) return await res.text();
      } catch {
        if (++tries >= maxTries) throw new GoogleError("network", undefined, where);
        await sleep(BACKOFF_MS * 2 ** (tries - 1));
        continue;
      } finally {
        t.done();
      }
      const { status } = res;
      if (status === 401) {
        if (refreshed) throw new GoogleError("auth_revoked", status, where);
        refreshed = force = true;
        continue;
      }
      if ((status === 429 || status >= 500) && ++tries < maxTries) {
        const after = status === 429 ? retryAfterMs(res.headers.get("retry-after")) : undefined;
        if (after !== undefined && after > MAX_WAIT_MS) throw new GoogleError((await codeOf(res)) ?? "http_429", status, where);
        await sleep(Math.min(MAX_WAIT_MS, Math.max(0, after ?? BACKOFF_MS * 2 ** (tries - 1))));
        continue;
      }
      throw new GoogleError((await codeOf(res)) ?? `http_${status}`, status, where);
    }
  }

  /** Parses a 200 body; one that is not the expected envelope is an error, never "no data". */
  function readPage(body: string, key: string, where: string): { points: unknown[]; next?: string } {
    const j = parseJson(body);
    if (typeof j !== "object" || j === null) throw new GoogleError("bad_response", 200, where);
    const { [key]: pts = [], nextPageToken: next } = j as Record<string, unknown>;
    if (!Array.isArray(pts)) throw new GoogleError("bad_response", 200, where);
    return { points: pts, next: typeof next === "string" && next ? next : undefined };
  }

  /**
   * Every data point of `type` in [from, to), one page at a time to `onPage`, split into local-day windows of at most
   * the type's `maxDays`. A page is dropped once `onPage` returns, so a caller that keeps only what it maps holds one
   * page of raw points (5,000) at most.
   */
  async function listEach(type: DataTypeId, from: number, to: number, onPage: (points: unknown[]) => void | Promise<void>): Promise<void> {
    const t: DataType = DATA_TYPES[type];
    if (!t.member) throw new GoogleError("unsupported_action", undefined, `${type} list`);
    for (const w of localWindows(from, to, t.maxDays, tz)) {
      const filter = buildFilter(type, t.member, w, tz);
      let pageToken: string | undefined;
      let pages = 0;
      do {
        if (++pages > MAX_PAGES) throw new GoogleError("too_many_pages", undefined, type);
        const body = await request(`${API}/${type}/dataPoints?${query({ filter, pageSize: String(t.pageSize), pageToken })}`, type);
        const page = readPage(body, "dataPoints", type);
        await onPage(page.points);
        pageToken = page.next;
      } while (pageToken);
    }
  }

  return {
    /** Whether the account has a paired device (`users.pairedDevices.list`, one page). */
    async pairedDevices(): Promise<DeviceCheck> {
      return parsePairedDevices(await request(`${DEVICES_API}?pageSize=1`, "pairedDevices"));
    },

    /**
     * Whether the account has a Google Health profile. Only a clear ACCOUNT_NOT_LINKED (or the API switched off for the
     * project) says no; any other failure is "unknown" and passes, as on the web: a 5xx must not block sign-in.
     */
    async identity(): Promise<IdentityCheck> {
      try {
        await request(IDENTITY_URL, "identity");
        return "linked";
      } catch (e) {
        if (!(e instanceof GoogleError)) throw e;
        if (e.code === "ACCOUNT_NOT_LINKED") return "not_linked";
        if (e.code === "SERVICE_DISABLED" || e.code === "accessNotConfigured") return "api_disabled";
        if (e.code === "auth_revoked") throw e;
        return "unknown";
      }
    },

    /** The account's email (needs the userinfo.email scope), or null. */
    async userEmail(): Promise<string | null> {
      const j = parseJson(await request(USERINFO_URL, "userinfo")) as { email?: unknown } | undefined;
      return typeof j?.email === "string" && j.email.includes("@") ? j.email.toLowerCase() : null;
    },

    listEach,

    /** Every data point of `type` in [from, to), in API order. Memory holds the whole range; dense types use `listEach`. */
    async list(type: DataTypeId, from: number, to: number): Promise<unknown[]> {
      const out: unknown[] = [];
      await listEach(type, from, to, (points) => void out.push(...points));
      return out;
    },

    /**
     * `rollupDataPoints` for civil days [fromDay, toDay) (exclusive end), in ranges of at most the type's `maxDays`
     * (and ROLLUP_MAX_DAYS). One POST per range: rollups do not paginate. Days with no data are omitted.
     */
    async dailyRollUp(type: DataTypeId, fromDay: string, toDay: string): Promise<unknown[]> {
      const t: DataType = DATA_TYPES[type];
      if (!t.dailyRollUp) throw new GoogleError("unsupported_action", undefined, `${type} dailyRollUp`);
      const out: unknown[] = [];
      for (let day = fromDay; day < toDay; ) {
        const step = Math.min(t.maxDays, ROLLUP_MAX_DAYS); // a daily type's list window is longer
        const end = addDays(day, step) < toDay ? addDays(day, step) : toDay;
        const req = JSON.stringify({ range: { start: civilDate(day), end: civilDate(end) } });
        const body = await request(`${API}/${type}/dataPoints:dailyRollUp`, `${type} dailyRollUp`, req);
        out.push(...readPage(body, "rollupDataPoints", `${type} dailyRollUp`).points);
        day = end;
      }
      return out;
    },
  };
}

export type GoogleClient = ReturnType<typeof createGoogleClient>;

/**
 * Revokes `token` and the grant behind it at Google (Disconnect). True when Google confirmed, or answered 400: the
 * token was already invalid, which is the goal anyway. False when Google couldn't be reached.
 */
export async function revokeToken(token: string, fetchFn: typeof fetch = (...args) => fetch(...args)): Promise<boolean> {
  const t = timeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: query({ token }),
      signal: t.signal,
    });
    return res.ok || res.status === 400;
  } catch {
    return false;
  } finally {
    t.done();
  }
}
