// iOS's alerts, three ways. `Alert` is the inline notice a screen shows in its flow (a soft card in a family's colour).
// `AlertDialog` is the modal alert (iOS 26's): a rounded card over a soft dim with the title, a sentence and capsule
// buttons, popping in from a touch larger on a spring and fading out. `ActionSheet` is the action sheet: a card of
// choices and a separate Cancel card rising from the foot of the screen on a spring. Both modals render in the app's
// overlay layer (Overlay.tsx), close on Android's back and a tap on the dim, and run every frame of their motion on the
// UI thread (Reanimated); under Reduce motion they only fade.
import * as React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import { alpha } from "@/lib/utils";
import { useCalm, type CalmTint } from "@/ui/calm";
import { iosSpring } from "@/ui/motion/springs";
import { reduceMotionNow } from "@/ui/motion/system";
import { useTheme } from "@/ui/ThemeProvider";
import { IconTile } from "./calmKit";
import { OverlayModal } from "./Overlay";
import { usePress, usePressStyle } from "./press";
import { Txt } from "./Text";

export type AlertProps = {
  variant?: "default" | "destructive";
  icon?: LucideIcon;
  title?: string;
  description?: string | React.ReactNode;
  /** Top-right action (the web's AlertAction). */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * The inline alert: a soft card in the family's fill (pink for `destructive`, blue otherwise) with 20 px corners, the
 * icon in the family's solid square, the title in ink (red when destructive) and the description as a grey sentence.
 * The action sits top right.
 */
export function Alert({ variant = "default", icon: Icon, title, description, action, style, children }: AlertProps) {
  const c = useCalm();
  const tint: CalmTint = variant === "destructive" ? "rose" : "sky";
  return (
    <View accessibilityRole="alert" style={[{ flexDirection: "row", gap: 12, borderRadius: 20, backgroundColor: c.tint[tint], padding: 14, paddingRight: action ? 72 : 14 }, style]}>
      {Icon && <IconTile icon={<Icon size={18} color="#ffffff" strokeWidth={2.2} />} tint={tint} size={32} iconSize={18} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2, justifyContent: "center" }}>
        {title && (
          <Txt size={15} lineHeight={20} weight={600} color={variant === "destructive" ? c.system.red : c.ink}>
            {title}
          </Txt>
        )}
        {typeof description === "string" ? (
          <Txt size={15} lineHeight={20} color={c.sub}>
            {description}
          </Txt>
        ) : (
          description
        )}
        {children}
      </View>
      {action && <View style={{ position: "absolute", top: 8, right: 8 }}>{action}</View>}
    </View>
  );
}

// ── The modal alert ──────────────────────────────────────────────────────────

export type AlertAction = {
  label: string;
  onPress: () => void;
  /** iOS's action styles: `default` the filled blue capsule, `cancel` the quiet grey one, `destructive` red. */
  style?: "default" | "cancel" | "destructive";
  disabled?: boolean;
  /** A spinner beside the label while the action runs. */
  busy?: boolean;
};

export type AlertDialogProps = {
  open: boolean;
  /** Android's back and a tap on the dim; never called while `locked`. */
  onClose: () => void;
  title: string;
  /** A sentence (a long one scrolls inside the card), or any node. */
  message?: React.ReactNode;
  /** A red line under the message: the action failed. */
  error?: string | null;
  /** In iOS's order: the actions, then Cancel. Two short ones sit side by side, Cancel on the left. */
  actions: AlertAction[];
  /** Blocks closing while an action runs. */
  locked?: boolean;
  /** `row`: the buttons side by side; `stack`: one under another. Default: side by side when two short labels fit. */
  layout?: "row" | "stack";
};

/** The alert's pop: a quick spring with a faint settle, iOS's (0.36 s, 0.8). */
const POP = iosSpring(0.36, 0.8);
/** How much larger the alert starts than it rests. */
const POP_FROM = 1.12;
/** The fade in and out, ms. */
const FADE_IN = 140;
const FADE_OUT = 170;
/** A label this short lets two buttons share a row. */
const SHORT_LABEL = 12;
/** A message this long reads better left-aligned than centred. */
const LONG_MESSAGE = 160;

/** Whether two buttons with these labels sit side by side (iOS's two-button alert), or stack. */
export const fitsRow = (labels: string[]) => labels.length === 2 && labels.every((l) => l.length <= SHORT_LABEL);

/**
 * Mounts while `open` and for its exit, and drives the two shared values every modal here animates on: `fade` (the dim
 * and the card's opacity) and `enter` (the spring that moves the card in). Returns null in place of the children once
 * the exit has finished.
 */
