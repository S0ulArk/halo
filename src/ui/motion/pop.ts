import * as React from "react";
import { cancelAnimation, useSharedValue, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { REASE } from "./easing";
import { reduceMotionNow } from "./system";
import { POP } from "./timing";

/**
 * A scale for a newly selected item: 1 → 1.12 → 1 (110 + 170 ms, on the UI thread) each time `active` turns true.
 * Mounting already active does not pop, and neither does a re-render. Use it in a Reanimated style
 * (`transform: [{ scale }]` on an `Animated.View` from react-native-reanimated).
 */
export function usePop(active: boolean): SharedValue<number> {
  const scale = useSharedValue(1);
  const was = React.useRef(active);
  React.useEffect(() => {
    const before = was.current;
    was.current = active;
    if (!active || before || reduceMotionNow()) return;
    scale.set(withSequence(withTiming(POP.scale, { duration: POP.up, easing: REASE.outCubic }), withTiming(1, { duration: POP.down, easing: REASE.standard })));
    return () => {
      cancelAnimation(scale);
      scale.set(1);
    };
  }, [active, scale]);
  return scale;
}
