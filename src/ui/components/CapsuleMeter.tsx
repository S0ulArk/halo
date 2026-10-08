import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { reduceMotionNow } from "@/ui/motion/system";
import { REASE } from "@/ui/motion/easing";
import { useCalm } from "@/ui/calm";
import { DRAW_MS, SheenFill } from "./Halo";


/** A faint stretch of the track (a band zone, the Strain Target), as shares of the track 0-1. */
export type MeterSegment = { from: number; to: number; color: string };

export type CapsuleMeterProps = {
  /** The fill as a share 0-1 (clamped). null draws the bare track (loading, no score). */
  frac: number | null;
  /** The fill colour (a family or band colour, resolved). */
  color: string;
  /** Bar height; the radius is half of it, so both ends are round. */
  height?: number;
  /** A fixed width; without one the meter stretches across its parent. */
  width?: number;
  /** Faint segments on the track, under the fill. */
  segments?: MeterSegment[];
  /** Thin ticks at these shares, over the fill (the Strain Target's ends). */
  ticks?: number[];
  tickColor?: string;
  /** The track's colour (default the hairline grey; a pastel card passes its white). */
  track?: string;
  /** The fill lit along its length (a sheen gradient) instead of flat: the hero's meter. */
  sheen?: boolean;
  /** Grow in from empty on mount (a hero's meter, beside its ring); otherwise the first frame is the value. */
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const pct = (x: number) => `${clamp01(x) * 100}%` as const;

/**
 * The capsule meter: a rounded bar on the hairline track, filled to the value in its colour (a band or family ink),
 * flat or (`sheen`) lit along its length. The fill (with `grow`) grows in from the left on mount and slides to a later value,
 * on the UI thread: a full-width fill clipped by the track and moved by a transform, never a width (no layout per
 * frame). Reduce motion jumps.
 */
export function CapsuleMeter({ frac, color, height = 8, width, segments, ticks, tickColor, track, sheen, grow, style }: CapsuleMeterProps) {
  const c = useCalm();
  const target = frac === null || !Number.isFinite(frac) ? 0 : clamp01(frac);
  const [still] = React.useState(() => !grow || reduceMotionNow());
  const fill = useSharedValue(still ? target : 0);
  const w = useSharedValue(width ?? 0);
  // A meter that starts at its value has nothing to do on mount (a list of them stays still).
  const first = React.useRef(still);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotionNow()) {
      fill.set(target);
      return;
    }
    fill.set(withTiming(target, { duration: DRAW_MS, easing: REASE.outExpo }));
    return () => cancelAnimation(fill);
  }, [fill, target]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: w.value > 0 ? 1 : 0, transform: [{ translateX: (fill.value - 1) * w.value }] }));
  const r = height / 2;
  const overhang = height >= 10 ? 3 : 2;
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      onLayout={width === undefined ? (e) => w.set(e.nativeEvent.layout.width) : undefined}
      style={[{ height, borderRadius: r, backgroundColor: track ?? c.line }, width === undefined ? { alignSelf: "stretch" } : { width }, style]}
    >
      {segments?.map((s, i) =>
        s.to > s.from ? (
          <View key={i} style={{ position: "absolute", top: 0, bottom: 0, left: pct(s.from), width: pct(s.to - s.from), borderRadius: r, backgroundColor: s.color }} />
        ) : null,
      )}
      {frac !== null && (
        // Clipped to the track, so the fill's round right end slides with it.
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: r, overflow: "hidden" }}>
          <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", borderRadius: r, backgroundColor: sheen ? undefined : color }, fillStyle]}>
            {sheen ? <SheenFill color={color} radius={r} /> : null}
          </Animated.View>
        </View>
      )}
      {ticks?.map((t, i) => (
        <View key={`t${i}`} style={{ position: "absolute", top: -overhang, bottom: -overhang, left: pct(t), width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: tickColor ?? c.ink }} />
      ))}
    </View>
  );
}
