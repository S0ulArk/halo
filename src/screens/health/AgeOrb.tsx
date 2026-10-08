import * as React from "react";
import { StyleSheet, View, type GestureResponderEvent, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useIsFocused } from "expo-router";
import { AGE_LABEL, formatValue } from "@/lib/format";
import { reasonCopy, type ReasonCode } from "@/lib/reasons";
import { uid } from "@/lib/utils";
import { DARK, MetricTags, ReasonPlaceholder, Txt, useAfterTransition, useTheme } from "@/ui";
import { REASE } from "@/ui/motion/easing";
import { reduceMotionNow, useAppActive, useReduceMotion } from "@/ui/motion/system";
import type { ColorToken } from "@/ui/theme";
import { ageDelta } from "./format";
import { blobRadius, hexRGB, mixRGB, ORB, orbColors, particleCount, particleLayer, rgba, rng, shadeRGB, swirlVelocity, type RGB } from "./orb";

export type AgeOrbProps = {
  /** Pulse Age, the number in the middle. */
  age: number | null;
  /** Pulse Age minus chronological age; positive is older. */
  deltaYears: number | null;
  provisional?: boolean;
  /** Box size in px (default 300). Below 160 it drops the delta line and does not respond to touch. */
  size?: number;
  reason?: ReasonCode | null;
  /**
   * The orb alone, for a Calm card that sets the number beside it: no number, labels or glow, no spiral-in, and hidden
   * from screen readers (the number beside it speaks). It still turns under a finger at any size.
   */
  bare?: boolean;
};

const BANDS = 8;
const STEPS = 128;
/** The settled frame the web draws for reduced motion and the compact orb: the layers are drawn at this time. */
const SETTLED_T = 10;
/** The SVG frame's particle budget, and the share of dust motes it keeps. */
const MAX_PARTICLES = 640;
const DUST_EVERY = 3;
/** A finger that moves this far is scrolling, not holding the orb. */
const TOUCH_SLOP = 10;
const M = ORB.motion;
const S = M.swirl;
/** The release's coast: the old native decay (`deceleration` per ms) as a timing of the same distance and start speed. */
const COAST_MS = 2300;
const COAST_K = (1 - S.deceleration) * COAST_MS;
const COAST_NORM = 1 - Math.exp(-COAST_K);
const coast = (t: number) => {
  "worklet";
  return (1 - Math.exp(-COAST_K * t)) / COAST_NORM;
};

// --- The ambient waves, from one linear clock in seconds (UI-thread worklets) ---

/** A wave's phase in [0, 1): the clock in cycles of `period` seconds, wrapped. */
const phase = (t: number, period: number) => {
  "worklet";
  const x = t / period;
  return x - Math.floor(x);
};
/** One smooth cycle lo → hi → lo per period: (1 − cos 2πx) / 2. */
const wave = (t: number, period: number, lo: number, hi: number) => {
  "worklet";
  return lo + (hi - lo) * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase(t, period)));
};
/** `k` whole turns per loop, as a rotation. */
const turns = (t: number, k: number) => {
  "worklet";
  return `${(360 * k * t) / M.loop}deg`;
};

/**
 * Pulse Age hero (docs/design/orb.md), ported from the web's canvas AgeOrb: the same noise-edged blob, rim colours by
 * delta, black core, outer glow, rim light and seeded particle field. The canvas redraws every frame; here each part
 * is a static SVG drawn once, and only the views around them move (transform and opacity, Reanimated styles computed
 * by worklets on the UI thread), so the motion costs no JS per frame:
 * - the glow and the body breathe, the core shimmers, the rim's particles twinkle and sway;
 * - the inner particles (those that can turn without crossing the lobed outline) drift in two layers turning opposite
 *   ways at different speeds, the smaller one twinkling, and spiral in on mount;
 * - press and hold spins the inner field up and gathers it in, with a light haptic; release coasts it down.
 * The loops stop when the screen loses focus, the app goes to the background or after 30 s untouched; reduce motion
 * shows the settled frame alone.
 */
