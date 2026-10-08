// The Google Health API import: the web app's src/server/sources/google/sync.ts on the phone. Per data type (a "job"),
// the first sync backfills BACKFILL_DAYS local days, oldest first, saving the job's cursor after every window so an
// interrupted backfill resumes where it stopped; later syncs re-fetch a little before the cursor (3 days; sessions 30,
// so a nap or workout deleted in Fitbit days later is pruned; heart rate and steps from an hour before the newest
// stored sample). Every job runs on its own: a failing type keeps its safe error and the next carries on. Only a
// sign-in Google won't give, a revoked grant, an account without Google Health or the API switched off stops the run.
//
// Rows go through the Store as the Health Connect import writes them (src/health/sync.ts): daily types fill their
// Metrics columns (merged into the day's row), roll-up extras are DailyValues, sessions, workouts and samples are
// upserted, ECG and irregular-rhythm records are health records. Days whose samples, sessions or workouts changed are
// marked intraday-dirty as they are written, so stage 1 reruns them; src/background/runSync.ts then runs the same
// pipeline as after a Health Connect sync. Day boundaries are local midnights in `timeZone`.
//
// Deletions: `list` returns a window whole or throws, so within a list window Pulse holds exactly what Google returns.
// A sleep session or workout there that Google left out was deleted in Fitbit: it is removed and its day marked dirty.
// Rows outside the window are never touched.
import type { Store } from "@/data/store";
import { emptyMetrics, type HrSample, type Metrics, type Segment, type StepsMinute } from "@/data/types";
import { addDays, localDay, localMidnight } from "@/lib/time";
import { GoogleSignInError, isSignInError } from "../../modules/pulse-google/errors";
import { DATA_TYPES, type DataTypeId } from "./catalogue";
import { createGoogleClient, GoogleError, localWindows, type GoogleClient, type TimeWindow, type TokenProvider } from "./client";
import {
  DAILY_TYPES,
  EXTRA_TYPES,
  mapDaily,
  mapExercises,
  mapExtra,
  mapHeartRate,
  mapHeight,
  mapRecords,
  mapRollup,
  mapSleep,
  mapStepsMinutes,
  type DailyType,
  type ExtraType,
  type MetricsRow,
  type RollupType,
} from "./map";
import { readSyncDoc, writeSyncDoc, type JobState } from "./state";

/** The importer's mapping version: bump when map.ts or what this file writes changes, so every job backfills again. */
export const GOOGLE_IMPORT_VERSION = 1;
/** The first sync's history window, local days ending today (the Health Connect import's and the web's 180). */
export const BACKFILL_DAYS = 180;
/** Daily types, roll-ups, sample types and records re-fetch this many local days before the cursor. */
const OVERLAP_DAYS = 3;
/**
 * Sleep and exercise re-fetch further back: a session deleted in Google Health is only pruned when its window is
 * listed again, and people delete a stray workout or nap days later. A few pages of 25 sessions each sync.
 */
const SESSION_OVERLAP_DAYS = 30;
/** Heart rate and steps re-fetch from the newest stored sample (or the cursor) minus this. */
const INTRADAY_OVERLAP_S = 3600;
/** A type Google refuses (a roll-up it doesn't offer) is tried again after this long, quietly meanwhile. */
const REFUSED_RETRY_S = 7 * 86_400;

export type Job =
  | { key: string; kind: "daily"; type: DailyType }
  | { key: string; kind: "rollup"; type: RollupType; optional?: boolean }
  | { key: string; kind: "extra"; type: ExtraType }
  | { key: string; kind: "records"; type: "electrocardiogram" | "irregular-rhythm-notification" }
  | { key: string; kind: "sleep" | "exercise" | "hr" | "steps" | "height"; type: DataTypeId };

