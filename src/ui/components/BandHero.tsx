// The live heart-rate trace on Today's Heart Rate card, Apple Health's line: the recent readings (the last 2 minutes
// over Bluetooth while the band streams) as a smooth line with a fill of its colour fading to nothing, and "now" a dot
// ringed in the card colour. Real data, nothing decorative.
//
// While live, the dot breathes: one opacity and scale on the UI thread (Reanimated), and only while the trace can be
// seen. It pauses when another screen is on top, the app is in the background, the page has scrolled the card out of
// view (a `measure` against the window in a reaction on the page's scroll offset, UI thread) or Today says the card is
// off screen (BandInView); it is still under Reduce motion.
import * as React from "react";
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, measure, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type AnimatedRef } from "react-native-reanimated";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { useIsFocused } from "expo-router";
import { useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { RevealScroll } from "@/ui/motion/Rise";
import { useAppActive, useReduceMotion } from "@/ui/motion/system";

/** Whether the trace's card is on screen, as the page knows it (a page that knows nothing leaves it on). */
export const BandInView = React.createContext(true);

/** A smooth line through the points (horizontal-tangent cubic segments), and the same line closed down to `floor`. */
function tracePaths(pts: { x: number; y: number }[], floor: number): { line: string; area: string } {
  let line = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const xm = ((a.x + b.x) / 2).toFixed(1);
    line += ` C${xm} ${a.y.toFixed(1)} ${xm} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return { line, area: `${line} L${last.x.toFixed(1)} ${floor} L${pts[0].x.toFixed(1)} ${floor} Z` };
}

/** Whether a view is inside the window, followed on the UI thread from the page's scroll offset; JS hears only changes. */
function useOnScreen(ref: AnimatedRef<Animated.View>, enabled: boolean): boolean {
  const scroll = React.useContext(RevealScroll);
  const { height } = useWindowDimensions();
  const [shown, setShown] = React.useState(true);
  const last = useSharedValue(true);
  useAnimatedReaction(
    () => (enabled && scroll ? scroll.value : -1),
    (y, prev) => {
      if (y < 0 || y === prev) return;
      const m = measure(ref);
      if (!m) return;
      const visible = m.pageY < height && m.pageY + m.height > 0;
      if (visible === last.value) return;
      last.value = visible;
      scheduleOnRN(setShown, visible);
    },
  );
  return shown;
}

export type HeartTraceProps = {
  width: number;
  height: number;
  /** The recent readings, oldest first: unix seconds and bpm. */
  points: { t: number; bpm: number }[];
  /** Streaming from the band: the "now" dot breathes. */
  live: boolean;
  style?: StyleProp<ViewStyle>;
};

export function HeartTrace({ width, height, points, live, style }: HeartTraceProps) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const focused = useIsFocused();
  const inView = React.useContext(BandInView);
  const appActive = useAppActive();
  const reduce = useReduceMotion();
  const ref = useAnimatedRef<Animated.View>();
  const onScreen = useOnScreen(ref, live);
  const running = live && focused && inView && onScreen && appActive && !reduce;

  // The dot's breath: about a second in and out, on the UI thread.
  const glow = useSharedValue(0);
  React.useEffect(() => {
    if (!running) {
      cancelAnimation(glow);
      glow.set(withTiming(0, { duration: 200 }));
      return;
    }
    glow.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(glow);
  }, [running, glow]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.18 + 0.4 * glow.value, transform: [{ scale: 1 + 0.7 * glow.value }] }));

  const ink = c.tintInk.rose;
  const shape = React.useMemo(() => {
    if (points.length < 2) return null;
    const t0 = points[0].t;
    const span = Math.max(1, points[points.length - 1].t - t0);
    const lo = Math.min(...points.map((p) => p.bpm)) - 3;
    const hi = Math.max(...points.map((p) => p.bpm)) + 3;
    const x = (t: number) => 4 + ((t - t0) / span) * (width - 12);
    const y = (b: number) => 6 + (1 - (b - lo) / Math.max(1, hi - lo)) * (height - 12);
    const pts = points.map((p) => ({ x: x(p.t), y: y(p.bpm) }));
    return { ...tracePaths(pts, height), end: pts[pts.length - 1] };
  }, [points, width, height]);

  return (
    <Animated.View ref={ref} collapsable={false} pointerEvents="none" style={[{ width, height }, style]}>
      {shape && (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <SvgGradient id="heartTraceFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ink} stopOpacity={dark ? 0.34 : 0.26} />
                <Stop offset="1" stopColor={ink} stopOpacity={0} />
              </SvgGradient>
            </Defs>
            <Path d={shape.area} fill="url(#heartTraceFill)" />
            <Path d={shape.line} stroke={ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
          {/* "Now": the dot ringed in the card colour, and its breathing glow while live. */}
          <Animated.View style={[{ position: "absolute", left: shape.end.x - 8, top: shape.end.y - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: ink }, halo]} />
          <View style={{ position: "absolute", left: shape.end.x - 5, top: shape.end.y - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: ink, borderWidth: 2, borderColor: c.card }} />
        </>
      )}
    </Animated.View>
  );
}
