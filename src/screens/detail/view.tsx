// View-model → kit-prop mappers for the detail screens (Recovery, Strain, Sleep, Activity), ported from the web's
// src/app/(app)/_lib/view.tsx. Icons need the theme's colour in RN, so they are built per render (`statIcon`).
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
import { dayHref } from "@/lib/day";
import type { HrChart, KeyStat, Metric, Trend } from "@/queries";
import { Card, RANGE_DAYS, Txt, type HrSeries, type KeyStatRowProps, type TrendPoint, type TrendRange } from "@/ui";
import { useCalm } from "@/ui/calm";

/** An activity's own screen (the web's `activityHref`). */
export const activityHref = (id: string) => `/activity/${encodeURIComponent(id)}`;

/** Maps a metric's value, keeping its reason and tags. */
export const mapMetric = <A, B>(m: Metric<A>, f: (a: A) => B): Metric<B> => ({ ...m, value: m.value === null ? null : f(m.value) });

const FORMAT_BY_UNIT: Record<string, FormatKey> = { ms: "int", bpm: "int", rpm: "decimal1", "%": "int", kcal: "grouped", "°C": "signed1", min: "duration" };

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
  // Sleep summary rows carry an icon each, as the reference app's do [latest-sleep-1] (spec §11 F20).
  hours: Hourglass,
  consistency: CalendarCheck,
  efficiency: ChartNoAxesColumn,
  restorative: BatteryCharging,
  // Extra metrics and the body measurements.
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

/** A row or tile icon: 20 px in the muted colour, 1.75 stroke on rows and 1.5 on tiles (the web's `[&_svg]` rules). */
export function statIcon(key: string, color: string, strokeWidth = 1.75): React.ReactNode {
  const I = STAT_ICON[key];
  return I ? <I size={20} color={color} strokeWidth={strokeWidth} /> : undefined;
}

/**
 * KeyStat → KeyStatRow props. Minutes render as h:mm with no unit; unitless counts are grouped. `link` makes the stat
 * open its detail route with the day carried along (the web's `href` + `?d=`).
 */
export function statProps(
  s: KeyStat,
  opts: { iconColor: string; icons?: boolean; tile?: boolean; link?: { d: string; today: string; push: (href: string) => void; scrollTo?: (id: string) => boolean } },
): Omit<KeyStatRowProps, "variant"> {
  const { link } = opts;
  // `#zones`: a section of this same page, scrolled to; anything else a screen, opened for the day shown.
  const go = (href: string) => (href.startsWith("#") ? link?.scrollTo?.(href.slice(1)) : link?.push(dayHref(href, link.d, link.today)));
  const linked = !!s.href && !!link && (!s.href.startsWith("#") || !!link.scrollTo);
  return {
    label: s.label,
    icon: opts.icons === false ? undefined : statIcon(s.key, opts.iconColor, opts.tile ? 1.5 : 1.75),
    metric: s.metric,
    unit: s.unit === "min" ? undefined : s.unit,
    format: s.format ?? (s.unit ? (FORMAT_BY_UNIT[s.unit] ?? "decimal1") : "grouped"),
    average: s.average,
    sd: s.sd,
    direction: s.direction,
    status: s.status,
    chip: s.chip,
    caption: s.caption,
    onPress: linked ? () => void go(s.href!) : undefined,
  };
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Trend → TrendChart data, plus each range's average against the range before it. */
export function trendProps(t: Trend) {
  const pts: TrendPoint[] = t.points.map((p) => ({ date: p.day, value: p.value, provisional: p.provisional }));
  const deltas: Partial<Record<TrendRange, number | null>> = {};
  for (const r of ["w", "m"] as const) {
    const n = RANGE_DAYS[r];
    const now = mean(pts.slice(-n).map((p) => p.value));
    const prior = mean(pts.slice(-2 * n, -n).map((p) => p.value));
    deltas[r] = now === null || prior === null ? null : Math.round((now - prior) * 10) / 10;
  }
  return { data: { value: pts, reason: null, provisional: false } satisfies Metric<TrendPoint[]>, deltas, baseline: t.baseline, target: t.target };
}

/** HrChart → IntradayHrChart series. Naps draw as sleep spans; the open top zone ends at max HR. */
export const hrSeries = (m: Metric<HrChart>, maxHr: number): Metric<HrSeries> =>
  mapMetric(m, (h) => ({
    points: h.points.map((p) => ({ t: p.t, bpm: p.v })),
    zones: h.zones.map((z) => ({ zone: z.zone, label: z.label, min: z.min, max: z.max ?? maxHr })),
    spans: h.spans.map((s) => ({ kind: s.kind === "workout" ? ("workout" as const) : ("sleep" as const), label: s.label, start: s.start, end: s.end })),
    now: h.now ?? undefined,
  }));

/** Rows grouped in one list: a 1 px hairline in the Calm line colour between them. */
export function Divided({ children }: { children: React.ReactNode }) {
  const c = useCalm();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={{ height: 1, backgroundColor: c.line }} />}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * The summary card under a hero: one white card holding its rows as a grouped list, then the legend as a plain
 * sentence under them (no grey strip).
 */
export function SummaryCard({ children, legend }: { children: React.ReactNode; legend?: React.ReactNode }) {
  return (
    <Card padding={0} style={{ borderWidth: 0 }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: legend ? 16 : 6 }}>
        <Divided>{children}</Divided>
        {legend && <View style={{ marginTop: 6 }}>{legend}</View>}
      </View>
    </Card>
  );
}

/** A legend or footnote line: 13/18 in the secondary grey. */
export function LegendText({ children }: { children: React.ReactNode }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
      {children}
    </Txt>
  );
}

/** A small card-title aside ("vs. prior 30 days"). */
export function Aside({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
      {children}
    </Txt>
  );
}
