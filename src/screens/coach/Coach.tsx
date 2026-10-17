// The chat (spec §7.21), ported from Pulse's coach/Coach.tsx at phone width, in the look of Messages and Apple
// Intelligence: the person's words in blue bubbles on the right, the coach's answers as plain text on the ground with
// Apple Health style evidence cards under them, and a floating Liquid Glass composer (a capsule field with a round send
// button) riding the keyboard, under a floating bar whose glass buttons bend the chat scrolling beneath. useChat drives
// it as on the web; its transport runs the turn on the phone (src/coach/transport.ts) instead of posting to /api/coach.
//
// Smoothness while an answer streams (every 50 ms): the list is virtualised (a FlatList on react-native-keyboard-
// controller's chat scroll view), each message row is memoised and useChat keeps every unchanged message object, so a
// chunk re-renders the streaming answer alone; inside it the evidence cards are memoised on their tool output. New
// messages spring in on the UI thread, once each; a message already on screen when the chat opened never animates.
import * as React from "react";
import { AccessibilityInfo, FlatList, Pressable, Share, TextInput, useWindowDimensions, View, type LayoutChangeEvent, type ListRenderItemInfo, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardChatScrollView, KeyboardStickyView, useKeyboardHandler, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Reanimated, { cancelAnimation, Easing, useAnimatedRef, useAnimatedStyle, useScrollOffset, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useRouter, type Href } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { Activity, ArrowUp, Copy, Dumbbell, History, MessageSquarePlus, Moon, NotebookPen, RefreshCw, RotateCcw, Settings2, Share2, Square, type LucideIcon } from "lucide-react-native";
import type { CoachSuggestion } from "@/core/algorithms/coachSuggestions";
import { plainText } from "@/coach/chats";
import { deviceTransport, setCoachContext } from "@/coach/session";
import type { dayDigest } from "@/coach/tools";
import { alpha } from "@/lib/utils";
import { openCheckIn } from "@/screens/journal/state";
import { useApp, useQueryCtx } from "@/state/app";
import { Mark, Txt, useAppActive, useReduceMotion } from "@/ui";
import { ActionSheet } from "@/ui/components/Alert";
import { BAR_ROW, HeaderRow, useBarInset } from "@/ui/components/DetailHeader";
import { BackButton, BAR_BUTTON } from "@/ui/components/GlassButton";
import { usePress, usePressStyle } from "@/ui/components/press";
import { GlassMaterial, GlassTarget, LiquidGlass } from "@/ui/glass";
import { font } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { iosSpring } from "@/ui/motion/springs";
import { reduceMotionNow } from "@/ui/motion/system";
import { RiseEach } from "@/ui/motion/Rise";
import { CalmButton, CalmInput, useCalm, type CalmTint } from "@/screens/settings/calmKit";
import { toast } from "./ChatList";
import { DayCard, Evidence } from "./Evidence";
import { Prose } from "./Prose";

type DayDigest = Awaited<ReturnType<typeof dayDigest>>;
type Part = UIMessage["parts"][number];
type ToolPart = Part & { state: string; output?: unknown };

/** Each starter's family, for its glyph's colour. */
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
  sync: RefreshCw,
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

/** A just-sent bubble's spring: quick, with the faintest settle (0.42 s, 0.78), Messages'. */
const BUBBLE_IN = iosSpring(0.42, 0.78);
/** Air between two messages. */
const MESSAGE_GAP = 24;
/** Air kept around a message being edited when it is scrolled into view. */
const EDIT_GAP = 16;
/** The composer capsule's resting height (one line) and corner. */
const COMPOSER_H = 44;
/** The round send and stop buttons inside the capsule. */
const SEND = 36;

// ── Small pieces ─────────────────────────────────────────────────────────────

/** A blue dot that breathes while something runs (Reanimated, UI thread); still in the background and under Reduce motion. */
function LiveDot({ live }: { live: boolean }) {
  const c = useCalm();
  const active = useAppActive();
  const reduce = useReduceMotion();
  const o = useSharedValue(1);
  React.useEffect(() => {
    if (!live || !active || reduce) {
      cancelAnimation(o);
      o.set(1);
      return;
    }
    const ease = Easing.inOut(Easing.quad);
    o.set(withRepeat(withSequence(withTiming(0.3, { duration: 850, easing: ease }), withTiming(1, { duration: 850, easing: ease })), -1));
    return () => cancelAnimation(o);
  }, [live, active, reduce, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.8 + 0.2 * o.value }] }));
  return <Reanimated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.teal }, style]} />;
}

