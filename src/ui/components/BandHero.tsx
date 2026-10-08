// The heart-rate tile on Today: the live trace. The newest heart rate large, and under it a smooth line of the recent
// readings (the last 30 minutes from Health Connect, or the last 2 minutes over Bluetooth while live) with a soft fill
// and a glowing dot at "now", on the rose family's gradient. Real data, nothing decorative.
//
// The only motion is the dot's glow breathing (and the line refreshing as readings arrive): one opacity and scale on
// the UI thread (Reanimated), paused whenever the tile can't be seen (another screen on top, the app in the background,
// Today scrolled past it) and still under reduced motion.
import * as React from "react";
import { AppState, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { MISSING } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { useReduceMotion } from "@/ui/motion/system";
import { Txt } from "./Text";

/** Whether the tile is on screen (Home turns this off once it scrolls past the top cards). */
export const BandInView = React.createContext(true);

function useAppActive() {
  const [active, setActive] = React.useState(AppState.currentState === "active");
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);
  return active;
}

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

export type HeartTraceProps = {
  width: number;
  height: number;
  /** Room kept at the foot for the overlay (the "Heart rate" pill). */
  footer?: number;
  radius?: number;
  bpm: number | null;
  /** The recent readings, oldest first: unix seconds and bpm. */
  points: { t: number; bpm: number }[];
  live: boolean;
  /** Under the line: "last 30 min", "last 2 min". */
  caption: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function HeartTrace({ width, height, footer = 0, radius = 28, bpm, points, live, caption, style, children }: HeartTraceProps) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const focused = useIsFocused();
  const inView = React.useContext(BandInView);
  const appActive = useAppActive();
  const reduce = useReduceMotion();
  const running = focused && inView && appActive && !reduce;

  // The dot's glow: a slow breath (quicker while live), on the UI thread.
  const glow = useSharedValue(0);
  React.useEffect(() => {
    if (!running) {
      cancelAnimation(glow);
      return;
    }
    glow.set(0);
    glow.set(withRepeat(withTiming(1, { duration: live ? 900 : 1600, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(glow);
  }, [running, live, glow]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 + 0.45 * glow.value, transform: [{ scale: 1 + 0.6 * glow.value }] }));

  const pad = 16;
  // The label and the number sit above the line; the caption under it, just clear of the footer.
  const top = 92;
  const bottom = height - footer - 22;
  const chartH = Math.max(0, bottom - top);
  const ink = c.tintInk.rose;
  const [v0, v1] = c.vivid.rose;
  const [g0, g1] = c.tintGrad.rose;

  const shape = React.useMemo(() => {
    if (points.length < 2 || chartH < 24) return null;
    const t0 = points[0].t;
    const span = Math.max(1, points[points.length - 1].t - t0);
    const lo = Math.min(...points.map((p) => p.bpm)) - 4;
    const hi = Math.max(...points.map((p) => p.bpm)) + 4;
    const x = (t: number) => 10 + ((t - t0) / span) * (width - 20);
    const y = (b: number) => top + 6 + (1 - (b - lo) / Math.max(1, hi - lo)) * (chartH - 12);
    const pts = points.map((p) => ({ x: x(p.t), y: y(p.bpm) }));
    return { ...tracePaths(pts, top + chartH), end: pts[pts.length - 1] };
  }, [points, width, chartH]);

  return (
    <View style={[{ width, height, borderRadius: radius, overflow: "hidden", backgroundColor: g1 }, style]}>
      <LinearGradient pointerEvents="none" colors={[g0, g1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, width, height: height - footer }}>
        <Txt size={10} lineHeight={13} weight={600} style={{ position: "absolute", top: 18, left: pad, color: c.sub, letterSpacing: 1.4 }}>
          {live ? "HEART RATE · LIVE" : "HEART RATE"}
        </Txt>
        <View style={{ position: "absolute", top: 34, left: pad, flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <Txt size={44} lineHeight={50} style={[font.numeric(700), { color: bpm ? c.ink : c.faint, letterSpacing: -1 }]}>
            {bpm ? String(bpm) : MISSING}
          </Txt>
          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.sub }}>
            bpm
          </Txt>
        </View>
        {shape && (
          <Svg width={width} height={height - footer} style={{ position: "absolute", top: 0, left: 0 }}>
            <Defs>
              <SvgGradient id="traceFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={v0} stopOpacity={dark ? 0.4 : 0.32} />
                <Stop offset="1" stopColor={v0} stopOpacity={0} />
              </SvgGradient>
              <SvgGradient id="traceLine" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={v0} />
                <Stop offset="1" stopColor={v1} />
              </SvgGradient>
            </Defs>
            <Path d={shape.area} fill="url(#traceFill)" />
            <Path d={shape.line} stroke="url(#traceLine)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        )}
        {shape && (
          <>
            {/* "Now": a white dot with a breathing glow. */}
            <Animated.View style={[{ position: "absolute", left: shape.end.x - 7, top: shape.end.y - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: v1 }, halo]} />
            <View style={{ position: "absolute", left: shape.end.x - 4, top: shape.end.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffffff", borderWidth: 1, borderColor: `${ink}55` }} />
          </>
        )}
        <Txt size={10} lineHeight={13} weight={500} style={{ position: "absolute", left: pad, top: bottom + 4, color: c.sub }}>
          {shape ? caption : "No recent readings"}
        </Txt>
      </View>
      {children}
    </View>
  );
}
