// The press every tappable thing in the kit shares, iOS's: the moment a finger lands the element settles to about 97 %
// and dims a little, and on release it springs back with the faintest overshoot. Both run on the UI thread off shared
// values (Reanimated springs, src/ui/motion/springs.ts); a press re-renders nothing. Under Reduce motion the size stays
// put and only the dim answers.
import * as React from "react";
import { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import { SPRING } from "@/ui/motion/springs";
import { reduceMotionNow } from "@/ui/motion/system";

/** The kit's press: how far it settles and how far it dims (opacity at the bottom of the press). */
export const PRESS = { scale: 0.97, dim: 0.82 } as const;

export type Press = {
  /**
   * `{ transform: [{ scale }] }` with the scale as an inline shared value: for a Reanimated `Animated.View`
   * (react-native-reanimated), which maps it on the UI thread. Not for React Native's own Animated.
   */
  animatedStyle: { transform: { scale: SharedValue<number> }[] };
  onPressIn: () => void;
  onPressOut: () => void;
  scale: SharedValue<number>;
  /** How far the press has gone: 0 at rest, 1 with the finger down. */
  progress: SharedValue<number>;
  /** The scale at the bottom of the press. */
  scaleTo: number;
};

/**
 * The press affordance: `scaleTo` (0.97) and the progress both spring in on press-in and spring back on release, on the
 * UI thread. Put `animatedStyle` (the scale alone) on an `Animated.View`, or use `usePressStyle` for the scale and the
 * dim together.
 */
export function usePress(scaleTo: number = PRESS.scale): Press {
  const scale = useSharedValue(1);
  const progress = useSharedValue(0);
  return React.useMemo(
    () => ({
      animatedStyle: { transform: [{ scale }] },
      onPressIn: () => {
        progress.set(withSpring(1, SPRING.pressIn));
        if (!reduceMotionNow()) scale.set(withSpring(scaleTo, SPRING.pressIn));
      },
      onPressOut: () => {
        progress.set(withSpring(0, SPRING.release));
        scale.set(withSpring(1, SPRING.release));
      },
      scale,
      progress,
      scaleTo,
    }),
    [scale, progress, scaleTo],
  );
}

/**
 * The press's scale with its dim, as one Reanimated style: the opacity runs from `rest` (1, or a disabled control's
 * 0.45) down to `rest × dim` as the finger lands. Put it last in the pressed `Animated.View`'s style.
 */
export function usePressStyle(press: Press, { rest = 1, dim = PRESS.dim }: { rest?: number; dim?: number } = {}) {
  const { scale, progress } = press;
  // The release spring overshoots past 0 for a moment: the dim never goes brighter than rest.
  return useAnimatedStyle(() => ({ opacity: rest * (1 - (1 - dim) * Math.max(0, progress.value)), transform: [{ scale: scale.value }] }), [rest, dim]);
}
