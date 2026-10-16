// The day's Energy Bank in the Apple Health chart language: a smooth teal line over a fading fill from wake to now (or
// to sleep), the latest reading ringed in its band's colour (green, yellow or red, as Recovery bands), the biggest
// drains marked on the curve with their amounts, naps as soft spans, the 0-100 axis on the right.
import * as React from "react";
import { Group, Path } from "@shopify/react-native-skia";
import { useSharedValue } from "react-native-reanimated";
import { DATA_COLORS, recoveryColor } from "@/lib/bands";
import { areaPath, bandColor, hourTicks, monotonePath, runs, scaleLinear, type Band, type XY } from "@/lib/charts";
import { hourStepFor, nearestIndex, spacedLabels } from "@/lib/chartmath";
import { clock, formatValue } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { AXIS, ChartFigure, clockLabels, FadeShader, Grid, hourText, LINE, measure, numbersSig, Pill, PointMark, RightAxis, ScrubCursor, ScrubLabel, sp, SText, textWidth, useChartFonts, useChartInk, useStableBy, type Scrub } from "./ChartFrame";
import { EmptyState } from "./EmptyState";
import { spanAreas } from "./IntradayHrChart";
import { MetricState } from "./MetricState";
import { ReasonPlaceholder } from "./ReasonPlaceholder";
import { Skeleton } from "./Skeleton";

export type EnergySeries = {
  /** Reserve 0-100 from wake to now (today) or to sleep (past days). */
  points: { t: number; value: number | null }[];
  /** Drains; the chart annotates the three biggest. `amount` is positive ("−18 Run" for 18). */
  drains?: { t: number; amount: number; label: string }[];
  naps?: { start: number; end: number }[];
};

export type EnergyBankChartProps = { data: Metric<EnergySeries> | null | undefined; timeZone?: string; onPress?: () => void };

const H = 180;
const X0 = 4;
const PLOT_TOP = 22;
const Y_TICKS = [0, 33, 67, 100];
/** The axis on the right: room for "100" and the gap to the plot. */
const RIGHT = 28;
/** Hour labels keep this far apart. */
const TICK_MIN = 34;
const PILL_H = 18;

