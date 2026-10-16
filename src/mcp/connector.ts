// The Claude connector, Halo's side: set up once with the person's Cloudflare token (cloudflare.ts deploys their own
// Worker), then a snapshot (snapshot.ts) sent after syncs (runSync, in the app and the background task) at most every
// 15 minutes and only when it changed, or at once with "Send now". Removing deletes the Worker and forgets everything.
//
// Kept on the phone: the address and status in AsyncStorage; the Cloudflare token, the upload key and the MCP path
// secret in the Android Keystore-backed secure store. The token stays so a newer Halo can update the Worker and
// "Remove" can delete it. No React in here, so the background task can import it.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import type { Store } from "@/data/store";
import type { Profile } from "@/data/types";
import { localDay } from "@/lib/time";
import type { QueryCtx } from "@/queries/ctx";
import { cloudflareProblem, enableWorkersDev, ensureNamespace, ensureSubdomain, listAccounts, removeWorker, uploadWorker, workerUrl } from "./cloudflare";
import { readUnits } from "@/state/units";
import { buildSnapshot } from "./snapshot";
import { WORKER_VERSION } from "./workerSource";

const STATE_KEY = "pulse.connector";
const TOKEN_KEY = "pulse.connector.token";
const INGEST_KEY = "pulse.connector.ingest";
const MCP_KEY = "pulse.connector.mcp";
const EVERY_MS = 15 * 60 * 1000;
/** Even unchanged data is sent again after this, so the connector's dataAsOf stays honest. */
const REFRESH_MS = 6 * 60 * 60 * 1000;

export type ConnectorState = {
  accountId: string;
  accountName: string;
  subdomain: string;
  namespaceId: string;
  /** https://halo-connector.<subdomain>.workers.dev */
  url: string;
  workerVersion: string;
  setUpAt: number;
  lastSentAt: number | null;
  lastHash: string | null;
  lastBytes: number | null;
  lastError: string | null;
};

const listeners = new Set<() => void>();
export function subscribeConnector(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function connectorState(): Promise<ConnectorState | null> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as ConnectorState) : null;
  } catch {
    return null;
  }
}

async function saveState(next: ConnectorState | null): Promise<void> {
  if (next) await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next));
  else await AsyncStorage.removeItem(STATE_KEY);
  listeners.forEach((l) => l());
}

async function patchState(patch: Partial<ConnectorState>): Promise<ConnectorState | null> {
  const s = await connectorState();
  if (!s) return null;
  const next = { ...s, ...patch };
  await saveState(next);
  return next;
}

const secure = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const getSecret = (k: string) => SecureStore.getItemAsync(k, secure).catch(() => null);

