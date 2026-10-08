// Pure mappers: Google Health API v4 data points → Pulse's rows (src/data/types.ts). No I/O. Ported from the web app's
// src/server/sources/google/map.ts (shapes from Hælan's probe findings, see the web's docs/data-notes.md), with its
// Postgres rows swapped for the Store's: a daily type fills some Metrics columns (the sync merges them into the day's
// row), roll-up extras become DailyValues, ECG and irregular-rhythm records become HealthRecords.
//
// int64 fields arrive as JSON strings, and proto3 omits zero, false and empty fields, so every read goes through
// num/str and treats "absent" as "unknown", never as zero.
import type { DailyValue, Exercise, HealthRecord, Metrics, Segment, Session, Stage } from "@/data/types";
import type { ExtraKey } from "@/queries/_lib";
import { localDay } from "@/lib/time";
import type { DataTypeId } from "./catalogue";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Own-property path lookup: the objects come from Google, so "constructor" must not walk the prototype. */
export function at(v: unknown, path: string): unknown {
  for (const k of path.split(".")) {
    if (!isObj(v) || !Object.prototype.hasOwnProperty.call(v, k)) return undefined;
    v = v[k];
  }
  return v;
}

/** A number, or an int64 sent as a string. */
function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
const int = (v: unknown) => (num(v) === null ? null : Math.round(num(v)!));
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const per = (v: number | null, d: number) => (v === null ? null : v / d);

