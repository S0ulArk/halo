// The web app's client.test.ts over a mocked fetch and a fake clock, minus its raw archive (the phone keeps none) and
// its server-side token refresh: here a token provider stands in for Google Play services.
import { describe, expect, it, vi } from "vitest";
import { GoogleSignInError } from "../../modules/pulse-google/errors";
import { localDay, localMidnight } from "@/lib/time";
import { DATA_TYPE_IDS, DATA_TYPES } from "./catalogue";
import { buildFilter, createGoogleClient, errorCode, GoogleError, localWindows, parsePairedDevices, revokeToken } from "./client";

const TZ = "Asia/Kolkata"; // UTC+5:30, so a UTC date and the local date differ before 05:30
const NOW = Date.parse("2026-10-02T06:00:00Z");
const DAY = 86_400;
const lm = (day: string, tz = TZ) => localMidnight(day, tz);
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

/** A client over a stubbed fetch, a fake clock that only sleep advances, and a token provider that counts. */
function setup(api: Handler, tokenFn?: (force: boolean) => Promise<string>) {
  let clock = NOW;
  const sleeps: number[] = [];
  const calls: { url: URL; init: RequestInit }[] = [];
  let n = 1;
  const token = vi.fn(tokenFn ?? (async (force: boolean) => `at-${force ? ++n : n}`));
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return api(url, init);
  }) as unknown as typeof globalThis.fetch;
  const client = createGoogleClient({
    token,
    timeZone: TZ,
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { client, sleeps, calls, token };
}

const filters = (calls: { url: URL }[]) => calls.map((c) => c.url.searchParams.get("filter"));
const auth = (c: { init: RequestInit }) => (c.init.headers as Record<string, string>).authorization;
const caught = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e as GoogleError,
  );

describe("catalogue", () => {
  it("every listable type has a filter member, and only rollup types lack one", () => {
    for (const id of DATA_TYPE_IDS) {
      const t = DATA_TYPES[id];
      expect(t.member !== null || t.dailyRollUp, id).toBe(true);
      expect(t.maxDays, id).toBeGreaterThan(0);
    }
    expect(DATA_TYPES["total-calories"]).toMatchObject({ member: null, dailyRollUp: true, maxDays: 14 });
    expect(DATA_TYPES["heart-rate"].maxDays).toBe(14);
    expect(DATA_TYPES.sleep.pageSize).toBe(25);
    expect(DATA_TYPES.exercise.pageSize).toBe(25);
  });
});

describe("local days", () => {
  it("localDay and localMidnight use the configured zone, not UTC", () => {
    expect(lm("2026-09-10")).toBe(Date.parse("2026-09-09T18:30:00Z") / 1000);
    expect(localDay(Date.parse("2026-09-09T19:00:00Z") / 1000, TZ)).toBe("2026-09-10");
  });

  it("a 30-day window splits into 14 + 14 + 2 local days, with no gap or overlap", () => {
    expect(localWindows(lm("2026-09-01"), lm("2026-10-01"), 14, TZ)).toEqual([
      { start: lm("2026-09-01"), end: lm("2026-09-15") },
      { start: lm("2026-09-15"), end: lm("2026-09-29") },
      { start: lm("2026-09-29"), end: lm("2026-10-01") },
    ]);
  });

  it("a mid-day start ends its first window at the next local midnight boundary", () => {
    const from = lm("2026-09-10") + 10 * 3600;
    expect(localWindows(from, lm("2026-09-12") + 60, 1, TZ)).toEqual([
      { start: from, end: lm("2026-09-11") },
      { start: lm("2026-09-11"), end: lm("2026-09-12") },
      { start: lm("2026-09-12"), end: lm("2026-09-12") + 60 },
    ]);
  });

  it("day windows follow local midnight across a DST change (23 h day)", () => {
    const tz = "Europe/London"; // clocks go forward on 2026-03-29
    const w = localWindows(lm("2026-03-28", tz), lm("2026-03-31", tz), 1, tz);
    expect(w.map((x) => (x.end - x.start) / 3600)).toEqual([24, 23, 24]);
    expect(w.map((x) => localDay(x.start, tz))).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
  });

  it("an empty or reversed range has no windows", () => {
    expect(localWindows(100, 100, 14, TZ)).toEqual([]);
    expect(localWindows(200, 100, 14, TZ)).toEqual([]);
  });
});