/** A grey line with the dot: tool progress, "Thinking…", a tool that failed. */
function Caption({ live, children }: { live?: boolean; children: string }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }} accessibilityLiveRegion={live ? "polite" : "none"}>
      <LiveDot live={!!live} />
      <Txt size={15} lineHeight={20} style={{ color: c.sub, flexShrink: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/** Whether two parts of a message draw the same: a text's words, a tool's state and output (useChat copies parts). */
function samePart(a: Part, b: Part): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "text") return a.text === (b as typeof a).text;
  if (!a.type.startsWith("tool-")) return true;
  const ta = a as ToolPart;
  const tb = b as ToolPart;
  return ta.state === tb.state && ta.output === tb.output;
}

/** One part of an answer: its words as plain text on the ground, a tool's progress line, or its evidence. */
const PartView = React.memo(
  function PartView({ part }: { part: Part }) {
    if (part.type === "text") return part.text.trim() ? <Prose text={part.text} /> : null;
    if (!part.type.startsWith("tool-")) return null;
    const name = part.type.slice(5);
    const tool = part as ToolPart;
    if (tool.state === "output-error") return <Caption>Couldn’t read that part of your data.</Caption>;
    if (tool.state !== "output-available") return <Caption live>{RUNNING[name] ?? "Looking at your data…"}</Caption>;
    if (name === "get_day")
      return (
        <View style={{ gap: 10 }}>
          <DayCard d={tool.output as DayDigest} />
          <Evidence name={name} output={tool.output} />
        </View>
      );
    return <Evidence name={name} output={tool.output} />;
  },
  (a, b) => samePart(a.part, b.part),
);

/** A quiet glyph button under an answer (Copy, Share, Regenerate): 36 px, settling and dimming under the finger. */
function GlyphButton({ label, onPress, disabled, icon: Icon }: { label: string; onPress: () => void; disabled?: boolean; icon: LucideIcon }) {
  const c = useCalm();
  const press = usePress(0.9);
  const pressed = usePressStyle(press, { rest: disabled ? 0.4 : 1, dim: 0.5 });
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <Reanimated.View style={[{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, pressed]}>
        <Icon size={17} color={c.sub} strokeWidth={2} />
      </Reanimated.View>
    </Pressable>
  );
}

const copy = (text: string) =>
  void Clipboard.setStringAsync(text).then(
    () => toast("Copied"),
    () => toast("Couldn’t copy that."),
  );

// ── Arrivals ─────────────────────────────────────────────────────────────────

/**
 * Which messages have made their entrance: the ones on screen when the chat opened start "arrived", so only a message
 * that comes in afterwards springs in, and only on its first mount (a cell the list re-mounts stays still).
 */
type Arrivals = { isNew: (id: string) => boolean; arrived: (id: string) => void };

function createArrivals(initial: readonly string[]): Arrivals {
  const done = new Set(initial);
  return {
    isNew: (id) => !done.has(id),
    arrived: (id) => {
      done.add(id);
    },
  };
}

/**
 * A message's entrance on the UI thread: the person's bubble rises and grows out of its bottom right corner on a spring;
 * an answer fades and lifts in. Nothing moves for a message that has arrived before, or under Reduce motion.
 */
