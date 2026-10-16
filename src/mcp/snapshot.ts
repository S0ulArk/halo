// What the Claude connector holds: one JSON snapshot of the person's Halo data, built on the phone from the same
// digests the in-app coach reads (src/coach/tools.ts), so Claude and the coach see the same numbers. Every daily
// metric for up to 400 days; full day and sleep detail for the last 14 days; workouts for 180; the journal for 365;
// health, journal effects and the latest reports. Each part that fails is left out rather than failing the rest.
// The Worker (src/mcp/worker/worker.js) serves slices of it as MCP tools.
import { coachTools, dayDigest, sleepDigest } from "@/coach/tools";
import { addDays } from "@/lib/time";
import { getActivities } from "@/queries/activities";
import { todayOf, type QueryCtx } from "@/queries/common";
import { dailyTable, journalBehaviours, journalTable, toObjects } from "@/queries/settings";
import { TREND_METRICS } from "@/queries/trends";
import app from "../../app.json";

export const SNAPSHOT_SCHEMA = 1;
const DAYS = 400;
const DETAIL_DAYS = 14;
const ACTIVITY_DAYS = 180;
const JOURNAL_DAYS = 365;

export type Snapshot = {
  schema: typeof SNAPSHOT_SCHEMA;
  generatedAt: string;
  app: string;
  timeZone: string;
  today: string;
  units: "metric";
  profile: unknown;
  metrics: { column: string; label: string; unit: string | null; group: string }[];
  days: Record<string, string | number | null>[];
  dayDetail: Record<string, unknown>;
  sleepDetail: Record<string, unknown>;
  activities: unknown;
  health: unknown;
  journal: unknown;
  journalImpacts: unknown;
  reports: { week: unknown; month: unknown };
};

const round = (v: number, dp = 0) => Math.round(v * 10 ** dp) / 10 ** dp;
/** Lets the UI breathe between the heavier reads when this runs with the app open. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

async function part<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[connector] snapshot ${label}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function buildSnapshot(ctx: QueryCtx): Promise<Snapshot> {
  const today = todayOf(ctx);
  const tools = coachTools(ctx);
  // The coach's tools, called directly: the results only pass through to the Worker, so their exact types don't matter.
  const run = async (t: { execute?: unknown }, args: object): Promise<unknown> =>
    (t.execute as (args: object, opts: { toolCallId: string; messages: [] }) => unknown)(args, { toolCallId: "connector", messages: [] });

  const profile = await part("profile", () => run(tools.get_profile, {}));
  const table = await part("days", () => dailyTable(ctx));
  const days = table ? toObjects(table).slice(-DAYS) : [];
  await breathe();

  const dayDetail: Record<string, unknown> = {};
  const sleepDetail: Record<string, unknown> = {};
  for (let i = 0; i < DETAIL_DAYS; i++) {
    const day = addDays(today, -i);
    if (days.length && day < String(days[0].day)) break;
    const [d, s] = await Promise.all([part(`day ${day}`, () => dayDigest(ctx, day)), part(`sleep ${day}`, () => sleepDigest(ctx, day))]);
    if (d) dayDetail[day] = d;
    if (s) sleepDetail[day] = s;
    await breathe();
  }

  const activities = await part("activities", async () => {
    const a = await getActivities(ACTIVITY_DAYS, ctx);
    return {
      workouts: a.groups.flatMap((g) =>
        g.items.map((i) => ({
          id: i.id,
          day: g.day,
          name: i.name,
          start: new Date(i.start).toISOString(),
          minutes: Math.round((i.end - i.start) / 60_000),
          strain: i.strain.value === null ? null : round(i.strain.value, 1),
          distanceKm: i.distanceKm === null ? null : round(i.distanceKm, 2),
        })),
      ),
      detected: a.groups.flatMap((g) => g.detected.map((d) => ({ day: g.day, likely: d.label, minutes: Math.round((d.end - d.start) / 60_000), avgHr: d.avgHr, strain: d.strain === null ? null : round(d.strain, 1) }))),
      recoveryCost: null,
    };
  });
  await breathe();

  const health = await part("health", () => run(tools.get_health, {}));
  const journal = await part("journal", async () => {
    const [t, behaviours] = await Promise.all([journalTable(ctx), journalBehaviours(ctx)]);
    const from = addDays(today, -(JOURNAL_DAYS - 1));
    return { behaviours, entries: toObjects(t).filter((e) => String(e.day) >= from) };
  });
  const journalImpacts = await part("journal effects", async () => ({
    recovery: await run(tools.get_journal_impacts, { outcome: "recovery" }),
    hrv: await run(tools.get_journal_impacts, { outcome: "hrv" }),
    sleep: await run(tools.get_journal_impacts, { outcome: "sleep" }),
  }));
  const week = await part("weekly report", () => run(tools.get_report, { kind: "week" }));
  const month = await part("monthly report", () => run(tools.get_report, { kind: "month" }));

  return {
    schema: SNAPSHOT_SCHEMA,
    generatedAt: new Date(ctx.now * 1000).toISOString(),
    app: `Halo ${app.expo.version}`,
    timeZone: ctx.timeZone,
    today,
    units: "metric",
    profile,
    metrics: TREND_METRICS.map((m) => ({ column: m.column, label: m.label, unit: m.unit ?? (m.format === "duration" ? "min" : null), group: m.group })),
    days,
    dayDetail,
    sleepDetail,
    activities,
    health,
    journal,
    journalImpacts,
    reports: { week, month },
  };
}