/** 32 random bytes as hex. */
const randomHex = (bytes = 32) => Array.from(Crypto.getRandomBytes(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

/** The link to paste into Claude: the Worker's MCP path, with its secret. */
export async function connectorLink(): Promise<string | null> {
  const [s, mcp] = await Promise.all([connectorState(), getSecret(MCP_KEY)]);
  return s && mcp ? `${s.url}/mcp/${mcp}` : null;
}

export type SetupStep = "account" | "address" | "storage" | "upload" | "enable" | "send";

/**
 * Deploys the connector with `token` and sends the first snapshot. Resolves with the Claude link; throws an Error whose
 * message is ready to show. Running it again (a new token, a failed run) reuses the same Worker, storage and secrets.
 */
export async function setUpConnector(token: string, ctx: QueryCtx, onStep?: (s: SetupStep) => void): Promise<string> {
  const t = token.trim();
  try {
    onStep?.("account");
    const accounts = await listAccounts(t);
    if (!accounts.length) throw new Error("This token can’t reach any Cloudflare account. Make it again with the link, keeping “All accounts”.");
    const account = accounts[0];
    onStep?.("address");
    const subdomain = await ensureSubdomain(t, account.id);
    onStep?.("storage");
    const namespaceId = await ensureNamespace(t, account.id);
    const ingestKey = (await getSecret(INGEST_KEY)) ?? randomHex();
    const mcpSecret = (await getSecret(MCP_KEY)) ?? randomHex();
    onStep?.("upload");
    await uploadWorker(t, account.id, namespaceId, { ingestKey, mcpSecret });
    onStep?.("enable");
    await enableWorkersDev(t, account.id);
    await Promise.all([SecureStore.setItemAsync(TOKEN_KEY, t, secure), SecureStore.setItemAsync(INGEST_KEY, ingestKey, secure), SecureStore.setItemAsync(MCP_KEY, mcpSecret, secure)]);
    const prev = await connectorState();
    await saveState({
      accountId: account.id,
      accountName: account.name,
      subdomain,
      namespaceId,
      url: workerUrl(subdomain),
      workerVersion: WORKER_VERSION,
      setUpAt: Date.now(),
      lastSentAt: prev?.lastSentAt ?? null,
      lastHash: null,
      lastBytes: prev?.lastBytes ?? null,
      lastError: null,
    });
  } catch (e) {
    throw new Error(e instanceof Error && !(e.name === "CloudflareError") && !/fetch|network/i.test(e.message) ? e.message : cloudflareProblem(e));
  }
  onStep?.("send");
  // A new workers.dev address can take a little while to answer; the first send waits for it.
  const sent = await sendSnapshot(ctx, { force: true, retries: 6 });
  if (!sent.ok) console.warn(`[connector] first send failed: ${sent.error}`);
  if (!sent.ok) await patchState({ lastError: `Set up, but the first send didn’t go through yet (${sent.error}). Halo sends again after the next sync, or tap Send now.` });
  return (await connectorLink())!;
}

/** FNV-1a over the JSON text: enough to tell "changed" from "the same". */
function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SendResult = { ok: true; sent: boolean; bytes?: number } | { ok: false; error: string };

/**
 * Builds and sends the snapshot when it is due (or `force`). Updates the Worker first when this Halo carries a newer
 * one. Never throws.
 */
export async function sendSnapshot(ctx: QueryCtx, opts: { force?: boolean; retries?: number } = {}): Promise<SendResult> {
  const s = await connectorState();
  if (!s) return { ok: true, sent: false };
  if (!opts.force && s.lastSentAt && Date.now() - s.lastSentAt < EVERY_MS) return { ok: true, sent: false };
  const ingestKey = await getSecret(INGEST_KEY);
  if (!ingestKey) return { ok: false, error: "the upload key is missing on this phone; set the connector up again" };
  try {
    if (s.workerVersion !== WORKER_VERSION) await updateWorker(s, ingestKey);
    const text = JSON.stringify(await buildSnapshot(ctx, ctx.units ?? (await readUnits().catch(() => null))));
    const hash = hashOf(text);
    if (!opts.force && hash === s.lastHash && s.lastSentAt && Date.now() - s.lastSentAt < REFRESH_MS) return { ok: true, sent: false };
    let lastError = "";
    for (let attempt = 0; attempt <= (opts.retries ?? 1); attempt++) {
      if (attempt) await wait(Math.min(15_000, 2_000 * attempt));
      try {
        const res = await fetch(`${s.url}/ingest`, { method: "POST", headers: { Authorization: `Bearer ${ingestKey}`, "Content-Type": "application/json" }, body: text });
        if (res.ok) {
          await patchState({ lastSentAt: Date.now(), lastHash: hash, lastBytes: text.length, lastError: null });
          return { ok: true, sent: true, bytes: text.length };
        }
        lastError = res.status === 401 ? "the connector refused Halo’s key; set it up again" : `the connector answered ${res.status}`;
        if (res.status === 401 || res.status === 413) break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    await patchState({ lastError: `Couldn’t send: ${lastError}` });
    return { ok: false, error: lastError };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.warn("[connector] send", error);
    await patchState({ lastError: `Couldn’t send: ${error}` });
    return { ok: false, error };
  }
}

/** Re-uploads the Worker this Halo carries, with the same storage and secrets. */
async function updateWorker(s: ConnectorState, ingestKey: string): Promise<void> {
  const [token, mcpSecret] = await Promise.all([getSecret(TOKEN_KEY), getSecret(MCP_KEY)]);
  if (!token || !mcpSecret) return; // keeps serving the older Worker, which reads the same snapshot
  await uploadWorker(token, s.accountId, s.namespaceId, { ingestKey, mcpSecret });
  await patchState({ workerVersion: WORKER_VERSION });
}

/** After a sync (runSync): the query context for "now", then a send when due. Never throws. */
export async function sendAfterSync(store: Store, profile: Profile, timeZone: string): Promise<void> {
  try {
    if (!(await connectorState())) return;
    const now = Math.floor(Date.now() / 1000);
    const ctx: QueryCtx = { store, profile, timeZone, today: localDay(now, timeZone), now, sync: await store.getSyncState() };
    await sendSnapshot(ctx);
  } catch (e) {
    console.warn("[connector] after sync", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Deletes the Worker and its storage from Cloudflare and forgets the connector here. `localOnly` forgets without
 * asking Cloudflare (when the token no longer works). Throws a message ready to show when Cloudflare refuses.
 */
export async function removeConnector({ localOnly = false } = {}): Promise<void> {
  const s = await connectorState();
  const token = await getSecret(TOKEN_KEY);
  if (s && token && !localOnly) {
    try {
      await removeWorker(token, s.accountId, s.namespaceId);
    } catch (e) {
      throw new Error(cloudflareProblem(e));
    }
  }
  await Promise.all([TOKEN_KEY, INGEST_KEY, MCP_KEY].map((k) => SecureStore.deleteItemAsync(k, secure).catch(() => {})));
  await saveState(null);
}
