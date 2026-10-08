// The band on Home: an original illustration of four woven bands (assets/bands.png, drawn for Halo; no product photo),
// always gently in motion. One linear clock on the UI
// thread drives it all: the photo drifts across the row of bands and back, breathes in and out, tilts a few degrees in
// 3D (perspective), and a soft streak of light sweeps over it now and then, like light catching the bands. Every period
// divides the clock's loop, so the restart is seamless. The motion stops whenever the tile can't be seen (another
// screen on top, the app in the background, Home scrolled past it) and under reduced motion.
import * as React from "react";
import { AppState, Image, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { useReduceMotion } from "@/ui/motion/system";

const PHOTO = require("../../../assets/bands.png");
/** The picture's width over its height. */
const ASPECT = 1312 / 1048;
/** The clock's loop in seconds; every period below divides it. */
const LOOP = 60;
const PAN = 12;
const ZOOM = 10;
const TILT_Y = 15;
const TILT_X = 20;
const SHEEN = 6;

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

const wave = (t: number, period: number) => {
  "worklet";
  return Math.sin((t / period) * 2 * Math.PI);
};

export function BandHero({ width, height, footer = 0, radius = 28, style, children }: { width: number; height: number; footer?: number; radius?: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const focused = useIsFocused();
  const inView = React.useContext(BandInView);
  const appActive = useAppActive();
  const reduce = useReduceMotion();
  const running = focused && inView && appActive && !reduce;

  const t = useSharedValue(0);
  React.useEffect(() => {
    if (!running) {
      cancelAnimation(t);
      return;
    }
    // From wherever it stopped, a whole loop at a time.
    const from = t.get();
    t.set(withRepeat(withTiming(from + LOOP, { duration: LOOP * 1000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [running, t]);

  // The photo fills the tile's height with room to spare, so it can drift across the row of bands.
  const ph = height * 1.08;
  const pw = ph * ASPECT;
  const travel = Math.max(0, pw - width * 1.1);
  const photo = useAnimatedStyle(() => {
    const v = t.get();
    return {
      transform: [
        { perspective: 600 },
        { translateX: -travel * (0.5 + 0.5 * wave(v, PAN)) },
        { translateY: 4 * wave(v, ZOOM / 2) },
        { scale: 1.06 + 0.05 * wave(v, ZOOM) },
        { rotateY: `${6 * wave(v, TILT_Y)}deg` },
        { rotateX: `${3 * wave(v, TILT_X)}deg` },
      ],
    };
  });
  // The light: one quick sweep in the first third of each period, then rest.
  const sheen = useAnimatedStyle(() => {
    const p = (t.get() / SHEEN) % 1;
    const k = Math.min(1, p / 0.35);
    return { opacity: p < 0.35 ? Math.sin(k * Math.PI) : 0, transform: [{ translateX: -width + k * (width * 2.2) }, { rotate: "18deg" }] };
  });

  return (
    <View style={[{ width, height, borderRadius: radius, overflow: "hidden", backgroundColor: "#eef0f3" }, style]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, width, height: height - footer * 0.35 }}>
        <Animated.View style={[{ position: "absolute", top: (height - footer * 0.35 - ph) / 2, left: 0, width: pw, height: ph }, photo]}>
          <Image source={PHOTO} resizeMode="cover" style={{ width: "100%", height: "100%" }} fadeDuration={0} />
        </Animated.View>
        {!reduce && (
          <Animated.View style={[{ position: "absolute", top: -height * 0.2, left: 0, width: width * 0.45, height: height * 1.4 }, sheen]}>
            <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.38)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
          </Animated.View>
        )}
      </View>
      {children}
    </View>
  );
}
