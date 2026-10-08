import * as React from "react";
import { View } from "react-native";
import { Group, Path } from "@shopify/react-native-skia";
import { hourStepFor, spacedLabels } from "@/lib/chartmath";
import { areaPath, hourTicks, monotonePath, paddedDomain, runs, scaleLinear, type XY } from "@/lib/charts";
import { clock } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { AXIS, ChartFigure, FadeShader, Grid, GuideLine, LINE, measure, Pill, PointMark, sp, SText, textWidth, useChartInk } from "./ChartFrame";
import { EmptyState } from "./EmptyState";
import { MetricState } from "./MetricState";
import { ReasonPlaceholder } from "./ReasonPlaceholder";
import { Skeleton } from "./Skeleton";
import { Txt } from "./Text";

export type SleepHr = {
  /** Epoch ms of the main sleep's start and end. */
  bed: number;
  wake: number;
  /** Per-minute heart rate, a little past both ends; null is a gap, never interpolated. */
  points: { t: number; v: number | null }[];
};

export type SleepHrChartProps = {
  data: Metric<SleepHr> | null | undefined;
  /** The chosen stage's intervals: its heart rate is drawn bright with a fill, the rest of the night dim. Omit to light the whole night. */
  highlight?: { start: number; end: number }[];
  /** The chosen stage's name, for the legend under the chart ("REM" bright, "Rest of the night" dim). */
  highlightLabel?: string;
  timeZone?: string;
  /** A tap opens the explorer on the night. */
  onPress?: () => void;
};

const H = 180;
const MIN = 60_000;
/** Hour labels keep this far apart (a clock time is about 30 px at 12 px). */
const TICK_MIN = 46;

/** The legend under the chart while a stage is lit: its line bright, the rest of the night dim. */
function Legend({ label, ink }: { label: string; ink: string }) {
  const c = useCalm();
  const key = (color: string, text: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: color }} />
      <Txt size={12} lineHeight={16} weight={500} color={c.sub}>
        {text}
      </Txt>
    </View>
  );
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
      {key(ink, label)}
      {key(alpha(ink, 0.35), "Rest of the night")}
    </View>
  );
}

