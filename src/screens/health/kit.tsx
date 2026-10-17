// The Health screens' own pieces in Apple Health's language, built on the shared kit: the Summary card (the category's
// glyph and name in its colour with the time and a thin chevron, then the value large with its small grey unit, a line
// of context and a small chart beside it), a vital's tile with its in-range chip, and the one-time grow that brings a
// small chart or a bar in. Motion runs on the UI thread (Reanimated): a value's digits roll into place and a chart grows
// in once as it mounts; nothing loops, and Reduce motion shows every end state at once.
import * as React from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { MISSING } from "@/lib/format";
import { SkeletonText, Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { useAfterTransition } from "@/ui/components/AfterTransition";
import { Card } from "@/ui/components/Card";
import { CHEVRON } from "@/ui/components/calmKit";
import { RollingNumber } from "@/ui/components/Halo";
import { TileLabel } from "@/ui/components/TileRow";
import { font } from "@/ui/fonts";
import { REASE } from "@/ui/motion/easing";
import { reduceMotionNow } from "@/ui/motion/system";

/** How long a small chart takes to grow in, once, as it mounts: Apple's marks land in well under half a second. */
export const GROW_MS = 420;

/**
 * A small chart growing in once on mount: `rise` reveals it from the floor up (bars), `wipe` left to right (a line).
 * Two counter-moving views (the outer clips, the inner holds the drawing still), so each frame moves two layers on the
 * UI thread and redraws nothing. Still under Reduce motion, and when it mounts while its screen is still being pushed
 * (it slides in with the screen instead).
 */
export function Grow({ mode = "rise", delay = 80, style, children }: { mode?: "rise" | "wipe"; delay?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const opened = useAfterTransition();
  const [still] = React.useState(() => reduceMotionNow() || !opened);
  const p = useSharedValue(still ? 1 : 0);
  const size = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    if (still) return;
    const { width, height } = e.nativeEvent.layout;
    size.set(mode === "rise" ? height : width);
    if (p.get() === 0) p.set(withDelay(delay, withTiming(1, { duration: GROW_MS, easing: REASE.outExpo })));
  };
  const outer = useAnimatedStyle(() => {
    const k = (1 - p.value) * size.value;
    return { opacity: size.value > 0 || p.value === 1 ? 1 : 0, transform: mode === "rise" ? [{ translateY: k }] : [{ translateX: -k }] };
  });
  const inner = useAnimatedStyle(() => {
    const k = (1 - p.value) * size.value;
    return { transform: mode === "rise" ? [{ translateY: -k }] : [{ translateX: k }] };
  });
  if (still) return <View style={style}>{children}</View>;
  return (
    <Animated.View onLayout={onLayout} style={[{ overflow: "hidden" }, style, outer]}>
      <Animated.View style={inner}>{children}</Animated.View>
    </Animated.View>
  );
}

/**
 * A value as Apple Health sets it in a card: Inter bold (tabular), its digits rolling into place as it mounts, the unit
 * half its size, semibold and grey on the same baseline. A missing value is the faint dash.
 */
export function RollingValue({ value, unit, size = 30, color }: { value: string | null; unit?: string; size?: number; color?: string }) {
  const c = useCalm();
  const line = Math.round(size * 1.15);
  const unitPx = Math.max(13, Math.round(size * 0.5));
  if (value === null || value === MISSING)
    return (
      <Txt size={size} lineHeight={line} style={[font.numberAt(size), { color: c.faint }]}>
        {MISSING}
      </Txt>
    );
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 1, flexWrap: "wrap" }}>
      <RollingNumber text={value} lineHeight={line} style={[font.numberAt(size), { color: color ?? c.ink }]} />
      {unit ? (
        <Txt size={unitPx} lineHeight={Math.round(unitPx * 1.3)} weight={600} style={{ color: c.sub, marginLeft: unit === "%" ? 1 : 4 }}>
          {unit}
        </Txt>
      ) : null}
    </View>
  );
}

