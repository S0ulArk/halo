// The iOS segmented control, the one every choice of a few options uses (ToggleGroup's ranges, Settings' Theme, the
// sheets' pickers): a grey track with 9 px corners and a white thumb (a lighter grey in the dark) that slides to the
// chosen segment on a spring, with a selection tick under the finger. The thumb is one view moved on the UI thread
// (Reanimated); the segments themselves never re-lay out while it moves.
import * as React from "react";
import { Pressable, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { SPRING } from "@/ui/motion/springs";
import { reduceMotionNow } from "@/ui/motion/system";
import { useTheme } from "@/ui/ThemeProvider";
import { Txt } from "./Text";

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export type SegmentItem<V extends string> = { value: V; label: string; accessibilityLabel?: string; icon?: IconComponent };

export type SegmentedControlProps<V extends string> = {
  /** The chosen segment; null shows no thumb. */
  value: V | null;
  onChange: (value: V) => void;
  items: readonly SegmentItem<V>[];
  /** Segments share the width (iOS's default); false sizes each to its label, the control to its segments. */
  fill?: boolean;
  /** A segment's least width. */
  minItemWidth?: number;
  /** Labels in the numeric face's tabular figures (range pickers: W / M / 6M). */
  numeric?: boolean;
  disabled?: boolean;
  /** `radio` (a setting, the default) or `tab` (a view switch). */
  role?: "radio" | "tab";
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

type Box = { x: number; w: number };

export function SegmentedControl<V extends string>({ value, onChange, items, fill = true, minItemWidth = 0, numeric = false, disabled = false, role = "radio", accessibilityLabel, style }: SegmentedControlProps<V>) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  // Each segment's place in the track, measured once it lays out.
  const [boxes, setBoxes] = React.useState<Partial<Record<V, Box>>>({});
  const measure = React.useCallback((v: V, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setBoxes((b) => (b[v]?.x === x && b[v]?.w === width ? b : { ...b, [v]: { x, w: width } }));
  }, []);
  const box = value === null ? undefined : boxes[value];
  const bx = box?.x ?? null;
  const bw = box?.w ?? null;

  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const shown = useSharedValue(0);
  // The first placement (and every one under Reduce motion) is immediate; after that the thumb springs.
  const placed = React.useRef(false);
  React.useEffect(() => {
    if (bx === null || bw === null) {
      shown.set(0);
      placed.current = false;
      return;
    }
    shown.set(1);
    if (!placed.current || reduceMotionNow()) {
      placed.current = true;
      x.set(bx);
      w.set(bw);
      return;
    }
    x.set(withSpring(bx, SPRING.snappy));
    if (w.get() !== bw) w.set(withSpring(bw, SPRING.snappy));
  }, [bx, bw, x, w, shown]);
  const thumb = useAnimatedStyle(() => ({ opacity: shown.value, width: w.value, transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole={role === "tab" ? "tablist" : "radiogroup"}
      accessibilityLabel={accessibilityLabel}
      style={[{ flexDirection: "row", borderRadius: 9, padding: 2, backgroundColor: c.fill, alignSelf: fill ? "stretch" : "flex-start" }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", top: 2, bottom: 2, left: 0, borderRadius: 7, backgroundColor: c.thumb, opacity: disabled ? 0.6 : 1 },
          dark ? null : { boxShadow: "0 3px 8px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)" },
          thumb,
        ]}
      />
      {items.map((it) => {
        const on = it.value === value;
        const ink = disabled ? c.faint : c.ink;
        const Icon = it.icon;
        return (
          <Pressable
            key={it.value}
            onLayout={(e) => measure(it.value, e)}
            onPress={() => {
              if (disabled) return;
              if (!on) haptic.select();
              onChange(it.value);
            }}
            accessibilityRole={role}
            accessibilityState={role === "tab" ? { selected: on, disabled } : { checked: on, disabled }}
            accessibilityLabel={it.accessibilityLabel ?? it.label}
            style={({ pressed }) => ({
              flex: fill ? 1 : undefined,
              minWidth: minItemWidth,
              minHeight: 28,
              paddingHorizontal: 12,
              paddingVertical: 4,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: pressed && !on ? 0.55 : 1,
            })}
          >
            {Icon ? <Icon size={15} color={ink} strokeWidth={2} /> : null}
            <Txt size={13} lineHeight={18} weight={on ? 600 : 500} align="center" color={ink} style={[{ flexShrink: 1 }, numeric ? font.numeric(on ? 600 : 500) : null]}>
              {it.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
