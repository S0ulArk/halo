// Cloudflare's REST API, as the Claude connector setup uses it: with the person's own API token (made from the
// pre-filled link below, Workers Scripts and Workers KV Storage, Edit), straight from the phone. It finds the account,
// gives it a workers.dev subdomain if it has none, makes a KV namespace for the data, uploads the connector Worker
// (src/mcp/worker/worker.js) with its secrets, and turns on its workers.dev address. Removing deletes the Worker and
// the namespace. No Cloudflare SDK: plain fetch, injectable for tests.
import { WORKER_SOURCE } from "./workerSource";

const API = "https://api.cloudflare.com/client/v4";
export const SCRIPT_NAME = "halo-connector";
export const KV_TITLE = "halo-connector-data";
/** Any date the runtime knows; it only fixes runtime behaviour for this Worker. */
const COMPATIBILITY_DATE = "2026-09-01";

type Fetch = typeof globalThis.fetch;

/** The dashboard's create-token form, pre-filled with the two permissions the setup needs (and nothing else). */
export const TOKEN_URL = `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(
  JSON.stringify([
    { key: "workers_scripts", type: "edit" },
    { key: "workers_kv_storage", type: "edit" },
    { key: "account_settings", type: "read" },
  ]),
)}&accountId=*&zoneId=all&name=${encodeURIComponent("Halo connector")}`;

export class CloudflareError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codes: number[],
  ) {
    super(message);
    this.name = "CloudflareError";
  }
}

type Envelope<T> = { success: boolean; errors?: { code: number; message: string }[]; result: T };

async function cf<T>(token: string, method: string, path: string, opts: { json?: unknown; body?: string; contentType?: string; fetch?: Fetch } = {}): Promise<T> {
  const f = opts.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = opts.contentType ?? "application/octet-stream";
    body = opts.body;
  }
  const res = await f(`${API}${path}`, { method, headers, body });
  let env: Envelope<T> | null = null;
  try {
    env = (await res.json()) as Envelope<T>;
  } catch {
    env = null;
  }
  if (!res.ok || !env?.success) {
    const errors = env?.errors ?? [];
    throw new CloudflareError(errors.map((e) => e.message).join("; ") || `Cloudflare answered ${res.status}`, res.status, errors.map((e) => e.code));
  }
  return env.result;
}

/** Words for the settings screen: what went wrong and what to do, with Cloudflare's own message. */
export function cloudflareProblem(e: unknown): string {
  if (e instanceof CloudflareError) {
    if (e.status === 401 || e.status === 403 || e.codes.includes(10000) || e.codes.includes(9109))
      return `Cloudflare didn’t accept this token for that step. Make the token again with the link (it needs Workers Scripts and Workers KV Storage, Edit). Cloudflare said: “${e.message}”`;
    return `Cloudflare said: “${e.message}”`;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /network|fetch|timeout|abort/i.test(msg) ? "Couldn’t reach Cloudflare. Check your connection and try again." : `Something went wrong: ${msg}`;
}

export type Account = { id: string; name: string };

/** The accounts this token can reach; the setup uses the first. */
export const listAccounts = (token: string, fetch?: Fetch) => cf<Account[]>(token, "GET", "/accounts?per_page=50", { fetch });

const randomName = () => `halo-${Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("")}`;

/** The account's workers.dev subdomain, claiming a random "halo-xxxxxxxx" one when it has none yet. */
export async function ensureSubdomain(token: string, accountId: string, fetch?: Fetch): Promise<string> {
  try {
    const r = await cf<{ subdomain?: string }>(token, "GET", `/accounts/${accountId}/workers/subdomain`, { fetch });
    if (r?.subdomain) return r.subdomain;
  } catch (e) {
    // No subdomain yet answers with an error; a refused token must still stop here.
    if (e instanceof CloudflareError && (e.status === 401 || e.status === 403)) throw e;
  }
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await cf<{ subdomain: string }>(token, "PUT", `/accounts/${accountId}/workers/subdomain`, { json: { subdomain: randomName() }, fetch });
      return r.subdomain;
    } catch (e) {
      last = e; // most likely the random name was taken: try another
    }
  }
  throw last;
}

/** The connector's KV namespace: found by its title, or made. */
export async function ensureNamespace(token: string, accountId: string, fetch?: Fetch): Promise<string> {
  const list = await cf<{ id: string; title: string }[]>(token, "GET", `/accounts/${accountId}/storage/kv/namespaces?per_page=100`, { fetch });
  const found = list.find((n) => n.title === KV_TITLE);
  if (found) return found.id;
  return (await cf<{ id: string }>(token, "POST", `/accounts/${accountId}/storage/kv/namespaces`, { json: { title: KV_TITLE }, fetch })).id;
}

/** The multipart body Cloudflare's script upload takes: the metadata part, then the module. */
export function workerUploadBody(metadata: object, source: string, boundary: string): string {
  return [
    `--${boundary}`,
    'Content-Disposition: form-data; name="metadata"; filename="metadata.json"',
    "Content-Type: application/json",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
    "Content-Type: application/javascript+module",
    "",
    source,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export type Secrets = { ingestKey: string; mcpSecret: string };

/** Uploads (or replaces) the connector Worker with its KV binding and secrets. */
export async function uploadWorker(token: string, accountId: string, namespaceId: string, secrets: Secrets, fetch?: Fetch): Promise<void> {
  const boundary = `----halo${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const metadata = {
    main_module: "worker.js",
    compatibility_date: COMPATIBILITY_DATE,
    bindings: [
      { type: "kv_namespace", name: "DATA", namespace_id: namespaceId },
      { type: "secret_text", name: "INGEST_KEY", text: secrets.ingestKey },
      { type: "secret_text", name: "MCP_SECRET", text: secrets.mcpSecret },
    ],
  };
  await cf(token, "PUT", `/accounts/${accountId}/workers/scripts/${SCRIPT_NAME}`, {
    body: workerUploadBody(metadata, WORKER_SOURCE, boundary),
    contentType: `multipart/form-data; boundary=${boundary}`,
    fetch,
  });
}

/** Makes the Worker reachable at https://halo-connector.<subdomain>.workers.dev. */
export const enableWorkersDev = (token: string, accountId: string, fetch?: Fetch) =>
  cf(token, "POST", `/accounts/${accountId}/workers/scripts/${SCRIPT_NAME}/subdomain`, { json: { enabled: true, previews_enabled: false }, fetch });

export const workerUrl = (subdomain: string) => `https://${SCRIPT_NAME}.${subdomain}.workers.dev`;

/** Deletes the Worker and its namespace; either already gone is fine. */
export async function removeWorker(token: string, accountId: string, namespaceId: string | null, fetch?: Fetch): Promise<void> {
  const gone = (e: unknown) => e instanceof CloudflareError && e.status === 404;
  await cf(token, "DELETE", `/accounts/${accountId}/workers/scripts/${SCRIPT_NAME}?force=true`, { fetch }).catch((e) => {
    if (!gone(e)) throw e;
  });
  if (namespaceId)
    await cf(token, "DELETE", `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`, { fetch }).catch((e) => {
      if (!gone(e)) throw e;
    });
}
