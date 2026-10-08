// Loading: the daily rows, sessions and exercises both stages fold over, and small shared helpers.
// Ported from Pulse's src/server/pipeline/data.ts: the Postgres reads are Store calls, the row types live in
// src/data/types.ts, and the hash is src/pipeline/hash.ts.
import type { Store } from "@/data/store";
import type { Exercise, Metrics, Segment, Session } from "@/data/types";
import { addDays, daysBetween, localDay, localMidnight } from "@/lib/time";
import type { PipelineOptions } from "./types";
import { metricsWithLoggedBody } from "@/data/body";

export type { Exercise, Metrics, Segment, Session };
export { sha } from "./hash";

export type Data = NonNullable<Awaited<ReturnType<typeof load>>>;

export function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Bytewise text order (Postgres `collate "C"`, SQLite's default): session and exercise order feeds stage 1's keys and the naps list. */
export const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function load(store: Store, { timeZone: tz }: PipelineOptions) {
  const [metricRows, sessionRows, exerciseRows, hrSpan] = await Promise.all([
    metricsWithLoggedBody(store),
    store.allSessions(),
    store.allExercises(),
    store.hrBounds(),
  ]);
  const metrics = metricRows.slice().sort((a, b) => byteOrder(a.day, b.day));
  const sessions = sessionRows.slice().sort((a, b) => a.startTs - b.startTs || byteOrder(a.id, b.id));
  const exercises = exerciseRows.slice().sort((a, b) => a.startTs - b.startTs || byteOrder(a.id, b.id));
  const candidates = [
    ...metrics.map((m) => m.day),
    ...sessions.map((s) => s.day),
    ...exercises.map((x) => x.day),
    ...(hrSpan ? [localDay(hrSpan.first, tz), localDay(hrSpan.last, tz)] : []),
  ].sort();
  if (!candidates.length) return null;
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  const days = Array.from({ length: daysBetween(first, last) + 1 }, (_, i) => addDays(first, i));
  const start = new Map(days.map((d) => [d, localMidnight(d, tz)]));
  start.set(addDays(last, 1), localMidnight(addDays(last, 1), tz));

  const sessionsByDay = groupBy(sessions, (s) => s.day);
  const mainOf = new Map<string, Session>();
  for (const [day, list] of sessionsByDay) {
    const mains = list.filter((s) => s.isMain).sort((a, b) => b.endTs - b.startTs - (a.endTs - a.startTs) || a.id.localeCompare(b.id));
    if (mains.length) mainOf.set(day, mains[0]);
  }
  return {
    days,
    first,
    last,
    dayStart: (d: string) => start.get(d) ?? localMidnight(d, tz),
    metrics: new Map(metrics.map((m) => [m.day, m])),
    sessions,
    sessionsByDay,
    mainOf,
    exercises,
    exercisesByDay: groupBy(exercises, (x) => x.day),
  };
}

/** Sessions and exercises that overlap [lo, hi). */
export const touching = <T extends { startTs: number; endTs: number }>(xs: T[], lo: number, hi: number) =>
  xs.filter((x) => x.endTs > lo && x.startTs < hi);

export const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
export const r1 = (x: number | null) => (x == null ? null : round(x, 1));

/** Days per read/write batch: keeps memory flat in history length. */
export const BATCH_DAYS = 30;

export type Progress = (stage: "stage1" | "stage2" | "journal", done: number, total: number) => void;
