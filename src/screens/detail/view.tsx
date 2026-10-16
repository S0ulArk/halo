// View-model → kit-prop mappers for the detail screens (Recovery, Strain, Sleep, Activity), ported from the web's
// src/app/(app)/_lib/view.tsx. Icons need the theme's colour in RN, so they are built per render (`statIcon`). A key
// stat also renders as an inset grouped list row (`StatRow`): its value, its status word and how today compares with
// the 30-day average in the sentence under its name, and a chevron to the section or screen it opens.
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
import { deltaTone } from "@/lib/bands";
import { formatValue, NBSP, type FormatKey } from "@/lib/format";
import { dayHref } from "@/lib/day";
import { reasonCopy } from "@/lib/reasons";
import type { HrChart, KeyStat, Metric, Trend } from "@/queries";
import { RANGE_DAYS, Txt, type HrSeries, type KeyStatRowProps, type TrendPoint, type TrendRange } from "@/ui";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { tagLabel } from "@/ui/components/primitives";
import { TABULAR } from "@/ui/fonts";
import { ListRow } from "./ios";

/** An activity's own screen (the web's `activityHref`). */
export const activityHref = (id: string) => `/activity/${encodeURIComponent(id)}`;

/** Maps a metric's value, keeping its reason and tags. */
export const mapMetric = <A, B>(m: Metric<A>, f: (a: A) => B): Metric<B> => ({ ...m, value: m.value === null ? null : f(m.value) });

const FORMAT_BY_UNIT: Record<string, FormatKey> = { ms: "int", bpm: "int", rpm: "decimal1", "%": "int", kcal: "grouped", "°C": "signed1", "°F": "signed1", min: "duration" };

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

/** Sleep's status words and their colours: optimal green, sufficient grey, poor orange. */
const STATUS_WORD = { optimal: "Optimal", sufficient: "Sufficient", poor: "Poor" } as const;
export const statusInk = (c: CalmPalette, s: keyof typeof STATUS_WORD) => (s === "optimal" ? c.tintInk.mint : s === "poor" ? c.system.orange : c.sub);

/** |n| in a stat's format, without the sign a signed format adds. */
const absText = (format: FormatKey, n: number) => formatValue(format, Math.abs(n)).replace(/^[+−-]/, "");

/**
 * A key stat as an inset grouped list row: its name, the value (grey as iOS sets a value, or a bold number with its
 * unit), and under the name its status word (Sleep's rows) and today against the 30-day average in words, green when
 * better and orange when worse ("4% above 30-day avg 78%"), or why it is missing; its tags after them. With `link` a
 * row whose stat has an `href` opens it (a section of this page, or a screen for the day shown) behind a chevron.
 */
export function StatRow({
  k,
  link,
  compare = true,
  bold = false,
  icon,
  iconColor,
}: {
  k: KeyStat;
  link?: { d: string; today: string; push: (href: string) => void; scrollTo?: (id: string) => boolean };
  /** False: no comparison with the average (Sleep's summary rows show their status instead). */
  compare?: boolean;
  bold?: boolean;
  icon?: LucideIcon;
  iconColor?: string;
}) {
  const c = useCalm();
  const p = statProps(k, { iconColor: c.sub, icons: false, link });
  const v = k.metric.value;
  const valueText = formatValue(p.format, v);
  const parts: { text: string; color: string }[] = [];
  if (v === null) parts.push({ text: reasonCopy(k.metric.reason, k.metric.nightsLeft).short, color: c.sub });
  else {
    if (k.status) parts.push({ text: STATUS_WORD[k.status], color: statusInk(c, k.status) });
    if (compare && k.average !== null && k.direction !== "none") {
      const t = deltaTone(k.direction, v, k.average, k.sd);
      const diff = v - k.average;
      const unitText = p.unit ? (p.unit === "%" ? "%" : `${NBSP}${p.unit}`) : "";
      const avgText = `${formatValue(p.format, k.average)}${unitText}`;
      const same = absText(p.format, diff) === absText(p.format, 0);
      const text = same || t.dir === "flat" ? `In line with 30-day avg ${avgText}` : `${absText(p.format, diff)}${unitText} ${diff > 0 ? "above" : "below"} 30-day avg ${avgText}`;
      parts.push({ text, color: t.tone === "good" ? c.tintInk.mint : t.tone === "bad" ? c.system.orange : c.sub });
    }
    const tags = [...(k.metric.provisional ? ["provisional" as const] : []), ...(k.metric.tags ?? [])];
    if (tags.length) parts.push({ text: tags.map(tagLabel).join(", "), color: c.sub });
  }
  const detail = parts.length ? (
    <Txt size={13} lineHeight={18} style={TABULAR}>
      {parts.map((x, i) => (
        <Txt key={i} size={13} lineHeight={18} weight={x.color === c.sub ? 400 : 500} style={{ color: x.color }}>
          {`${i > 0 ? " · " : ""}${x.text}`}
        </Txt>
      ))}
    </Txt>
  ) : undefined;
  return (
    <ListRow
      icon={icon}
      iconColor={iconColor}
      label={k.label}
      detail={detail}
      value={valueText}
      unit={p.unit}
      bold={bold}
      valueColor={v === null ? c.faint : undefined}
      onPress={p.onPress}
      accessibilityLabel={[k.label, v === null ? null : `${valueText}${p.unit ? ` ${p.unit}` : ""}`, ...parts.map((x) => x.text)].filter(Boolean).join(", ")}
    />
  );
}
