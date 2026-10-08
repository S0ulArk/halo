// The Calm pieces the non-Home screens share (More, Settings, Journal, Reports, Coach, Breathe, Workout, onboarding),
// drawn from the same language as Home's calm.tsx: white 32 px cards with a faint hairline and a soft lift on the
// off-white ground, one pastel per metric family, a deep teal for actions and links, an orange for highlights. Numbers
// are set apart from words: Barlow (a step lighter for large numbers) in an ink colour with the unit small and grey;
// labels under numbers are small spaced capitals; titles 17/22 semibold; sentences 14/19 grey. Every colour comes from
// useCalm(). Presses settle and veil on the UI thread (press.tsx).
import * as React from "react";
import { Animated, Easing, Pressable, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import Reanimated from "react-native-reanimated";
import { useRouter, type Href } from "expo-router";
import { ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react-native";
import { Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { MOTION } from "@/ui/theme";
import { SheenFill } from "@/ui/components/Halo";
import { PressGlow, usePress } from "@/ui/components/press";

const PressableView = Reanimated.createAnimatedComponent(Pressable);

export { useCalm, type CalmTint };

/** A Calm card's corner radius. */
export const CALM_RADIUS = 32;
/** One centred column up to 640 px. */
export const CALM_COLUMN = { alignSelf: "center", width: "100%", maxWidth: 640, gap: 24 } as const;

/** Where a control sits: on the warm ground (it is white) or on a white card or sheet (it takes the ground's grey). */
export type On = "ground" | "card";

// ── Type ─────────────────────────────────────────────────────────────────────

/**
 * A number with its unit beside it, sharing the baseline: the numeric face (Barlow bold, tabular) in the number's
 * colour, the unit small and grey in the text face, so "43 ms" reads as a value with a unit, never as a phrase.
 */
export function Num({ value, unit, size, color, weight = 700, style }: { value: string; unit?: string; size: number; color?: string; weight?: 500 | 600 | 700; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View style={[{ flexDirection: "row", alignItems: "baseline", flexShrink: 1 }, style]}>
      <Txt size={size} lineHeight={Math.round(size * 1.15)} style={[font.numberAt(size, weight === 700 ? 600 : weight), { color: color ?? c.ink }]} numberOfLines={1}>
        {value}
      </Txt>
      {unit ? (
        <Txt size={Math.max(12, Math.round(size * 0.42))} lineHeight={Math.max(16, Math.round(size * 0.6))} weight={500} style={{ color: c.sub, marginLeft: 4, flexShrink: 1 }}>
          {unit}
        </Txt>
      ) : null}
    </View>
  );
}

/** The small grey label under a number: 11 px capitals with wide air between letters. Wraps rather than cut. */
export function Caption({ children, color, align, style }: { children: string; color?: string; align?: TextStyle["textAlign"]; style?: StyleProp<TextStyle> }) {
  const c = useCalm();
  return (
    <Txt size={11} lineHeight={15} weight={600} align={align} style={[{ color: color ?? c.faint, letterSpacing: 1.4 }, style]}>
      {children.toUpperCase()}
    </Txt>
  );
}

/** A group's header over its card: small grey capitals, widely spaced; a heading for screen readers. */
export function SectionLabel({ children, right, style }: { children: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6, minHeight: 20 }, style]}>
      <Txt size={11} lineHeight={16} weight={600} accessibilityRole="header" style={{ color: c.label, letterSpacing: 1.4, flex: 1 }}>
        {children.toUpperCase()}
      </Txt>
      {right}
    </View>
  );
}

/** A title: 17/22 semibold ink. */
export function Title({ children, size = 17, color, style, numberOfLines, header = false }: { children: React.ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number; header?: boolean }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={Math.round(size * 1.3)} weight={600} numberOfLines={numberOfLines} accessibilityRole={header ? "header" : undefined} style={[{ color: color ?? c.ink }, style]}>
      {children}
    </Txt>
  );
}

