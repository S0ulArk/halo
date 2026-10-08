// The chat (spec §7.21), ported from Pulse's coach/Coach.tsx at phone width, in the Calm style: the coach's words in
// white bubbles on the warm ground, the person's in teal-tinted ones, tool results as white Pulse cards, and the
// composer a white pill pinned to the bottom over the keyboard. useChat drives it as on the web; its transport runs
// the turn on the phone (src/coach/transport.ts) instead of posting to /api/coach.
import * as React from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, Share, TextInput, View } from "react-native";
import { KeyboardChatScrollView, KeyboardStickyView, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Reanimated, { useAnimatedRef, useScrollOffset } from "react-native-reanimated";
import { useRouter, type Href } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { Activity, ArrowUp, Dumbbell, History, Moon, NotebookPen, Pencil, RotateCcw, Settings2, Share2, Square, type LucideIcon } from "lucide-react-native";
import type { CoachSuggestion } from "@/core/algorithms/coachSuggestions";
import { plainText } from "@/coach/chats";
import { deviceTransport, setCoachContext } from "@/coach/session";
import type { dayDigest } from "@/coach/tools";
import { alpha, mix } from "@/lib/utils";
import { openCheckIn } from "@/screens/journal/state";
import { useApp, useQueryCtx } from "@/state/app";
import { Button, Mark, Txt } from "@/ui";
import { CalmButton, CalmInput, GroupList, useCalm, type CalmTint } from "@/screens/settings/calmKit";
import { useKeepFocusedInputVisible, type Scroller } from "@/ui/keyboard";
import { NewChatButton } from "./ChatList";
import { DayCard, Evidence } from "./Evidence";
import { Prose } from "./Prose";

type DayDigest = Awaited<ReturnType<typeof dayDigest>>;
type Part = UIMessage["parts"][number];

/** Each starter's family pastel for its icon tile. */
const SUGGESTION_TINTS: Record<CoachSuggestion["key"], CalmTint> = {
  brief: "mint",
  recovery: "mint",
  training: "peach",
  hrv: "mint",
  sleep: "lavender",
  strain: "peach",
  sync: "sky",
};

const SUGGESTION_ICONS: Record<CoachSuggestion["key"], LucideIcon> = {
  brief: Activity,
  recovery: Activity,
  training: Dumbbell,
  hrv: Activity,
  sleep: Moon,
  strain: Dumbbell,
  sync: Moon,
};

/** One line while a tool runs, in the voice of the screen it reads. */
const RUNNING: Record<string, string> = {
  get_day: "Looking at your day…",
  get_sleep: "Reading your sleep and bedtime plan…",
  get_activity: "Checking workout intensity…",
  get_trend: "Checking your trends…",
  get_activities: "Looking at your workouts…",
  get_journal_impacts: "Reading your journal…",
  get_health: "Checking your Health Monitor…",
  get_report: "Reading your report…",
  get_profile: "Checking your profile…",
};

export const ERRORS: Record<string, string> = {
  limit: "Slow down a little. Try again in a moment.",
  key: "Your key stopped working. Add it again in Coach settings.",
  provider: "Your provider refused the request (key, quota or billing). Check your account with them.",
  network: "Couldn’t reach your provider. Check your connection and try again.",
};
const errorText = (e: Error) => ERRORS[e.message.trim()] ?? "Couldn’t get an answer. Try again.";

/** A pulsing teal dot and a grey line: tool progress, "Thinking…", a tool that failed. */
function Caption({ live, children }: { live?: boolean; children: string }) {
  const c = useCalm();
  const [o] = React.useState(() => new Animated.Value(1));
  React.useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0.35, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, o]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityLiveRegion={live ? "polite" : "none"}>
      <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.teal, opacity: live ? o : 1 }} />
      <Txt size={14} lineHeight={19} style={{ color: c.sub, flexShrink: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/** The coach's words: a white bubble on the ground, its tail at the bottom left. */
function CoachBubble({ children }: { children: React.ReactNode }) {
  const c = useCalm();
  return <View style={{ alignSelf: "stretch", borderRadius: 22, borderBottomLeftRadius: 8, backgroundColor: c.card, paddingHorizontal: 16, paddingVertical: 12 }}>{children}</View>;
}

function PartView({ part }: { part: Part }) {
  if (part.type === "text")
    return part.text.trim() ? (
      <CoachBubble>
        <Prose text={part.text} />
      </CoachBubble>
    ) : null;
  if (!part.type.startsWith("tool-")) return null;
  const name = part.type.slice(5);
  const tool = part as Part & { state: string; output?: unknown };
  if (tool.state === "output-error") return <Caption>Couldn’t read that part of your data.</Caption>;
  if (tool.state !== "output-available") return <Caption live>{RUNNING[name] ?? "Looking at your data…"}</Caption>;
  if (name === "get_day")
    return (
      <View style={{ gap: 8 }}>
        <DayCard d={tool.output as DayDigest} />
        <Evidence name={name} output={tool.output} />
      </View>
    );
  return <Evidence name={name} output={tool.output} />;
}

/** A message action (Share, Regenerate, Edit): a quiet 40 px icon button. */
function IconAction({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  const c = useCalm();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1, backgroundColor: pressed ? c.card : "transparent" })}>
      {children}
    </Pressable>
  );
}

