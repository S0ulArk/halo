// The iOS Settings pieces More, every Settings page, the coach's settings and onboarding are built from, on top of the
// shared kit (calmKit.tsx): an inset grouped list whose rows each carry their own padding (switch rows, blue action
// rows, red destructive rows, checkmark choices, label/value rows, form rows, a disclosure that folds rows away, a row
// that opens a pull-down menu) with icon squares in any of iOS's system colours, the feature header a settings page
// opens with, the onboarding head, the profile card with its gradient monogram, the search field, numbered steps, and
// a mount entrance for screens with no push to wait for. Every press settles and dims on the UI thread (press.tsx); the
// menu, the disclosure's chevron and the search field's Cancel move on Reanimated springs, and stay still under Reduce
// motion. A list straight on a bottom sheet takes the sheet's raised fill, so it reads in both schemes.
import * as React from "react";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, FadeIn, FadeInUp, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, ChevronsUpDown, Search, UserRound, X, type LucideIcon } from "lucide-react-native";
import { scheduleOnRN } from "react-native-worklets";
import { Mark, Txt } from "@/ui";
import { CHEVRON, iconRadius, OnCard, recolorIcon, useSurface } from "@/ui/components/calmKit";
import { OverlayModal } from "@/ui/components/Overlay";
import { usePress, usePressStyle } from "@/ui/components/press";
import { Switch } from "@/ui/components/Switch";
import { font, TABULAR } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { iosSpring, SPRING } from "@/ui/motion/springs";
import { reduceMotionNow } from "@/ui/motion/system";
import { useTheme } from "@/ui/ThemeProvider";
import type { SystemColor } from "@/ui/calm";
import { Hairline, LIST_RADIUS, SectionFooter, SectionLabel, useCalm, type CalmTint } from "./calmKit";

/** The icon square in a row, iOS Settings' 29 px. */
export const ROW_ICON = 29;
/** Where a row's text starts when it has an icon square: the hairline under it starts there too. */
export const ICON_INSET = 16 + ROW_ICON + 12;

const PRESS_SCALE = 0.985;
const PRESS_DIM = 0.55;

/**
 * A row's icon square, iOS Settings': a family's colour (`tint`) or any of iOS's system colours (`system`: red for
 * notifications, purple, teal, grey…), the glyph (or `node`) in white, corners a quarter of its size.
 */