/** A sentence: 14/19 grey. */
export function Sentence({ children, color, weight = 400, size = 14, align, style, accessibilityRole }: { children: React.ReactNode; color?: string; weight?: 400 | 500 | 600; size?: number; align?: TextStyle["textAlign"]; style?: StyleProp<TextStyle>; accessibilityRole?: "alert" | "text" }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={Math.round(size * 1.36)} weight={weight} align={align} accessibilityRole={accessibilityRole} style={[{ color: color ?? c.sub }, style]}>
      {children}
    </Txt>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

/** The icon tile: a soft square in a family's pastel (or white on a pastel card) with the icon in that family's ink. */
export function IconTile({ icon: Icon, tint = "sky", size = 44, on = "card", color, node }: { icon?: LucideIcon; tint?: CalmTint; size?: number; on?: On | "tint"; color?: string; node?: React.ReactNode }) {
  const c = useCalm();
  const bg = on === "tint" ? c.chip : c.tint[tint];
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.32), backgroundColor: bg, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {node ?? (Icon ? <Icon size={Math.round(size * 0.5)} color={color ?? c.tintInk[tint]} strokeWidth={1.75} /> : null)}
    </View>
  );
}

/** A white card (or a family's pastel with `tint`): 32 px corners, the hairline and the lift. Pressable with `onPress`. */
export function Surface({
  tint,
  padding = 20,
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
  const press = usePress(0.985);
  const face: ViewStyle = { borderRadius: radius, borderWidth: 1, borderColor: tint ? c.tintEdge[tint] : c.edge, backgroundColor: tint ? c.tint[tint] : c.card, padding, gap, overflow: "hidden", ...(c.shadow ? { boxShadow: c.shadow } : null) };
  if (!onPress) return <View style={[face, style]}>{children}</View>;
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled } : undefined}
      style={[face, style, { opacity: disabled ? 0.5 : 1 }, press.animatedStyle]}
    >
      {children}
      <PressGlow press={press} radius={radius} />
    </PressableView>
  );
}

/** A Calm card with a head: icon tile, title and a sentence under it (the whole width), something on the right, then a body. */
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
  gap = 18,
  style,
  children,
}: {
  tint?: CalmTint;
  icon?: LucideIcon;
  /** The icon's family on a white card (default: the card's own tint, or sky). */
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
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        {icon ? <IconTile icon={icon} tint={iconTint ?? tint ?? "sky"} on={tint ? "tint" : "card"} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {/* With no sentence the title centres on the tile (Home's cards do the same); a long title wraps. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: icon ? (subtitle ? 26 : 44) : undefined }}>
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

/** A hairline between rows of a grouped card, inset past the icon tile. */
export function Hairline({ inset = 0, color }: { inset?: number; color?: string }) {
  const c = useCalm();
  return <View style={{ height: 1, marginLeft: inset, backgroundColor: color ?? c.line }} />;
}

/** Children of a white card with hairlines between them. */
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

/** A small uppercase header, then one white card holding its children. */
export function Group({ title, right, footer, padding = 20, gap, children, style }: { title?: string; right?: React.ReactNode; footer?: React.ReactNode; padding?: number; gap?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 10, minWidth: 0 }, style]}>
      {title ? <SectionLabel right={right}>{title}</SectionLabel> : null}
      <Surface padding={padding} gap={gap}>
        {children}
      </Surface>
      {footer}
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
  /** In place of `icon` inside the tile (a spinner while syncing). */
  iconNode?: React.ReactNode;
  /** The icon tile's family. */
  tint?: CalmTint;
  /** A short sentence under the label. */
  description?: string;
  descriptionColor?: string;
  /** Right-aligned before the chevron: a short caption ("Sep 22 – Sep 28"), a count, or a node. */
  aside?: React.ReactNode;
  /** A control on the right (a switch): the row has no chevron and is not itself a button. */
  control?: React.ReactNode;
  /** Opens outside the app: an arrow instead of the chevron. */
  external?: boolean;
  /** An action, not a way somewhere: no chevron. */
  action?: boolean;
  /** The label in rose (removing data). */
  danger?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const ICON_INSET = 16 + 40 + 14;

/**
 * A grouped row's lead band, the icon tile's height (kept without one, so a one-line row sits in the middle of its
 * 64 px): the tile, the label's first line, the aside and the chevron are centred on it; the sentence under the label,
 * and any line a long label or sentence wraps onto, hang below it, in the label's column.
 */
const ROW_BAND = 40;

/** A trailing part of a row (an aside, a control, the chevron) centred on the row's band, whatever wraps beside it. */
function OnBand({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ minHeight: ROW_BAND, justifyContent: "center" }, style]}>{children}</View>;
}

