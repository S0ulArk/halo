// The coach's tools over the 180-day demo seed on the in-memory Store, as Pulse's src/server/coach/tools.test.ts runs
// them over its seeded database: each tool returns this person's own numbers (the store bound to the ctx), with
// reasons for gaps, and nothing from another store.
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { seedDemo } from "@/data/seed";
import type { ScoreRow } from "@/data/store";
import type { Metrics, Profile } from "@/data/types";
import { runPipeline } from "@/pipeline";
import type { QueryCtx } from "@/queries/ctx";
import { coachSuggestions } from "./suggestions";
import { coachTools, sleepDigest, trendDigest } from "./tools";

const TZ = "Asia/Kolkata";
const TODAY = "2026-10-02";
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
const PROFILE: Profile = { birthDate: "1990-01-01", sex: "male", maxHr: 183, heightCm: 178, timeZone: TZ };
const opts = { toolCallId: "t", messages: [] } as never;
/** Runs a tool's execute with the SDK's call options; the coach's tools return one value, never a stream. */
const call = async <I, O>(t: { execute?: (input: I, o: never) => O | PromiseLike<O> | AsyncIterable<O> }, input: I) => (await t.execute!(input, opts)) as O;

async function ctxFor(store: MemoryStore): Promise<QueryCtx> {
  return { store, profile: PROFILE, timeZone: TZ, today: TODAY, now: NOW, sync: await store.getSyncState() };
}

/** The tools over a store with no rows: another person's empty phone. */
const blank = async () => coachTools(await ctxFor(new MemoryStore()));

const emptyRow = (day: string): ScoreRow => ({
  day,
  scoringVersion: 1,
  strain: null,
  activities: null,
  sessionRhrBpm: null,
  recovery: null,
  sleep: null,
  training_load: null,
  strain_target: null,
  sleep_planner: null,
  energy_bank: null,
  stress: null,
  health_monitor: null,
  healthspan: null,
  fitness: null,
  journal_impact: null,
});

const metricsRow = (day: string, hrvMs: number) => ({ day, hrvMs }) as unknown as Metrics;

let store: MemoryStore;
let ctx: QueryCtx;
beforeAll(async () => {
  store = new MemoryStore();
  await seedDemo(store, { today: TODAY, timeZone: TZ, now: NOW });
  await runPipeline(store, PROFILE, { today: TODAY });
  ctx = await ctxFor(store);
});

