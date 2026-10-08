// A birth date picker (U19), ported from the web's src/components/profile/BirthDatePicker.tsx: the field opens three
// wheels (month, day, year) inline under it, so nothing floats over the sheet. Scrolling or tapping a row picks.
import * as React from "react";
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { DAY, formatDay } from "@/lib/format";
import { Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { CalmButton, useCalm } from "./calmKit";

const MONTHS = Array.from({ length: 12 }, (_, i) => formatDay(`2026-${String(i + 1).padStart(2, "0")}`, { month: "long" }));
const OLDEST = 1920;
/** Where the year wheel rests before anything is picked: the middle of the likely range. */
const START_YEAR = 1995;
const ROW = 40;
const VISIBLE = 3;

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** One wheel column: a snapping list whose centred row is the value. Days and years are set in the numeric face. */
function Wheel({ label, items, index, onIndex, flex, numeric = false }: { label: string; items: string[]; index: number; onIndex: (i: number) => void; flex: number; numeric?: boolean }) {
  const c = useCalm();
  const ref = React.useRef<ScrollView>(null);
  const at = React.useRef(index);
  // Follow outside changes (open, a shorter month) without fighting the person's own scroll.
  React.useEffect(() => {
    if (at.current !== index) {
      at.current = index;
      ref.current?.scrollTo({ y: index * ROW, animated: false });
    }
  }, [index, items.length]);
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
    at.current = i;
    if (i !== index) onIndex(i);
  };
  const go = (i: number) => {
    at.current = i;
    ref.current?.scrollTo({ y: i * ROW, animated: true });
    onIndex(i);
  };
  return (
    <ScrollView
      ref={ref}
      accessibilityLabel={label}
      style={{ flex, height: ROW * VISIBLE }}
      contentContainerStyle={{ paddingVertical: ROW }}
      contentOffset={{ x: 0, y: index * ROW }}
      snapToInterval={ROW}
      decelerationRate="fast"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={(e) => {
        // A drag that stops without a fling never fires momentum end on Android.
        if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e);
      }}
    >
      {items.map((item, i) => (
        <Pressable key={item} onPress={() => go(i)} accessibilityRole="button" accessibilityLabel={`${label} ${item}`} accessibilityState={{ selected: i === index }} style={{ height: ROW, alignItems: "center", justifyContent: "center" }}>
          <Txt
            size={numeric ? 18 : 17}
            lineHeight={22}
            weight={numeric ? undefined : i === index ? 600 : 400}
            style={[numeric ? font.numeric(i === index ? 700 : 500) : null, { color: i === index ? c.ink : c.faint, fontVariant: ["tabular-nums"] }]}
          >
            {item}
          </Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** The field, and under it while open the wheels and Done. `value` is yyyy-MM-dd or "". */
export function BirthDatePicker({ value, onChange, invalid, startOpen = false }: { value: string; onChange: (v: string) => void; invalid?: boolean; startOpen?: boolean }) {
  const c = useCalm();
  const youngest = React.useMemo(() => new Date().getFullYear() - 13, []);
  const years = React.useMemo(() => Array.from({ length: youngest - OLDEST + 1 }, (_, i) => String(OLDEST + i)), [youngest]);
  const [open, setOpen] = React.useState(startOpen);
  const [y, m, d] = value ? value.split("-").map(Number) : [START_YEAR, 1, 1];
  const days = Array.from({ length: daysIn(y, m - 1) }, (_, i) => String(i + 1));
  const set = (year: number, month: number, day: number) => onChange(`${year}-${pad(month)}-${pad(Math.min(day, daysIn(year, month - 1)))}`);

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={value ? `Birth date, ${formatDay(value, { ...DAY.full, month: "long" })}` : "Choose your birth date"}
        style={{
          minHeight: 52,
          borderRadius: 16,
          backgroundColor: c.ground,
          paddingHorizontal: 16,
          paddingVertical: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderWidth: 1.5,
          borderColor: invalid ? c.tintInk.rose : open ? c.teal : "transparent",
        }}
      >
        <Txt size={16} lineHeight={22} style={{ color: value ? c.ink : c.faint, fontVariant: ["tabular-nums"], flexShrink: 1 }}>
          {value ? formatDay(value, { ...DAY.full, month: "long" }) : "Choose your birth date"}
        </Txt>
        <CalendarDays size={20} color={c.teal} strokeWidth={1.75} />
      </Pressable>
      {open && (
        <View style={{ overflow: "hidden", borderRadius: 20, backgroundColor: c.ground }}>
          <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingTop: 4 }}>
            {/* The selection band behind the centre row. */}
            <View pointerEvents="none" style={{ position: "absolute", left: 8, right: 8, top: 4 + ROW, height: ROW, borderRadius: 12, backgroundColor: c.card }} />
            <Wheel label="Month" flex={1.6} items={MONTHS} index={m - 1} onIndex={(i) => set(y, i + 1, d)} />
            <Wheel label="Day" flex={1} items={days} index={Math.min(d, days.length) - 1} onIndex={(i) => set(y, m, i + 1)} numeric />
            <Wheel label="Year" flex={1.2} items={years} index={Math.max(0, years.indexOf(String(y)))} onIndex={(i) => set(OLDEST + i, m, d)} numeric />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 8, paddingRight: 8, paddingLeft: 16 }}>
            <Txt size={13} lineHeight={18} style={{ flexShrink: 1, color: c.sub }}>
              Scroll or tap to pick
            </Txt>
            <CalmButton
              size="sm"
              onPress={() => {
                // Done keeps what the wheels show, even if they were never moved.
                set(y, m, d);
                setOpen(false);
              }}
            >
              Done
            </CalmButton>
          </View>
        </View>
      )}
    </View>
  );
}