export function AgeOrb({ age, deltaYears, provisional = false, size = 300, reason, bare = false }: AgeOrbProps) {
  const { c } = useTheme();
  const has = age !== null && deltaYears !== null;
  const delta = has ? deltaYears : null;
  const small = size < 160;
  const d = delta !== null ? ageDelta(delta) : null;
  const same = d !== null && delta !== null && formatValue("decimal1", Math.abs(delta)) === "0.0";
  const r = reasonCopy(reason);
  const label = has
    ? `${AGE_LABEL} ${formatValue("decimal1", age)}, ${same ? "same as your age" : `${d!.text} than your age`}${provisional ? ", provisional" : ""}`
    : `${AGE_LABEL} unavailable. ${r.long}`;

  // On a screen being pushed, the orb (hundreds of SVG particles) is drawn once the slide has landed, then spirals in
  // with its numbers: the slide itself runs over an empty box.
  const opened = useAfterTransition();

  // --- Drivers: an entry, one linear clock (seconds) for every ambient loop, and the press swirl (turns, gather). ---
  // A bare orb (Calm) skips the spiral-in: it is drawn settled.
  const [entered] = React.useState(() => bare || reduceMotionNow());
  const enter = useSharedValue(entered ? 1 : 0);
  const clock = useSharedValue(0);
  const spin = useSharedValue(0);
  const gather = useSharedValue(0);
  const a = useOrbStyles(enter, clock, spin, gather);

  React.useEffect(() => {
    if (entered || !opened) return;
    enter.set(withTiming(1, { duration: M.enter.duration, easing: REASE.outCubic }));
    return () => cancelAnimation(enter);
  }, [enter, entered, opened]);

  const focused = useIsFocused();
  const appActive = useAppActive();
  const reduce = useReduceMotion();
  const live = focused && appActive && !reduce && opened;

  // The ambient clock runs the whole time the orb is in view with the app open (the person asked for it always moving;
  // reduced motion still holds it still). Driven imperatively, so a touch never re-renders the orb.
  const ambient = React.useRef<{ running: boolean; idle: ReturnType<typeof setTimeout> | null }>({ running: false, idle: null });
  const settle = React.useCallback(() => {
    const s = ambient.current;
    if (s.idle) clearTimeout(s.idle);
    if (s.running) cancelAnimation(clock);
    s.running = false;
    s.idle = null;
  }, [clock]);
  const wake = React.useCallback(() => {
    const s = ambient.current;
    if (s.idle) clearTimeout(s.idle);
    if (!s.running) {
      s.running = true;
      // The clock keeps its reading across pauses: each loop runs from where it stopped for a whole number of cycles
      // of every wave and turns of every drift, so the restart is seamless.
      scheduleOnUI(() => {
        "worklet";
        const from = clock.get();
        clock.set(withRepeat(withTiming(from + M.loop, { duration: M.loop * 1000, easing: REASE.linear }), -1, false));
      });
    }
  }, [clock]);
  React.useEffect(() => {
    if (!live) return;
    wake();
    return settle;
  }, [live, wake, settle]);

  // --- Press and hold (a bare orb turns at any size) ---
  const interactive = (bare || !small) && !reduce;
  const press = React.useRef<{ t0: number; x: number; y: number } | null>(null);
  React.useEffect(
    () => () => {
      cancelAnimation(spin);
      cancelAnimation(gather);
    },
    [spin, gather],
  );

  const release = React.useCallback(() => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    gather.set(withTiming(0, { duration: 700, easing: REASE.standard }));
    // Coast down from the speed it had reached: about a tenth of a turn over a second and a half.
    const distance = swirlVelocity(Date.now() - p.t0) / (1 - S.deceleration);
    scheduleOnUI(() => {
      "worklet";
      cancelAnimation(spin);
      spin.set(withTiming(spin.get() + distance, { duration: COAST_MS, easing: coast }));
    });
    if (live) wake();
  }, [gather, spin, live, wake]);

  const onTouchStart = React.useCallback(
    (e: GestureResponderEvent) => {
      if (!interactive || press.current || e.nativeEvent.touches.length > 1) return;
      press.current = { t0: Date.now(), x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      gather.set(withTiming(1, { duration: 400, easing: REASE.outCubic }));
      // Relative turns from where the field stopped: a ramp up, then a turn per period. Each repeat restarts on a whole
      // turn, so it is seamless.
      scheduleOnUI(() => {
        "worklet";
        cancelAnimation(spin);
        const from = spin.get();
        spin.set(
          withSequence(
            withTiming(from + S.rampTurns, { duration: S.ramp, easing: REASE.inQuad }),
            withRepeat(withTiming(from + S.rampTurns + 1, { duration: S.period, easing: REASE.linear }), -1, false),
          ),
        );
      });
      if (live) wake();
    },
    [interactive, gather, spin, live, wake],
  );
  const onTouchMove = React.useCallback(
    (e: GestureResponderEvent) => {
      const p = press.current;
      if (p && (Math.abs(e.nativeEvent.pageX - p.x) > TOUCH_SLOP || Math.abs(e.nativeEvent.pageY - p.y) > TOUCH_SLOP)) release();
    },
    [release],
  );

  // --- The layers: drawn once per size, delta and theme; the animated tree around them is built once too. ---
  // The core is dark in both schemes (the person asked for the dark centre back), so its text is always the dark
  // scheme's: light on the deep core, which reads as part of the orb rather than printed over it.
  const art = React.useMemo(() => (opened ? drawOrb(size, delta, small, (t: ColorToken) => hexRGB(c[t]), hexRGB(DARK.orbCore), hexRGB(DARK.orbHighlight)) : null), [opened, size, delta, small, c]);
  const layers = React.useMemo(() => {
    if (!art) return null;
    const place = (half: number): ViewStyle => ({ position: "absolute", left: size / 2 - half, top: size / 2 - half, width: 2 * half, height: 2 * half });
    return (
      <>
        {/* Calm's bare orb has no glow around it. */}
        {!bare && (
          <Animated.View pointerEvents="none" style={[place(art.glow.half), a.glow]}>
            {art.glow.node}
          </Animated.View>
        )}
        {/* Everything inside the outline breathes with it. */}
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: size, height: size }, a.breath]}>
          <Animated.View style={[place(art.body.half), a.body]}>{art.body.node}</Animated.View>
          <Animated.View style={[place(art.shimmer.half), a.shimmer]}>{art.shimmer.node}</Animated.View>
          {art.twinkle && <Animated.View style={[place(art.twinkle.half), a.twinkle]}>{art.twinkle.node}</Animated.View>}
          {art.inner && (
            <Animated.View style={[place(art.inner.half), a.inner]}>
              <Animated.View style={[StyleSheet.absoluteFill, a.driftA]}>{art.inner.a}</Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, a.driftB]}>{art.inner.b}</Animated.View>
            </Animated.View>
          )}
        </Animated.View>
      </>
    );
  }, [art, a, size, bare]);

  const deltaColor: string = delta !== null && delta <= ORB.greenText ? DARK.optimal : same ? DARK.orbTextMuted : DARK.orbDeltaText;
  const textStyle = React.useMemo<ViewStyle>(() => ({ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: size * 0.14 }), [size]);

  return (
    <View
      // A bare orb is decoration beside its number, which speaks for it.
      accessible={!bare}
      accessibilityRole={bare ? undefined : "image"}
      accessibilityLabel={bare ? undefined : label}
      importantForAccessibility={bare ? "no-hide-descendants" : "auto"}
      style={{ width: size, height: size }}
      // Raw touches, not a responder: a card around the orb (the Health hub's) still gets its tap, and a scroll still scrolls.
      onTouchStart={interactive ? onTouchStart : undefined}
      onTouchMove={interactive ? onTouchMove : undefined}
      onTouchEnd={interactive ? release : undefined}
      onTouchCancel={interactive ? release : undefined}
    >
      {layers}
      {!bare && (
        <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={[textStyle, a.text]}>
          <Txt role="value" size={small ? Math.round(size * 0.25) : Math.round(size * 0.15)} lineHeight={small ? Math.round(size * 0.25) : Math.round(size * 0.16)} tracking={-0.01} color={has ? DARK.orbText : DARK.orbTextMuted} align="center">
            {formatValue("decimal1", has ? age : null)}
          </Txt>
          <Txt
            role="label"
            size={small ? Math.max(9, Math.round(size * 0.09)) : Math.round(7 + size * 0.023)}
            lineHeight={small ? Math.max(9, Math.round(size * 0.09)) : Math.round((7 + size * 0.023) * 1.25)}
            color={DARK.orbTextMuted}
            align="center"
            style={{ marginTop: small ? 2 : 6 }}
          >
            {AGE_LABEL}
          </Txt>
          {!small && d && (
            <Txt role="body" size={Math.round(8 + size * 0.024)} lineHeight={Math.round((8 + size * 0.024) * 1.25)} weight={600} color={deltaColor} align="center" style={{ marginTop: 10, fontVariant: ["tabular-nums"] }}>
              {d.text}
            </Txt>
          )}
          {!small && !has && <ReasonPlaceholder reason={reason} size="sm" style={{ marginTop: 12, justifyContent: "center" }} />}
          {!small && has && provisional && <MetricTags provisional style={{ marginTop: 12 }} />}
        </Animated.View>
      )}
    </View>
  );
}

