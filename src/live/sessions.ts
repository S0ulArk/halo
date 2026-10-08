// The local logs behind Breathe and Live Workout: what one finished session keeps, how it is summed up from the live
// samples, and the capped list the screens show "Recent" from. Pure; the AsyncStorage side is ./storage.ts.
//
// These are the phone's own notes, never Store rows: Health Connect stays the scoring source, so a workout counts
// once, when Fitbit syncs it.
import type { RrBeat } from "@/health/bleHr";
import { cycleMs, type BreathProtocol, type BreathProtocolId } from "./breath";
import { hrvBeforeAfter, rsaAmplitude } from "./spotHrv";

export type HrPoint = { /** Epoch ms. */ t: number; bpm: number };

/** Sessions kept per log; the screens show the newest few. */
export const LOG_CAP = 50;

export type BreathRecord = {
  /** Start, epoch ms; also the record's key. */
  at: number;
  protocol: BreathProtocolId;
  plannedMs: number;
  /** How long it ran. */
  ms: number;
  /** Ran to the end (not stopped early). */
  completed: boolean;
  /** Mean bpm over the first and the last HR_EDGE_MS; null without the band. */
  hrStart: number | null;
  hrEnd: number | null;
  /** Spot RMSSD (ms) before and after; null without RR intervals or with too few clean beats. */
  hrvBefore: number | null;
  hrvAfter: number | null;
  /** Mean heart-rate swing per paced breath, bpm. */
  rsa: number | null;
};

export type WorkoutRecord = {
  at: number;
  ms: number;
  /** The workout's own Strain, 0–21 (its TRIMP alone through the log map). */
  strain: number;
  /** Day Strain when it started and ended, 0–21. */
  dayStart: number;
  dayEnd: number;
  avgHr: number | null;
  maxHr: number | null;
  /** Seconds below Zone 1, then Zones 1–5. */
  zoneSeconds: number[];
  target: [number, number] | null;
};

/** HR start and end are means over this much at each end, so one noisy beat does not decide them. */
export const HR_EDGE_MS = 20_000;

/** Mean bpm of the points in [from, to), rounded; null when there are none. */
export function meanHr(points: readonly HrPoint[], from: number, to: number): number | null {
  let sum = 0;
  let n = 0;
  for (const p of points) {
    if (p.t < from || p.t >= to || !(p.bpm > 0)) continue;
    sum += p.bpm;
    n++;
  }
  return n ? Math.round(sum / n) : null;
}

/** A Breathe session's record from what the band sent during [start, end) and the RR buffer at the tap. */
export function breathRecord(o: {
  protocol: BreathProtocol;
  start: number;
  end: number;
  plannedMs: number;
  hr: readonly HrPoint[];
  beats: readonly RrBeat[];
  preRr: readonly number[];
}): BreathRecord {
  const ms = Math.max(0, o.end - o.start);
  const edge = Math.min(HR_EDGE_MS, ms / 2);
  const { before, after } = hrvBeforeAfter(o.preRr, o.beats, o.start, o.end);
  return {
    at: o.start,
    protocol: o.protocol.id,
    plannedMs: o.plannedMs,
    ms,
    completed: ms >= o.plannedMs - 500,
    hrStart: meanHr(o.hr, o.start, o.start + edge),
    hrEnd: meanHr(o.hr, o.end - edge, o.end + 1),
    hrvBefore: before,
    hrvAfter: after,
    rsa: rsaAmplitude(o.beats, o.start, o.end, cycleMs(o.protocol.stages)).rsa,
  };
}

/** Change from `a` to `b` as a whole percentage; null without both or from 0. */
export const pctChange = (a: number | null, b: number | null): number | null => (a === null || b === null || a <= 0 ? null : Math.round(((b - a) / a) * 100));

/** "+12%" / "−8%" / "±0%". */
export const signedPct = (p: number): string => (p > 0 ? `+${p}%` : p < 0 ? `−${Math.abs(p)}%` : "±0%");

/** "1:05" (m:ss), or "1:02:05" past an hour. */
export function clockDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** `rec` added to `log` newest first, replacing one with the same start, capped at LOG_CAP. */
export function addToLog<T extends { at: number }>(log: readonly T[], rec: T, cap = LOG_CAP): T[] {
  return [rec, ...log.filter((r) => r.at !== rec.at)].sort((a, b) => b.at - a.at).slice(0, cap);
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);

/** A stored log back from JSON; entries that don't parse are dropped, a corrupt log reads as empty. */
export function parseLog<T>(json: string | null, parse: (x: Record<string, unknown>) => T | null): T[] {
  if (!json) return [];
  try {
    const xs: unknown = JSON.parse(json);
    if (!Array.isArray(xs)) return [];
    return xs.flatMap((x) => {
      const r = x && typeof x === "object" ? parse(x as Record<string, unknown>) : null;
      return r ? [r] : [];
    });
  } catch {
    return [];
  }
}

export function parseBreath(x: Record<string, unknown>): BreathRecord | null {
  if (!isNum(x.at) || !isNum(x.ms) || typeof x.protocol !== "string") return null;
  return {
    at: x.at,
    protocol: x.protocol as BreathProtocolId,
    plannedMs: isNum(x.plannedMs) ? x.plannedMs : x.ms,
    ms: x.ms,
    completed: x.completed === true,
    hrStart: numOrNull(x.hrStart),
    hrEnd: numOrNull(x.hrEnd),
    hrvBefore: numOrNull(x.hrvBefore),
    hrvAfter: numOrNull(x.hrvAfter),
    rsa: numOrNull(x.rsa),
  };
}

export function parseWorkout(x: Record<string, unknown>): WorkoutRecord | null {
  if (!isNum(x.at) || !isNum(x.ms) || !isNum(x.strain)) return null;
  const zones = Array.isArray(x.zoneSeconds) && x.zoneSeconds.length === 6 && x.zoneSeconds.every(isNum) ? (x.zoneSeconds as number[]) : [0, 0, 0, 0, 0, 0];
  const t = Array.isArray(x.target) && x.target.length === 2 && x.target.every(isNum) ? (x.target as [number, number]) : null;
  return {
    at: x.at,
    ms: x.ms,
    strain: x.strain,
    dayStart: isNum(x.dayStart) ? x.dayStart : 0,
    dayEnd: isNum(x.dayEnd) ? x.dayEnd : x.strain,
    avgHr: numOrNull(x.avgHr),
    maxHr: numOrNull(x.maxHr),
    zoneSeconds: zones,
    target: t,
  };
}
