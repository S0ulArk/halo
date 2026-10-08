// The motion pieces the score cards share: a ring that draws on, a number whose digits roll into place, a hero's
// breathing sheen, a lit progress fill, and the halo line (the icon's ring colours, used once: the active tab).
//
// All UI thread (Reanimated): a ring draws on through an animated strokeDashoffset, a number rolls its digits with
// transforms, the sheen breathes through one opacity. Nothing animates layout; nothing runs while its screen is out of
// view or the app is in the background; reduce motion shows every end state at once.
import * as React from "react";
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { HALO, HALO_DEEP } from "@/ui/calm";
import { REASE } from "@/ui/motion/easing";
import { reduceMotionNow, useAppActive, useReduceMotion } from "@/ui/motion/system";
import { BandInView } from "./BandHero";

/** A ring's draw-on and a number's roll share this length and curve, so the two land together. */
export const DRAW_MS = 1100;
const DRAW_EASE = Easing.bezier(0.16, 1, 0.3, 1);

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The halo's stops as an SVG gradient (top left → bottom right, as the icon draws it). */
function HaloStops({ id, deep, colors }: { id: string; deep?: boolean; colors?: readonly string[] }) {
  const stops = colors ?? (deep ? HALO_DEEP : HALO);
  return (
    <Defs>
      <SvgGradient id={id} x1="0.1" y1="0" x2="0.9" y2="1">
        {stops.map((s, i) => (
          <Stop key={i} offset={i / Math.max(1, stops.length - 1)} stopColor={s} />
        ))}
      </SvgGradient>
    </Defs>
  );
}

/** Goal and score keys that have had their completion pulse this session (one celebration per goal per day). */
const pulsed = new Set<string>();

export type HaloRingProps = {
  size: number;
  /** The fill, 0-1 (clamped); null draws the bare track. */
  progress: number | null;
  stroke?: number;
  /** The track under the arc. */
  track: string;
  /** The deeper halo, for a ring on a white card (the bright one washes out on white). */
  deep?: boolean;
  /** A solid arc in place of the halo (a family's ink where the colour carries meaning). */
  color?: string;
  /** A two-colour gradient arc (a family's vivid pair, calm.vivid): wins over `color`. */
  colors?: readonly string[];
  /** A soft wider stroke under the arc: the ring's glow. */
  glow?: boolean;
  /** Wait this long before drawing on (a cascade). */
  delay?: number;
  /** Once the ring is full, a brief halo pulse; the key makes it once per session (e.g. "2026-10-09:steps"). */
  celebrateKey?: string | null;
  style?: StyleProp<ViewStyle>;
  /** Drawn in the ring's middle. */
  children?: React.ReactNode;
};

/**
 * A score or goal ring: the track, then the arc drawn on from 12 o'clock in the halo gradient (or `color`). It draws
 * from empty on mount and from where it is to a new value on change, on the UI thread. A full ring with a
 * `celebrateKey` pulses once: a halo ring that swells and fades (transform and opacity only).
 */
export function HaloRing({ size, progress, stroke = 6, track, deep, color, colors, glow, delay = 0, celebrateKey, style, children }: HaloRingProps) {
  const id = React.useId().replace(/:/g, "");
  const pad = glow ? stroke : stroke / 2;
  const r = size / 2 - pad;
  const C = 2 * Math.PI * r;
  const target = progress === null || !Number.isFinite(progress) ? 0 : Math.max(0, Math.min(1, progress));
  const [still] = React.useState(() => reduceMotionNow());
  const p = useSharedValue(still ? target : 0);
  const pulse = useSharedValue(0);
  const full = target >= 0.999;
  React.useEffect(() => {
    if (reduceMotionNow()) {
      p.set(target);
      return;
    }
    p.set(withDelay(delay, withTiming(target, { duration: DRAW_MS, easing: DRAW_EASE })));
    if (full && celebrateKey && !pulsed.has(celebrateKey)) {
      pulsed.add(celebrateKey);
      // Lands just as the arc closes.
      pulse.set(0);
      pulse.set(withDelay(delay + DRAW_MS * 0.7, withTiming(1, { duration: 760, easing: REASE.outCubic })));
    }
    return () => cancelAnimation(p);
  }, [target, delay, full, celebrateKey, p, pulse]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - p.value), strokeOpacity: p.value > 0.004 ? 1 : 0 }));
  const halo = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - p.value), strokeOpacity: p.value > 0.004 ? 0.28 : 0 }));
  const ring = useAnimatedStyle(() => ({ opacity: pulse.value > 0 && pulse.value < 1 ? 0.75 * (1 - pulse.value) : 0, transform: [{ scale: 1 + 0.32 * pulse.value }] }));
  const paint = colors ? `url(#${id})` : (color ?? `url(#${id})`);
  return (
    <View style={[{ width: size, height: size }, style]}>
      {celebrateKey ? (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, width: size, height: size }, ring]}>
          <Svg width={size} height={size}>
            <HaloStops id={`${id}p`} deep={deep} />
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id}p)`} strokeWidth={Math.max(2, stroke * 0.6)} fill="none" />
          </Svg>
        </Animated.View>
      ) : null}
      {/* Rotated a quarter turn, so the arc starts at 12 o'clock. */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        {(colors || !color) && <HaloStops id={id} deep={deep} colors={colors} />}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {glow && <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={paint} strokeWidth={stroke * 2.2} strokeLinecap="round" fill="none" strokeDasharray={`${C} ${C}`} animatedProps={halo} />}
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={paint} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${C} ${C}`} animatedProps={arc} />
      </Svg>
      {children ? <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>{children}</View> : null}
    </View>
  );
}