describe("filters", () => {
  const day = { start: lm("2026-09-10"), end: lm("2026-09-11") };

  it("daily-resting-heart-rate filters on the civil date in TZ", () => {
    expect(buildFilter("daily-resting-heart-rate", "date", day, TZ)).toBe(
      'daily_resting_heart_rate.date >= "2026-09-10" AND daily_resting_heart_rate.date < "2026-09-11"',
    );
  });

  it("a date window ending mid-day still includes that day", () => {
    const w = { start: day.start, end: day.start + 10 * 3600 };
    expect(buildFilter("daily-heart-rate-variability", "date", w, TZ)).toBe(
      'daily_heart_rate_variability.date >= "2026-09-10" AND daily_heart_rate_variability.date < "2026-09-11"',
    );
  });

  it("sleep filters on interval.end_time as instants", () => {
    expect(buildFilter("sleep", "interval.end_time", day, TZ)).toBe(
      'sleep.interval.end_time >= "2026-09-09T18:30:00.000Z" AND sleep.interval.end_time < "2026-09-10T18:30:00.000Z"',
    );
  });

  it("exercise filters on civil start time in TZ, without an offset", () => {
    expect(buildFilter("exercise", "interval.civil_start_time", day, TZ)).toBe(
      'exercise.interval.civil_start_time >= "2026-09-10T00:00:00" AND exercise.interval.civil_start_time < "2026-09-11T00:00:00"',
    );
  });

  it("ECG takes a start-time lower bound only; irregular rhythm notifications both civil bounds", () => {
    const w = { start: 1767225600, end: 1767312000 };
    expect(buildFilter("electrocardiogram", "interval.start_time", w, "UTC")).toBe('electrocardiogram.interval.start_time >= "2026-01-01T00:00:00.000Z"');
    expect(buildFilter("irregular-rhythm-notification", "interval.civil_start_time", w, "UTC")).toBe(
      'irregular_rhythm_notification.interval.civil_start_time >= "2026-01-01T00:00:00" AND irregular_rhythm_notification.interval.civil_start_time < "2026-01-02T00:00:00"',
    );
  });

  it("list sends the type's member and page size on the dataPoints path, with the bearer token", async () => {
    const { client, calls } = setup(() => json({}));
    await client.list("sleep", day.start, day.end);
    await client.list("daily-resting-heart-rate", day.start, day.end);
    const [sleep, rhr] = calls;
    expect(sleep.url.origin + sleep.url.pathname).toBe("https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints");
    expect(sleep.url.searchParams.get("pageSize")).toBe("25");
    expect(sleep.url.searchParams.get("filter")).toContain("sleep.interval.end_time >=");
    expect(rhr.url.searchParams.get("filter")).toContain('daily_resting_heart_rate.date >= "2026-09-10"');
    expect(auth(sleep)).toBe("Bearer at-1");
    expect(sleep.init.method).toBe("GET");
  });
});