/** Cheap types first, so a first connect has daily data long before heart rate (~1,400 requests) is done. */
export const JOBS: Job[] = [
  ...DAILY_TYPES.map((type) => ({ key: type, kind: "daily" as const, type })),
  { key: "sleep", kind: "sleep", type: "sleep" },
  { key: "exercise", kind: "exercise", type: "exercise" },
  { key: "total-calories", kind: "rollup", type: "total-calories" },
  { key: "steps-daily", kind: "rollup", type: "steps" }, // daily totals; "steps" below is per minute
  { key: "steps", kind: "steps", type: "steps" },
  // Score inputs from roll-ups: Pulse Age's zone minutes.
  { key: "time-in-heart-rate-zone", kind: "rollup", type: "time-in-heart-rate-zone" },
  { key: "heart-rate", kind: "hr", type: "heart-rate" },
  // Google's personal resting-HR and HRV ranges (Health Monitor's ranges, else Pulse's own). The web found the API
  // answering UNSUPPORTED_DATA_TYPE_ACTION to these roll-ups (2026-10-03), so a refusal parks the job for a week, quietly.
  { key: "rhr-range", kind: "rollup", type: "daily-resting-heart-rate", optional: true },
  { key: "hrv-range", kind: "rollup", type: "daily-heart-rate-variability", optional: true },
  // Last, so the scored data lands first; each fails on its own (a scope not granted, a type the account never has).
  ...EXTRA_TYPES.map((type) => ({ key: type === "heart-rate" ? "heart-rate-daily" : type, kind: "extra" as const, type })),
  { key: "electrocardiogram", kind: "records", type: "electrocardiogram" },
  { key: "irregular-rhythm-notification", kind: "records", type: "irregular-rhythm-notification" },
  { key: "height", kind: "height", type: "height" },
];

/** Each job's name in the progress line ("read:RestingHeartRate" → "Reading resting heart rate"). */
const LABEL: Record<string, string> = {
  "daily-heart-rate-variability": "HeartRateVariability",
  "daily-resting-heart-rate": "RestingHeartRate",
  "daily-heart-rate-zones": "HeartRateZones",
  "daily-respiratory-rate": "RespiratoryRate",
  "daily-sleep-temperature-derivations": "SkinTemperature",
  "daily-oxygen-saturation": "BloodOxygen",
  "daily-vo2-max": "CardioFitness",
  "run-vo2-max": "RunVo2Max",
  weight: "Weight",
  "body-fat": "BodyFat",
  sleep: "Sleep",
  exercise: "Workouts",
  "total-calories": "Calories",
  "steps-daily": "Steps",
  steps: "StepsPerMinute",
  "time-in-heart-rate-zone": "TimeInZones",
  "heart-rate": "HeartRate",
  "rhr-range": "RestingHeartRateRange",
  "hrv-range": "HeartRateVariabilityRange",
  distance: "Distance",
  floors: "Floors",
  altitude: "Elevation",
  "active-zone-minutes": "ActiveZoneMinutes",
  "active-minutes": "ActiveMinutes",
  "active-energy-burned": "ActiveCalories",
  "sedentary-period": "SedentaryTime",
  "heart-rate-daily": "AverageHeartRate",
  "hydration-log": "Water",
  "nutrition-log": "Food",
  "blood-glucose": "BloodGlucose",
  "core-body-temperature": "CoreTemperature",
  "swim-lengths-data": "SwimStrokes",
  electrocardiogram: "Ecg",
  "irregular-rhythm-notification": "IrregularRhythm",
  height: "Height",
};

export type GoogleSyncOptions = {
  timeZone: string;
  /** The access token (src/google/auth.ts googleToken); `force` after a 401. */
  token: TokenProvider;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds: the client's clock and the run's "now". */
  now?: () => number;
  onProgress?: (step: string, done: number, total: number) => void;
  log?: Pick<Console, "warn">;
};

export type GoogleSyncResult = {
  /** First and last local day the run read, "YYYY-MM-DD". */
  from: string;
  to: string;
  /** Rows written per job, and `reimport` when the mapping version changed. */
  counts: Record<string, number>;
  /** Hints, never errors: "no_paired_device", "type_failed:<job>", "rate_limited". */
  warnings: string[];
};

const minute = (s: number) => Math.floor(s / 60) * 60;

/** The exclusive civil end day for a window ending at `end`: the day after, unless `end` is a local midnight. */
const dayAfter = (end: number, tz: string) => (localMidnight(localDay(end, tz), tz) === end ? localDay(end, tz) : addDays(localDay(end, tz), 1));

