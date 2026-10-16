// The pieces the non-Home screens share (More, Settings, Journal, Reports, Coach, Breathe, Workout, onboarding), in the
// iOS look of Settings and Health: flat cards in the card colour (20 px corners) on the grouped ground, inset grouped
// lists (16 px corners, rows of 48 px or more, a coloured 29 px icon square, the value in grey, a thin chevron, hairlines
// inset to the text) under small capital headers, iOS's switch, segmented control and button styles, and the system
// colours for data. Numbers are Inter bold with tabular figures, the unit small and grey beside them. Every colour comes
// from useCalm(); every press settles and dims on the UI thread (press.tsx).
import * as React from "react";
import { Pressable, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import Reanimated from "react-native-reanimated";
import { useRouter, type Href } from "expo-router";
import { ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react-native";
import { alpha } from "@/lib/utils";
import { Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { CHEVRON, iconRadius, OnCard, recolorIcon, softFill, useSurface } from "@/ui/components/calmKit";
import { usePress, usePressStyle } from "@/ui/components/press";
import { SegmentedControl } from "@/ui/components/Segmented";
import { Switch } from "@/ui/components/Switch";
import { font, TABULAR } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";

const PressableView = Reanimated.createAnimatedComponent(Pressable);

export { useCalm, type CalmTint };

/** A content card's corner radius (iOS's 20). */
export const CALM_RADIUS = 20;
/** An inset grouped list's corner radius (iOS's 16). */
export const LIST_RADIUS = 16;
/** One centred column up to 640 px. */
export const CALM_COLUMN = { alignSelf: "center", width: "100%", maxWidth: 640, gap: 24 } as const;

/** Where a control sits: on the grouped ground (it is the card colour) or on a card or sheet (it takes a quiet grey). */
export type On = "ground" | "card";

/**
 * The quiet fill of a control that sits `on` the ground or a card. Straight on a bottom sheet (whose face is the grouped
 * ground) a card-level control takes the sheet's own fill, so a field or a chip never vanishes into it.
 */
function useFillOn(on: On): string {
  const c = useCalm();
  const surface = useSurface();
  if (surface === "sheet") return c.sheetFill;
  return on === "card" ? softFill(c, "card") : c.card;
}

// ── Type ─────────────────────────────────────────────────────────────────────

/**
 * A number with its unit beside it, sharing the baseline: Inter bold (tabular) in the number's colour, the unit half
 * its size, semibold and grey, so "43 ms" reads as a value with a unit, never as a phrase.
 */
export function Num({ value, unit, size, color, weight = 700, style }: { value: string; unit?: string; size: number; color?: string; weight?: 500 | 600 | 700; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const unitPx = Math.max(12, Math.round(size * 0.5));
  return (
    <View style={[{ flexDirection: "row", alignItems: "baseline", flexShrink: 1 }, style]}>
      <Txt size={size} lineHeight={Math.round(size * 1.15)} style={[font.numberAt(size, weight), { color: color ?? c.ink }]} numberOfLines={1}>
        {value}
      </Txt>
      {unit ? (
        <Txt size={unitPx} lineHeight={Math.max(16, Math.round(unitPx * 1.3))} weight={600} style={{ color: c.sub, marginLeft: 3, flexShrink: 1 }}>
          {unit}
        </Txt>
      ) : null}
    </View>
  );
}

/** The small grey label under a number: 12 px semibold capitals. Wraps rather than cut. */
export function Caption({ children, color, align, style }: { children: string; color?: string; align?: TextStyle["textAlign"]; style?: StyleProp<TextStyle> }) {
  const c = useCalm();
  return (
    <Txt size={12} lineHeight={16} weight={600} align={align} style={[{ color: color ?? c.sub, letterSpacing: 0.4 }, style]}>
      {children.toUpperCase()}
    </Txt>
  );
}

/** A grouped list's header, iOS's: 13 px capitals in the secondary grey, inset to the rows' text; a heading for screen readers. */
export function SectionLabel({ children, right, style }: { children: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View style={[{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 16, minHeight: 18 }, style]}>
      <Txt size={13} lineHeight={18} accessibilityRole="header" style={{ color: c.label, letterSpacing: 0.1, flex: 1 }}>
        {children.toUpperCase()}
      </Txt>
      {right}
    </View>
  );
}

/** A title: 17/22 semibold ink (iOS's headline). */
export function Title({ children, size = 17, color, style, numberOfLines, header = false }: { children: React.ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number; header?: boolean }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={Math.round(size * 1.3)} weight={600} numberOfLines={numberOfLines} accessibilityRole={header ? "header" : undefined} style={[{ color: color ?? c.ink }, style]}>
      {children}
    </Txt>
  );
}

/** A sentence: 15/20 in the secondary grey (iOS's subhead). */
export function Sentence({ children, color, weight = 400, size = 15, align, style, accessibilityRole }: { children: React.ReactNode; color?: string; weight?: 400 | 500 | 600; size?: number; align?: TextStyle["textAlign"]; style?: StyleProp<TextStyle>; accessibilityRole?: "alert" | "text" }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={Math.round(size * 1.34)} weight={weight} align={align} accessibilityRole={accessibilityRole} style={[{ color: color ?? c.sub }, style]}>
      {children}
    </Txt>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

/**
 * The icon square, iOS Settings': the family's system colour with the icon in white (or `color`), its corners a quarter
 * of its size. `on` is kept for API compatibility: the solid square reads on any surface.
 */
export function IconTile({ icon: Icon, tint = "sky", size = 44, color, node }: { icon?: LucideIcon; tint?: CalmTint; size?: number; on?: On | "tint"; color?: string; node?: React.ReactNode }) {
  const c = useCalm();
  const ink = color ?? "#ffffff";
  return (
    <View style={{ width: size, height: size, borderRadius: iconRadius(size), backgroundColor: c.tintInk[tint], alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {node ? recolorIcon(node, ink) : Icon ? <Icon size={Math.round(size * 0.6)} color={ink} strokeWidth={2} /> : null}
    </View>
  );
}

/** A card in the card colour (or a family's soft fill with `tint`): 20 px corners, flat. Pressable with `onPress`. */
export function Surface({
  tint,
  padding = 16,
  gap,
  radius = CALM_RADIUS,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityRole,
  style,
  children,
}: {
  tint?: CalmTint;
  padding?: number;
  gap?: number;
  radius?: number;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const c = useCalm();
  const press = usePress();
  const pressed = usePressStyle(press, { rest: disabled ? 0.5 : 1, dim: 0.88 });
  const face: ViewStyle = { borderRadius: radius, backgroundColor: tint ? c.tint[tint] : c.card, padding, gap, overflow: "hidden" };
  // Controls inside know they sit on a card, even on a sheet.
  if (!onPress)
    return (
      <View style={[face, style]}>
        <OnCard>{children}</OnCard>
      </View>
    );
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled } : undefined}
      style={[face, style, pressed]}
    >
      <OnCard>{children}</OnCard>
    </PressableView>
  );
}

/** A card with a head: icon square, title and a sentence under it (the whole width), something on the right, then a body. */
export function CalmCard({
  tint,
  icon,
  iconTint,
  title,
  subtitle,
  subtitleColor,
  right,
  onPress,
  accessibilityLabel,
  gap = 16,
  style,
  children,
}: {
  tint?: CalmTint;
  icon?: LucideIcon;
  /** The icon's family on a plain card (default: the card's own tint, or sky). */
  iconTint?: CalmTint;
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <Surface tint={tint} gap={gap} onPress={onPress} accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)} style={style}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        {icon ? <IconTile icon={icon} tint={iconTint ?? tint ?? "sky"} size={36} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {/* With no sentence the title centres on the square; a long title wraps. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: icon ? (subtitle ? 22 : 36) : undefined }}>
            <Title header style={{ flex: 1 }}>
              {title}
            </Title>
            {right}
          </View>
          {subtitle ? (
            <Sentence color={subtitleColor} weight={subtitleColor ? 600 : 400}>
              {subtitle}
            </Sentence>
          ) : null}
        </View>
      </View>
      {children}
    </Surface>
  );
}

/** A hairline between rows of a grouped card (iOS's separator, half a point), inset past the icon square. */
export function Hairline({ inset = 0, color }: { inset?: number; color?: string }) {
  const c = useCalm();
  return <View style={{ height: 0.5, marginLeft: inset, backgroundColor: color ?? c.line }} />;
}

/** Children of a card with hairlines between them. */
export function Rows({ children, inset = 0, style }: { children: React.ReactNode; inset?: number; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={style}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Hairline inset={inset} /> : null}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

/** A grouped list's footer: a 13/18 grey note under the card, inset to the rows' text. */
export function SectionFooter({ children }: { children: React.ReactNode }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} style={{ color: c.sub, paddingHorizontal: 16 }}>
      {children}
    </Txt>
  );
}

/** A small capital header, then one card holding its children, then a footer (a string is set as iOS's grey note). */
export function Group({ title, right, footer, padding = 16, gap, children, style }: { title?: string; right?: React.ReactNode; footer?: React.ReactNode; padding?: number; gap?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 7, minWidth: 0 }, style]}>
      {title ? <SectionLabel right={right}>{title}</SectionLabel> : null}
      <Surface padding={padding} gap={gap} radius={LIST_RADIUS}>
        {children}
      </Surface>
      {typeof footer === "string" ? <SectionFooter>{footer}</SectionFooter> : footer}
    </View>
  );
}

// ── Grouped list ─────────────────────────────────────────────────────────────

export type GroupRowProps = {
  label: string;
  /** A route, or an https URL with `external`. */
  href?: string;
  /** Runs instead of opening `href`. */
  onPress?: () => void;
  icon?: LucideIcon;
  /** In place of `icon` inside the square (a spinner while syncing); drawn in white. */
  iconNode?: React.ReactNode;
  /** The icon square's family. */
  tint?: CalmTint;
  /** A short sentence under the label. */
  description?: string;
  descriptionColor?: string;
  /** Right-aligned before the chevron, in grey: a value ("Health Connect"), a count, or a node. */
  aside?: React.ReactNode;
  /** A control on the right (a switch): the row has no chevron and is not itself a button. */
  control?: React.ReactNode;
  /** Opens outside the app: an arrow instead of the chevron. */
  external?: boolean;
  /** An action, not a way somewhere: no chevron. */
  action?: boolean;
  /** The label in red (removing data). */
  danger?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** The icon square in a list row, iOS Settings' 29 px. */
const ROW_ICON = 29;
/** Where the hairline under a row with an icon starts: the row's text. */
const ICON_INSET = 16 + ROW_ICON + 12;

/**
 * One row of an inset grouped list, iOS Settings': a coloured icon square, the label with its sentence under it, the
 * value in grey, then the thin tertiary chevron (an arrow out of the app; the control in its place). At least 48 px
 * tall; a long label or value wraps rather than being cut. A press settles and dims the row on the UI thread.
 */
export function GroupRow({ row }: { row: GroupRowProps }) {
  const c = useCalm();
  const router = useRouter();
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { rest: row.disabled ? 0.5 : 1, dim: 0.55 });
  const open = row.onPress ?? (row.href ? () => router.push(row.href as Href) : undefined);
  const tint: CalmTint = row.danger ? "rose" : (row.tint ?? "sky");
  const body = (
    <>
      {row.iconNode || row.icon ? <IconTile icon={row.icon} node={row.iconNode} tint={tint} size={ROW_ICON} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={16} lineHeight={21} style={{ color: row.danger ? c.system.red : c.ink }}>
          {row.label}
        </Txt>
        {row.description ? (
          <Txt size={13} lineHeight={18} style={{ color: row.descriptionColor ?? c.sub }}>
            {row.description}
          </Txt>
        ) : null}
      </View>
      {typeof row.aside === "string" ? (
        <Txt size={16} lineHeight={21} align="right" style={[{ color: c.sub, flexShrink: 1, maxWidth: "45%" }, /^[\d.,]+$/.test(row.aside) ? TABULAR : null]}>
          {row.aside}
        </Txt>
      ) : row.aside ? (
        <View style={{ flexShrink: 1 }}>{row.aside}</View>
      ) : null}
      {row.control ?? (row.external ? <ArrowUpRight size={CHEVRON.size} color={c.tertiary} strokeWidth={CHEVRON.stroke} /> : row.action ? null : <ChevronRight size={CHEVRON.size} color={c.tertiary} strokeWidth={CHEVRON.stroke} />)}
    </>
  );
  const box: ViewStyle = { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 };
  const label = row.accessibilityLabel ?? [row.label, typeof row.aside === "string" ? row.aside : null, row.description].filter(Boolean).join(", ");
  if (row.control || !open) {
    return (
      <View accessible={!row.control} accessibilityLabel={row.control ? undefined : label} style={[box, { opacity: row.disabled ? 0.5 : 1 }]}>
        {body}
      </View>
    );
  }
  return (
    <PressableView
      onPress={open}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={row.disabled}
      accessibilityRole={row.external ? "link" : "button"}
      accessibilityLabel={label}
      accessibilityState={row.disabled ? { disabled: true } : undefined}
      style={[box, pressed]}
    >
      {body}
    </PressableView>
  );
}

/** An inset grouped list: a small capital header over one card of rows, hairlines inset to the text between them. */
export function GroupList({ title, rows, footer, style }: { title?: string; rows: GroupRowProps[]; footer?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View style={[{ gap: 7, minWidth: 0 }, style]}>
      {title ? <SectionLabel>{title}</SectionLabel> : null}
      <View style={{ borderRadius: LIST_RADIUS, backgroundColor: c.card, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <React.Fragment key={r.href ?? r.label}>
            {i > 0 ? <Hairline inset={r.icon || r.iconNode ? ICON_INSET : 16} /> : null}
            <GroupRow row={r} />
          </React.Fragment>
        ))}
      </View>
      {typeof footer === "string" ? <SectionFooter>{footer}</SectionFooter> : footer}
    </View>
  );
}

/**
 * A label / value line inside a card: the label left in ink, the value right in grey (numbers in tabular figures), on
 * one line however either wraps (a one-line row sits in the middle of its 48 px).
 */
export function InfoLine({ label, value, numeric = false, valueColor, children }: { label: string; value?: string; numeric?: boolean; valueColor?: string; children?: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10 }}>
      <Txt size={16} lineHeight={21} style={{ color: c.ink, flexShrink: 1 }}>
        {label}
      </Txt>
      {value !== undefined ? (
        <Txt size={16} lineHeight={21} align="right" style={[{ color: valueColor ?? c.sub, flexShrink: 1 }, numeric ? font.numeric(500) : null]}>
          {value}
        </Txt>
      ) : (
        <View style={{ justifyContent: "center" }}>{children}</View>
      )}
    </View>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

export type CalmButtonVariant = "primary" | "secondary" | "quiet" | "danger";

/**
 * A button in iOS's styles: `primary` is filled (the blue capsule, white text), `secondary` tinted (blue at 15 %, blue
 * text), `quiet` plain (blue text alone), `danger` destructive (red at 15 %, red text). A press settles and dims the
 * capsule, springing back on release, on the UI thread.
 */
export function CalmButton({
  children,
  onPress,
  variant = "primary",
  size = "lg",
  icon: Icon,
  disabled,
  accessibilityLabel,
  style,
  grow = false,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: CalmButtonVariant;
  /** Kept for API compatibility: the tinted styles read on any surface. */
  on?: On;
  size?: "lg" | "md" | "sm";
  icon?: LucideIcon;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Fill the row (flex 1). */
  grow?: boolean;
}) {
  const c = useCalm();
  const red = c.system.red;
  const bg = variant === "primary" ? c.teal : variant === "secondary" ? alpha(c.teal, 0.15) : variant === "danger" ? alpha(red, 0.15) : "transparent";
  const ink = variant === "primary" ? "#ffffff" : variant === "danger" ? red : c.teal;
  const h = size === "lg" ? 50 : size === "md" ? 44 : 34;
  const press = usePress();
  const pressed = usePressStyle(press, { rest: disabled ? 0.4 : 1, dim: variant === "primary" ? 0.8 : 0.6 });
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
      hitSlop={size === "sm" ? 6 : 0}
      style={[
        { minHeight: h, borderRadius: h / 2, paddingHorizontal: variant === "quiet" ? 8 : size === "sm" ? 14 : 20, paddingVertical: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: bg },
        grow ? { flex: 1 } : null,
        style,
        pressed,
      ]}
    >
      {Icon ? <Icon size={size === "sm" ? 16 : 18} color={ink} strokeWidth={2.2} /> : null}
      {typeof children === "string" || typeof children === "number" ? (
        <Txt size={size === "sm" ? 15 : 17} lineHeight={22} weight={600} align="center" style={{ color: ink, flexShrink: 1 }}>
          {children}
        </Txt>
      ) : (
        children
      )}
    </PressableView>
  );
}

/** A round control button with an icon (play, pause, stop): the card colour with a blue icon, filled blue, or red. */
export function RoundButton({ icon: Icon, onPress, label, size = 64, variant = "white", disabled }: { icon: LucideIcon; onPress?: () => void; label: string; size?: number; variant?: "white" | "teal" | "danger"; disabled?: boolean }) {
  const c = useCalm();
  const red = c.system.red;
  const bg = variant === "teal" ? c.teal : variant === "danger" ? alpha(red, 0.15) : c.card;
  const ink = variant === "teal" ? "#ffffff" : variant === "danger" ? red : c.teal;
  const press = usePress(0.94);
  const pressed = usePressStyle(press, { rest: disabled ? 0.4 : 1 });
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }, pressed]}
    >
      <Icon size={Math.round(size * 0.38)} color={ink} strokeWidth={2.2} />
    </PressableView>
  );
}