describe("list", () => {
  it("follows nextPageToken, returns every point in order and stops without a token", async () => {
    const pages = [json({ dataPoints: [{ n: 1 }, { n: 2 }], nextPageToken: "p2" }), json({ dataPoints: [{ n: 3 }] })];
    const { client, calls } = setup(() => pages.shift()!);
    expect(await client.list("heart-rate", lm("2026-09-10"), lm("2026-09-11"))).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(calls.map((c) => c.url.searchParams.get("pageToken"))).toEqual([null, "p2"]);
  });

  it("listEach hands over one page at a time", async () => {
    const pages = [json({ dataPoints: [{ n: 1 }, { n: 2 }], nextPageToken: "p2" }), json({ dataPoints: [{ n: 3 }] })];
    const { client } = setup(() => pages.shift()!);
    const seen: unknown[][] = [];
    await client.listEach("sleep", lm("2026-09-10"), lm("2026-09-11"), (points) => void seen.push(points));
    expect(seen).toEqual([[{ n: 1 }, { n: 2 }], [{ n: 3 }]]);
  });

  it("a 30-day heart-rate request is three windows, 14 + 14 + 2 days", async () => {
    const { client, calls } = setup(() => json({ dataPoints: [] }));
    await client.list("heart-rate", lm("2026-09-01"), lm("2026-10-01"));
    const iso = (d: string) => new Date(lm(d) * 1000).toISOString();
    const f = (a: string, b: string) => `heart_rate.sample_time.physical_time >= "${iso(a)}" AND heart_rate.sample_time.physical_time < "${iso(b)}"`;
    expect(filters(calls)).toEqual([f("2026-09-01", "2026-09-15"), f("2026-09-15", "2026-09-29"), f("2026-09-29", "2026-10-01")]);
  });

  it("an empty body is no data (proto3 omits empty arrays)", async () => {
    const { client } = setup(() => json({}));
    expect(await client.list("weight", lm("2026-09-10"), lm("2026-09-11"))).toEqual([]);
  });

  it("refuses a rollup-only type", async () => {
    const { client, calls } = setup(() => json({}));
    expect((await caught(client.list("total-calories", 0, DAY))).code).toBe("unsupported_action");
    expect(calls).toHaveLength(0);
  });

  it("a page token that never ends stops at the page cap", async () => {
    const { client } = setup(() => json({ dataPoints: [], nextPageToken: "again" }));
    expect((await caught(client.list("steps", lm("2026-09-10"), lm("2026-09-11")))).code).toBe("too_many_pages");
  });

  it("a 200 that is not the expected envelope is an error, never quoted", async () => {
    const { client } = setup(() => new Response("<html>SECRET proxy page</html>"));
    const err = await caught(client.list("sleep", lm("2026-09-10"), lm("2026-09-11")));
    expect(err.code).toBe("bad_response");
    expect(err.message).not.toContain("SECRET");

    const { client: c2 } = setup(() => json({ dataPoints: { not: "an array" } }));
    expect((await caught(c2.list("steps", lm("2026-09-10"), lm("2026-09-11")))).code).toBe("bad_response");
  });
});

