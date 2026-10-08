import * as React from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useTheme } from "@/ui/ThemeProvider";
import { useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { REASE } from "@/ui/motion/easing";
import { MOTION } from "@/ui/theme";

export type Press = {
  /**
   * `{ transform: [{ scale }] }` with the scale as an inline shared value: for a Reanimated `Animated.View`
   * (react-native-reanimated), which maps it on the UI thread. Not for React Native's own Animated.
   */
  animatedStyle: { transform: { scale: SharedValue<number> }[] };
  onPressIn: () => void;
  onPressOut: () => void;
  scale: SharedValue<number>;
  /** The scale at the bottom of the press. */
  scaleTo: number;
};

/**
 * The press affordance every tappable kit element shares (spec §2.7): scale to 0.96 over 150 ms, ease-standard. The
 * scale runs on the UI thread (Reanimated); a press re-renders nothing.
 */
export function usePress(scaleTo = 0.96): Press {
  const scale = useSharedValue(1);
  return React.useMemo(
    () => ({
      animatedStyle: { transform: [{ scale }] },
      onPressIn: () => {
        scale.set(withTiming(scaleTo, { duration: MOTION.fast, easing: REASE.standard }));
      },
      onPressOut: () => {
        scale.set(withTiming(1, { duration: MOTION.fast, easing: REASE.standard }));
      },
      scale,
      scaleTo,
    }),
    [scale, scaleTo],
  );
}

/**
 * The press highlight over a pressed surface: a faint veil (ink on light, white on dark) that follows the press's scale,
 * none at rest and full at the bottom of the press, on the UI thread. Place it last inside the pressed surface.
 */
export function PressGlow({ press, radius }: { press: Press; radius: number }) {
  const dark = useTheme().scheme === "dark";
  const { scale, scaleTo } = press;
  const veil = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (1 - scale.value) / (1 - scaleTo))) }));
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius, backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(20,22,26,0.045)" }, veil]} />;
}