export function RowIcon({ icon: Icon, node, tint = "sky", system, size = ROW_ICON }: { icon?: LucideIcon; node?: React.ReactNode; tint?: CalmTint; system?: SystemColor; size?: number }) {
  const c = useCalm();
  return (
    <View style={{ width: size, height: size, borderRadius: iconRadius(size), backgroundColor: system ? c.system[system] : c.tintInk[tint], alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {node ? recolorIcon(node, "#ffffff") : Icon ? <Icon size={Math.round(size * 0.62)} color="#ffffff" strokeWidth={2} /> : null}
    </View>
  );
}

// ── The group ────────────────────────────────────────────────────────────────

/**
 * A card's fill where it sits: the card colour on the grouped ground, the sheet's raised fill straight on a bottom sheet
 * (white on the light sheet, the raised grey on the dark one, whose face is the card colour itself).
 */
export function useCardFill(): string {
  const c = useCalm();
  return useSurface() === "sheet" ? c.sheetFill : c.card;
}

/** Whether a row element leads with an icon (its own `icon`, `iconNode` or `leading` glyph, or a LinkList row's). */
function leadsWithIcon(child: React.ReactNode): boolean {
  if (!React.isValidElement<{ icon?: unknown; iconNode?: unknown; leading?: unknown; row?: { icon?: unknown; iconNode?: unknown } }>(child)) return false;
  const p = child.props;
  return !!(p.icon || p.iconNode || p.leading || p.row?.icon || p.row?.iconNode);
}

/**
 * An inset grouped list: the small capital header, one card (16 px corners) whose children are rows separated by
 * half-point hairlines, then the footer (a string is iOS's grey note). Each hairline starts where the text of the row
 * above it starts (`auto`, iOS's rule: past a 29 px icon square, else 16 px in), or everywhere at `icon`, `text` or a
 * number. Falsy children are skipped.
 */
export function InsetGroup({ title, right, footer, inset = "auto", children, style }: { title?: string; right?: React.ReactNode; footer?: React.ReactNode; inset?: "auto" | "text" | "icon" | number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const fill = useCardFill();
  const items = React.Children.toArray(children).filter(Boolean);
  const at = (above: React.ReactNode) => (inset === "auto" ? (leadsWithIcon(above) ? ICON_INSET : 16) : inset === "icon" ? ICON_INSET : inset === "text" ? 16 : inset);
  return (
    <View style={[{ gap: 7, minWidth: 0 }, style]}>
      {title ? <SectionLabel right={right}>{title}</SectionLabel> : null}
      <View style={{ borderRadius: LIST_RADIUS, backgroundColor: fill, overflow: "hidden" }}>
        {/* Fields and chips inside know they sit on a card (a quiet grey fill), even when the list is on a sheet. */}
        <OnCard>
          {items.map((child, i) => (
            <React.Fragment key={React.isValidElement(child) && child.key !== null ? child.key : i}>
              {i > 0 ? <Hairline inset={at(items[i - 1])} /> : null}
              {child}
            </React.Fragment>
          ))}
        </OnCard>
      </View>
      {typeof footer === "string" ? <SectionFooter>{footer}</SectionFooter> : footer}
    </View>
  );
}

/** A row's padded box inside an InsetGroup, for content that is not one of the rows below (a field, a chart, a note). */
export function RowBox({ children, gap, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: 16, paddingVertical: 12, gap }, style]}>{children}</View>;
}

/** The label and the grey sentence under it, as every row sets them. */
function RowText({ label, description, descriptionColor, color }: { label: string; description?: string; descriptionColor?: string; color?: string }) {
  const c = useCalm();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
      <Txt size={16} lineHeight={21} style={{ color: color ?? c.ink }}>
        {label}
      </Txt>
      {description ? (
        <Txt size={13} lineHeight={18} style={{ color: descriptionColor ?? c.sub }}>
          {description}
        </Txt>
      ) : null}
    </View>
  );
}

const ROW: ViewStyle = { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 };

/** A pressable row with the kit's press (a settle to 98.5 % and a dim, springing back). */
function PressRow({ onPress, disabled, accessibilityRole = "button", accessibilityLabel, accessibilityState, style, children }: { onPress?: () => void; disabled?: boolean; accessibilityRole?: "button" | "radio"; accessibilityLabel?: string; accessibilityState?: object; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const press = usePress(PRESS_SCALE);
  const pressed = usePressStyle(press, { rest: disabled ? 0.45 : 1, dim: PRESS_DIM });
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} disabled={disabled || !onPress} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled, ...accessibilityState }}>
      <Animated.View style={[ROW, style, pressed]}>{children}</Animated.View>
    </Pressable>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

/**
 * A switch row, iOS's: an optional coloured icon square, the label with its sentence under it, and the green switch on
 * the right, centred on the row. Only the switch toggles.
 */
export function SwitchRow({ icon, tint = "sky", system, label, description, value, onChange, disabled }: { icon?: LucideIcon; tint?: CalmTint; system?: SystemColor; label: string; description?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={ROW}>
      {icon ? (
        <View style={{ opacity: disabled ? 0.45 : 1 }}>
          <RowIcon icon={icon} tint={tint} system={system} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, opacity: disabled ? 0.45 : 1 }}>
        <RowText label={label} description={description} />
      </View>
      <Switch value={value} onChange={onChange} label={label} disabled={disabled} />
    </View>
  );
}

