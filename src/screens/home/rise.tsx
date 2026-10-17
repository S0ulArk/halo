// Cards come in the way iOS brings content in: each block fades up from 10 dp below on a soft spring as Today (or the
// Journal) opens, the blocks cascading 45 ms apart, and a block that was below the fold rises once, the first time it
// scrolls into view. The kit's Rise (src/ui/motion/Rise.tsx) does the same on a timing curve and travels 16 dp; this one
// is the springier, shorter rise the iOS look asks for, kept here so the kit's stays as the other screens use it.
//
// Everything runs on the UI thread: the progress is a shared value, the lift a spring, the visibility check a
// `measure` inside a reaction on the page's scroll offset (RevealScroll), and only until the block has risen. Only
// opacity and a transform animate, never layout. A block that mounts while its screen is still being pushed, and every
// block under Reduce motion, shows at once.
import * as React from "react";
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { measure, runOnJS, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { useAfterTransition } from "@/ui/components/AfterTransition";
import { REASE } from "@/ui/motion/easing";
import { RevealScroll } from "@/ui/motion/Rise";
import { iosSpring } from "@/ui/motion/springs";
import { reduceMotionNow } from "@/ui/motion/system";

/** How far a block travels up, in dp. */
const RISE_DP = 10;
/** The cascade's step between blocks on open, and the most steps it takes (later blocks start with the last). */
const STEP_MS = 45;
const STEPS = 7;
/** The fade's length: the opacity lands a little before the spring settles, as iOS's content does. */
const FADE_MS = 280;
/** The lift: a 0.55 s response with the faint settle iOS's springs have. */
const LIFT = iosSpring(0.55, 0.86);

export function Rise({ index = 0, style, children }: { index?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const opened = useAfterTransition();
  // Decided once at mount: a block that mounted still never starts moving later.
  const [still] = React.useState(() => reduceMotionNow() || !opened);
  const scroll = React.useContext(RevealScroll);
  const { height } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.View>();
  const fade = useSharedValue(still ? 1 : 0);
  const lift = useSharedValue(still ? 0 : RISE_DP);
  const laid = useSharedValue(0);
  const done = useSharedValue(still);
  // One GPU texture while it moves (drawn once, then only faded and slid); dropped when the lift settles.
  const [layer, setLayer] = React.useState(!still);
  useAnimatedReaction(
    () => (scroll ? scroll.value : 0) + laid.value * 0.0001,
    () => {
      if (done.value || laid.value === 0) return;
      // Without a page scroll to follow, a block rises as soon as it is laid out.
      if (scroll) {
        const m = measure(ref);
        if (!m || m.pageY > height - 24) return;
      }
      done.value = true;
      // On open the blocks cascade; one that scrolls in later rises at once.
      const delay = scroll && scroll.value > 4 ? 0 : Math.min(index, STEPS) * STEP_MS;
      fade.value = withDelay(delay, withTiming(1, { duration: FADE_MS, easing: REASE.outCubic }));
      lift.value = withDelay(
        delay,
        withSpring(0, LIFT, (finished) => {
          if (finished) runOnJS(setLayer)(false);
        }),
      );
    },
  );
  const anim = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateY: lift.value }] }));
  if (still) return <View style={style}>{children}</View>;
  return (
    <Animated.View ref={ref} onLayout={() => laid.set(1)} renderToHardwareTextureAndroid={layer} style={[style, anim]}>
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