/**
 * One row of a grouped card: a tinted icon tile, the label with its sentence under it, an aside, a chevron (an arrow
 * out of the app, the control in its place). An action row keeps the chevron's column empty, so the rows' asides
 * share one right edge and their sentences wrap at one width.
 */
export function GroupRow({ row }: { row: GroupRowProps }) {
  const c = useCalm();
  const router = useRouter();
  const open = row.onPress ?? (row.href ? () => router.push(row.href as Href) : undefined);
  const tint: CalmTint = row.danger ? "rose" : (row.tint ?? "sky");
  const asideIsCount = typeof row.aside === "string" && /^[\d.,]+$/.test(row.aside);
  const body = (
    <>
      {row.iconNode || row.icon ? <IconTile icon={row.icon} node={row.iconNode} tint={tint} size={ROW_BAND} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: (ROW_BAND - 21) / 2 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: row.danger ? c.tintInk.rose : c.ink }}>
          {row.label}
        </Txt>
        {row.description ? (
          <Txt size={14} lineHeight={19} style={{ color: row.descriptionColor ?? c.sub }}>
            {row.description}
          </Txt>
        ) : null}
      </View>
      {typeof row.aside === "string" ? (
        asideIsCount ? (
          <OnBand style={{ flexShrink: 0 }}>
            <Txt size={17} lineHeight={22} style={[font.numeric(700), { color: c.ink }]}>
              {row.aside}
            </Txt>
          </OnBand>
        ) : (
          // A long aside wraps under its own first line, which stays on the band.
          <Txt size={13} lineHeight={18} weight={500} align="right" style={{ color: c.sub, flexShrink: 1, maxWidth: "42%", marginTop: (ROW_BAND - 18) / 2 }}>
            {row.aside}
          </Txt>
        )
      ) : row.aside ? (
        <OnBand style={{ flexShrink: 1 }}>{row.aside}</OnBand>
      ) : null}
      {row.control ? (
        <OnBand>{row.control}</OnBand>
      ) : (
        <OnBand>{row.external ? <ArrowUpRight size={20} color={c.label} strokeWidth={1.5} /> : row.action ? <View style={{ width: 20, height: 20 }} /> : <ChevronRight size={20} color={c.label} strokeWidth={1.5} />}</OnBand>
      )}
    </>
  );
  const box: ViewStyle = { minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 14, paddingHorizontal: 16, paddingVertical: 12 };
  const label = row.accessibilityLabel ?? [row.label, typeof row.aside === "string" ? row.aside : null, row.description].filter(Boolean).join(", ");
  if (row.control || !open) {
    return (
      <View accessible={!row.control} accessibilityLabel={row.control ? undefined : label} style={[box, { opacity: row.disabled ? 0.5 : 1 }]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={open}
      disabled={row.disabled}
      accessibilityRole={row.external ? "link" : "button"}
      accessibilityLabel={label}
      accessibilityState={row.disabled ? { disabled: true } : undefined}
      style={({ pressed }) => [box, { opacity: row.disabled ? 0.5 : 1, backgroundColor: pressed ? c.ground : "transparent" }]}
    >
      {body}
    </Pressable>
  );
}

/** A small uppercase header over one white card of rows, hairlines between them. */
export function GroupList({ title, rows, footer, style }: { title?: string; rows: GroupRowProps[]; footer?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View style={[{ gap: 10, minWidth: 0 }, style]}>
      {title ? <SectionLabel>{title}</SectionLabel> : null}
      <View style={{ borderRadius: CALM_RADIUS, borderWidth: 1, borderColor: c.edge, backgroundColor: c.card, overflow: "hidden", paddingVertical: 4, ...(c.shadow ? { boxShadow: c.shadow } : null) }}>
        {rows.map((r, i) => (
          <React.Fragment key={r.href ?? r.label}>
            {i > 0 ? <Hairline inset={r.icon || r.iconNode ? ICON_INSET : 16} /> : null}
            <GroupRow row={r} />
          </React.Fragment>
        ))}
      </View>
      {footer}
    </View>
  );
}

/**
 * A label / value line inside a white card: the label left in ink, the value right (numbers in the numeric face), on
 * one line however either wraps (a one-line row sits in the middle of its 52 px).
 */
export function InfoLine({ label, value, numeric = false, valueColor, children }: { label: string; value?: string; numeric?: boolean; valueColor?: string; children?: React.ReactNode }) {
  const c = useCalm();
  const line = value !== undefined && !numeric ? 20 : 22;
  return (
    <View style={{ minHeight: 52, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingVertical: (52 - line) / 2 }}>
      <Txt size={15} lineHeight={20} weight={500} style={{ color: c.ink, flexShrink: 1, marginTop: (line - 20) / 2 }}>
        {label}
      </Txt>
      {value !== undefined ? (
        numeric ? (
          <Txt size={18} lineHeight={22} align="right" style={[font.numeric(700), { color: valueColor ?? c.ink, flexShrink: 1 }]}>
            {value}
          </Txt>
        ) : (
          <Txt size={15} lineHeight={20} align="right" style={{ color: valueColor ?? c.sub, flexShrink: 1 }}>
            {value}
          </Txt>
        )
      ) : (
        <View style={{ minHeight: line, justifyContent: "center" }}>{children}</View>
      )}
    </View>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

export type CalmButtonVariant = "primary" | "secondary" | "quiet" | "danger";

/**
 * A button: a pill in sentence case. `primary` is the solid action colour; `secondary` is white on the ground (the
 * ground's colour on a card) with a gold hairline; `quiet` is a link in the action colour; `danger` is a rose wash with
 * rose ink. A press settles the pill and veils it, on the UI thread; nothing animates in.
 */
export function CalmButton({
  children,
  onPress,
  variant = "primary",
  on = "ground",
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
  const bg = variant === "primary" ? c.teal : variant === "danger" ? c.tint.rose : variant === "secondary" ? (on === "card" ? c.ground : c.card) : "transparent";
  const ink = variant === "primary" ? c.card : variant === "danger" ? c.tintInk.rose : c.teal;
  const h = size === "lg" ? 52 : size === "md" ? 44 : 36;
  const press = usePress(0.97);
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
        { minHeight: h, borderRadius: h / 2, paddingHorizontal: variant === "quiet" ? 8 : size === "sm" ? 14 : 20, paddingVertical: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: bg, opacity: disabled ? 0.45 : 1 },
        variant === "secondary" ? { borderWidth: 1, borderColor: c.hairline } : null,
        variant === "primary" && c.shadow ? { boxShadow: `0 6px 16px ${c.teal}33` } : null,
        grow ? { flex: 1 } : null,
        style,
        press.animatedStyle,
      ]}
    >
      {Icon ? <Icon size={size === "sm" ? 16 : 18} color={ink} strokeWidth={2} /> : null}
      {typeof children === "string" || typeof children === "number" ? (
        <Txt size={size === "sm" ? 14 : 15} lineHeight={20} weight={600} align="center" style={{ color: ink, flexShrink: 1 }}>
          {children}
        </Txt>
      ) : (
        children
      )}
      {variant !== "quiet" ? <PressGlow press={press} radius={h / 2} /> : null}
    </PressableView>
  );
}

/** A round white control button with an icon (play, pause, stop). */
export function RoundButton({ icon: Icon, onPress, label, size = 64, variant = "white", disabled }: { icon: LucideIcon; onPress?: () => void; label: string; size?: number; variant?: "white" | "teal" | "danger"; disabled?: boolean }) {
  const c = useCalm();
  const bg = variant === "teal" ? c.teal : variant === "danger" ? c.tint.rose : c.card;
  const ink = variant === "teal" ? c.card : variant === "danger" ? c.tintInk.rose : c.teal;
  const press = usePress(0.94);
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth: variant === "white" ? 1 : 0, borderColor: c.hairline, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.45 : 1, ...(c.shadow ? { boxShadow: c.shadow } : null) }, press.animatedStyle]}
    >
      <Icon size={Math.round(size * 0.38)} color={ink} strokeWidth={2} />
    </PressableView>
  );
}

