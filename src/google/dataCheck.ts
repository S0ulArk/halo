// Data check with the Google Health API as the source: for each of the last `days` local days, what Google returns for
// each checked metric (a daily value per device and recording method, or Google's merged daily roll-up for totals) and
// for sleep, next to what Pulse stored. Same DayCheck shape and report as the Health Connect check
// (src/health/dataCheckSummary.ts), so the screen shows either. Read-only: nothing is written.
import type { Store } from "@/data/store";
import type { Metrics, Session } from "@/data/types";
import { formatReport, type DayCheck, type MetricLine, type SourceLine } from "@/health/dataCheckSummary";
import { addDays, localDay, localMidnight, wall } from "@/lib/time";
import { isSignInError } from "../../modules/pulse-google/errors";
import type { DataTypeId } from "./catalogue";
import { createGoogleClient, type TokenProvider } from "./client";
import { at, bodyKey, mapSleep, platform } from "./map";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => {
  const x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};
const civil = (v: unknown): string | null => {
  const [y, m, d] = ["year", "month", "day"].map((k) => num(at(v, k)));
  return y === null || m === null || d === null ? null : `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

type Check = {
  key: string;
  label: string;
  unit: string;
  type: DataTypeId;
  /** A dailyRollUp total (Google merges every device); else a daily list type, one value per device and day. */
  rollup?: boolean;
  value: (o: Obj) => number | null;
  /** What Pulse stored for the day: a Metrics column, or a daily value. */
  pulse: (m: Metrics | undefined, values: Map<string, number>) => number | null;
};

const CHECKS: Check[] = [
  { key: "steps", label: "Steps", unit: "", type: "steps", rollup: true, value: (o) => num(o.countSum), pulse: (m) => m?.steps ?? null },
  { key: "spo2", label: "SpO2", unit: "%", type: "daily-oxygen-saturation", value: (o) => num(o.averagePercentage), pulse: (m) => m?.spo2Pct ?? null },
  { key: "hrv", label: "HRV", unit: "ms", type: "daily-heart-rate-variability", value: (o) => num(o.averageHeartRateVariabilityMilliseconds), pulse: (m) => m?.hrvMs ?? null },
  { key: "rhr", label: "Resting HR", unit: "bpm", type: "daily-resting-heart-rate", value: (o) => num(o.beatsPerMinute), pulse: (m) => m?.rhrBpm ?? null },
  { key: "resp", label: "Breathing", unit: "rpm", type: "daily-respiratory-rate", value: (o) => num(o.breathsPerMinute), pulse: (m) => m?.respBpm ?? null },
  { key: "temp", label: "Skin temperature", unit: "°C", type: "daily-sleep-temperature-derivations", value: (o) => num(o.nightlyTemperatureCelsius), pulse: (m) => m?.nightlyTempC ?? null },
  {
    key: "distance",
    label: "Distance",
    unit: "km",
    type: "distance",
    rollup: true,
    value: (o) => {
      const mm = num(o.millimetersSum);
      return mm === null ? null : mm / 1e6;
    },
    pulse: (_, v) => v.get("distance") ?? null,
  },
  { key: "calories", label: "Calories", unit: "kcal", type: "total-calories", rollup: true, value: (o) => num(o.kcalSum), pulse: (m) => m?.calories ?? null },
  {
    key: "azm",
    label: "Active Zone Minutes",
    unit: "min",
    type: "active-zone-minutes",
    rollup: true,
    value: (o) => {
      const parts = [o.sumInFatBurnHeartZone, o.sumInCardioHeartZone, o.sumInPeakHeartZone].map(num);
      return parts.every((x) => x === null) ? null : parts.reduce<number>((a, x) => a + (x ?? 0), 0);
    },
    pulse: (_, v) => v.get("azm") ?? null,
  },
  { key: "vo2", label: "VO2 max", unit: "", type: "daily-vo2-max", value: (o) => num(o.vo2Max), pulse: (m) => m?.vo2maxDaily ?? m?.vo2maxRun ?? null },
];

const PLATFORM: Record<string, string> = { FITBIT: "Fitbit", HEALTH_CONNECT: "Health Connect" };
const ROLLUP_SOURCE = "Google daily roll-up";

/** "Fitbit/Charge 6", "Health Connect/com.example.app": the point's platform and its device or app. */
const sourceOf = (p: unknown) => {
  const plat = platform(p);
  const what = at(p, "dataSource.device.displayName") ?? at(p, "dataSource.application.packageName");
  return `${(plat && PLATFORM[plat]) ?? plat ?? "unknown"}/${typeof what === "string" && what ? what : "no device"}`;
};

const round = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

type Hit = { day: string; source: string; fitbit: boolean; value: number; detail: string };

export type GoogleDataCheck = { days: DayCheck[]; text: string; /** Metrics Google wouldn't serve ("SpO2: [google] …"). */ errors: string[] };

export async function runGoogleDataCheck(
  store: Store,
  opts: { timeZone: string; token: TokenProvider; days?: number; now?: Date; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> },
): Promise<GoogleDataCheck> {
  const tz = opts.timeZone;
  const t = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const today = localDay(t, tz);
  const n = opts.days ?? 10;
  const days = Array.from({ length: n }, (_, i) => addDays(today, -i));
  const first = days[n - 1];
  const from = localMidnight(first, tz);
  const client = createGoogleClient({ token: opts.token, timeZone: tz, fetch: opts.fetch, sleep: opts.sleep, maxTries: 2 });
  const hhmm = (s: number) => wall(s, tz).time.slice(0, 5);

  const hits = new Map<string, Hit[]>();
  const errors: string[] = [];
  for (const c of CHECKS) {
    const out: Hit[] = [];
    try {
      if (c.rollup) {
        for (const p of await client.dailyRollUp(c.type, first, addDays(today, 1))) {
          const day = civil(at(p, "civilStartTime.date"));
          const o = at(p, bodyKey(c.type));
          const v = isObj(o) ? c.value(o) : null;
          if (day && v !== null) out.push({ day, source: ROLLUP_SOURCE, fitbit: true, value: v, detail: "every device, merged by Google" });
        }
      } else {
        for (const p of await client.list(c.type, from, t)) {
          const o = at(p, bodyKey(c.type));
          const day = isObj(o) ? civil(o.date) : null;
          const v = isObj(o) ? c.value(o) : null;
          const method = at(p, "dataSource.recordingMethod");
          if (day && v !== null) out.push({ day, source: sourceOf(p), fitbit: true, value: v, detail: typeof method === "string" ? method.toLowerCase().replaceAll("_", " ") : "daily value" });
        }
      }
    } catch (e) {
      if (isSignInError(e)) throw e;
      errors.push(`${c.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
    hits.set(c.key, out);
  }

  // Sleep: Google's sessions ending on each day, and the ones Pulse kept.
  const sleep: { day: string; line: SourceLine }[] = [];
  try {
    const points = await client.list("sleep", from, t);
    const { sessions } = mapSleep(points, tz);
    const byId = new Map(points.map((p) => [String(at(p, "name") ?? ""), p]));
    for (const s of sessions) {
      const p = byId.get(s.id);
      const stages = at(p, "sleep.stages");
      sleep.push({
        day: s.day,
        line: {
          source: sourceOf(p),
          fitbit: s.isMain,
          records: 1,
          value: round((s.endTs - s.startTs) / 3600),
          detail: `${hhmm(s.startTs)}–${hhmm(s.endTs)}, ${Array.isArray(stages) ? stages.length : 0} stages [${s.stagesStatus ?? "no stages"}]${s.isMain ? ", main" : ", nap"}`,
        },
      });
    }
  } catch (e) {
    if (isSignInError(e)) throw e;
    errors.push(`Sleep: ${e instanceof Error ? e.message : String(e)}`);
  }

  const [metrics, sessions, values] = await Promise.all([store.allMetrics(), store.allSessions(), store.dailyValues({ from: first, to: today })]);
  const metricsOn = new Map(metrics.map((m) => [m.day, m]));
  const valuesOn = (day: string) => new Map(values.filter((v) => v.day === day).map((v) => [v.key, v.value]));
  const pulseSleep = (day: string) =>
    sessions
      .filter((s: Session) => s.day === day)
      .map((s) => `${s.isMain ? "main" : "nap"} ${hhmm(s.startTs)}–${hhmm(s.endTs)} asleep ${s.asleepMin ?? "?"} min${s.stagesStatus === "SUCCEEDED" ? " (staged)" : ""}`);

  const checked: DayCheck[] = days.map((day) => {
    const lines: MetricLine[] = CHECKS.map((c) => {
      const bySource = new Map<string, Hit[]>();
      for (const h of hits.get(c.key) ?? []) if (h.day === day) bySource.set(h.source, [...(bySource.get(h.source) ?? []), h]);
      const sources: SourceLine[] = [...bySource].map(([source, hs]) => ({
        source,
        fitbit: hs.some((h) => h.fitbit),
        records: hs.length,
        value: round(hs.reduce((a, h) => a + h.value, 0) / hs.length),
        detail: [...new Set(hs.map((h) => h.detail))].join(", "),
      }));
      const pulse = c.pulse(metricsOn.get(day), valuesOn(day));
      return { key: c.key, label: c.label, unit: c.unit, pulse: pulse === null ? null : round(pulse), sources };
    });
    return { day, metrics: lines, sleep: { pulse: pulseSleep(day), sources: sleep.filter((x) => x.day === day).map((x) => x.line) } };
  });

  const legend = "★ = what Halo uses: each day's value from Google (the band's), Google's merged roll-up for totals, the main sleep";
  const text = [formatReport(checked, "", { source: "Google Health API", legend }), ...(errors.length ? ["", "Not read:", ...errors.map((e) => `  ${e}`)] : [])].join("\n");
  return { days: checked, text, errors };
}
