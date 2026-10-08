/// <reference types="node" />
// Reports, Home's weekly teaser and the Healthspan / Fitness / Heart rate screens' queries on the in-memory Store,
// over the same 180-day demo seed the pipeline test scores (the web's src/server/testing.ts: NOW = Friday 2026-10-02
// 14:00 IST). Ported from the web's more.test.ts (getReportArchive), home.test.ts (weeklyTeaser, the NaN walk over
// every report) and isolation.test.ts (an unknown period is null).
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { seedDemo } from "@/data/seed";
import type { Profile } from "@/data/types";
import { addDays } from "@/lib/time";
import { runPipeline } from "@/pipeline";
import type { QueryCtx } from "./ctx";
import { getFitness, getHealthspan, getHeartRate } from "./health";
import { getHome, latestReport } from "./home";
import { getReport, getReportArchive } from "./reports";

const TZ = "Asia/Kolkata";
const TODAY = "2026-10-02";
const ANCHOR = "2026-04-06";
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
const PROFILE: Profile = { birthDate: "1990-01-01", sex: "male", maxHr: 183, heightCm: 178, timeZone: TZ };
const dayAt = (i: number) => addDays(ANCHOR, i);
const REASONS = ["calibrating", "no_hrv_last_night", "awaiting_sleep_sync", "insufficient_hr_data", "band_not_worn", "no_data"];

/** Walks a view model (the web's home.test `inspect`): no NaN, ±Infinity or undefined value anywhere, and every null metric carries a known reason. */
function inspect(vm: unknown, path = "vm") {
  if (vm === undefined) throw new Error(`${path} is undefined`);
  if (typeof vm === "number") {
    expect(Number.isFinite(vm), `${path} is ${vm}`).toBe(true);
    return;
  }
  if (!vm || typeof vm !== "object") return;
  if (Array.isArray(vm)) return vm.forEach((x, i) => inspect(x, `${path}[${i}]`));
  const o = vm as Record<string, unknown>;
  if ("value" in o && "reason" in o && "provisional" in o) {
    if (o.value === null) expect(REASONS, `${path}.reason`).toContain(o.reason);
    else expect(o.reason, `${path}.reason`).toBeNull();
  }
  // Optional fields are left out, never present as undefined.
  for (const [k, v] of Object.entries(o)) if (v !== undefined || !["nightsLeft", "tags", "unit", "sd", "caption"].includes(k)) inspect(v, `${path}.${k}`);
}

let store: MemoryStore;
let ctx: QueryCtx;
beforeAll(async () => {
  store = new MemoryStore();
  await seedDemo(store, { today: TODAY, timeZone: TZ, now: NOW });
  await runPipeline(store, PROFILE, { today: TODAY });
  ctx = { store, profile: PROFILE, timeZone: TZ, today: TODAY, now: NOW, sync: await store.getSyncState() };
});

describe("getReportArchive", () => {
  it("lists every week and month with data, newest first, flagging partial ones", async () => {
    const vm = await getReportArchive(ctx);
    expect(vm.weeks.length).toBeGreaterThanOrEqual(25);
    expect(vm.months.length).toBeGreaterThanOrEqual(6);
    expect(vm.weeks.every((w) => /^\d{4}-W\d{2}$/.test(w.period))).toBe(true);
    expect(vm.months.every((m) => /^\d{4}-\d{2}$/.test(m.period))).toBe(true);
    expect([...vm.weeks].sort((a, b) => b.period.localeCompare(a.period))).toEqual(vm.weeks);
    expect([...vm.months].sort((a, b) => b.period.localeCompare(a.period))).toEqual(vm.months);
    // Friday: the current week and month are in progress; the weeks before are whole.
    expect(vm.weeks[0]).toMatchObject({ period: "2026-W40", start: "2026-09-28", end: "2026-10-04", partial: true });
    expect(vm.months[0]).toMatchObject({ period: "2026-10", partial: true });
    expect(vm.weeks.slice(1, -1).every((w) => !w.partial)).toBe(true);
    expect(vm.weeks[1].recovery).toBeGreaterThan(0);
    inspect(vm);
  });
});

describe("latestReport and Home's weekly teaser", () => {
  it("is the last complete week and month", async () => {
    expect(await latestReport(ctx, "week")).toEqual({ period: "2026-W39", start: "2026-09-21", end: "2026-09-27" });
    expect(await latestReport(ctx, "month")).toEqual({ period: "2026-09", start: "2026-09-01", end: "2026-09-30" });
    expect((await getHome(TODAY, ctx)).weeklyTeaser).toMatchObject({ period: "2026-W39", start: "2026-09-21", end: "2026-09-27" });
  });

  it("is null before any report exists", async () => {
    const empty = new MemoryStore();
    expect(await latestReport({ ...ctx, store: empty }, "week")).toBeNull();
  });
});

