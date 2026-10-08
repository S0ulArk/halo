// The DateSwitcher's month calendar (spec §4.3, CAL1-CAL6), ported from the web's CalendarPanel and src/lib/calendar.ts.
// The web drops it from the top over a scrim; on the phone it is a bottom sheet. Days are coloured by the screen's score
// (Recovery bands, Strain or Sleep, with a dot under strong days); a tap picks the day.
import * as React from "react";
import { Pressable, View } from "react-native";
import { usePathname } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { BAND_COLOR, DATA_COLORS, recoveryBand } from "@/lib/bands";
import { DAY, formatDay, formatValue } from "@/lib/format";
import { addDays } from "@/lib/time";
import { alpha } from "@/lib/utils";
import { getCalendarMonth } from "@/queries/calendar";
import type { QueryCtx } from "@/queries/ctx";
import type { CalendarDayVM } from "@/queries/types";
import { useQueryCtx } from "@/state/app";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import type { ColorToken } from "@/ui/theme";
import { BottomSheet } from "./BottomSheet";
import { Caption, useSoftFill } from "./calmKit";
import { Txt } from "./Text";

export type CalendarContext = "recovery" | "strain" | "sleep";

/** Monday first, matching the app's ISO weeks (weekOf) (CAL3). 0 = Sunday. */
export const WEEK_STARTS_ON: 0 | 1 = 1;
export const STRAIN_DOT = 10;
/** Inferred: no current Sleep calendar was found (CAL4). */
export const SLEEP_DOT = 85;

/** /strain and /activity show Strain, /sleep shows Sleep, everything else Recovery. */
export function calendarContext(pathname: string): CalendarContext {
  const first = pathname.split("/")[1] ?? "";
  if (first === "strain" || first === "activity") return "strain";
  if (first === "sleep") return "sleep";
  return "recovery";
}

/** Numeral colour token (null: the grey of a day with no score) and, for Strain and Sleep, the dot under it. */
export function dayTone(context: CalendarContext, value: number | null): { text: ColorToken | null; dot: ColorToken | null } {
  if (value === null) return { text: null, dot: null };
  if (context === "recovery") return { text: DATA_COLORS[BAND_COLOR[recoveryBand(value)]].text, dot: null };
  if (context === "strain") return { text: DATA_COLORS.strain.text, dot: value >= STRAIN_DOT ? DATA_COLORS.strain.fill : null };
  return { text: DATA_COLORS.sleep.text, dot: value >= SLEEP_DOT ? DATA_COLORS.sleep.fill : null };
}

export const monthOf = (day: string) => day.slice(0, 7);