/** A pill text button (Cancel, Save and send, Retry): 44 px, solid teal for the primary one, white otherwise. */
function Pill({ label, onPress, disabled, primary, icon }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; icon?: React.ReactNode }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({ minHeight: 44, borderRadius: 22, paddingHorizontal: icon ? 14 : 18, flexDirection: "row", alignItems: "center", gap: 6, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, backgroundColor: primary ? c.teal : c.card })}
    >
      {icon}
      <Txt size={14} lineHeight={18} weight={600} style={{ color: primary ? c.card : c.ink }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** The person's message: a bubble with Edit beside it, which turns it into a field (Save and send, or Cancel). */
function UserMessage({ m, busy, onEdit }: { m: UIMessage; busy: boolean; onEdit: (text: string) => void }) {
  const c = useCalm();
  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const [draft, setDraft] = React.useState<string | null>(null);
  const save = () => {
    const t = draft?.trim();
    if (!t || busy) return;
    setDraft(null);
    if (t !== text.trim()) onEdit(t);
  };
  if (draft !== null)
    return (
      <View style={{ marginLeft: 40, gap: 8 }}>
        <CalmInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
          accessibilityLabel="Edit your message"
          autoCorrect
          on="ground"
          style={{ maxHeight: 240, borderRadius: 22, paddingVertical: 12, lineHeight: 24 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Pill label="Cancel" onPress={() => setDraft(null)} />
          <Pill label="Save and send" primary disabled={busy || !draft.trim()} onPress={save} />
        </View>
      </View>
    );
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "flex-end", gap: 4, paddingLeft: 24 }}>
      <View style={{ marginTop: 2 }}>
        <IconAction label="Edit message" disabled={busy} onPress={() => setDraft(text)}>
          <Pencil size={16} color={c.sub} strokeWidth={1.75} />
        </IconAction>
      </View>
      {/* The person's words: a teal-tinted bubble, its tail at the bottom right. */}
      <View style={{ flexShrink: 1, borderRadius: 22, borderBottomRightRadius: 8, backgroundColor: mix(c.teal, c.card, 0.14), paddingHorizontal: 16, paddingVertical: 12 }}>
        <Txt role="body" size={15} lineHeight={24} selectable style={{ color: c.ink }}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

/** The coach's answer: its parts, then Share (and Regenerate on the newest answer) once it has finished. */
function AssistantMessage({ m, done, onRegenerate }: { m: UIMessage; done: boolean; onRegenerate?: () => void }) {
  const c = useCalm();
  const text = plainText(m);
  return (
    <View style={{ minWidth: 0, gap: 12 }}>
      {m.parts.map((p, i) => (
        <PartView key={i} part={p} />
      ))}
      {done && (!!text || onRegenerate) && (
        <View style={{ marginLeft: -8, flexDirection: "row", alignItems: "center" }}>
          {!!text && (
            <IconAction label="Share answer" onPress={() => void Share.share({ message: text }).catch(() => {})}>
              <Share2 size={16} color={c.sub} strokeWidth={1.75} />
            </IconAction>
          )}
          {onRegenerate && (
            <IconAction label="Regenerate answer" onPress={onRegenerate}>
              <RotateCcw size={16} color={c.sub} strokeWidth={1.75} />
            </IconAction>
          )}
        </View>
      )}
    </View>
  );
}

function Empty({ providerLabel, suggestions, onAsk }: { providerLabel: string; suggestions: CoachSuggestion[]; onAsk: (text: string) => void }) {
  const c = useCalm();
  const { today } = useApp();
  return (
    <View style={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 32 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
        <Mark size={22} />
      </View>
      <Txt size={22} lineHeight={28} weight={600} align="center" accessibilityRole="header" style={{ marginTop: 20, color: c.ink }}>
        What would you like to know?
      </Txt>
      <Txt size={15} lineHeight={21} align="center" style={{ marginTop: 8, maxWidth: 360, color: c.sub }}>
        The coach looks up your own Halo numbers before it answers, using {providerLabel}. It’s not medical advice.
      </Txt>
      {/* The starter questions as one grouped card: a tinted icon tile, the question in full, a chevron. */}
      {suggestions.length > 0 && (
        <GroupList
          style={{ marginTop: 28, alignSelf: "stretch" }}
          rows={suggestions.map((s) => ({ label: s.text, icon: SUGGESTION_ICONS[s.key], tint: SUGGESTION_TINTS[s.key], onPress: () => onAsk(s.text), accessibilityLabel: s.text }))}
        />
      )}
      <CalmButton variant="quiet" size="md" icon={NotebookPen} onPress={() => openCheckIn(today)} style={{ marginTop: 12 }}>
        Check in for today
      </CalmButton>
    </View>
  );
}

/** The composer's round 44 px button: Send in solid teal, Stop on the ground's grey. */
function ComposerButton({ variant, onPress, disabled, label, children }: { variant: "send" | "stop"; onPress: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: variant === "send" ? c.teal : c.ground, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}
    >
      {children}
    </Pressable>
  );
}

/** The header's right side: Chats (with the count), New chat when a saved chat is open, and Coach settings. */
export function CoachBarActions({ chatCount, chatOpen, onNew }: { chatCount: number; chatOpen: boolean; onNew: () => void }) {
  const c = useCalm();
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Button variant="ghost" size="icon-touch" onPress={() => router.push("/coach/chats" as Href)} accessibilityLabel={chatCount ? `Chats (${chatCount})` : "Chats"}>
        <History size={20} color={c.ink} strokeWidth={1.75} />
      </Button>
      {chatOpen && <NewChatButton onPress={onNew} />}
      <Button variant="ghost" size="icon-touch" onPress={() => router.push("/coach/settings" as Href)} accessibilityLabel="Coach settings">
        <Settings2 size={20} color={c.ink} strokeWidth={1.6} />
      </Button>
    </View>
  );
}

export type CoachProps = {
  id: string;
  initial: UIMessage[];
  /** Fills the composer without sending (`?q=`). */
  prefill: string;
  /** Sends `prefill` at once (`?brief=1`). */
  auto: boolean;
  providerLabel: string;
  suggestions: CoachSuggestion[];
  /** After the first answer of a new chat: the screen records the chat's id (the web's `/coach?c=`). */
  onSaved: (id: string) => void;
};

export function Coach({ id, initial, prefill, auto, providerLabel, suggestions, onSaved }: CoachProps) {
  const c = useCalm();
  const insets = useSafeAreaInsets();
  const ctx = useQueryCtx();
  // The transport reads the person's context when a turn starts.
  setCoachContext(ctx);
  const [input, setInput] = React.useState(prefill);
  const [error, setError] = React.useState<string | null>(null);
  const [composerH, setComposerH] = React.useState(56);
  const area = React.useRef<TextInput>(null);
  const scroll = useAnimatedRef<Reanimated.ScrollView>();
  const content = React.useRef<View>(null);
  const atEnd = React.useRef(true);
  const [transport] = React.useState(deviceTransport);
  const { messages, sendMessage, regenerate, status, stop } = useChat({
    id,
    messages: initial,
    throttle: 50,
    transport,
    onError: (e) => setError(errorText(e)),
    onFinish: ({ message }) => {
      // Read the finished answer once, as plain words; never re-read a saved chat on load.
      const words = plainText(message);
      if (words) AccessibilityInfo.announceForAccessibility(words);
      if (initial.length === 0) onSaved(id);
    },
  });
  const busy = status === "submitted" || status === "streaming";

  React.useEffect(() => {
    if (atEnd.current) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
  }, [messages.length, status, scroll]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setError(null);
    setInput("");
    atEnd.current = true;
    void sendMessage({ text: t });
  };
  // The morning brief (`?brief=1`) is asked once.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (!auto || asked.current) return;
    asked.current = true;
    send(prefill);
  });
  const edit = (messageId: string, text: string) => {
    if (busy) return;
    setError(null);
    void sendMessage({ text, messageId });
  };
  /** A new answer to the newest question: the last answer (Regenerate), or the one that failed (Retry). */
  const again = (messageId?: string) => {
    if (busy) return;
    setError(null);
    void regenerate(messageId ? { messageId } : undefined);
  };
  const lastAnswer = messages.at(-1)?.role === "assistant" ? messages.at(-1)!.id : null;
  // Whether the newest message is in view, from the UI thread: React hears only when that changes, not every scroll.
  const onEndVisible = React.useCallback((visible: boolean) => {
    atEnd.current = visible;
  }, []);
  const bottom = Math.max(insets.bottom, 12);
  // A message being edited stays in view over the keyboard and the composer (the composer is outside `content`).
  const keyboard = useReanimatedKeyboardAnimation();
  const offset = useScrollOffset(scroll);
  useKeepFocusedInputVisible({
    scroll: scroll as unknown as React.RefObject<Scroller | null>,
    content,
    offset,
    gap: 16,
    hiddenBelow: () => Math.max(0, -keyboard.height.value) + composerH + 8,
  });

  return (
    <View style={{ flex: 1 }}>
      {/* The list keeps its size; with the keyboard it gains room at its foot and lifts its content with the keyboard
          (react-native-keyboard-controller's chat scroll view, on the UI thread), so the newest message stays over the
          composer. Dragging the list closes the keyboard. */}
      <KeyboardChatScrollView
        ref={scroll as unknown as React.Ref<Reanimated.ScrollView>}
        onEndVisible={onEndVisible}
        onContentSizeChange={() => atEnd.current && scroll.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Only the empty state fills the screen (to centre itself). A chat keeps its own height, so a short one stays
        // where it is when the keyboard opens (the lift stops at the end of the content) instead of scrolling away.
        contentContainerStyle={{ flexGrow: messages.length === 0 ? 1 : 0, paddingHorizontal: 16, paddingTop: 8, paddingBottom: composerH + bottom + 24 }}
      >
        <View ref={content} collapsable={false} style={{ flexGrow: messages.length === 0 ? 1 : 0 }}>
          {messages.length === 0 ? (
            <Empty providerLabel={providerLabel} suggestions={suggestions} onAsk={send} />
          ) : (
            <View accessibilityLabel="Chat with Halo’s coach" style={{ marginTop: 8, gap: 24 }}>
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} m={m} busy={busy} onEdit={(text) => edit(m.id, text)} />
                ) : (
                  <AssistantMessage key={m.id} m={m} done={!busy || i < messages.length - 1} onRegenerate={!busy && m.id === lastAnswer ? () => again(m.id) : undefined} />
                ),
              )}
              {status === "submitted" && <Caption live>Thinking…</Caption>}
            </View>
          )}
          {error && (
            <View accessibilityRole="alert" style={{ marginTop: 24, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 22, backgroundColor: c.tint.rose, paddingVertical: 8, paddingRight: 8, paddingLeft: 16 }}>
              <Txt size={14} lineHeight={19} style={{ flex: 1, minWidth: 0, paddingVertical: 4, color: c.tintInk.rose }}>
                {error}
              </Txt>
              <Pill label="Retry" disabled={busy} onPress={() => again()} icon={<RotateCcw size={16} color={c.ink} strokeWidth={1.75} />} />
            </View>
          )}
        </View>
      </KeyboardChatScrollView>

      {/* Pinned to the bottom and riding on the keyboard (8 px over it: the safe-area padding is under the keyboard
          then); messages scrolling under it fade into the ground (one fade, not repeated). The composer is a white pill. */}
      <KeyboardStickyView offset={{ closed: 0, opened: bottom - 8 }} pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <LinearGradient pointerEvents="none" colors={[alpha(c.ground, 0), c.ground]} locations={[0, 0.45]} style={{ position: "absolute", left: 0, right: 0, top: -32, bottom: 0 }} />
        <View style={{ paddingHorizontal: 16, paddingBottom: bottom }} onLayout={(e) => setComposerH(e.nativeEvent.layout.height - bottom)}>
          <View style={{ borderRadius: 32, borderWidth: 1, borderColor: c.edge, backgroundColor: c.card }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, padding: 6 }}>
              <TextInput
                ref={area}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={2000}
                placeholder="Message Coach"
                placeholderTextColor={c.faint}
                accessibilityLabel="Ask Coach"
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={() => send(input)}
                cursorColor={c.teal}
                selectionColor={alpha(c.teal, 0.3)}
                allowFontScaling={false}
                style={{ flex: 1, minWidth: 0, minHeight: 44, maxHeight: 160, paddingVertical: 10, paddingLeft: 14, paddingRight: 4, fontSize: 16, lineHeight: 24, color: c.ink, fontFamily: "Figtree_400Regular", textAlignVertical: "center" }}
              />
              {busy ? (
                <ComposerButton variant="stop" onPress={() => stop()} label="Stop">
                  <Square size={14} color={c.ink} fill={c.ink} strokeWidth={2} />
                </ComposerButton>
              ) : (
                <ComposerButton variant="send" disabled={!input.trim()} onPress={() => send(input)} label="Send">
                  <ArrowUp size={20} color={c.card} strokeWidth={2.25} />
                </ComposerButton>
              )}
            </View>
          </View>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