/**
 * A button row, iOS's: the label in blue (red with `danger`), left-aligned, or centred with `center`. An optional glyph
 * leads it; a spinner trails it while `busy`.
 */
export function ButtonRow({ label, onPress, danger = false, disabled, busy = false, leading, center = false, description, accessibilityLabel }: { label: string; onPress?: () => void; danger?: boolean; disabled?: boolean; busy?: boolean; leading?: React.ReactNode; center?: boolean; description?: string; accessibilityLabel?: string }) {
  const c = useCalm();
  const ink = danger ? c.system.red : c.teal;
  return (
    <PressRow onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ busy }} style={center ? { justifyContent: "center" } : undefined}>
      {leading ? <View style={{ width: ROW_ICON, alignItems: "center" }}>{recolorIcon(leading, ink)}</View> : null}
      <View style={center ? { flexShrink: 1 } : { flex: 1, minWidth: 0 }}>
        <Txt size={16} lineHeight={21} align={center ? "center" : undefined} style={{ color: ink }}>
          {label}
        </Txt>
        {description ? (
          <Txt size={13} lineHeight={18} align={center ? "center" : undefined} style={{ color: c.sub }}>
            {description}
          </Txt>
        ) : null}
      </View>
      {busy ? <ActivityIndicator size="small" color={ink} /> : null}
    </PressRow>
  );
}

/**
 * A row that opens somewhere or runs something: an optional coloured icon square (or `iconNode` in it), the label with
 * its sentence, a grey value, then the thin chevron (an arrow out of the app with `external`; nothing with `action`).
 */
export function NavRow({
  icon,
  iconNode,
  tint = "sky",
  system,
  label,
  description,
  descriptionColor,
  value,
  onPress,
  external = false,
  action = false,
  danger = false,
  disabled,
  accessibilityLabel,
}: {
  icon?: LucideIcon;
  iconNode?: React.ReactNode;
  tint?: CalmTint;
  system?: SystemColor;
  label: string;
  description?: string;
  descriptionColor?: string;
  value?: string;
  onPress?: () => void;
  external?: boolean;
  action?: boolean;
  danger?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useCalm();
  const press = usePress(PRESS_SCALE);
  const pressed = usePressStyle(press, { rest: disabled ? 0.45 : 1, dim: PRESS_DIM });
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled || !onPress}
      accessibilityRole={external ? "link" : "button"}
      accessibilityLabel={accessibilityLabel ?? [label, value, description].filter(Boolean).join(", ")}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Animated.View style={[ROW, pressed]}>
        {icon || iconNode ? <RowIcon icon={icon} node={iconNode} tint={tint} system={danger ? "red" : system} /> : null}
        <RowText label={label} description={description} descriptionColor={descriptionColor} color={danger ? c.system.red : undefined} />
        {value ? (
          <Txt size={16} lineHeight={21} align="right" style={[{ color: c.sub, flexShrink: 1, maxWidth: "48%" }, /^[\d.,\s]+$/.test(value) ? TABULAR : null]}>
            {value}
          </Txt>
        ) : null}
        {external ? (
          <ArrowUpRight size={CHEVRON.size} color={c.tertiary} strokeWidth={CHEVRON.stroke} />
        ) : action ? null : (
          <ChevronRight size={CHEVRON.size} color={c.tertiary} strokeWidth={CHEVRON.stroke} />
        )}
      </Animated.View>
    </Pressable>
  );
}

/**
 * A label / value row: the label in ink on the left, the value in grey on the right (tabular figures with `numeric`,
 * the unit beside it), an optional grey line under the value. Label and value share a line however either wraps.
 */
