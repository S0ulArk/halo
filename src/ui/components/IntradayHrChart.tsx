import * as React from "react";
import { View } from "react-native";
import { Group, Path, RoundedRect } from "@shopify/react-native-skia";
import { useSharedValue } from "react-native-reanimated";
import { DATA_COLORS } from "@/lib/bands";
import { areaPath, bandColor, clockTicks, hourTicks, monotonePath, niceTicks, paddedDomain, runs, scaleLinear, type Band, type XY } from "@/lib/charts";
import { downsample, nearestIndex } from "@/lib/chartmath";
import { clock } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import type { Tokens } from "@/ui/theme";
import { AXIS, BandShader, bandPaint, ChartFigure, clockLabels, FadeShader, Grid, GuideLine, LINE, measure, numbersSig, pastel, PointMark, ScrubCursor, ScrubLabel, sp, SText, useChartFonts, useChartInk, useStableBy, ValuePill, type Scrub } from "./ChartFrame";
import { EmptyState } from "./EmptyState";
import { MetricState } from "./MetricState";
import { ReasonPlaceholder } from "./ReasonPlaceholder";
import { Skeleton } from "./Skeleton";
import { ZONE_COLOR } from "./ZoneBars";

/** A marked stretch on an intraday chart. `label` is the short name: "Run", "Ride", "Strength", "Sleep", "Nap". */
export type ChartSpan = { kind: "workout" | "sleep"; start: number; end: number; label: string };
export type HrZone = { zone: number; label: string; min: number; max: number };

export type HrSeries = {
  /** Per-minute heart rate (epoch ms); null is a gap, never interpolated. */
  points: { t: number; bpm: number | null }[];
  zones?: HrZone[];
  spans?: ChartSpan[];
  /** Today only: the dashed "now" line. */
  now?: number;
};

export type IntradayHrChartProps = {
  data: Metric<HrSeries> | null | undefined;
  /** `day`: 200 px with 6-hourly ticks. `activity`: 180 px for one workout window. */
  variant?: "day" | "activity";
  timeZone?: string;
  /** A tap (not a scrub) opens the explorer on this day's heart rate. */
  onPress?: () => void;
};

// Lucide's Moon and Activity glyphs (24-unit boxes), drawn by Skia in the span headers.
const MOON = "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401";
const ACTIVITY = "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2";

/** A span's Calm ink: workouts in Strain's peach, sleep in Sleep's lavender. */
const spanInk = (c: CalmPalette, kind: ChartSpan["kind"]) => (kind === "workout" ? c.tintInk.peach : c.tintInk.lavender);

/** A marked stretch's header: a soft capsule along its top edge, and an icon with its name centred above it. */
export function SpanMark({ x, y, width, kind, text }: { x: number; y: number; width: number; kind: ChartSpan["kind"]; text: string }) {
  const c = useCalm();
  const fonts = useChartFonts();
  const color = spanInk(c, kind);
  const w = 14 + Math.ceil(text.length * 6.2);
  // A header stays inside its own stretch, so back-to-back spans never overprint: the name when it fits, else the icon alone.
  const named = width >= w;
  const left = named ? x + width / 2 - w / 2 : x + width / 2 - 5.5;
  return (
    <Group>
      <RoundedRect x={x} y={y} width={width} height={2.5} r={Math.min(1.25, width / 2)} color={color} />
      {width >= 11 && (
        <Group transform={[{ translateX: left }, { translateY: y - 15 }, { scale: 11 / 24 }]}>
          <Path path={sp(kind === "sleep" ? MOON : ACTIVITY)} style="stroke" strokeWidth={2.25} strokeCap="round" strokeJoin="round" color={color} />
        </Group>
      )}
      {named && fonts && <SText x={left + 14} y={y - 9.5 + 11 * 0.35} text={text} font={fonts.sans(600, 11)} color={c.sub} />}
    </Group>
  );
}