describe("getReport", () => {
  it("a whole week: dials, the breakdown, averages against the week before, neighbours and the latest periods", async () => {
    const vm = (await getReport("2026-W39", ctx))!;
    expect(vm).toMatchObject({ period: "2026-W39", kind: "week", start: "2026-09-21", end: "2026-09-27", partial: false, prev: "2026-W38", next: "2026-W40", latestWeek: "2026-W39", latestMonth: "2026-09" });
    expect(vm.dials.map((d) => d.key)).toEqual(["sleep", "recovery", "strain"]);
    for (const d of vm.dials) expect(d.metric.value).toBeTypeOf("number");
    expect(vm.bands.value!.reduce((a, b) => a + b.count, 0)).toBeGreaterThan(0);
    expect(vm.averages.map((s) => s.key)).toEqual(["recovery", "strain", "sleepPerf", "sleepHours", "consistency", "hrv", "rhr"]);
    const prev = (await store.getReports()).find((r) => r.period === "2026-W38")!.data;
    expect(vm.averages[0].average).toBe(prev.averages.recovery);
    expect(vm.insight).toMatch(/^A (strong|balanced|demanding) week: \d+ green days?/);
    expect(vm.bestWorst?.map((b) => b.label)).toEqual(["Best day", "Worst day"]);
    expect(vm.bestWorst![0].recovery).toBeGreaterThanOrEqual(vm.bestWorst![1].recovery);
    inspect(vm);
  });

  it("a month, and the first and the current period at the ends of the switcher", async () => {
    const month = (await getReport("2026-09", ctx))!;
    expect(month).toMatchObject({ kind: "month", start: "2026-09-01", end: "2026-09-30", partial: false, prev: "2026-08", next: "2026-10" });
    expect(month.insight).toMatch(/ month: /);
    const archive = await getReportArchive(ctx);
    expect((await getReport(archive.weeks.at(-1)!.period, ctx))!.prev).toBeNull();
    expect((await getReport("2026-W40", ctx))!).toMatchObject({ next: null, partial: true });
  });

  it("names journal behaviours by their labels", async () => {
    const archive = await getReportArchive(ctx);
    const impacts = (await Promise.all(archive.weeks.map((w) => getReport(w.period, ctx)))).flatMap((r) => r!.topImpacts);
    for (const i of impacts) {
      expect(i.label).not.toMatch(/_/);
      expect(Number.isFinite(i.delta)).toBe(true);
    }
    // A behaviour's own row in the Store names it.
    const tag = impacts[0].key;
    await store.insertJournalTags([{ tag, label: "Renamed", isDefault: true, hidden: false, position: 0 }]);
    const renamed = (await Promise.all(archive.weeks.map((w) => getReport(w.period, ctx)))).flatMap((r) => r!.topImpacts).filter((i) => i.key === tag);
    expect(renamed.length).toBeGreaterThan(0);
    expect(renamed.every((i) => i.label === "Renamed")).toBe(true);
  });

  it("never holds NaN or undefined, on every stored period", async () => {
    for (const r of await store.getReports()) inspect(await getReport(r.period, ctx), r.period);
  });

  it("is null for a period without a report", async () => {
    expect(await getReport("1999-W01", ctx)).toBeNull();
    expect(await getReport("2025-01", ctx)).toBeNull();
  });

  it("carries the Performance Assessment: sleep and activity against the period before, the biggest changes and 1–2 focus points", async () => {
    const vm = (await getReport("2026-W39", ctx))!;
    const p = vm.performance;
    expect(p.sleep.map((s) => s.key)).toEqual(["slept", "nightsMet", "consistency"]);
    expect(p.activity.map((s) => s.key)).toEqual(["zone13", "zone45", "strength", "steps"]);
    expect(p.sleep[0].metric.value).toBeGreaterThan(5 * 60);
    expect(p.sleep[0].caption).toMatch(/^Need \d+:\d\d a night$/);
    expect(p.sleep[1].unit).toBe("of 7");
    // The demo trains most days: moderate minutes a week and steps a day are well above zero, and compared with W38.
    expect(p.activity[0].metric.value).toBeGreaterThan(30);
    expect(p.activity[0].average).toBeTypeOf("number");
    expect(p.activity[3].metric.value).toBeGreaterThan(1000);
    expect(p.focus.length).toBeGreaterThanOrEqual(1);
    expect(p.focus.length).toBeLessThanOrEqual(2);
    for (const c of [...p.improved, ...p.declined]) expect(c.text).toMatch(/^[+−]/);
    expect(p.improved.every((c) => c.better) && p.declined.every((c) => !c.better)).toBe(true);
    // The plan's targets name the gaps.
    const strict = (await getReport("2026-W39", ctx, { zone13: 1500, zone45: 600, strength: 7, steps: 30_000, consistency: 100, sleepNeed: 7 }))!;
    expect(strict.performance.activity[0].caption).toMatch(/target 1500$/);
    expect(strict.performance.focus.length).toBe(2);
  });
});

