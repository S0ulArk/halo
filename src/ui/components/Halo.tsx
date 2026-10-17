// The motion pieces the score cards share: Apple Activity-style rings that draw on, a number whose digits roll into
// place, a hero's breathing sheen, a lit progress fill, and the halo line (the icon's ring colours, used once: the
// active tab).
//
// A ring is Apple's: a thick stroke (about a tenth of its diameter) with round ends over a track of its own hue at
// about 20 %, coloured along its arc from a slightly darker start to a lighter end. SVG has no sweep gradient, so the
// arc is drawn as two halves, each with a linear gradient along its chord (src/lib/charts.ts ringHalves), and its
// round ends are two discs: the tail in the start colour, the head in the colour where the arc ends, drawn last so a
// full ring's head overlaps its tail as Apple's does. It sweeps in on a spring (about 0.6 s, a slight overshoot), rings
// in a set 80 ms apart.
//
// All UI thread (Reanimated): a ring draws on through animated dash offsets and its head disc's position, a number
// rolls its digits with transforms, the sheen breathes through one opacity. Nothing animates layout; nothing runs
// while its screen is out of view or the app is in the background; reduce motion shows every end state at once.
import * as React from "react";
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { DATA_COLORS, recoveryColor } from "@/lib/bands";
import { clockArcPath, clockPoint, colorAt, ringHalves, ringShades } from "@/lib/charts";
import { formatValue } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { HALO, HALO_DEEP } from "@/ui/calm";
import { REASE } from "@/ui/motion/easing";
import { reduceMotionNow, useAppActive, useReduceMotion, entranceStill } from "@/ui/motion/system";
import { useTheme } from "@/ui/ThemeProvider";
import { BandInView } from "./BandHero";

/** A number's roll (and the meters that grow beside it) take this long. */
export const DRAW_MS = 1100;
const DRAW_EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** A ring's draw-on: a spring of about 0.6 s (Reanimated's perceptual 400 ms is 1.5× in real time) with a slight overshoot. */
export const RING_SPRING = { duration: 400, dampingRatio: 0.74 } as const;
/** Rings in a set start this far apart. */
export const RING_STAGGER = 80;
/** About when a ring's spring has landed: a number rolling beside it takes this long, so the two arrive together. */
export const RING_LAND_MS = 650;
/** Apple's proportion: a ring's stroke is at least this share of its diameter. */
export const RING_STROKE = 0.1;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const clamp01 = (v: number) => {
  "worklet";
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
};
const fracOf = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? 0 : Math.max(0, Math.min(1, v)));

/**
 * A ring's progress on the UI thread: from empty on mount (at its value at once when `still`), then from where it is
 * to each new value, on the ring spring after `delay`; at once under reduce motion.
 */
function useRingProgress(target: number, delay: number, still: boolean): SharedValue<number> {
  const [atRest] = React.useState(() => still || reduceMotionNow());
  const p = useSharedValue(atRest ? target : 0);
  const mounted = React.useRef(false);
  React.useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (reduceMotionNow() || (first && atRest)) {
      p.set(target);
      return;
    }
    p.set(withDelay(delay, withSpring(target, RING_SPRING)));
    return () => cancelAnimation(p);
  }, [target, delay, atRest, p]);
  return p;
}

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

/** A faint stretch of a ring's track (a target or a band zone) as shares 0-1 of its sweep. */
export type RingSegment = { from: number; to: number; color: string };

type RingArcProps = {
  /** Unique within its Svg: names the gradients. */
  id: string;
  cx: number;
  cy: number;
  r: number;
  stroke: number;
  /** Where the arc starts (degrees clockwise from 12 o'clock) and the most it sweeps: 360 is a ring, less a gauge. */
  start?: number;
  sweep?: number;
  /** The arc's colours from its start to its end (two or more). */
  colors: readonly string[];
  /** The track under the arc; null for none. */
  track?: string | null;
  segments?: readonly RingSegment[];
  /** Thin ticks across the ring at these shares of the sweep, over the arc (a target's ends). */
  ticks?: readonly number[];
  tickColor?: string;
  /** A soft wider stroke under the arc. */
  glow?: boolean;
  progress: SharedValue<number>;
};