/** Every layer's style from the four drivers: worklets evaluated on the UI thread, one per animated view. */
function useOrbStyles(enter: SharedValue<number>, clock: SharedValue<number>, spin: SharedValue<number>, gather: SharedValue<number>) {
  const glow = useAnimatedStyle(() => ({
    opacity: enter.value * wave(clock.value, M.breath, M.glowDim, 1),
    transform: [{ scale: wave(clock.value, M.breath, 1, 1 + M.glowScale) + gather.value * S.glowGrow }],
  }));
  const breath = useAnimatedStyle(() => ({ transform: [{ scale: wave(clock.value, M.breath, 1, 1 + M.breathScale) + gather.value * S.bodyGrow }] }));
  const body = useAnimatedStyle(() => ({ opacity: M.enter.body + (1 - M.enter.body) * enter.value }));
  const shimmer = useAnimatedStyle(() => ({ opacity: enter.value * wave(clock.value, M.shimmer, 0.3, 1), transform: [{ rotate: turns(clock.value, M.turnsShimmer) }] }));
  // Starts full and dims mid-cycle, so the settled frame (reduce motion) shows the rim at full strength.
  const twinkle = useAnimatedStyle(() => ({
    opacity: enter.value * wave(clock.value, M.twinkle, 1, 0.35),
    transform: [{ rotate: `${wave(clock.value, M.sway, -M.swayDeg, M.swayDeg)}deg` }, { scale: 1 + (S.rimGather - 1) * gather.value }],
  }));
  const inner = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { rotate: `${360 * spin.value}deg` },
      { rotate: `${M.enter.turnDeg * (1 - enter.value)}deg` },
      { scale: (M.enter.scale + (1 - M.enter.scale) * enter.value) * (1 + (S.gather - 1) * gather.value) },
    ],
  }));
  const driftA = useAnimatedStyle(() => ({ transform: [{ rotate: turns(clock.value, M.turnsA) }] }));
  const driftB = useAnimatedStyle(() => ({ opacity: wave(clock.value, M.twinkleInner, 1, 0.45), transform: [{ rotate: turns(clock.value, M.turnsB) }] }));
  const text = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: 4 * (1 - enter.value) }] }));
  return React.useMemo(() => ({ glow, breath, body, shimmer, twinkle, inner, driftA, driftB, text }), [glow, breath, body, shimmer, twinkle, inner, driftA, driftB, text]);
}

