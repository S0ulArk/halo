// The web app's sync.test.ts on the phone: a stubbed Google answers each request from the fixtures inside its window,
// the Store is in memory, AsyncStorage (the cursors) is a Map, and the clock only moves when the test or a backoff says.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    multiRemove: async (ks: string[]) => ks.forEach((k) => storage.delete(k)),
  },
}));

const { MemoryStore } = await import("@/data/memory");
const { GoogleSignInError } = await import("../../modules/pulse-google/errors");
const { BACKFILL_DAYS, syncGoogle } = await import("./sync");
const { forgetGoogleSync, readSyncDoc } = await import("./state");

type Store = InstanceType<typeof MemoryStore>;

const TZ = "Asia/Kolkata"; // fixed +05:30, which the stub's civil-time filter relies on
const NOW = Date.parse("2026-10-02T06:00:00Z"); // 11:30 local
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Obj = Record<string, unknown>;
const at = (v: unknown, p: string) => p.split(".").reduce<unknown>((o, k) => (o as Obj | undefined)?.[k], v);
const civil = (d: unknown) => ["year", "month", "day"].map((k, i) => String(at(d, k)).padStart(i ? 2 : 4, "0")).join("-");
const fixture = (name: string): unknown[] => {
  const j = JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), "utf8"));
  return j.dataPoints ?? j.rollupDataPoints;
};
const LIST_TYPES = [
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
  "daily-respiratory-rate",
  "daily-sleep-temperature-derivations",
  "daily-oxygen-saturation",
  "daily-vo2-max",
  "daily-heart-rate-zones",
  "run-vo2-max",
  "weight",
  "body-fat",
  "sleep",
  "exercise",
  "heart-rate",
  "steps",
];
const camel = (s: string) => s.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase());
const payload = (p: unknown, type: string) => at(p, camel(type)) as Obj;

/** The member value a filter compares, as a sortable number or civil date string. */
function memberValue(p: unknown, type: string, member: string): number | string {
  const o = payload(p, type);
  if (member === "date") return civil(o.date);
  if (member === "interval.civil_start_time") return Date.parse(String(at(o, "interval.startTime")));
  return Date.parse(String(at(o, camel(member))));
}
const bound = (member: string, s: string) => (member === "date" ? s : member === "interval.civil_start_time" ? Date.parse(`${s}+05:30`) : Date.parse(s));

let data: Record<string, unknown[]>;
let store: Store;
const s = (iso: string) => Date.parse(iso) / 1000;

beforeEach(async () => {
  storage.clear();
  data = Object.fromEntries(LIST_TYPES.map((t) => [t, fixture(t)]));
  data["steps:rollup"] = fixture("steps.dailyRollUp");
  data["total-calories:rollup"] = fixture("total-calories.dailyRollUp");
  for (const t of ["time-in-heart-rate-zone", "daily-resting-heart-rate", "daily-heart-rate-variability"]) data[`${t}:rollup`] = fixture(`${t}.dailyRollUp`);
  store = new MemoryStore();
  await store.setProfile({ birthDate: "1990-01-01", sex: "male", maxHr: 183, heightCm: null, timeZone: TZ });
});

type Setup = {
  failing?: string[];
  failStatus?: number;
  /** Types whose roll-ups Google refuses (UNSUPPORTED_DATA_TYPE_ACTION). */
  refuseRollups?: string[];
  onRequest?: (type: string, filter: string | null) => void | Promise<void>;
  devices?: () => Response;
  token?: (force: boolean) => Promise<string>;
};

