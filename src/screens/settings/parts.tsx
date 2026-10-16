// The small pieces Settings, More and Your data share, in the iOS Settings look: grey body sentences, the label/value
// row (the label in ink, the value in grey), half-point hairlines between rows, the two-up button grid, iOS's button
// styles, the icon square beside a row's name, the segmented control (theme, sex), a tinted callout, the alert-style
// confirmation dialog and the progress bar. Every colour comes from useCalm(); the exported names and props are the
// ones the screens have always used.
import * as React from "react";
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { OverlayModal } from "@/ui/components/Overlay";
import { iconRadius } from "@/ui/components/calmKit";
import { MOTION, Txt, useTheme, type ButtonProps, type ColorToken } from "@/ui";
import { TABULAR } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { CalmButton, CalmProgress, CalmSegmented, Sentence, useCalm, type CalmTint, type On } from "./calmKit";

type Palette = ReturnType<typeof useCalm>;

/**
 * A theme token as the Calm palette paints it as text: secondary and muted are grey, warnings sand, alerts rose, the
 * heart rose, "optimal" mint. Anything else is ink.
 */
export function toneOf(c: Palette, token: ColorToken | undefined): string {
  switch (token) {
    case "foregroundSecondary":
    case "mutedForeground":
      return c.sub;
    case "warning":
      return c.tintInk.sand;
    case "recoveryRedText":
    case "recoveryRed":
    case "destructive":
      return c.tintInk.rose;
    case "heart":
      return c.tintInk.rose;
    case "optimal":
    case "recoveryGreen":
      return c.tintInk.mint;
    default:
      return c.ink;
  }
}

/** A grey sentence (15/20), as a block. */
export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Sentence>{children}</Sentence>
    </View>
  );
}

/**
 * One settings row, iOS's: the label left in ink, the value right in grey (or the row's own control). `numeric` sets
 * the value in tabular figures with `unit` beside it; `detail` is a grey line under the value. The label and the
 * value's first line share one line however either wraps (a one-line row sits in the middle of its 48 px).
 */
export function Row({
  label,
  value,
  children,
  valueColor = "foregroundSecondary",
  numeric = false,
  unit,
  detail,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  valueColor?: ColorToken;
  numeric?: boolean;
  unit?: string;
  detail?: string;
}) {
  const c = useCalm();
  const color = toneOf(c, valueColor);
  return (
    <View
      accessible={value !== undefined}
      accessibilityLabel={value !== undefined ? `${label}: ${value}${unit ? ` ${unit}` : ""}${detail ? `, ${detail}` : ""}` : undefined}
      style={{ minHeight: 48, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingVertical: (48 - 21) / 2 }}
    >
      <Txt size={16} lineHeight={21} style={{ color: c.ink, flexShrink: 0, maxWidth: "50%" }}>
        {label}
      </Txt>
      {value !== undefined ? (
        <View style={{ flexShrink: 1, alignItems: "flex-end" }}>
          {numeric ? (
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Txt size={16} lineHeight={21} weight={500} style={[TABULAR, { color }]}>
                {value}
              </Txt>
              {unit ? (
                <Txt size={16} lineHeight={21} style={{ color: c.sub, marginLeft: 4 }}>
                  {unit}
                </Txt>
              ) : null}
            </View>
          ) : (
            <Txt size={16} lineHeight={21} align="right" style={{ color }}>
              {value}
            </Txt>
          )}
          {detail ? (
            <Txt size={13} lineHeight={18} align="right" style={{ color: c.sub }}>
              {detail}
            </Txt>
          ) : null}
        </View>
      ) : (
        <View style={{ minHeight: 21, justifyContent: "center" }}>{children}</View>
      )}
    </View>
  );
}

/** Half-point hairlines (iOS's separator) between children, and on top with `top`. */
export function Divided({ children, top = false, style }: { children: React.ReactNode; top?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[top ? { borderTopWidth: 0.5, borderTopColor: c.line } : null, style]}>
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 0.5, borderTopColor: c.line } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Buttons two up; a `wide` child spans both columns. */
export function ButtonGrid({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 }, style]}>{children}</View>;
}

/** A cell of ButtonGrid: half the row, or the whole row with `wide`. */
export function Cell({ wide = false, children }: { wide?: boolean; children: React.ReactNode }) {
  return <View style={wide ? { width: "100%" } : { flexGrow: 1, flexBasis: "40%" }}>{children}</View>;
}

/** The quiet action button: iOS's tinted capsule (blue at 15 %, blue text); `danger` makes it the red one. */
export function OutlineButton({ children, danger = false, onPress, disabled, accessibilityLabel, style, on = "card", icon }: Omit<ButtonProps, "variant" | "size"> & { danger?: boolean; on?: On; icon?: LucideIcon }) {
  return (
    <CalmButton variant={danger ? "danger" : "secondary"} on={on} onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel} icon={icon} style={style}>
      {children}
    </CalmButton>
  );
}