/** A form field: the label above (with a grey hint), the control, then an optional grey help line or a red error. */
export function CalmField({ label, hint, help, error, children, style }: { label: string; hint?: string; help?: string; error?: string | null; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View style={[{ minWidth: 0, gap: 7 }, style]}>
      <Txt size={13} lineHeight={18} style={{ color: c.sub, paddingHorizontal: 4 }}>
        {label.toUpperCase()}
        {hint ? <Txt size={13} lineHeight={18} style={{ color: c.sub }}>{` ${hint}`}</Txt> : null}
      </Txt>
      {children}
      {error ? (
        <Txt size={13} lineHeight={18} accessibilityRole="alert" style={{ color: c.system.red, paddingHorizontal: 4 }}>
          {error}
        </Txt>
      ) : help ? (
        <Txt size={13} lineHeight={18} style={{ color: c.sub, paddingHorizontal: 4 }}>
          {help}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * A text input, iOS's: 48 px, 12 px corners, the card colour on the ground (a quiet grey on a card, white on a sheet),
 * no border; a blue edge while focused and a red one when invalid. `numeric` sets the value in tabular figures.
 */
export const CalmInput = React.forwardRef<TextInput, TextInputProps & { invalid?: boolean; on?: On; numeric?: boolean; style?: StyleProp<TextStyle> }>(function CalmInput({ invalid, on = "card", numeric = false, style, multiline, ...props }, ref) {
  const c = useCalm();
  const fill = useFillOn(on);
  const [focused, setFocused] = React.useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.tertiary}
      allowFontScaling={false}
      autoCorrect={false}
      cursorColor={c.teal}
      selectionColor={c.teal + "55"}
      multiline={multiline}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        {
          minHeight: 48,
          minWidth: 0,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: invalid ? c.system.red : focused ? c.teal : "transparent",
          backgroundColor: fill,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          color: c.ink,
          fontSize: numeric ? 17 : 16,
          ...(numeric ? font.numeric(600) : font.sans(400)),
          textAlignVertical: multiline ? "top" : "center",
        },
        style,
      ]}
    />
  );
});

