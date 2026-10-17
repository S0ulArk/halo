// The coach's chats, ported from Pulse's coach/ChatList.tsx, as an iOS list: New chat on top, then the chats grouped by
// recency (in the person's zone), each group an inset grouped list, 30 at a time with "Show older chats". A row opens
// its chat; swiping it left reveals the red Delete (Gesture Handler's Reanimated swipeable, so the row follows the
// finger on the UI thread), a long press offers Delete in an action sheet, and screen readers get a Delete action.
// Every delete is confirmed first.
import * as React from "react";
import { Platform, Pressable, ToastAndroid, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useRouter, type Href } from "expo-router";
import { MessageSquarePlus, Trash2 } from "lucide-react-native";
import { generateId } from "ai";
import { groupChats, mergeGroups, type ChatCursor, type ChatGroup, type ChatRow } from "@/coach/chats";
import { deleteChat, listChats, subscribe } from "@/coach/storage";
import { useApp } from "@/state/app";
import { Txt } from "@/ui";
import { ActionSheet } from "@/ui/components/Alert";
import { usePress, usePressStyle } from "@/ui/components/press";
import { haptic } from "@/ui/motion/haptics";
import { CalmButton, SectionFooter, Sentence, useCalm } from "@/screens/settings/calmKit";
import { ButtonRow, InsetGroup } from "@/screens/settings/list";
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

/** The red Delete behind a row: its width, and how far a swipe must go before it stays open. */
const DELETE_W = 88;

/** The red Delete revealed by the swipe: it grows into place as the row slides over. */
function DeleteAction({ progress, onPress }: { progress: SharedValue<number>; onPress: () => void }) {
  const c = useCalm();
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0.6, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.8, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Delete chat" style={{ width: DELETE_W, backgroundColor: c.system.red, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ alignItems: "center", gap: 2 }, style]}>
        <Trash2 size={19} color="#ffffff" strokeWidth={2.2} />
        <Txt size={13} lineHeight={17} weight={600} style={{ color: "#ffffff" }}>
          Delete
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

/**
 * One chat: the row opens it (its title in ink, the open chat's in blue); a swipe left reveals Delete, a long press
 * offers it in an action sheet. Opening one row's Delete closes any other (`onSwipeOpen`).
 */
function ChatItem({ chat, current, onOpen, onSwipeOpen }: { chat: ChatRow; current: boolean; onOpen: (id: string) => void; onSwipeOpen: (row: SwipeableMethods | null) => void }) {
  const c = useCalm();
  const swipe = React.useRef<SwipeableMethods>(null);
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { dim: 0.55 });
  const [sheet, setSheet] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const ask = () => {
    swipe.current?.close();
    setConfirm(true);
  };
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
    <>
      <ReanimatedSwipeable
        ref={swipe}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={(progress) => <DeleteAction progress={progress} onPress={ask} />}
        onSwipeableWillOpen={() => {
          haptic.select();
          onSwipeOpen(swipe.current);
        }}
      >
        <Pressable
          onPress={() => onOpen(chat.id)}
          onLongPress={() => {
            haptic.select();
            setSheet(true);
          }}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="link"
          accessibilityState={{ selected: current }}
          accessibilityLabel={chat.title}
          accessibilityActions={[{ name: "delete", label: "Delete chat" }]}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === "delete" && setConfirm(true)}
          style={{ backgroundColor: c.card }}
        >
          <Animated.View style={[{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12 }, pressed]}>
            <Txt size={16} lineHeight={21} weight={current ? 600 : 400} style={{ color: current ? c.teal : c.ink }}>
              {chat.title}
            </Txt>
          </Animated.View>
        </Pressable>
      </ReanimatedSwipeable>
      <ActionSheet open={sheet} onClose={() => setSheet(false)} title={chat.title} actions={[{ label: "Delete chat", destructive: true, onPress: () => setConfirm(true) }]} />
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
    </>
  );
}

/** Starts a fresh chat: a group with the blue New chat row. */
export function NewChatButton({ onPress }: { onPress: () => void }) {
  const c = useCalm();
  return (
    <InsetGroup>
      <ButtonRow label="New chat" leading={<MessageSquarePlus size={20} color={c.teal} strokeWidth={2} />} onPress={onPress} />
    </InsetGroup>
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
 * chats" for the next page. One row's Delete is open at a time.
 */
export function ChatList({ current, onOpen, onNew }: { current: string | null; onOpen: (id: string) => void; onNew: () => void }) {
  const c = useCalm();
  const { groups, next, loadMore, error } = useChats();
  const [pending, setPending] = React.useState(false);
  const open = React.useRef<SwipeableMethods | null>(null);
  const onSwipeOpen = React.useCallback((row: SwipeableMethods | null) => {
    if (open.current && open.current !== row) open.current.close();
    open.current = row;
  }, []);
  return (
    <View accessibilityLabel="Chats" style={{ gap: 24 }}>
      <NewChatButton onPress={onNew} />
      {error ? (
        <Sentence color={c.system.red} accessibilityRole="alert" style={{ paddingHorizontal: 16 }}>
          Couldn’t read your chats. Try again.
        </Sentence>
      ) : groups === null ? null : groups.length === 0 ? (
        <Sentence style={{ paddingHorizontal: 16 }}>Your chats appear here. They’re saved on this phone, visible only to you.</Sentence>
      ) : (
        <>
          {groups.map((g, i) => (
            <InsetGroup key={`${g.label}-${i}`} title={g.label}>
              {g.chats.map((chat) => (
                <ChatItem key={chat.id} chat={chat} current={chat.id === current} onOpen={onOpen} onSwipeOpen={onSwipeOpen} />
              ))}
            </InsetGroup>
          ))}
          <SectionFooter>Swipe left on a chat to delete it, or touch and hold it.</SectionFooter>
        </>
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