/** A card's head, Apple Health's: the category glyph and name in its colour, then the time in grey and a thin chevron. */
export function CardHead({ tint, icon: Icon, title, when, chevron, action }: { tint: CalmTint; icon: LucideIcon; title: string; when?: React.ReactNode; chevron?: boolean; action?: React.ReactNode }) {
  const c = useCalm();
  const ink = c.tintInk[tint];
  return (
    <View style={{ minHeight: 22, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Icon size={17} color={ink} strokeWidth={2.3} />
      {/* A long name wraps to a second line rather than being cut. */}
      <Txt size={15} lineHeight={20} weight={600} numberOfLines={2} style={{ color: ink, flex: 1, minWidth: 0 }}>
        {title}
      </Txt>
      {typeof when === "string" ? (
        <Txt size={13} lineHeight={18} style={{ color: c.sub, fontVariant: ["tabular-nums"], flexShrink: 0, maxWidth: "50%" }} numberOfLines={1}>
          {when}
        </Txt>
      ) : (
        when
      )}
      {action}
      {chevron ? <ChevronRight size={CHEVRON.size - 2} color={c.tertiary} strokeWidth={CHEVRON.stroke} style={{ marginRight: -3 }} /> : null}
    </View>
  );
}

export type HealthCardProps = {
  tint: CalmTint;
  icon: LucideIcon;
  title: string;
  /** Beside the chevron: the time of the reading ("Last night", "2 min ago") or a node. */
  when?: React.ReactNode;
  /** The value as text; null is the faint dash. Leave out for a card without a headline value. */
  value?: string | null;
  unit?: string;
  /** The value's colour (default ink: Apple Health keeps a card's number black and its name in colour). */
  valueColor?: string;
  /** Under the value: a sentence (grey) or a node. */
  context?: React.ReactNode;
  /** The small chart at the right of the value row. */
  chart?: React.ReactNode;
  /** Loading: a bar where the value goes. */
  loading?: boolean;
  onPress?: () => void;
  /** In the head, before the chevron (an info button). */
  action?: React.ReactNode;
  /** What the whole card says to a screen reader when it is one button. */
  accessibilityLabel: string;
  /** Under the value row, the card's whole width. */
  children?: React.ReactNode;
};

/**
 * Apple Health's Summary card: the head (glyph, name, time, chevron), then the value large with its unit and a line of
 * context on the left and a small chart on the right, both resting on the card's foot, then anything else under them.
 * The whole card is one button that settles and dims under the finger (the kit's press).
 */
export function HealthCard({ tint, icon, title, when, value, unit, valueColor, context, chart, loading, onPress, action, accessibilityLabel, children }: HealthCardProps) {
  const c = useCalm();
  const hasValue = value !== undefined || loading;
  return (
    <Card onPress={onPress} accessibilityLabel={onPress ? accessibilityLabel : undefined}>
      <View accessible={!onPress} accessibilityLabel={onPress ? undefined : accessibilityLabel} style={{ gap: 10 }}>
        <CardHead tint={tint} icon={icon} title={title} when={when} chevron={!!onPress} action={action} />
        {(hasValue || context || chart) && (
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              {loading ? <SkeletonText role="valueXl" size={30} lineHeight={34} chars={4} /> : value !== undefined ? <RollingValue value={value} unit={unit} color={valueColor} /> : null}
              {typeof context === "string" ? (
                <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
                  {context}
                </Txt>
              ) : (
                context
              )}
            </View>
            {chart ? <View style={{ flexShrink: 0, marginBottom: 2 }}>{chart}</View> : null}
          </View>
        )}
        {children}
      </View>
    </Card>
  );
}

/**
 * A vital's tile (Apple's Vitals): the glyph and name in the family's colour, the reading large with its unit, then its
 * chip ("Within range" in a green capsule). `wide` spans a row and sets the chip beside the reading. Loading shows bars.
 */
export function VitalTile({
  tint,
  icon,
  name,
  value,
  unit,
  chip,
  wide,
  loading,
  onPress,
  accessibilityLabel,
}: {
  tint: CalmTint;
  icon: LucideIcon;
  name: string;
  value: string | null;
  unit?: string;
  chip?: React.ReactNode;
  wide?: boolean;
  loading?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const c = useCalm();
  const Icon = icon;
  const ink = c.tintInk[tint];
  const reading = loading ? <SkeletonText role="valueLg" size={28} lineHeight={32} chars={3} /> : <RollingValue value={value} unit={unit} size={28} />;
  return (
    <Card onPress={onPress} accessibilityLabel={accessibilityLabel} padding={14} style={{ flexGrow: 1 }}>
      <View style={{ flexGrow: 1, gap: 8 }}>
        <TileLabel>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <View style={{ height: 20, justifyContent: "center" }}>
              <Icon size={15} color={ink} strokeWidth={2.3} />
            </View>
            <Txt size={15} lineHeight={20} weight={600} style={{ color: ink, flex: 1, minWidth: 0 }}>
              {name}
            </Txt>
            {onPress ? <ChevronRight size={16} color={c.tertiary} strokeWidth={CHEVRON.stroke} style={{ marginTop: 2, marginRight: -3 }} /> : null}
          </View>
        </TileLabel>
        {wide ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, rowGap: 6 }}>
            {reading}
            {chip}
          </View>
        ) : (
          <View style={{ flexGrow: 1, justifyContent: "flex-end", gap: 8 }}>
            {reading}
            {chip}
          </View>
        )}
      </View>
    </Card>
  );
}
