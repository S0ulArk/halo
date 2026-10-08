// The day's calories split three ways (Onvy's breakdown): resting (the body's base burn), everyday movement, and
// workouts, as one segmented bar with each part's kcal and share under it. The split itself is strain.ts calorieSplit.
import * as React from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { formatValue } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { REASE } from "@/ui/motion/easing";
import { reduceMotionNow } from "@/ui/motion/system";
import { Num } from "./calmKit";
import { Txt } from "./Text";

export type CaloriePart = { key: string; label: string; note: string; color: string };
export type CalorieBreakdownProps = {
  /** The day's total, kcal (null: no total). */
  total: number | null;
  /** The parts by key (null: the day has a total but no split). */
  parts: Record<string, number> | null | undefined;
  /** Bottom first, as the stacked chart draws them. */
  series: readonly CaloriePart[];
  /** Today's running total. */
  soFar?: boolean;
};

/** One part's share of the meter, a soft capsule grown from 0 on the UI thread when the day changes. */
function Segment({ share, color }: { share: number; color: string }) {
  const w = useSharedValue(reduceMotionNow() ? share : 0);
  React.useEffect(() => {
    w.set(reduceMotionNow() ? share : withTiming(share, { duration: 600, easing: REASE.standard }));
  }, [share, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  // The share is of the whole meter; the 3 px gaps come out of each capsule, so they never push the last one off the end.
  return (
    <Animated.View style={[{ height: "100%", paddingRight: 3 }, style]}>
      <View style={{ flex: 1, borderRadius: 6, backgroundColor: color }} />
    </Animated.View>
  );
}

export function CalorieBreakdown({ total, parts, series, soFar }: CalorieBreakdownProps) {
  const c = useCalm();
  if (total === null || !parts) return null;
  const sum = series.reduce((a, s) => a + Math.max(0, parts[s.key] ?? 0), 0) || 1;
  const shown = series.filter((s) => (parts[s.key] ?? 0) > 0);
  const summary = `${formatValue("grouped", total)} kilocalories${soFar ? " so far" : ""}: ${series
    .map((s) => `${s.label} ${formatValue("grouped", parts[s.key] ?? 0)}, ${Math.round(((parts[s.key] ?? 0) / sum) * 100)} percent`)
    .join("; ")}.`;
  return (
    <View accessible accessibilityLabel={summary} style={{ gap: 14, marginBottom: 20 }}>
      {/* The total in the activity ink with its unit small and grey; "so far" a quiet word after it. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Num value={formatValue("grouped", total)} unit="kcal" size={30} color={c.tintInk.sky} />
        {soFar && (
          <Txt size={13} lineHeight={18} weight={500} color={c.sub}>
            so far
          </Txt>
        )}
      </View>
      {/* The meter: one soft capsule per part, side by side with a little air between them. */}
      <View style={{ height: 12, flexDirection: "row", marginRight: -3 }}>
        {shown.map((s) => (
          <Segment key={s.key} share={(parts[s.key] ?? 0) / sum} color={s.color} />
        ))}
      </View>
      <View style={{ gap: 12 }}>
        {/* Top part first in the legend, as the stack reads top down. */}
        {[...series].reverse().map((s) => {
          const v = parts[s.key] ?? 0;
          return (
            <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={15} lineHeight={20} weight={600} color={c.ink}>
                  {s.label}
                </Txt>
                <Txt size={13} lineHeight={18} color={c.sub}>
                  {s.note}
                </Txt>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Num value={formatValue("grouped", v)} unit="kcal" size={17} />
                <Txt size={12} lineHeight={16} color={c.faint} style={font.numeric(600)}>{`${Math.round((v / sum) * 100)}%`}</Txt>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
