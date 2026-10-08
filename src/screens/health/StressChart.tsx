import * as React from "react";
import { View } from "react-native";
import { Circle, Group, Path } from "@shopify/react-native-skia";
import { useCalm } from "@/ui/calm";
import { useSharedValue } from "react-native-reanimated";
import { DATA_COLORS, STRESS_COLOR, STRESS_WORD, stressLevel } from "@/lib/bands";
import { areaPath, bandColor, hourTicks, monotonePath, runs, scaleLinear, type Band, type XY } from "@/lib/charts";
import { downsample, nearestValued } from "@/lib/chartmath";
import { clock, formatValue } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { EmptyState, MetricState, ReasonPlaceholder, Skeleton, Txt, useTheme, type ChartSpan } from "@/ui";
import { AXIS, BandShader, bandPaint, ChartFigure, clockLabels, FadeShader, Grid, GuideLine, LINE, measure, PointMark, ScrubCursor, ScrubLabel, sp, SText, useChartFonts, useChartInk, type Scrub } from "@/ui/components/ChartFrame";
import { spanAreas } from "@/ui/components/IntradayHrChart";

export type StressSeries = {
  /** 0-3 per still minute; moving minutes are null (gaps). */
  points: { t: number; value: number | null }[];
  spans?: ChartSpan[];
  /** Today only: the dashed "now" line. */
  now?: number;
};

export type StressChartProps = {
  data: Metric<StressSeries> | null | undefined;
  /** `full`: 200 px with axes (Stress Monitor). `spark`: 44 px, no axes (Health hub). */
  variant: "full" | "spark";
  timeZone?: string;
  /** A tap (not a scrub) opens the explorer on the day's stress. */
  onPress?: () => void;
};

const FULL_H = 200;
const SPARK_H = 44;

