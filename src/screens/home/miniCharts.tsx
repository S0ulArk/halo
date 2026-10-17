// The small charts on the right of Today's Health cards, drawn the way Apple Health draws its highlight cards: a week
// of rounded bars with a dashed line at the average or goal (steps, calories, sleep), heart-rate ranges as min-max
// capsules with a dashed line at their middle, and readings as dots joined by a line over the normal band (HRV, resting
// heart rate, the vitals). The past is a soft step of the colour; the latest mark is the colour itself, ringed in the
// card colour where it is a dot.
//
// Light by design: bars and capsules are plain Views, a line chart one small Svg. Each grows in once on mount (bars and
// capsules up from the floor, a line wiping left to right) through two counter-moving clipped views on one shared
// value, a spring on the UI thread: nothing re-renders and no layout runs while it moves. Still under Reduce motion and
// while the screen is still being pushed.
import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { mix } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { useAfterTransition } from "@/ui/components/AfterTransition";
import { useTheme } from "@/ui/ThemeProvider";
import { iosSpring } from "@/ui/motion/springs";
import { entranceStill } from "@/ui/motion/system";

/** A Health card's chart box. */
export const MINI_W = 112;
export const MINI_H = 40;

/** The grow-in: a 0.6 s response with a hint of settle, a beat after the card itself has started rising. */
const GROW = iosSpring(0.6, 0.88);
const GROW_DELAY = 140;

/** The past marks: the colour softened toward the card (opaque, so overlapping marks never darken). */
export function useSoft(color: string): string {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  return mix(color, c.card, dark ? 0.42 : 0.32);
}

/**
 * The chart grows into its box once on mount: `rise` up from the floor, `wipe` from the left. The outer view clips and
 * slides one way, the inner holds the drawing still by sliding back, so each frame moves two layers and redraws none.
 * Without a fixed `width` (or `height`) the box takes its parent's and the travel is measured once laid out.
 */
export function Grow({ mode, width, height, delay = GROW_DELAY, style, children }: { mode: "rise" | "wipe"; width?: number; height?: number; delay?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const opened = useAfterTransition();
  const [still] = React.useState(() => entranceStill() || !opened);
  const fixed = mode === "rise" ? height : width;
  const p = useSharedValue(still ? 1 : 0);
  const size = useSharedValue(fixed ?? 0);
  const start = React.useCallback(() => {
    if (!still && p.value === 0) p.set(withDelay(delay, withSpring(1, GROW)));
  }, [still, delay, p]);
  React.useEffect(() => {
    if (fixed !== undefined) start();
  }, [fixed, start]);
  const onLayout =
    fixed === undefined && !still
      ? (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
          size.set(mode === "rise" ? e.nativeEvent.layout.height : e.nativeEvent.layout.width);
          start();
        }
      : undefined;
  const outer = useAnimatedStyle(() => {
    const k = (1 - Math.min(1, p.value)) * size.value;
    return { opacity: size.value > 0 || p.value >= 1 ? 1 : 0, transform: mode === "rise" ? [{ translateY: k }] : [{ translateX: -k }] };
  });
  const inner = useAnimatedStyle(() => {
    const k = (1 - Math.min(1, p.value)) * size.value;
    return { transform: mode === "rise" ? [{ translateY: -k }] : [{ translateX: k }] };
  });
  const box = { width, height };
  if (still) return <View style={[box, style]}>{children}</View>;
  return (
    <Animated.View onLayout={onLayout} style={[box, { overflow: "hidden" }, style, outer]}>
      <Animated.View style={[{ width: width ?? "100%", height }, inner]}>{children}</Animated.View>
    </Animated.View>
  );
}

/** A dashed horizontal guide across the chart at `y` (the average, a goal, the middle of the range). */
function Guide({ y, width, color }: { y: number; width: number; color: string }) {
  return (
    <Svg pointerEvents="none" width={width} height={2} style={{ position: "absolute", left: 0, top: Math.round(y) - 1 }}>
      <Line x1={0} y1={1} x2={width} y2={1} stroke={color} strokeWidth={1.2} strokeDasharray={[3, 3]} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * A week (or any short run) of values as rounded bars, oldest first: each bar a full capsule, the past in the soft
 * colour, the last solid; a day with nothing a short stub. `guide` draws a dashed line at that value (the average, a
 * goal), in the colour.
 */
export function MiniBars({ values, color, guide, width = MINI_W, height = MINI_H }: { values: (number | null)[]; color: string; guide?: number | null; width?: number; height?: number }) {
  const c = useCalm();
  const soft = useSoft(color);
  const n = Math.max(1, values.length);
  const slot = width / n;
  const bw = Math.max(5, Math.min(11, Math.round(slot * 0.58)));
  const top = Math.max(guide ?? 0, ...values.map((v) => v ?? 0));
  const scale = top > 0 ? (height - 3) / (top * 1.06) : 0;
  return (
    <Grow mode="rise" width={width} height={height}>
      {values.map((v, i) => {
        const h = v === null || v <= 0 ? 3 : Math.max(bw, v * scale);
        const last = i === values.length - 1;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: Math.round(i * slot + (slot - bw) / 2),
              bottom: 0,
              width: bw,
              height: h,
              borderRadius: bw / 2,
              backgroundColor: v === null || v <= 0 ? c.fill : last ? color : soft,
            }}
          />
        );
      })}
      {guide != null && guide > 0 && scale > 0 && <Guide y={height - guide * scale} width={width} color={mix(color, c.card, 0.75)} />}
    </Grow>
  );
}