/** Local days a window touches. */
const daysIn = (w: TimeWindow, tz: string) => Math.round((Date.parse(localDay(w.end - 1, tz)) - Date.parse(localDay(w.start, tz))) / 86_400_000) + 1;

/** Errors no other type would get past: the run stops on them. */
const FATAL_CODES: Record<string, GoogleSignInError["code"]> = {
  auth_revoked: "needs_sign_in",
  ACCOUNT_NOT_LINKED: "account_not_linked",
  SERVICE_DISABLED: "api_disabled",
  accessNotConfigured: "api_disabled",
};
function fatal(e: unknown): GoogleSignInError | null {
  if (isSignInError(e)) return e;
  if (e instanceof GoogleError && FATAL_CODES[e.code]) return new GoogleSignInError(FATAL_CODES[e.code], undefined, e.message);
  return null;
}

/** An optional type Google won't serve: a 4xx other than auth or quota (UNSUPPORTED_DATA_TYPE_ACTION, INVALID_ARGUMENT). */
const refused = (e: unknown) =>
  e instanceof GoogleError && (e.code === "unsupported_action" || (e.status !== undefined && e.status >= 400 && e.status < 500 && ![401, 403, 429].includes(e.status)));

const safeMessage = (e: unknown, key: string) => (e instanceof GoogleError || isSignInError(e) ? (e as Error).message : `[google] ${key}: internal error`);

const freshJob = (): JobState => ({ syncedThrough: null, backfillDone: 0, backfillTotal: BACKFILL_DAYS, lastAttemptAt: null, lastSuccessAt: null, lastError: null, skipUntil: null });

