// Halo's Claude connector: a Cloudflare Worker that each person deploys to their own Cloudflare account from Halo
// (src/mcp/cloudflare.ts uploads this file). Halo sends it a snapshot of the person's scores after each sync, and
// Claude reads that snapshot through the Model Context Protocol over Streamable HTTP with plain JSON responses: the
// stateless 2026-07-28 revision (server/discover, per-request _meta) and the earlier initialize handshake alike.
//
// Routes:
//   POST /ingest          Halo's upload, with `Authorization: Bearer <INGEST_KEY>`; stored in Workers KV.
//   GET  /status          The same key; when the stored snapshot was made, for Halo's settings screen.
//   POST /mcp/<MCP_SECRET> The MCP endpoint Claude is given. The unguessable path is the connector's credential:
//                         Claude's custom connectors accept servers without OAuth, and nothing else answers there.
//   GET  /                A one-line notice; no data.
//
// Bindings (set by Halo at upload): DATA (KV namespace), INGEST_KEY and MCP_SECRET (secrets).
// Keep this file plain ES2022 with no imports: it is uploaded as-is, and its text is embedded in the app by
// scripts/build-mcp-worker.mjs (src/mcp/workerSource.ts).

const SERVER_INFO = { name: "halo", title: "Halo", version: "1.0.0" };
const PROTOCOL_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
/** The newest revision with the initialize handshake, answered to a client asking for one this server doesn't know. */
const LEGACY_VERSION = "2025-11-25";
const MAX_INGEST_BYTES = 8 * 1024 * 1024;
const SNAPSHOT_KEY = "snapshot";

const INSTRUCTIONS = [
  "Halo is a personal health app that reads a Fitbit through Android Health Connect and scores Recovery (0-100%), Strain (0-21), Sleep Performance (0-100%), Halo Age and more, in the style of WHOOP and Garmin.",
  "These tools read the person's own Halo data, as of the moment Halo last sent it (each answer has dataAsOf).",
  "Start with get_profile to learn the date range and which daily metrics exist, then use get_day, get_sleep, get_daily_metrics and the others.",
  "Values are metric unless a field says otherwise (kg, km, degrees Celsius, minutes); get_profile's preferredUnits says which units the person uses in Halo, so answer in those. A null value comes with a reason such as no_data or calibrating: say so rather than guess.",
  "This is personal insight, not medical advice.",
].join(" ");

const DAY = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "A local date, YYYY-MM-DD." };
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

const TOOLS = [
  {
    name: "get_profile",
    title: "Profile and data range",
    description: "The person's age, sex, max heart rate and time zone; the first and last day with data; when Halo last sent data; the units the data uses and the units the person prefers; and the list of daily metric columns get_daily_metrics can return.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_day",
    title: "One day in detail",
    description: "One day's Recovery (with its contributors against baseline), Sleep Performance, Strain with today's target, Energy Bank, stress and training guidance. Detail covers the last 14 days; older days return that day's row of daily metrics. Defaults to the latest day.",
    inputSchema: { type: "object", properties: { day: DAY } },
  },
  {
    name: "get_sleep",
    title: "One night's sleep",
    description: "One night's sleep: performance, hours against need, consistency, efficiency, stages, bed and wake times, and the sleep planner. Detail covers the last 14 nights. Defaults to last night.",
    inputSchema: { type: "object", properties: { day: { ...DAY, description: "The day the night ended, YYYY-MM-DD." } } },
  },
  {
    name: "get_daily_metrics",
    title: "Daily metrics over a range",
    description: "One row per day with the chosen daily metrics (Recovery, HRV, resting heart rate, Strain, sleep, steps, weight and more), plus each metric's average, minimum and maximum over the range. Defaults to the last 30 days; up to 400 days. Get the column names from get_profile.",
    inputSchema: {
      type: "object",
      properties: {
        start: { ...DAY, description: "First day, YYYY-MM-DD." },
        end: { ...DAY, description: "Last day, YYYY-MM-DD." },
        metrics: { type: "array", items: { type: "string" }, description: "Column names, e.g. recovery_pct, hrv_ms, strain. Omit for all." },
      },
    },
  },
  {
    name: "get_activities",
    title: "Workouts",
    description: "Recorded workouts (name, day, minutes, Strain, distance, heart rate) and, where Halo detected raised heart rate without a recorded workout, those stretches. Defaults to the last 30 days; Halo sends up to 180.",
    inputSchema: { type: "object", properties: { start: DAY, end: DAY } },
  },
  {
    name: "get_health",
    title: "Health status",
    description: "Latest Health Monitor vitals against the person's normal range, the illness signal, Halo Age against actual age, VO2 max with its category, and training load.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_journal",
    title: "Journal and its effects",
    description: "Daily journal answers (behaviours such as alcohol, late meals, caffeine) in a date range, and how each behaviour has tended to change next-day Recovery, HRV and sleep. Defaults to the last 30 days.",
    inputSchema: { type: "object", properties: { start: DAY, end: DAY } },
  },
  {
    name: "get_report",
    title: "Weekly or monthly report",
    description: "The latest weekly or monthly report: score averages with change against the previous period, best and worst days, training balance and a summary.",
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["week", "month"], description: "Defaults to week." } } },
  },
].map((t) => ({ ...t, annotations: { title: t.title, ...READ_ONLY } }));

