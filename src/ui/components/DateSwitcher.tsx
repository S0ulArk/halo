// The day (or week) switcher under a page's large title: a capsule in the card colour with the action blue's chevrons
// either side of the day, iOS's; a tap on the day opens the month calendar. Every press settles and dims on the UI
// thread (the kit's press) and a step ticks under the finger.
import * as React from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { dayLabel, rangeLabel } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { haptic } from "@/ui/motion/haptics";
import { CalendarSheet, type CalendarContext } from "./CalendarSheet";
import { usePress, usePressStyle } from "./press";
import { Txt } from "./Text";

const PressableView = Animated.createAnimatedComponent(Pressable);

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

/** A chevron in the capsule: the action blue, the tertiary grey where it stops; it settles under the finger and ticks. */
function Step({ dir, disabled, unit, box, onPress }: { dir: -1 | 1; disabled: boolean; unit: string; box: number; onPress: () => void }) {
  const c = useCalm();
  const press = usePress(0.86);
  const pressed = usePressStyle(press, { dim: 0.5 });
  const color = disabled ? c.tertiary : c.teal;
  return (
    <PressableView
      onPress={() => {
        haptic.select();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${dir < 0 ? "Previous" : "Next"} ${unit}`}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={[{ width: box, height: box, borderRadius: box / 2, alignItems: "center", justifyContent: "center" }, pressed]}
    >
      {dir < 0 ? <ChevronLeft size={20} color={color} strokeWidth={2.4} /> : <ChevronRight size={20} color={color} strokeWidth={2.4} />}
    </PressableView>
  );
}

/**
 * The date capsule: the card colour (40 px, round ends) with blue chevrons either side of the day in Inter 600 ink; a
 * tap on the day opens the calendar. In a detail page it sits under the large title.
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
  const labelPress = usePress(0.95);
  const labelStyle = usePressStyle(labelPress, { dim: 0.55 });

  return (
    <View style={[{ flexDirection: "row", alignItems: "center", height: 40, borderRadius: 20, backgroundColor: c.card, paddingHorizontal: 2 }, style]}>
      <Step dir={-1} disabled={atStart} unit={unit} box={stepBox} onPress={() => by(-step)} />
      <PressableView
        onPress={openCalendar}
        onPressIn={labelPress.onPressIn}
        onPressOut={labelPress.onPressOut}
        disabled={!openCalendar}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Open calendar`}
        accessibilityState={{ busy: loading }}
        hitSlop={{ top: 8, bottom: 8 }}
        style={[{ height: 36, minWidth: bare ? 104 : narrow ? 0 : 88, borderRadius: 18, paddingHorizontal: narrow ? 6 : 10, alignItems: "center", justifyContent: "center" }, labelStyle]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={c.teal} />
        ) : (
          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, fontVariant: ["tabular-nums"] }}>
            {label}
          </Txt>
        )}
      </PressableView>
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