/** The iOS switch (Switch.tsx): 51 × 31, green when on, a white knob that springs across with a toggle click. */
export function CalmSwitch({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <Switch value={value} onChange={onChange} label={label} disabled={disabled} />;
}

/** A choice of a few options: the iOS segmented control (Segmented.tsx), its thumb sliding to the chosen one. */
export function CalmSegmented<V extends string>({
  value,
  onChange,
  items,
  accessibilityLabel,
}: {
  value: V | null;
  onChange: (v: V) => void;
  items: readonly { value: V; label: string; icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }[];
  /** Kept for API compatibility: the translucent track reads on any surface. */
  on?: On;
  accessibilityLabel?: string;
}) {
  return <SegmentedControl value={value} onChange={onChange} items={items} accessibilityLabel={accessibilityLabel} />;
}

/** A choice chip: a 44 px capsule, the quiet fill of its surface, solid blue with white text when chosen; a tick on change. */
export function CalmChip({ label, selected, onPress, role = "radio", on = "card", icon: Icon, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; role?: "radio" | "checkbox" | "button"; on?: On; icon?: LucideIcon; accessibilityLabel?: string }) {
  const c = useCalm();
  const fill = useFillOn(on);
  const ink = selected ? "#ffffff" : c.ink;
  const press = usePress(0.95);
  const pressed = usePressStyle(press, { dim: 0.75 });
  return (
    <PressableView
      onPress={() => {
        haptic.select();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole={role}
      accessibilityState={role === "button" ? { selected } : { checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[{ minHeight: 44, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 7, justifyContent: "center", backgroundColor: selected ? c.teal : fill }, pressed]}
    >
      {Icon ? <Icon size={17} color={ink} strokeWidth={2} /> : null}
      <Txt size={15} lineHeight={20} weight={600} style={{ color: ink }}>
        {label}
      </Txt>
    </PressableView>
  );
}

/** A small tag: a capsule in a family's soft fill with its colour. */
export function TintPill({ children, tint = "sky", icon: Icon }: { children: string; tint?: CalmTint; icon?: LucideIcon }) {
  const c = useCalm();
  return (
    <View style={{ minHeight: 26, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.tint[tint], alignSelf: "flex-start" }}>
      {Icon ? <Icon size={13} color={c.tintInk[tint]} strokeWidth={2.2} /> : null}
      <Txt size={13} lineHeight={17} weight={600} style={{ color: c.tintInk[tint] }}>
        {children}
      </Txt>
    </View>
  );
}

/** A thin progress bar, iOS's: a capsule track in the quiet fill, the progress in the action colour (or a family's). */
export function CalmProgress({ value, color, track, height = 6 }: { value: number; color?: string; track?: string; height?: number }) {
  const c = useCalm();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }} style={{ height, borderRadius: height / 2, backgroundColor: track ?? c.fill, overflow: "hidden" }}>
      <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: height / 2, backgroundColor: color ?? c.teal }} />
    </View>
  );
}

/** A tinted note: a soft block in a family's colour with an icon and a sentence (information, a warning, an error). */
export function Notice({ tint = "sky", icon: Icon, title, children, action, role }: { tint?: CalmTint; icon?: LucideIcon; title?: string; children?: React.ReactNode; action?: React.ReactNode; role?: "alert" }) {
  const c = useCalm();
  return (
    <View accessibilityRole={role} style={{ borderRadius: 16, backgroundColor: c.tint[tint], padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        {Icon ? <Icon size={18} color={c.tintInk[tint]} strokeWidth={2.2} style={{ marginTop: 1 }} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {title ? (
            <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
              {title}
            </Txt>
          ) : null}
          {typeof children === "string" ? (
            <Txt size={15} lineHeight={20} style={{ color: title ? c.sub : c.ink }}>
              {children}
            </Txt>
          ) : (
            children
          )}
        </View>
      </View>
      {action}
    </View>
  );
}

/** Two or more stats side by side: a number with its caption under it (at most two columns of words a row). */
export function MiniStat({ value, unit, label, color, size = 24 }: { value: string; unit?: string; label: string; color?: string; size?: number }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Num value={value} unit={unit} size={size} color={color} />
      <Caption>{label}</Caption>
    </View>
  );
}
