import * as React from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { dayLabel, rangeLabel } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { CalendarSheet, type CalendarContext } from "./CalendarSheet";
import { Txt } from "./Text";

export type DateSwitcherProps = {
  mode: "day" | "week";
  /** The selected day, YYYY-MM-DD. */
  date: string;
  /** Today (YYYY-MM-DD) in the user's zone; the next chevron greys out there. */
  today: string;
  /** First stored day; the previous chevron stops here. */
  firstDay?: string | null;
  onChange: (day: string) => void;
  /**
   * A tap on the label opens the calendar. Without it the switcher opens its own month calendar (CalendarSheet, as
   * the web's DateSwitcher owns its CalendarPanel): a picked day goes through `onChange`.
   */
  onOpenCalendar?: () => void;
  /** The calendar's colouring (default from the route: /strain and /activity Strain, /sleep Sleep, else Recovery); `false`: no calendar. */
  calendar?: CalendarContext | false;
  /**
   * `header`: the date is the detail header's title (Recovery, Strain, Sleep, spec §4.4), a slightly wider pill.
   * `body` (default): the pill. Both are the Calm white pill.
   */
  placement?: "header" | "body";
  /** Home's top row on narrow phones: 24 px chevrons and a snug label. */
  narrow?: boolean;
  /** The pill shows the app's one spinner while the next day loads. */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const stepDay = (from: string, by: number, today: string, firstDay?: string | null) => {
  const day = addDays(from, by);
  return day > today ? today : firstDay && day < firstDay ? firstDay : day;
};
/** Monday and Sunday of the ISO week containing `day`. */
export function weekOf(day: string): [string, string] {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const mon = addDays(day, -dow);
  return [mon, addDays(mon, 6)];
}

/** A soft chevron in the pill: grey, a faint disc while pressed, a hairline grey where it stops. */
function Step({ dir, disabled, unit, box, onPress }: { dir: -1 | 1; disabled: boolean; unit: string; box: number; onPress: () => void }) {
  const c = useCalm();
  const color = disabled ? c.line : c.sub;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${dir < 0 ? "Previous" : "Next"} ${unit}`}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => ({ width: box, height: box, borderRadius: box / 2, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.line : "transparent" })}
    >
      {dir < 0 ? <ChevronLeft size={18} color={color} strokeWidth={2.25} /> : <ChevronRight size={18} color={color} strokeWidth={2.25} />}
    </Pressable>
  );
}

/**
 * The Calm date pill: a white pill (`calm.card`, 40 px, radius 20) with soft grey chevrons either side of the day in
 * Figtree 600 ink; a tap on the day opens the calendar. In a detail header it is the title.
 */
export function DateSwitcher({ mode, date, today, firstDay, onChange, onOpenCalendar, calendar, placement = "body", narrow = false, loading = false, style }: DateSwitcherProps) {
  const c = useCalm();
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const ownCalendar = !onOpenCalendar && calendar !== false;
  const openCalendar = onOpenCalendar ?? (ownCalendar ? () => setCalendarOpen(true) : undefined);
  const week = mode === "week";
  const [weekStart, weekEnd] = weekOf(date);
  const atEnd = week ? weekStart >= weekOf(today)[0] : date >= today;
  const atStart = !!firstDay && (week ? weekStart <= firstDay : date <= firstDay);
  const unit = week ? "week" : "day";
  const step = week ? 7 : 1;
  const by = (n: number) => onChange(stepDay(date, n, today, firstDay));
  const label = week ? rangeLabel(weekStart, weekEnd) : dayLabel(date, today);
  const bare = placement === "header";
  const stepBox = narrow ? 32 : 36;

  return (
    <View style={[{ flexDirection: "row", alignItems: "center", height: 40, borderRadius: 20, backgroundColor: c.card, paddingHorizontal: 2 }, style]}>
      <Step dir={-1} disabled={atStart} unit={unit} box={stepBox} onPress={() => by(-step)} />
      <Pressable
        onPress={openCalendar}
        disabled={!openCalendar}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Open calendar`}
        accessibilityState={{ busy: loading }}
        hitSlop={{ top: 8, bottom: 8 }}
        style={({ pressed }) => ({ height: 36, minWidth: bare ? 104 : narrow ? 0 : 88, borderRadius: 18, paddingHorizontal: narrow ? 6 : 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.line : "transparent" })}
      >
        {loading ? (
          <ActivityIndicator size="small" color={c.teal} />
        ) : (
          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, fontVariant: ["tabular-nums"] }}>
            {label}
          </Txt>
        )}
      </Pressable>
      <Step dir={1} disabled={atEnd} unit={unit} box={stepBox} onPress={() => by(step)} />
      {ownCalendar && (
        <CalendarSheet
          open={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          selected={date}
          today={today}
          firstDay={firstDay}
          context={calendar || undefined}
          onSelect={(day) => {
            setCalendarOpen(false);
            if (day !== date) onChange(stepDay(day, 0, today, firstDay));
          }}
        />
      )}
    </View>
  );
}
