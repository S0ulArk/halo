// View-model → kit-prop mappers for Home, ported from the web's src/app/(app)/_lib/view.tsx (the parts Home uses).
import * as React from "react";
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
import type { EnergyBankVM, HomeVM, KeyStat, SleepPlanVM as PlanVM } from "@/queries";
import type { EnergySeries, KeyStatRowProps, SleepPlanVM } from "@/ui";

const FORMAT_BY_UNIT: Record<string, FormatKey> = { ms: "int", bpm: "int", rpm: "decimal1", "%": "int", kcal: "grouped", "°C": "signed1", min: "duration" };

/** The web's STAT_ICON, as lucide-react-native components (the caller sizes and colours them). */
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

/** A KeyStatRow icon: 20 px, muted, 1.75 stroke (the kit's icon slot). */
export function statIcon(key: string, color: string): React.ReactNode {
  const Icon = STAT_ICON[key];
  return Icon ? <Icon size={20} color={color} strokeWidth={1.75} /> : undefined;
}

/**
 * KeyStat → KeyStatRow props. Minutes render as h:mm with no unit; unitless counts are grouped. `open` receives the
 * stat's detail route (without `?d=`; the caller adds the day).
 */
export function statProps(s: KeyStat, iconColor: string, open?: (href: string) => void): Omit<KeyStatRowProps, "variant"> {
  const href = s.href;
  return {
    label: s.label,
    icon: statIcon(s.key, iconColor),
    metric: s.metric,
    unit: s.unit === "min" ? undefined : s.unit,
    format: s.format ?? (s.unit ? (FORMAT_BY_UNIT[s.unit] ?? "decimal1") : "grouped"),
    average: s.average,
    sd: s.sd,
    direction: s.direction,
    status: s.status,
    chip: s.chip,
    caption: s.caption,
    onPress: href && open ? () => open(href) : undefined,
  };
}

/** Drains closer than this to a bigger one are left unlabelled on the chart, so labels never overlap. */
const DRAIN_GAP_MS = 90 * 60_000;

export function energySeries(e: EnergyBankVM): EnergySeries {
  const drains: NonNullable<EnergySeries["drains"]> = [];
  for (const d of [...e.drains].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)))
    if (drains.every((k) => Math.abs(k.t - d.start) >= DRAIN_GAP_MS)) drains.push({ t: d.start, amount: Math.abs(d.amount), label: d.label });
  return { points: e.curve.map((p) => ({ t: p.t, value: p.v })), drains, naps: e.naps };
}

/** The query's sleep plan in the kit's shape: the kit keys "Get by" as `getby`, the query as `get_by`. */
export function tonightPlan(plan: PlanVM): SleepPlanVM {
  return {
    wakeAt: plan.wakeAt,
    needMin: plan.needMin,
    plans: plan.plans.map((p) => ({ key: p.key === "get_by" ? "getby" : p.key, label: p.label, bedtimeAt: p.bedtimeAt, share: p.share })),
  };
}

/** True when the day has anything to show; a first import with nothing stored yet shows the sync progress instead. */
export function hasData(vm: HomeVM) {
  return (
    vm.dials.sleep.value !== null ||
    vm.dials.recovery.value !== null ||
    vm.dials.strain.value !== null ||
    vm.strip.some((s) => s.recovery !== null) ||
    vm.keyStats.some((s) => s.metric.value !== null) ||
    vm.activities.items.length > 0 ||
    vm.phone !== null
  );
}
