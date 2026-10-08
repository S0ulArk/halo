// The heart-rate tile's picture on Today: an original "live pulse", drawn for Halo (it replaced a product photo). A
// glowing ring in the halo's colours beats with a heartbeat's double thump (lub-dub) at the person's own heart rate, its
// glow swelling with each beat, while a heartbeat line runs across the tile behind it, on the rose family's gradient.
//
// All UI thread: one linear clock (Reanimated) drives the beat (a scale and an opacity) and the line (a translateX of a
// path twice the tile's width, so the loop is seamless). Nothing animates layout. The motion stops whenever the tile
// can't be seen (another screen on top, the app in the background, Today scrolled past it); under reduced motion the
// picture is still.
import * as React from "react";
import { AppState, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { HALO, useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { useReduceMotion } from "@/ui/motion/system";

/** The clock's loop in seconds: long, so a heart rate's beat count per loop stays close to whole. */
const LOOP = 60;
/** The beat when there is no reading: a calm resting rate. */
const RESTING_BPM = 62;

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

/**
 * A heartbeat's double thump through one beat (phase 0-1): a sharp rise and fall for the first sound, a smaller one
 * just after, then rest. 0 at rest, 1 at the first peak.
 */
const thump = (p: number) => {
  "worklet";
  const bump = (at: number, width: number) => {
    const x = (p - at) / width;
    return x <= -1 || x >= 1 ? 0 : 0.5 + 0.5 * Math.cos(x * Math.PI);
  };
  return bump(0.08, 0.08) + 0.55 * bump(0.27, 0.09);
};

/** One heartbeat on the line, `w` wide and centred on `mid`: flat, a small P wave, the spike (QRS), a T wave, flat. */
function beatPath(x0: number, w: number, mid: number, amp: number): string {
  const x = (f: number) => (x0 + f * w).toFixed(1);
  const y = (f: number) => (mid - f * amp).toFixed(1);
  return (
    `L${x(0.18)} ${y(0)} Q${x(0.23)} ${y(0.16)} ${x(0.28)} ${y(0)} ` +
    `L${x(0.36)} ${y(0)} L${x(0.4)} ${y(-0.22)} L${x(0.46)} ${y(1)} L${x(0.52)} ${y(-0.42)} L${x(0.56)} ${y(0)} ` +
    `L${x(0.66)} ${y(0)} Q${x(0.74)} ${y(0.3)} ${x(0.82)} ${y(0)} L${x(1)} ${y(0)}`
  );
}

export function BandHero({ width, height, footer = 0, radius = 28, bpm, style, children }: { width: number; height: number; footer?: number; radius?: number; bpm?: number | null; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const focused = useIsFocused();
  const inView = React.useContext(BandInView);
  const appActive = useAppActive();
  const reduce = useReduceMotion();
  const running = focused && inView && appActive && !reduce;

  // Beats per loop, whole, so the beat lands on the same phase when the clock restarts.
  const rate = bpm && bpm >= 30 && bpm <= 220 ? bpm : RESTING_BPM;
  const beats = Math.max(1, Math.round((rate * LOOP) / 60));

  const t = useSharedValue(0);
  React.useEffect(() => {
    if (!running) {
      cancelAnimation(t);
      return;
    }
    t.set(0);
    t.set(withRepeat(withTiming(LOOP, { duration: LOOP * 1000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [running, t]);

  // The picture sits in the part of the tile above the heart-rate pill.
  const h = height - footer;
  const cy = h / 2 + 4;
  const ring = Math.min(width, h) * 0.3;
  const stroke = ring * 0.2;
  const box = ring * 2 + stroke * 6;

  const beat = useAnimatedStyle(() => {
    const p = ((t.get() / LOOP) * beats) % 1;
    return { transform: [{ scale: 1 + 0.07 * thump(p) }] };
  });
  const glow = useAnimatedStyle(() => {
    const p = ((t.get() / LOOP) * beats) % 1;
    const k = thump(p);
    return { opacity: 0.45 + 0.55 * k, transform: [{ scale: 1 + 0.14 * k }] };
  });

  // The heartbeat line: one beat per `period` px, drawn over twice the tile's width and slid left by one width per
  // `width / period` beats, so the beat on the line keeps time with the ring.
  const period = width * 0.62;
  const reps = Math.ceil((width * 2) / period) + 1;
  const amp = h * 0.16;
  const line = React.useMemo(() => {
    let d = `M0 ${cy.toFixed(1)}`;
    for (let i = 0; i < reps; i++) d += ` ${beatPath(i * period, period, cy, amp)}`;
    return d;
  }, [reps, period, cy, amp]);
  const slide = useAnimatedStyle(() => {
    const p = (t.get() / LOOP) * beats;
    return { transform: [{ translateX: -((p % 1) * period) }] };
  });

  const ink = c.tintInk.rose;
  const [g0, g1] = c.tintGrad.rose;
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: "hidden", backgroundColor: g1 }, style]}>
      <LinearGradient pointerEvents="none" colors={[g0, g1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, width, height: h }}>
        {/* The heartbeat line, faint, running behind the ring. */}
        <Animated.View style={[{ position: "absolute", top: 0, left: 0, width: period * reps, height: h }, slide]}>
          <Svg width={period * reps} height={h}>
            <Path d={line} stroke={ink} strokeOpacity={dark ? 0.45 : 0.32} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
        {/* The ring's glow, swelling with each beat. */}
        <Animated.View style={[{ position: "absolute", left: width / 2 - box / 2, top: cy - box / 2, width: box, height: box }, glow]}>
          <Svg width={box} height={box}>
            <Defs>
              <RadialGradient id="bandGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0.45" stopColor={c.glow.rose} stopOpacity={dark ? 0.5 : 0.42} />
                <Stop offset="1" stopColor={c.glow.rose} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={box / 2} cy={box / 2} r={box / 2} fill="url(#bandGlow)" />
          </Svg>
        </Animated.View>
        {/* The ring, in the halo's colours, beating. */}
        <Animated.View style={[{ position: "absolute", left: width / 2 - box / 2, top: cy - box / 2, width: box, height: box }, beat]}>
          <Svg width={box} height={box}>
            <Defs>
              <SvgGradient id="bandRing" x1="0.1" y1="0" x2="0.9" y2="1">
                {HALO.map((s, i) => (
                  <Stop key={s} offset={i / (HALO.length - 1)} stopColor={s} />
                ))}
              </SvgGradient>
            </Defs>
            <Circle cx={box / 2} cy={box / 2} r={ring} stroke="url(#bandRing)" strokeWidth={stroke} fill={dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.35)"} />
            <Circle cx={box / 2} cy={box / 2} r={ring} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={stroke * 0.22} fill="none" />
          </Svg>
        </Animated.View>
      </View>
      {children}
    </View>
  );
}