/** A sync over a stubbed Google that answers each request from the fixtures inside its window. */
function setup(o: Setup = {}) {
  let clock = NOW;
  const calls: { type: string; filter: string | null; rollup: boolean }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/pairedDevices")) return o.devices?.() ?? json({ pairedDevices: [{ name: "users/me/pairedDevices/1" }] });
    const [, type, rollup] = /dataTypes\/([^/]+)\/dataPoints(:dailyRollUp)?$/.exec(url.pathname)!;
    const filter = url.searchParams.get("filter");
    calls.push({ type, filter, rollup: !!rollup });
    await o.onRequest?.(type, filter);
    if (o.failing?.includes(type)) return json({ error: { code: 400, status: "INVALID_ARGUMENT", message: "secret body text" } }, o.failStatus ?? 400);
    if (rollup) {
      if (o.refuseRollups?.includes(type)) return json({ error: { code: 400, status: "INVALID_ARGUMENT", details: [{ reason: "UNSUPPORTED_DATA_TYPE_ACTION" }] } }, 400);
      const { range } = JSON.parse(String(init.body));
      const [lo, hi] = [civil(range.start.date), civil(range.end.date)];
      const pts = (data[`${type}:rollup`] ?? []).filter((p) => {
        const d = civil(at(p, "civilStartTime.date"));
        return d >= lo && d < hi;
      });
      return json({ rollupDataPoints: pts });
    }
    const [, member, lo, hi] = /^\w+\.(\S+) >= "([^"]+)"(?: AND \S+ < "([^"]+)")?$/.exec(filter!)!;
    const pts = (data[type] ?? []).filter((p) => {
      const v = memberValue(p, type, member);
      return v >= bound(member, lo) && (hi === undefined || v < bound(member, hi));
    });
    return json({ dataPoints: pts });
  }) as unknown as typeof globalThis.fetch;
  const log = { warn: vi.fn() };
  const token = vi.fn(o.token ?? (async () => "at"));
  const run = () =>
    syncGoogle(store, {
      timeZone: TZ,
      token,
      fetch,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      log,
    });
  return { run, calls, log, token, advance: (ms: number) => (clock += ms) };
}

/** Rows per kind in the Store; heart rate and steps count samples. */
const counts = async () => ({
  dailyMetrics: (await store.allMetrics()).length,
  sleepSessions: (await store.allSessions()).length,
  sleepSegments: (await store.segmentsFor((await store.allSessions()).map((x) => x.id))).length,
  exercises: (await store.allExercises()).length,
  hrSamples: (await store.readHr(0, 2 ** 31)).length,
  stepsMinutes: (await store.readSteps(0, 2 ** 31)).length,
});
const dirtyDays = () => store.takeIntradayDirty();
const state = async (key: string) => (await readSyncDoc()).jobs[key];
const day = async (d: string) => (await store.allMetrics()).find((m) => m.day === d);
const lowerBound = (f: string | null) => /"([^"]+)"/.exec(f!)![1];
const hrLists = (calls: { type: string; rollup: boolean; filter: string | null }[]) => calls.filter((c) => c.type === "heart-rate" && !c.rollup);