/** Unix seconds of an RFC 3339 instant. */
function secs(v: unknown): number | null {
  const ms = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** `YYYY-MM-DD` from a civil `{year, month, day}` (numbers, or numeric strings). */
function civil(v: unknown): string | null {
  const [y, m, d] = ["year", "month", "day"].map((k) => num(at(v, k)));
  if (y === null || m === null || d === null) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The body key of a type: `daily-resting-heart-rate` → `dailyRestingHeartRate`. */
export const bodyKey = (type: DataTypeId | string) => type.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

/** Where a point came from: FITBIT for the band, HEALTH_CONNECT for the phone and other apps. */
export const platform = (p: unknown) => str(at(p, "dataSource.platform"));

// --- Daily rows -----------------------------------------------------------------------------------

/** Some of a day's Metrics columns; the sync merges them into the stored row. */
export type MetricsPatch = Partial<Omit<Metrics, "day">>;
export type MetricsRow = { day: string } & MetricsPatch;

/** Payload object → Metrics columns, per list type. Civil-date types keep Google's day as-is. */
const DAILY = {
  "daily-heart-rate-variability": (o: Obj): MetricsPatch => ({
    // The average is what Recovery's baseline uses; the deep-sleep RMSSD is stored beside it, never mixed in.
    hrvMs: num(o.averageHeartRateVariabilityMilliseconds),
    hrvDeepMs: num(o.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds),
  }),
  // (The web also keeps Google's calculation method; the phone's Metrics has no column for it.)
  "daily-resting-heart-rate": (o: Obj): MetricsPatch => ({ rhrBpm: num(o.beatsPerMinute) }),
  "daily-respiratory-rate": (o: Obj): MetricsPatch => ({ respBpm: num(o.breathsPerMinute) }),
  // The pipeline's deviation is nightly − Google's baseline (a 30-night median); its SD sets Health Monitor's range.
  "daily-sleep-temperature-derivations": (o: Obj): MetricsPatch => ({
    nightlyTempC: num(o.nightlyTemperatureCelsius),
    tempBaselineC: num(o.baselineTemperatureCelsius),
    tempSdC: num(o.relativeNightlyStddev30dCelsius),
  }),
  "daily-heart-rate-zones": (o: Obj): MetricsPatch => ({ hrZones: hrZones(o.heartRateZones) }),
  "daily-oxygen-saturation": (o: Obj): MetricsPatch => ({ spo2Pct: num(o.averagePercentage) }),
  "daily-vo2-max": (o: Obj): MetricsPatch => ({ vo2maxDaily: num(o.vo2Max) }),
  // Sample types: the latest reading of the local day.
  "run-vo2-max": (o: Obj): MetricsPatch => ({ vo2maxRun: num(o.runVo2Max) }),
  weight: (o: Obj): MetricsPatch => ({ weightKg: per(num(o.weightGrams), 1000) }),
  "body-fat": (o: Obj): MetricsPatch => ({ bodyFatPct: num(o.percentage) }),
} satisfies Partial<Record<DataTypeId, (o: Obj) => MetricsPatch>>;

/** Google's zone order; Pulse's zones 1-4 are these. */
const ZONE_TYPES = ["LIGHT", "MODERATE", "VIGOROUS", "PEAK"];

/**
 * `heartRateZones[]` → `[light, moderate, vigorous, peak]` minimum bpm, then the peak maximum. Null unless all
 * four zones are there with increasing minimums and a peak maximum above the peak minimum.
 */
function hrZones(v: unknown): number[] | null {
  const zone = (type: string) => list(v).find((z) => at(z, "heartRateZoneType") === type);
  const bounds = [...ZONE_TYPES.map((t) => int(at(zone(t), "minBeatsPerMinute"))), int(at(zone("PEAK"), "maxBeatsPerMinute"))];
  if (bounds.some((b, i) => b === null || b <= 0 || (i > 0 && b <= bounds[i - 1]!))) return null;
  return bounds as number[];
}

export type DailyType = keyof typeof DAILY;
export const DAILY_TYPES = Object.keys(DAILY) as DailyType[];

/** One row per local day. A `date` type uses its civil date; a sample type its sample's local day, latest wins. */
export function mapDaily(type: DailyType, points: unknown[], tz: string): MetricsRow[] {
  const key = bodyKey(type);
  const byDay = new Map<string, { t: number; row: MetricsRow }>();
  for (const p of points) {
    const o = at(p, key);
    if (!isObj(o)) continue;
    const t = secs(at(o, "sampleTime.physicalTime"));
    const day = civil(o.date) ?? (t === null ? null : localDay(t, tz));
    if (!day) continue;
    const prev = byDay.get(day);
    if (!prev || (t ?? 0) >= prev.t) byDay.set(day, { t: t ?? 0, row: { day, ...DAILY[type](o) } });
  }
  return [...byDay.values()].map((x) => x.row);
}

/** `dailyRollUp` points → daily totals. Google merges sources server-side and omits days with no data. */
const ROLLUP = {
  // Value path unobserved (Hælan saw floors.countSum, an int64 string); confirm on Fitbit Air.
  steps: (o: Obj): MetricsPatch => ({ steps: int(o.countSum) }),
  "total-calories": (o: Obj): MetricsPatch => ({ calories: num(o.kcalSum) }),
  // LIGHT + MODERATE and VIGOROUS + PEAK, Pulse Age's two activity terms. A zone the day lacks counts as 0;
  // a point with no zones at all is skipped.
  "time-in-heart-rate-zone": (o: Obj): MetricsPatch => {
    const zones = list(o.timeInHeartRateZones);
    const min = (...types: string[]) =>
      zones.length ? per(sum(0, ...zones.filter((z) => types.includes(String(at(z, "heartRateZone")))).map((z) => durationS(at(z, "duration")))), 60) : null;
    return { lightModerateMin: min("LIGHT", "MODERATE"), vigorousPeakMin: min("VIGOROUS", "PEAK") };
  },
  // Personal ranges: a dailyRollUp on the daily type answers with a differently named value (ROLLUP_KEY).
  "daily-resting-heart-rate": (o: Obj): MetricsPatch => {
    const [rhrRangeLow, rhrRangeHigh] = range(num(o.beatsPerMinuteMin), num(o.beatsPerMinuteMax));
    return { rhrRangeLow, rhrRangeHigh };
  },
  "daily-heart-rate-variability": (o: Obj): MetricsPatch => {
    const [hrvRangeLow, hrvRangeHigh] = range(num(o.averageHeartRateVariabilityMillisecondsMin), num(o.averageHeartRateVariabilityMillisecondsMax));
    return { hrvRangeLow, hrvRangeHigh };
  },
} satisfies Partial<Record<DataTypeId, (o: Obj) => MetricsPatch>>;

/** Both ends when both are there and low < high; else neither. */
const range = (low: number | null, high: number | null) => (low !== null && high !== null && low < high ? [low, high] : [null, null]);

export type RollupType = keyof typeof ROLLUP;

/** The roll-up value's key where it is not the type's camelCase (the dailyRollUp reference's union field names). */
const ROLLUP_KEY: Partial<Record<RollupType, string>> = {
  "daily-resting-heart-rate": "restingHeartRatePersonalRange",
  "daily-heart-rate-variability": "heartRateVariabilityPersonalRange",
};

/** Points whose value is missing are skipped, so a renamed value path writes nothing rather than nulls. */
export function mapRollup(type: RollupType, points: unknown[]): MetricsRow[] {
  const out: MetricsRow[] = [];
  for (const p of points) {
    const day = civil(at(p, "civilStartTime.date"));
    const o = at(p, ROLLUP_KEY[type] ?? bodyKey(type));
    if (!day || !isObj(o)) continue;
    const values = ROLLUP[type](o);
    if (Object.values(values).every((v) => v === null)) continue;
    out.push({ day, ...values });
  }
  return out;
}

// --- Intraday -------------------------------------------------------------------------------------

/**
 * Band heart rate, unix second → bpm. HEALTH_CONNECT carries phone and third-party apps, so it is dropped: the
 * Store's heart rate is the band's alone. A repeated second keeps the last point.
 */
export function mapHeartRate(points: unknown[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of points) {
    if (platform(p) === "HEALTH_CONNECT") continue;
    const ts = secs(at(p, "heartRate.sampleTime.physicalTime"));
    const bpm = int(at(p, "heartRate.beatsPerMinute"));
    if (ts !== null && bpm !== null && bpm > 0) out.set(ts, bpm);
  }
  return out;
}

/**
 * Steps per minute (minute-start unix second → count), the maximum across sources: summing would double-count a walk
 * both the band and the phone saw. Only used for movement gating; daily totals come from dailyRollUp. An interval
 * longer than a minute is spread evenly over the minutes it touches.
 */
export function mapStepsMinutes(points: unknown[]): Map<number, number> {
  const bySource = new Map<string, Map<number, number>>();
  for (const p of points) {
    const start = secs(at(p, "steps.interval.startTime"));
    const end = secs(at(p, "steps.interval.endTime"));
    const n = int(at(p, "steps.count"));
    if (start === null || end === null || n === null || n <= 0 || end < start) continue;
    const source = [platform(p), at(p, "dataSource.device.displayName"), at(p, "dataSource.application.packageName")].join("|");
    let mine = bySource.get(source);
    if (!mine) bySource.set(source, (mine = new Map()));
    const first = Math.floor(start / 60);
    const minutes = Math.max(1, Math.ceil(end / 60) - first);
    for (let i = 0; i < minutes; i++) {
      const share = Math.floor((n * (i + 1)) / minutes) - Math.floor((n * i) / minutes);
      const ts = (first + i) * 60;
      mine.set(ts, (mine.get(ts) ?? 0) + share);
    }
  }
  const out = new Map<number, number>();
  for (const mine of bySource.values()) {
    for (const [ts, n] of mine) out.set(ts, Math.max(out.get(ts) ?? 0, n));
  }
  return out;
}

// --- Sessions -------------------------------------------------------------------------------------

const STAGES: Record<string, Stage> = { AWAKE: "awake", LIGHT: "light", DEEP: "deep", REM: "rem" };

/** A point's stable id: its resource name, which survives a re-fetch, else type and start. */
const pointId = (p: unknown, kind: string, start: number) => str(at(p, "name")) ?? `${kind}-${start}`;

const duration = (s: Session) => s.endTs - s.startTs;
/** Longest first, then earliest, then id: deterministic whatever order the API returned. */
const longest = (xs: Session[]) => [...xs].sort((a, b) => duration(b) - duration(a) || a.startTs - b.startTs || a.id.localeCompare(b.id))[0];

/**
 * Sleep sessions, each on its local wake day, and their stage segments.
 *
 * `isMain`: one session per wake day at most. Sessions flagged `metadata.mainSleep` win, even when shorter. A day where
 * no session carries the flag at all falls back to its longest session. proto3 omits `false`, so a nap next to a
 * flagged night reads as unflagged and loses; a day whose only flags are an explicit `false` has no main sleep.
 *
 * Segments only for `stagesStatus` SUCCEEDED with a recognised stage list; any other session keeps its summary minutes
 * and gets no hypnogram.
 */
export function mapSleep(points: unknown[], tz: string): { sessions: Session[]; segments: Segment[] } {
  const sessions = new Map<string, { row: Session; flag: unknown }>();
  const segments = new Map<string, Segment[]>();
  for (const p of points) {
    const o = at(p, "sleep");
    const start = secs(at(o, "interval.startTime"));
    const end = secs(at(o, "interval.endTime"));
    if (!isObj(o) || start === null || end === null || end <= start) continue;
    const id = pointId(p, "sleep", start);
    const stagesStatus = str(at(o, "metadata.stagesStatus"));
    const summary = at(o, "summary.stagesSummary");
    const minutesIn = (type: string) => {
      const s = Array.isArray(summary) ? summary.find((x) => at(x, "type") === type) : undefined;
      return s === undefined ? null : int(at(s, "minutes"));
    };
    sessions.set(id, {
      flag: at(o, "metadata.mainSleep"),
      row: {
        id,
        day: localDay(end, tz),
        startTs: start,
        endTs: end,
        isMain: false,
        processed: at(o, "metadata.processed") === true,
        stagesStatus,
        asleepMin: int(at(o, "summary.minutesAsleep")),
        awakeMin: int(at(o, "summary.minutesAwake")),
        deepMin: minutesIn("DEEP"),
        lightMin: minutesIn("LIGHT"),
        remMin: minutesIn("REM"),
      },
    });

    const stages = at(o, "stages");
    const segs = new Map<number, Segment>(); // by start: the segment primary key
    if (stagesStatus === "SUCCEEDED" && Array.isArray(stages)) {
      for (const s of stages) {
        const sStart = secs(at(s, "startTime"));
        const sEnd = secs(at(s, "endTime"));
        const stage = STAGES[String(at(s, "type"))];
        if (!stage || sStart === null || sEnd === null) {
          segs.clear(); // a stage we can't read makes the whole hypnogram suspect
          break;
        }
        if (sEnd > sStart) segs.set(sStart, { sessionId: id, startTs: sStart, endTs: sEnd, stage });
      }
    }
    segments.set(id, [...segs.values()].sort((a, b) => a.startTs - b.startTs));
  }

  const byDay = new Map<string, { row: Session; flag: unknown }[]>();
  for (const s of sessions.values()) byDay.set(s.row.day, [...(byDay.get(s.row.day) ?? []), s]);
  for (const day of byDay.values()) {
    const flagged = day.filter((s) => s.flag === true).map((s) => s.row);
    const unflagged = day.every((s) => typeof s.flag !== "boolean");
    const main = flagged.length ? longest(flagged) : unflagged ? longest(day.map((s) => s.row)) : undefined;
    if (main) main.isMain = true;
  }
  return { sessions: [...sessions.values()].map((s) => s.row), segments: [...segments.values()].flat() };
}

/** Exercises on their local start day. */
export function mapExercises(points: unknown[], tz: string): Exercise[] {
  const out = new Map<string, Exercise>();
  for (const p of points) {
    const o = at(p, "exercise");
    const start = secs(at(o, "interval.startTime"));
    const end = secs(at(o, "interval.endTime"));
    if (!isObj(o) || start === null || end === null || end < start) continue;
    const id = pointId(p, "exercise", start);
    out.set(id, {
      id,
      day: localDay(start, tz),
      startTs: start,
      endTs: end,
      type: str(o.exerciseType) ?? "UNSPECIFIED",
      name: str(o.displayName),
      calories: num(at(o, "metricsSummary.caloriesKcal")),
      distanceM: per(num(at(o, "metricsSummary.distanceMillimeters")), 1000),
    });
  }
  return [...out.values()];
}

// --- Extra metrics (shown, not scored) --------------------------------------------------------------

/** Seconds from a proto Duration ("3600s", "1.5s"). */
const durationS = (v: unknown) => (typeof v === "string" && /^-?\d+(\.\d+)?s$/.test(v) ? Number(v.slice(0, -1)) : null);
const sum = (...xs: (number | null)[]) => (xs.every((x) => x === null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0));
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/** `dailyRollUp` value → extra metric values, per Google type. Paths from the `{Type}RollupValue` reference pages. */
const EXTRA = {
  distance: (o: Obj) => ({ distance: per(num(o.millimetersSum), 1e6) }),
  floors: (o: Obj) => ({ floors: int(o.countSum) }),
  altitude: (o: Obj) => ({ elevation: per(num(o.gainMillimetersSum), 1000) }),
  "active-zone-minutes": (o: Obj) => ({ azm: sum(int(o.sumInFatBurnHeartZone), int(o.sumInCardioHeartZone), int(o.sumInPeakHeartZone)) }),
  "active-minutes": (o: Obj) => {
    const by = (level: string) => sum(...list(o.activeMinutesRollupByActivityLevel).filter((r) => at(r, "activityLevel") === level).map((r) => int(at(r, "activeMinutesSum"))));
    return { active_minutes: sum(by("MODERATE"), by("VIGOROUS")), light_minutes: by("LIGHT") };
  },
  "active-energy-burned": (o: Obj) => ({ active_calories: num(o.kcalSum) }),
  "sedentary-period": (o: Obj) => ({ sedentary_minutes: per(durationS(o.durationSum), 60) }),
  "heart-rate": (o: Obj) => ({ avg_hr: num(o.beatsPerMinuteAvg) }),
  "hydration-log": (o: Obj) => ({ water: num(at(o, "amountConsumed.millilitersSum")) }),
  "nutrition-log": (o: Obj) => ({
    calories_in: num(at(o, "energy.kcalSum")),
    carbs: num(at(o, "totalCarbohydrate.gramsSum")),
    fat: num(at(o, "totalFat.gramsSum")),
    protein: num(at(list(o.nutrients).find((n) => at(n, "nutrient") === "PROTEIN"), "quantity.gramsSum")),
  }),
  "blood-glucose": (o: Obj) => ({ glucose: num(o.bloodGlucoseMilligramsPerDeciliterAvg) }),
  "core-body-temperature": (o: Obj) => ({ core_temp: num(o.temperatureCelsiusAvg) }),
  "swim-lengths-data": (o: Obj) => ({ swim_strokes: int(o.strokeCountSum) }),
} satisfies Partial<Record<DataTypeId, (o: Obj) => Partial<Record<ExtraKey, number | null>>>>;

export type ExtraType = keyof typeof EXTRA;
export const EXTRA_TYPES = Object.keys(EXTRA) as ExtraType[];

/** `dailyRollUp` points → one value per day and metric. Missing values are skipped, never written as 0. */
export function mapExtra(type: ExtraType, points: unknown[]): DailyValue[] {
  const out: DailyValue[] = [];
  for (const p of points) {
    const day = civil(at(p, "civilStartTime.date"));
    const o = at(p, bodyKey(type));
    if (!day || !isObj(o)) continue;
    for (const [key, value] of Object.entries(EXTRA[type](o))) if (value !== null) out.push({ day, key, value });
  }
  return out;
}

/** The latest height reading, in cm (the pipeline's fallback when the profile has none). */
export function mapHeight(points: unknown[]): { ts: number; cm: number } | null {
  let best: { ts: number; cm: number } | null = null;
  for (const p of points) {
    const ts = secs(at(p, "height.sampleTime.physicalTime"));
    const mm = num(at(p, "height.heightMillimeters"));
    if (ts !== null && mm !== null && mm > 0 && (!best || ts >= best.ts)) best = { ts, cm: Math.round(mm) / 10 };
  }
  return best;
}

/** ECG readings and irregular rhythm notifications. The ECG waveform is never kept, only its result. */
export function mapRecords(type: "electrocardiogram" | "irregular-rhythm-notification", points: unknown[], tz: string): HealthRecord[] {
  const out: HealthRecord[] = [];
  for (const p of points) {
    const o = at(p, bodyKey(type));
    const ts = secs(at(o, "interval.startTime"));
    if (!isObj(o) || ts === null) continue;
    const kind = type === "electrocardiogram" ? "ecg" : "irn";
    const data =
      kind === "ecg"
        ? { result: str(o.resultClassification) ?? "RESULT_CLASSIFICATION_UNSPECIFIED", avgBpm: int(o.beatsPerMinuteAvg) }
        : { alertWindows: list(o.alertWindows).length, endTs: secs(at(o, "interval.endTime")) };
    out.push({ id: pointId(p, kind, ts), kind, ts, day: localDay(ts, tz), data });
  }
  return out;
}