describe("retries and auth", () => {
  const range = [lm("2026-09-10"), lm("2026-09-11")] as const;

  it("429 with Retry-After waits that long, then retries", async () => {
    const res = [json({}, 429, { "retry-after": "7" }), json({ dataPoints: [{ n: 1 }] })];
    const { client, sleeps, calls } = setup(() => res.shift()!);
    expect(await client.list("steps", ...range)).toEqual([{ n: 1 }]);
    expect(sleeps).toEqual([7000]);
    expect(calls).toHaveLength(2);
  });

  it("429 asking to wait longer than a minute fails the type instead of stalling the run", async () => {
    const { client, calls } = setup(() => json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429, { "retry-after": "3600" }));
    await expect(client.list("weight", 0, 86_400)).rejects.toMatchObject({ code: "RESOURCE_EXHAUSTED", status: 429 });
    expect(calls).toHaveLength(1);
  });

  it("429 with an HTTP-date Retry-After waits until then", async () => {
    const at = new Date(NOW + 3000).toUTCString();
    const res = [json({}, 429, { "retry-after": at }), json({})];
    const { client, sleeps } = setup(() => res.shift()!);
    await client.list("steps", ...range);
    expect(sleeps).toEqual([3000]);
  });

  it("5xx and network failures back off exponentially", async () => {
    let n = 0;
    const { client, sleeps } = setup(() => {
      n++;
      if (n === 2) throw new TypeError("Network request failed");
      return n < 4 ? json({}, 503) : json({});
    });
    await client.list("steps", ...range);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it("gives up after five attempts with the status", async () => {
    const { client, calls } = setup(() => json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429));
    const err = await caught(client.list("steps", ...range));
    expect(err).toMatchObject({ code: "RESOURCE_EXHAUSTED", status: 429 });
    expect(calls).toHaveLength(5);
  });

  it("five network failures are a `network` error", async () => {
    const { client, calls } = setup(() => {
      throw new TypeError("Network request failed");
    });
    expect((await caught(client.list("steps", ...range))).code).toBe("network");
    expect(calls).toHaveLength(5);
  });

  it("401 asks for a fresh token once and retries with it", async () => {
    const res = [json({}, 401), json({ dataPoints: [{ n: 1 }] })];
    const { client, calls, token } = setup(() => res.shift()!);
    expect(await client.list("steps", ...range)).toEqual([{ n: 1 }]);
    expect(token.mock.calls.map(([force]) => force)).toEqual([false, true]);
    expect(calls.map(auth)).toEqual(["Bearer at-1", "Bearer at-2"]);
  });

  it("a second 401 is auth_revoked", async () => {
    const { client, calls } = setup(() => json({}, 401));
    expect(await caught(client.list("steps", ...range))).toMatchObject({ code: "auth_revoked", status: 401 });
    expect(calls).toHaveLength(2);
  });

  it("a token Google Play services can't give stops the request before it is sent", async () => {
    const { client, calls } = setup(
      () => json({}),
      async () => {
        throw new GoogleSignInError("needs_sign_in");
      },
    );
    await expect(client.list("steps", ...range)).rejects.toMatchObject({ name: "GoogleSignInError", code: "needs_sign_in" });
    expect(calls).toHaveLength(0);
  });

  it("a failing request's error holds status and code only: no token, no body text", async () => {
    const body = { error: { code: 400, message: "bad filter SECRET-BODY near at-1", status: "INVALID_ARGUMENT", details: [] } };
    const { client } = setup(() => json(body, 400));
    const err = await caught(client.list("sleep", ...range));
    expect(err).toMatchObject({ code: "INVALID_ARGUMENT", status: 400 });
    expect(err.message).toBe("[google] sleep: INVALID_ARGUMENT (HTTP 400)");
    const everything = `${err.message} ${err.stack} ${JSON.stringify(err)} ${String(err.cause)}`;
    for (const secret of ["SECRET-BODY", "at-1"]) expect(everything).not.toContain(secret);
  });

  it("prefers a machine-readable reason, and ignores a free-text code", async () => {
    const { client } = setup(() => json({ error: { status: "INVALID_ARGUMENT", details: [{ reason: "INVALID_ROLLUP_QUERY_DURATION" }] } }, 400));
    expect((await caught(client.dailyRollUp("steps", "2026-09-10", "2026-09-11"))).code).toBe("INVALID_ROLLUP_QUERY_DURATION");
    const { client: c2 } = setup(() => json({ error: { status: "some text with SECRET" } }, 400));
    expect((await caught(c2.list("steps", ...range))).code).toBe("http_400");
    expect(errorCode({ error: "invalid_grant" })).toBe("invalid_grant");
    expect(errorCode(undefined)).toBeUndefined();
  });
});

describe("limiter", () => {
  it("spaces requests 250 ms apart (4 per second)", async () => {
    const { client, sleeps } = setup(() => json({}));
    for (let i = 0; i < 5; i++) await client.list("steps", lm("2026-09-10"), lm("2026-09-11"));
    expect(sleeps).toEqual([250, 250, 250, 250]);
  });

  it("does not wait when requests are already slower than the limit", async () => {
    const { client, sleeps } = setup(() => json({}, 503));
    await caught(client.list("steps", lm("2026-09-10"), lm("2026-09-11")));
    expect(sleeps).toEqual([1000, 2000, 4000, 8000]);
  });
});

