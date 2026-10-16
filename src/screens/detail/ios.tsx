// The iOS pieces the Sleep, Strain, Recovery, Activities and Activity screens share, on top of the kit's (the settings
// kit's grouped lists, the press, the springs): Apple Health's glass segmented control for a page's D / W / M / 6M, an
// inset grouped list whose rows carry a coloured icon square, a sentence under the name, a value and a chevron (or a
// checkmark), and a card lit from the top by a soft pool of one colour (the score heroes). Everything that moves runs
// on the UI thread (Reanimated): the segmented thumb glides and stretches on a spring, a row settles under the finger,
// a card's glow blooms once as its screen opens. Nothing here animates under Reduce motion.
import * as React from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { Check, ChevronRight, type LucideIcon } from "lucide-react-native";
import { Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { CHEVRON, iconRadius } from "@/ui/components/calmKit";
import { usePress, usePressStyle } from "@/ui/components/press";
import { useAfterTransition } from "@/ui/components/AfterTransition";
import { LiquidGlass } from "@/ui/glass";
import { haptic } from "@/ui/motion/haptics";
import { reduceMotionNow } from "@/ui/motion/system";
import { useTheme } from "@/ui/ThemeProvider";
import { font, TABULAR } from "@/ui/fonts";
import { Rows, SectionFooter, SectionLabel } from "@/screens/settings/calmKit";

const PressableView = Animated.createAnimatedComponent(Pressable);

// ── The glass segmented control ──────────────────────────────────────────────

/** The capsule's height, and the thumb's inset from its edge. */
const SEG_H = 36;
const SEG_PAD = 3;
/** The thumb's glide (a touch of overshoot) and the stretch settling with a small wobble, as the tab bar's drop. */
const GLIDE = { damping: 19, stiffness: 230, mass: 0.8 } as const;
const WOBBLE = { damping: 7, stiffness: 240, mass: 0.6 } as const;

export type SegmentItem<V extends string> = { value: V; label: string; accessibilityLabel?: string };

/**
 * Apple Health's range control (D / W / M / 6M) in Liquid Glass: a glass capsule with a lighter glass thumb that glides
 * to the chosen segment on a spring and stretches along the move, a selection tick under the finger. The thumb is one
 * view moved by a transform on the UI thread; the labels never re-lay out. In the page's content the glass draws its
 * translucent stand-in (no live backdrop), so it costs a single layer.
 */
export function GlassSegmented<V extends string>({ value, onChange, items, accessibilityLabel, style }: { value: V; onChange: (v: V) => void; items: readonly SegmentItem<V>[]; accessibilityLabel: string; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const [width, setWidth] = React.useState(0);
  const slotW = width > 0 ? (width - SEG_PAD * 2) / items.length : 0;
  const index = Math.max(0, items.findIndex((it) => it.value === value));
  const x = useSharedValue(0);
  const stretch = useSharedValue(1);
  const last = React.useRef({ index, slotW });
  React.useEffect(() => {
    const prev = last.current;
    last.current = { index, slotW };
    const to = index * slotW;
    // The first measure (and a new width) places the thumb; a new segment glides.
    if (prev.slotW !== slotW || prev.index === index || reduceMotionNow()) {
      x.set(to);
      stretch.set(1);
      return;
    }
    x.set(withSpring(to, GLIDE));
    const peak = 1 + Math.min(0.08 + 0.04 * Math.abs(index - prev.index), 0.2);
    stretch.set(withSequence(withTiming(peak, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(1, WOBBLE)));
  }, [index, slotW, x, stretch]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scaleX: stretch.value }, { scaleY: 1 - (stretch.value - 1) * 0.3 }] }));
  const onLayout = React.useCallback((e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width * 100) / 100), []);
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} onLayout={onLayout} style={[{ height: SEG_H, borderRadius: SEG_H / 2 }, style]}>
      {/* The track: a grey glass capsule (the system fill's tone), so the white thumb reads clearly on it. */}
      <LiquidGlass pointerEvents="none" style={StyleSheet.absoluteFill} cornerRadius={SEG_H / 2} tint={dark ? c.chip : "#e5e5ea"} frost={0.92} shadow={dark ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 14px rgba(0,0,0,0.05)"} />
      {slotW > 0 && (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: SEG_PAD, top: SEG_PAD, width: slotW, height: SEG_H - SEG_PAD * 2 }, thumb]}>
          <LiquidGlass
            backdrop={false}
            style={StyleSheet.absoluteFill}
            cornerRadius={(SEG_H - SEG_PAD * 2) / 2}
            tint={dark ? c.thumb : "#ffffff"}
            frost={dark ? 0.9 : 0.98}
            shadow={dark ? "0 2px 8px rgba(0,0,0,0.45)" : "0 3px 8px rgba(0,0,0,0.12)"}
          />
        </Animated.View>
      )}
      <View style={[StyleSheet.absoluteFill, { flexDirection: "row", paddingHorizontal: SEG_PAD }]}>
        {items.map((it) => {
          const on = it.value === value;
          return (
            <Pressable
              key={it.value}
              onPress={() => {
                if (on) return;
                haptic.select();
                onChange(it.value);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={it.accessibilityLabel ?? it.label}
              style={({ pressed }) => ({ flex: 1, alignItems: "center", justifyContent: "center", opacity: pressed && !on ? 0.5 : 1 })}
            >
              <Txt size={14} lineHeight={18} weight={on ? 700 : 500} align="center" style={[TABULAR, { color: on ? c.ink : c.sub }]}>
                {it.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── The inset grouped list ───────────────────────────────────────────────────

/** The icon square in a row (iOS Settings' 29 px) and where the hairline under such a row starts: the row's text. */
export const ROW_ICON = 29;
export const ICON_INSET = 16 + ROW_ICON + 12;

/**
 * A grouped list, iOS's: a small capitals header (with anything on its right), one card of rows with half-point
 * hairlines inset to the rows' text (`inset`: past the icon squares, or 16 for rows without), and a grey footer.
 */
export function ListGroup({ title, right, footer, inset = ICON_INSET, style, children }: { title?: string; right?: React.ReactNode; footer?: React.ReactNode; inset?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={[{ gap: 7, minWidth: 0 }, style]}>
      {title ? <SectionLabel right={right}>{title}</SectionLabel> : null}
      <View style={{ borderRadius: 16, backgroundColor: c.card, overflow: "hidden" }}>
        <Rows inset={inset}>{children}</Rows>
      </View>
      {typeof footer === "string" ? <SectionFooter>{footer}</SectionFooter> : footer}
    </View>
  );
}

export type ListRowProps = {
  /** The glyph in the coloured square at the row's start. */
  icon?: LucideIcon;
  /** The square's colour (a system colour); the glyph is white on it. */
  iconColor?: string;
  /** In place of the icon square: any small mark (a stage's colour swatch). */
  lead?: React.ReactNode;
  label: string;
  /** Under the name: a sentence (13/18), in `detailColor` (default the secondary grey), or any node. */
  detail?: React.ReactNode;
  detailColor?: string;
  /** The value on the right: plain grey text (iOS's value), or a bold number with its small grey unit. */
  value?: string;
  unit?: string;
  valueColor?: string;
  bold?: boolean;
  /** In place of `value`: any node (a pill, a ring). */
  right?: React.ReactNode;
  /** A trailing chevron; default: shown when the row opens something. */
  chevron?: boolean;
  /** A selection list's checkmark (in the action blue) in the chevron's place. */
  checked?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** `radio` for a selection list's rows. */
  role?: "button" | "radio";
  /** Under the name and its sentence, in the text column (a range track). */
  children?: React.ReactNode;
};

/**
 * One row of an inset grouped list: the coloured icon square, the name (16/21) with its sentence under it, the value
 * (grey, or a bold number with a grey unit), then the thin tertiary chevron or a blue checkmark. At least 48 px tall;
 * a long name or sentence wraps, never cut short. A press settles and dims the row on the UI thread.
 */
export function ListRow({ icon: Icon, iconColor, lead, label, detail, detailColor, value, unit, valueColor, bold, right, chevron, checked, onPress, accessibilityLabel, role = "button", children }: ListRowProps) {
  const c = useCalm();
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { dim: 0.55 });
  const showChevron = chevron ?? (!!onPress && checked === undefined);
  const trailing = checked !== undefined ? (
    <View style={{ width: 20, alignItems: "center" }}>{checked ? <Check size={19} color={c.teal} strokeWidth={2.6} /> : null}</View>
  ) : showChevron ? (
    <ChevronRight size={CHEVRON.size} color={c.tertiary} strokeWidth={CHEVRON.stroke} style={{ marginRight: -3 }} />
  ) : null;
  const valueNode =
    right ??
    (value === undefined ? null : bold ? (
      <View style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 0, maxWidth: "48%" }}>
        <Txt size={20} lineHeight={24} numberOfLines={1} style={[font.numberAt(20), { color: valueColor ?? c.ink }]}>
          {value}
        </Txt>
        {unit ? (
          <Txt size={13} lineHeight={17} weight={500} style={{ color: c.sub, marginLeft: unit === "%" ? 1 : 4 }}>
            {unit}
          </Txt>
        ) : null}
      </View>
    ) : (
      <Txt size={16} lineHeight={21} align="right" style={[TABULAR, { color: valueColor ?? c.sub, flexShrink: 1, maxWidth: "48%" }]}>
        {unit ? `${value}${unit === "%" ? "" : " "}${unit}` : value}
      </Txt>
    ));
  const body = (
    <>
      {Icon ? (
        <View style={{ width: ROW_ICON, height: ROW_ICON, borderRadius: iconRadius(ROW_ICON), backgroundColor: iconColor ?? c.teal, alignItems: "center", justifyContent: "center" }}>
          <Icon size={18} color="#ffffff" strokeWidth={2.2} />
        </View>
      ) : (
        lead ?? null
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
              {label}
            </Txt>
            {typeof detail === "string" ? (
              <Txt size={13} lineHeight={18} weight={detailColor ? 500 : 400} style={[TABULAR, { color: detailColor ?? c.sub }]}>
                {detail}
              </Txt>
            ) : (
              detail
            )}
          </View>
          {valueNode}
          {trailing}
        </View>
        {children}
      </View>
    </>
  );
  const box: ViewStyle = { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 10 };
  const spoken = accessibilityLabel ?? [label, value !== undefined ? `${value}${unit ? ` ${unit}` : ""}` : null, typeof detail === "string" ? detail : null].filter(Boolean).join(", ");
  if (!onPress)
    return (
      <View accessible accessibilityLabel={spoken} style={box}>
        {body}
      </View>
    );
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole={role}
      accessibilityState={role === "radio" ? { checked: !!checked } : undefined}
      accessibilityLabel={spoken}
      style={[box, pressed]}
    >
      {body}
    </PressableView>
  );
}

// ── The lit card ─────────────────────────────────────────────────────────────

/**
 * A hero card lit from its top by a soft pool of `color` (Apple Health's highlighted cards): the card colour with a
 * radial wash of the colour, strongest at the top centre and gone by two thirds down. Drawn once (one static SVG); it
 * blooms in with the ring it sits behind, a single opacity on the UI thread, once the screen has opened.
 */
export function GlowCard({ color, padding = 16, gap, style, children }: { color: string | null; padding?: number; gap?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const id = React.useId().replace(/:/g, "");
  const opened = useAfterTransition();
  const [still] = React.useState(() => reduceMotionNow());
  const lit = useSharedValue(still ? 1 : 0);
  React.useEffect(() => {
    if (!opened || !color) return;
    lit.set(still ? 1 : withDelay(120, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })));
  }, [opened, color, still, lit]);
  const bloom = useAnimatedStyle(() => ({ opacity: lit.value }));
  return (
    <View style={[{ borderRadius: 20, backgroundColor: c.card, padding, gap, overflow: "hidden" }, style]}>
      {color ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, bloom]}>
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id={id} cx="50%" cy="0%" rx="62%" ry="78%" fx="50%" fy="0%">
                <Stop offset="0" stopColor={color} stopOpacity={dark ? 0.3 : 0.2} />
                <Stop offset="0.55" stopColor={color} stopOpacity={dark ? 0.1 : 0.06} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
        </Animated.View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * A drawing's grow-in: 0 → 1 once its screen has opened, `index` steps of 45 ms after `delay`, on the out-expo curve
 * (UI thread); 1 from the start under Reduce motion. Bars use it as a scale from their floor or their start.
 */
export function useGrowIn(index = 0, delay = 100, duration = 700): SharedValue<number> {
  const opened = useAfterTransition();
  const [still] = React.useState(() => reduceMotionNow());
  const grow = useSharedValue(still ? 1 : 0);
  React.useEffect(() => {
    if (!opened || still) return;
    grow.set(withDelay(delay + index * 45, withTiming(1, { duration, easing: Easing.bezier(0.16, 1, 0.3, 1) })));
  }, [opened, still, index, delay, duration, grow]);
  return grow;
}

/** A section's own heading over a card, iOS's title3 (20/25 bold), with anything (a link, a pill) on its right. */
export function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 4, minHeight: 28 }}>
      <Txt size={20} lineHeight={25} weight={700} accessibilityRole="header" style={{ color: c.ink, flexShrink: 1 }}>
        {title}
      </Txt>
      {right}
    </View>
  );
}
