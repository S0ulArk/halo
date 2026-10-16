// The range and view toggles (W / M / 6M / 1Y, Breakdown / Timeline): the kit's iOS segmented control
// (Segmented.tsx) under the props the charts and screens have always passed.
import * as React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { SegmentedControl } from "./Segmented";

export type ToggleItem<V extends string> = { value: V; label: string; accessibilityLabel?: string };

export type ToggleGroupProps<V extends string> = {
  value: V;
  onChange: (value: V) => void;
  items: readonly ToggleItem<V>[];
  /** `numeric`: tabular figures (range toggles). `caps`: the text face, sentence case (Breakdown / Timeline, sleep goals). */
  font?: "numeric" | "caps";
  /** Segments share the width; otherwise each fits its label. */
  fill?: boolean;
  /** Minimum segment width. */
  minItemWidth?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** A view switch as the iOS segmented control: the chosen segment under a sliding thumb. */
export function ToggleGroup<V extends string>({ value, onChange, items, font = "caps", fill, minItemWidth = 44, disabled, style, accessibilityLabel }: ToggleGroupProps<V>) {
  return <SegmentedControl value={value} onChange={onChange} items={items} numeric={font === "numeric"} fill={!!fill} minItemWidth={minItemWidth} disabled={disabled} role="tab" accessibilityLabel={accessibilityLabel} style={style} />;
}