/** The 44 px square beside a row's name: a family's soft fill under its own coloured glyph (iOS's tinted icon). */
export function Tile({ children, tint = "sky" }: { children: React.ReactNode; tint?: CalmTint }) {
  const c = useCalm();
  return <View style={{ width: 44, height: 44, borderRadius: iconRadius(44), backgroundColor: c.tint[tint], alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{children}</View>;
}

/** The segmented radio (theme, sex): iOS's segmented control, the thumb sliding to the chosen option. */
export function Segmented<V extends string>({
  value,
  onChange,
  items,
  accessibilityLabel,
  on = "card",
}: {
  value: V | null;
  onChange: (v: V) => void;
  items: readonly { value: V; label: string; icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }[];
  accessibilityLabel?: string;
  on?: On;
}) {
  return <CalmSegmented value={value} onChange={onChange} items={items} on={on} accessibilityLabel={accessibilityLabel} />;
}

/**
 * A tinted block inside a card: an icon and a title, a sentence, then its actions (permissions needed, blocked
 * notifications, nothing from the Fitbit). `role` is "summary" for a state, "alert" for a problem.
 */
export function Callout({ tint = "sand", icon: Icon, title, children, role = "summary", style }: { tint?: CalmTint; icon?: LucideIcon; title: string; children?: React.ReactNode; role?: "summary" | "alert"; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View accessibilityRole={role} style={[{ borderRadius: 16, backgroundColor: c.tint[tint], padding: 14, gap: 6 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        {Icon ? <Icon size={18} color={c.tintInk[tint]} strokeWidth={2.2} style={{ marginTop: 1 }} /> : null}
        <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, flex: 1 }}>
          {title}
        </Txt>
      </View>
      {children}
    </View>
  );
}

export type ConfirmProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirm: string;
  /** The confirm label while it runs ("Disconnecting…"). */
  pending?: string;
  onConfirm: () => Promise<unknown> | void;
  /** The confirm button in rose (removing data). */
  danger?: boolean;
  /** A failure line above the buttons. */
  error?: string | null;
};

/**
 * The confirmation dialog, an iOS alert: a card with 28 px corners that settles in from a touch larger over the dim,
 * the centred title and a grey sentence, then the action (filled blue, or red when it removes data) above Cancel.
 * Closing is blocked while the action runs.
 */
export function ConfirmDialog({ open, onClose, title, description, confirm, pending, onConfirm, danger = false, error }: ConfirmProps) {
  const { c: t0 } = useTheme();
  const c = useCalm();
  const { width } = useWindowDimensions();
  const [t] = React.useState(() => new Animated.Value(0));
  const [busy, setBusy] = React.useState(false);
  // Stays mounted after `open` turns false until the fade-out ends.
  const [closing, setClosing] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open);
  }
  React.useEffect(() => {
    if (open) Animated.timing(t, { toValue: 1, duration: MOTION.fast, easing: Easing.bezier(0.2, 0, 0, 1), useNativeDriver: true }).start();
    else Animated.timing(t, { toValue: 0, duration: MOTION.fast, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: true }).start(() => setClosing(false));
  }, [open, t]);
  if (!open && !closing) return null;
  const close = () => !busy && onClose();
  const run = async () => {
    haptic.confirm();
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <OverlayModal onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t0.dimStrong, opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Animated.View
          accessibilityViewIsModal
          style={{
            width: Math.min(340, width - 48),
            borderRadius: 28,
            backgroundColor: c.card,
            overflow: "hidden",
            padding: 20,
            gap: 18,
            opacity: t,
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }],
          }}
        >
          <View style={{ gap: 6 }}>
            <Txt size={17} lineHeight={22} weight={600} align="center" accessibilityRole="header" style={{ color: c.ink }}>
              {title}
            </Txt>
            <Sentence align="center">{description}</Sentence>
            {!!error && (
              <Sentence align="center" color={c.system.red} accessibilityRole="alert">
                {error}
              </Sentence>
            )}
          </View>
          <View style={{ gap: 10 }}>
            <CalmButton variant={danger ? "danger" : "primary"} onPress={() => void run()} disabled={busy}>
              {busy && pending ? pending : confirm}
            </CalmButton>
            <CalmButton variant="quiet" onPress={close} disabled={busy}>
              Cancel
            </CalmButton>
          </View>
        </Animated.View>
      </View>
    </OverlayModal>
  );
}

/** A thin blue progress bar on the quiet track. */
export function ProgressBar({ value }: { value: number }) {
  return <CalmProgress value={value} />;
}

