// The day's calories split three ways (Onvy's breakdown): resting (the body's base burn), everyday movement, and
// workouts, as Apple Health draws a share: one rounded meter of three capsules with a hair of air between them, then an
// iOS list of the parts (each one's swatch, name and note, its kcal and share on the right). The split itself is
// strain.ts calorieSplit. The meter wipes in from the left once per day shown: two counter-moving clipped views on one
// shared value, a spring on the UI thread, so nothing lays out while it moves.
import * as React from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import { formatValue } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { iosSpring } from "@/ui/motion/springs";
import { entranceStill } from "@/ui/motion/system";
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

const WIPE = iosSpring(0.7, 0.92);

/** The meter, its capsules laid out once at their shares and revealed left to right. */
function Meter({ shares }: { shares: { key: string; share: number; color: string }[] }) {
  const [still] = React.useState(() => entranceStill());
  const p = useSharedValue(still ? 1 : 0);
  const w = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    w.set(e.nativeEvent.layout.width);
    if (!still && p.value === 0) p.set(withDelay(120, withSpring(1, WIPE)));
  };
  const outer = useAnimatedStyle(() => ({ opacity: w.value > 0 ? 1 : 0, transform: [{ translateX: -(1 - Math.min(1, p.value)) * w.value }] }));
  const inner = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - Math.min(1, p.value)) * w.value }] }));
  return (
    <Animated.View onLayout={onLayout} style={[{ height: 12, overflow: "hidden" }, outer]}>
      <Animated.View style={[StyleSheet.absoluteFill, { flexDirection: "row", gap: 3 }, inner]}>
        {shares.map((s) => (
          <View key={s.key} style={{ flexGrow: s.share, flexBasis: 0, borderRadius: 6, backgroundColor: s.color }} />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

export function CalorieBreakdown({ total, parts, series, soFar }: CalorieBreakdownProps) {
  const c = useCalm();
  if (total === null || !parts) return null;
  const sum = series.reduce((a, s) => a + Math.max(0, parts[s.key] ?? 0), 0) || 1;
  const shown = series.filter((s) => (parts[s.key] ?? 0) > 0).map((s) => ({ key: s.key, share: (parts[s.key] ?? 0) / sum, color: s.color }));
  const summary = `${formatValue("grouped", total)} kilocalories${soFar ? " so far" : ""}: ${series
    .map((s) => `${s.label} ${formatValue("grouped", parts[s.key] ?? 0)}, ${Math.round(((parts[s.key] ?? 0) / sum) * 100)} percent`)
    .join("; ")}.`;
  const legend = [...series].reverse();
  return (
    <View accessible accessibilityLabel={summary} style={{ gap: 14, marginBottom: 20 }}>
      {/* The total in the activity colour with its unit small and grey; "so far" a quiet word after it. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Num value={formatValue("grouped", total)} unit="kcal" size={30} color={c.tintInk.sky} />
        {soFar && (
          <Txt size={14} lineHeight={19} weight={500} color={c.sub}>
            so far
          </Txt>
        )}
      </View>
      {/* Keyed by the day's total: a new day wipes in again. */}
      <Meter key={total} shares={shown} />
      <View>
        {/* Top part first in the legend, as the stack reads top down. */}
        {legend.map((s, i) => {
          const v = parts[s.key] ?? 0;
          return (
            <React.Fragment key={s.key}>
              {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 22, backgroundColor: c.line }} />}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={16} lineHeight={21} color={c.ink}>
                    {s.label}
                  </Txt>
                  <Txt size={13} lineHeight={18} color={c.sub}>
                    {s.note}
                  </Txt>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Num value={formatValue("grouped", v)} unit="kcal" size={17} />
                  <Txt size={13} lineHeight={17} color={c.sub} style={font.numeric(500)}>{`${Math.round((v / sum) * 100)}%`}</Txt>
                </View>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}
