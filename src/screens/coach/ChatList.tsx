// The coach's chats, ported from Pulse's coach/ChatList.tsx: New chat on top, then the chats grouped by recency (in the
// person's zone), 30 at a time with "Show older chats". In the Calm style each group is a small caps header over one
// white card of rows; each row opens its chat, and its "…" menu deletes it, after a confirm.
import * as React from "react";
import { Platform, Pressable, StyleSheet, ToastAndroid, useWindowDimensions, View } from "react-native";
import { OverlayModal } from "@/ui/components/Overlay";
import { useRouter, type Href } from "expo-router";
import { Ellipsis, MessageSquarePlus } from "lucide-react-native";
import { generateId } from "ai";
import { groupChats, mergeGroups, type ChatCursor, type ChatGroup, type ChatRow } from "@/coach/chats";
import { deleteChat, listChats, subscribe } from "@/coach/storage";
import { alpha } from "@/lib/utils";
import { useApp } from "@/state/app";
import { Button, Txt } from "@/ui";
import { CalmButton, Hairline, IconTile, SectionLabel, Sentence, useCalm } from "@/screens/settings/calmKit";
import { ConfirmDialog } from "./ConfirmDialog";

/** A short confirmation (the web's toast). */
export function toast(message: string) {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
}

/** Opens the coach on a fresh chat: back to it when it is below this screen, else in place of this screen. */
export function useNewChat() {
  const router = useRouter();
  return React.useCallback(() => router.dismissTo(`/coach?n=${generateId()}` as Href), [router]);
}