/** A form field: the label above (with a grey hint), the control, then an optional grey help line or a rose error. */
export function CalmField({ label, hint, help, error, children, style }: { label: string; hint?: string; help?: string; error?: string | null; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View style={[{ minWidth: 0, gap: 8 }, style]}>
      <Txt size={14} lineHeight={19} weight={600} style={{ color: c.ink, paddingHorizontal: 4 }}>
        {label}
        {hint ? <Txt size={14} lineHeight={19} weight={400} style={{ color: c.sub }}>{` ${hint}`}</Txt> : null}
      </Txt>
      {children}
      {error ? (
        <Txt size={13} lineHeight={18} accessibilityRole="alert" style={{ color: c.tintInk.rose, paddingHorizontal: 4 }}>
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
 * A Calm text input: 52 px, 16 px corners, white on the ground (the ground's grey on a card or sheet), no border; a
 * teal edge while focused and a rose one when invalid. `numeric` sets the value in the numeric face.
 */
export const CalmInput = React.forwardRef<TextInput, TextInputProps & { invalid?: boolean; on?: On; numeric?: boolean; style?: StyleProp<TextStyle> }>(function CalmInput({ invalid, on = "card", numeric = false, style, multiline, ...props }, ref) {
  const c = useCalm();
  const [focused, setFocused] = React.useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.faint}
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
          minHeight: 52,
          minWidth: 0,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: invalid ? c.tintInk.rose : focused ? c.teal : "transparent",
          backgroundColor: on === "card" ? c.ground : c.card,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          color: c.ink,
          fontSize: numeric ? 18 : 16,
          ...(numeric ? font.numeric(600) : font.sans(400)),
          textAlignVertical: multiline ? "top" : "center",
        },
        style,
      ]}
    />
  );
});

