// The Journal's day strip (spec §5.11), ported from the web's src/components/metrics/DayStrip.tsx with its `journal`
// indicator, as Apple Fitness's calendar row: the last 30 days (reaching back to the chosen day), each the weekday's
// letter over its date in a circle, a green dot under the days with a check-in. The chosen day's circle fills blue (a
// short cross-fade on the UI thread, with a selection tick) and the strip glides to centre it.
import * as React from "react";
import { Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DAY, formatDay } from "@/lib/format";
import { Skeleton, Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { reduceMotionNow } from "@/ui/motion/system";
import { useCalm } from "../settings/calmKit";

const COL = 44;
const GAP = 4;
const PAD = 16;
const CIRCLE = 36;

export type DayStripDay = { date: string; done: boolean };

/** One day: its letter, its date in a circle that fills blue when chosen, the check-in dot under it. */
const Day = React.memo(function Day({ date, done, on, today, onPress }: { date: string; done: boolean; on: boolean; today: boolean; onPress: (day: string) => void }) {
  const c = useCalm();
  const sel = useSharedValue(on ? 1 : 0);
  React.useEffect(() => {
    sel.set(reduceMotionNow() ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 180 }));
  }, [on, sel]);
  const idle = today ? c.teal : c.ink;
  const circle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(sel.value, [0, 1], ["rgba(0,0,0,0)", c.teal]) }), [c.teal]);
  const digits = useAnimatedStyle(() => ({ color: interpolateColor(sel.value, [0, 1], [idle, "#ffffff"]) }), [idle]);
  return (
    <Pressable
      onPress={() => {
        if (on) return;
        haptic.select();
        onPress(date);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${formatDay(date, DAY.long)}, ${done ? "checked in" : "not checked in"}`}
      style={({ pressed }) => ({ width: COL, alignItems: "center", gap: 4, paddingVertical: 4, opacity: pressed && !on ? 0.55 : 1 })}
    >
      <Txt size={12} lineHeight={15} weight={600} style={{ color: on ? c.ink : c.sub }}>
        {formatDay(date, { weekday: "narrow" })}
      </Txt>
      <Animated.View style={[{ width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: "center", justifyContent: "center" }, circle]}>
        <Animated.Text allowFontScaling={false} style={[font.numeric(600), { fontSize: 17, lineHeight: 21, includeFontPadding: false }, digits]}>
          {String(Number(date.slice(8)))}
        </Animated.Text>
      </Animated.View>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: done ? c.tintInk.mint : "transparent" }} />
    </Pressable>
  );
});

export function DayStrip({ days, value, today, onChange }: { days: DayStripDay[]; value: string; today?: string; onChange: (day: string) => void }) {
  const scroll = React.useRef<ScrollView>(null);
  const [width, setWidth] = React.useState(0);
  const first = React.useRef(true);
  const index = days.findIndex((d) => d.date === value);

  React.useEffect(() => {
    if (!width || index < 0) return;
    // Centre the day inside the strip; the first time without animating.
    const x = PAD + index * (COL + GAP) - (width - COL) / 2;
    scroll.current?.scrollTo({ x: Math.max(0, x), animated: !first.current });
    first.current = false;
  }, [index, width, days.length]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel="Choose a day"
      style={{ marginHorizontal: -16 }}
      contentContainerStyle={{ paddingHorizontal: PAD, gap: GAP }}
    >
      {days.map((day) => (
        <Day key={day.date} date={day.date} done={day.done} on={day.date === value} today={day.date === today} onPress={onChange} />
      ))}
    </ScrollView>
  );
}

/** The strip's 30 days, clipped like the real one. */
export function DayStripSkeleton() {
  return (
    <View style={{ marginHorizontal: -16, paddingHorizontal: PAD, flexDirection: "row", gap: GAP, overflow: "hidden" }}>
      {Array.from({ length: 30 }, (_, i) => (
        <View key={i} style={{ width: COL, alignItems: "center", gap: 4, paddingVertical: 4 }}>
          <Skeleton radius={4} style={{ width: 10, height: 15 }} />
          <Skeleton radius={CIRCLE / 2} style={{ width: CIRCLE, height: CIRCLE }} />
          <View style={{ height: 6 }} />
        </View>
      ))}
    </View>
  );
}