function useModalPresence(open: boolean) {
  const [shown, setShown] = React.useState(open);
  // Mounted during render on open, so the first frame already has the modal.
  if (open && !shown) setShown(true);
  const fade = useSharedValue(0);
  const enter = useSharedValue(0);
  const unmount = React.useCallback(() => setShown(false), []);
  return { shown, fade, enter, unmount };
}

function AlertButton({ action, row }: { action: AlertAction; row: boolean }) {
  const c = useCalm();
  const press = usePress(0.96);
  const style = action.style ?? "default";
  const red = c.system.red;
  const bg = style === "default" ? c.teal : style === "destructive" ? alpha(red, 0.15) : c.fill;
  const ink = style === "default" ? "#ffffff" : style === "destructive" ? red : c.ink;
  const pressed = usePressStyle(press, { rest: action.disabled && !action.busy ? 0.45 : 1, dim: style === "default" ? 0.8 : 0.6 });
  return (
    <Pressable
      onPress={action.onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={action.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!action.disabled, busy: !!action.busy }}
      style={row ? { flex: 1 } : undefined}
    >
      <Animated.View style={[{ minHeight: 48, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: bg }, pressed]}>
        {action.busy && <ActivityIndicator size="small" color={ink} />}
        <Txt size={17} lineHeight={22} weight={style === "cancel" ? 500 : 600} align="center" style={{ color: ink, flexShrink: 1 }}>
          {action.label}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The modal alert, iOS 26's: a card (32 px corners) over the dim with the centred bold title, the message in grey, an
 * optional red error, then capsule buttons. It pops in from 112 % on a spring as it fades in, and fades out on close.
 */
export function AlertDialog({ open, onClose, title, message, error, actions, locked = false, layout }: AlertDialogProps) {
  const c = useCalm();
  const { c: t, scheme } = useTheme();
  const { width, height } = useWindowDimensions();
  const { shown, fade, enter, unmount } = useModalPresence(open);

  React.useEffect(() => {
    if (!shown) return;
    if (open) {
      fade.set(withTiming(1, { duration: FADE_IN, easing: Easing.out(Easing.quad) }));
      if (reduceMotionNow()) enter.set(1);
      else if (enter.get() === 0) enter.set(withSpring(1, POP));
      return;
    }
    fade.set(
      withTiming(0, { duration: FADE_OUT, easing: Easing.out(Easing.quad) }, (done) => {
        "worklet";
        if (!done) return;
        enter.set(0);
        scheduleOnRN(unmount);
      }),
    );
  }, [open, shown, fade, enter, unmount]);

  const dim = useAnimatedStyle(() => ({ opacity: fade.value }));
  const card = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: interpolate(enter.value, [0, 1], [POP_FROM, 1]) }],
  }));
  if (!shown) return null;

  const close = () => !locked && onClose();
  const row = layout ? layout === "row" : fitsRow(actions.map((a) => a.label));
  // Side by side, Cancel leads; stacked, it comes last.
  const ordered = row ? [...actions].sort((a, b) => Number(b.style === "cancel") - Number(a.style === "cancel")) : [...actions].sort((a, b) => Number(a.style === "cancel") - Number(b.style === "cancel"));
  const long = typeof message === "string" && message.length > LONG_MESSAGE;
  return (
    <OverlayModal onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.dim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Animated.View
          accessibilityViewIsModal
          style={[
            { width: Math.min(320, width - 56), borderRadius: 32, backgroundColor: scheme === "dark" ? c.chip : c.card, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, gap: 18 },
            { boxShadow: scheme === "dark" ? "0 16px 48px rgba(0,0,0,0.5)" : "0 16px 48px rgba(0,0,0,0.16)" },
            card,
          ]}
        >
          <View style={{ gap: 6, paddingHorizontal: 4 }}>
            <Txt size={17} lineHeight={22} weight={600} align="center" accessibilityRole="header" style={{ color: c.ink }}>
              {title}
            </Txt>
            {typeof message === "string" ? (
              // A long message (release notes) scrolls inside the card.
              <ScrollView style={{ maxHeight: height * 0.45 }} contentContainerStyle={{ flexGrow: 0 }} bounces={false}>
                <Txt size={15} lineHeight={20} align={long ? "left" : "center"} style={{ color: c.sub }}>
                  {message}
                </Txt>
              </ScrollView>
            ) : (
              message
            )}
            {!!error && (
              <Txt size={15} lineHeight={20} align="center" accessibilityRole="alert" style={{ color: c.system.red }}>
                {error}
              </Txt>
            )}
          </View>
          <View style={row ? { flexDirection: "row", gap: 10 } : { gap: 10 }}>
            {ordered.map((a) => (
              <AlertButton key={a.label} action={a} row={row} />
            ))}
          </View>
        </Animated.View>
      </View>
    </OverlayModal>
  );
}

