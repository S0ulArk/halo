// Settings' view of the Google source, from the sync's saved state (state.ts): per group of data types its last sync and
// error, and the first sync's progress. Ported from the web app's src/server/queries/settings.ts (GROUPS,
// syncErrorText, importProgress). Pure, for the tests.
import type { JobState, SyncDoc } from "./state";

export const GOOGLE_GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: "heart-rate", label: "Heart rate", types: ["heart-rate"] },
  { key: "steps", label: "Steps", types: ["steps", "steps-daily"] },
  { key: "sleep", label: "Sleep", types: ["sleep"] },
  { key: "hrv", label: "Heart rate variability", types: ["daily-heart-rate-variability"] },
  { key: "rhr", label: "Resting heart rate", types: ["daily-resting-heart-rate"] },
  { key: "resp", label: "Respiratory rate", types: ["daily-respiratory-rate"] },
  { key: "temp", label: "Skin temperature", types: ["daily-sleep-temperature-derivations"] },
  { key: "spo2", label: "Blood oxygen", types: ["daily-oxygen-saturation"] },
  { key: "zones", label: "Heart rate zones", types: ["daily-heart-rate-zones", "time-in-heart-rate-zone"] },
  { key: "ranges", label: "Personal resting HR and HRV ranges", types: ["rhr-range", "hrv-range"] },
  { key: "exercise", label: "Exercise", types: ["exercise"] },
  { key: "vo2max", label: "VO2 max", types: ["daily-vo2-max", "run-vo2-max"] },
  { key: "calories", label: "Calories", types: ["total-calories"] },
  { key: "weight", label: "Weight and body fat", types: ["weight", "body-fat", "height"] },
  { key: "activity", label: "Distance, floors and Active Zone Minutes", types: ["distance", "floors", "altitude", "active-zone-minutes", "active-minutes", "active-energy-burned", "sedentary-period", "heart-rate-daily", "swim-lengths-data"] },
  { key: "nutrition", label: "Food and water", types: ["hydration-log", "nutrition-log"] },
  { key: "vitals", label: "Glucose and core temperature", types: ["blood-glucose", "core-body-temperature"] },
  { key: "rhythm", label: "ECG and irregular rhythm", types: ["electrocardiogram", "irregular-rhythm-notification"] },
];

/** Shown-only types and Google inputs Pulse falls back from: they never hold the first import's progress open. */
const OPTIONAL_GROUPS = new Set(["zones", "ranges", "activity", "nutrition", "vitals", "rhythm"]);
const CORE_TYPES = new Set(GOOGLE_GROUPS.filter((g) => !OPTIONAL_GROUPS.has(g.key)).flatMap((g) => g.types));

/** A group not synced for this long reads as behind (the web's STALE_MS). */
const STALE_MS = 2 * 3600_000;

/**
 * A sync error as a person reads it. `lastError` is `[google] <type>: <CODE> (HTTP n)` (GoogleError); the code is
 * kept in brackets for a bug report, the rest is dropped.
 */
export function syncErrorText(raw: string): string {
  const code = /: ([A-Za-z_0-9]+)(?: \(HTTP \d+\))?$/.exec(raw)?.[1] ?? raw;
  const text: Record<string, string> = {
    ACCOUNT_NOT_LINKED: "No Google Health profile",
    auth_revoked: "Access revoked",
    RESOURCE_EXHAUSTED: "Rate limited, retrying",
    http_429: "Rate limited, retrying",
    PERMISSION_DENIED: "Not allowed",
    ACCESS_TOKEN_SCOPE_INSUFFICIENT: "Not allowed",
    network: "Couldn’t reach Google, retrying",
  };
  return text[code] ?? (/^http_5\d\d$/.test(code) ? "Google is having trouble, retrying" : `Failed (${code})`);
}

export type GroupStatus = {
  key: string;
  label: string;
  /** Epoch ms of the group's oldest last success (every member synced by then); null before all have. */
  lastSuccessAt: number | null;
  status: "ok" | "stale" | "error" | "never";
  error: string | null;
};

/** Every group's state at `nowMs`. */
export function groupStatus(doc: SyncDoc, nowMs: number): GroupStatus[] {
  return GOOGLE_GROUPS.map((g) => {
    const members = g.types.map((t) => doc.jobs[t]).filter((x): x is JobState => !!x);
    const successes = members.map((r) => r.lastSuccessAt);
    const last = members.length && successes.every((x) => x != null) ? Math.min(...(successes as number[])) * 1000 : null;
    const raw = members.find((r) => r.lastError)?.lastError ?? null;
    const error = raw ? syncErrorText(raw) : null;
    const status = error ? "error" : last == null ? "never" : nowMs - last > STALE_MS ? "stale" : "ok";
    return { key: g.key, label: g.label, lastSuccessAt: last, status, error };
  });
}

/** The first import's progress over the core types: the least-done type's days of the longest total; null when done. */
export function importProgress(doc: SyncDoc): { done: number; total: number } | null {
  const rows = Object.entries(doc.jobs)
    .filter(([k]) => CORE_TYPES.has(k))
    .map(([, r]) => r);
  const pending = rows.filter((r) => r.backfillDone < r.backfillTotal);
  if (!pending.length) return null;
  return { done: Math.min(...pending.map((r) => r.backfillDone)), total: Math.max(...pending.map((r) => r.backfillTotal)) };
}