export async function syncGoogle(store: Store, opts: GoogleSyncOptions): Promise<GoogleSyncResult> {
  const tz = opts.timeZone;
  const nowMs = opts.now ?? Date.now;
  const progress = opts.onProgress ?? (() => {});
  const log = opts.log ?? console;
  const counts: Record<string, number> = {};
  const warnings: string[] = [];
  const t = Math.floor(nowMs() / 1000);
  const today = localDay(t, tz);

  try {
    // A sign-in Google won't give without the person stops the run here, before anything is read or written.
    await opts.token(false);
    const client = createGoogleClient({ token: opts.token, timeZone: tz, fetch: opts.fetch, sleep: opts.sleep, now: nowMs });
    const w = writer(store, tz);
    const doc = await readSyncDoc();
    if (doc.version !== GOOGLE_IMPORT_VERSION) {
      doc.version = GOOGLE_IMPORT_VERSION;
      doc.jobs = {};
      counts.reimport = 1;
    }

    // An account with no paired device imports 180 empty days: say so instead. Only a clear "none" sets it and a clear
    // "some" clears it; an error or an unknown shape keeps the last answer.
    try {
      const devices = await client.pairedDevices();
      if (devices !== "unknown") doc.devices = devices;
    } catch (e) {
      const f = fatal(e);
      if (f) throw f;
      log.warn(safeMessage(e, "pairedDevices"));
    }
    if (doc.devices === "none") warnings.push("no_paired_device");

    // Every job's windows first, so the progress has a total.
    const plans: { job: Job; state: JobState; backfilling: boolean; windows: TimeWindow[] }[] = [];
    for (const job of JOBS) {
      const st = doc.jobs[job.key];
      if (st?.skipUntil != null && st.skipUntil > t) continue;
      const fresh = st?.syncedThrough == null;
      const backfilling = fresh || st.backfillDone < st.backfillTotal;
      let from: number;
      if (fresh) from = localMidnight(addDays(today, 1 - BACKFILL_DAYS), tz); // today is day 180
      else if (backfilling) from = st.syncedThrough!; // the last committed window's end
      else {
        const through = st.syncedThrough!;
        from = localMidnight(addDays(localDay(through, tz), -(job.kind === "sleep" || job.kind === "exercise" ? SESSION_OVERLAP_DAYS : OVERLAP_DAYS)), tz);
        if (job.kind === "hr" || job.kind === "steps") {
          // From the last sample too, not just the cursor, so a band that uploads hours late is not lost behind a
          // 1-hour overlap. (A band silent for more than OVERLAP_DAYS loses the older part.)
          const last = (await w.lastSample(job.kind, from, t)) ?? Infinity;
          from = Math.max(from, minute(Math.min(through, last + 1) - INTRADAY_OVERLAP_S));
        }
      }
      // Heart rate one local day at a time, each page mapped as it arrives: a day can be 40,000 points.
      const chunkDays = job.kind === "hr" ? 1 : DATA_TYPES[job.type].maxDays;
      const state = fresh ? freshJob() : { ...st };
      plans.push({ job, state, backfilling, windows: localWindows(from, t, chunkDays, tz) });
    }
    const total = plans.reduce((n, p) => n + p.windows.length, 0) + 1;
    let done = 0;
    let earliest = today;

    for (const [i, p] of plans.entries()) {
      const { job, state: st } = p;
      st.lastAttemptAt = t;
      let written = 0;
      let left = p.windows.length;
      try {
        for (const win of p.windows) {
          progress(`read:${LABEL[job.key] ?? job.key}`, done, total);
          written += await runWindow(client, w, job, win, tz);
          done++;
          left--;
          if (localDay(win.start, tz) < earliest) earliest = localDay(win.start, tz);
          if (p.backfilling) st.backfillDone = Math.min(BACKFILL_DAYS, st.backfillDone + daysIn(win, tz));
          st.syncedThrough = win.end;
          // Rows first, then the cursor: a run killed in between re-fetches the window, which writes nothing twice.
          doc.jobs[job.key] = st;
          await writeSyncDoc(doc);
        }
        if (p.backfilling) Object.assign(st, { syncedThrough: t, backfillDone: BACKFILL_DAYS, backfillTotal: BACKFILL_DAYS });
        Object.assign(st, { lastSuccessAt: t, lastError: null, skipUntil: null });
        if (written) counts[job.key] = written;
      } catch (e) {
        done += left;
        const f = fatal(e);
        if (f) {
          doc.jobs[job.key] = { ...st, lastError: f.message };
          await writeSyncDoc(doc);
          throw f;
        }
        if (job.kind === "rollup" && job.optional && refused(e)) {
          // Google doesn't offer it for this account: no error to show, ask again in a week.
          Object.assign(st, { lastError: null, skipUntil: t + REFUSED_RETRY_S });
        } else {
          st.lastError = safeMessage(e, job.key);
          warnings.push(`type_failed:${job.key}`);
          log.warn(st.lastError);
        }
        doc.jobs[job.key] = st;
        await writeSyncDoc(doc);
        // A quota hit that outlasted the retries: the rest would fail the same way, so they wait for the next sync.
        if (e instanceof GoogleError && e.status === 429) {
          warnings.push("rate_limited");
          for (const rest of plans.slice(i + 1)) done += rest.windows.length;
          break;
        }
        continue;
      }
      doc.jobs[job.key] = st;
      await writeSyncDoc(doc);
    }

    const sync = await store.getSyncState();
    const window0 = addDays(today, 1 - BACKFILL_DAYS);
    const firstDay = sync.firstDay && sync.firstDay < window0 ? sync.firstDay : window0;
    await store.setSyncState({ lastSyncTs: t, firstDay, lastError: null });
    progress("done", total, total);
    return { from: earliest, to: today, counts, warnings };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await store.setSyncState({ lastError: message }).catch(() => {});
    throw e;
  }
}