// ── helpers ──────────────────────────────────────────────────────────────────

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

/** Constant-time comparison, so a wrong key takes as long as a right one. */
function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b) return false;
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const bearer = (request) => (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The requested range, clamped to the data and to `maxDays`; `defaultDays` back from the last day when omitted. */
function range(args, snap, defaultDays, maxDays) {
  const last = snap.today ?? snap.days?.at(-1)?.day;
  let end = isDay(args?.end) ? args.end : last;
  if (last && end > last) end = last;
  let start = isDay(args?.start) ? args.start : addDays(end, -(defaultDays - 1));
  if (start > end) start = end;
  if (start < addDays(end, -(maxDays - 1))) start = addDays(end, -(maxDays - 1));
  return { start, end };
}

function stats(rows, column) {
  const values = rows.map((r) => r[column]).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!values.length) return { average: null, min: null, max: null, days: 0 };
  const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  return { average, min: Math.min(...values), max: Math.max(...values), days: values.length };
}

// ── tools ────────────────────────────────────────────────────────────────────

function runTool(name, args, snap) {
  const asOf = { dataAsOf: snap.generatedAt, timeZone: snap.timeZone };
  const dayRow = (day) => snap.days?.find((d) => d.day === day) ?? null;
  const latest = snap.today ?? snap.days?.at(-1)?.day ?? null;
  switch (name) {
    case "get_profile":
      return {
        ...asOf,
        app: snap.app,
        profile: snap.profile,
        firstDay: snap.days?.[0]?.day ?? null,
        lastDay: snap.days?.at(-1)?.day ?? null,
        today: snap.today,
        units: snap.units ?? "metric",
        preferredUnits: snap.preferredUnits ?? null,
        detailDays: Object.keys(snap.dayDetail ?? {}).sort(),
        metrics: snap.metrics ?? [],
      };
    case "get_day": {
      const day = isDay(args?.day) ? args.day : latest;
      const detail = snap.dayDetail?.[day];
      return detail ? { ...asOf, ...detail } : { ...asOf, day, detail: null, reason: dayRow(day) ? "only_daily_metrics" : "no_data", dailyMetrics: dayRow(day) };
    }
    case "get_sleep": {
      const day = isDay(args?.day) ? args.day : latest;
      const detail = snap.sleepDetail?.[day];
      return detail ? { ...asOf, ...detail } : { ...asOf, day, detail: null, reason: dayRow(day) ? "only_daily_metrics" : "no_data", dailyMetrics: dayRow(day) };
    }
    case "get_daily_metrics": {
      const { start, end } = range(args, snap, 30, 400);
      const wanted = Array.isArray(args?.metrics) && args.metrics.length ? args.metrics.filter((m) => typeof m === "string") : null;
      const known = new Set((snap.metrics ?? []).map((m) => m.column));
      const columns = wanted ? wanted.filter((c) => known.has(c)) : [...known];
      const rows = (snap.days ?? []).filter((d) => d.day >= start && d.day <= end).map((d) => Object.fromEntries([["day", d.day], ...columns.map((c) => [c, d[c] ?? null])]));
      return {
        ...asOf,
        start,
        end,
        ...(wanted && wanted.length !== columns.length && { unknownMetrics: wanted.filter((c) => !known.has(c)) }),
        summary: Object.fromEntries(columns.map((c) => [c, stats(rows, c)])),
        rows,
      };
    }
    case "get_activities": {
      const { start, end } = range(args, snap, 30, 180);
      const inRange = (x) => x.day >= start && x.day <= end;
      return { ...asOf, start, end, workouts: (snap.activities?.workouts ?? []).filter(inRange), detected: (snap.activities?.detected ?? []).filter(inRange), recoveryCost: snap.activities?.recoveryCost ?? null };
    }
    case "get_health":
      return { ...asOf, ...(snap.health ?? { reason: "no_data" }) };
    case "get_journal": {
      const { start, end } = range(args, snap, 30, 365);
      return { ...asOf, start, end, behaviours: snap.journal?.behaviours ?? [], entries: (snap.journal?.entries ?? []).filter((e) => e.day >= start && e.day <= end), effects: snap.journalImpacts ?? null };
    }
    case "get_report": {
      const kind = args?.kind === "month" ? "month" : "week";
      return { ...asOf, kind, ...(snap.reports?.[kind] ?? { report: null, reason: "no_data" }) };
    }
    default:
      return undefined;
  }
}

