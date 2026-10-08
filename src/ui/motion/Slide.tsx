import * as React from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { REASE, type ReaseKey } from "./easing";
import { reduceMotionNow } from "./system";
import { COUNT } from "./timing";

export type SlideOptions = { duration?: number; easing?: ReaseKey };

export type Slide = { x: SharedValue<number>; width: number; ready: boolean; onLayout: (e: LayoutChangeEvent) => void };

/**
 * A pixel position that depends on a measured width, animated on the UI thread (Reanimated): `x` is placed at
 * `to(width)` once the width is known, and moves to a new target whenever it changes (a new value). Nothing moves on
 * mount ("calm data": no entrance motion while a screen opens); `from` is kept for API compatibility. `ready` is false
 * until the first measure, so callers can keep the moving part hidden for that one frame.
 */
export function useSlide(to: ((width: number) => number) | null, from?: (width: number) => number, { duration = COUNT.duration, easing = "fill" }: SlideOptions = {}): Slide {
  const [width, setWidth] = React.useState(0);
  const x = useSharedValue(0);
  const started = React.useRef(false);
  const target = width > 0 && to ? to(width) : null;
  const latest = React.useRef({ from, easing });
  React.useEffect(() => {
    latest.current = { from, easing };
  });
  React.useEffect(() => {
    if (target === null) return;
    if (!started.current || reduceMotionNow()) {
      started.current = true;
      x.set(target);
      return;
    }
    x.set(withTiming(target, { duration, easing: REASE[latest.current.easing] }));
    return () => cancelAnimation(x);
    // A width change re-targets through `target`; the width alone needs no new run.
  }, [target, duration, x]);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width * 100) / 100), []);
  return { x, width, ready: width > 0, onLayout };
}

/**
 * Shows its content from the left up to `cut(width)` px (all of it by default), at once on mount, then wipes the edge
 * to a new cut when it changes: a clip window and its content translate in opposite directions, so nothing re-lays
 * out and every frame is a transform set on the UI thread. The content keeps the box's full width.
 */
export function Reveal({ cut, style, children, ...opts }: SlideOptions & { cut?: (width: number) => number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const { x, width, ready, onLayout } = useSlide((w) => Math.min(w, Math.max(0, cut ? cut(w) : w)), () => 0, opts);
  const outer = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - width }] }), [width]);
  const inner = useAnimatedStyle(() => ({ transform: [{ translateX: width - x.value }] }), [width]);
  return (
    <View style={style} onLayout={onLayout} pointerEvents="box-none">
      <Animated.View style={[{ flex: 1, overflow: "hidden", opacity: ready ? 1 : 0 }, outer]}>
        <Animated.View style={[{ flex: 1 }, inner]}>{children}</Animated.View>
      </Animated.View>
    </View>
  );
}
