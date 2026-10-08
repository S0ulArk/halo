import * as React from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import { Canvas, Circle, DashPathEffect, Glyphs, Group, Path, RoundedRect, Text as SkText } from "@shopify/react-native-skia";
import { DATA_COLORS, deltaTone, recoveryBand, recoveryColor, STRESS_COLOR, stressLevel, type GoodDirection } from "@/lib/bands";
import { areaPath, monotonePath, niceTicks, runs, scaleLinear, type Band, type XY } from "@/lib/charts";
import { DAY, dayLabel, formatDay, formatValue, isSymbolUnit, NBSP, spoken, type FormatKey } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { accentFamily } from "@/ui/accents";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { useAfterTransition } from "./AfterTransition";
import { FAMILY_TINT } from "./calmKit";
import {
  AXIS,
  BandShader,
  bandPaint,
  barPath,
  barRadius,
  baselineIn,
  ChartFigure,
  FadeShader,
  Grid,
  GuideLine,
  labelGutter,
  LINE,
  measure,
  Pill,
  PointMark,
  ScrubBand,
  ScrubBars,
  ScrubCursor,
  SText,
  toPaths,
  trackedGlyphs,
  useBandScrub,
  useChartInk,
  useScrubArmed,
  useChartFonts,
  ValuePill,
  wholeTick,
  sp,
  type ChartFonts,
  type ScrubBarLayer,
} from "./ChartFrame";
import { EmptyState } from "./EmptyState";
import { MetricState } from "./MetricState";
import { StatusChip, ValueUnit } from "./primitives";
import { Skeleton, SkeletonText } from "./Skeleton";
import { Txt } from "./Text";
import { ToggleGroup } from "./ToggleGroup";

export type TrendRange = "w" | "m" | "6m" | "1y";
export const RANGE_DAYS: Record<TrendRange, number> = { w: 7, m: 30, "6m": 182, "1y": 365 };

export type TrendPoint = {
  date: string;
  value: number | null;
  provisional?: boolean;
  /** With `stack`: the parts of `value` by series key; null when the day has a total but no breakdown. */
  parts?: Record<string, number> | null;
};
/** One stacked part, bottom first. `color` is a resolved colour string. */
export type TrendSeries = { key: string; label: string; color: string };

export type TrendChartProps = {
  /** Metric name for the chart summary ("Recovery"). */
  label: string;
  /** Up to 365 days ending on `today`, oldest first; the chart slices by range. */
  data: Metric<TrendPoint[]> | null | undefined;
  unit?: string;
  format: FormatKey;
  colorBy: "band" | "strain" | "sleep" | "single" | "stress";
  /** Gives the delta chip a good/bad tone; omit for neutral metrics. */
  direction?: GoodDirection;
  /** Change of the range average against the prior range, per range. */
  deltas?: Partial<Record<TrendRange, number | null>>;
  /** Shades mean ± 1 σ ("Shaded: your normal range"). */
  baseline?: { mean: number; sd: number } | null;
  /** Strain Target band ("Shaded: your Strain Target"). */
  target?: [number, number] | null;
  /** Pins one range and hides the toggle (Stress 30-day trend). */
  fixedRange?: TrendRange;
  /** Range at first render (default `m`; Fitness VO2 max uses `6m`). */
  defaultRange?: TrendRange;
  /** Controlled range (the web keeps it in `?r=`); with `onRangeChange` the parent owns it. */
  range?: TrendRange;
  onRangeChange?: (r: TrendRange) => void;
  /** The toggle's ranges (default W, M, 6M; Trends adds 1Y). `data` must hold enough days for the longest. */
  ranges?: readonly TrendRange[];
  /** A labelled horizontal line ("Your age" on Pulse Age history). */
  reference?: { y: number; label: string };
  /** Draws each day's `parts` as stacked bars (W and M; 6M and 1Y draw the total as a line) with a legend of the shown day's split. */
  stack?: readonly TrendSeries[];
  /** `day`: the header shows the selected (last) day's value instead of the range average. */
  headline?: "average" | "day";
  /** Draws a line of the trailing `smooth`-day average over the bars or dots. */
  smooth?: number;
  /** A line with dots at every range, the week's dots ringed and labelled; else bars until 6M. */
  line?: boolean;
  /** Today (YYYY-MM-DD), for "Today" / "Yesterday" in the header; defaults to the last point. */
  today?: string;
  /** A tap on the plot (not a scrub) opens the chart explorer with the range on show. */
  onPress?: (range: TrendRange) => void;
};

const RANGE_ARIA: Record<TrendRange, string> = { w: "1 week", m: "1 month", "6m": "6 months", "1y": "1 year" };
const RANGE_PRIOR: Record<TrendRange, string> = { w: "vs. prior week", m: "vs. prior month", "6m": "vs. prior 6 months", "1y": "vs. prior year" };
const RANGE_WORD: Record<TrendRange, string> = { w: "week", m: "month", "6m": "6 months", "1y": "year" };
const RANGE_LABEL: Record<TrendRange, string> = { w: "W", m: "M", "6m": "6M", "1y": "1Y" };
const DEFAULT_RANGES: readonly TrendRange[] = ["w", "m", "6m"];
const H = 200;
/** The header's label line (the Calm caption: 11/15 caps, 1.1 tracking) and value line (28/32), and the stack legend's row under them. */
const LABEL_LINE = 15;
/** The caption's tracking, px: the RN label and the Skia readout share it. */
const LABEL_TRACKING = 1.1;
/** The unit beside the 28 px headline: Figtree 500 at 12 px (0.42×), grey. */
const UNIT_SIZE = 12;
const VALUE_LINE = 32;
const LEGEND_TOP = LABEL_LINE + VALUE_LINE + 6;