/** Reads one window of a job and writes what it maps. Returns the rows (or samples) written. */
async function runWindow(client: GoogleClient, w: Writer, job: Job, win: TimeWindow, tz: string): Promise<number> {
  switch (job.kind) {
    case "hr":
      return w.writeHr(await heartRate(client, win));
    case "rollup":
      return w.mergeMetrics(mapRollup(job.type, await client.dailyRollUp(job.type, localDay(win.start, tz), dayAfter(win.end, tz))));
    case "extra":
      return w.values(mapExtra(job.type, await client.dailyRollUp(job.type, localDay(win.start, tz), dayAfter(win.end, tz))));
    case "daily":
      return w.mergeMetrics(mapDaily(job.type, await client.list(job.type, win.start, win.end), tz));
    case "records": {
      const rows = mapRecords(job.type, await client.list(job.type, win.start, win.end), tz);
      await w.store.upsertHealthRecords(rows);
      return rows.length;
    }
    case "height": {
      // Pulse Age's lean-mass term reads it when the profile has no height (src/pipeline/index.ts sourceHeight).
      const h = mapHeight(await client.list(job.type, win.start, win.end));
      return h ? w.values([{ day: "latest", key: "height_cm", value: h.cm }]) : 0;
    }
    case "steps":
      return w.writeSteps(mapStepsMinutes(await client.list(job.type, win.start, win.end)));
    case "sleep":
      return w.writeSleep(await client.list(job.type, win.start, win.end), win);
    case "exercise":
      return w.writeExercises(await client.list(job.type, win.start, win.end), win);
  }
}

/** A window's band heart rate, mapped page by page so only the samples are held, never a day of raw points. */
export async function heartRate(client: Pick<GoogleClient, "listEach">, win: TimeWindow): Promise<Map<number, number>> {
  const hr = new Map<number, number>();
  await client.listEach("heart-rate", win.start, win.end, (points) => {
    for (const [ts, bpm] of mapHeartRate(points)) hr.set(ts, bpm);
  });
  return hr;
}

// --- Writes ---------------------------------------------------------------------------------------

type Writer = ReturnType<typeof writer>;