/** Soft pastel span areas with their headers. `shade: false` keeps the header but drops the fill. */
export function spanAreas(spans: ChartSpan[] | undefined, x: (t: number) => number, x0: number, x1: number, top: number, bottom: number, c: CalmPalette, shade = true) {
  return (spans ?? []).map((s) => {
    const a = Math.max(x0, x(s.start));
    const b = Math.min(x1, x(s.end));
    if (b <= a) return null;
    return (
      <Group key={`${s.kind}-${s.start}`}>
        {shade && <RoundedRect x={a} y={top} width={b - a} height={bottom - top} r={Math.min(6, (b - a) / 2)} color={alpha(spanInk(c, s.kind), s.kind === "workout" ? 0.1 : 0.08)} />}
        <SpanMark x={a} y={top} width={b - a} kind={s.kind} text={s.label} />
      </Group>
    );
  });
}

/** Bands for colouring heart rate by zone, ascending; under the first zone the line takes `below` (default neutral). */
export const zoneBands = (zones: HrZone[], c: Tokens, below: string = c.foregroundSecondary): Band[] => [
  { from: 0, color: below },
  ...[...zones].sort((a, b) => a.min - b.min).map((z) => ({ from: z.min, color: c[DATA_COLORS[ZONE_COLOR[z.zone] ?? "strain"].fill] })),
];