describe("Healthspan, Fitness and Heart rate", () => {
  it("Healthspan: a scored week with nine inputs (lean mass % with lean and fat mass in its caption), a 26-week history and no NaN", async () => {
    for (const d of [TODAY, dayAt(170), dayAt(120), dayAt(30), dayAt(3)]) inspect(await getHealthspan(d, ctx), `healthspan@${d}`);
    const vm = await getHealthspan(TODAY, ctx);
    expect(vm).toMatchObject({ weekStart: "2026-09-28", weekEnd: "2026-10-04", asOf: "2026-09-27", nextUpdateInDays: 2 });
    expect(vm.result.value?.pulseAge).toBeTypeOf("number");
    expect(vm.contributors).toHaveLength(9);
    expect(vm.contributors.map((c) => c.group)).toEqual(["sleep", "sleep", "strain", "strain", "strain", "strain", "fitness", "fitness", "fitness"]);
    // The demo person has weight, body fat and height: lean mass is scored as a % against 80 % (20 % body fat for a man),
    // and the caption keeps lean and fat mass in kg and per m² of height.
    const lean = vm.contributors.find((c) => c.key === "leanMass")!;
    expect(lean.metric.value).toBeGreaterThan(60);
    expect(lean.metric.value).toBeLessThan(95);
    expect(lean.target).toBe(80);
    expect(lean.caption).toMatch(/% body fat · [\d.]+ kg lean, [\d.]+ kg fat · FFMI [\d.]+, FMI [\d.]+ kg\/m²\./);
    expect(vm.contributors.find((c) => c.key === "vo2max")!.caption).toBe("Measured");
    expect(vm.history.length).toBeLessThanOrEqual(26);
    expect(vm.history.at(-1)!.day <= TODAY).toBe(true);
    expect(vm.insight?.title).toMatch(/Aging slower|Aging faster|Steady and healthy/);
    // A week before the data starts: no result, said why.
    const before = await getHealthspan(addDays(ANCHOR, -7), ctx);
    inspect(before, "healthspan@before");
    expect(before.result).toMatchObject({ value: null, reason: "no_data" });
    expect(before.history.every((p) => p.value === null)).toBe(true);
  });

  it("Fitness: VO2 max, training load and 90 days of fitness, fatigue and form", async () => {
    const vm = await getFitness(ctx);
    inspect(vm, "fitness");
    expect(vm.vo2.value?.value).toBeTypeOf("number");
    expect(vm.vo2.value?.ageBand).toBe("30-39");
    // The seed has Fitbit's VO2 max, so the hero keeps it; Fitness Age (from resting HR and activity) shows beside it.
    expect(vm.vo2.value?.source).not.toBe("estimate");
    expect(vm.fitnessAge.value).toMatchObject({ method: "uth" });
    expect(vm.fitnessAge.value!.fitnessAge).toBeGreaterThanOrEqual(20);
    expect(vm.fitnessAge.value!.fitnessAge).toBeLessThanOrEqual(80);
    expect(vm.trainingLoad.value?.acwr).toBeTypeOf("number");
    expect(vm.load).toHaveLength(90);
    expect(vm.load.at(-1)!.day).toBe(TODAY);
    expect(vm.loadReason).toBeNull();
    expect(vm.trend.points.some((p) => p.value !== null)).toBe(true);
  });

  it("Heart rate: today's minutes up to now with the latest reading; a past day's whole day", async () => {
    const today = await getHeartRate(TODAY, ctx);
    inspect(today, "hr@today");
    expect(today.isToday).toBe(true);
    expect(today.latest?.bpm).toBeTypeOf("number");
    expect(today.latest!.t).toBeLessThanOrEqual(NOW * 1000);
    expect(today.points.length).toBeGreaterThan(0);
    expect(today.points.at(-1)!.t).toBeLessThanOrEqual(NOW * 1000);
    expect(today.zoneBands).toHaveLength(5);
    const past = await getHeartRate(dayAt(170), ctx);
    inspect(past, "hr@past");
    expect(past.isToday).toBe(false);
    expect(past.points).toHaveLength(24 * 60);
    expect(past.points.filter((p) => p.v !== null).length).toBeGreaterThan(600);
    expect(past.restingHr).toBeTypeOf("number");
    expect(past.zones.value?.length).toBeGreaterThan(0);
  });
});
