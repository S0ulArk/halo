// View-model → kit-prop mappers for the Health screens, ported from Pulse's src/app/(app)/_lib/view.tsx.
import * as React from "react";
import { View } from "react-native";
import {
  Activity,
  Armchair,
  BatteryCharging,
  Building2,
  CalendarCheck,
  ChartNoAxesColumn,
  Droplet,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  GlassWater,
  Heart,
  HeartPulse,
  Hourglass,
  Moon,
  Mountain,
  Percent,
  Route,
  Syringe,
  Thermometer,
  ThermometerSun,
  Timer,
  Utensils,
  Waves,
  Weight,
  Wheat,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import type { FormatKey } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import type { KeyStat } from "@/queries";
import { useTheme, type KeyStatRowProps } from "@/ui";
import { useCalm } from "@/ui/calm";

/** Maps a metric's value, keeping its reason and tags. */
export const mapMetric = <A, B>(m: Metric<A>, f: (a: A) => B): Metric<B> => ({ ...m, value: m.value === null ? null : f(m.value) });

export const STAT_ICON: Record<string, LucideIcon> = {
  hrv: Activity,
  rhr: Heart,
  avgHr: Heart,
  maxHr: HeartPulse,
  resp: Wind,
  sleep: Moon,
  calories: Zap,
  steps: Footprints,
  spo2: Droplet,
  skin: Thermometer,
  zones13: HeartPulse,
  zones45: HeartPulse,
  strength: Dumbbell,
  pace: Gauge,
  hours: Hourglass,
  consistency: CalendarCheck,
  efficiency: ChartNoAxesColumn,
  restorative: BatteryCharging,
  distance: Route,
  floors: Building2,
  elevation: Mountain,
  active_minutes: Timer,
  light_minutes: Timer,
  azm: HeartPulse,
  active_calories: Flame,
  sedentary_minutes: Armchair,
  avg_hr: Heart,
  water: GlassWater,
  calories_in: Utensils,
  protein: Utensils,
  carbs: Wheat,
  fat: Droplets,
  glucose: Syringe,
  core_temp: ThermometerSun,
  swim_strokes: Waves,
  weight: Weight,
  body_fat: Percent,
};

/** A KeyStatRow icon: the lucide glyph at 20 px in the muted colour. */
export function StatIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { c } = useTheme();
  return <Icon size={20} color={c.mutedForeground} strokeWidth={1.75} />;
}

export const statIcon = (key: string) => {
  const I = STAT_ICON[key];
  return I ? <StatIcon icon={I} /> : undefined;
};

const FORMAT_BY_UNIT: Record<string, FormatKey> = { ms: "int", bpm: "int", rpm: "decimal1", "%": "int", kcal: "grouped", "°C": "signed1", min: "duration" };

/** KeyStat → KeyStatRow props. Minutes render as h:mm with no unit; unitless counts are grouped. */
export function statProps(s: KeyStat, icons = true, onPress?: () => void): Omit<KeyStatRowProps, "variant"> {
  return {
    label: s.label,
    icon: icons ? statIcon(s.key) : undefined,
    metric: s.metric,
    unit: s.unit === "min" ? undefined : s.unit,
    format: s.format ?? (s.unit ? (FORMAT_BY_UNIT[s.unit] ?? "decimal1") : "grouped"),
    average: s.average,
    sd: s.sd,
    direction: s.direction,
    status: s.status,
    chip: s.chip,
    caption: s.caption,
    onPress,
  };
}

/** Rows grouped inside a card's list, a 1 px line in the Calm line colour between them. */
export function Rows({ children }: { children: React.ReactNode }) {
  const calm = useCalm();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={{ height: 1, backgroundColor: calm.line }} />}
          {it}
        </React.Fragment>
      ))}
    </>
  );
}