function Chart({ hr, highlight, highlightLabel, tz, onPress }: { hr: SleepHr; highlight?: { start: number; end: number }[]; highlightLabel?: string; tz?: string; onPress?: () => void }) {
  const { c } = useTheme();
  const calm = useCalm();
  const k = useChartInk();
  // The night in Sleep's lavender ink: the chosen stage bright with a soft fill, the rest of the night dimmer.
  const ink = calm.tintInk.lavender;
  const { bed, wake, points } = hr;
  // Three series on one axis: outside the sleep (faint), the night (dim), the chosen stage (bright, filled).
  const rows = React.useMemo(
    () =>
      points.map(({ t, v }) => {
        const inside = t >= bed && t <= wake;
        const lit = inside && (!highlight || highlight.some((s) => t < s.end && t + 2 * MIN > s.start));
        return { t, out: inside ? null : v, night: inside ? v : null, lit: lit ? v : null };
      }),
    [points, bed, wake, highlight],
  );
  const [lo, hi] = paddedDomain(points.map((p) => p.v));
  const yTicks = Array.from({ length: Math.ceil(hi / 20) - Math.floor(lo / 20) + 1 }, (_, i) => (Math.floor(lo / 20) + i) * 20);
  const night = points.filter((p) => p.t >= bed && p.t < wake && p.v !== null).map((p) => p.v!);
  const avg = night.length ? Math.round(night.reduce((a, b) => a + b, 0) / night.length) : null;
  const low = points.reduce<{ t: number; v: number } | null>((m, p) => (p.t >= bed && p.t < wake && p.v !== null && (!m || p.v < m.v) ? { t: p.t, v: p.v } : m), null);
  const summary = `Heart rate during sleep from ${clock(bed, tz)} to ${clock(wake, tz)}: low ${Math.min(...night)}, average ${avg}, high ${Math.max(...night)} beats per minute.`;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;

  return (
    // Choosing a stage relights the night without drawing it in again: the draw-in follows the night, not the highlight.
    <View>
      <ChartFigure height={H} summary={summary} deps={[rows, tz, c, k]} drawIn={`${bed}|${wake}`} onPress={onPress}>
        {({ width, fonts }) => {
          const x0 = 32;
          const x1 = width - 8;
          const plotTop = 8;
          const plotBottom = H - AXIS.xAxisHeight;
          const x = scaleLinear([t0, t1], [x0, x1]);
          const y = scaleLinear([yTicks[0], yTicks[yTicks.length - 1]], [plotBottom, plotTop]);
          const pts = (key: "out" | "night" | "lit") => rows.map((r): XY | null => (r[key] == null ? null : { x: x(r.t), y: y(r[key]!) }));
          const axis = fonts.num(500, 12);
          const edge = fonts.num(600, 12);
          const timeY = plotBottom + AXIS.tickMargin + 12;
          // Bed and wake in bold at their guides (kept on the canvas), the whole hours between them where they fit.
          const ends = [bed, wake].map((t) => {
            const text = clock(t, tz);
            const w = measure(edge, text);
            const cx = Math.min(width - w / 2, Math.max(w / 2, x(t)));
            return { t, text, cx, from: cx - w / 2, to: cx + w / 2 };
          });
          const hours = hourTicks(bed, wake, hourStepFor(wake - bed, x1 - x0, TICK_MIN), tz);
          const hourText = hours.map((t) => clock(t, tz));
          const keep = spacedLabels(
            hours.map((t) => x(t)),
            hourText.map((t) => measure(axis, t)),
            ends.map((e) => [e.from, e.to] as const),
            10,
          );
          // The low's pill under its point (over it when the plot's floor is too close), kept inside the plot.
          const lowText = low ? `Low ${low.v}` : "";
          const lowW = low ? Math.max(textWidth(lowText) - 6, measure(fonts.num(700, 11), lowText)) + 10 : 0;
          const lowX = low ? Math.min(x1 - lowW / 2, Math.max(x0 + lowW / 2, x(low.t))) : 0;
          return (
            <Group>
              <Grid ys={yTicks.map(y)} x1={x0} x2={x1} />
              {ends.map((e) => (
                <SText key={e.t} x={e.cx} y={timeY} text={e.text} font={edge} color={k.axisStrong} anchor="middle" />
              ))}
              {hours.map((t, i) => (keep[i] ? <SText key={t} x={x(t)} y={timeY} text={hourText[i]} font={axis} color={k.axis} anchor="middle" /> : null))}
              {yTicks.map((v) => (
                <SText key={v} x={x0 - AXIS.tickMargin} y={y(v) + 12 * 0.32} text={String(v)} font={axis} color={k.axis} anchor="end" />
              ))}
              {/* The reference app's bed and wake markers, as soft guides. */}
              {[bed, wake].map((t) => (
                <GuideLine key={t} x1={x(t)} x2={x(t)} y1={plotTop} y2={plotBottom} />
              ))}
              <Group>
                {runs(pts("out")).map((run, j) => (
                  <Path key={`o${j}`} path={sp(monotonePath(run))} style="stroke" strokeWidth={1.5} strokeJoin="round" strokeCap="round" color={alpha(k.faint, 0.5)} />
                ))}
                {runs(pts("night")).map((run, j) => (
                  <Path key={`n${j}`} path={sp(monotonePath(run))} style="stroke" strokeWidth={LINE.thin} strokeJoin="round" strokeCap="round" color={alpha(ink, 0.35)} />
                ))}
                {runs(pts("lit")).map((run, j) => {
                  const d = monotonePath(run);
                  return (
                    <Group key={`l${j}`}>
                      <Path path={sp(areaPath(d, run[0], run[run.length - 1], plotBottom))}>
                        <FadeShader color={ink} from={0.18} y1={plotTop} y2={plotBottom} />
                      </Path>
                      <Path path={sp(d)} style="stroke" strokeWidth={LINE.width} strokeJoin="round" strokeCap="round" color={ink} />
                    </Group>
                  );
                })}
              </Group>
              {/* The night's lowest minute, marked as a point with a pill: the number people look for on this chart. */}
              {low && (
                <Group>
                  <PointMark cx={x(low.t)} cy={y(low.v)} fill={ink} r={4} ring={2} />
                  <Pill x={lowX} y={y(low.v) + 19 + 9 <= plotBottom ? y(low.v) + 19 : Math.max(plotTop + 9, y(low.v) - 19)} anchor="middle" text={lowText} />
                </Group>
              )}
            </Group>
          );
        }}
      </ChartFigure>
      {highlight && highlightLabel ? <Legend label={highlightLabel} ink={ink} /> : null}
    </View>
  );
}

/** Heart rate across the main sleep with its bed and wake markers; the chosen stage lit (spec §7.5, §11 R9). */
export function SleepHrChart({ data, highlight, highlightLabel, timeZone, onPress }: SleepHrChartProps) {
  const empty = <EmptyState body="No heart-rate data for this night." />;
  return (
    <MetricState metric={data} skeleton={<SleepHrChartSkeleton />} empty={empty} renderReason={(r) => <ReasonPlaceholder reason={r} size="md" />}>
      {(hr) => (hr.points.some((p) => p.v !== null) ? <Chart hr={hr} highlight={highlight} highlightLabel={highlightLabel} tz={timeZone} onPress={onPress} /> : empty)}
    </MetricState>
  );
}

export function SleepHrChartSkeleton() {
  const c = useCalm();
  return <Skeleton radius={14} style={{ height: H, backgroundColor: alpha(c.line, 0.6) }} />;
}
SleepHrChart.Skeleton = SleepHrChartSkeleton;
