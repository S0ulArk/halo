// Cards and sections rise into place: a short fade and lift (340 ms) as a screen opens, cascading by section, and once
// more for each block that was below the fold, the first time it scrolls into view. Everything runs on the UI thread:
// the progress is a shared value, the visibility check a `measure` inside a reaction on the scroll offset (only until
// the block has risen; after that the reaction does nothing). Only opacity and a transform animate, never layout.
//
// What never animates: anything under reduce motion, and a block that mounts while its screen is still being pushed
// (it slides in with the screen; a second motion on top would compete with the push for frames).
import * as React from "react";
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { measure, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useScrollOffset, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { useAfterTransition } from "@/ui/components/AfterTransition";
import { REASE } from "./easing";
import { reduceMotionNow } from "./system";

/** How long a block takes to rise, and how far it travels. */
export const RISE_MS = 340;
const RISE_PX = 16;
/** The cascade's step between sections on open, and the most steps it takes (later blocks start with the last). */
const RISE_STEP = 55;
const RISE_STEPS = 6;

/** The page's scroll offset (a Reanimated `useScrollOffset`), so blocks below the fold rise when they scroll in. */
export const RevealScroll = React.createContext<SharedValue<number> | null>(null);

export function Rise({ index = 0, style, children }: { index?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const opened = useAfterTransition();
  // Decided once at mount: a block that mounted still never starts moving later.
  const [still] = React.useState(() => reduceMotionNow() || !opened);
  const scroll = React.useContext(RevealScroll);
  const { height } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.View>();
  const p = useSharedValue(still ? 1 : 0);
  const laid = useSharedValue(0);
  const done = useSharedValue(still);
  useAnimatedReaction(
    () => (scroll ? scroll.value : 0) + laid.value * 0.0001,
    () => {
      if (done.value || laid.value === 0) return;
      // Without a page scroll to follow (a keyboard-aware page), a block rises as soon as it is laid out.
      if (scroll) {
        const m = measure(ref);
        if (!m || m.pageY > height - 24) return;
      }
      done.value = true;
      // On open the sections cascade; one that scrolls in later rises at once.
      const late = !!scroll && scroll.value > 4;
      p.value = withDelay(late ? 0 : Math.min(index, RISE_STEPS) * RISE_STEP, withTiming(1, { duration: RISE_MS, easing: REASE.outExpo }));
    },
  );
  const anim = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * RISE_PX }] }));
  if (still) return <View style={style}>{children}</View>;
  return (
    <Animated.View ref={ref} onLayout={() => laid.set(1)} style={[style, anim]}>
      {children}
    </Animated.View>
  );
}

/** Each child in its own Rise, in order (falsy children are skipped, so the cascade counts only what shows). */
export function RiseEach({ start = 0, children }: { start?: number; children: React.ReactNode }) {
  return (
    <>
      {React.Children.toArray(children).map((child, i) => (
        <Rise key={React.isValidElement(child) && child.key !== null ? child.key : i} index={start + i}>
          {child}
        </Rise>
      ))}
    </>
  );
}

/**
 * A page's scroll offset for RevealScroll: put `setRef` on an `Animated.ScrollView` (it also fills `ref`, for
 * useScrollToTop and anchors) and provide `y`. The offset lives on the UI thread; no JS runs on scroll. `enabled`
 * false (a keyboard-aware page, not a Reanimated ScrollView): `setRef` only fills `ref` and `y` is null.
 */
export function useRevealScroll<T>(ref?: React.RefObject<T | null>, enabled = true) {
  const animated = useAnimatedRef<Animated.ScrollView>();
  const y = useScrollOffset(enabled ? animated : null);
  const setRef = React.useCallback(
    (node: Animated.ScrollView | null) => {
      if (ref) ref.current = node as unknown as T | null;
      if (enabled) animated(node);
    },
    [ref, animated, enabled],
  );
  return { setRef, y: enabled ? y : null };
}

/**
 * A View-drawn chart (columns, lollipops, bars) growing in once on mount: `rise` reveals it from the floor up, `wipe`
 * left to right. Two counter-moving views (the outer clips, the inner holds the drawing still), so each frame moves two
 * layers and redraws nothing; the chart's own layout never changes. Still under reduce motion and mid-push.
 */
export function GrowIn({ mode = "rise", delay = 120, style, children }: { mode?: "rise" | "wipe"; delay?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const opened = useAfterTransition();
  const [still] = React.useState(() => reduceMotionNow() || !opened);
  const p = useSharedValue(still ? 1 : 0);
  const size = useSharedValue(0);
  const onLayout = (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    if (still) return;
    size.set(mode === "rise" ? e.nativeEvent.layout.height : e.nativeEvent.layout.width);
    if (p.value === 0) p.set(withDelay(delay, withTiming(1, { duration: 700, easing: REASE.outExpo })));
  };
  const outer = useAnimatedStyle(() => {
    const k = (1 - p.value) * size.value;
    return { opacity: size.value > 0 || p.value === 1 ? 1 : 0, transform: mode === "rise" ? [{ translateY: k }] : [{ translateX: -k }] };
  });
  const inner = useAnimatedStyle(() => {
    const k = (1 - p.value) * size.value;
    return { transform: mode === "rise" ? [{ translateY: -k }] : [{ translateX: k }] };
  });
  if (still) return <View style={style}>{children}</View>;
  return (
    <Animated.View onLayout={onLayout} style={[{ overflow: "hidden" }, style, outer]}>
      <Animated.View style={inner}>{children}</Animated.View>
    </Animated.View>
  );
}
