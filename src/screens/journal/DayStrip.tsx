// The Journal's day strip (spec §5.11), ported from the web's src/components/metrics/DayStrip.tsx with its `journal`
// indicator, in the Calm style: the last 30 days (reaching back to the chosen day), each a white 44 px pill with the
// weekday, the date in the numeric face and a check-in mark; the chosen day is solid teal and centred in the strip.
import * as React from "react";
import { Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { Check } from "lucide-react-native";
import { DAY, formatDay } from "@/lib/format";
import { Skeleton, Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { useCalm } from "../settings/calmKit";

const TILE = 44;
const GAP = 6;
const PAD = 16;

export type DayStripDay = { date: string; done: boolean };

export function DayStrip({ days, value, onChange }: { days: DayStripDay[]; value: string; onChange: (day: string) => void }) {
  const c = useCalm();
  const scroll = React.useRef<ScrollView>(null);
  const [width, setWidth] = React.useState(0);
  const first = React.useRef(true);
  const index = days.findIndex((d) => d.date === value);

  React.useEffect(() => {
    if (!width || index < 0) return;
    // Centre the day inside the strip; the first time without animating.
    const x = PAD + index * (TILE + GAP) - (width - TILE) / 2;
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
      {days.map((day) => {
        const on = day.date === value;
        const ink = on ? c.card : c.ink;
        return (
          <Pressable
            key={day.date}
            onPress={() => day.date !== value && onChange(day.date)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${formatDay(day.date, DAY.long)}, ${day.done ? "checked in" : "not checked in"}`}
            style={({ pressed }) => ({
              width: TILE,
              paddingTop: 10,
              paddingBottom: 8,
              borderRadius: TILE / 2,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              backgroundColor: on ? c.teal : c.card,
              opacity: pressed && !on ? 0.75 : 1,
            })}
          >
            <Txt size={11} lineHeight={13} weight={600} style={{ color: on ? c.card : c.faint, letterSpacing: 1.4 }}>
              {formatDay(day.date, { weekday: "short" }).charAt(0).toUpperCase()}
            </Txt>
            <Txt size={18} lineHeight={21} style={[font.numeric(700), { color: ink }]}>
              {String(Number(day.date.slice(8)))}
            </Txt>
            <View
              style={[
                { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 2 },
                day.done ? { backgroundColor: on ? c.card : c.tint.mint } : { borderWidth: 1.5, borderColor: on ? c.card + "88" : c.line },
              ]}
            >
              {day.done && <Check size={11} color={on ? c.teal : c.tintInk.mint} strokeWidth={3} />}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The strip's 30 pills, clipped like the real one. */
export function DayStripSkeleton() {
  return (
    <View style={{ marginHorizontal: -16, paddingHorizontal: PAD, flexDirection: "row", gap: GAP, overflow: "hidden" }}>
      {Array.from({ length: 30 }, (_, i) => (
        <Skeleton key={i} radius={TILE / 2} style={{ width: TILE, height: 80 }} />
      ))}
    </View>
  );
}
