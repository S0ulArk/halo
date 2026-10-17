// A birth date picker (U19), ported from the web's src/components/profile/BirthDatePicker.tsx, as iOS's inline date
// picker: the field opens three wheels (month, day, year) inline under it, so nothing floats over the sheet, with the
// selection band behind the centre row and a selection tick each time a wheel settles on a new value. With a `label`
// the field is a form row (the label on the left, the date on the right in blue while the wheels are open); without
// one it is a filled field (onboarding). Scrolling or tapping a row picks.
import * as React from "react";
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { DAY, formatDay } from "@/lib/format";
import { Txt } from "@/ui";
import { useSoftFill } from "@/ui/components/calmKit";
import { font } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { CalmButton, useCalm } from "./calmKit";

const MONTHS = Array.from({ length: 12 }, (_, i) => formatDay(`2026-${String(i + 1).padStart(2, "0")}`, { month: "long" }));
const OLDEST = 1920;
/** Where the year wheel rests before anything is picked: the middle of the likely range. */
const START_YEAR = 1995;
const ROW = 40;
const VISIBLE = 5;

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** One wheel column: a snapping list whose centred row is the value. Days and years are set in tabular figures. */
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
    if (i !== index) {
      haptic.select();
      onIndex(i);
    }
  };
  const go = (i: number) => {
    at.current = i;
    ref.current?.scrollTo({ y: i * ROW, animated: true });
    if (i !== index) haptic.select();
    onIndex(i);
  };
  const edge = (ROW * (VISIBLE - 1)) / 2;
  return (
    <ScrollView
      ref={ref}
      accessibilityLabel={label}
      style={{ flex, height: ROW * VISIBLE }}
      contentContainerStyle={{ paddingVertical: edge }}
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
      {items.map((item, i) => {
        const on = i === index;
        // Rows further from the centre fade, as on iOS's wheel.
        const off = Math.min(2, Math.abs(i - index));
        return (
          <Pressable key={item} onPress={() => go(i)} accessibilityRole="button" accessibilityLabel={`${label} ${item}`} accessibilityState={{ selected: on }} style={{ height: ROW, alignItems: "center", justifyContent: "center" }}>
            <Txt size={on ? 20 : 18} lineHeight={24} weight={numeric ? undefined : on ? 500 : 400} style={[numeric ? font.numeric(on ? 600 : 500) : null, { color: on ? c.ink : c.sub, opacity: on ? 1 : off === 1 ? 0.75 : 0.4 }]}>
              {item}
            </Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * The field, and under it while open the wheels and Done. `value` is yyyy-MM-dd or "". `wheelsOnly`: the wheels and
 * Done alone, always open, for a screen with its own field (onboarding's typed date); Done then calls `onDone`.
 */
export function BirthDatePicker({
  value,
  onChange,
  invalid,
  startOpen = false,
  label,
  wheelsOnly = false,
  onDone,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  startOpen?: boolean;
  label?: string;
  wheelsOnly?: boolean;
  onDone?: () => void;
}) {
  const c = useCalm();
  const soft = useSoftFill();
  const youngest = React.useMemo(() => new Date().getFullYear() - 13, []);
  const years = React.useMemo(() => Array.from({ length: youngest - OLDEST + 1 }, (_, i) => String(OLDEST + i)), [youngest]);
  const [opened, setOpen] = React.useState(startOpen);
  const open = wheelsOnly || opened;
  const [y, m, d] = value ? value.split("-").map(Number) : [START_YEAR, 1, 1];
  const days = Array.from({ length: daysIn(y, m - 1) }, (_, i) => String(i + 1));
  const set = (year: number, month: number, day: number) => onChange(`${year}-${pad(month)}-${pad(Math.min(day, daysIn(year, month - 1)))}`);
  const shown = value ? formatDay(value, { ...DAY.full, month: "long" }) : null;

  const field = label ? (
    // The form row: the label, then the date in a quiet capsule (blue while the wheels are open).
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={shown ? `${label}, ${shown}` : `${label}, choose`}
      style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}
    >
      <Txt size={16} lineHeight={21} style={{ color: c.ink, flex: 1 }}>
        {label}
      </Txt>
      <View style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: soft, borderWidth: invalid ? 1.5 : 0, borderColor: c.system.red }}>
        <Txt size={16} lineHeight={21} style={{ color: open ? c.teal : shown ? c.ink : c.sub, fontVariant: ["tabular-nums"] }}>
          {shown ?? "Choose"}
        </Txt>
      </View>
    </Pressable>
  ) : (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={shown ? `Birth date, ${shown}` : "Choose your birth date"}
      style={{
        minHeight: 48,
        borderRadius: 12,
        backgroundColor: soft,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderWidth: 1.5,
        borderColor: invalid ? c.system.red : open ? c.teal : "transparent",
      }}
    >
      <Txt size={16} lineHeight={22} style={{ color: shown ? c.ink : c.tertiary, fontVariant: ["tabular-nums"], flexShrink: 1 }}>
        {shown ?? "Choose your birth date"}
      </Txt>
      <CalendarDays size={20} color={c.teal} strokeWidth={1.9} />
    </Pressable>
  );

  return (
    <View style={{ gap: label ? 0 : 8 }}>
      {wheelsOnly ? null : field}
      {open && (
        <View style={{ overflow: "hidden", borderRadius: label || wheelsOnly ? 0 : 16, backgroundColor: label || wheelsOnly ? undefined : soft }}>
          <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 8 }}>
            {/* The selection band behind the centre row. */}
            <View pointerEvents="none" style={{ position: "absolute", left: 8, right: 8, top: (ROW * (VISIBLE - 1)) / 2, height: ROW, borderRadius: 10, backgroundColor: c.fill }} />
            <Wheel label="Month" flex={1.6} items={MONTHS} index={m - 1} onIndex={(i) => set(y, i + 1, d)} />
            <Wheel label="Day" flex={0.9} items={days} index={Math.min(d, days.length) - 1} onIndex={(i) => set(y, m, i + 1)} numeric />
            <Wheel label="Year" flex={1.2} items={years} index={Math.max(0, years.indexOf(String(y)))} onIndex={(i) => set(OLDEST + i, m, d)} numeric />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 8, paddingRight: 10, paddingLeft: 16 }}>
            <Txt size={13} lineHeight={18} style={{ flexShrink: 1, color: c.sub }}>
              Scroll or tap to pick
            </Txt>
            <CalmButton
              size="sm"
              onPress={() => {
                // Done keeps what the wheels show, even if they were never moved.
                set(y, m, d);
                setOpen(false);
                onDone?.();
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
