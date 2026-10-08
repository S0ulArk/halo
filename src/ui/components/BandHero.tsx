// The heart-rate tile's picture on Today: a small heart orb (the Halo Age orb's particles and dark core, in warm rose
// and coral, passed in as `art`) swelling gently with each heartbeat at the person's own heart rate, its glow brightening
// on the beat, with the bpm on its core.
//
// All UI thread: one linear clock (Reanimated) drives the beat, a scale and an opacity; the orb runs its own ambient
// motion. Nothing animates layout. The beat stops whenever the tile can't be seen (another screen on top, the app in
// the background, Today scrolled past it); under reduced motion the picture is still.
import * as React from "react";
import { AppState, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { useCalm } from "@/ui/calm";
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

export function BandHero({ width, height, footer = 0, radius = 28, bpm, art, artSize, center, style, children }: { width: number; height: number; footer?: number; radius?: number; bpm?: number | null; art?: React.ReactNode; artSize?: number; center?: React.ReactNode; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
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
  const size = artSize ?? Math.min(width, h);
  const box = size * 1.25;

  const beat = useAnimatedStyle(() => {
    const p = ((t.get() / LOOP) * beats) % 1;
    return { transform: [{ scale: 1 + 0.05 * thump(p) }] };
  });
  const glow = useAnimatedStyle(() => {
    const p = ((t.get() / LOOP) * beats) % 1;
    const k = thump(p);
    return { opacity: 0.45 + 0.55 * k, transform: [{ scale: 1 + 0.14 * k }] };
  });

  const [g0, g1] = c.tintGrad.rose;
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: "hidden", backgroundColor: g1 }, style]}>
      <LinearGradient pointerEvents="none" colors={[g0, g1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, width, height: h }}>
        {/* The glow, swelling and brightening with each beat. */}
        <Animated.View style={[{ position: "absolute", left: width / 2 - box / 2, top: cy - box / 2, width: box, height: box }, glow]}>
          <Svg width={box} height={box}>
            <Defs>
              <RadialGradient id="bandGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0.5" stopColor={c.glow.rose} stopOpacity={dark ? 0.55 : 0.45} />
                <Stop offset="1" stopColor={c.glow.rose} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={box / 2} cy={box / 2} r={box / 2} fill="url(#bandGlow)" />
          </Svg>
        </Animated.View>
        {/* The orb, beating; the bpm on its core. */}
        <Animated.View style={[{ position: "absolute", left: width / 2 - size / 2, top: cy - size / 2, width: size, height: size, alignItems: "center", justifyContent: "center" }, beat]}>
          {art}
          {center ? <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>{center}</View> : null}
        </Animated.View>
      </View>
      {children}
    </View>
  );
}
