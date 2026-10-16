// End to end without a phone: the 180-day demo seed through the pipeline, the snapshot built from it, sent to the
// connector Worker, and read back through its MCP tools as Claude would.
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { DEMO_PROFILE, seedDemo } from "@/data/seed";
import { runPipeline } from "@/pipeline";
import type { QueryCtx } from "@/queries/ctx";
import { buildSnapshot, type Snapshot } from "./snapshot";
import worker from "./worker/worker.js";

const TZ = "Asia/Kolkata";
const TODAY = "2026-10-02";
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;

let snap: Snapshot;

beforeAll(async () => {
  const store = new MemoryStore();
  await seedDemo(store, { today: TODAY, timeZone: TZ, now: NOW });
  const profile = { ...DEMO_PROFILE, timeZone: TZ };
  await runPipeline(store, profile, { today: TODAY });
  const ctx: QueryCtx = { store, profile, timeZone: TZ, today: TODAY, now: NOW, sync: await store.getSyncState() };
  snap = await buildSnapshot(ctx);
}, 120_000);

describe("buildSnapshot", () => {
  it("holds every part, with 14 days of detail", () => {
    expect(snap.schema).toBe(1);
    expect(snap.today).toBe(TODAY);
    expect(snap.days.length).toBeGreaterThan(150);
    expect(snap.days.at(-1)?.day).toBe(TODAY);
    expect(Object.keys(snap.dayDetail)).toHaveLength(14);
    expect(Object.keys(snap.sleepDetail)).toHaveLength(14);
    expect(snap.metrics.map((m) => m.column)).toEqual(expect.arrayContaining(["recovery_pct", "hrv_ms", "strain", "sleep_minutes"]));
    expect(snap.profile).toMatchObject({ timeZone: TZ });
    expect((snap.activities as { workouts: unknown[] }).workouts.length).toBeGreaterThan(10);
    expect(snap.health).not.toBeNull();
    expect(snap.reports.week).not.toBeNull();
  });

  it("stays well under the Worker's size limit", () => {
    expect(JSON.stringify(snap).length).toBeLessThan(2_000_000);
  });

  it("reads back through the connector's tools", async () => {
    const kv = new Map<string, string>();
    const env = { DATA: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) }, INGEST_KEY: "k", MCP_SECRET: "s" };
    const up = await worker.fetch(new Request("https://x.workers.dev/ingest", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(snap) }), env);
    expect(up.status).toBe(200);
    const tool = async (name: string, args: object = {}) => {
      const r = await worker.fetch(new Request("https://x.workers.dev/mcp/s", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env);
      return (await r.json()).result.structuredContent;
    };
    const day = await tool("get_day");
    expect(day.day).toBe(TODAY);
    expect(typeof day.recovery.value === "number" || day.recovery.reason).toBeTruthy();
    const metrics = await tool("get_daily_metrics", { metrics: ["recovery_pct", "hrv_ms"] });
    expect(metrics.rows).toHaveLength(30);
    expect(metrics.summary.hrv_ms.average).toBeGreaterThan(0);
    expect((await tool("get_sleep")).performance).toBeDefined();
    expect((await tool("get_activities", { start: "2026-09-01" })).workouts.length).toBeGreaterThan(0);
  });
});