export function InfoRow({ icon, tint = "sky", system, label, value, valueColor, numeric = false, unit, detail, children }: { icon?: LucideIcon; tint?: CalmTint; system?: SystemColor; label: string; value?: string; valueColor?: string; numeric?: boolean; unit?: string; detail?: string; children?: React.ReactNode }) {
  const c = useCalm();
  return (
    <View accessible={value !== undefined} accessibilityLabel={value !== undefined ? `${label}: ${value}${unit ? ` ${unit}` : ""}${detail ? `, ${detail}` : ""}` : undefined} style={[ROW, { alignItems: "flex-start" }]}>
      {icon ? <RowIcon icon={icon} tint={tint} system={system} /> : null}
      <Txt size={16} lineHeight={21} style={{ color: c.ink, flexShrink: 0, maxWidth: "52%", marginTop: icon ? 4 : 0 }}>
        {label}
      </Txt>
      <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end", marginTop: icon ? 4 : 0 }}>
        {value !== undefined ? (
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Txt size={16} lineHeight={21} align="right" style={[{ color: valueColor ?? c.sub }, numeric ? font.numeric(500) : null]}>
              {value}
            </Txt>
            {unit ? (
              <Txt size={16} lineHeight={21} style={{ color: c.sub, marginLeft: 4 }}>
                {unit}
              </Txt>
            ) : null}
          </View>
        ) : (
          children
        )}
        {detail ? (
          <Txt size={13} lineHeight={18} align="right" style={{ color: c.sub }}>
            {detail}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/** A choice in a list, iOS's: the label (and its sentence), a blue checkmark on the right when chosen; a tick on change. */
export function CheckRow({ label, description, selected, onPress, disabled }: { label: string; description?: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const c = useCalm();
  return (
    <PressRow
      onPress={() => {
        if (!selected) haptic.select();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ checked: selected }}
    >
      <RowText label={label} description={description} />
      <View style={{ width: 22, alignItems: "center" }}>{selected ? <Check size={20} color={c.teal} strokeWidth={2.6} /> : null}</View>
    </PressRow>
  );
}

/**
 * A row that folds the rows under it away: the label with its summary, a count on the right, and a chevron that turns
 * on a spring as it opens; the rows fade in under a hairline. Starts open with `defaultOpen`.
 */
export function Disclosure({ label, summary, summaryColor, count, defaultOpen = false, children }: { label: string; summary?: string; summaryColor?: string; count?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const c = useCalm();
  const [open, setOpen] = React.useState(defaultOpen);
  const turn = useSharedValue(defaultOpen ? 1 : 0);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    turn.set(reduceMotionNow() ? (next ? 1 : 0) : withSpring(next ? 1 : 0, SPRING.snappy));
  };
  return (
    <View>
      <PressRow onPress={toggle} accessibilityLabel={`${label}${summary ? `, ${summary}` : ""}`} accessibilityState={{ expanded: open }}>
        <RowText label={label} description={summary} descriptionColor={summaryColor} />
        {count}
        <Animated.View style={chevron}>
          <ChevronDown size={CHEVRON.size} color={c.tertiary} strokeWidth={CHEVRON.stroke} />
        </Animated.View>
      </PressRow>
      {open && (
        <Animated.View entering={reduceMotionNow() ? undefined : FadeIn.duration(180)}>
          {React.Children.toArray(children)
            .filter(Boolean)
            .map((child, i) => (
              <React.Fragment key={i}>
                <Hairline inset={16} />
                {child}
              </React.Fragment>
            ))}
        </Animated.View>
      )}
    </View>
  );
}

/**
 * A form row, Apple Health's "Health Details": the label on the left ("Optional" in grey under it), the control on the
 * right (or across the rest of the row with `wide`), and a red error under both.
 */
export function FormRow({ label, optional, error, wide = false, children }: { label: string; optional?: boolean; error?: string | null; wide?: boolean; children: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 6 }}>
      <View style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flexShrink: 0, maxWidth: "45%" }}>
          <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
            {label}
          </Txt>
          {optional ? (
            <Txt size={13} lineHeight={17} style={{ color: c.sub }}>
              Optional
            </Txt>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: wide ? "stretch" : "flex-end" }}>{children}</View>
      </View>
      {error ? (
        <Txt size={13} lineHeight={18} accessibilityRole="alert" style={{ color: c.system.red }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * A block that fades and rises into place as its screen first mounts, `index` steps of 70 ms after the one before (a
 * Reanimated entering animation, on the UI thread): for screens that open with no push to wait for (onboarding). Still
 * under Reduce motion.
 */
export function Appear({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [entering] = React.useState(() => (reduceMotionNow() ? undefined : FadeInUp.duration(460).delay(60 + index * 70).easing(Easing.out(Easing.exp))));
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

// ── Pull-down menu ───────────────────────────────────────────────────────────

/** A menu's choice: its full name in the menu, and (optional) a shorter one for the row's value. */
export type MenuOption<V extends string> = { value: V; label: string; short?: string };

/** The menu's opening: a quick spring out of the row it belongs to (0.32 s, 0.82), iOS's pull-down menus. */
const MENU_OPEN = iosSpring(0.32, 0.82);
const MENU_W = 248;

/**
 * A row whose value opens a pull-down menu, iOS's: the icon square, the label with its sentence, the chosen option in
 * grey with the up-down chevrons. The menu grows out of the row's right edge on a spring, a checkmark beside the chosen
 * option; a choice closes it with a tick. Below the middle of the screen it opens upward.
 */
export function MenuRow<V extends string>({ icon, tint = "sky", system, label, description, value, options, onChange, disabled }: { icon?: LucideIcon; tint?: CalmTint; system?: SystemColor; label: string; description?: string; value: V; options: readonly MenuOption<V>[]; onChange: (v: V) => void; disabled?: boolean }) {
  const c = useCalm();
  const { scheme } = useTheme();
  const { width, height } = useWindowDimensions();
  const anchor = React.useRef<View>(null);
  const [at, setAt] = React.useState<{ top: number; right: number; up: boolean } | null>(null);
  const grow = useSharedValue(0);
  const chosen = options.find((o) => o.value === value);
  const current = chosen?.label ?? "";
  const currentShort = chosen?.short ?? current;
  const open = () =>
    anchor.current?.measureInWindow((x, y, w, h) => {
      const up = y + h / 2 > height * 0.6;
      grow.set(0);
      setAt({ top: up ? y : y + h, right: Math.max(8, width - (x + w) + 8), up });
      grow.set(reduceMotionNow() ? 1 : withSpring(1, MENU_OPEN));
    });
  const hide = React.useCallback(() => setAt(null), []);
  const close = () =>
    grow.set(
      withTiming(0, { duration: reduceMotionNow() ? 0 : 120 }, (done) => {
        "worklet";
        if (done) scheduleOnRN(hide);
      }),
    );
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, grow.value * 1.6), transform: [{ scale: 0.55 + 0.45 * grow.value }] }));
  return (
    <>
      <View ref={anchor} collapsable={false}>
        <PressRow onPress={open} disabled={disabled} accessibilityLabel={`${label}: ${current}`} accessibilityState={{ expanded: !!at }} style={{ alignItems: "flex-start" }}>
          {icon ? <RowIcon icon={icon} tint={tint} system={system} /> : null}
          {/* The name and the value share the icon's line; the sentence runs the whole width under them. */}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ minHeight: ROW_ICON, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Txt size={16} lineHeight={21} style={{ color: c.ink, flex: 1 }}>
                {label}
              </Txt>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, maxWidth: "58%" }}>
                <Txt size={16} lineHeight={21} align="right" style={{ color: c.sub, flexShrink: 1 }}>
                  {currentShort}
                </Txt>
                <ChevronsUpDown size={15} color={c.tertiary} strokeWidth={2.2} />
              </View>
            </View>
            {description ? (
              <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
                {description}
              </Txt>
            ) : null}
          </View>
        </PressRow>
      </View>
      {at && (
        <OverlayModal onRequestClose={close}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
          <Animated.View
            accessibilityViewIsModal
            style={[
              {
                position: "absolute",
                right: at.right,
                width: MENU_W,
                borderRadius: 18,
                paddingVertical: 6,
                backgroundColor: scheme === "dark" ? c.chip : c.card,
                boxShadow: scheme === "dark" ? "0 12px 40px rgba(0,0,0,0.55)" : "0 12px 40px rgba(0,0,0,0.18)",
                transformOrigin: at.up ? "right bottom" : "right top",
              },
              at.up ? { bottom: height - at.top + 4 } : { top: at.top + 4 },
              style,
            ]}
          >
            {options.map((o) => {
              const on = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    if (!on) haptic.select();
                    onChange(o.value);
                    close();
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: pressed ? c.fill : "transparent" })}
                >
                  <View style={{ width: 18, alignItems: "center" }}>{on ? <Check size={17} color={c.ink} strokeWidth={2.6} /> : null}</View>
                  <Txt size={16} lineHeight={21} style={{ color: c.ink, flex: 1 }}>
                    {o.label}
                  </Txt>
                </Pressable>
              );
            })}
          </Animated.View>
        </OverlayModal>
      )}
    </>
  );
}