function Chart({ e: given, tz, onPress }: { e: EnergySeries; tz?: string; onPress?: () => void }) {
  // Home rebuilds the series on every render: everything below keys on its numbers, so the canvas redraws only when they change.
  const e = useStableBy(
    given,
    numbersSig(
      given.points.map((p) => p.t),
      given.points.map((p) => p.value),
      (given.drains ?? []).flatMap((d) => [d.t, d.amount, d.label.length]),
      (given.naps ?? []).flatMap((n) => [n.start, n.end]),
    ) + (given.drains ?? []).map((d) => d.label).join(","),
  );
  const { c } = useTheme();
  const calm = useCalm();
  const k = useChartInk();
  const fonts = useChartFonts();
  // Energy bands like Recovery: red ≤ 33, yellow 34-66, green ≥ 67 (the latest reading and the scrubbed dot take them).
  const BANDS: Band[] = React.useMemo(() => [0, 34, 67].map((from) => ({ from, color: c[DATA_COLORS[recoveryColor(from)].fill] })), [c]);
  // The curve in Energy's teal.
  const ink = c.body;
  const m = React.useMemo(() => {
    const vals = e.points.flatMap((p) => (p.value === null ? [] : [p.value]));
    const first = e.points[0]?.t ?? 0;
    const last = e.points[e.points.length - 1]?.t ?? 0;
    const latest = [...e.points].reverse().find((p) => p.value !== null);
    const startV = e.points.find((p) => p.value !== null)?.value;
    // The three biggest drains, in time order (their pills are placed left to right).
    const drains = [...(e.drains ?? [])]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .sort((a, b) => a.t - b.t);
    const ts = e.points.map((p) => p.t);
    return {
      top: Math.max(...vals),
      first,
      last,
      latest,
      drains,
      ts,
      times: clockLabels(ts, tz),
      summary: `Energy from ${clock(first, tz)}: started at ${formatValue("int", startV)} percent, now ${formatValue("int", latest?.value)} percent.`,
    };
  }, [e, tz]);
  const { top, first, last, latest, drains, ts, times, summary } = m;
  const valueAt = (t: number) => e.points[nearestIndex(ts, t)]?.value ?? null;

  // The scrub readout per point ("64%", "14:05"), measured once.
  const readout = React.useMemo(() => {
    if (!fonts) return null;
    const font = fonts.num(700, 12);
    const labelFont = fonts.num(500, 12);
    const texts = e.points.map((p) => (p.value === null ? "" : `${formatValue("int", p.value)}%`));
    const labels = e.points.map((p, i) => (p.value === null ? "" : times[i]));
    return {
      font,
      labelFont,
      texts,
      widths: texts.map((t) => measure(font, t)),
      labels,
      labelWidths: labels.map((t) => measure(labelFont, t)),
      colors: e.points.map((p) => (p.value === null ? k.ink : bandColor(p.value, BANDS))),
    };
  }, [fonts, e.points, times, k, BANDS]);

  const active = useSharedValue(-1);
  const toIndex = React.useCallback(
    (px: number, width: number) => {
      "worklet";
      const x1 = width - RIGHT;
      if (x1 <= X0 || !ts.length) return -1;
      return nearestIndex(ts, first + ((px - X0) / (x1 - X0)) * (last - first));
    },
    [ts, first, last],
  );
  const scrub = React.useMemo<Scrub>(() => ({ active, toIndex }), [active, toIndex]);

  const frame = (width: number) => {
    const x1 = width - RIGHT;
    const plotBottom = H - AXIS.xAxisHeight;
    return { x1, plotBottom, x: scaleLinear([first, last], [X0, x1]), y: scaleLinear([0, 100], [plotBottom, PLOT_TOP]) };
  };

  return (
    <ChartFigure
      height={H}
      summary={summary}
      scrub={scrub}
      deps={[m, e, tz, c, k, ink]}
      drawIn={first}
      onPress={onPress}
      overlay={({ width }) => {
        if (!readout) return null;
        const { x, y, plotBottom } = frame(width);
        const xs = e.points.map((p) => x(p.t));
        return (
          <>
            <ScrubCursor active={active} xs={xs} ys={e.points.map((p) => (p.value === null ? NaN : y(p.value)))} colors={readout.colors} top={PLOT_TOP} bottom={plotBottom} />
            <ScrubLabel active={active} xs={xs} texts={readout.texts} widths={readout.widths} labels={readout.labels} labelWidths={readout.labelWidths} y={PLOT_TOP - 11} minX={0} maxX={width} font={readout.font} labelFont={readout.labelFont} color={k.ink} />
          </>
        );
      }}
    >
      {({ width, fonts: f }) => {
        const { x1, plotBottom, x, y } = frame(width);
        const pts: (XY | null)[] = e.points.map((p) => (p.value === null ? null : { x: x(p.t), y: y(p.value) }));
        const axis = f.num(500, AXIS.fontSize);
        // Whole hours, as many as fit (every hour of a short morning, every few of a long day), clear of each other.
        // Only labels that sit whole on the canvas: one centred near either end would run off it.
        const hours = hourTicks(first, last, hourStepFor(last - first, x1 - X0, TICK_MIN), tz).filter((t) => {
          const w = measure(axis, hourText(t, tz));
          return x(t) - w / 2 >= 0 && x(t) + w / 2 <= x1;
        });
        const hourLabels = hours.map((t) => hourText(t, tz));
        const keep = spacedLabels(
          hours.map((t) => x(t)),
          hourLabels.map((t) => measure(axis, t)),
          [],
          8,
        );
        // The drains' pills over their points, left to right; one that would touch the last is left out, and none runs
        // past the plot's ends.
        let edge = -Infinity;
        const pills = drains.flatMap((d) => {
          const v = valueAt(d.t);
          if (v === null) return [];
          const text = `${formatValue("int", -d.amount)} ${d.label}`;
          const w = Math.max(textWidth(text) - 6, measure(f.num(700, 11), text)) + 10;
          const cx = Math.min(x1 - w / 2, Math.max(X0 + w / 2, x(d.t)));
          if (cx - w / 2 < edge + 6) return [];
          edge = cx + w / 2;
          // Over the point; under it when the point is near the top of the plot.
          const py = y(v) - 15 - PILL_H / 2 >= PLOT_TOP - 6 ? y(v) - 15 : y(v) + 15;
          return [{ d, v, text, cx, py }];
        });
        return (
          <Group>
            <Grid ys={Y_TICKS.map(y)} x1={X0} x2={x1} />
            {spanAreas(
              e.naps?.map((n) => ({ kind: "sleep" as const, start: n.start, end: n.end, label: "Nap" })),
              x,
              X0,
              x1,
              PLOT_TOP,
              plotBottom,
              calm,
            )}
            {hours.map((t, i) => (keep[i] ? <SText key={t} x={x(t)} y={plotBottom + AXIS.tickMargin + AXIS.fontSize} text={hourLabels[i]} font={axis} color={k.axis} anchor="middle" /> : null))}
            <RightAxis x={x1} ys={Y_TICKS.map(y)} texts={Y_TICKS.map(String)} font={axis} />
            <Group>
              {runs(pts).map((run, j) => {
                const d = monotonePath(run);
                return (
                  <Group key={j}>
                    <Path path={sp(areaPath(d, run[0], run[run.length - 1], plotBottom))}>
                      <FadeShader color={ink} from={0.28} y1={y(top)} y2={plotBottom} />
                    </Path>
                    <Path path={sp(d)} style="stroke" strokeWidth={LINE.width} strokeJoin="round" strokeCap="round" color={ink} />
                  </Group>
                );
              })}
              {latest?.value != null && <PointMark cx={x(latest.t)} cy={y(latest.value)} fill={c[DATA_COLORS[recoveryColor(latest.value)].fill]} />}
            </Group>
            {/* The biggest drains, each a sand point on the curve with its amount on a soft pill over it. */}
            <Group>
              {pills.map((p) => (
                <Group key={p.d.t}>
                  <PointMark cx={x(p.d.t)} cy={y(p.v)} fill={calm.tintInk.sand} r={3} ring={1.5} />
                  <Pill x={p.cx} y={p.py} anchor="middle" text={p.text} fill={calm.tint.sand} color={calm.tintInk.sand} />
                </Group>
              ))}
            </Group>
          </Group>
        );
      }}
    </ChartFigure>
  );
}

/** The Energy Bank curve (spec §5.9). A drag reads it minute by minute; a tap opens the explorer on the day's energy. */
export function EnergyBankChart({ data, timeZone, onPress }: EnergyBankChartProps) {
  const empty = <EmptyState body="Energy Bank starts once you wake up." />;
  return (
    <MetricState metric={data} skeleton={<EnergyBankChartSkeleton />} empty={empty} renderReason={(r, meta) => <ReasonPlaceholder reason={r} nightsLeft={meta.nightsLeft} size="md" />}>
      {(e) => (e.points.some((p) => p.value !== null) ? <Chart e={e} tz={timeZone} onPress={onPress} /> : empty)}
    </MetricState>
  );
}

export function EnergyBankChartSkeleton() {
  return <Skeleton radius={14} style={{ height: H }} />;
}
EnergyBankChart.Skeleton = EnergyBankChartSkeleton;