describe("google sync", () => {
  it("first connect backfills 180 days oldest first, with monotonic N-of-180 progress", async () => {
    const progress: [number | null, number | null][] = [];
    const { run, calls } = setup({
      onRequest: async (type, filter) => {
        if (type !== "heart-rate" || !filter) return; // the sample list, not the extra roll-up
        const st = await state("heart-rate");
        progress.push([st?.backfillDone ?? null, st?.backfillTotal ?? null]);
      },
    });
    const r = await run();
    expect(r.warnings).toEqual([]);
    expect(r.to).toBe("2026-10-02");
    expect(r.from).toBe("2026-04-06");

    const hr = hrLists(calls);
    expect(hr).toHaveLength(BACKFILL_DAYS); // one local day per request
    expect(lowerBound(hr[0].filter)).toBe("2026-04-05T18:30:00.000Z"); // local midnight, 6 April
    const starts = hr.map((c) => Date.parse(lowerBound(c.filter)));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));

    expect(progress[0]).toEqual([null, null]); // nothing saved before the first window lands
    expect(progress[1]).toEqual([1, 180]);
    progress.slice(2).forEach(([done], i) => expect(done).toBeGreaterThanOrEqual(progress[i + 1][0]!));
    expect(progress.at(-1)).toEqual([179, 180]);
    expect(await state("heart-rate")).toMatchObject({ backfillDone: 180, backfillTotal: 180, lastError: null, syncedThrough: NOW / 1000 });

    // The Store is filled the way the Health Connect import fills it.
    expect(await day("2026-10-01")).toEqual({
      day: "2026-10-01",
      hrvMs: 41.5,
      hrvDeepMs: 47,
      rhrBpm: 57,
      respBpm: 14.2,
      nightlyTempC: 34.12,
      spo2Pct: 96.4,
      vo2maxDaily: null,
      vo2maxRun: 46.3,
      steps: 8421,
      calories: 2310.5,
      weightKg: null,
      bodyFatPct: null,
      hrZones: [98, 118, 137, 157, 186],
      lightModerateMin: 52,
      vigorousPeakMin: 450.5 / 60,
      tempBaselineC: 34,
      tempSdC: 0.21,
      // Google's personal ranges, when the API serves the roll-up.
      rhrRangeLow: 52,
      rhrRangeHigh: 61,
      hrvRangeLow: 31.5,
      hrvRangeHigh: 55.25,
    });
    expect(await day("2026-09-30")).toMatchObject({ weightKg: 72.1, bodyFatPct: 18.2, vo2maxDaily: 44.1, hrZones: null });
    expect(await counts()).toEqual({ dailyMetrics: 3, sleepSessions: 4, sleepSegments: 9, exercises: 1, hrSamples: 5, stepsMinutes: 5 });
    expect(await dirtyDays()).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(await store.getSyncState()).toEqual({ lastSyncTs: NOW / 1000, firstDay: "2026-04-06", lastError: null });
  });

  it("re-importing the same payloads leaves row counts unchanged and marks nothing dirty", async () => {
    const { run } = setup();
    await run();
    const before = await counts();
    await dirtyDays();

    await run(); // incremental, overlapping every fixture
    expect(await dirtyDays()).toEqual([]);
    await forgetGoogleSync();
    await run(); // a full second backfill
    expect(await counts()).toEqual(before);
    expect(await dirtyDays()).toEqual([]);
  });

  it("re-fetches heart rate from the newest sample minus 1 hour and marks only today dirty", async () => {
    const { run, calls, advance } = setup();
    await run();
    await dirtyDays();
    calls.length = 0;

    advance(15 * 60_000);
    data["heart-rate"].push({
      dataSource: { platform: "FITBIT", recordingMethod: "PASSIVELY_MEASURED" },
      heartRate: { beatsPerMinute: "70", sampleTime: { physicalTime: "2026-10-02T06:05:00Z" } },
    });
    await run();

    // The last stored sample (05:50) is older than the cursor (06:00), so the hour runs back from it.
    expect(hrLists(calls).map((c) => lowerBound(c.filter))).toEqual(["2026-10-02T04:50:00.000Z"]);
    // daily-* re-fetch 3 local days before the cursor; sleep 30.
    expect(lowerBound(calls.find((c) => c.type === "daily-resting-heart-rate" && !c.rollup)!.filter)).toBe("2026-09-29");
    expect(lowerBound(calls.find((c) => c.type === "sleep")!.filter)).toBe("2026-09-01T18:30:00.000Z");
    expect(await dirtyDays()).toEqual(["2026-10-02"]);
    expect((await store.readHr(s("2026-10-02T06:00:00Z"), s("2026-10-02T07:00:00Z"))).map((x) => x.bpm)).toEqual([70]);

    // Nothing new: nothing changes and nothing is dirty.
    advance(15 * 60_000);
    await run();
    expect(await dirtyDays()).toEqual([]);
  });

  it("one failing type does not block the others, and keeps only the safe error", async () => {
    const { run, log } = setup({ failing: ["daily-oxygen-saturation"] });
    const r = await run();
    expect(r.warnings).toEqual(["type_failed:daily-oxygen-saturation"]);

    const failed = (await state("daily-oxygen-saturation"))!;
    expect(failed.lastError).toBe("[google] daily-oxygen-saturation: INVALID_ARGUMENT (HTTP 400)");
    expect(failed.syncedThrough).toBeNull();
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("secret");

    expect(await state("heart-rate")).toMatchObject({ lastError: null, backfillDone: 180 });
    expect((await state("daily-respiratory-rate"))?.lastError).toBeNull();
    expect(await day("2026-10-01")).toMatchObject({ spo2Pct: null, respBpm: 14.2, hrvMs: 41.5 });
    expect((await store.getSyncState()).lastError).toBeNull();
  });

  it("a type Google refuses is parked for a week, quietly; its ranges stay empty", async () => {
    const { run, calls, advance } = setup({ refuseRollups: ["daily-resting-heart-rate", "daily-heart-rate-variability"] });
    const r = await run();
    expect(r.warnings).toEqual([]);
    expect(await state("rhr-range")).toMatchObject({ lastError: null, skipUntil: NOW / 1000 + 7 * 86_400 });
    expect(await day("2026-10-01")).toMatchObject({ rhrBpm: 57, rhrRangeLow: null, hrvRangeLow: null });

    calls.length = 0;
    advance(3600_000);
    await run();
    expect(calls.filter((c) => c.rollup && c.type === "daily-resting-heart-rate")).toEqual([]);
  });

  it("records no paired device, clears it once one is paired, and keeps the last answer on an error or unknown shape", async () => {
    let devices = () => json({});
    const { run, log } = setup({ devices: () => devices() });
    expect((await run()).warnings).toEqual(["no_paired_device"]);
    expect((await state("heart-rate"))?.lastError).toBeNull(); // the import itself still runs

    devices = () => json({ error: { code: 403, status: "PERMISSION_DENIED", message: "secret body text" } }, 403);
    expect((await run()).warnings).toEqual(["no_paired_device"]);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("secret");

    devices = () => json({ somethingNew: true });
    expect((await run()).warnings).toEqual(["no_paired_device"]);

    devices = () => json({ pairedDevices: [{ name: "users/me/pairedDevices/1" }] });
    expect((await run()).warnings).toEqual([]);
  });

  it("stores ECG results (never the waveform), irregular rhythm notifications and the latest height", async () => {
    data.electrocardiogram = [
      { name: "e1", electrocardiogram: { interval: { startTime: "2026-09-20T06:00:00Z" }, resultClassification: "NORMAL_SINUS_RHYTHM", beatsPerMinuteAvg: "64", waveformSamples: [1, 2] } },
    ];
    data["irregular-rhythm-notification"] = [{ name: "n1", irregularRhythmNotification: { interval: { startTime: "2026-09-25T02:00:00Z", endTime: "2026-09-25T04:00:00Z" } } }];
    data.height = [{ height: { sampleTime: { physicalTime: "2026-09-01T00:00:00Z" }, heightMillimeters: "1784" } }];
    await setup().run();
    expect(await store.healthRecords()).toEqual([
      { id: "n1", kind: "irn", ts: s("2026-09-25T02:00:00Z"), day: "2026-09-25", data: { alertWindows: 0, endTs: s("2026-09-25T04:00:00Z") } },
      { id: "e1", kind: "ecg", ts: s("2026-09-20T06:00:00Z"), day: "2026-09-20", data: { result: "NORMAL_SINUS_RHYTHM", avgBpm: 64 } },
    ]);
    expect(await store.dailyValues({ from: "latest", to: "latest" })).toEqual([{ day: "latest", key: "height_cm", value: 178.4 }]);
  });

  describe("records deleted in Fitbit", () => {
    it("a deleted workout and a deleted night leave the Store; older rows stay", async () => {
      const { run, advance } = setup();
      await run();
      const night = (id: string, day: string, start: string, end: string) => ({
        id,
        day,
        startTs: s(start),
        endTs: s(end),
        isMain: true,
        processed: true,
        stagesStatus: null,
        asleepMin: 400,
        awakeMin: 20,
        deepMin: null,
        lightMin: null,
        remMin: null,
      });
      // A night inside the 30-day session re-fetch that Google no longer returns: deleted days later, so pruned too.
      // One outside it, gone from Google too: never re-checked, so kept.
      await store.upsertSessions([night("week-old", "2026-09-24", "2026-09-23T17:00:00Z", "2026-09-24T01:00:00Z"), night("old-night", "2026-08-20", "2026-08-19T17:00:00Z", "2026-08-20T01:00:00Z")], []);
      await dirtyDays();

      data.exercise = [];
      data.sleep = data.sleep.filter((p) => !String(at(p, "name")).endsWith("/sleep-a")); // the night ending 1 October
      advance(15 * 60_000);
      await run();

      expect(await store.allExercises()).toEqual([]);
      expect((await store.allSessions()).map((x) => x.id.split("/").pop()).sort()).toEqual(["old-night", "sleep-b", "sleep-c", "sleep-d"]);
      expect(await store.segmentsFor(["users/me/dataTypes/sleep/dataPoints/sleep-a"])).toEqual([]); // deleted with it
      expect(await dirtyDays()).toEqual(["2026-09-24", "2026-10-01"]);
    });

    it("a failed fetch, or a page with a point we cannot read, deletes nothing", async () => {
      await setup().run();
      const before = await counts();
      data.exercise = [];
      data.sleep = [];
      await setup({ failing: ["sleep", "exercise"] }).run();
      expect(await counts()).toEqual(before);

      // A changed shape: in the window, but unreadable, so the window can't vouch for what is missing.
      data.sleep = [{ name: "x", sleep: { interval: { endTime: "2026-10-01T01:40:00Z" } } }];
      data.exercise = [{ name: "y", exercise: { interval: { startTime: "2026-10-01T12:30:00Z" } } }];
      await setup().run();
      expect(await counts()).toEqual(before);
    });

    it("a night whose hypnogram goes away loses its segments", async () => {
      const { run, advance } = setup();
      await run();
      const a = data.sleep.find((p) => String(at(p, "name")).endsWith("/sleep-a")) as { sleep: { metadata: { stagesStatus: string } } };
      a.sleep.metadata.stagesStatus = "FAILED";
      advance(15 * 60_000);
      await run();
      expect(await store.segmentsFor(["users/me/dataTypes/sleep/dataPoints/sleep-a"])).toEqual([]);
      expect((await store.allSessions()).find((x) => x.id.endsWith("/sleep-a"))).toMatchObject({ stagesStatus: "FAILED", isMain: true });
    });
  });

  it("a failed backfill resumes from its last committed window", async () => {
    let fail = true;
    const { run, calls } = setup({
      onRequest: (type, filter) => {
        if (type === "heart-rate" && filter && fail && lowerBound(filter) === "2026-07-01T18:30:00.000Z") throw new TypeError("Network request failed");
      },
    });
    const r = await run();
    expect(r.warnings).toContain("type_failed:heart-rate");
    const stuck = (await state("heart-rate"))!;
    expect(stuck.lastError).toBe("[google] heart-rate: network");
    expect(stuck.backfillDone).toBeGreaterThan(0);
    expect(stuck.backfillDone).toBeLessThan(180);

    fail = false;
    calls.length = 0;
    await run();
    expect(lowerBound(hrLists(calls)[0].filter)).toBe("2026-07-01T18:30:00.000Z");
    expect(await state("heart-rate")).toMatchObject({ backfillDone: 180, lastError: null });
  });

  it("a sign-in Google won't give silently stops the run before any request, and says why", async () => {
    const { run, calls } = setup({
      token: async () => {
        throw new GoogleSignInError("needs_sign_in");
      },
    });
    await expect(run()).rejects.toMatchObject({ code: "needs_sign_in" });
    expect(calls).toEqual([]);
    expect((await store.getSyncState()).lastError).toBe(new GoogleSignInError("needs_sign_in").message);
  });

  it("a revoked grant (a 401 after a fresh token) or the API switched off stops the run with a typed error", async () => {
    const run = (answer: () => Response) =>
      syncGoogle(store, { timeZone: TZ, token: async () => "at", fetch: (async () => answer()) as unknown as typeof globalThis.fetch, now: () => NOW, sleep: async () => {} });
    await expect(run(() => json({}, 401))).rejects.toMatchObject({ name: "GoogleSignInError", code: "needs_sign_in" });
    await expect(run(() => json({ error: { status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } }, 403))).rejects.toMatchObject({ code: "api_disabled" });
    await expect(run(() => json({ error: { status: "FAILED_PRECONDITION", details: [{ reason: "ACCOUNT_NOT_LINKED" }] } }, 400))).rejects.toMatchObject({ code: "account_not_linked" });
    expect((await store.getSyncState()).lastError).toBe(new GoogleSignInError("account_not_linked").message);
  });

  it("a quota hit that outlasts the retries leaves the rest of the types for the next sync", async () => {
    const { run, calls } = setup({ failing: ["daily-resting-heart-rate"], failStatus: 429 });
    const r = await run();
    expect(r.warnings).toEqual(["type_failed:daily-resting-heart-rate", "rate_limited"]);
    // daily-heart-rate-variability ran before it; nothing after it did.
    expect(calls.some((c) => c.type === "daily-heart-rate-variability")).toBe(true);
    expect(calls.some((c) => c.type === "sleep" || c.type === "heart-rate")).toBe(false);
    expect(await state("sleep")).toBeUndefined();
  });
});
