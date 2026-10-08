// The form primitives the Journal uses (the web's shadcn Badge, Toggle, Input, Switch, Progress, Dialog) in the Calm
// style, plus the toast and haptic the web's sonner and haptic() give: pastel tags, large pill options (grey on a
// white card or sheet, solid teal or ink when chosen), 16 px rounded fields with the label above, a teal switch, and a
// white 28 px dialog. Every colour comes from useCalm().
import * as React from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, TextInput, ToastAndroid, useWindowDimensions, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { OverlayModal } from "@/ui/components/Overlay";
import * as Haptics from "expo-haptics";
import { Txt } from "@/ui";
import { useTheme } from "@/ui/ThemeProvider";
import { CalmChip, CalmField, CalmInput, CalmProgress, CalmSwitch, useCalm, type CalmTint, type On } from "../settings/calmKit";

/** sonner's toast on Android: a short system toast. */
export function toast(message: string) {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
}

/** The web's haptic() on a saved check-in. */
export const haptic = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

/** A behaviour's tag: a pastel pill (recovery's mint by default) with its ink. Wraps rather than cut. */
export function TagBadge({ children, tint = "mint" }: { children: string; tint?: CalmTint }) {
  const c = useCalm();
  return (
    <View style={{ minHeight: 28, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, justifyContent: "center", backgroundColor: c.tint[tint], flexShrink: 1 }}>
      <Txt size={13} lineHeight={18} weight={600} style={{ color: c.tintInk[tint] }}>
        {children}
      </Txt>
    </View>
  );
}

/**
 * The check-in's No / Yes pair: two large pill options side by side, filling the row. Off they take the ground's grey
 * (white on a grey card with `on="ground"`); No chosen is solid ink, Yes chosen is solid teal. Tapping the chosen one
 * clears it (Radix single toggle).
 */
export function YesNo({ value, onChange, label, on = "card" }: { value: number | undefined; onChange: (v: number | undefined) => void; label: string; on?: On }) {
  const c = useCalm();
  const item = (v: 0 | 1, word: string) => {
    const sel = value !== undefined && (v === 1 ? value > 0 : value === 0);
    const bg = sel ? (v === 1 ? c.teal : c.ink) : on === "card" ? c.ground : c.card;
    return (
      <Pressable
        key={word}
        onPress={() => onChange(sel ? undefined : v)}
        accessibilityRole="radio"
        accessibilityLabel={word}
        accessibilityState={{ checked: sel }}
        style={({ pressed }) => ({ flex: 1, minHeight: 48, minWidth: 64, paddingHorizontal: 12, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: bg, opacity: pressed ? 0.8 : 1 })}
      >
        <Txt size={16} lineHeight={20} weight={600} style={{ color: sel ? c.card : c.ink }}>
          {word}
        </Txt>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", gap: 8 }}>
      {item(0, "No")}
      {item(1, "Yes")}
    </View>
  );
}

/** The log sheets' chips: 44 px pills, grey on the sheet and solid teal when chosen, single or multiple. */
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

/** The Calm switch (a teal pill when on, a white thumb); the hit area is 48 px tall. */
export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <CalmSwitch value={value} onChange={onChange} label={label} />;
}

/** A thin progress bar, 0–100, teal on the line grey. */
export function Progress({ value }: { value: number }) {
  return <CalmProgress value={value / 100} />;
}

/** The inline alert the sheets use: a rose block with rose ink, and an optional action beside it. */
export function ErrorAlert({ children, action }: { children: string; action?: React.ReactNode }) {
  const c = useCalm();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 16, backgroundColor: c.tint.rose, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Txt size={14} lineHeight={19} weight={500} style={{ color: c.tintInk.rose, flexShrink: 1 }}>
        {children}
      </Txt>
      {action}
    </View>
  );
}

/** A dialog's button: a 48 px pill in the ground's grey, or a rose wash with rose ink for the destructive one. */
export function DialogAction({ label, onPress, danger, disabled }: { label: string; onPress: () => void; /** The web's bordered face for the destructive action; Calm draws both flat. */ variant?: "secondary" | "outline"; danger?: boolean; disabled?: boolean }) {
  const c = useCalm();
  const bg = danger ? c.tint.rose : c.ground;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: 24,
        paddingHorizontal: 20,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        backgroundColor: bg,
      })}
    >
      <Txt size={15} lineHeight={20} weight={600} style={{ color: danger ? c.tintInk.rose : c.ink }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * The web's confirm ("Discard changes?", "Delete this entry?") as a Calm dialog: a white 28 px card over the dim,
 * title and sentence, then the actions stacked full width (`flex-col-reverse`: the last one on top).
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
  const t = React.useState(() => new Animated.Value(0))[0];
  const [shown, setShown] = React.useState(open);
  // Mount on open while rendering (no effect-driven setState); unmount once the fade-out ends.
  if (open && !shown) setShown(true);
  React.useEffect(() => {
    if (open) {
      Animated.timing(t, { toValue: 1, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    } else {
      Animated.timing(t, { toValue: 0, duration: 100, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(() => setShown(false));
    }
  }, [open, t]);
  if (!shown) return null;
  return (
    <OverlayModal onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.c.dimStrong, opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Animated.View
          accessibilityViewIsModal
          style={{
            width: Math.min(384, width - 32),
            borderRadius: 28,
            backgroundColor: c.card,
            overflow: "hidden",
            padding: 24,
            gap: 20,
            opacity: t,
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
          }}
        >
          <View style={{ gap: 8 }}>
            <Txt size={17} lineHeight={22} weight={600} accessibilityRole="header" style={{ color: c.ink }}>
              {title}
            </Txt>
            <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
              {description}
            </Txt>
          </View>
          <View style={{ flexDirection: "column-reverse", gap: 8 }}>
            {actions.map((a, i) => (
              <React.Fragment key={i}>{a}</React.Fragment>
            ))}
          </View>
        </Animated.View>
      </View>
    </OverlayModal>
  );
}
