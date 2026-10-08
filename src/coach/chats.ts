// Chat-list helpers shared by storage and the screens, ported from Pulse's src/server/coach/store.ts and ChatList.tsx:
// titles, paging cursors, and grouping by recency in the person's own time zone. No storage here, so tests load it.
import type { UIMessage } from "ai";
import { daysBetween, localDay } from "@/lib/time";

export type ChatRow = { id: string; title: string; updatedAt: number };

/** Chats per page in the chat list ("Show older chats" loads the next). */
export const CHAT_PAGE = 30;

/** Where the next page starts: the last chat shown (newest first, ties broken by id). */
export type ChatCursor = { updatedAt: number; id: string };

export type ChatGroup = { label: "Today" | "Yesterday" | "Previous 7 days" | "Earlier"; chats: ChatRow[] };

/** Chat ids: what the web's route accepts (`[\w-]{8,64}`). */
export const CHAT_ID = /^[\w-]{8,64}$/;

/** The first thing the person asked, cut to 60 characters. */
export function titleOf(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text =
    first?.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join(" ")
      .trim()
      .replace(/\s+/g, " ") ?? "";
  return (text.length > 60 ? `${text.slice(0, 59)}…` : text) || "New chat";
}

/** Chats grouped by recency in the person's time zone. `now` is unix seconds. */
export function groupChats(chats: ChatRow[], now: number, timeZone: string): ChatGroup[] {
  const today = localDay(now, timeZone);
  const label = (s: number): ChatGroup["label"] => {
    const gap = daysBetween(localDay(s, timeZone), today);
    return gap <= 0 ? "Today" : gap === 1 ? "Yesterday" : gap <= 7 ? "Previous 7 days" : "Earlier";
  };
  const out: ChatGroup[] = [];
  for (const c of chats) {
    const l = label(c.updatedAt);
    const g = out.find((x) => x.label === l);
    if (g) g.chats.push(c);
    else out.push({ label: l, chats: [c] });
  }
  return out;
}

/** Appends a page's groups to what is shown, joining a group that continues across the page break. */
export function mergeGroups(shown: ChatGroup[], more: ChatGroup[]): ChatGroup[] {
  const out = shown.map((g) => ({ ...g, chats: [...g.chats] }));
  for (const g of more) {
    const last = out.at(-1);
    if (last?.label === g.label) last.chats.push(...g.chats);
    else out.push({ ...g, chats: [...g.chats] });
  }
  return out;
}

/** The answer as plain words (no ** marks), for copying and the screen-reader announcement. */
export const plainText = (m: UIMessage) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text.replace(/\*\*/g, "") : ""))
    .join("\n\n")
    .trim();