// ── Heads ────────────────────────────────────────────────────────────────────

/** A feature header's sentence longer than this is set from the left rather than centred. */
const LONG_BODY = 140;

/**
 * The feature header a settings page opens with, iOS's: the page's coloured icon square (60 px) centred over its name
 * in bold, a status line (in a colour when it calls for attention) and a sentence or two in grey; anything under them.
 */
export function HeroCard({ icon, iconNode, tint = "sky", system, title, status, statusColor, body, children }: { icon?: LucideIcon; iconNode?: React.ReactNode; tint?: CalmTint; system?: SystemColor; title: string; status?: string; statusColor?: string; body?: string; children?: React.ReactNode }) {
  const c = useCalm();
  const fill = useCardFill();
  return (
    <View style={{ borderRadius: 20, backgroundColor: fill, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20, alignItems: "center", gap: 6 }}>
      <View style={{ marginBottom: 8 }}>
        <RowIcon icon={icon} node={iconNode} tint={tint} system={system} size={60} />
      </View>
      <Txt size={22} lineHeight={28} weight={700} align="center" accessibilityRole="header" style={{ color: c.ink }}>
        {title}
      </Txt>
      {status ? (
        <Txt size={15} lineHeight={20} weight={statusColor ? 600 : 400} align="center" style={{ color: statusColor ?? c.sub, fontVariant: ["tabular-nums"] }}>
          {status}
        </Txt>
      ) : null}
      {body ? (
        // A sentence or two is centred under the name; a longer explanation reads better from the left.
        <Txt size={15} lineHeight={20} align={body.length > LONG_BODY ? "left" : "center"} style={{ color: c.sub, marginTop: status ? 4 : 0, alignSelf: "stretch" }}>
          {body}
        </Txt>
      ) : null}
      {children ? <View style={{ alignSelf: "stretch", marginTop: 10, gap: 10 }}>{children}</View> : null}
    </View>
  );
}