// ── The action sheet ─────────────────────────────────────────────────────────

export type SheetAction = { label: string; onPress: () => void; destructive?: boolean; disabled?: boolean };

/** The sheet's rise: unhurried with the faintest settle (0.42 s, 0.88). */
const RISE = iosSpring(0.42, 0.88);
const SHEET_RADIUS = 24;

function SheetRow({ action, first, onDone }: { action: SheetAction; first: boolean; onDone: () => void }) {
  const c = useCalm();
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { rest: action.disabled ? 0.45 : 1, dim: 0.55 });
  return (
    <Pressable
      onPress={() => {
        onDone();
        action.onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={action.disabled}
      accessibilityRole="button"
    >
      <Animated.View style={[{ minHeight: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.line }, pressed]}>
        <Txt size={18} lineHeight={23} weight={action.destructive ? 500 : 400} align="center" style={{ color: action.destructive ? c.system.red : c.teal }}>
          {action.label}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The action sheet, iOS's: a card of choices (an optional grey title and message on top, a destructive choice in red)
 * and a separate bold Cancel card, rising from the foot of the screen on a spring over the dim. A choice closes the
 * sheet and runs; Cancel, the dim and Android's back close it.
 */
export function ActionSheet({ open, onClose, title, message, actions, cancelLabel = "Cancel" }: { open: boolean; onClose: () => void; title?: string; message?: string; actions: SheetAction[]; cancelLabel?: string }) {
  const c = useCalm();
  const { c: t, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const { shown, fade, enter, unmount } = useModalPresence(open);
  const h = useSharedValue(0);
  const face = scheme === "dark" ? c.chip : c.card;
  // Under Reduce motion the sheet stays in place and only fades.
  const [still] = React.useState(reduceMotionNow);

  // The rise starts once the sheet's height is known (its first layout), so it travels exactly its own height.
  const rise = React.useCallback(() => enter.set(still ? 1 : withSpring(1, RISE)), [enter, still]);
  React.useEffect(() => {
    if (!shown) return;
    if (open) {
      fade.set(withTiming(1, { duration: FADE_IN }));
      if (h.get() > 0 && enter.get() < 1) rise();
      return;
    }
    const gone = (done?: boolean) => {
      "worklet";
      if (!done) return;
      h.set(0);
      enter.set(0);
      scheduleOnRN(unmount);
    };
    if (still) {
      fade.set(withTiming(0, { duration: FADE_OUT }, gone));
      return;
    }
    fade.set(withTiming(0, { duration: 220 }));
    enter.set(withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }, gone));
  }, [open, shown, still, fade, enter, h, rise, unmount]);

  const dim = useAnimatedStyle(() => ({ opacity: fade.value }));
  const sheet = useAnimatedStyle(() => ({
    opacity: still ? fade.value : 1,
    transform: [{ translateY: (1 - enter.value) * (h.value > 0 ? h.value + insets.bottom + 16 : screen) }],
  }));
  if (!shown) return null;

  return (
    <OverlayModal onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.dim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 10, paddingBottom: Math.max(insets.bottom, 10) + 6 }}>
        <Animated.View
          accessibilityViewIsModal
          onLayout={(e) => {
            const first = h.get() === 0;
            h.set(e.nativeEvent.layout.height);
            if (first && open) rise();
          }}
          style={[{ gap: 8 }, sheet]}
        >
          <View style={{ borderRadius: SHEET_RADIUS, backgroundColor: face, overflow: "hidden" }}>
            {(title || message) && (
              <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 2 }}>
                {title ? (
                  <Txt size={13} lineHeight={18} weight={600} align="center" accessibilityRole="header" style={{ color: c.sub }}>
                    {title}
                  </Txt>
                ) : null}
                {message ? (
                  <Txt size={13} lineHeight={18} align="center" style={{ color: c.sub }}>
                    {message}
                  </Txt>
                ) : null}
              </View>
            )}
            {actions.map((a, i) => (
              <SheetRow key={a.label} action={a} first={i === 0 && !title && !message} onDone={onClose} />
            ))}
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 56, borderRadius: SHEET_RADIUS, backgroundColor: face, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
            <Txt size={18} lineHeight={23} weight={600} style={{ color: c.teal }}>
              {cancelLabel}
            </Txt>
          </Pressable>
        </Animated.View>
      </View>
    </OverlayModal>
  );
}