/** "2026-05" + n months. */
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** The month's weeks as rows of 7; cells outside the month are null (no outside days). */
export function monthGrid(month: string, weekStartsOn: 0 | 1 = WEEK_STARTS_ON): (string | null)[][] {
  const first = `${month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() - weekStartsOn + 7) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = first; monthOf(d) === month; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** Weekday headers in grid order ("Mon", …; shown in caps). */
export function weekdayLabels(weekStartsOn: 0 | 1 = WEEK_STARTS_ON) {
  // 2026-06-07 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays("2026-06-07", i + weekStartsOn);
    return { short: formatDay(day, { weekday: "short" }), long: formatDay(day, { weekday: "long" }) };
  });
}

export const dayDisabled = (day: string, today: string, firstDay?: string | null) => day > today || (!!firstDay && day < firstDay);

/** Whether the previous / next month holds any selectable day. */
export function monthNav(month: string, today: string, firstDay?: string | null) {
  return { prev: !firstDay || addMonths(month, -1) >= monthOf(firstDay), next: addMonths(month, 1) <= monthOf(today) };
}

/** "May", or "May 2025" outside the current year (CAL2, inferred). */
export function monthLabel(month: string, today: string) {
  return formatDay(month, month.slice(0, 4) === today.slice(0, 4) ? { month: "long" } : DAY.monthYear);
}

const VALUE_TEXT: Record<CalendarContext, (v: number) => string> = {
  recovery: (v) => `Recovery ${Math.round(v)}%`,
  strain: (v) => `Strain ${formatValue("decimal1", v)}`,
  sleep: (v) => `Sleep ${Math.round(v)}%`,
};

const TITLE: Record<CalendarContext, string> = { recovery: "Recovery", strain: "Strain", sleep: "Sleep" };

const LEGEND: Record<CalendarContext, { label: string; color: keyof typeof DATA_COLORS }[]> = {
  recovery: [
    { label: "<34%", color: "recovery-red" },
    { label: "34% - 66%", color: "recovery-yellow" },
    { label: ">66%", color: "recovery-green" },
  ],
  strain: [{ label: `Day Strain ${STRAIN_DOT}+`, color: "strain" }],
  sleep: [{ label: `Sleep ${SLEEP_DOT}%+`, color: "sleep" }],
};

type Months = Record<string, Map<string, CalendarDayVM>>;

/** Fetched months, kept while the screen is mounted (closing the sheet keeps them) and dropped after a new scoring run. */
function useMonths() {
  const ctx = useQueryCtx();
  // Keyed by the query context: a new scoring run makes a new one, and its months start empty.
  const [cache, setCache] = React.useState<{ key: QueryCtx | null; months: Months }>({ key: null, months: {} });
  const requested = React.useRef<{ key: QueryCtx | null; months: Set<string> }>({ key: null, months: new Set() });
  const load = React.useCallback(
    (month: string) => {
      if (!ctx) return;
      if (requested.current.key !== ctx) requested.current = { key: ctx, months: new Set() };
      const asked = requested.current;
      if (asked.months.has(month)) return;
      asked.months.add(month);
      getCalendarMonth(month, ctx)
        .then((vm) =>
          setCache((s) => ({ key: ctx, months: { ...(s.key === ctx ? s.months : {}), [month]: new Map(vm.days.map((x) => [x.day, x])) } })),
        )
        // Days stay grey and selectable; the next open retries.
        .catch(() => asked.months.delete(month));
    },
    [ctx],
  );
  return { months: cache.key === ctx ? cache.months : {}, load };
}

export type CalendarSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The selected day (`?d=`, default today); it carries the filled circle (CAL5). */
  selected: string;
  today: string;
  firstDay?: string | null;
  onSelect: (day: string) => void;
  /** The colouring; default from the route (the web's calendarContext). */
  context?: CalendarContext;
  weekStartsOn?: 0 | 1;
};

/** The month calendar in a bottom sheet. Needs the app's provider (it reads the month's scores). */
export function CalendarSheet({ open, onClose, selected, today, firstDay, onSelect, context, weekStartsOn = WEEK_STARTS_ON }: CalendarSheetProps) {
  const pathname = usePathname();
  const ctx = context ?? calendarContext(pathname);
  const { months, load } = useMonths();
  // Null until the person moves: each open starts on the selected day's month.
  const [viewed, setViewed] = React.useState<string | null>(null);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setViewed(null);
  }
  const month = viewed ?? monthOf(selected);
  React.useEffect(() => {
    if (open) load(month);
  }, [open, load, month]);

  return (
    <BottomSheet open={open} onClose={onClose} title={TITLE[ctx]}>
      <MonthPanel
        month={month}
        data={months[month]}
        selected={selected}
        today={today}
        firstDay={firstDay}
        context={ctx}
        weekStartsOn={weekStartsOn}
        onMonth={(n) => setViewed(addMonths(month, n))}
        onSelect={onSelect}
      />
    </BottomSheet>
  );
}

function MonthPanel({
  month,
  data,
  selected,
  today,
  firstDay,
  context,
  weekStartsOn,
  onMonth,
  onSelect,
}: {
  month: string;
  data: Map<string, CalendarDayVM> | undefined;
  selected: string;
  today: string;
  firstDay?: string | null;
  context: CalendarContext;
  weekStartsOn: 0 | 1;
  onMonth: (n: number) => void;
  onSelect: (day: string) => void;
}) {
  const { c } = useTheme();
  const calm = useCalm();
  const soft = useSoftFill();
  const nav = monthNav(month, today, firstDay);
  const label = monthLabel(month, today);
  return (
    <View style={{ paddingBottom: 4 }}>
      {/* 44 | month | 44 */}
      <View style={{ height: 56, flexDirection: "row", alignItems: "center" }}>
        <MonthStep dir={-1} disabled={!nav.prev} onPress={() => onMonth(-1)} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Txt size={17} lineHeight={22} weight={600} color={calm.ink} accessibilityRole="header">
            {label}
          </Txt>
        </View>
        <MonthStep dir={1} disabled={!nav.next} onPress={() => onMonth(1)} />
      </View>

      <View style={{ marginTop: 4 }} accessibilityLabel={label}>
        <View style={{ flexDirection: "row" }}>
          {weekdayLabels(weekStartsOn).map((w) => (
            <View key={w.short} style={{ flex: 1, alignItems: "center" }} accessibilityLabel={w.long}>
              <Caption>{w.short}</Caption>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 4 }}>
          {monthGrid(month, weekStartsOn).map((week) => (
            <View key={week.find(Boolean)} style={{ height: 48, flexDirection: "row" }}>
              {week.map((day, i) =>
                day ? (
                  <Day
                    key={day}
                    day={day}
                    context={context}
                    value={data?.get(day)?.[context] ?? null}
                    selected={day === selected}
                    today={day === today}
                    disabled={dayDisabled(day, today, firstDay)}
                    onSelect={onSelect}
                  />
                ) : (
                  <View key={i} style={{ flex: 1 }} />
                ),
              )}
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 8, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12 }}>
        {/* Back to today from a past day or another month (spec §11 UX1). */}
        {(selected !== today || month !== monthOf(today)) && (
          <Pressable
            onPress={() => onSelect(today)}
            accessibilityRole="button"
            accessibilityLabel="Back to today"
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => ({ height: 36, borderRadius: 18, paddingHorizontal: 16, justifyContent: "center", backgroundColor: soft, opacity: pressed ? 0.7 : 1 })}
          >
            <Txt size={14} lineHeight={18} weight={600} color={calm.teal}>
              Today
            </Txt>
          </Pressable>
        )}
        <View style={{ marginLeft: "auto", flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", columnGap: 12, rowGap: 4, flexShrink: 1 }}>
          {LEGEND[context].map(({ label: text, color }) => (
            <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c[DATA_COLORS[color].fill] }} />
              <Txt size={12} lineHeight={16} weight={600} color={DATA_COLORS[color].text} style={{ fontVariant: ["tabular-nums"] }}>
                {text}
              </Txt>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function MonthStep({ dir, disabled, onPress }: { dir: -1 | 1; disabled: boolean; onPress: () => void }) {
  const c = useCalm();
  const soft = useSoftFill();
  const Icon = dir < 0 ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? "Previous month" : "Next month"}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: soft, opacity: pressed && !disabled ? 0.7 : 1 })}
    >
      <Icon size={22} color={disabled ? c.faint : c.ink} strokeWidth={2} />
    </Pressable>
  );
}

function Day({
  day,
  context,
  value,
  selected,
  today,
  disabled,
  onSelect,
}: {
  day: string;
  context: CalendarContext;
  value: number | null;
  selected: boolean;
  /** Today off the selected day is set in teal, so a past day's month still shows where today is (spec §11 UX1). */
  today: boolean;
  disabled: boolean;
  onSelect: (day: string) => void;
}) {
  const { c } = useTheme();
  const calm = useCalm();
  const tone = disabled ? { text: null, dot: null } : dayTone(context, value);
  // The chosen day: white numerals on the teal disc (the card colour, so dark mode's light teal takes dark numerals).
  // Today (when not chosen): teal numerals. Else the score's colour.
  const color = selected ? calm.card : today ? calm.teal : tone.text ? c[tone.text] : alpha(calm.ink, 0.4);
  const label = `${today ? "Today, " : ""}${formatDay(day, DAY.long)}${value !== null && !disabled ? `, ${VALUE_TEXT[context](value)}` : ""}`;
  return (
    <Pressable
      onPress={() => onSelect(day)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      {({ pressed }) => (
        <>
          {/* The selected day: a 36 px deep-teal disc (the active colour). */}
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? calm.teal : pressed ? alpha(calm.ink, 0.06) : "transparent",
              transform: [{ scale: pressed ? 0.96 : 1 }],
            }}
          >
            <Txt size={17} lineHeight={20} color={color} style={font.numeric(selected || today ? 700 : 600)}>
              {Number(day.slice(8))}
            </Txt>
          </View>
          {!!tone.dot && <View style={{ position: "absolute", top: "50%", left: "50%", marginTop: 16, marginLeft: -2, width: 4, height: 4, borderRadius: 2, backgroundColor: c[tone.dot] }} />}
        </>
      )}
    </Pressable>
  );
}