describe("dailyRollUp", () => {
  it("POSTs civil ranges of at most 14 days, exclusive end, and concatenates rollupDataPoints", async () => {
    const { client, calls } = setup(() => json({ rollupDataPoints: [{ n: 1 }] }));
    expect(await client.dailyRollUp("total-calories", "2026-09-01", "2026-10-01")).toEqual([{ n: 1 }, { n: 1 }, { n: 1 }]);
    expect(calls[0].url.pathname).toBe("/v4/users/me/dataTypes/total-calories/dataPoints:dailyRollUp");
    expect(calls[0].init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    const ranges = calls.map((c) => JSON.parse(String(c.init.body)).range);
    const d = (day: number, month = 9) => ({ date: { year: 2026, month, day } });
    expect(ranges).toEqual([
      { start: d(1), end: d(15) },
      { start: d(15), end: d(29) },
      { start: d(29), end: d(1, 10) },
    ]);
  });

  it("serves daily step totals, and refuses types without a rollup", async () => {
    const { client, calls } = setup(() => json({}));
    expect(await client.dailyRollUp("steps", "2026-09-10", "2026-09-11")).toEqual([]);
    expect((await caught(client.dailyRollUp("sleep", "2026-09-10", "2026-09-11"))).code).toBe("unsupported_action");
    expect(calls).toHaveLength(1);
  });
});

describe("account checks", () => {
  it("parsePairedDevices says none only for the documented empty list, and unknown for any other shape", () => {
    expect(parsePairedDevices(JSON.stringify({ pairedDevices: [{ name: "users/me/pairedDevices/1" }] }))).toBe("some");
    expect(parsePairedDevices(JSON.stringify({ pairedDevices: [{}], nextPageToken: "n" }))).toBe("some");
    expect(parsePairedDevices("{}")).toBe("none"); // proto3 JSON drops an empty list
    expect(parsePairedDevices(JSON.stringify({ pairedDevices: [] }))).toBe("none");
    expect(parsePairedDevices(JSON.stringify({ devices: [] }))).toBe("unknown");
    expect(parsePairedDevices(JSON.stringify({ pairedDevices: {} }))).toBe("unknown");
    expect(parsePairedDevices("[]")).toBe("unknown");
    expect(parsePairedDevices("null")).toBe("unknown");
    expect(parsePairedDevices("not json")).toBe("unknown");
  });

  it("pairedDevices asks for one page", async () => {
    const { client, calls } = setup(() => json({}));
    expect(await client.pairedDevices()).toBe("none");
    expect(calls[0].url.href).toBe("https://health.googleapis.com/v4/users/me/pairedDevices?pageSize=1");
  });

  it("identity: linked, not linked, the API off for the project, and anything else passes as unknown", async () => {
    expect(await setup(() => json({ healthUserId: "1" })).client.identity()).toBe("linked");
    expect(await setup(() => json({ error: { status: "FAILED_PRECONDITION", details: [{ reason: "ACCOUNT_NOT_LINKED" }] } }, 400)).client.identity()).toBe("not_linked");
    expect(await setup(() => json({ error: { status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } }, 403)).client.identity()).toBe("api_disabled");
    expect(await setup(() => json({ error: { status: "PERMISSION_DENIED" } }, 403)).client.identity()).toBe("unknown");
  });

  it("userEmail reads the userinfo email, lower-cased", async () => {
    const { client, calls } = setup(() => json({ sub: "1", email: "Someone@Gmail.com", email_verified: true }));
    expect(await client.userEmail()).toBe("someone@gmail.com");
    expect(calls[0].url.href).toBe("https://www.googleapis.com/oauth2/v3/userinfo");
    expect(await setup(() => json({ sub: "1" })).client.userEmail()).toBeNull();
  });

  it("revokeToken posts the token as a form; 400 (already invalid) counts as done, no network does not", async () => {
    const seen: RequestInit[] = [];
    const ok = vi.fn(async (_: string | URL | Request, init: RequestInit = {}) => (seen.push(init), new Response("", { status: 200 }))) as unknown as typeof fetch;
    expect(await revokeToken("tok/1", ok)).toBe(true);
    expect(seen[0]).toMatchObject({ method: "POST", body: "token=tok%2F1", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(await revokeToken("t", (async () => new Response("", { status: 400 })) as unknown as typeof fetch)).toBe(true);
    expect(await revokeToken("t", (async () => new Response("", { status: 503 })) as unknown as typeof fetch)).toBe(false);
    const offline = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await revokeToken("t", offline)).toBe(false);
  });
});