/** One stretch of readings: its lowest and highest. */
export type MiniRange = { min: number; max: number };

/**
 * Heart-rate ranges as Apple Health draws them: each stretch a capsule from its lowest to its highest reading, the past
 * in the soft colour, the latest solid, with a dashed line at the middle of the whole range. Null leaves its slot empty.
 */
export function MiniCapsules({ ranges, color, width = MINI_W, height = MINI_H }: { ranges: (MiniRange | null)[]; color: string; width?: number; height?: number }) {
  const c = useCalm();
  const soft = useSoft(color);
  const known = ranges.filter((r): r is MiniRange => r !== null);
  if (!known.length) return null;
  const lo = Math.min(...known.map((r) => r.min));
  const hi = Math.max(...known.map((r) => r.max));
  const span = Math.max(4, hi - lo);
  const n = Math.max(1, ranges.length);
  const slot = width / n;
  const cw = Math.max(6, Math.min(12, Math.round(slot * 0.56)));
  const pad = cw / 2;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - 2 * pad);
  let lastI = ranges.length - 1;
  while (lastI >= 0 && ranges[lastI] === null) lastI--;
  return (
    <Grow mode="rise" width={width} height={height}>
      <Guide y={y((lo + hi) / 2)} width={width} color={mix(c.sub, c.card, 0.6)} />
      {ranges.map((r, i) => {
        if (!r) return null;
        const t = y(r.max) - pad;
        const b = y(r.min) + pad;
        return (
          <View
            key={i}
            style={{ position: "absolute", left: Math.round(i * slot + (slot - cw) / 2), top: t, width: cw, height: Math.max(cw, b - t), borderRadius: cw / 2, backgroundColor: i === lastI ? color : soft }}
          />
        );
      })}
    </Grow>
  );
}

/**
 * Readings as dots joined by a straight line, over the normal band (a soft rounded box of the colour): the past dots
 * small, the latest a larger dot ringed in the card colour. Gaps (null) break the line.
 */
export function MiniDots({ values, color, band, width = MINI_W, height = MINI_H }: { values: (number | null)[]; color: string; band?: { low: number; high: number } | null; width?: number; height?: number }) {
  const c = useCalm();
  const xs = values.flatMap((v) => (v === null ? [] : [v]));
  if (!xs.length) return null;
  const lo = Math.min(...xs, band?.low ?? Infinity);
  const hi = Math.max(...xs, band?.high ?? -Infinity);
  const pad = (hi - lo || 1) * 0.14;
  const inset = 6;
  const y = (v: number) => inset + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (height - 2 * inset);
  const x = (i: number) => (values.length === 1 ? width / 2 : inset + (i / (values.length - 1)) * (width - 2 * inset));
  const pts = values.map((v, i) => (v === null ? null : { x: x(i), y: y(v) }));
  let d = "";
  let open = false;
  for (const p of pts) {
    if (!p) {
      open = false;
      continue;
    }
    d += `${open ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    open = true;
  }
  let lastI = pts.length - 1;
  while (lastI >= 0 && pts[lastI] === null) lastI--;
  const last = pts[lastI]!;
  return (
    <Grow mode="wipe" width={width} height={height}>
      <Svg width={width} height={height}>
        {band && band.high > band.low && (
          <Rect x={0} y={y(band.high)} width={width} height={Math.max(4, y(band.low) - y(band.high))} rx={6} fill={mix(color, c.card, 0.14)} />
        )}
        {d ? <Path d={d} stroke={mix(color, c.card, 0.6)} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" fill="none" /> : null}
        {pts.map((p, i) => (p && i !== lastI ? <Circle key={i} cx={p.x} cy={p.y} r={2.6} fill={mix(color, c.card, 0.7)} /> : null))}
        <Circle cx={last.x} cy={last.y} r={5.2} fill={c.card} />
        <Circle cx={last.x} cy={last.y} r={3.8} fill={color} />
      </Svg>
    </Grow>
  );
}
