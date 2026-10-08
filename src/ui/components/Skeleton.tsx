import * as React from "react";
import { Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";
import { useCalm } from "@/ui/calm";
import { ROLES, type TextRole } from "./Text";

// Skeletons reuse the component's own box (spec §5.19); these are only the bars inside it.

const pulse = new Animated.Value(1);
// One shared loop (native driver) while any skeleton is on screen, stopped when the last one goes: a loop left running
// with nothing to draw still wakes the UI thread every frame.
let mounted = 0;
let loop: Animated.CompositeAnimation | null = null;
function usePulse() {
  React.useEffect(() => {
    if (mounted++ === 0) {
      pulse.setValue(1);
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.5, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
    }
    return () => {
      if (--mounted === 0) {
        loop?.stop();
        loop = null;
      }
    };
  }, []);
}

/** A pulsing bar in the Calm hairline grey (`calm.line`). Give it a size; the default radius is 8. */
export function Skeleton({ style, radius = 8 }: { style?: StyleProp<ViewStyle>; radius?: number }) {
  const c = useCalm();
  usePulse();
  return <Animated.View style={[{ backgroundColor: c.line, borderRadius: radius, opacity: pulse }, style]} />;
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