/** Same JSON: rows from the Store and from the mappers list their fields in one order. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function writer(store: Store, tz: string) {
  // Local midnight sits on a UTC quarter hour in every zone, so one lookup per 15 minutes is exact.
  const days = new Map<number, string>();
  const dayOf = (ts: number) => {
    const q = Math.floor(ts / 900);
    let d = days.get(q);
    if (d === undefined) days.set(q, (d = localDay(q * 900, tz)));
    return d;
  };
  const dirty = (ds: Iterable<string>) => store.markIntradayDirty([...new Set(ds)]);
  let metrics: Map<string, Metrics> | null = null;

  return {
    store,

    /** Merges each row's columns into the day's stored Metrics; writes only the days that changed. */
    async mergeMetrics(rows: MetricsRow[]): Promise<number> {
      if (!rows.length) return 0;
      metrics ??= new Map((await store.allMetrics()).map((m) => [m.day, m]));
      const out: Metrics[] = [];
      for (const r of rows) {
        const cur = metrics.get(r.day);
        const next: Metrics = { ...(cur ?? emptyMetrics(r.day)), ...r };
        if (cur && same(cur, next)) continue;
        metrics.set(r.day, next);
        out.push(next);
      }
      if (out.length) await store.upsertMetrics(out);
      return out.length;
    },

    async values(rows: { day: string; key: string; value: number }[]): Promise<number> {
      if (rows.length) await store.upsertDailyValues(rows);
      return rows.length;
    },

    /** Writes the samples the Store lacks or has with another bpm, and marks their days dirty. */
    async writeHr(hr: Map<number, number>): Promise<number> {
      if (!hr.size) return 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (const ts of hr.keys()) {
        if (ts < lo) lo = ts;
        if (ts > hi) hi = ts;
      }
      const stored = new Map((await store.readHr(lo, hi + 1)).map((s) => [s.ts, s.bpm]));
      const fresh: HrSample[] = [];
      for (const [ts, bpm] of hr) if (stored.get(ts) !== bpm) fresh.push({ ts, bpm });
      if (!fresh.length) return 0;
      fresh.sort((a, b) => a.ts - b.ts);
      await store.putHr(fresh);
      await dirty(fresh.map((s) => dayOf(s.ts)));
      return fresh.length;
    },

    /**
     * Steps per minute, max with the stored minute too: a multi-minute interval that starts before the re-fetch window
     * must not shrink the minutes it spills into.
     */
    async writeSteps(steps: Map<number, number>): Promise<number> {
      if (!steps.size) return 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (const ts of steps.keys()) {
        if (ts < lo) lo = ts;
        if (ts > hi) hi = ts;
      }
      const stored = new Map((await store.readSteps(lo, hi + 60)).map((s) => [s.ts, s.v]));
      const fresh: StepsMinute[] = [];
      for (const [ts, v] of steps) {
        const next = Math.max(stored.get(ts) ?? 0, v);
        if (next !== stored.get(ts)) fresh.push({ ts, v: next });
      }
      if (!fresh.length) return 0;
      fresh.sort((a, b) => a.ts - b.ts);
      await store.putSteps(fresh);
      await dirty(fresh.map((s) => dayOf(s.ts)));
      return fresh.length;
    },

    /** A sleep window: new and changed sessions written (with their segments), deleted ones pruned; their days dirty. */
    async writeSleep(points: unknown[], win: TimeWindow): Promise<number> {
      const { sessions, segments } = mapSleep(points, tz);
      const all = await store.allSessions();
      const byId = new Map(all.map((s) => [s.id, s]));
      const stored = sessions.length ? await store.segmentsFor(sessions.map((s) => s.id)) : [];
      const segKey = (xs: Segment[], id: string) =>
        JSON.stringify(
          xs
            .filter((g) => g.sessionId === id)
            .map((g) => [g.startTs, g.endTs, g.stage])
            .sort((a, b) => (a[0] as number) - (b[0] as number)),
        );
      const changed = sessions.filter((s) => !same(byId.get(s.id) ?? null, s) || segKey(stored, s.id) !== segKey(segments, s.id));
      const touched: string[] = [];
      if (changed.length) {
        const ids = new Set(changed.map((s) => s.id));
        // upsertSessions replaces only the segments of sessions it is given segments for: a night whose hypnogram went
        // away (its stages no longer SUCCEEDED) is dropped first, so its old segments go with it.
        const lost = changed.filter((s) => segKey(segments, s.id) === "[]" && segKey(stored, s.id) !== "[]").map((s) => s.id);
        if (lost.length) await store.deleteSessions(lost);
        await store.upsertSessions(changed, segments.filter((g) => ids.has(g.sessionId)));
        for (const s of changed) touched.push(s.day, byId.get(s.id)?.day ?? s.day);
      }
      // Only when every point was readable: a shape change must not read as "all deleted".
      if (sessions.length === points.length) {
        const keep = new Set(sessions.map((s) => s.id));
        const gone = all.filter((s) => s.endTs >= win.start && s.endTs < win.end && !keep.has(s.id));
        if (gone.length) {
          await store.deleteSessions(gone.map((s) => s.id));
          touched.push(...gone.map((s) => s.day));
        }
      }
      if (touched.length) await dirty(touched);
      return changed.length;
    },

    /** A workout window, as writeSleep. The filter is on civil start time, which is startTs in this zone. */
    async writeExercises(points: unknown[], win: TimeWindow): Promise<number> {
      const rows = mapExercises(points, tz);
      const all = await store.allExercises();
      const byId = new Map(all.map((e) => [e.id, e]));
      const changed = rows.filter((e) => !same(byId.get(e.id) ?? null, e));
      const touched: string[] = [];
      if (changed.length) {
        await store.upsertExercises(changed);
        for (const e of changed) touched.push(e.day, byId.get(e.id)?.day ?? e.day);
      }
      if (rows.length === points.length) {
        const keep = new Set(rows.map((e) => e.id));
        const gone = all.filter((e) => e.startTs >= win.start && e.startTs < win.end && !keep.has(e.id));
        if (gone.length) {
          await store.deleteExercises(gone.map((e) => e.id));
          touched.push(...gone.map((e) => e.day));
        }
      }
      if (touched.length) await dirty(touched);
      return changed.length;
    },

    /** The newest stored sample (unix seconds) of heart rate, or of steps since `from`; null with none. */
    async lastSample(kind: "hr" | "steps", from: number, to: number): Promise<number | null> {
      if (kind === "hr") return (await store.hrBounds())?.last ?? null;
      const steps = await store.readSteps(from, to + 1);
      return steps.length ? steps[steps.length - 1].ts : null;
    },
  };
}