/** A chat's "…": a small menu under the button with its one action. */
function RowMenu({ title, onDelete }: { title: string; onDelete: () => void }) {
  const c = useCalm();
  const { width } = useWindowDimensions();
  const anchor = React.useRef<View>(null);
  const [at, setAt] = React.useState<{ top: number; right: number } | null>(null);
  const open = () => anchor.current?.measureInWindow((x, y, w, h) => setAt({ top: y + h + 4, right: Math.max(8, width - (x + w)) }));
  return (
    <>
      <Pressable
        ref={anchor}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Options for “${title}”`}
        accessibilityState={{ expanded: !!at }}
        style={({ pressed }) => ({ position: "absolute", top: 8, right: 8, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed || at ? c.ground : "transparent" })}
      >
        <Ellipsis size={18} color={c.sub} strokeWidth={2} />
      </Pressable>
      {at && (
        <OverlayModal fade onRequestClose={() => setAt(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAt(null)} accessibilityLabel="Close menu" />
          {/* One floating menu (not a repeated card): a white 18 px panel with a hairline so it reads over the list. */}
          <View style={{ position: "absolute", top: at.top, right: at.right, minWidth: 160, padding: 6, borderRadius: 18, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, elevation: 6 }}>
            <Pressable
              onPress={() => {
                setAt(null);
                onDelete();
              }}
              accessibilityRole="menuitem"
              style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: pressed ? c.tint.rose : "transparent" })}
            >
              <Txt size={15} lineHeight={20} weight={600} style={{ color: c.tintInk.rose }}>
                Delete chat
              </Txt>
            </Pressable>
          </View>
        </OverlayModal>
      )}
    </>
  );
}

/** One chat: the row opens it; its menu (Delete) is always shown on a touch screen. */
function ChatItem({ chat, current, onOpen }: { chat: ChatRow; current: boolean; onOpen: (id: string) => void }) {
  const c = useCalm();
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const remove = async () => {
    setPending(true);
    try {
      await deleteChat(chat.id);
      setConfirm(false);
      toast("Chat deleted.");
    } catch {
      toast("Couldn’t delete that chat. Try again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <View>
      <Pressable
        onPress={() => onOpen(chat.id)}
        accessibilityRole="link"
        accessibilityState={{ selected: current }}
        style={({ pressed }) => ({ minHeight: 60, justifyContent: "center", paddingVertical: 12, paddingLeft: 18, paddingRight: 60, backgroundColor: current ? alpha(c.teal, 0.1) : pressed ? c.ground : "transparent" })}
      >
        <Txt size={15} lineHeight={20} weight={current ? 600 : 500} style={{ color: current ? c.teal : c.ink }}>
          {chat.title}
        </Txt>
      </Pressable>
      <RowMenu title={chat.title} onDelete={() => setConfirm(true)} />
      <ConfirmDialog
        open={confirm}
        title="Delete this chat?"
        description={`“${chat.title}” and its answers are removed from this phone. This can’t be undone.`}
        confirm="Delete chat"
        pendingLabel="Deleting…"
        pending={pending}
        onConfirm={() => void remove()}
        onClose={() => setConfirm(false)}
      />
    </View>
  );
}

/** Starts a fresh chat: a nav row with the label, or a 44 px icon button. */
export function NewChatButton({ label, onPress }: { label?: boolean; onPress: () => void }) {
  const c = useCalm();
  if (!label)
    return (
      <Button variant="ghost" size="icon-touch" onPress={onPress} accessibilityLabel="New chat">
        <MessageSquarePlus size={20} color={c.ink} strokeWidth={1.75} />
      </Button>
    );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 28, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.card, opacity: pressed ? 0.85 : 1 })}>
      <IconTile icon={MessageSquarePlus} tint="mint" size={40} />
      <Txt size={16} lineHeight={21} weight={600} style={{ color: c.teal, flex: 1 }}>
        New chat
      </Txt>
    </Pressable>
  );
}

/** The first page of chats, reloaded after every change; older pages appended on request. */
function useChats() {
  const { timeZone } = useApp();
  const [first, setFirst] = React.useState<{ groups: ChatGroup[]; next: ChatCursor | null } | null>(null);
  const [more, setMore] = React.useState<{ groups: ChatGroup[]; next: ChatCursor | null } | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    const read = () =>
      void listChats().then(
        (r) => {
          if (!live) return;
          setFirst({ groups: groupChats(r.chats, Math.floor(Date.now() / 1000), timeZone), next: r.next });
          setMore(null);
          setError(false);
        },
        () => live && setError(true),
      );
    read();
    const off = subscribe(read);
    return () => {
      live = false;
      off();
    };
  }, [timeZone]);
  const next = more ? more.next : (first?.next ?? null);
  const loadMore = async () => {
    if (!next) return;
    const r = await listChats(next);
    const groups = groupChats(r.chats, Math.floor(Date.now() / 1000), timeZone);
    setMore((m) => ({ groups: mergeGroups(m?.groups ?? [], groups), next: r.next }));
  };
  return { groups: first ? (more ? mergeGroups(first.groups, more.groups) : first.groups) : null, next, loadMore, error };
}

/**
 * The coach's chats (spec §7.21): New chat on top, then the chats grouped by recency, 30 at a time with "Show older
 * chats" for the next page.
 */
export function ChatList({ current, onOpen, onNew }: { current: string | null; onOpen: (id: string) => void; onNew: () => void }) {
  const c = useCalm();
  const { groups, next, loadMore, error } = useChats();
  const [pending, setPending] = React.useState(false);
  return (
    <View accessibilityLabel="Chats" style={{ gap: 24 }}>
      <NewChatButton label onPress={onNew} />
      {error ? (
        <Sentence color={c.tintInk.rose} accessibilityRole="alert" style={{ paddingHorizontal: 6 }}>
          Couldn’t read your chats. Try again.
        </Sentence>
      ) : groups === null ? null : groups.length === 0 ? (
        <Sentence style={{ paddingHorizontal: 6 }}>Your chats appear here. They’re saved on this phone, visible only to you.</Sentence>
      ) : (
        groups.map((g, i) => (
          <View key={`${g.label}-${i}`} accessibilityLabel={g.label} style={{ gap: 10 }}>
            <SectionLabel>{g.label}</SectionLabel>
            <View style={{ borderRadius: 32, borderWidth: 1, borderColor: c.edge, backgroundColor: c.card, ...(c.shadow ? { boxShadow: c.shadow } : null), overflow: "hidden", paddingVertical: 4 }}>
              {g.chats.map((chat, k) => (
                <React.Fragment key={chat.id}>
                  {k > 0 && <Hairline inset={18} />}
                  <ChatItem chat={chat} current={chat.id === current} onOpen={onOpen} />
                </React.Fragment>
              ))}
            </View>
          </View>
        ))
      )}
      {next && (
        <CalmButton
          variant="secondary"
          size="md"
          disabled={pending}
          onPress={() => {
            setPending(true);
            loadMore()
              .catch(() => toast("Couldn’t load older chats."))
              .finally(() => setPending(false));
          }}
        >
          {pending ? "Loading…" : "Show older chats"}
        </CalmButton>
      )}
    </View>
  );
}
