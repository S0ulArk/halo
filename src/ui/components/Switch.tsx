// The iOS switch: a 51 × 31 track, green when on and a quiet grey when off, under a white knob with a soft shadow that
// springs across (Reanimated, on the UI thread) with a toggle click under the finger. The track's colour follows the
// knob's travel, so the two never disagree mid-flight.
import * as React from "react";
import { Pressable } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useCalm } from "@/ui/calm";
import { haptic } from "@/ui/motion/haptics";
import { SPRING } from "@/ui/motion/springs";
import { reduceMotionNow } from "@/ui/motion/system";
import { useTheme } from "@/ui/ThemeProvider";

const W = 51;
const H = 31;
const KNOB = 27;
const TRAVEL = W - KNOB - 4;

export function Switch({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const on = c.system.green;
  const off = dark ? "rgba(120,120,128,0.32)" : "rgba(120,120,128,0.16)";
  const t = useSharedValue(value ? 1 : 0);
  // A change from outside (a saved setting arriving) moves the knob too; the first value is shown at once.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current || reduceMotionNow()) {
      first.current = false;
      t.set(value ? 1 : 0);
      return;
    }
    t.set(withSpring(value ? 1 : 0, SPRING.snappy));
  }, [value, t]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(Math.min(1, Math.max(0, t.value)), [0, 1], [off, on]) }), [off, on]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * TRAVEL }] }));
  return (
    <Pressable
      onPress={() => {
        haptic.toggle(!value);
        onChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={{ opacity: disabled ? 0.4 : 1, flexShrink: 0 }}
    >
      <Animated.View style={[{ width: W, height: H, borderRadius: H / 2, padding: 2 }, track]}>
        <Animated.View style={[{ width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: "#ffffff", boxShadow: "0 3px 8px rgba(0,0,0,0.15), 0 3px 1px rgba(0,0,0,0.06)" }, knob]} />
      </Animated.View>
    </Pressable>
  );
}