/**
 * One ring on an Svg: the track, any faint stretches on it, then the arc in two gradient halves (butt ends, the first
 * running a degree past the joint so the halves meet without a seam), the tail disc, the head disc and the ticks.
 */
function RingArc({ id, cx, cy, r, stroke, start = 0, sweep = 360, colors, track, segments, ticks, tickColor, glow, progress: p }: RingArcProps) {
  const key = colors.join("|");
  const geo = React.useMemo(() => {
    const list = key.split("|");
    const halves = ringHalves(cx, cy, r, start, sweep);
    return {
      halves,
      grads: halves.map((h) => h.stops.map((s) => ({ offset: s.offset, color: colorAt(list, s.t) }))),
      tail: clockPoint(cx, cy, r, start),
      tailColor: colorAt(list, 0),
      list,
      positions: list.map((_, i) => i / Math.max(1, list.length - 1)),
      trackPath: sweep >= 360 ? null : clockArcPath(cx, cy, r, start, start + sweep),
    };
  }, [cx, cy, r, start, sweep, key]);
  const { list, positions } = geo;
  // Each half's length; the first half's path runs a degree further (its dash shows that extra only once it is full).
  const L = geo.halves[0].length;
  const L1 = (Math.PI * r * (sweep / 2 + 1)) / 180;
  const first = (q: number) => {
    "worklet";
    const vis = q >= 0.999 ? L1 : L * q;
    return { strokeDashoffset: L1 - vis, strokeOpacity: q > 0.001 ? 1 : 0 };
  };
  const second = (q: number) => {
    "worklet";
    return { strokeDashoffset: L * (1 - q), strokeOpacity: q > 0.001 ? 1 : 0 };
  };
  const a1 = useAnimatedProps(() => first(clamp01(p.value * 2)));
  const a2 = useAnimatedProps(() => second(clamp01(p.value * 2 - 1)));
  const g1 = useAnimatedProps(() => first(clamp01(p.value * 2)));
  const g2 = useAnimatedProps(() => second(clamp01(p.value * 2 - 1)));
  const tail = useAnimatedProps(() => ({ fillOpacity: p.value > 0.001 ? 1 : 0 }));
  const head = useAnimatedProps(() => {
    const v = clamp01(p.value);
    const a = ((start + sweep * v) * Math.PI) / 180;
    return { cx: cx + r * Math.sin(a), cy: cy - r * Math.cos(a), fill: interpolateColor(v, positions, list), fillOpacity: v > 0.001 ? 1 : 0 };
  });
  const tick = (t: number, i: number) => {
    const deg = start + sweep * Math.max(0, Math.min(1, t));
    const a = clockPoint(cx, cy, r - stroke / 2 - 2.5, deg);
    const b = clockPoint(cx, cy, r + stroke / 2 + 2.5, deg);
    return <Line key={`t${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={tickColor} strokeWidth={2} strokeLinecap="round" />;
  };
  return (
    <G>
      <Defs>
        {geo.halves.map((h, k) => (
          <SvgGradient key={k} id={`${id}h${k}`} gradientUnits="userSpaceOnUse" x1={h.from.x} y1={h.from.y} x2={h.to.x} y2={h.to.y}>
            {geo.grads[k].map((s, i) => (
              <Stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </SvgGradient>
        ))}
      </Defs>
      {track ? geo.trackPath ? <Path d={geo.trackPath} stroke={track} strokeWidth={stroke} strokeLinecap="round" fill="none" /> : <Circle cx={cx} cy={cy} r={r} stroke={track} strokeWidth={stroke} fill="none" /> : null}
      {segments?.map((s, i) => {
        const d = clockArcPath(cx, cy, r, start + sweep * Math.max(0, s.from), start + sweep * Math.min(1, s.to));
        return d ? <Path key={`s${i}`} d={d} stroke={s.color} strokeWidth={stroke} strokeLinecap="round" fill="none" /> : null;
      })}
      {glow && (
        <G opacity={0.28}>
          <AnimatedPath d={geo.halves[0].d} stroke={`url(#${id}h0)`} strokeWidth={stroke * 2.2} fill="none" strokeDasharray={[L1, L1]} animatedProps={g1} />
          <AnimatedPath d={geo.halves[1].d} stroke={`url(#${id}h1)`} strokeWidth={stroke * 2.2} fill="none" strokeDasharray={[L, L]} animatedProps={g2} />
        </G>
      )}
      <AnimatedPath d={geo.halves[0].d} stroke={`url(#${id}h0)`} strokeWidth={stroke} fill="none" strokeDasharray={[L1, L1]} animatedProps={a1} />
      <AnimatedPath d={geo.halves[1].d} stroke={`url(#${id}h1)`} strokeWidth={stroke} fill="none" strokeDasharray={[L, L]} animatedProps={a2} />
      <AnimatedCircle cx={geo.tail.x} cy={geo.tail.y} r={stroke / 2} fill={geo.tailColor} animatedProps={tail} />
      <AnimatedCircle r={stroke / 2} animatedProps={head} />
      {ticks?.map(tick)}
    </G>
  );
}