describe("coach tools", () => {
  it("trend ranges preserve daily gaps, units and equal-length previous periods", async () => {
    const empty = new MemoryStore();
    await empty.putScores({ ...emptyRow("2026-09-28"), recovery: { value: 40, reason: null, provisional: false } as never });
    await empty.putScores({ ...emptyRow("2026-10-01"), recovery: { value: 80, reason: null, provisional: true } as never });
    const r = await trendDigest(await ctxFor(empty), "recovery", "2026-09-30", "2026-10-02");
    expect(r.points.map((p) => p.value)).toEqual([null, 80, null]);
    expect(r.points[1].provisional).toBe(true);
    expect(r).toMatchObject({ unit: "%", observedDays: 1, calendarDays: 3, average: { value: 80 }, previous: { start: "2026-09-27", end: "2026-09-29", observedDays: 1, average: { value: 40 } } });
    expect((await trendDigest(ctx, "hours")).unit).toBe("min");
  });

  it("trend windows cap size, clamp future dates and exclude accumulating partial-day metrics", async () => {
    const r = await trendDigest(ctx, "strain", "2020-01-01", "2030-01-01");
    expect(r.calendarDays).toBe(90);
    expect(r.end).toBe(TODAY);
    expect(r.points.at(-1)).toMatchObject({ day: TODAY, value: null, excludedPartialDay: true });
    expect((await trendDigest(ctx, "recovery", "2030-01-01")).calendarDays).toBe(1);
  });

  it("sleep exposes measured detail and a separate, dated bedtime plan", async () => {
    const s = await sleepDigest(ctx, TODAY);
    expect(s.summary.map((v) => v.key)).toContain("efficiency");
    expect(s.summary.map((v) => v.key)).toContain("consistency");
    expect(s.details.map((v) => v.key)).toContain("debt");
    expect(s.planner.value?.plans).toHaveLength(3);
    expect(s.timeZone).toBe(TZ);
    expect(s.asleepMinutes.value).toBeGreaterThan(0);
  });

  it("get_day reads this person's stored scores, with a guidance line and only Pulse's scales", async () => {
    const day = await call(coachTools(ctx).get_day, { day: "2026-09-30" });
    const stored = await store.getScores("2026-09-30");
    expect(day.day).toBe("2026-09-30");
    expect(day.isToday).toBe(false);
    expect(day.recovery.value).toBe(Math.round(stored!.recovery!.value!));
    expect(day.recovery.contributors.length).toBeGreaterThan(0);
    expect(day.strain.scale).toBe("0-21");
    expect(typeof day.guidance).toBe("object");
    // A future day resolves to today; a day before the data starts resolves to the first day.
    expect((await call(coachTools(ctx).get_day, { day: "2030-01-01" })).day).toBe(TODAY);
    expect((await call(coachTools(ctx).get_sleep, { day: "2001-01-01" })).day).toBe(ctx.sync.firstDay);
  });

  it("get_day on a store with no data gives reasons, never zeros", async () => {
    const day = await call((await blank()).get_day, {});
    expect(day.recovery).toMatchObject({ value: null });
    expect(day.recovery.reason).toEqual(expect.any(String));
    expect(day.sleep.hoursAsleep).toBeNull();
  });

  it("workout detail is reachable from the list but cannot be read from another person's store", async () => {
    const tools = coachTools(ctx);
    const list = await call(tools.get_activities, { days: 14 });
    expect(list.workouts.length).toBeGreaterThan(0);
    expect(list.end).toBe(TODAY);
    const detail = await call(tools.get_activity, { id: list.workouts[0].id });
    expect(detail.workout!.stats.length).toBeGreaterThan(0);
    expect(detail.workout!.zones).toHaveProperty("reason");
    const other = await blank();
    expect(await call(other.get_activity, { id: list.workouts[0].id })).toMatchObject({ workout: null, reason: "no_data" });
    expect((await call(other.get_activities, { days: 14 })).workouts).toEqual([]);
  });

  it("a historical health result is unaffected by later fitness and healthspan values", async () => {
    const history = new MemoryStore();
    await seedDemo(history, { today: TODAY, timeZone: TZ, now: NOW });
    await runPipeline(history, PROFILE, { today: TODAY });
    const tools = coachTools(await ctxFor(history));
    const before = await call(tools.get_health, { day: "2026-09-15" });
    expect(before.vitals.length).toBeGreaterThan(0);
    const last = (await history.getScores(TODAY))!;
    await history.putScores({ ...last, fitness: { ...(last.fitness as object), reason: null, vo2max: 99 } as never, healthspan: { ...(last.healthspan as object), reason: null, pulseAge: 99 } as never });
    expect(await call(tools.get_health, { day: "2026-09-15" })).toEqual(before);
  });

  it("habit results retain sample sizes, uncertainty and insufficient-data counts", async () => {
    const result = await call(coachTools(ctx).get_journal_impacts, { outcome: "hrv" });
    expect(result.unit).toBe("SD");
    expect(result.effects.length + result.needsMoreData.length).toBeGreaterThan(0);
    for (const effect of result.effects) expect(effect).toMatchObject({ yesDays: expect.any(Number), noDays: expect.any(Number), confidenceInterval: expect.any(Array), effect: expect.any(String) });
    for (const item of result.needsMoreData) expect(item).toMatchObject({ yesDays: expect.any(Number), noDays: expect.any(Number) });
    expect((await call((await blank()).get_journal_impacts, { outcome: "recovery" })).effects).toEqual([]);
  });

  it("the latest weekly report is read from this person's reports, none on an empty store", async () => {
    const week = await call(coachTools(ctx).get_report, { kind: "week" });
    expect(week).toMatchObject({ period: expect.stringMatching(/^\d{4}-W\d{2}$/), partial: false });
    expect(await call((await blank()).get_report, { kind: "month" })).toEqual({ report: null, reason: "no_data" });
  });

  it("the profile tool gives age, sex, max HR and data start, nothing identifying", async () => {
    const p = await call(coachTools(ctx).get_profile, {});
    expect(p).toEqual({ age: 36, sex: "male", maxHr: 183, timeZone: TZ, firstDayWithData: ctx.sync.firstDay, today: TODAY, weekAgo: "2026-09-25" });
  });

  it("suggestion baselines exclude today's HRV", async () => {
    const empty = new MemoryStore();
    await empty.upsertMetrics([metricsRow("2026-10-01", 60), metricsRow("2026-10-02", 50)]);
    const s = await coachSuggestions(await ctxFor(empty));
    expect(s.map((x) => x.key)).toContain("hrv");
    expect(s[0]).toEqual({ key: "brief", text: "Today's brief" });
    expect(s.length).toBeLessThanOrEqual(4);
  });
});
