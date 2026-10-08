// Breathe's circle: fills as you breathe in, holds, empties as you breathe out. The size is computed on the UI thread
// every frame from the session's start time (a Reanimated frame callback over src/live/breath.ts's levelAt), so it
// never drifts from the label and haptics the JS side runs off the same clock, and no frame of it waits for JS.
import * as React from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type FrameInfo } from "react-native-reanimated";
import { levelAt, type BreathStage } from "@/live/breath";
import { alpha } from "@/lib/utils";
import { useReduceMotion } from "@/ui";
import { useCalm } from "@/ui/calm";
import { REASE } from "@/ui/motion/easing";

/** The circle's smallest size as a share of its largest (empty lungs). */
const MIN_SCALE = 0.42;
/** The halo reaches this much past the core at full. */
const HALO = 1.14;

type Props = {
  stages: readonly BreathStage[];
  /** Epoch ms the session started; null while idle (the circle rests empty). */
  startAt: number | null;
  size: number;
  color?: string;
  /** Drawn over the circle, unscaled: the phase and its count. */
  children?: React.ReactNode;
};

export function BreathCircle({ stages, startAt, size, color, children }: Props) {
  const c = useCalm();
  const tint = color ?? c.teal;
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
      // Stopped mid-breath: let the circle settle back to empty.
      level.set(reduce ? 0 : withTiming(0, { duration: 800, easing: REASE.standard }));
      return;
    }
    params.set({ ms: stages.map((s) => s.ms), levels: stages.map((s) => s.level), start: startAt, stepped: reduce });
    frame.setActive(true);
    return () => frame.setActive(false);
    // `frame` is a stable ref object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt, stages, reduce, params, level]);

  const core = useAnimatedStyle(() => ({ transform: [{ scale: MIN_SCALE + (1 - MIN_SCALE) * level.value }] }));
  const halo = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * level.value,
    transform: [{ scale: (MIN_SCALE + (1 - MIN_SCALE) * level.value) * HALO }],
  }));

  const disc = { position: "absolute", width: size, height: size, borderRadius: size / 2 } as const;
  return (
    <View style={{ width: size * HALO, height: size * HALO, alignItems: "center", justifyContent: "center" }}>
      {/* The full breath's outline, so the circle shows where it is filling to. */}
      <View style={[disc, { borderWidth: 1.5, borderColor: alpha(tint, 0.28) }]} />
      <Animated.View style={[disc, { backgroundColor: alpha(tint, 0.1) }, halo]} />
      <Animated.View style={[disc, { backgroundColor: alpha(tint, 0.26), borderWidth: 2, borderColor: alpha(tint, 0.85) }, core]} />
      <View style={{ position: "absolute", alignItems: "center", justifyContent: "center", width: size * MIN_SCALE * 1.6 }}>{children}</View>
    </View>
  );
}