type Layer = { half: number; node: React.ReactNode };
type OrbArt = { glow: Layer; body: Layer; shimmer: Layer; twinkle: Layer | null; inner: { half: number; a: React.ReactNode; b: React.ReactNode } | null };

/**
 * A square SVG `2 × half` wide with its origin at the centre, so every layer shares the orb's coordinates. Android
 * caches each SVG as a bitmap; a soft layer (glow, shimmer) is drawn at `res` of its size and scaled up, a quarter
 * of the memory at 0.5 with no visible difference in a gradient.
 */
function square(half: number, children: React.ReactNode, res = 1) {
  const svg = (
    <Svg width={2 * half * res} height={2 * half * res} viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`}>
      {children}
    </Svg>
  );
  if (res === 1) return svg;
  return (
    <View style={{ width: 2 * half, height: 2 * half, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 2 * half * res, height: 2 * half * res, transform: [{ scale: 1 / res }] }}>{svg}</View>
    </View>
  );
}

/**
 * The orb's layers, built once per size, delta and theme, centred on (0, 0): glow, body (fill, core, rim light, edge
 * and the rim particles that stay put), core shimmer, the rim particles that twinkle and sway, and the inner particles
 * that drift (two layers, one per direction).
 */
function drawOrb(size: number, delta: number | null, small: boolean, rgb: (t: ColorToken) => RGB, CORE: RGB, HIGHLIGHT: RGB): OrbArt {
  const id = uid("orb");
  const { top, bottom } = orbColors(delta, rgb);
  const tone = (col: RGB, k: number) => (k <= 1 ? mixRGB(CORE, col, k) : shadeRGB(col, k));
  const bright = (col: RGB) => mixRGB(shadeRGB(col, ORB.lift), HIGHLIGHT, ORB.sparkle);
  const dim = delta === null ? 0.55 : 1;
  const R = (size / 2) * ORB.shape.radius;
  const seed = 3 + (Math.abs(Math.round((delta ?? 0) * 10)) % 89);
  const t = SETTLED_T;

  // The outline.
  const rTab = Array.from({ length: STEPS + 1 }, (_, i) => R * blobRadius((i / STEPS) * Math.PI * 2, t, seed, small, 1));
  let blob = "";
  for (let i = 0; i < STEPS; i++) {
    const ang = (i / STEPS) * Math.PI * 2;
    blob += `${i ? "L" : "M"}${(rTab[i] * Math.cos(ang)).toFixed(2)} ${(rTab[i] * Math.sin(ang)).toFixed(2)}`;
  }
  blob += "Z";
  const maxEdge = Math.max(...rTab);
  const minEdge = Math.min(...rTab);
  const swaySpan = (M.swayDeg * Math.PI) / 180;

  // Particles: home angle and depth (denser toward the rim), drift and twinkle at the settled time. The random
  // sequence is the web's, draw for draw, so the same orb places the same particles. Each joins the motion layer
  // its position allows (`particleLayer`).
  const total = Math.round(particleCount(size) * (delta === null ? 0.5 : 1));
  const rand = rng(seed * 7919);
  const k = Math.min(1.2, Math.max(0.75, size / 300));
  const tint = Array.from({ length: BANDS }, (_, b) => rgba(bright(mixRGB(top, bottom, b / (BANDS - 1)))));
  const [dust, dots] = ORB.particles.mix;
  const fixed: React.ReactNode[] = [];
  const twinkle: React.ReactNode[] = [];
  const innerA: React.ReactNode[] = [];
  const innerB: React.ReactNode[] = [];
  let twinkleHalf = 0;
  let innerHalf = 0;
  let dustSeen = 0;
  let kept = 0;
  for (let i = 0; i < total && kept < MAX_PARTICLES; i++) {
    const kind = rand();
    const u = rand();
    const bokeh = kind >= dust + dots;
    const isDust = kind < dust;
    const th0 = rand() * Math.PI * 2;
    const rho0 = bokeh ? 0.92 - 0.45 * u ** 1.4 : 0.965 - 0.62 * u ** 1.7;
    if (rand() >= 0.3) rand(); // rhoIn: where a particle gathers while pressed (web only)
    const w = (0.012 + 0.03 * rand()) * (rand() < 0.75 ? 1 : -1);
    const ph = rand() * Math.PI * 2;
    const twRate = 0.6 + 1.8 * rand();
    let rad: number, alphaP: number, depth: number;
    if (isDust) [rad, alphaP, depth] = [(0.35 + 0.4 * rand()) * k, 0.12 + 0.28 * rand(), 0.6];
    else if (!bokeh) [rad, alphaP, depth] = [(0.9 + 1 * rand()) * k, 0.55 + 0.45 * rand(), 0.35];
    else [rad, alphaP, depth] = [(2.2 + 2.6 * rand()) * k, 0.2 + 0.25 * rand(), 0.25];
    rand(); // scattered start angle
    rand(); // scattered start distance
    rand(); // entry delay
    rand(); // swirl
    if (isDust && dustSeen++ % DUST_EVERY !== 0) continue;
    kept++;
    const th = th0 + w * t;
    const rho = rho0 + 0.012 * Math.sin(ph + t * 0.7);
    const edge = rTab[Math.round((((th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2)) * STEPS)];
    const x = edge * rho * Math.cos(th);
    const y = edge * rho * Math.sin(th);
    const s = rad * (bokeh ? 2 : 2.6);
    const pr = bokeh ? s * 0.38 : isDust ? Math.max(0.5, s * 0.3) : Math.max(0.6, s * 0.25);
    const band = Math.min(BANDS - 1, Math.max(0, Math.floor(((y + R) / (2 * R)) * BANDS)));
    const layer = particleLayer(rTab, STEPS, minEdge, th, edge * rho, pr, swaySpan);
    // The rim particles that may sway, and the counter-turning inner ones, twinkle: drawn at full strength, their
    // layer's opacity does the twinkling. The rest keep the settled frame's twinkle.
    const twinkles = layer === "sway" || (layer === "free" && w < 0);
    const tw = twinkles ? 1 : 1 - depth + depth * (0.5 + 0.5 * Math.sin(ph * 3.1 + t * twRate));
    const op = Math.min(1, alphaP * tw * (0.4 + 0.6 * rho0 * rho0) * dim * (isDust ? 1.6 : 1));
    const dot = <Circle key={i} cx={x} cy={y} r={pr} fill={tint[band]} opacity={bokeh ? op * 0.45 : op} />;
    const reach = Math.hypot(x, y) + pr + 1;
    if (layer === "free") {
      (w > 0 ? innerA : innerB).push(dot);
      innerHalf = Math.max(innerHalf, reach);
    } else if (layer === "sway") {
      twinkle.push(dot);
      twinkleHalf = Math.max(twinkleHalf, reach);
    } else fixed.push(dot);
  }

  const rims = [0.24, 0.16, 0.1, 0.06, 0.03].map((wr, i) => ({ w: R * wr, k: 1 + i * 0.04, a: (0.07 + i * 0.03) * dim }));
  const glowColor = tone(mixRGB(top, bottom, 0.5), 0.8);
  const g0 = 0.8 / 1.36;
  const gSpan = 1 - g0;
  const glowHalf = Math.ceil(R * 1.36) + 1;
  const bodyHalf = Math.ceil(maxEdge + 4);

  const glow = square(
    glowHalf,
    <>
      <Defs>
        <RadialGradient id={`${id}-glow`} cx={0} cy={0} r={R * 1.36} gradientUnits="userSpaceOnUse">
          {[[0, 0.36], [g0, 0.36], [g0 + 0.35 * gSpan, 0.22], [g0 + 0.6 * gSpan, 0.07], [1, 0]].map(([at, al]) => (
            <Stop key={at} offset={at} stopColor={rgba(glowColor)} stopOpacity={al * dim} />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={0} cy={0} r={R * 1.36} fill={`url(#${id}-glow)`} />
    </>,
    0.5,
  );

  const body = square(
    bodyHalf,
    <>
      <Defs>
        <LinearGradient id={`${id}-fill`} x1={0} y1={-R} x2={0} y2={R} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor={rgba(tone(top, ORB.fillShade))} />
          <Stop offset={1} stopColor={rgba(tone(bottom, ORB.fillShade))} />
        </LinearGradient>
        <RadialGradient id={`${id}-core`} cx={0} cy={0} r={R * 1.04} gradientUnits="userSpaceOnUse">
          {[[0, 1], [0.42, 1], [0.6, 0.72], [0.76, 0.38], [0.9, 0.12], [1, 0]].map(([at, al]) => (
            <Stop key={at} offset={at} stopColor={rgba(CORE)} stopOpacity={al} />
          ))}
        </RadialGradient>
        {rims.map((rm, i) => (
          <LinearGradient key={i} id={`${id}-rim${i}`} x1={0} y1={-R} x2={0} y2={R} gradientUnits="userSpaceOnUse">
            <Stop offset={0} stopColor={rgba(tone(top, rm.k))} stopOpacity={rm.a} />
            <Stop offset={1} stopColor={rgba(tone(bottom, rm.k))} stopOpacity={rm.a} />
          </LinearGradient>
        ))}
        <LinearGradient id={`${id}-edge`} x1={0} y1={-R} x2={0} y2={R} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor={rgba(mixRGB(top, HIGHLIGHT, 0.22))} stopOpacity={0.85 * dim} />
          <Stop offset={1} stopColor={rgba(mixRGB(bottom, HIGHLIGHT, 0.22))} stopOpacity={0.85 * dim} />
        </LinearGradient>
        <ClipPath id={`${id}-clip`}>
          <Path d={blob} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id}-clip)`}>
        <G opacity={dim}>
          <Rect x={-bodyHalf} y={-bodyHalf} width={2 * bodyHalf} height={2 * bodyHalf} fill={`url(#${id}-fill)`} />
          <Rect x={-bodyHalf} y={-bodyHalf} width={2 * bodyHalf} height={2 * bodyHalf} fill={`url(#${id}-core)`} />
        </G>
        {rims.map((rm, i) => (
          <Path key={i} d={blob} fill="none" stroke={`url(#${id}-rim${i})`} strokeWidth={rm.w} />
        ))}
      </G>
      <Path d={blob} fill="none" stroke={`url(#${id}-edge)`} strokeWidth={1.25} />
      <G>{fixed}</G>
    </>,
  );

  // Core shimmer: two faint soft lights inside the core, kept well inside the outline's smallest radius so they can
  // turn freely. At most 10 % strong, so the numerals keep their contrast.
  const lights = [
    { x: 0.22 * R, y: -0.16 * R, r: 0.46 * R, col: bright(mixRGB(top, bottom, 0.35)), a: 0.1 },
    { x: -0.2 * R, y: 0.2 * R, r: 0.4 * R, col: bright(mixRGB(top, bottom, 0.65)), a: 0.07 },
  ];
  const shimmerHalf = Math.ceil(Math.max(...lights.map((l) => Math.hypot(l.x, l.y) + l.r))) + 1;
  const shimmer = square(
    shimmerHalf,
    <>
      <Defs>
        {lights.map((l, i) => (
          <RadialGradient key={i} id={`${id}-sh${i}`} cx={l.x} cy={l.y} r={l.r} gradientUnits="userSpaceOnUse">
            <Stop offset={0} stopColor={rgba(l.col)} stopOpacity={l.a * dim} />
            <Stop offset={0.5} stopColor={rgba(l.col)} stopOpacity={l.a * 0.45 * dim} />
            <Stop offset={1} stopColor={rgba(l.col)} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {lights.map((l, i) => (
        <Circle key={i} cx={l.x} cy={l.y} r={l.r} fill={`url(#${id}-sh${i})`} />
      ))}
    </>,
    0.5,
  );

  const innerSize = Math.ceil(innerHalf);
  const twinkleSize = Math.ceil(twinkleHalf);
  return {
    glow: { half: glowHalf, node: glow },
    body: { half: bodyHalf, node: body },
    shimmer: { half: shimmerHalf, node: shimmer },
    twinkle: twinkle.length ? { half: twinkleSize, node: square(twinkleSize, twinkle) } : null,
    inner: innerA.length + innerB.length ? { half: innerSize, a: square(innerSize, innerA), b: square(innerSize, innerB) } : null,
  };
}