/** A thin bar in the halo gradient, left → right: dividers, the active tab, a hero's accent rule. */
export function HaloLine({ width, height = 2, deep, opacity = 1, style }: { width?: number | `${number}%`; height?: number; deep?: boolean; opacity?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={deep ? HALO_DEEP : HALO}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[{ width: width ?? "100%", height, borderRadius: height / 2, opacity }, style]}
    />
  );
}

/** A progress fill with a sheen: the colour deepening to its end, so a bar reads as lit rather than flat. */
export function SheenFill({ color, radius, style }: { color: string; radius: number; style?: StyleProp<ViewStyle> }) {
  const hex = /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7) : null;
  return <LinearGradient pointerEvents="none" colors={hex ? [`${hex}a6`, hex] : [color, color]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderRadius: radius }, style]} />;
}

/**
 * A hero card's breathing light: a soft white wash from the top left that brightens and dims (one opacity on the UI
 * thread, 6 s a breath), while its screen is focused, the app is open and (on Today) the top cards are in view; still
 * under reduce motion. Place it first inside the card, under the content.
 */
export function HeroSheen({ radius, color = "rgba(255,255,255,0.55)" }: { radius: number; color?: string }) {
  const focused = useIsFocused();
  const active = useAppActive();
  const reduce = useReduceMotion();
  // Today turns this off once its top cards have scrolled away (elsewhere it is always on).
  const inView = React.useContext(BandInView);
  const running = focused && active && inView && !reduce;
  const o = useSharedValue(0.5);
  React.useEffect(() => {
    if (!running) {
      cancelAnimation(o);
      return;
    }
    o.set(withRepeat(withSequence(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), withTiming(0.25, { duration: 3000, easing: Easing.inOut(Easing.sin) })), -1, false));
    return () => cancelAnimation(o);
  }, [running, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius, overflow: "hidden" }, style]}>
      <LinearGradient colors={[color, "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.75, y: 0.75 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
    </Animated.View>
  );
}

// --- The rolling number ---

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** One digit's column: the digits 0-9 stacked, slid by a transform so `digit` shows; it rolls up from 0 on mount. */
function DigitColumn({ digit, line, textStyle, delay }: { digit: number; line: number; textStyle: StyleProp<TextStyle>; delay: number }) {
  const [still] = React.useState(() => reduceMotionNow());
  const y = useSharedValue(still ? digit : 0);
  React.useEffect(() => {
    y.set(reduceMotionNow() ? digit : withDelay(delay, withTiming(digit, { duration: DRAW_MS, easing: DRAW_EASE })));
    return () => cancelAnimation(y);
  }, [digit, delay, y]);
  const roll = useAnimatedStyle(() => ({ transform: [{ translateY: -y.value * line }] }));
  return (
    <View style={{ height: line, overflow: "hidden" }}>
      {/* The final digit, invisible, gives the column its width. */}
      <Text allowFontScaling={false} style={[textStyle, { opacity: 0 }]}>
        {DIGITS[digit]}
      </Text>
      <Animated.View style={[{ position: "absolute", top: 0, left: -8, right: -8, alignItems: "center" }, roll]}>
        {DIGITS.map((d) => (
          <Text key={d} allowFontScaling={false} style={textStyle}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * A number whose digits roll into place like a watch's date wheel, landing with the ring beside it (DRAW_MS). Each
 * digit is a column slid by one transform; anything else ("." "%" "--") is plain text. The whole is one accessible
 * text. `style` must carry the font, size, colour and a numeric `lineHeight`.
 */
export function RollingNumber({ text, lineHeight, style, delay = 0 }: { text: string; lineHeight: number; style: StyleProp<TextStyle>; delay?: number }) {
  const chars = text.split("");
  const face: StyleProp<TextStyle> = [style, { lineHeight, includeFontPadding: false }];
  // A different length re-keys the columns, so a changed digit count rolls fresh rather than reusing a column.
  return (
    <View key={chars.length} accessible accessibilityRole="text" accessibilityLabel={text} style={{ flexDirection: "row", alignItems: "flex-start", height: lineHeight }}>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitColumn key={i} digit={Number(ch)} line={lineHeight} textStyle={face} delay={delay + i * 40} />
        ) : (
          <Text key={i} allowFontScaling={false} style={face}>
            {ch}
          </Text>
        ),
      )}
    </View>
  );
}
