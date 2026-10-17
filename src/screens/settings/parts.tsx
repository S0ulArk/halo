// The small pieces Settings, More and Your data share, in the iOS Settings look: grey body sentences, the label/value
// row (the label in ink, the value in grey), half-point hairlines between rows, the two-up button grid, iOS's button
// styles, the icon square beside a row's name, the segmented control (theme, sex), a tinted callout, the confirmation
// dialog (iOS's alert, src/ui/components/Alert.tsx) and the progress bar. Every colour comes from useCalm(); the exported names and props are the
// ones the screens have always used.
import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { AlertDialog, fitsRow } from "@/ui/components/Alert";
import { iconRadius } from "@/ui/components/calmKit";
import { Txt, type ButtonProps, type ColorToken } from "@/ui";
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
 * The confirmation dialog: iOS's alert (AlertDialog), the title and a grey sentence over the action (filled blue, or
 * red when it removes data) and Cancel, popping in on a spring. While the action runs its label turns to `pending` with
 * a spinner and the dialog cannot be closed.
 */
export function ConfirmDialog({ open, onClose, title, description, confirm, pending, onConfirm, danger = false, error }: ConfirmProps) {
  const [busy, setBusy] = React.useState(false);
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
    <AlertDialog
      open={open}
      onClose={onClose}
      locked={busy}
      title={title}
      message={description}
      error={error}
      // Decided from the resting labels, so the buttons keep their places while the pending label runs.
      layout={fitsRow(["Cancel", confirm]) ? "row" : "stack"}
      actions={[
        { label: "Cancel", style: "cancel", onPress: () => !busy && onClose(), disabled: busy },
        { label: busy && pending ? pending : confirm, style: danger ? "destructive" : "default", onPress: () => void run(), disabled: busy, busy: busy && !!pending },
      ]}
    />
  );
}

/** A thin blue progress bar on the quiet track. */
export function ProgressBar({ value }: { value: number }) {
  return <CalmProgress value={value} />;
}

