// The Claude connector Worker, run in Node: its routes and secrets called directly, then a real MCP client (the AI
// SDK's) talking to it over HTTP, once with 2026-07-28's server/discover and once with the initialize handshake.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import worker from "./worker.js";

type Env = { DATA: { get: (k: string) => Promise<string | null>; put: (k: string, v: string) => Promise<void> }; INGEST_KEY: string; MCP_SECRET: string };

function env(): Env {
  const kv = new Map<string, string>();
  return { DATA: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) }, INGEST_KEY: "ingest-key-123", MCP_SECRET: "s3cret" };
}

const BASE = "https://halo-connector.example.workers.dev";
const call = (e: Env, path: string, init?: RequestInit) => worker.fetch(new Request(`${BASE}${path}`, init), e) as Promise<Response>;
const rpc = (e: Env, body: unknown) => call(e, "/mcp/s3cret", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });

const SNAPSHOT = {
  schema: 1,
  generatedAt: "2026-10-17T09:00:00.000Z",
  app: "Halo 1.24.0",
  timeZone: "Asia/Kolkata",
  today: "2026-10-17",
  units: "metric",
  profile: { age: 32, sex: "male", maxHr: 188 },
  metrics: [
    { column: "recovery_pct", label: "Recovery", unit: "%" },
    { column: "hrv_ms", label: "Heart rate variability", unit: "ms" },
  ],
  days: [
    { day: "2026-10-15", recovery_pct: 60, hrv_ms: 50 },
    { day: "2026-10-16", recovery_pct: 70, hrv_ms: 55 },
    { day: "2026-10-17", recovery_pct: 80, hrv_ms: null },
  ],
  dayDetail: { "2026-10-17": { day: "2026-10-17", recovery: { value: 80, unit: "%" } } },
  sleepDetail: {},
  activities: { workouts: [{ day: "2026-10-16", name: "Run", minutes: 40 }], detected: [] },
  health: { vitals: [] },
  journal: { behaviours: [], entries: [{ day: "2026-10-16", behaviour: "alcohol", answer: 1 }] },
  journalImpacts: null,
  reports: { week: { period: "2026-W41" } },
};

describe("routes", () => {
  it("stores Halo's upload only with the ingest key", async () => {
    const e = env();
    expect((await call(e, "/ingest", { method: "POST", body: JSON.stringify(SNAPSHOT) })).status).toBe(401);
    expect((await call(e, "/ingest", { method: "POST", headers: { authorization: "Bearer wrong" }, body: JSON.stringify(SNAPSHOT) })).status).toBe(401);
    const r = await call(e, "/ingest", { method: "POST", headers: { authorization: "Bearer ingest-key-123" }, body: JSON.stringify(SNAPSHOT) });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, generatedAt: SNAPSHOT.generatedAt });
    const st = await call(e, "/status", { headers: { authorization: "Bearer ingest-key-123" } });
    expect(await st.json()).toMatchObject({ ok: true, hasData: true, generatedAt: SNAPSHOT.generatedAt });
    expect((await call(e, "/ingest", { method: "POST", headers: { authorization: "Bearer ingest-key-123" }, body: '{"schema":9}' })).status).toBe(400);
  });

  it("answers MCP only at the secret path", async () => {
    const e = env();
    expect((await call(e, "/mcp/guess", { method: "POST", body: "{}" })).status).toBe(404);
    expect((await call(e, "/mcp/s3cret")).status).toBe(405);
    expect((await call(e, "/.well-known/oauth-protected-resource")).status).toBe(404);
    expect((await call(e, "/")).status).toBe(200);
  });

  it("speaks JSON-RPC: discover, initialize, notifications, batches, errors", async () => {
    const e = env();
    const d = await (await rpc(e, { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } })).json();
    expect(d.result).toMatchObject({ resultType: "complete", supportedVersions: expect.arrayContaining(["2026-07-28", "2025-11-25"]), capabilities: { tools: {} } });
    expect(d.result._meta["io.modelcontextprotocol/serverInfo"].name).toBe("halo");
    const init = await (await rpc(e, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } })).json();
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect((await rpc(e, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    const bad = await (await rpc(e, { jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "1999-01-01" } } })).json();
    expect(bad.error.code).toBe(-32022);
    const batch = await (await rpc(e, [{ jsonrpc: "2.0", id: 4, method: "tools/list" }, { jsonrpc: "2.0", id: 5, method: "nope" }])).json();
    expect(batch[0].result.tools.map((t: { name: string }) => t.name)).toContain("get_daily_metrics");
    expect(batch[1].error.code).toBe(-32601);
  });

  it("serves tools from the stored snapshot, clamping ranges", async () => {
    const e = env();
    const empty = await (await rpc(e, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_profile", arguments: {} } })).json();
    expect(empty.result.isError).toBe(true);
    await call(e, "/ingest", { method: "POST", headers: { authorization: "Bearer ingest-key-123" }, body: JSON.stringify(SNAPSHOT) });
    const tool = async (name: string, args: object) => (await (await rpc(e, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } })).json()).result.structuredContent;
    expect(await tool("get_profile", {})).toMatchObject({ firstDay: "2026-10-15", lastDay: "2026-10-17", dataAsOf: SNAPSHOT.generatedAt });
    const m = await tool("get_daily_metrics", { start: "2026-10-16", metrics: ["hrv_ms", "steps"] });
    expect(m.rows).toEqual([
      { day: "2026-10-16", hrv_ms: 55 },
      { day: "2026-10-17", hrv_ms: null },
    ]);
    expect(m.summary.hrv_ms).toEqual({ average: 55, min: 55, max: 55, days: 1 });
    expect(m.unknownMetrics).toEqual(["steps"]);
    expect(await tool("get_day", {})).toMatchObject({ day: "2026-10-17", recovery: { value: 80 } });
    expect(await tool("get_day", { day: "2026-10-15" })).toMatchObject({ detail: null, reason: "only_daily_metrics", dailyMetrics: { recovery_pct: 60 } });
    expect((await tool("get_activities", {})).workouts).toHaveLength(1);
    expect((await tool("get_journal", { start: "2026-10-17" })).entries).toHaveLength(0);
    expect(await tool("get_report", {})).toMatchObject({ kind: "week", period: "2026-W41" });
  });
});

describe("with a real MCP client over HTTP", () => {
  let server: Server;
  let url = "";
  const e = env();

  beforeAll(async () => {
    await call(e, "/ingest", { method: "POST", headers: { authorization: "Bearer ingest-key-123" }, body: JSON.stringify(SNAPSHOT) });
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks);
      const r: Response = await worker.fetch(new Request(`http://localhost${req.url}`, { method: req.method, headers, body }), e);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp/s3cret`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  for (const discovery of [true, false]) {
    it(`lists and calls tools (${discovery ? "2026-07-28 server/discover" : "initialize handshake"})`, async () => {
      const client = await createMCPClient({ transport: { type: "http", url }, protocolVersionDiscovery: discovery });
      try {
        const tools = await client.tools();
        expect(Object.keys(tools).sort()).toEqual(["get_activities", "get_daily_metrics", "get_day", "get_health", "get_journal", "get_profile", "get_report", "get_sleep"]);
        const out = await tools.get_profile.execute!({}, { toolCallId: "1", messages: [] } as never);
        expect(JSON.stringify(out)).toContain("2026-10-15");
      } finally {
        await client.close();
      }
    });
  }
});
