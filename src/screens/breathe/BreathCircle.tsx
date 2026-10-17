// Breathe's flower, as Apple's Mindfulness draws a breath: six soft translucent petals that bloom outward and turn a
// little as you breathe in, hold, and fold back into a small bud as you breathe out, their overlaps deepening the
// colour at the centre. The bloom is computed on the UI thread every frame from the session's start time (a Reanimated
// frame callback over src/live/breath.ts's levelAt), so it never drifts from the label and haptics the JS side runs off
// the same clock, and no frame of it waits for JS. Every petal moves by transform only. Under Reduce motion the
// levels step from stage to stage instead of gliding.
import * as React from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type FrameInfo, type SharedValue } from "react-native-reanimated";
import { levelAt, type BreathStage } from "@/live/breath";
import { alpha } from "@/lib/utils";
import { useReduceMotion } from "@/ui";
import { useCalm } from "@/ui/calm";
import { REASE } from "@/ui/motion/easing";

/** How many petals, each one's diameter as a share of the flower's, and the turn (degrees) a full breath gives it. */
const PETALS = 6;
const PETAL = 0.5;
const TURN = 60;

type Props = {
  stages: readonly BreathStage[];
  /** Epoch ms the session started; null while idle (the flower rests as a bud). */
  startAt: number | null;
  size: number;
  /** The petals' two colours, alternating (default Mindfulness's mint and cyan). */
  colors?: readonly [string, string];
  /** Drawn over the flower, unscaled and unturned: the phase and its count. */
  children?: React.ReactNode;
};

/** One petal: pushed out from the centre along its angle as the breath fills, and grown with it. */
function Petal({ index, level, reach, diameter, color }: { index: number; level: SharedValue<number>; reach: number; diameter: number; color: string }) {
  const angle = (index / PETALS) * Math.PI * 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const style = useAnimatedStyle(() => {
    const l = level.value;
    const d = reach * (0.08 + 0.92 * l);
    return { transform: [{ translateX: dx * d }, { translateY: dy * d }, { scale: 0.5 + 0.5 * l }] };
  });
  return <Animated.View style={[{ position: "absolute", width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: color }, style]} />;
}

export function BreathCircle({ stages, startAt, size, colors, children }: Props) {
  const c = useCalm();
  const [a, b] = colors ?? [c.system.mint, c.system.cyan];
  const reduce = useReduceMotion();
  const level = useSharedValue(0);
  // What the frame callback reads, as one shared value, so the callback itself never changes (a new one re-registers).
  const params = useSharedValue({ ms: [] as number[], levels: [] as number[], start: 0, stepped: false });
  const tick = React.useCallback(
    (_f: FrameInfo) => {
      "worklet";
      const p = params.get();
      level.set(levelAt(p.ms, p.levels, Date.now() - p.start, p.stepped));
    },
    [params, level],
  );
  const frame = useFrameCallback(tick, false);

  React.useEffect(() => {
    if (startAt === null) {
      frame.setActive(false);
      // Stopped mid-breath: the flower folds back into its bud.
      level.set(reduce ? 0 : withTiming(0, { duration: 900, easing: REASE.standard }));
      return;
    }
    params.set({ ms: stages.map((s) => s.ms), levels: stages.map((s) => s.level), start: startAt, stepped: reduce });
    frame.setActive(true);
    return () => frame.setActive(false);
    // `frame` is a stable ref object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt, stages, reduce, params, level]);

  const diameter = size * PETAL;
  const reach = (size - diameter) / 2;
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${level.value * TURN - TURN / 2}deg` }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * level.value, transform: [{ scale: 0.55 + 0.45 * level.value }] }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* The full breath's outline, so the flower shows how far it is filling. */}
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: alpha(a, 0.22) }} />
      {/* A soft pool of the colour behind the petals, swelling with them. */}
      <Animated.View style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: alpha(a, 0.08) }, glow]} />
      <Animated.View style={[{ position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center" }, turn]}>
        {Array.from({ length: PETALS }, (_, i) => (
          <Petal key={i} index={i} level={level} reach={reach} diameter={diameter} color={alpha(i % 2 ? b : a, 0.34)} />
        ))}
      </Animated.View>
      <View style={{ position: "absolute", alignItems: "center", justifyContent: "center", width: size * 0.6 }}>{children}</View>
    </View>
  );
}