function useArrival(id: string, arrivals: Arrivals, kind: "user" | "answer") {
  const [enter] = React.useState(() => arrivals.isNew(id) && !reduceMotionNow());
  const p = useSharedValue(enter ? 0 : 1);
  React.useEffect(() => {
    arrivals.arrived(id);
    if (enter) p.set(kind === "user" ? withSpring(1, BUBBLE_IN) : withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [arrivals, id, enter, kind, p]);
  return useAnimatedStyle(() =>
    kind === "user"
      ? { opacity: Math.min(1, p.value * 2.5), transform: [{ translateY: (1 - p.value) * 16 }, { scale: 0.82 + 0.18 * p.value }] }
      : { opacity: p.value, transform: [{ translateY: (1 - p.value) * 10 }] },
  );
}

// ── Messages ─────────────────────────────────────────────────────────────────

type UserRowProps = { m: UIMessage; busy: boolean; arrivals: Arrivals; onEdit: (id: string, text: string) => void; onEditing: (open: boolean) => void };

/**
 * The person's message: a blue bubble on the right (white words, its bottom right corner tucked in). A long press
 * offers Edit and Copy in an action sheet (and to screen readers as actions); Edit turns the bubble into a field with
 * Cancel and Save and send.
 */
const UserRow = React.memo(function UserRow({ m, busy, arrivals, onEdit, onEditing }: UserRowProps) {
  const c = useCalm();
  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const [draft, setDraft] = React.useState<string | null>(null);
  const [sheet, setSheet] = React.useState(false);
  const enter = useArrival(m.id, arrivals, "user");
  const press = usePress(0.97);
  const pressed = usePressStyle(press, { dim: 0.85 });
  const editing = draft !== null;
  // The chat keeps an open field clear of the keyboard and the composer.
  React.useEffect(() => {
    if (!editing) return;
    onEditing(true);
    return () => onEditing(false);
  }, [editing, onEditing]);
  const save = () => {
    const t = draft?.trim();
    if (!t || busy) return;
    setDraft(null);
    if (t !== text.trim()) onEdit(m.id, t);
  };
  if (draft !== null)
    return (
      <View style={{ marginLeft: 40, gap: 10 }}>
        <CalmInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
          accessibilityLabel="Edit your message"
          autoCorrect
          on="ground"
          style={{ maxHeight: 240, borderRadius: 20, paddingVertical: 11, fontSize: 16, lineHeight: 22 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <CalmButton variant="secondary" size="md" onPress={() => setDraft(null)}>
            Cancel
          </CalmButton>
          <CalmButton size="md" disabled={busy || !draft.trim()} onPress={save}>
            Save and send
          </CalmButton>
        </View>
      </View>
    );
  return (
    <Reanimated.View style={[{ alignSelf: "flex-end", maxWidth: "84%", marginLeft: 48, transformOrigin: "right bottom" }, enter]}>
      <Pressable
        onLongPress={() => {
          haptic.select();
          setSheet(true);
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="text"
        accessibilityLabel={`You: ${text}`}
        accessibilityActions={[
          { name: "edit", label: "Edit message" },
          { name: "copy", label: "Copy" },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "edit" && !busy) setDraft(text);
          if (e.nativeEvent.actionName === "copy") copy(text);
        }}
      >
        <Reanimated.View style={[{ borderRadius: 20, borderBottomRightRadius: 6, backgroundColor: c.teal, paddingHorizontal: 14, paddingVertical: 9 }, pressed]}>
          <Txt size={16} lineHeight={22} style={{ color: "#ffffff" }}>
            {text}
          </Txt>
        </Reanimated.View>
      </Pressable>
      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        actions={[
          { label: "Edit message", onPress: () => setDraft(text), disabled: busy },
          { label: "Copy", onPress: () => copy(text) },
        ]}
      />
    </Reanimated.View>
  );
});

type AssistantRowProps = { m: UIMessage; done: boolean; canRegenerate: boolean; arrivals: Arrivals; onRegenerate: (id: string) => void };

/** The coach's answer: its parts on the ground, then Copy, Share and (on the newest answer) Regenerate once it has finished. */
const AssistantRow = React.memo(function AssistantRow({ m, done, canRegenerate, arrivals, onRegenerate }: AssistantRowProps) {
  const text = plainText(m);
  const enter = useArrival(m.id, arrivals, "answer");
  return (
    <Reanimated.View style={[{ minWidth: 0, gap: 12 }, enter]}>
      {m.parts.map((p, i) => (
        <PartView key={i} part={p} />
      ))}
      {done && (!!text || canRegenerate) && (
        <View style={{ marginLeft: -9, marginTop: -4, flexDirection: "row", alignItems: "center" }}>
          {!!text && <GlyphButton label="Copy answer" icon={Copy} onPress={() => copy(text)} />}
          {!!text && <GlyphButton label="Share answer" icon={Share2} onPress={() => void Share.share({ message: text }).catch(() => {})} />}
          {canRegenerate && <GlyphButton label="Regenerate answer" icon={RotateCcw} onPress={() => onRegenerate(m.id)} />}
        </View>
      )}
    </Reanimated.View>
  );
});

// ── The empty chat ───────────────────────────────────────────────────────────

/** A starter question as a capsule chip: the family's glyph and the whole question (it wraps; never cut). */
function Chip({ icon: Icon, color, label, ink, onPress }: { icon: LucideIcon; color: string; label: string; ink?: string; onPress: () => void }) {
  const c = useCalm();
  const press = usePress(0.96);
  const pressed = usePressStyle(press, { dim: 0.7 });
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={label} style={{ maxWidth: "100%" }}>
      <Reanimated.View style={[{ minHeight: 44, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: c.card }, pressed]}>
        <Icon size={17} color={color} strokeWidth={2.2} />
        <Txt size={15} lineHeight={20} weight={500} style={{ color: ink ?? c.ink, flexShrink: 1 }}>
          {label}
        </Txt>
      </Reanimated.View>
    </Pressable>
  );
}

/**
 * The empty chat, centred: the mark in a card-coloured squircle, the question, what the coach does, then the starter
 * questions as capsule chips, one to a line, and the check-in; they rise in one after another as the chat opens.
 */
function Empty({ providerLabel, suggestions, onAsk, style, onLayout }: { providerLabel: string; suggestions: CoachSuggestion[]; onAsk: (text: string) => void; style?: StyleProp<ViewStyle>; onLayout?: (e: LayoutChangeEvent) => void }) {
  const c = useCalm();
  const { today } = useApp();
  return (
    <View onLayout={onLayout} style={[{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 24 }, style]}>
      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
        <Mark size={28} />
      </View>
      <Txt size={22} lineHeight={28} weight={700} align="center" accessibilityRole="header" style={{ marginTop: 18, color: c.ink }}>
        What would you like to know?
      </Txt>
      <Txt size={15} lineHeight={20} align="center" style={{ marginTop: 6, maxWidth: 340, color: c.sub }}>
        The coach looks up your own Halo numbers before it answers, using {providerLabel}. It’s not medical advice.
      </Txt>
      <View style={{ marginTop: 26, alignItems: "center", gap: 10, alignSelf: "stretch" }}>
        <RiseEach>
          {suggestions.map((s) => (
            <Chip key={s.key} icon={SUGGESTION_ICONS[s.key]} color={c.tintInk[SUGGESTION_TINTS[s.key]]} label={s.text} onPress={() => onAsk(s.text)} />
          ))}
          <Chip icon={NotebookPen} color={c.teal} ink={c.teal} label="Check in for today" onPress={() => openCheckIn(today)} />
        </RiseEach>
      </View>
    </View>
  );
}

// ── The bar ──────────────────────────────────────────────────────────────────

/** One glyph in the bar's glass capsule. */
const BAR_SLOT = 34;

/** The bar capsule's width for its glyphs: Chats and Coach settings, plus New chat while a saved chat is open. */
const barActionsWidth = (chatOpen: boolean) => 8 + BAR_SLOT * (chatOpen ? 3 : 2);

function BarIcon({ label, onPress, icon: Icon }: { label: string; onPress: () => void; icon: LucideIcon }) {
  const c = useCalm();
  const press = usePress(0.86);
  const pressed = usePressStyle(press, { dim: 0.6 });
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={label} hitSlop={{ top: 6, bottom: 6 }}>
      <Reanimated.View style={[{ width: BAR_SLOT, height: BAR_BUTTON, alignItems: "center", justifyContent: "center" }, pressed]}>
        <Icon size={19} color={c.ink} strokeWidth={2} />
      </Reanimated.View>
    </Pressable>
  );
}

/**
 * The bar's right side, iOS 26's grouped bar buttons: one Liquid Glass capsule holding Chats (its count read out),
 * New chat while a saved chat is open, and Coach settings.
 */
export function CoachBarActions({ chatCount, chatOpen, onNew }: { chatCount: number; chatOpen: boolean; onNew: () => void }) {
  const router = useRouter();
  return (
    <View style={{ height: BAR_BUTTON, width: barActionsWidth(chatOpen), borderRadius: BAR_BUTTON / 2, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 }}>
      <GlassMaterial />
      <BarIcon label={chatCount ? `Chats (${chatCount})` : "Chats"} icon={History} onPress={() => router.push("/coach/chats" as Href)} />
      {chatOpen && <BarIcon label="New chat" icon={MessageSquarePlus} onPress={onNew} />}
      <BarIcon label="Coach settings" icon={Settings2} onPress={() => router.push("/coach/settings" as Href)} />
    </View>
  );
}

export type ChatBarProps = { onBack: () => void; chatCount: number; chatOpen: boolean; onNew: () => void; providerLabel: string };

/**
 * The floating bar over the chat: the glass back button, "Coach" centred with the provider under it when it fits, and
 * the glass capsule of actions; behind it the scroll edge (the ground, solid under the status bar, fading out below
 * the buttons), so messages soften as they pass under. Render it in a GlassTarget's overlay.
 */
export function ChatBar({ onBack, chatCount, chatOpen, onNew, providerLabel }: ChatBarProps) {
  const c = useCalm();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const edge = insets.top + BAR_ROW + 20;
  // The title's room between the bar's two equal sides; the provider shows under it when its words fit there.
  const room = width - 2 * (16 + barActionsWidth(chatOpen) + 8);
  const sub = providerLabel.length * 7 <= room;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
      <LinearGradient
        pointerEvents="none"
        colors={[c.ground, alpha(c.ground, 0.94), alpha(c.ground, 0.6), alpha(c.ground, 0)]}
        locations={[0, insets.top / edge, (insets.top + BAR_ROW * 0.7) / edge, 1]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: edge }}
      />
      <View pointerEvents="box-none" style={{ paddingTop: insets.top }}>
        <HeaderRow
          left={<BackButton onPress={onBack} />}
          center={
            <View style={{ alignItems: "center" }}>
              <Txt size={17} lineHeight={22} weight={600} align="center" accessibilityRole="header" style={{ color: c.ink }}>
                Coach
              </Txt>
              {sub && (
                <Txt size={12} lineHeight={16} align="center" style={{ color: c.sub }}>
                  {providerLabel}
                </Txt>
              )}
            </View>
          }
          right={<CoachBarActions chatCount={chatCount} chatOpen={chatOpen} onNew={onNew} />}
        />
      </View>
    </View>
  );
}

// ── The composer ─────────────────────────────────────────────────────────────

/** The round button at the capsule's right: Send (blue, white arrow; grey until there is something to send) or Stop. */
function ComposerButton({ variant, onPress, disabled, label }: { variant: "send" | "stop"; onPress: () => void; disabled?: boolean; label: string }) {
  const c = useCalm();
  const press = usePress(0.88);
  const pressed = usePressStyle(press, { dim: 0.75 });
  const bg = variant === "stop" ? c.ink : disabled ? c.fill : c.teal;
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={disabled ? { disabled: true } : undefined} hitSlop={4}>
      <Reanimated.View style={[{ width: SEND, height: SEND, borderRadius: SEND / 2, alignItems: "center", justifyContent: "center", backgroundColor: bg }, pressed]}>
        {variant === "stop" ? <Square size={13} color={c.card} fill={c.card} strokeWidth={2} /> : <ArrowUp size={20} color={disabled ? c.tertiary : "#ffffff"} strokeWidth={2.6} />}
      </Reanimated.View>
    </Pressable>
  );
}

