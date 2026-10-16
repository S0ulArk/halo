// The form primitives the Journal uses (the web's shadcn Badge, Toggle, Input, Switch, Dialog) in the iOS
// look, plus the toast and haptic the web's sonner and haptic() give: tinted capsule tags, the check-in's No / Yes
// capsules (the quiet fill, blue when Yes is chosen and ink when No is), iOS's fields with the label above, its switch,
// and the iOS alert: a centred card that springs in over the dim, its actions as full-width rows divided by
// hairlines. Every colour comes from useCalm(); every press and transition runs on the UI thread.
import * as React from "react";
import { Platform, Pressable, StyleSheet, TextInput, ToastAndroid, useWindowDimensions, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { OverlayModal } from "@/ui/components/Overlay";
import { usePress, usePressStyle } from "@/ui/components/press";
import { iosSpring } from "@/ui/motion/springs";
import { reduceMotionNow } from "@/ui/motion/system";
import * as Haptics from "expo-haptics";
import { Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { haptic as tick } from "@/ui/motion/haptics";
import { useTheme } from "@/ui/ThemeProvider";
import { CalmChip, CalmField, CalmInput, CalmSwitch, useCalm, type CalmTint, type On } from "../settings/calmKit";

const PressableView = Animated.createAnimatedComponent(Pressable);

/** sonner's toast on Android: a short system toast. */
export function toast(message: string) {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
}

/** The web's haptic() on a saved check-in. */
export const haptic = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

/** A behaviour's tag: a capsule in the family's soft fill (green by default) with its colour. Wraps rather than cut. */
export function TagBadge({ children, tint = "mint" }: { children: string; tint?: CalmTint }) {
  const c = useCalm();
  return (
    <View style={{ minHeight: 26, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 4, justifyContent: "center", backgroundColor: c.tint[tint], flexShrink: 1 }}>
      <Txt size={13} lineHeight={18} weight={600} style={{ color: c.tintInk[tint] }}>
        {children}
      </Txt>
    </View>
  );
}

/**
 * One answer of the check-in's pair: a capsule in the quiet fill that fills its colour when chosen (a short cross-fade
 * on the UI thread, a selection tick); its width never changes, so the row beside it never reflows. Settles and dims
 * while pressed.
 */
function Answer({ word, chosen, color, ink, onPress, grow }: { word: string; chosen: boolean; color: string; ink: string; onPress: () => void; grow: boolean }) {
  const c = useCalm();
  const sel = useSharedValue(chosen ? 1 : 0);
  React.useEffect(() => {
    sel.set(reduceMotionNow() ? (chosen ? 1 : 0) : withTiming(chosen ? 1 : 0, { duration: 160 }));
  }, [chosen, sel]);
  const press = usePress(0.94);
  const pressed = usePressStyle(press, { dim: 0.75 });
  const face = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(sel.value, [0, 1], [c.fill, color]) }), [c.fill, color]);
  const words = useAnimatedStyle(() => ({ color: interpolateColor(sel.value, [0, 1], [c.ink, ink]) }), [c.ink, ink]);
  return (
    <PressableView
      onPress={() => {
        tick.select();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="radio"
      accessibilityLabel={word}
      accessibilityState={{ checked: chosen }}
      hitSlop={4}
      style={[{ minHeight: 40, minWidth: 64, paddingHorizontal: 14, borderRadius: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, grow && { flex: 1 }, face, pressed]}
    >
      <Animated.Text style={[font.sans(600), { fontSize: 16, lineHeight: 20, letterSpacing: -0.25, includeFontPadding: false }, words]}>{word}</Animated.Text>
    </PressableView>
  );
}

/**
 * The check-in's No / Yes pair, iOS's: two capsules side by side, in the quiet fill until chosen; Yes chosen fills
 * blue, No chosen fills ink. Tapping the chosen one clears it (Radix single toggle), so an unanswered behaviour stays
 * unanswered rather than "No". `compact` keeps the pair at its own width (beside a row's name); otherwise it fills the
 * row. `on` is kept for API compatibility: the translucent fill reads on any surface.
 */
export function YesNo({ value, onChange, label, compact = false }: { value: number | undefined; onChange: (v: number | undefined) => void; label: string; on?: On; compact?: boolean }) {
  const c = useCalm();
  const no = value === 0;
  const yes = value !== undefined && value > 0;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", gap: 6 }}>
      <Answer word="No" chosen={no} color={c.ink} ink={c.card} grow={!compact} onPress={() => onChange(no ? undefined : 0)} />
      <Answer word="Yes" chosen={yes} color={c.teal} ink="#ffffff" grow={!compact} onPress={() => onChange(yes ? undefined : 1)} />
    </View>
  );
}

/** The log sheets' chips: 44 px capsules in the quiet fill, solid blue when chosen, single or multiple. */
export function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [string, string, ...unknown[]])[];
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const multi = Array.isArray(value);
  const isOn = (v: string) => (multi ? value.includes(v) : value === v);
  const press = (v: string) => {
    if (multi) onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    else onChange(value === v ? "" : v);
  };
  return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(([v, l]) => (
        <CalmChip key={v} label={l} selected={isOn(v)} onPress={() => press(v)} role={multi ? "checkbox" : "radio"} on="card" />
      ))}
    </View>
  );
}