function Chart({ s, variant, tz, onPress }: { s: StressSeries; variant: "full" | "spark"; tz?: string; onPress?: () => void }) {
  const { c } = useTheme();
  const calm = useCalm();
  const k = useChartInk();
  const fonts = useChartFonts();
  // Low from 0, medium from 1, high from 2: one continuous line whose colour follows the level (Bevel's stress chart).
  const bands: Band[] = (["low", "medium", "high"] as const).map((l, i) => ({ from: i, color: c[DATA_COLORS[STRESS_COLOR[l]].fill] }));
  const levelColor = (v: number) => c[DATA_COLORS[STRESS_COLOR[stressLevel(v)]].fill];
  const vals = s.points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const top = Math.max(...vals);
  const bottom = Math.min(...vals);
  const first = s.points[0]?.t ?? 0;
  const last = s.now ?? s.points[s.points.length - 1]?.t ?? 0;
  const full = variant === "full";
  const shown = React.useMemo(() => s.points.filter((p) => p.t <= last), [s.points, last]);
  let latest: { t: number; value: number } | undefined;
  for (let i = shown.length - 1; i >= 0 && !latest; i--) if (shown[i].value !== null) latest = { t: shown[i].t, value: shown[i].value! };
  const H = full ? FULL_H : SPARK_H;
  const summary = latest
    ? `Stress through the day, latest ${formatValue("decimal1", latest.value)}, ${STRESS_WORD[stressLevel(latest.value)].toLowerCase()}, at ${clock(latest.t, tz)}.`
    : "Stress through the day.";

  // The scrub (full chart only): the still minute nearest the finger, with its readout precomputed per minute.
  const series = React.useMemo(() => ({ ts: shown.map((p) => p.t), vs: shown.map((p) => p.value) }), [shown]);
  const readout = React.useMemo(() => {
    if (!fonts || !full) return null;
    const font = fonts.num(700, 12);
    const labelFont = fonts.num(500, 12);
    const times = clockLabels(series.ts, tz);
    const texts = shown.map((p) => (p.value === null ? "" : `${formatValue("decimal1", p.value)} ${STRESS_WORD[stressLevel(p.value)]}`));
    const labels = shown.map((p, i) => (p.value === null ? "" : times[i]));
    return {
      font,
      labelFont,
      texts,
      widths: texts.map((t) => measure(font, t)),
      labels,
      labelWidths: labels.map((t) => measure(labelFont, t)),
      colors: shown.map((p) => (p.value === null ? k.ink : levelColor(p.value))),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonts, full, shown, series, tz, c, k]);
  const active = useSharedValue(-1);
  const { ts, vs } = series;
  const toIndex = React.useCallback(
    (px: number, width: number) => {
      "worklet";
      const x0 = 24;
      const x1 = width - 8;
      if (x1 <= x0 || last <= first) return -1;
      return nearestValued(ts, vs, first + ((px - x0) / (x1 - x0)) * (last - first));
    },
    [ts, vs, first, last],
  );
  const scrub = React.useMemo<Scrub>(() => ({ active, toIndex }), [active, toIndex]);

  const frame = (width: number) => {
    const x0 = full ? 24 : 4;
    const x1 = width - (full ? 8 : 4);
    const plotTop = full ? 16 : 4;
    const plotBottom = full ? H - AXIS.xAxisHeight : H - 4;
    return { x0, x1, plotTop, plotBottom, x: scaleLinear([first, Math.max(last, first + 1)], [x0, x1]), y: scaleLinear([0, 3], [plotBottom, plotTop]) };
  };

  return (
    <ChartFigure
      height={H}
      summary={summary}
      scrub={full ? scrub : undefined}
      onPress={onPress}
      deps={[shown, s.spans, s.now, variant, tz, c, k]}
      drawIn={first}
      overlay={({ width }) => {
        if (!readout) return null;
        const { x, y, x0, x1, plotTop, plotBottom } = frame(width);
        const xs = shown.map((p) => x(p.t));
        return (
          <>
            <ScrubCursor active={active} xs={xs} ys={shown.map((p) => (p.value === null ? NaN : y(p.value)))} colors={readout.colors} top={plotTop} bottom={plotBottom} />
            <ScrubLabel active={active} xs={xs} texts={readout.texts} widths={readout.widths} labels={readout.labels} labelWidths={readout.labelWidths} y={plotTop - 5} minX={x0} maxX={x1} font={readout.font} labelFont={readout.labelFont} color={k.ink} />
          </>
        );
      }}
    >
      {({ width, fonts: f }) => {
        const { x0, x1, plotTop, plotBottom, x, y } = frame(width);
        const pts: (XY | null)[] = downsample(shown, (p) => p.value, 2 * (x1 - x0)).map((p) => (p.value === null ? null : { x: x(p.t), y: y(p.value) }));
        const lineRuns = runs(pts);
        const axis = f.num(500, 12);
        return (
          <Group>
            {full && <Grid ys={[1, 2, 3].map(y)} x1={x0} x2={x1} />}
            {full && spanAreas(s.spans, x, x0, x1, plotTop, plotBottom, calm)}
            {full && hourTicks(first, last, 4, tz).map((t) => <SText key={t} x={x(t)} y={plotBottom + AXIS.tickMargin + 12} text={clock(t, tz)} font={axis} color={k.axis} anchor="middle" />)}
            {full && [0, 1, 2, 3].map((v) => <SText key={v} x={x0 - 4} y={y(v) + 12 * 0.32} text={String(v)} font={axis} color={k.axis} anchor="end" />)}
            <Group>
              {lineRuns.map((run, j) => {
                const d = monotonePath(run);
                return (
                  <Group key={j}>
                    {full && top > 0 && (
                      <Path path={sp(areaPath(d, run[0], run[run.length - 1], plotBottom))}>
                        <FadeShader color={bandColor(top, bands)} from={0.18} y1={y(top)} y2={plotBottom} />
                      </Path>
                    )}
                    <Path path={sp(d)} style="stroke" strokeWidth={full ? LINE.width : LINE.thin} strokeJoin="round" strokeCap="round" color={bandPaint(top, bottom, bands)}>
                      <BandShader yTop={y(top)} yBottom={y(bottom)} top={top} bottom={bottom} bands={bands} />
                    </Path>
                  </Group>
                );
              })}
              {latest && (full ? <PointMark cx={x(latest.t)} cy={y(latest.value)} fill={levelColor(latest.value)} /> : <Circle cx={x(latest.t)} cy={y(latest.value)} r={3} color={levelColor(latest.value)} />)}
            </Group>
            {full && s.now !== undefined && s.now >= first && <GuideLine x1={x(s.now)} x2={x(s.now)} y1={plotTop} y2={plotBottom} />}
          </Group>
        );
      }}
    </ChartFigure>
  );
}

/** Intraday stress 0-3 with level-coloured lines (spec §5.10). */
export function StressChart({ data, variant, timeZone, onPress }: StressChartProps) {
  const empty =
    variant === "full" ? (
      <EmptyState body="No still minutes to score yet today. Stress is measured only while you are not moving." />
    ) : (
      <View style={{ height: SPARK_H, justifyContent: "center" }}>
        <Txt role="caption">No still minutes yet</Txt>
      </View>
    );
  return (
    <MetricState
      metric={data}
      skeleton={<StressChartSkeleton variant={variant} />}
      empty={empty}
      reasonSize={variant === "full" ? "md" : "sm"}
      renderReason={(r) =>
        variant === "full" ? (
          <ReasonPlaceholder reason={r} size="md" />
        ) : (
          <View style={{ height: SPARK_H, justifyContent: "center" }}>
            <ReasonPlaceholder reason={r} size="sm" />
          </View>
        )
      }
    >
      {(s) => (s.points.some((p) => p.value !== null) ? <Chart s={s} variant={variant} tz={timeZone} onPress={onPress} /> : empty)}
    </MetricState>
  );
}

export function StressChartSkeleton({ variant }: { variant: "full" | "spark" }) {
  const { c } = useTheme();
  return <Skeleton radius={10} style={{ height: variant === "full" ? FULL_H : SPARK_H, backgroundColor: alpha(c.muted, 0.6) }} />;
}