/** Mean of the values in the `days` days ending at index `i`; null when there are none. */
function trailingMean(points: TrendPoint[], i: number, days: number) {
  const xs = points.slice(Math.max(0, i - days + 1), i + 1).flatMap((x) => (x.value === null ? [] : [x.value]));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

type Row = TrendPoint & { fill?: string; fillOpacity: number; text: string; unsplit: number | null; smooth: number | null };

/** What the bars and the scrub layers need of the plot's layout. */
type Layout = { rows: Row[]; x0: number; marginRight: number; domain: [number, number]; plotTop: number; plotBottom: number };

/** The plot's box and scales at a width, shared by the drawing and the scrub layers. */
function frameOf(m: Layout, width: number) {
  const x1 = width - m.marginRight;
  const bandW = (x1 - m.x0) / m.rows.length;
  return { x0: m.x0, x1, bandW, y: scaleLinear(m.domain, [m.plotBottom, m.plotTop]), cxOf: (i: number) => m.x0 + (i + 0.5) * bandW };
}

/** One day's bar: its parts bottom first, today's "so far" outline, a total with no breakdown, and whether a scrub lights it. */
type BarShape = { parts: { d: string; color: string }[]; outline: string | null; outlineColor: string; unsplit: string | null; lit: boolean };

/**
 * The Calm bars at a width: rounded tops (full capsules while thin), each part in its series' ink. Built once per data
 * and width, for the canvas and for the scrubbed bar's full-ink layer.
 */
function barsOf(m: Layout, width: number, stack?: readonly TrendSeries[]): BarShape[] {
  const { bandW, y, cxOf } = frameOf(m, width);
  const barW = Math.min(24, bandW * 0.6);
  const top = barRadius(barW);
  const foot = barW <= 12 ? top : 0;
  return m.rows.map((r, i) => {
    const x = cxOf(i) - barW / 2;
    const shape: BarShape = { parts: [], outline: null, outlineColor: r.fill ?? "transparent", unsplit: null, lit: !r.provisional };
    if (stack) {
      if (r.parts) {
        const vs = stack.map((s) => ({ s, v: r.parts?.[s.key] ?? 0 }));
        const first = vs.findIndex((q) => q.v > 0);
        let last = -1;
        vs.forEach((q, k) => {
          if (q.v > 0) last = k;
        });
        let acc = 0;
        vs.forEach(({ s, v }, k) => {
          const yb = y(acc);
          acc += v;
          const yt = y(acc);
          shape.parts.push({ d: barPath(x, yt, barW, Math.max(0, yb - yt), k === last ? top : 0, k === first ? foot : 0), color: s.color });
        });
        if (last >= 0) shape.outlineColor = vs[last].s.color;
        if (r.provisional) shape.outline = barPath(x, y(acc), barW, Math.max(0, m.plotBottom - y(acc)), top, foot);
      }
      if (r.unsplit !== null) {
        shape.unsplit = barPath(x, y(r.unsplit), barW, Math.max(0, m.plotBottom - y(r.unsplit)), top, foot);
        shape.lit = false;
      }
    } else if (r.value !== null && r.fill) {
      const yt = y(r.value);
      const d = barPath(x, yt, barW, Math.max(0, m.plotBottom - yt), top, foot);
      if (d) shape.parts.push({ d, color: r.fill });
      if (r.provisional) shape.outline = d;
    }
    return shape;
  });
}

/** The scrubbed day's bar at full ink over the dimmed bars (built at the first scrub, then once per data and width). */
function TrendScrubBars({ active, layout, width, stack }: { active: SharedValue<number>; layout: Layout; width: number; stack?: readonly TrendSeries[] }) {
  const armed = useScrubArmed(active);
  const layers = React.useMemo<ScrubBarLayer[] | null>(() => {
    if (!armed) return null;
    const shapes = barsOf(layout, width, stack);
    return Array.from({ length: stack ? stack.length : 1 }, (_, k) => ({
      paths: toPaths(shapes.map((b) => (b.lit ? (b.parts[k]?.d ?? null) : null))),
      colors: shapes.map((b) => b.parts[k]?.color ?? "transparent"),
    }));
  }, [armed, layout, width, stack]);
  if (!layers) return null;
  return <ScrubBars active={active} width={width} height={H} layers={layers} />;
}

function Trend({ points, p }: { points: TrendPoint[]; p: TrendChartProps }) {
  const { c } = useTheme();
  const calm = useCalm();
  const k = useChartInk();
  const fonts = useChartFonts();
  const opened = useAfterTransition();
  // The Calm series ink: bands and stress levels keep their meaning colours; a single-hue metric takes its family's
  // ink (Strain peach, Sleep lavender, HRV rose, Steps sky, Weight sand…).
  const family = p.colorBy === "single" ? accentFamily(p.label) : null;
  const singleInk = calm.tintInk[family ? FAMILY_TINT[family] : "sky"];
  const colorFor = (v: number) => {
    if (p.colorBy === "band") return c[DATA_COLORS[recoveryColor(v)].fill];
    if (p.colorBy === "stress") return c[DATA_COLORS[STRESS_COLOR[stressLevel(v)]].fill];
    if (p.colorBy === "strain") return calm.tintInk.peach;
    if (p.colorBy === "sleep") return calm.tintInk.lavender;
    return singleInk;
  };
  const bands: Band[] | null =
    p.colorBy === "band" ? [0, 34, 67].map((from) => ({ from, color: c[DATA_COLORS[recoveryColor(from)].fill] })) : p.colorBy === "stress" ? [0, 1, 2].map((from) => ({ from, color: c[DATA_COLORS[STRESS_COLOR[stressLevel(from)]].fill] })) : null;
  const BAND_TICK = { green: c.recoveryGreen, yellow: c.recoveryYellow, red: c.recoveryRedText } as const;

  // Screens map their trend to points on every render: key the model on the points' content, not their identity, so a
  // parent re-render (a scroll-driven header, another card's state) never rebuilds the chart.
  const sig = points.map((x) => `${x.date}:${x.value ?? ""}${x.provisional ? "p" : ""}${x.parts ? JSON.stringify(x.parts) : x.parts === null ? "n" : ""}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = React.useMemo(() => points, [sig]);
  const propsSig = JSON.stringify([p.label, p.unit, p.format, p.colorBy, p.direction, p.deltas, p.baseline, p.target, p.reference, p.stack, p.headline, p.smooth, p.line]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const props = React.useMemo(() => p, [propsSig]);
  const today = p.today ?? points[points.length - 1]?.date ?? "";
  const fallback = p.defaultRange ?? "m";
  const ranges = p.ranges ?? DEFAULT_RANGES;
  const [own, setOwn] = React.useState<TrendRange>(p.fixedRange ?? p.range ?? fallback);
  const range = p.fixedRange ?? p.range ?? own;

  // Everything drawn from the points: rebuilt when the data, range, props or theme change, never on a scrub move.
  const model = React.useMemo(() => {
    const n = RANGE_DAYS[range];
    const rows: Row[] = stable.slice(-n).map((pt, i) => ({
      ...pt,
      fill: pt.value === null ? undefined : colorFor(pt.value),
      fillOpacity: pt.provisional ? 0.45 : 1,
      text: pt.value === null ? "" : formatValue(props.format, pt.value),
      unsplit: props.stack && pt.value !== null && !pt.parts ? pt.value : null,
      smooth: props.smooth ? trailingMean(stable, stable.length - Math.min(n, stable.length) + i, props.smooth) : null,
    }));
    const values = rows.map((r) => r.value).filter((v): v is number => v !== null);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const delta = props.deltas?.[range] ?? null;
    const tone = delta === null || !props.direction || delta === 0 ? null : deltaTone(props.direction, delta, 0).tone;
    const line = !!props.line || range === "6m" || range === "1y";
    const byDay = props.headline === "day";

    // --- Layout (the web's margins and axis widths) ---
    const widest = formatValue(props.format, Math.max(0, ...rows.map((r) => r.value ?? 0))).length;
    const axisWidth = widest <= 3 ? 32 : 15 + 7 * widest;
    const showAvg = !line && range !== "w" && avg !== null;
    const gutter = labelGutter([props.reference?.label, showAvg && "Avg"]);
    // Room over the plot for the values drawn over bars and points (the week's, the latest).
    const marginTop = range === "w" || !line ? 18 : 14;
    const marginRight = props.line && range === "w" ? Math.max(gutter, 14) : gutter;
    const plotTop = marginTop;
    const plotBottom = H - AXIS.xAxisHeight;
    // Y domain: band metrics are fixed; a single-hue line fits its data; bars always start at zero.
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 0;
    const extend = [props.baseline ? props.baseline.mean + props.baseline.sd : null, props.baseline ? props.baseline.mean - props.baseline.sd : null, props.reference?.y ?? null, props.target?.[0] ?? null, props.target?.[1] ?? null].filter((v): v is number => v !== null);
    const smoothVals = rows.map((r) => r.smooth).filter((v): v is number => v !== null);
    let domain: [number, number];
    let yTicks: number[];
    if (props.colorBy === "band") {
      domain = [0, 100];
      yTicks = line ? [0, 50, 100] : [33, 67, 100];
    } else if (props.colorBy === "stress") {
      domain = [0, 3];
      yTicks = line ? [0, 1.5, 3] : [1, 2, 3];
    } else if (line && (props.colorBy === "single" || props.line)) {
      const t = niceTicks(Math.min(lo, ...extend, ...smoothVals), Math.max(hi, ...extend, ...smoothVals), 3);
      domain = [t[0], t[t.length - 1]];
      yTicks = t;
    } else {
      const t = niceTicks(0, Math.max(hi, ...extend, ...smoothVals, 1), 3);
      domain = [0, t[t.length - 1]];
      yTicks = t;
    }
    const fmtTick = props.format === "duration" ? (v: number) => formatValue(props.format, v) : wholeTick((v) => formatValue(props.format, v));

    const ticks =
      range === "w" ? rows.map((r) => r.date) : range === "m" ? rows.filter((_, i) => (rows.length - 1 - i) % 7 === 0).map((r) => r.date) : rows.filter((r, i) => i > 0 && r.date.slice(0, 7) !== rows[i - 1].date.slice(0, 7)).map((r) => r.date);
    const tickFormat = (d: string) => formatDay(d, range === "w" ? { weekday: "narrow" } : range === "m" ? DAY.monthDay : { month: "short" });

    const partAvg = (key: string) => {
      const xs = rows.map((r) => r.parts?.[key]).filter((v): v is number => v != null);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const summary = values.length
      ? `${props.label} over the last ${RANGE_WORD[range]}: average ${spoken(formatValue(props.format, avg), props.unit)}, range ${formatValue(props.format, Math.min(...values))} to ${formatValue(props.format, Math.max(...values))}${rows.length - values.length ? `, ${rows.length - values.length} ${rows.length - values.length === 1 ? "day" : "days"} missing` : ""}.${
          props.stack ? ` Average split: ${props.stack!.map((s) => `${s.label} ${formatValue(props.format, partAvg(s.key))}`).join(", ")}.` : ""
        }`
      : `No ${props.label} data in the last ${RANGE_WORD[range]}.`;
    return { n, rows, values, avg, delta, tone, line, byDay, axisWidth, showAvg, marginRight, plotTop, plotBottom, lo, hi, domain, yTicks, fmtTick, ticks, tickFormat, partAvg, summary };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stable, range, props, c]);
  const { rows, avg, delta, tone, line, byDay, axisWidth, showAvg, marginRight, plotTop, plotBottom, lo, hi, domain, yTicks, fmtTick, ticks, tickFormat, partAvg, summary, values } = model;
  const x0 = 4 + axisWidth;
  const layout = React.useMemo<Layout>(() => ({ rows, x0, marginRight, domain, plotTop, plotBottom }), [rows, x0, marginRight, domain, plotTop, plotBottom]);
  const scrub = useBandScrub(x0, marginRight, rows.length);
  const changeRange = (v: TrendRange) => {
    setOwn(v);
    p.onRangeChange?.(v);
    scrub.active.set(-1);
  };
  // The day the header and legend describe when no finger is on the plot: the selected (last) day, or the average.
  const shown = byDay || p.stack ? (rows[rows.length - 1] ?? null) : null;
  // The week's ticks bold the shown day (the scrubbed one while scrubbing).
  const boldDefault = range === "w" && shown ? rows.length - 1 : -1;

  const many = ranges.length > 3;
  const frame = (width: number) => frameOf(layout, width);

  // While a finger is on the plot, the header's left column hands over to a Skia readout of the scrubbed day. The
  // readout is a canvas of its own, mounted at the first scrub; until it has drawn, the RN header stays.
  const armed = useScrubArmed(scrub.active);
  const readoutReady = useSharedValue(false);
  const fade = useAnimatedStyle(() => ({ opacity: scrub.active.value >= 0 && readoutReady.value ? 0 : 1 }));
  const [headW, setHeadW] = React.useState(0);

  const header = (
    <View style={{ marginBottom: 16, gap: 12, ...(many ? { flexDirection: "column-reverse" } : { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }) }}>
      <View style={{ minWidth: 0, flexShrink: 1, flexGrow: 1 }} onLayout={(e) => setHeadW(Math.round(e.nativeEvent.layout.width))}>
        <Animated.View style={fade}>
          {/* The Calm caption over the number: small grey capitals, never mistaken for the value. */}
          <Txt size={11} lineHeight={LABEL_LINE} weight={700} uppercase color={calm.faint} style={{ letterSpacing: LABEL_TRACKING, fontVariant: ["tabular-nums"] }}>
            {byDay ? dayLabel(shown?.date ?? today, today) : "Average"}
          </Txt>
          <ValueUnit
            value={formatValue(p.format, byDay ? (shown?.value ?? null) : avg)}
            unit={p.unit}
            role="valueLg"
            color={calm.ink}
            unitStyle={{ fontSize: UNIT_SIZE, lineHeight: 16, fontFamily: font.sansFamily(500), color: calm.sub }}
          />
          {p.stack && <StackLegend series={p.stack} point={byDay ? shown : { date: "", value: avg, parts: Object.fromEntries(p.stack.map((x) => [x.key, partAvg(x.key) ?? 0])) }} format={p.format} />}
          {!byDay && delta !== null && (
            <StatusChip tone={tone === "good" ? "optimal" : tone === "bad" ? "warning" : "neutral"} delta={delta > 0 ? "up" : delta < 0 ? "down" : "flat"} style={{ marginTop: 4 }}>
              {formatValue(p.format, Math.abs(delta))}
              {p.unit === "%" ? "%" : p.unit ? `${NBSP}${p.unit}` : ""} {RANGE_PRIOR[range]}
            </StatusChip>
          )}
        </Animated.View>
        {armed && opened && fonts && headW > 0 && values.length > 0 && (
          <HeaderReadout active={scrub.active} rows={rows} today={today} format={p.format} unit={p.unit} stack={p.stack} width={headW} fonts={fonts} onReady={() => readoutReady.set(true)} />
        )}
      </View>
      {!p.fixedRange && (
        <ToggleGroup value={range} onChange={changeRange} items={ranges.map((r) => ({ value: r, label: RANGE_LABEL[r], accessibilityLabel: RANGE_ARIA[r] }))} font="numeric" fill={many} accessibilityLabel="Range" />
      )}
    </View>
  );

  const onPress = p.onPress;
  return (
    <View style={{ minWidth: 0 }}>
      {header}
      {values.length === 0 ? (
        <View style={{ height: H, alignItems: "center", justifyContent: "center" }}>
          <EmptyState body="No data in this range yet." />
        </View>
      ) : (
        <ChartFigure
          height={H}
          summary={summary}
          scrub={scrub}
          onPress={onPress ? () => onPress(range) : undefined}
          deps={[model, c]}
          drawIn={`${range}|${rows.length}|${rows[0]?.date ?? ""}`}
          reveal={line ? "wipe" : "rise"}
          underlay={({ width }) => {
            if (line) return null;
            const { bandW } = frame(width);
            return <ScrubBand active={scrub.active} x0={x0} bandW={bandW} top={plotTop} bottom={plotBottom} />;
          }}
          overlay={({ width, fonts: f }) => {
            const { y, cxOf } = frame(width);
            const xs = rows.map((_, i) => cxOf(i));
            return (
              <>
                {!line && <TrendScrubBars active={scrub.active} layout={layout} width={width} stack={props.stack} />}
                {range === "w" && (
                  <WeekTicks active={scrub.active} fallback={boldDefault} xs={xs} texts={rows.map((r) => tickFormat(r.date))} y={plotBottom + AXIS.tickMargin + 12 * 0.71 + 12 * 0.35 - 4} fonts={f} />
                )}
                {line && <ScrubCursor active={scrub.active} xs={xs} ys={rows.map((r) => (r.value === null ? NaN : y(r.value)))} colors={rows.map((r) => r.fill ?? k.ink)} top={plotTop} bottom={plotBottom} />}
              </>
            );
          }}
        >
          {({ width, fonts: f }) => {
            const { x1, y, cxOf } = frame(width);
            const pts: (XY | null)[] = rows.map((r, i) => (r.value === null ? null : { x: cxOf(i), y: y(r.value) }));
            const yTop = y(hi);
            const yBottom = y(lo);
            // The series' own ink (a band metric's at its average), for the soft fill and the shaded ranges.
            const ink = colorFor(avg ?? 0);
            const smoothPts: XY[] = rows.flatMap((r, i) => (r.smooth === null ? [] : [{ x: cxOf(i), y: y(r.smooth) }]));
            const axis = f.num(500, 12);
            const last = rows.length - 1;
            const bars = line ? [] : barsOf(layout, width, p.stack);
            // The latest day with a value, labelled with it (the week's bars and dots label every day already).
            let lastValued = -1;
            for (let i = last; i >= 0 && lastValued < 0; i--) if (rows[i].value !== null) lastValued = i;
            const unitSuffix = !p.unit ? "" : p.unit === "%" ? "%" : ` ${p.unit}`;
            const latestText = lastValued >= 0 ? `${rows[lastValued].text}${unitSuffix}` : "";
            const valueFont = f.num(700, 11);
            // The week's values fit over their bars only when the widest clears its column; else only the latest is labelled.
            const weekFits = range === "w" && !line && Math.max(0, ...rows.map((r) => (r.value === null ? 0 : measure(valueFont, r.text)))) + 4 <= frame(width).bandW;
            return (
              <Group>
                <Grid ys={yTicks.map(y)} x1={x0} x2={x1} />
                {/* Shaded ranges: soft pastel bands of the series' ink, and the guides */}
                {p.baseline && (
                  <RoundedRect x={x0} y={y(p.baseline.mean + p.baseline.sd)} width={x1 - x0} height={Math.max(0, y(p.baseline.mean - p.baseline.sd) - y(p.baseline.mean + p.baseline.sd))} r={6} color={alpha(ink, 0.09)} />
                )}
                {p.target && <RoundedRect x={x0} y={y(p.target[1])} width={x1 - x0} height={Math.max(0, y(p.target[0]) - y(p.target[1]))} r={6} color={alpha(ink, 0.12)} />}
                {p.reference && (
                  <Group>
                    <GuideLine x1={x0} x2={x1} y1={y(p.reference.y)} y2={y(p.reference.y)} />
                    <Pill x={x1 + 4} y={y(p.reference.y)} text={p.reference.label} />
                  </Group>
                )}
                {showAvg && avg !== null && (
                  <Group>
                    <GuideLine x1={x0} x2={x1} y1={y(avg)} y2={y(avg)} />
                    <Pill x={x1 + 4} y={y(avg)} text="Avg" />
                  </Group>
                )}
                {/* Axes (the week's day ticks are in the overlay: they bold the scrubbed day) */}
                {range !== "w" &&
                  ticks.map((d) => {
                    const i = rows.findIndex((r) => r.date === d);
                    if (i < 0) return null;
                    return <SText key={d} x={cxOf(i)} y={plotBottom + AXIS.tickMargin + 12 * 0.71 + 12 * 0.35 - 4} text={tickFormat(d)} font={axis} color={k.axis} anchor="middle" />;
                  })}
                {yTicks.map((v) => {
                  if (!line && v === 0) return null;
                  const bandTick = p.colorBy === "band" && !line;
                  return <SText key={v} x={x0 - AXIS.tickMargin} y={y(v) + 12 * 0.32} text={fmtTick(v)} font={f.num(bandTick ? 600 : 500, 12)} color={bandTick ? BAND_TICK[recoveryBand(v)] : k.axis} anchor="end" />;
                })}
                {/* Series */}
                {line ? (
                  <Group>
                    {/* A smooth line in the series' ink over a soft fill, round at its ends */}
                    {runs(pts).map((run, j) => {
                      const d = monotonePath(run);
                      return (
                        <Group key={j}>
                          <Path path={sp(areaPath(d, run[0], run[run.length - 1], plotBottom))}>
                            <FadeShader color={ink} from={bands ? 0.12 : 0.18} y1={yTop} y2={plotBottom} />
                          </Path>
                          <Path path={sp(d)} style="stroke" strokeWidth={LINE.width} strokeJoin="round" strokeCap="round" color={bands ? bandPaint(hi, lo, bands) : ink}>
                            {bands && <BandShader yTop={yTop} yBottom={yBottom} top={hi} bottom={lo} bands={bands} />}
                          </Path>
                        </Group>
                      );
                    })}
                    {rows.map((r, i) => {
                      const q = pts[i];
                      if (!q) return null;
                      const isLast = i === last;
                      const fill = alpha(r.fill ?? k.ink, r.fillOpacity);
                      if (p.line && range === "w") {
                        // The label goes on the outside of the line's bend: under a dip (both neighbours higher),
                        // over everything else, so the line never runs through it. It keeps clear of the day ticks.
                        const prev = pts[i - 1];
                        const next = pts[i + 1];
                        const dip = (!!prev || !!next) && (!prev || prev.y < q.y) && (!next || next.y < q.y);
                        const ly = dip && q.y + 21 <= plotBottom + 2 ? q.y + 21 : q.y - 12;
                        const text = `${r.text}${p.unit === "%" ? "%" : ""}`;
                        return (
                          <Group key={i}>
                            <PointMark cx={q.x} cy={q.y} fill={fill} r={isLast ? 4.5 : 3.5} ring={2} />
                            <SText x={q.x} y={ly} text={text} font={f.num(isLast ? 700 : 600, 12)} color={isLast ? k.ink : k.label} anchor="middle" halo={k.card} />
                          </Group>
                        );
                      }
                      if (isLast || i === lastValued) return <PointMark key={i} cx={q.x} cy={q.y} fill={fill} />;
                      // A day on its own (no neighbour to join) still shows; `line` metrics dot every day.
                      const alone = !pts[i - 1] && !pts[i + 1];
                      return p.line || alone ? <Circle key={i} cx={q.x} cy={q.y} r={p.line ? 2.25 : 2.5} color={fill} /> : null;
                    })}
                    {p.smooth && smoothPts.length > 1 && <Path path={sp(monotonePath(smoothPts))} style="stroke" strokeWidth={LINE.width} strokeJoin="round" strokeCap="round" color={k.orange} />}
                    {!(p.line && range === "w") && lastValued >= 0 && pts[lastValued] && (
                      <ValuePill x={pts[lastValued]!.x} y={pts[lastValued]!.y} text={latestText} font={valueFont} left={x0} right={x1} top={plotTop - 12} bottom={plotBottom} />
                    )}
                  </Group>
                ) : (
                  <Group>
                    {/* Past bars dimmed, the latest at full ink, today's "so far" outlined over a light fill */}
                    {rows.map((r, i) => {
                      const b = bars[i];
                      if (!b) return null;
                      return (
                        <Group key={r.date}>
                          {b.parts.length > 0 && (
                            <Group opacity={r.provisional ? 0.28 : i === last ? 1 : k.dim}>
                              {b.parts.map((part, j) => (
                                <Path key={j} path={sp(part.d)} color={part.color} />
                              ))}
                            </Group>
                          )}
                          {b.outline && <Path path={sp(b.outline)} style="stroke" strokeWidth={1.5} strokeJoin="round" color={alpha(b.outlineColor, 0.9)} />}
                          {b.unsplit && (
                            <Group>
                              <Path path={sp(b.unsplit)} color={k.wash} />
                              <Path path={sp(b.unsplit)} color={k.faint} style="stroke" strokeWidth={1}>
                                <DashPathEffect intervals={[3, 2]} />
                              </Path>
                            </Group>
                          )}
                        </Group>
                      );
                    })}
                    {/* The week's values over their bars once the bars have risen (when they fit), else the latest bar's. */}
                    {weekFits ? (
                      <Group>
                        {rows.map((r, i) =>
                          r.value === null ? null : (
                            <SText key={r.date} x={cxOf(i)} y={y(r.value) - 6} text={r.text} font={f.num(i === last ? 700 : 600, 11)} color={i === last ? k.ink : k.label} anchor="middle" opacity={r.fillOpacity} />
                          ),
                        )}
                      </Group>
                    ) : (
                      lastValued >= 0 &&
                      (() => {
                        const r = rows[lastValued];
                        const w = measure(valueFont, r.text);
                        const cx = Math.min(x1 - w / 2, Math.max(x0 + w / 2, cxOf(lastValued)));
                        return <SText x={cx} y={Math.max(plotTop - 4, y(r.value!) - 6)} text={r.text} font={valueFont} color={k.ink} anchor="middle" />;
                      })()
                    )}
                    {p.smooth && smoothPts.length > 1 && (
                      <Group>
                        <Path path={sp(monotonePath(smoothPts))} style="stroke" strokeWidth={LINE.width} strokeJoin="round" strokeCap="round" color={k.orange} />
                      </Group>
                    )}
                  </Group>
                )}
              </Group>
            );
          }}
        </ChartFigure>
      )}
      {(p.baseline || p.target || p.smooth) && values.length > 0 && (
        <Keys
          items={[
            ...(p.target ? [{ mark: "band" as const, color: colorFor(avg ?? 0), opacity: 0.12, label: "Your Strain Target" }] : []),
            ...(p.baseline ? [{ mark: "band" as const, color: colorFor(avg ?? 0), opacity: 0.09, label: "Your normal range" }] : []),
            ...(p.smooth ? [{ mark: "line" as const, color: k.orange, opacity: 1, label: `${p.smooth}-day average` }] : []),
          ]}
        />
      )}
    </View>
  );
}

/** What the shading and extra lines mean, each beside its swatch: a band for a shaded range, a stroke for a line. */
function Keys({ items }: { items: { mark: "band" | "line"; color: string; opacity: number; label: string }[] }) {
  const c = useCalm();
  return (
    <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {it.mark === "band" ? (
            <View style={{ width: 16, height: 10, borderRadius: 3, backgroundColor: alpha(it.color, Math.min(1, it.opacity * 2.2)) }} />
          ) : (
            <View style={{ width: 16, height: 3, borderRadius: 1.5, backgroundColor: it.color }} />
          )}
          <Txt size={13} lineHeight={18} color={c.sub}>
            {it.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/**
 * The week's day ticks over the canvas, the shown day bold: two native text layers per tick whose opacity follows the
 * scrubbed index (a scrub never redraws the chart). `y` is the baseline the canvas' ticks use.
 */
function WeekTicks({ active, fallback, xs, texts, y, fonts }: { active: SharedValue<number>; fallback: number; xs: number[]; texts: string[]; y: number; fonts: ChartFonts }) {
  // The RN line box (16 px, no font padding) placed so its baseline sits where Skia's would.
  const top = y - baselineIn(fonts.num(500, 12), 0, 16);
  return (
    <>
      {xs.map((x, i) => (
        <WeekTick key={i} i={i} active={active} fallback={fallback} x={x} top={top} text={texts[i]} />
      ))}
    </>
  );
}

const TICK_TEXT = { position: "absolute", width: 40, fontSize: 12, lineHeight: 16, textAlign: "center", includeFontPadding: false } as const;

function WeekTick({ i, active, fallback, x, top, text }: { i: number; active: SharedValue<number>; fallback: number; x: number; top: number; text: string }) {
  const k = useChartInk();
  const on = useAnimatedStyle(() => ({ opacity: (active.value >= 0 ? active.value : fallback) === i ? 1 : 0 }));
  const off = useAnimatedStyle(() => ({ opacity: (active.value >= 0 ? active.value : fallback) === i ? 0 : 1 }));
  const at = { left: x - 20, top };
  return (
    <>
      <Animated.Text allowFontScaling={false} pointerEvents="none" style={[TICK_TEXT, at, { fontFamily: font.numericFamily(500), color: k.axis }, off]}>
        {text}
      </Animated.Text>
      <Animated.Text allowFontScaling={false} pointerEvents="none" style={[TICK_TEXT, at, { fontFamily: font.numericFamily(700), color: k.axisStrong }, on]}>
        {text}
      </Animated.Text>
    </>
  );
}

/**
 * The header while a finger is on the plot, drawn by Skia from text precomputed per day, so a scrub never runs JS:
 * the day ("MON, SEP 28" in the label face, tracked like the RN label), its value and unit in the headline faces,
 * and for a stack, that day's split. It sits over the RN header, which fades out underneath.
 */
function HeaderReadout({
  active,
  rows,
  today,
  format,
  unit,
  stack,
  width,
  fonts,
  onReady,
}: {
  active: SharedValue<number>;
  rows: Row[];
  today: string;
  format: FormatKey;
  unit?: string;
  stack?: readonly TrendSeries[];
  width: number;
  fonts: ChartFonts;
  /** Called once its canvas has had two frames to draw: the RN header may then hide under it. */
  onReady: () => void;
}) {
  const c = useCalm();
  const labelFont = fonts.sans(700, 11);
  const valueFont = fonts.num(700, 28);
  const unitFont = fonts.sans(500, UNIT_SIZE);
  const captionFont = fonts.sans(500, 12);
  const partFont = fonts.num(700, 12);
  const m = React.useMemo(() => {
    const labels = rows.map((r) => trackedGlyphs(labelFont, dayLabel(r.date, today).toUpperCase(), LABEL_TRACKING).glyphs);
    const values = rows.map((r) => formatValue(format, r.value));
    const valueW = values.map((v) => measure(valueFont, v));
    const hasValue = rows.map((r) => r.value !== null);
    const unitText = unit ? `${isSymbolUnit(unit) ? " " : " "}${unit}` : "";
    // The legend: one slot per part (top part first, as the bars stack), each as wide as its widest value.
    const order = stack ? [...stack].reverse() : [];
    const parts = order.map((s) => rows.map((r) => formatValue(format, r.parts?.[s.key])));
    const slots: { s: TrendSeries; x: number; labelX: number; valueX: number }[] = [];
    for (let k = 0, x = 0; k < order.length; k++) {
      const labelW = measure(captionFont, order[k].label);
      const valueMax = Math.max(0, ...parts[k].map((t) => measure(partFont, t)));
      const slot = { s: order[k], x, labelX: x + 8 + 6, valueX: x + 8 + 6 + labelW + 6 };
      slots.push(slot);
      x = slot.valueX + valueMax + 16;
    }
    const unsplit = rows.map((r) => r.value !== null && !r.parts);
    return { labels, values, valueW, hasValue, unitText, parts, slots, unsplit };
  }, [rows, today, format, unit, stack, labelFont, valueFont, captionFont, partFont]);

  const opacity = useDerivedValue(() => (active.value >= 0 ? 1 : 0));
  const glyphs = useDerivedValue(() => m.labels[active.value] ?? []);
  const value = useDerivedValue(() => m.values[active.value] ?? "");
  const unitX = useDerivedValue(() => m.valueW[active.value] ?? 0);
  const unitOpacity = useDerivedValue(() => (m.hasValue[active.value] ? 1 : 0));
  const splitOpacity = useDerivedValue(() => (m.unsplit[active.value] ? 0 : 1));
  const unsplitOpacity = useDerivedValue(() => (m.unsplit[active.value] ? 1 : 0));
  const valueBase = baselineIn(valueFont, LABEL_LINE, VALUE_LINE);
  const legendBase = baselineIn(captionFont, LEGEND_TOP, 16);
  const height = LEGEND_TOP + (stack ? 16 : 0);

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height }} onLayout={() => requestAnimationFrame(() => requestAnimationFrame(onReady))}>
      <Canvas style={{ width, height }}>
        <Group opacity={opacity}>
          <Glyphs font={labelFont} glyphs={glyphs} x={0} y={baselineIn(labelFont, 0, LABEL_LINE)} color={c.faint} />
          <SkText x={0} y={valueBase} text={value} font={valueFont} color={c.ink} />
          {!!m.unitText && (
            <Group opacity={unitOpacity}>
              <SkText x={unitX} y={valueBase} text={m.unitText} font={unitFont} color={c.sub} />
            </Group>
          )}
          {stack && (
            <Group>
              <Group opacity={splitOpacity}>
                {m.slots.map((slot, k) => (
                  <LegendSlot key={slot.s.key} active={active} texts={m.parts[k]} x={slot.x} labelX={slot.labelX} valueX={slot.valueX} label={slot.s.label} color={slot.s.color} base={legendBase} fonts={fonts} />
                ))}
              </Group>
              <Group opacity={unsplitOpacity}>
                <RoundedRect x={0.5} y={LEGEND_TOP + 4.5} width={7} height={7} r={3.5} color={c.faint} style="stroke" strokeWidth={1}>
                  <DashPathEffect intervals={[2, 1.5]} />
                </RoundedRect>
                <SkText x={14} y={legendBase} text="No breakdown for this day" font={captionFont} color={c.sub} />
              </Group>
            </Group>
          )}
        </Group>
      </Canvas>
    </View>
  );
}

function LegendSlot({ active, texts, x, labelX, valueX, label, color, base, fonts }: { active: SharedValue<number>; texts: string[]; x: number; labelX: number; valueX: number; label: string; color: string; base: number; fonts: ChartFonts }) {
  const c = useCalm();
  const text = useDerivedValue(() => texts[active.value] ?? "");
  return (
    <Group>
      <Circle cx={x + 4} cy={LEGEND_TOP + 8} r={4} color={color} />
      <SkText x={labelX} y={base} text={label} font={fonts.sans(500, 12)} color={c.sub} />
      <SkText x={valueX} y={base} text={text} font={fonts.num(700, 12)} color={c.ink} />
    </Group>
  );
}

/** The shown day's parts beside their swatches, top part first (the bars' order); a day without parts says so. */
function StackLegend({ series, point, format }: { series: readonly TrendSeries[]; point: TrendPoint | null; format: FormatKey }) {
  const c = useCalm();
  const parts = point?.parts;
  return (
    <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 4 }}>
      {point?.value != null && !parts ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderStyle: "dashed", borderColor: c.faint }} />
          <Txt size={12} lineHeight={16} weight={500} color={c.sub}>
            No breakdown for this day
          </Txt>
        </View>
      ) : (
        [...series].reverse().map((s) => (
          <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
            <Txt size={12} lineHeight={16} weight={500} color={c.sub}>
              {s.label}
            </Txt>
            <Txt size={12} lineHeight={16} color={c.ink} style={font.numeric(700)}>
              {formatValue(format, parts?.[s.key])}
            </Txt>
          </View>
        ))
      )}
    </View>
  );
}

/** One metric over W, M, 6M (or 1Y) (spec §5.5). */
export function TrendChart(p: TrendChartProps) {
  return (
    <MetricState metric={p.data} skeleton={<TrendChartSkeleton ranges={p.ranges} day={p.headline === "day"} legend={!!p.stack} />} empty={<EmptyState body="No data in this range yet." />}>
      {(points) => <Trend points={points} p={p} />}
    </MetricState>
  );
}

/** The header's real label and a disabled range toggle; bars for the numbers; the plot at its fixed height (spec §5.19). */
export function TrendChartSkeleton({ chip = false, caption = false, ranges = DEFAULT_RANGES, day = false, legend = false }: { chip?: boolean; caption?: boolean; ranges?: readonly TrendRange[]; day?: boolean; legend?: boolean } = {}) {
  const c = useCalm();
  const many = ranges.length > 3;
  return (
    <View style={{ minWidth: 0 }}>
      <View style={{ marginBottom: 16, gap: 12, ...(many ? { flexDirection: "column-reverse" } : { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }) }}>
        <View>
          {day ? (
            <SkeletonText size={11} lineHeight={LABEL_LINE} chars={8} />
          ) : (
            <Txt size={11} lineHeight={LABEL_LINE} weight={700} uppercase color={c.faint} style={{ letterSpacing: LABEL_TRACKING }}>
              Average
            </Txt>
          )}
          <SkeletonText role="valueLg" chars={4} />
          {legend && <SkeletonText role="caption" width={160} style={{ marginTop: 6 }} />}
          {chip && <Skeleton style={{ marginTop: 4, height: 24, width: 112 }} />}
        </View>
        <ToggleGroup value={"" as TrendRange} onChange={() => {}} items={ranges.map((r) => ({ value: r, label: RANGE_LABEL[r] }))} font="numeric" fill={many} disabled />
      </View>
      <Skeleton radius={14} style={{ height: H, backgroundColor: alpha(c.line, 0.6) }} />
      {caption && <SkeletonText role="caption" width={192} style={{ marginTop: 8 }} />}
    </View>
  );
}
TrendChart.Skeleton = TrendChartSkeleton;
