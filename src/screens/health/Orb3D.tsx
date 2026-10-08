// The Pulse Age orb in 3D (orb3dShader.ts): a glowing, speckled blob whose surface keeps flowing, so its outline is
// never the same twice, turning slowly with its specks sweeping past at different depths. The Pulse Age, its label
// and the gap to your age sit on its pale core. It grows in when it first shows; press and hold and it livens up
// (bigger waves, a faster turn, a light tap of haptics), then settles when let go. Drawn on the GPU: JavaScript only
// advances one clock a frame, and only while the screen is in view with the app open (a still orb under reduced
// motion).
import * as React from "react";
import { AppState, View, type GestureResponderEvent } from "react-native";
import { Canvas, Fill, Shader, Skia, vec } from "@shopify/react-native-skia";
import Animated, { Easing, useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, withTiming, type FrameInfo } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useIsFocused } from "expo-router";
import { AGE_LABEL, formatValue } from "@/lib/format";
import type { ReasonCode } from "@/lib/reasons";
import { MetricTags, ReasonPlaceholder, Txt, useTheme } from "@/ui";
import { useReduceMotion } from "@/ui/motion/system";
import { ageDelta } from "./format";
import { hexRGB, ORB, orbColors, shadeRGB, type RGB } from "./orb";
import { ORB3D_SKSL } from "./orb3dShader";

const EFFECT = Skia.RuntimeEffect.Make(ORB3D_SKSL);
/** Radians a second the orb turns at rest; holding it adds up to this much more. */
const TURN = 0.22;
const TURN_HELD = 1.6;

function useAppActive() {
  const [active, setActive] = React.useState(AppState.currentState === "active");
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);
  return active;
}