type ComposerProps = {
  inputRef: React.RefObject<TextInput | null>;
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  bottom: number;
  onHeight: (h: number) => void;
};

/**
 * The composer, pinned to the foot and riding the keyboard (8 px over it: the safe-area padding is under the keyboard
 * then): a Liquid Glass capsule holding the growing field and the round button, over a fade into the ground so the
 * messages scrolling under the margins soften while the glass bends what passes beneath it.
 */
function Composer({ inputRef, value, onChange, onSend, onStop, busy, bottom, onHeight }: ComposerProps) {
  const c = useCalm();
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: bottom - 8 }} pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <LinearGradient pointerEvents="none" colors={[alpha(c.ground, 0), alpha(c.ground, 0.85), c.ground]} locations={[0, 0.55, 1]} style={{ position: "absolute", left: 0, right: 0, top: -12, bottom: 0 }} />
      <View style={{ paddingHorizontal: 12, paddingBottom: bottom }} onLayout={(e) => onHeight(e.nativeEvent.layout.height - bottom)}>
        <LiquidGlass cornerRadius={COMPOSER_H / 2} style={{ minHeight: COMPOSER_H, flexDirection: "row", alignItems: "flex-end", paddingLeft: 16, paddingRight: 4, paddingVertical: 4, gap: 6 }}>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChange}
            multiline
            maxLength={2000}
            placeholder="Message Coach"
            placeholderTextColor={c.sub}
            accessibilityLabel="Ask Coach"
            returnKeyType="send"
            submitBehavior="submit"
            onSubmitEditing={onSend}
            cursorColor={c.teal}
            selectionColor={alpha(c.teal, 0.3)}
            allowFontScaling={false}
            style={[{ flex: 1, minWidth: 0, minHeight: SEND, maxHeight: 160, paddingVertical: 7, paddingHorizontal: 0, fontSize: 16, lineHeight: 22, color: c.ink, textAlignVertical: "center" }, font.sans(400)]}
          />
          {busy ? <ComposerButton variant="stop" onPress={onStop} label="Stop" /> : <ComposerButton variant="send" disabled={!value.trim()} onPress={onSend} label="Send" />}
        </LiquidGlass>
      </View>
    </KeyboardStickyView>
  );
}