// ── MCP (JSON-RPC 2.0) ───────────────────────────────────────────────────────

const rpcError = (id, code, message, data) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined && { data }) } });

/** A complete result, identified as 2026-07-28 asks (earlier clients ignore both extra fields). */
const ok = (id, result) => ({ jsonrpc: "2.0", id, result: { resultType: "complete", ...result, _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } } });

const CAPABILITIES = { tools: { listChanged: false } };

async function handleRpc(msg, env) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid request");
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;
  const { id, method, params } = msg;
  // 2026-07-28: every request names its protocol version; refuse only one this server can't speak.
  const version = params?._meta?.["io.modelcontextprotocol/protocolVersion"];
  if (typeof version === "string" && !PROTOCOL_VERSIONS.includes(version)) {
    return rpcError(id, -32022, `Unsupported protocol version: ${version}`, { supported: PROTOCOL_VERSIONS, requested: version });
  }
  switch (method) {
    case "server/discover":
      return ok(id, { supportedVersions: PROTOCOL_VERSIONS, capabilities: CAPABILITIES, instructions: INSTRUCTIONS });
    case "initialize": {
      const asked = params?.protocolVersion;
      const protocolVersion = PROTOCOL_VERSIONS.includes(asked) && asked !== "2026-07-28" ? asked : LEGACY_VERSION;
      return ok(id, { protocolVersion, capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS, ttlMs: 60 * 60 * 1000, cacheScope: "private" });
    case "resources/list":
      return ok(id, { resources: [], ttlMs: 60 * 60 * 1000, cacheScope: "private" });
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [], ttlMs: 60 * 60 * 1000, cacheScope: "private" });
    case "prompts/list":
      return ok(id, { prompts: [], ttlMs: 60 * 60 * 1000, cacheScope: "private" });
    case "tools/call": {
      const name = params?.name;
      if (!TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`);
      const raw = await env.DATA.get(SNAPSHOT_KEY);
      if (!raw) {
        return ok(id, { isError: true, content: [{ type: "text", text: "Halo hasn't sent any data yet. Open Halo on the phone, go to Settings › Connect to Claude, and tap Send now." }] });
      }
      let snap;
      try {
        snap = JSON.parse(raw);
      } catch {
        return ok(id, { isError: true, content: [{ type: "text", text: "The stored Halo data is unreadable. Send it again from Halo." }] });
      }
      const out = runTool(name, params?.arguments ?? {}, snap);
      return ok(id, { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out });
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

async function handleMcp(request, env) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map((m) => handleRpc(m, env)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return json(batch ? replies : replies[0]);
}

// ── entry ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (env.MCP_SECRET && path === `/mcp/${env.MCP_SECRET}`) return handleMcp(request, env);

    if (path === "/ingest") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
      if (!sameSecret(bearer(request), env.INGEST_KEY)) return json({ ok: false, error: "unauthorized" }, 401);
      const text = await request.text();
      if (text.length > MAX_INGEST_BYTES) return json({ ok: false, error: "too_large" }, 413);
      let snap;
      try {
        snap = JSON.parse(text);
      } catch {
        return json({ ok: false, error: "not_json" }, 400);
      }
      if (snap?.schema !== 1) return json({ ok: false, error: "unknown_schema" }, 400);
      await env.DATA.put(SNAPSHOT_KEY, text);
      return json({ ok: true, bytes: text.length, generatedAt: snap.generatedAt ?? null });
    }

    if (path === "/status") {
      if (!sameSecret(bearer(request), env.INGEST_KEY)) return json({ ok: false, error: "unauthorized" }, 401);
      const raw = await env.DATA.get(SNAPSHOT_KEY);
      let generatedAt = null;
      try {
        generatedAt = raw ? JSON.parse(raw).generatedAt ?? null : null;
      } catch {
        generatedAt = null;
      }
      return json({ ok: true, version: SERVER_INFO.version, hasData: !!raw, generatedAt });
    }

    if (path === "/") return new Response("Halo connector. Add this Worker's MCP link in Claude to read your Halo data.\n", { headers: { "content-type": "text/plain" } });
    return new Response("Not found", { status: 404 });
  },
};