const unit = (rgb: readonly number[]) => rgb.map((v) => v / 255);
const rgbHex = (rgb: RGB) => `#${rgb.map((v) => Math.round(Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;

export function AgeOrb3D({ age, deltaYears, provisional = false, size = 220, reason }: { age: number | null; deltaYears: number | null; provisional?: boolean; size?: number; reason?: ReasonCode | null }) {
  const { c, scheme } = useTheme();
  const has = age !== null && deltaYears !== null;
  const delta = has ? deltaYears : null;
  const d = delta !== null ? ageDelta(delta) : null;
  const same = delta !== null && formatValue("decimal1", Math.abs(delta)) === "0.0";
  const focused = useIsFocused();
  const appActive = useAppActive();
  const reduce = useReduceMotion();
  const running = focused && appActive && !reduce;

  // The rim colours of this Pulse Age (greens younger, oranges and rust older), the pale core and the highlight.
  const colors = React.useMemo(() => {
    const rim = orbColors(delta, (tok) => hexRGB(c[tok]));
    return { top: unit(rim.top), bottom: unit(rim.bottom), core: unit(hexRGB(c.orbCore)), hilite: [1, 1, 1], rim: rim.top };
  }, [delta, c]);
  // The text is the orb's own: inked in its rim colour (deepened on the pale light core, brightened on the dark one),
  // haloed in the core's colour so it sits inside the glass rather than on top of it.
  const rimInk = rgbHex(shadeRGB(colors.rim, scheme === "dark" ? 1.45 : 0.62));
  const coreGlow = scheme === "dark" ? "rgba(10,14,18,0.55)" : "rgba(248,250,251,0.95)";

  // One clock (seconds) and the turn, advanced by each frame's real length, so a pause never makes the orb jump.
  const t = useSharedValue(1.2);
  const spin = useSharedValue(0.3);
  const energy = useSharedValue(0);
  const tick = React.useCallback(
    (f: FrameInfo) => {
      "worklet";
      const dt = f.timeSincePreviousFrame == null ? 0 : Math.min(f.timeSincePreviousFrame, 50) / 1000;
      const e = energy.get();
      t.set(t.get() + dt * (1 + e));
      spin.set(spin.get() + dt * (TURN + TURN_HELD * e));
    },
    [t, spin, energy],
  );
  const frame = useFrameCallback(tick, false);
  React.useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
    // `frame` is a stable ref object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // The entrance: the orb swells in from a little smaller, its text a moment behind.
  const enter = useSharedValue(reduce ? 1 : 0);
  React.useEffect(() => {
    if (!reduce) enter.set(withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [enter, reduce]);
  const orbStyle = useAnimatedStyle(() => ({ opacity: enter.get(), transform: [{ scale: 0.86 + 0.14 * enter.get() + 0.03 * energy.get() }] }));
  // The text breathes and swells with the orb (the same scale), so it reads as part of it.
  const textStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, enter.get() * 1.4 - 0.4), transform: [{ scale: 0.9 + 0.1 * enter.get() + 0.03 * energy.get() }] }));

  const night = scheme === "dark" ? 1 : 0;
  const uniforms = useDerivedValue(() => ({
    center: vec(size / 2, size / 2),
    R: size * 0.38,
    t: t.get(),
    spin: spin.get(),
    energy: energy.get(),
    top: colors.top,
    bottom: colors.bottom,
    core: colors.core,
    hilite: colors.hilite,
    night,
  }));

  // Press and hold: livelier while the finger is down; a finger that moves is scrolling, so it lets go.
  const down = React.useRef<{ x: number; y: number } | null>(null);
  const release = () => {
    if (!down.current) return;
    down.current = null;
    energy.set(withTiming(0, { duration: 1200, easing: Easing.out(Easing.quad) }));
  };
  const onTouchStart = (e: GestureResponderEvent) => {
    if (reduce || e.nativeEvent.touches.length > 1) return;
    down.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    energy.set(withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
  };
  const onTouchMove = (e: GestureResponderEvent) => {
    const p = down.current;
    if (p && (Math.abs(e.nativeEvent.pageX - p.x) > 10 || Math.abs(e.nativeEvent.pageY - p.y) > 10)) release();
  };

  const label = has ? `${AGE_LABEL} ${formatValue("decimal1", age)}, ${same ? "same as your age" : `${d!.text} than your age`}${provisional ? ", provisional" : ""}` : `${AGE_LABEL} unavailable`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: size, height: size }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      {EFFECT && (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, width: size, height: size }, orbStyle]}>
          <Canvas style={{ width: size, height: size }}>
            <Fill>
              <Shader source={EFFECT} uniforms={uniforms} />
            </Fill>
          </Canvas>
        </Animated.View>
      )}
      <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={[{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: size * 0.2 }, textStyle]}>
        <Txt
          role="value"
          size={Math.round(size * 0.17)}
          lineHeight={Math.round(size * 0.19)}
          tracking={-0.02}
          color={has ? rimInk : c.orbTextMuted}
          align="center"
          style={{ textShadowColor: coreGlow, textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } }}
        >
          {formatValue("decimal1", has ? age : null)}
        </Txt>
        <Txt role="label" size={Math.round(8 + size * 0.022)} lineHeight={Math.round((8 + size * 0.022) * 1.25)} color={has ? rimInk : c.orbTextMuted} align="center" style={{ marginTop: 2, opacity: 0.75, letterSpacing: 1.4 }}>
          {AGE_LABEL.toUpperCase()}
        </Txt>
        {d && (
          // The gap to your age on a pill of the rim's colour, like light caught in the glass.
          <View style={{ marginTop: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: `${rimInk}1f`, borderWidth: 1, borderColor: `${rimInk}33` }}>
            <Txt role="body" size={Math.round(8 + size * 0.026)} lineHeight={Math.round((8 + size * 0.026) * 1.25)} weight={600} color={delta !== null && delta <= ORB.greenText ? c.optimal : same ? c.orbTextMuted : rimInk} align="center" style={{ fontVariant: ["tabular-nums"] }}>
              {d.text}
            </Txt>
          </View>
        )}
        {!has && <ReasonPlaceholder reason={reason} size="sm" style={{ marginTop: 12, justifyContent: "center" }} />}
        {has && provisional && <MetricTags provisional style={{ marginTop: 10 }} />}
      </Animated.View>
    </View>
  );
}