// ── The list's scroll view ───────────────────────────────────────────────────

/** The scroll view's methods the chat calls (react-native-keyboard-controller's chat scroll view, a Reanimated ScrollView). */
type ChatScroller = {
  scrollToEnd: (o?: { animated?: boolean }) => void;
  scrollTo: (o: { x?: number; y?: number; animated?: boolean }) => void;
  measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void;
};

type ChatScrollProps = ScrollViewProps & { onScroller: (node: Reanimated.ScrollView | null) => void; onEndVisible: (visible: boolean) => void };

/**
 * The FlatList's scroll component: the keyboard-aware chat scroll view, which lifts the messages with the keyboard on
 * the UI thread. FlatList assigns its own ref to it; the chat gets the same view through `onScroller` (scrolling to the
 * end goes through it, so the keyboard's inset is counted).
 */
const ChatScrollView = React.forwardRef<Reanimated.ScrollView, ChatScrollProps>(function ChatScrollView({ onScroller, onEndVisible, ...props }, ref) {
  const both = React.useCallback(
    (node: Reanimated.ScrollView | null) => {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
      onScroller(node);
    },
    [ref, onScroller],
  );
  return <KeyboardChatScrollView ref={both} automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" onEndVisible={onEndVisible} {...props} />;
});

const Gap = () => <View style={{ height: MESSAGE_GAP }} />;
const keyOf = (m: UIMessage) => m.id;