/** A Calm switch: a 52 × 32 pill, teal when on, with a white thumb. The hit area is 48 px tall. */
export function CalmSwitch({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const c = useCalm();
  const [x] = React.useState(() => new Animated.Value(value ? 1 : 0));
  React.useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: MOTION.fast, easing: Easing.bezier(0.2, 0, 0, 1), useNativeDriver: true }).start();
  }, [value, x]);
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={{ width: 52, height: 32, borderRadius: 16, padding: 3, justifyContent: "center", backgroundColor: value ? c.teal : c.line, opacity: disabled ? 0.45 : 1, flexShrink: 0 }}
    >
      <Animated.View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: value ? c.card : c.chip, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] }} />
    </Pressable>
  );
}

/** A segmented choice: options on the ground's grey (white on the ground), the chosen one solid teal. */
export function CalmSegmented<V extends string>({
  value,
  onChange,
  items,
  on = "card",
  accessibilityLabel,
}: {
  value: V | null;
  onChange: (v: V) => void;
  items: readonly { value: V; label: string; icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }[];
  on?: On;
  accessibilityLabel?: string;
}) {
  const c = useCalm();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={{ flexDirection: "row", gap: 4, borderRadius: 18, backgroundColor: on === "card" ? c.ground : c.card, borderWidth: 1, borderColor: c.hairline, padding: 3 }}>
      {items.map(({ value: v, label, icon: Icon }) => {
        const sel = v === value;
        const ink = sel ? c.card : c.ink;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ checked: sel }}
            accessibilityLabel={label}
            style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 14, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: sel ? c.teal : "transparent", opacity: pressed ? 0.8 : 1 })}
          >
            {Icon && <Icon size={16} color={ink} strokeWidth={2} />}
            <Txt size={14} lineHeight={18} weight={600} align="center" style={{ color: ink, flexShrink: 1 }}>
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A choice chip: 44 px pill with a gold hairline, the ground's colour on a card (white on the ground), solid action colour when chosen. */
export function CalmChip({ label, selected, onPress, role = "radio", on = "card", icon: Icon, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; role?: "radio" | "checkbox" | "button"; on?: On; icon?: LucideIcon; accessibilityLabel?: string }) {
  const c = useCalm();
  const ink = selected ? c.card : c.ink;
  const press = usePress(0.95);
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole={role}
      accessibilityState={role === "button" ? { selected } : { checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[{ minHeight: 44, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", backgroundColor: selected ? c.teal : on === "card" ? c.ground : c.card, borderWidth: 1, borderColor: selected ? c.teal : c.hairline }, press.animatedStyle]}
    >
      {Icon ? <Icon size={16} color={ink} strokeWidth={2} /> : null}
      <Txt size={15} lineHeight={20} weight={500} style={{ color: ink }}>
        {label}
      </Txt>
    </PressableView>
  );
}

/** A small tinted tag: a family's pastel with its ink. */
export function TintPill({ children, tint = "sky", icon: Icon }: { children: string; tint?: CalmTint; icon?: LucideIcon }) {
  const c = useCalm();
  return (
    <View style={{ minHeight: 28, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.tint[tint], alignSelf: "flex-start" }}>
      {Icon ? <Icon size={14} color={c.tintInk[tint]} strokeWidth={2} /> : null}
      <Txt size={13} lineHeight={17} weight={600} style={{ color: c.tintInk[tint] }}>
        {children}
      </Txt>
    </View>
  );
}

/** A thin progress bar: a hairline track (white on a pastel) with a lit fill in the action colour (or a tint's). */
export function CalmProgress({ value, color, track, height = 8 }: { value: number; color?: string; track?: string; height?: number }) {
  const c = useCalm();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }} style={{ height, borderRadius: height / 2, backgroundColor: track ?? c.line, overflow: "hidden" }}>
      <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: height / 2, overflow: "hidden" }}>
        <SheenFill color={color ?? c.teal} radius={height / 2} />
      </View>
    </View>
  );
}

/** A tinted note: a pastel block with an icon and a sentence (an info line, a warning in sand, an error in rose). */
export function Notice({ tint = "sky", icon: Icon, title, children, action, role }: { tint?: CalmTint; icon?: LucideIcon; title?: string; children?: React.ReactNode; action?: React.ReactNode; role?: "alert" }) {
  const c = useCalm();
  return (
    <View accessibilityRole={role} style={{ borderRadius: 20, backgroundColor: c.tint[tint], borderWidth: 1, borderColor: c.tintEdge[tint], padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        {Icon ? <Icon size={18} color={c.tintInk[tint]} strokeWidth={2} style={{ marginTop: 1 }} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {title ? (
            <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
              {title}
            </Txt>
          ) : null}
          {typeof children === "string" ? (
            <Txt size={14} lineHeight={19} style={{ color: title ? c.sub : c.tintInk[tint] }}>
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