function Chart({ hr: given, variant, tz, onPress }: { hr: HrSeries; variant: "day" | "activity"; tz?: string; onPress?: () => void }) {
  // Screens rebuild the series on every render: the minutes, zones and spans are kept by their numbers, so the canvas
  // redraws only when they change (the "now" line stays live).
  const points = useStableBy(given.points, numbersSig(given.points.map((p) => p.t), given.points.map((p) => p.bpm)));
  const zones = useStableBy(given.zones, numbersSig((given.zones ?? []).flatMap((z) => [z.zone, z.min, z.max])));
  const spans = useStableBy(given.spans, numbersSig((given.spans ?? []).flatMap((x) => [x.start, x.end, x.kind === "workout" ? 1 : 0])) + (given.spans ?? []).map((x) => x.label).join(","));
  const hr: HrSeries = { points, zones, spans, now: given.now };
  const { c } = useTheme();
  const calm = useCalm();
  const k = useChartInk();
  const fonts = useChartFonts();
  // Heart rate in Heart's rose ink; inside workouts it takes its zone's colour.
  const ink = calm.tintInk.rose;
  const H = variant === "day" ? 200 : 180;
  // The series work (a day is 1,440 minutes) runs once per series, not on every scrub move.
  const m = React.useMemo(() => {
    const first = hr.points[0]?.t ?? 0;
    const last = hr.points[hr.points.length - 1]?.t ?? 0;
    const domain = paddedDomain(hr.points.map((p) => p.bpm));
    const bpms = hr.points.map((p) => p.bpm).filter((b): b is number => b !== null);
    const summary = `Heart rate from ${clock(first, tz)} to ${clock(last, tz)}: low ${Math.min(...bpms)}, high ${Math.max(...bpms)} beats per minute.`;
    // The day chart draws heart rate grey and colours it by zone only inside workouts; an activity is all workout.
    const workouts = (hr.spans ?? []).filter((s) => s.kind === "workout");
    const inWorkout = (t: number) => variant === "activity" || workouts.some((s) => t >= s.start && t <= s.end);
    const ons = hr.points.map((p) => inWorkout(p.t));
    const rows = hr.points.map((p, i) => {
      const on = ons[i];
      const edge = i > 0 && ons[i - 1] !== on;
      return { t: p.t, bpm: p.bpm, hot: on || edge ? p.bpm : null, cool: !on || edge ? p.bpm : null };
    });
    const hot = rows.flatMap((r) => (r.hot == null ? [] : [r.hot]));
    const xTicks = variant === "day" ? hourTicks(first, last, 6, tz) : clockTicks(first, last, last - first <= 3_600_000 ? 15 : last - first <= 3 * 3_600_000 ? 30 : 60, tz);
    const ts = rows.map((r) => r.t);
    const times = clockLabels(ts, tz);
    let latest: { t: number; bpm: number } | null = null;
    for (let i = rows.length - 1; i >= 0 && !latest; i--) if (rows[i].bpm !== null) latest = { t: rows[i].t, bpm: rows[i].bpm! };
    // The grid rows inside the padded domain only: a nice tick past either end would draw under the plot, in the time axis.
    const yTicks = niceTicks(domain[0], domain[1], 4).filter((v) => v >= domain[0] && v <= domain[1]);
    return { first, last, domain, summary, rows, ts, times, latest, hotTop: hot.length ? Math.max(...hot) : 0, hotBottom: hot.length ? Math.min(...hot) : 0, yTicks, xTicks };
    // The minutes and spans, not the "now" line: today's live reading moves it every few seconds.
  }, [hr.points, hr.spans, variant, tz]);
  const { first, last, domain, summary, rows, ts, times, latest, hotTop, hotBottom, yTicks, xTicks } = m;
  const bands = React.useMemo(() => zoneBands(hr.zones ?? [], c, ink), [hr.zones, c, ink]);
  // The scrub readout, one value and time per minute ("72 bpm", "14:05"), measured once.
  const readout = React.useMemo(() => {
    if (!fonts) return null;
    const font = fonts.num(700, 12);
    const labelFont = fonts.num(500, 12);
    const texts = rows.map((r) => (r.bpm === null ? "" : `${r.bpm} bpm`));
    const labels = rows.map((r, i) => (r.bpm === null ? "" : times[i]));
    return {
      font,
      labelFont,
      texts,
      widths: texts.map((t) => measure(font, t)),
      labels,
      labelWidths: labels.map((t) => measure(labelFont, t)),
      colors: rows.map((r) => (r.bpm === null ? k.ink : bandColor(r.bpm, bands))),
    };
  }, [fonts, rows, times, bands, k]);

  const active = useSharedValue(-1);
  const toIndex = React.useCallback(
    (px: number, width: number) => {
      "worklet";
      const x0 = 32;
      const x1 = width - 28;
      if (x1 <= x0 || !ts.length) return -1;
      return nearestIndex(ts, first + ((px - x0) / (x1 - x0)) * (last - first));
    },
    [ts, first, last],
  );
  const scrub = React.useMemo<Scrub>(() => ({ active, toIndex }), [active, toIndex]);

  // The plot's box and scales at a width, shared by the drawing and the scrub overlay.
  const frame = (width: number) => {
    const x0 = 32;
    const x1 = width - 28;
    const plotTop = 18;
    const plotBottom = H - AXIS.xAxisHeight;
    return { x0, x1, plotTop, plotBottom, x: scaleLinear([first, last], [x0, x1]), y: scaleLinear(domain, [plotBottom, plotTop]) };
  };

  return (
    <View>
      <ChartFigure
        height={H}
        summary={summary}
        scrub={scrub}
        onPress={onPress}
        deps={[m, bands, hr.spans, hr.zones, hr.now, c, k]}
        drawIn={first}
        overlay={({ width }) => {
          if (!readout) return null;
          const { x, y, plotTop, plotBottom } = frame(width);
          const xs = rows.map((r) => x(r.t));
          return (
            <>
              <ScrubCursor active={active} xs={xs} ys={rows.map((r) => (r.bpm === null ? NaN : y(r.bpm)))} colors={readout.colors} top={plotTop} bottom={plotBottom} />
              <ScrubLabel active={active} xs={xs} texts={readout.texts} widths={readout.widths} labels={readout.labels} labelWidths={readout.labelWidths} y={plotTop - 7} minX={0} maxX={width} font={readout.font} labelFont={readout.labelFont} color={k.ink} />
            </>
          );
        }}
      >
        {({ width, fonts: f }) => {
          const { x0, x1, x, y, plotTop, plotBottom } = frame(width);
          // A day is 1,440 minutes: the lines draw at most two points per dp (the scrub keeps every minute).
          const drawn = downsample(rows, (r) => r.bpm, 2 * (x1 - x0));
          const pts = (key: "hot" | "cool") => drawn.map((r): XY | null => (r[key] == null ? null : { x: x(r.t), y: y(r[key]!) }));
          const coolRuns = runs(pts("cool"));
          const hotRuns = runs(pts("hot"));
          const axis = f.num(500, 12);
          return (
            <Group>
              <Grid ys={yTicks.map(y)} x1={x0} x2={x1} />
              {spanAreas(hr.spans, x, x0, x1, plotTop, plotBottom, calm, variant === "day")}
              {/* The zones on the bpm axis: a soft capsule along the plot's right edge at each zone's height, labelled Z1-Z5. */}
              {(hr.zones ?? []).map((z) => {
                const lo = Math.max(z.min, domain[0]);
                const hi = Math.min(z.max, domain[1]);
                if (hi <= lo) return null;
                const color = c[DATA_COLORS[ZONE_COLOR[z.zone] ?? "strain"].fill];
                const top = y(hi);
                const h = y(lo) - top;
                return (
                  <Group key={z.zone}>
                    <RoundedRect x={x1 + 3} y={top + 1} width={4} height={Math.max(0, h - 2)} r={2} color={pastel(color, k, 0.6)} />
                    {h >= 11 && <SText x={x1 + 11} y={top + h / 2 + 10 * 0.35} text={`Z${z.zone}`} font={f.num(700, 10)} color={color} />}
                  </Group>
                );
              })}
              {xTicks.map((t) => (
                <SText key={t} x={x(t)} y={plotBottom + AXIS.tickMargin + 12} text={clock(t, tz)} font={axis} color={k.axis} anchor="middle" />
              ))}
              {yTicks.map((v) => (
                <SText key={v} x={x0 - AXIS.tickMargin} y={y(v) + 12 * 0.32} text={String(v)} font={axis} color={k.axis} anchor="end" />
              ))}
              {hr.now && hr.now >= first && hr.now <= last ? <GuideLine x1={x(hr.now)} x2={x(hr.now)} y1={plotTop} y2={plotBottom} /> : null}
              <Group>
                {coolRuns.map((run, j) => {
                  const d = monotonePath(run);
                  return (
                    <Group key={`c${j}`}>
                      <Path path={sp(areaPath(d, run[0], run[run.length - 1], plotBottom))}>
                        <FadeShader color={ink} from={0.14} y1={plotTop} y2={plotBottom} />
                      </Path>
                      <Path path={sp(d)} style="stroke" strokeWidth={LINE.thin} strokeJoin="round" strokeCap="round" color={ink} />
                    </Group>
                  );
                })}
                {hotRuns.map((run, j) => {
                  const d = monotonePath(run);
                  return (
                    <Group key={`h${j}`}>
                      {/* The fill is one soft fade in the peak's colour: band stops in a fill read as stacked blocks. */}
                      {hotTop > domain[0] && (
                        <Path path={sp(areaPath(d, run[0], run[run.length - 1], plotBottom))}>
                          <FadeShader color={bandColor(hotTop, bands)} from={0.18} y1={y(hotTop)} y2={plotBottom} />
                        </Path>
                      )}
                      <Path path={sp(d)} style="stroke" strokeWidth={LINE.width} strokeJoin="round" strokeCap="round" color={bandPaint(hotTop, hotBottom, bands)}>
                        <BandShader yTop={y(hotTop)} yBottom={y(hotBottom)} top={hotTop} bottom={hotBottom} bands={bands} />
                      </Path>
                    </Group>
                  );
                })}
                {/* The latest reading, ringed in the card colour; today, its value on a pill beside it. */}
                {latest && <PointMark cx={x(latest.t)} cy={y(latest.bpm)} fill={bandColor(latest.bpm, bands)} r={4} ring={2} />}
                {latest && hr.now ? <ValuePill x={x(latest.t)} y={y(latest.bpm)} text={`${latest.bpm} bpm`} font={f.num(700, 11)} left={x0} right={x1} top={plotTop} bottom={plotBottom} /> : null}
              </Group>
            </Group>
          );
        }}
      </ChartFigure>
    </View>
  );
}

/** Heart rate across the day or an activity, with zones and markers (spec §5.7). */
export function IntradayHrChart({ data, variant = "day", timeZone, onPress }: IntradayHrChartProps) {
  const empty = <EmptyState body="No heart-rate data for this day." />;
  return (
    <MetricState metric={data} skeleton={<IntradayHrChartSkeleton variant={variant} />} empty={empty} renderReason={(r) => <ReasonPlaceholder reason={r} size="md" />}>
      {(hr) => (hr.points.some((p) => p.bpm !== null) ? <Chart hr={hr} variant={variant} tz={timeZone} onPress={onPress} /> : empty)}
    </MetricState>
  );
}

export function IntradayHrChartSkeleton({ variant = "day" }: { variant?: "day" | "activity" }) {
  const c = useCalm();
  return <Skeleton radius={14} style={{ height: variant === "day" ? 200 : 180, backgroundColor: alpha(c.line, 0.6) }} />;
}
IntradayHrChart.Skeleton = IntradayHrChartSkeleton;
