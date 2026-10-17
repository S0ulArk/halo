// Loading bars (spec §5.19): skeletons reuse the component's own box; these are only the bars inside it, in iOS's quiet
// separator grey, breathing gently while something loads. Every bar on screen reads one shared value that one
// Reanimated loop drives on the UI thread, started by the first bar to mount and stopped with the last; under Reduce
// motion the bars hold still.
import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, makeMutable, useAnimatedStyle, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useCalm } from "@/ui/calm";
import { reduceMotionNow, useReduceMotion } from "@/ui/motion/system";
import { ROLES, type TextRole } from "./Text";

/** The bars' shared opacity: 1 → 0.5 → 1 every two seconds while any bar is mounted and motion is allowed. */
const pulse = makeMutable(1);
let mounted = 0;
let running = false;
const BREATH = { duration: 1000, easing: Easing.inOut(Easing.ease) };

/** Starts the loop when a bar is on screen and motion is allowed, and stops it (bars at full) otherwise. */
function sync() {
  const want = mounted > 0 && !reduceMotionNow();
  if (want === running) return;
  running = want;
  if (want) {
    pulse.set(1);
    pulse.set(withRepeat(withSequence(withTiming(0.5, BREATH), withTiming(1, BREATH)), -1, false));
  } else {
    cancelAnimation(pulse);
    pulse.set(1);
  }
}

function usePulse() {
  const reduce = useReduceMotion();
  React.useEffect(() => {
    mounted++;
    sync();
    return () => {
      mounted--;
      sync();
    };
  }, []);
  // Reduce motion turned on or off while bars are showing.
  React.useEffect(sync, [reduce]);
}

/** A breathing bar in the separator grey (`calm.line`). Give it a size; the default radius is 8. */
export function Skeleton({ style, radius = 8 }: { style?: StyleProp<ViewStyle>; radius?: number }) {
  const c = useCalm();
  usePulse();
  const breathe = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ backgroundColor: c.line, borderRadius: radius }, style, breathe]} />;
}

/**
 * A text bar for one line of a type role: it is one line tall (the role's line height) and the bar fills 0.72 em,
 * so swapping in the real text moves nothing. `width` in px or "4ch"-style character counts via `chars`.
 */
export function SkeletonText({ role = "body", width, chars, size, lineHeight, color, style }: { role?: TextRole; width?: number | `${number}%`; chars?: number; size?: number; lineHeight?: number; /** The bar's colour where the hairline grey won't show. */ color?: string; style?: StyleProp<ViewStyle> }) {
  const r = ROLES[role];
  const fs = size ?? r.size;
  const lh = lineHeight ?? (size ? Math.round(size * (r.line / r.size)) : r.line);
  const w = width ?? (chars ? Math.round(chars * fs * 0.6) : "100%");
  return (
    <View style={[{ height: lh, justifyContent: "center", width: w }, style]}>
      <Skeleton radius={4} style={[{ height: Math.round(fs * 0.72), width: "100%" }, color ? { backgroundColor: color } : null]} />
    </View>
  );
}
