// The coach's stored state on the phone (the web's src/server/coach/store.ts): consent, provider and model, the person's
// own notes (AsyncStorage); the API key (expo-secure-store, Android Keystore-backed: never logged, never shown back,
// only its last four characters are kept beside the setup); and the chats, in their own SQLite file "coach.db" so the
// health store's schema never sees them. Every change notifies `subscribe`rs so open screens refresh.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UIMessage } from "ai";
import * as SecureStore from "expo-secure-store";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { CHAT_PAGE, titleOf, type ChatCursor, type ChatRow } from "./chats";

/** What the screens may know about the setup: never the key itself. */
export type CoachSetup = { provider: string | null; model: string | null; last4: string | null; consent: boolean; instructions: string | null };

const SETUP_KEY = "pulse.coach.setup";
const API_KEY = "pulse.coach.apiKey";
const EMPTY: CoachSetup = { provider: null, model: null, last4: null, consent: false, instructions: null };

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
/** Called after any setup or chat change; returns the unsubscribe. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

const now = () => Math.floor(Date.now() / 1000);

// ── Setup and key ────────────────────────────────────────────────────────────

export async function coachSetup(): Promise<CoachSetup> {
  const raw = await AsyncStorage.getItem(SETUP_KEY).catch(() => null);
  if (!raw) return EMPTY;
  try {
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<CoachSetup>) };
  } catch {
    return EMPTY;
  }
}

async function patchSetup(p: Partial<CoachSetup>): Promise<void> {
  const next = { ...(await coachSetup()), ...p };
  await AsyncStorage.setItem(SETUP_KEY, JSON.stringify(next));
  emit();
}

export const setConsent = (on: boolean) => patchSetup({ consent: on });

/** The person's notes for the coach (null clears them). */
export const setInstructions = (notes: string | null) => patchSetup({ instructions: notes?.trim() || null });

/** Stores the provider and model, and the key in secure storage (call only after the test request worked). */
export async function saveProvider(provider: string, model: string, apiKey: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY, apiKey, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  await patchSetup({ provider, model, last4: apiKey.slice(-4) });
}

export async function removeProvider(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY).catch(() => {});
  await patchSetup({ provider: null, model: null, last4: null });
}

/** The saved key, or null (none saved, or the keystore can no longer read it: the person adds it again). */
export async function apiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY).catch(() => null);
}

// ── Chats ────────────────────────────────────────────────────────────────────

let opening: Promise<SQLiteDatabase> | null = null;

function db(): Promise<SQLiteDatabase> {
  opening ??= (async () => {
    const d = await openDatabaseAsync("coach.db");
    await d.execAsync(`
      pragma journal_mode = wal;
      create table if not exists chats (
        id text primary key not null,
        title text not null,
        messages text not null,
        created_at integer not null,
        updated_at integer not null
      );
      create index if not exists chats_recent on chats (updated_at desc, id desc);
    `);
    return d;
  })().catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}

/** One page of chats, newest first, after `before` when given; `next` is the cursor for the page after, if any. */
export async function listChats(before?: ChatCursor): Promise<{ chats: ChatRow[]; next: ChatCursor | null }> {
  const d = await db();
  const rows = before
    ? await d.getAllAsync<{ id: string; title: string; updated_at: number }>(
        "select id, title, updated_at from chats where updated_at < ? or (updated_at = ? and id < ?) order by updated_at desc, id desc limit ?",
        [before.updatedAt, before.updatedAt, before.id, CHAT_PAGE + 1],
      )
    : await d.getAllAsync<{ id: string; title: string; updated_at: number }>("select id, title, updated_at from chats order by updated_at desc, id desc limit ?", [CHAT_PAGE + 1]);
  const chats = rows.slice(0, CHAT_PAGE).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
  const last = chats.at(-1);
  return { chats, next: rows.length > CHAT_PAGE && last ? { updatedAt: last.updatedAt, id: last.id } : null };
}

export async function chatCount(): Promise<number> {
  const r = await (await db()).getFirstAsync<{ n: number }>("select count(*) as n from chats");
  return r?.n ?? 0;
}

export async function loadChat(id: string): Promise<UIMessage[] | null> {
  const r = await (await db()).getFirstAsync<{ messages: string }>("select messages from chats where id = ?", [id]);
  if (!r) return null;
  try {
    return JSON.parse(r.messages) as UIMessage[];
  } catch {
    return null;
  }
}

/** Saves the whole chat; the title follows the first question, so editing it renames the chat. */
export async function saveChat(id: string, messages: UIMessage[]): Promise<void> {
  const at = now();
  await (
    await db()
  ).runAsync(
    "insert into chats (id, title, messages, created_at, updated_at) values (?, ?, ?, ?, ?) on conflict(id) do update set title = excluded.title, messages = excluded.messages, updated_at = excluded.updated_at",
    [id, titleOf(messages), JSON.stringify(messages), at, at],
  );
  emit();
}

export async function deleteChat(id: string): Promise<void> {
  await (await db()).runAsync("delete from chats where id = ?", [id]);
  emit();
}

export async function deleteAllChats(): Promise<void> {
  await (await db()).runAsync("delete from chats");
  emit();
}