// ── The chat ─────────────────────────────────────────────────────────────────

export type CoachProps = ChatBarProps & {
  id: string;
  initial: UIMessage[];
  /** Fills the composer without sending (`?q=`). */
  prefill: string;
  /** Sends `prefill` at once (`?brief=1`). */
  auto: boolean;
  suggestions: CoachSuggestion[];
  /** After the first answer of a new chat: the screen records the chat's id (the web's `/coach?c=`). */
  onSaved: (id: string) => void;
};

export function Coach({ id, initial, prefill, auto, providerLabel, suggestions, onSaved, onBack, chatCount, chatOpen, onNew }: CoachProps) {
  const c = useCalm();
  const insets = useSafeAreaInsets();
  const top = useBarInset();
  const ctx = useQueryCtx();
  // The transport reads the person's context when a turn starts.
  setCoachContext(ctx);
  const [input, setInput] = React.useState(prefill);
  const [error, setError] = React.useState<string | null>(null);
  const [composerH, setComposerH] = React.useState(COMPOSER_H);
  const composer = React.useRef<TextInput>(null);
  const scroller = React.useRef<ChatScroller | null>(null);
  const animated = useAnimatedRef<Reanimated.ScrollView>();
  const offset = useScrollOffset(animated);
  const atEnd = React.useRef(true);
  const editors = React.useRef(0);
  const [arrivals] = React.useState(() => createArrivals(initial.map((m) => m.id)));
  // A saved chat renders whole on open (up to 40 messages), so it lands exactly at its end; longer ones virtualise.
  const [firstBatch] = React.useState(() => Math.min(Math.max(10, initial.length), 40));
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
    if (atEnd.current) requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
  }, [messages.length, status]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    haptic.select();
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

  // The rows' callbacks never change identity (so a streaming chunk re-renders no other row): they read the latest
  // chat helpers and state through a ref, refreshed after each render.
  const latest = React.useRef({ busy, sendMessage, regenerate });
  React.useLayoutEffect(() => {
    latest.current = { busy, sendMessage, regenerate };
  });
  const edit = React.useCallback((messageId: string, text: string) => {
    if (latest.current.busy) return;
    setError(null);
    void latest.current.sendMessage({ text, messageId });
  }, []);
  /** A new answer to the newest question: the last answer (Regenerate), or the one that failed (Retry). */
  const again = React.useCallback((messageId?: string) => {
    if (latest.current.busy) return;
    setError(null);
    void latest.current.regenerate(messageId ? { messageId } : undefined);
  }, []);
  const onEditing = React.useCallback((open: boolean) => {
    editors.current += open ? 1 : -1;
  }, []);

  // Whether the newest message is in view, from the UI thread: React hears only when that changes, not every scroll.
  const onEndVisible = React.useCallback((visible: boolean) => {
    atEnd.current = visible;
  }, []);
  const onScroller = React.useCallback(
    (node: Reanimated.ScrollView | null) => {
      scroller.current = node as unknown as ChatScroller | null;
      animated(node);
    },
    [animated],
  );
  const renderScroll = React.useCallback((props: ScrollViewProps) => <ChatScrollView {...props} onScroller={onScroller} onEndVisible={onEndVisible} />, [onScroller, onEndVisible]);

  // A message being edited stays in view over the keyboard and the composer: once the keyboard has opened, the list
  // scrolls just enough to show the whole field (the composer's own field is left alone).
  const keyboard = useReanimatedKeyboardAnimation();
  const reveal = React.useCallback(() => {
    if (editors.current <= 0) return;
    const field = TextInput.State.currentlyFocusedInput();
    const sv = scroller.current;
    if (!field || !sv || (field as unknown) === composer.current) return;
    sv.measureInWindow((_sx, sy, _sw, sh) => {
      field.measureInWindow((_x, y, _w, h) => {
        const bottom = sy + sh - (Math.max(0, -keyboard.height.get()) + composerH + 8);
        const head = sy + top;
        const now = offset.get();
        const next = y + h + EDIT_GAP > bottom ? now + (y + h + EDIT_GAP - bottom) : y < head + EDIT_GAP ? now - (head + EDIT_GAP - y) : now;
        if (Math.abs(next - now) >= 1) sv.scrollTo({ y: Math.max(0, next), animated: true });
      });
    });
  }, [keyboard, composerH, top, offset]);
  // Focus lands in JS (TextInput.State) a moment after the native keyboard event: check once that has caught up.
  const soon = React.useCallback(() => {
    setTimeout(reveal, 32);
  }, [reveal]);
  useKeyboardHandler(
    {
      onEnd: (e) => {
        "worklet";
        if (e.height > 0) scheduleOnRN(soon);
      },
    },
    [soon],
  );

  const lastId = messages.at(-1)?.id ?? null;
  const lastAnswer = messages.at(-1)?.role === "assistant" ? lastId : null;
  const renderItem = React.useCallback(
    ({ item }: ListRenderItemInfo<UIMessage>) =>
      item.role === "user" ? (
        <UserRow m={item} busy={busy} arrivals={arrivals} onEdit={edit} onEditing={onEditing} />
      ) : (
        <AssistantRow m={item} done={!busy || item.id !== lastId} canRegenerate={!busy && item.id === lastAnswer} arrivals={arrivals} onRegenerate={again} />
      ),
    [busy, lastId, lastAnswer, arrivals, edit, again, onEditing],
  );
  const bottom = Math.max(insets.bottom, 12);
  const empty = messages.length === 0;

  const footer =
    status === "submitted" || error ? (
      <View style={{ marginTop: MESSAGE_GAP, gap: 16 }}>
        {status === "submitted" && <Caption live>Thinking…</Caption>}
        {error && (
          <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, backgroundColor: c.tint.rose, paddingVertical: 10, paddingRight: 10, paddingLeft: 16 }}>
            <Txt size={15} lineHeight={20} style={{ flex: 1, minWidth: 0, color: c.ink }}>
              {error}
            </Txt>
            <CalmButton size="sm" icon={RotateCcw} disabled={busy} onPress={() => again()}>
              Retry
            </CalmButton>
          </View>
        )}
      </View>
    ) : null;

  return (
    <GlassTarget
      style={{ flex: 1 }}
      overlay={
        <>
          <ChatBar onBack={onBack} chatCount={chatCount} chatOpen={chatOpen} onNew={onNew} providerLabel={providerLabel} />
          <Composer inputRef={composer} value={input} onChange={setInput} onSend={() => send(input)} onStop={() => stop()} busy={busy} bottom={bottom} onHeight={setComposerH} />
        </>
      }
    >
      {/* The list keeps its size; with the keyboard it gains room at its foot and lifts its content with the keyboard
          (the chat scroll view, on the UI thread), so the newest message stays over the composer. Dragging the list
          closes the keyboard. Only the empty state fills the screen (to centre itself): a chat keeps its own height, so
          a short one stays where it is when the keyboard opens instead of scrolling away. */}
      <FlatList
        data={messages}
        keyExtractor={keyOf}
        renderItem={renderItem}
        renderScrollComponent={renderScroll}
        ItemSeparatorComponent={Gap}
        ListEmptyComponent={<Empty providerLabel={providerLabel} suggestions={suggestions} onAsk={send} />}
        ListFooterComponent={footer}
        initialNumToRender={firstBatch}
        maxToRenderPerBatch={8}
        windowSize={11}
        removeClippedSubviews={false}
        onContentSizeChange={() => atEnd.current && scroller.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        accessibilityLabel="Chat with Halo’s coach"
        contentContainerStyle={{ flexGrow: empty ? 1 : 0, paddingHorizontal: 16, paddingTop: top + 12, paddingBottom: composerH + bottom + 24 }}
      />
    </GlassTarget>
  );
}