/** Goal and score keys that have had their completion pulse this session (one celebration per goal per day). */
const pulsed = new Set<string>();

export type HaloRingProps = {
  size: number;
  /** The fill, 0-1 (clamped); null draws the bare track. */
  progress: number | null;
  /** The ring's stroke; never thinner than a tenth of `size` (the Activity ring's proportion). */
  stroke?: number;
  /** The track under the arc. */
  track: string;
  /** The deeper halo, for a ring on a white card (the bright one washes out on white). */
  deep?: boolean;
  /** One colour for the arc (a family's ink where the colour carries meaning), shaded darker → lighter along it. */
  color?: string;
  /** The arc's own gradient, start → end (a family's vivid pair, calm.vivid): wins over `color`. */
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
 * A score or goal ring, Apple's way: the track, then the arc sweeping in from 12 o'clock on a spring, a slightly
 * darker start to a lighter end in its colour (or `colors`, or the halo). It draws from empty on mount and from where
 * it is to a new value on change, on the UI thread. A full ring with a `celebrateKey` pulses once: a ring that swells
 * and fades (transform and opacity only).
 */
export function HaloRing({ size, progress, stroke = 6, track, deep, color, colors, glow, delay = 0, celebrateKey, style, children }: HaloRingProps) {
  const id = React.useId().replace(/:/g, "");
  const sw = Math.max(stroke, Math.round(size * RING_STROKE * 2) / 2);
  const pad = glow ? sw * 1.1 : sw / 2;
  const r = size / 2 - pad;
  const target = fracOf(progress);
  const p = useRingProgress(target, delay, false);
  const pulse = useSharedValue(0);
  const full = target >= 0.999;
  React.useEffect(() => {
    if (reduceMotionNow() || !full || !celebrateKey || pulsed.has(celebrateKey)) return;
    pulsed.add(celebrateKey);
    // Lands just as the arc closes.
    pulse.set(0);
    pulse.set(withDelay(delay + RING_LAND_MS * 0.8, withTiming(1, { duration: 760, easing: REASE.outCubic })));
  }, [full, celebrateKey, delay, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: pulse.value > 0 && pulse.value < 1 ? 0.75 * (1 - pulse.value) : 0, transform: [{ scale: 1 + 0.32 * pulse.value }] }));
  const shadesKey = colors?.length ? colors.join("|") : color ? `c:${color}` : deep ? "deep" : "halo";
  const stops = React.useMemo<readonly string[]>(() => (colors?.length ? colors : color ? ringShades(color) : deep ? HALO_DEEP : HALO),
    // The key holds the colours' content: a parent rebuilding the array each render keeps the same stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shadesKey]);
  return (
    <View style={[{ width: size, height: size }, style]}>
      {celebrateKey ? (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, width: size, height: size }, ring]}>
          <Svg width={size} height={size}>
            <HaloStops id={`${id}p`} deep={deep} colors={stops} />
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id}p)`} strokeWidth={Math.max(2, sw * 0.6)} fill="none" />
          </Svg>
        </Animated.View>
      ) : null}
      <Svg width={size} height={size}>
        <RingArc id={id} cx={size / 2} cy={size / 2} r={r} stroke={sw} colors={stops} track={track} glow={glow} progress={p} />
      </Svg>
      {children ? <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>{children}</View> : null}
    </View>
  );
}

/** One ring of a set: its share (null: the bare track) and its hue; the gradient and the track come from the hue. */
export type RingSpec = {
  /** 0-1 (clamped); null draws the track alone. */
  progress: number | null;
  /** The ring's hue: its arc is shaded darker → lighter along it, its track the hue at 20 %. */
  color: string;
  /** The arc's own gradient, start → end: wins over the shades of `color`. */
  colors?: readonly string[];
  /** The track (default `color` at 20 %). */
  track?: string;
  /** Faint stretches on the track (a target, a band zone). */
  segments?: readonly RingSegment[];
  /** Thin ticks across the ring, over the arc, at these shares (a target's ends). */
  ticks?: readonly number[];
  tickColor?: string;
};

export type ActivityRingsProps = {
  size: number;
  /** Outermost first. */
  rings: readonly RingSpec[];
  /** Each ring's stroke (default 11.5 % of `size` for a set, 10.5 % for one ring). */
  stroke?: number;
  /** The air between two rings (default about 1 % of `size`). */
  gap?: number;
  /** An open arc in place of full rings (a gauge): where it starts, degrees clockwise from 12 o'clock, and its sweep. */
  arc?: { start: number; sweep: number };
  /** Wait this long before the first ring sweeps in; the rest follow 80 ms apart. */
  delay?: number;
  /** Start at the values (no draw-on on mount); later changes still sweep. */
  still?: boolean;
  /** The set's spoken description; without one the rings are decoration and the caller speaks for them. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Drawn in the middle of the innermost ring. */
  children?: React.ReactNode;
};

/**
 * Concentric Activity rings (outermost first) on one Svg, each sweeping in on the ring spring, staggered 80 ms; or a
 * single ring (or a gauge's open arc with `arc`) with its content in the middle. Thick round-ended strokes over tracks
 * of their own hue, each coloured along its arc.
 */
export function ActivityRings({ size, rings, stroke, gap, arc, delay = 0, still, accessibilityLabel, style, children }: ActivityRingsProps) {
  const id = React.useId().replace(/:/g, "");
  const sw = stroke ?? Math.round(size * (rings.length > 1 ? 0.115 : 0.105) * 2) / 2;
  const g = gap ?? Math.max(1.5, Math.round(size * 0.012 * 2) / 2);
  // Room outside the outer ring for ticks that overhang it.
  const overhang = rings.some((r) => r.ticks?.length) ? 3 : 0;
  return (
    <View accessible={!!accessibilityLabel} accessibilityRole={accessibilityLabel ? "image" : undefined} accessibilityLabel={accessibilityLabel} style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        {rings.map((ring, i) => (
          <SetRing key={i} id={`${id}r${i}`} ring={ring} cx={size / 2} cy={size / 2} r={size / 2 - overhang - sw / 2 - i * (sw + g)} stroke={sw} arc={arc} delay={delay + i * RING_STAGGER} still={!!still} />
        ))}
      </Svg>
      {children ? (
        <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

function SetRing({ id, ring, cx, cy, r, stroke, arc, delay, still }: { id: string; ring: RingSpec; cx: number; cy: number; r: number; stroke: number; arc?: { start: number; sweep: number }; delay: number; still: boolean }) {
  const p = useRingProgress(fracOf(ring.progress), delay, still);
  const key = ring.colors?.length ? ring.colors.join("|") : ring.color;
  const stops = React.useMemo<readonly string[]>(() => (ring.colors?.length ? ring.colors : ringShades(ring.color)),
    // Keyed on the colours' content, not the array's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]);
  return (
    <RingArc
      id={id}
      cx={cx}
      cy={cy}
      r={Math.max(1, r)}
      stroke={stroke}
      start={arc?.start}
      sweep={arc?.sweep}
      colors={stops}
      track={ring.track ?? alpha(ring.color, 0.2)}
      segments={ring.segments}
      ticks={ring.ticks}
      tickColor={ring.tickColor}
      progress={p}
    />
  );
}

/**
 * Today's three scores as concentric Activity rings: Recovery outermost (its band's colour: green when ready), Sleep
 * performance in the middle (indigo), Strain innermost (orange; Strain runs 0-21, so its ring is strain / 21). A null
 * score leaves its track bare. Spoken as one image with all three values.
 */
export function ScoreRings({
  recovery,
  sleep,
  strain,
  size = 148,
  delay,
  still,
  style,
  children,
}: {
  recovery: number | null;
  sleep: number | null;
  strain: number | null;
  size?: number;
  delay?: number;
  still?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { c } = useTheme();
  const rings = React.useMemo<RingSpec[]>(
    () => [
      { progress: recovery === null ? null : recovery / 100, color: recovery === null ? c.recoveryGreen : c[DATA_COLORS[recoveryColor(recovery)].fill] },
      { progress: sleep === null ? null : sleep / 100, color: c.sleep },
      { progress: strain === null ? null : strain / 21, color: c.strain },
    ],
    [recovery, sleep, strain, c],
  );
  const said = (v: number | null, text: string) => (v === null ? "no score" : text);
  const label = `Recovery ${said(recovery, `${formatValue("int", recovery)} percent`)}, Sleep ${said(sleep, `${formatValue("int", sleep)} percent`)}, Strain ${said(strain, `${formatValue("decimal1", strain)} of 21`)}`;
  return (
    <ActivityRings size={size} rings={rings} delay={delay} still={still} accessibilityLabel={label} style={style}>
      {children}
    </ActivityRings>
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
function DigitColumn({ digit, line, textStyle, delay, duration }: { digit: number; line: number; textStyle: StyleProp<TextStyle>; delay: number; duration: number }) {
  const [still] = React.useState(() => entranceStill());
  const y = useSharedValue(still ? digit : 0);
  React.useEffect(() => {
    y.set(entranceStill() ? digit : withDelay(delay, withTiming(digit, { duration, easing: DRAW_EASE })));
    return () => cancelAnimation(y);
  }, [digit, delay, duration, y]);
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
 * A number whose digits roll into place like a watch's date wheel, landing with the ring beside it (`duration`: DRAW_MS
 * by default, RING_LAND_MS beside an Activity ring). Each digit is a column slid by one transform; anything else ("."
 * "%" "--") is plain text. The whole is one accessible text. `style` must carry the font, size, colour and a numeric
 * `lineHeight`.
 */
export function RollingNumber({ text, lineHeight, style, delay = 0, duration = DRAW_MS }: { text: string; lineHeight: number; style: StyleProp<TextStyle>; delay?: number; duration?: number }) {
  const chars = text.split("");
  const face: StyleProp<TextStyle> = [style, { lineHeight, includeFontPadding: false }];
  // A different length re-keys the columns, so a changed digit count rolls fresh rather than reusing a column.
  return (
    <View key={chars.length} accessible accessibilityRole="text" accessibilityLabel={text} style={{ flexDirection: "row", alignItems: "flex-start", height: lineHeight }}>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitColumn key={i} digit={Number(ch)} line={lineHeight} textStyle={face} delay={delay + i * 40} duration={duration} />
        ) : (
          <Text key={i} allowFontScaling={false} style={face}>
            {ch}
          </Text>
        ),
      )}
    </View>
  );
}
