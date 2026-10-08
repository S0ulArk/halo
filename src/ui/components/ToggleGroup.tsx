import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useCalm } from "@/ui/calm";
import { font as faces } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { useSoftFill } from "./calmKit";
import { Txt } from "./Text";

export type ToggleItem<V extends string> = { value: V; label: string; accessibilityLabel?: string };

export type ToggleGroupProps<V extends string> = {
  value: V;
  onChange: (value: V) => void;
  items: readonly ToggleItem<V>[];
  /** `numeric`: Barlow 14 bold (range toggles). `caps`: Figtree 14 semibold, sentence case (Breakdown / Timeline, sleep goals). */
  font?: "numeric" | "caps";
  /** Items share the width (the web's `w-full` / `grid-cols-3`). */
  fill?: boolean;
  /** Minimum item width (the range toggle's `min-w-11`). */
  minItemWidth?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * The kit's segmented control (range pickers W / M / 6M / 1Y and friends), Calm: a pill track (white on the ground,
 * the ground's grey on a card) with 3 px padding and 38 px pill items; the chosen one is the deep teal with white
 * text, the others grey.
 */
export function ToggleGroup<V extends string>({ value, onChange, items, font = "caps", fill, minItemWidth = 44, disabled, style, accessibilityLabel }: ToggleGroupProps<V>) {
  const c = useCalm();
  const { scheme } = useTheme();
  const track = useSoftFill();
  const onInk = scheme === "dark" ? c.ground : "#ffffff";
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[{ flexDirection: "row", gap: 2, borderRadius: 22, backgroundColor: track, borderWidth: 1, borderColor: c.hairline, padding: 2, alignSelf: fill ? "stretch" : "flex-start" }, style]}>
      {items.map((it) => {
        const on = it.value === value;
        const color = on ? onInk : disabled ? c.faint : c.sub;
        return (
          <Pressable
            key={it.value}
            onPress={() => !disabled && onChange(it.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: !!disabled }}
            accessibilityLabel={it.accessibilityLabel ?? it.label}
            style={{ minHeight: 38, minWidth: minItemWidth, flex: fill ? 1 : undefined, paddingHorizontal: font === "numeric" ? 12 : 14, paddingVertical: 4, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.teal : "transparent", opacity: on && disabled ? 0.6 : 1 }}
          >
            {font === "numeric" ? (
              <Txt size={14} lineHeight={18} color={color} style={faces.numeric(600)}>
                {it.label}
              </Txt>
            ) : (
              <Txt size={14} lineHeight={18} weight={600} color={color} align="center">
                {it.label}
              </Txt>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