/**
 * The head a page opens with straight on the ground (Apple Health's onboarding): the app's mark on an icon squircle, a
 * large centred title and a sentence under it.
 */
export function PageHead({ title, children }: { title: string; children: string }) {
  const c = useCalm();
  return (
    <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 8 }}>
      <View style={{ width: 76, height: 76, borderRadius: 18, backgroundColor: c.card, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
        <Mark size={54} />
      </View>
      <Txt size={34} lineHeight={41} weight={700} align="center" accessibilityRole="header" style={{ color: c.ink }}>
        {title}
      </Txt>
      <Txt size={17} lineHeight={23} align="center" style={{ color: c.sub }}>
        {children}
      </Txt>
    </View>
  );
}

/** The profile's monogram: a circle in a sky-to-indigo gradient with the initial (or a person) in white. */
export function ProfileAvatar({ size = 60, initial }: { size?: number; initial?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <LinearGradient colors={["#64d2ff", "#5e5ce6"]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      {initial ? (
        <Txt size={Math.round(size * 0.44)} lineHeight={Math.round(size * 0.52)} weight={600} style={{ color: "#ffffff" }}>
          {initial}
        </Txt>
      ) : (
        <UserRound size={Math.round(size * 0.5)} color="#ffffff" strokeWidth={2} />
      )}
    </View>
  );
}

/** The profile card at the top of More, iOS Settings' account card: the monogram, a name, the line under it, a chevron. */
export function ProfileCard({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  const c = useCalm();
  const press = usePress();
  const pressed = usePressStyle(press, { dim: 0.85 });
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`}>
      <Animated.View style={[{ borderRadius: 20, backgroundColor: c.card, padding: 14, paddingRight: 16, flexDirection: "row", alignItems: "center", gap: 14 }, pressed]}>
        <ProfileAvatar size={60} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={22} lineHeight={28} weight={600} style={{ color: c.ink }}>
            {title}
          </Txt>
          <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
            {subtitle}
          </Txt>
        </View>
        <ChevronRight size={CHEVRON.size} color={c.tertiary} strokeWidth={CHEVRON.stroke} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * The search field, iOS's: a 38 px field in the quiet fill with the magnifier, the grey placeholder and a clear button
 * once something is typed; while it is focused, Cancel slides in beside it (and clears and closes the keyboard).
 */
export function SearchField({ value, onChangeText, placeholder = "Search" }: { value: string; onChangeText: (t: string) => void; placeholder?: string }) {
  const c = useCalm();
  const input = React.useRef<TextInput>(null);
  const [focused, setFocused] = React.useState(false);
  const still = reduceMotionNow();
  const active = focused || value.length > 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Animated.View layout={still ? undefined : LinearTransition.springify().damping(26).stiffness(320)} style={{ flex: 1, height: 38, borderRadius: 19, backgroundColor: c.fill, flexDirection: "row", alignItems: "center", paddingLeft: 11, paddingRight: 6, gap: 6 }}>
        <Search size={17} color={c.sub} strokeWidth={2.2} />
        <TextInput
          ref={input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.sub}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          allowFontScaling={false}
          cursorColor={c.teal}
          selectionColor={c.teal + "55"}
          accessibilityLabel={placeholder}
          style={{ flex: 1, minWidth: 0, height: 38, paddingVertical: 0, color: c.ink, fontSize: 16, ...font.sans(400) }}
        />
        {value.length > 0 && (
          <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search" style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.tertiary, alignItems: "center", justifyContent: "center" }}>
            <X size={11} color={c.card} strokeWidth={3.2} />
          </Pressable>
        )}
      </Animated.View>
      {active && (
        <Animated.View entering={still ? undefined : FadeIn.duration(160)} exiting={still ? undefined : FadeOut.duration(120)}>
          <Pressable
            onPress={() => {
              onChangeText("");
              input.current?.blur();
              Keyboard.dismiss();
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Txt size={16} lineHeight={21} style={{ color: c.teal }}>
              Cancel
            </Txt>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

/** A numbered step: the number in a small circle of the family's soft fill, the title, then what to do under it. */
export function Step({ n, title, tint = "sky", children }: { n: number; title: string; tint?: CalmTint; children?: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }} accessible={typeof children === "string"} accessibilityLabel={typeof children === "string" ? `Step ${n}: ${title}. ${children}` : undefined}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.tint[tint], alignItems: "center", justifyContent: "center", marginTop: -3 }}>
        <Txt size={14} lineHeight={18} style={[font.numeric(700), { color: c.tintInk[tint] }]}>
          {String(n)}
        </Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
          {title}
        </Txt>
        {typeof children === "string" ? (
          <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
            {children}
          </Txt>
        ) : (
          children
        )}
      </View>
    </View>
  );
}