/**
 * A Calm text field: 52 px, 16 px corners, the ground's grey on a white card or sheet, a teal edge while focused and a
 * rose one when invalid. `numeric` sets typed numbers (amounts, times, dates) in the numeric face.
 */
export const TextField = React.forwardRef<TextInput, TextInputProps & { invalid?: boolean; numeric?: boolean; on?: On; style?: StyleProp<TextStyle> }>(function TextField({ invalid, numeric, on = "card", style, ...props }, ref) {
  return <CalmInput ref={ref} invalid={invalid} numeric={numeric} on={on} style={style} {...props} />;
});

/** A labelled field: the label above with a grey hint ("(ml)"), then the control. */
export function Field({ label, hint, children, style }: { label: string; hint?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <CalmField label={label} hint={hint} style={style}>
      {children}
    </CalmField>
  );
}

/** iOS's switch (green when on, the white knob springing across); the hit area is 48 px tall. */
export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <CalmSwitch value={value} onChange={onChange} label={label} />;
}

/** The inline alert the sheets use: a soft red block with red words, and an optional action beside it. */
export function ErrorAlert({ children, action }: { children: string; action?: React.ReactNode }) {
  const c = useCalm();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 14, backgroundColor: c.tint.rose, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Txt size={14} lineHeight={19} weight={500} style={{ color: c.tintInk.rose, flexShrink: 1 }}>
        {children}
      </Txt>
      {action}
    </View>
  );
}

/**
 * An alert's action, iOS's: a full-width 48 px row with its word centred in blue (red for the destructive one, which
 * iOS sets in the regular weight), the row greying while pressed.
 */
export function DialogAction({ label, onPress, danger, disabled }: { label: string; onPress: () => void; /** The web's bordered face for the destructive action; iOS draws both as plain rows. */ variant?: "secondary" | "outline"; danger?: boolean; disabled?: boolean }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1, backgroundColor: pressed ? c.fill : "transparent" })}
    >
      <Txt size={17} lineHeight={22} weight={danger ? 400 : 600} align="center" style={{ color: danger ? c.system.red : c.teal }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** The alert's entrance: iOS's, a quick spring from a touch larger with no visible bounce, the fade alongside. */
const ALERT_IN = iosSpring(0.32, 0.9);

/**
 * The web's confirm ("Discard changes?", "Delete this entry?") as iOS's alert: a centred 290 px card (the sheet's
 * material, 16 px corners) over the dim, the title and sentence centred, then the actions as full-width rows divided by
 * hairlines (`flex-col-reverse`: the last one on top). It springs in from 108 % and fades out, on the UI thread.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  actions: React.ReactNode[];
}) {
  const theme = useTheme();
  const c = useCalm();
  const { width } = useWindowDimensions();
  const fade = useSharedValue(0);
  const scale = useSharedValue(1.08);
  const [shown, setShown] = React.useState(open);
  // Mount on open while rendering (no effect-driven setState); unmount once the fade-out ends.
  if (open && !shown) setShown(true);
  React.useEffect(() => {
    const still = reduceMotionNow();
    if (open) {
      fade.set(withTiming(1, { duration: still ? 0 : 160 }));
      scale.set(still ? 1 : withSpring(1, ALERT_IN));
    } else {
      scale.set(1);
      fade.set(withTiming(0, { duration: still ? 0 : 140 }, (done) => {
        if (done) scheduleOnRN(setShown, false);
      }));
    }
  }, [open, fade, scale]);
  const dim = useAnimatedStyle(() => ({ opacity: fade.value }));
  const card = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: scale.value }] }));
  if (!shown) return null;
  return (
    <OverlayModal onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.c.dim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Animated.View accessibilityViewIsModal style={[{ width: Math.min(300, width - 48), borderRadius: 16, backgroundColor: c.sheetFill, overflow: "hidden" }, card]}>
          <View style={{ gap: 4, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18 }}>
            <Txt size={17} lineHeight={22} weight={600} align="center" accessibilityRole="header" style={{ color: c.ink }}>
              {title}
            </Txt>
            <Txt size={13} lineHeight={18} align="center" style={{ color: c.ink }}>
              {description}
            </Txt>
          </View>
          <View style={{ flexDirection: "column-reverse" }}>
            {actions.map((a, i) => (
              <React.Fragment key={i}>
                {a}
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />
              </React.Fragment>
            ))}
          </View>
        </Animated.View>
      </View>
    </OverlayModal>
  );
}
