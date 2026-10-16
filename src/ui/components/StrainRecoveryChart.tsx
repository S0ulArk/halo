// Home's "Strain & Recovery" week in the Apple Health chart language: Recovery as capsule-topped bars in their band's
// colour (today's solid, the rest at 35 %), Strain as a smooth orange line with ringed dots over them, each value
// labelled where it fits, Strain's axis on the left and Recovery's on the right over dashed hairline rows.
import * as React from "react";
import { View } from "react-native";
import { Group, Path } from "@shopify/react-native-skia";
import { recoveryBand } from "@/lib/bands";
import { monotonePath, runs, scaleLinear, type XY } from "@/lib/charts";
import { formatDay, formatValue } from "@/lib/format";
import { labelWidth, placeDotLabels, type Box } from "@/lib/labels";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { AXIS, barPath, barRadius, ChartFigure, DashLine, Grid, GRID, LINE, measure, PointMark, RightAxis, sp, SText, useChartInk } from "./ChartFrame";
import { Skeleton } from "./Skeleton";
import { Txt } from "./Text";

export type StrainRecoveryPoint = { day: string; strain: number | null; recovery: number | null };

const RIGHT_TICKS = [0, 33, 66, 100];
const LEFT_TICKS = [0, 7, 14, 21];
const H = 232;
/** Under the plot: the weekday over the day of the month. */
const X_AXIS_H = 40;
const PLOT_TOP = 20;
const PLOT_BOTTOM = H - X_AXIS_H;
const LABEL_SIZE = 11;

type Row = StrainRecoveryPoint & { weekday: string; dayOfMonth: string; today: boolean };

/** The two series by name and axis under the plot: Strain's orange line on the left axis, Recovery's bars on the right. */
function Legend() {
  const { c } = useTheme();
  const calm = useCalm();
  const item = (mark: React.ReactNode, name: string, axis: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {mark}
      <Txt size={12} lineHeight={16} weight={600} color={calm.ink}>
        {name}
      </Txt>
      <Txt size={12} lineHeight={16} weight={500} color={calm.sub}>
        {axis}
      </Txt>
    </View>
  );
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 18, rowGap: 4 }}>
      {item(
        <View style={{ width: 16, height: 8, justifyContent: "center", alignItems: "center" }}>
          <View style={{ position: "absolute", width: 16, height: 2.5, borderRadius: 1.25, backgroundColor: c.strain }} />
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.strain }} />
        </View>,
        "Strain",
        "0–21, left",
      )}
      {item(<View style={{ width: 8, height: 12, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: c.recoveryGreen }} />, "Recovery", "%, right")}
    </View>
  );
}

/**
 * Home's "Strain & Recovery" week: Recovery on the right axis (0-100 %) as bars in their band's colour, today's at full
 * colour and the past at 35 %; Strain on the left axis (0-21) as an orange line with dots ringed in the card colour;
 * each value labelled beside its mark where it fits, today's always. Missing days are gaps, never interpolated. The
 * week draws in left to right; a tap opens the explorer comparing the two.
 */
export function StrainRecoveryChart({ points, today, onPress }: { points: StrainRecoveryPoint[]; today: string; onPress?: () => void }) {
  const { c } = useTheme();
  const k = useChartInk();
  const BAND_TEXT = { green: c.recoveryGreen, yellow: c.recoveryYellow, red: c.recoveryRedText } as const;
  const BAND_FILL = { green: c.recoveryGreen, yellow: c.recoveryYellow, red: c.recoveryRed } as const;
  const { rows, summary } = React.useMemo(() => {
    const strains = points.map((p) => p.strain).filter((v): v is number => v !== null);
    const recs = points.map((p) => p.recovery).filter((v): v is number => v !== null);
    return {
      rows: points.map((p): Row => ({ ...p, weekday: formatDay(p.day, { weekday: "short" }), dayOfMonth: formatDay(p.day, { day: "numeric" }), today: p.day === today })),
      summary: `Strain and Recovery over the last ${points.length} days: Strain ${
        strains.length ? `from ${formatValue("decimal1", Math.min(...strains))} to ${formatValue("decimal1", Math.max(...strains))}` : "not recorded"
      }, Recovery ${recs.length ? `from ${Math.round(Math.min(...recs))} to ${Math.round(Math.max(...recs))} percent` : "not recorded"}.`,
    };
  }, [points, today]);

  return (
    <View>
      <ChartFigure height={H} summary={summary} deps={[rows, c, k]} drawIn={today} onPress={onPress}>
        {({ width, fonts }) => {
          const tickFont = fonts.num(600, AXIS.fontSize);
          const rightTexts = RIGHT_TICKS.map((v) => `${v}%`);
          const x0 = Math.ceil(Math.max(...LEFT_TICKS.map((v) => measure(tickFont, String(v))))) + AXIS.gap + 2;
          const x1 = width - AXIS.gap - Math.ceil(Math.max(...rightTexts.map((t) => measure(tickFont, t)))) - 2;
          const ys = scaleLinear([0, 21], [PLOT_BOTTOM, PLOT_TOP]);
          const yr = scaleLinear([0, 100], [PLOT_BOTTOM, PLOT_TOP]);
          const bandW = (x1 - x0) / Math.max(1, rows.length);
          const cx = (i: number) => x0 + (i + 0.5) * bandW;
          const barW = Math.min(20, bandW * 0.5);
          const rec: (XY | null)[] = rows.map((r, i) => (r.recovery === null ? null : { x: cx(i), y: yr(r.recovery) }));
          const str: (XY | null)[] = rows.map((r, i) => (r.strain === null ? null : { x: cx(i), y: ys(r.strain) }));
          // Value labels: each day's two on opposite sides of their marks (a bar's top is its mark); where two would
          // touch at this width, the less important one goes (today's stay, then each series' high and low). They clear
          // the axis ticks and the day labels.
          const tick = (text: string, x: number, y: number, anchor: "start" | "end"): Box => {
            const w = labelWidth(text, AXIS.fontSize);
            return { x1: anchor === "end" ? x - w : x, y1: y - 6, x2: anchor === "end" ? x : x + w, y2: y + 6 };
          };
          const labels = placeDotLabels(
            rows.map((r, i) => ({
              x: cx(i),
              a: r.recovery === null ? null : { y: yr(r.recovery), text: `${Math.round(r.recovery)}%` },
              b: r.strain === null ? null : { y: ys(r.strain), text: formatValue("decimal1", r.strain) },
              today: r.today,
            })),
            {
              fontSize: LABEL_SIZE,
              top: 2,
              bottom: PLOT_BOTTOM + 2,
              left: 0,
              right: width,
              obstacles: [...LEFT_TICKS.map((v) => tick(String(v), x0 - AXIS.gap, ys(v), "end")), ...RIGHT_TICKS.map((v) => tick(`${v}%`, x1 + AXIS.gap, yr(v), "start"))],
            },
          );
          const labelFont = fonts.num(700, LABEL_SIZE);
          return (
            <Group>
              <Grid ys={LEFT_TICKS.slice(1).map(ys)} x1={x0} x2={x1} />
              <DashLine x1={x0} x2={x1} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} color={k.grid} width={GRID.width} />
              {/* Axes: Strain's ticks on the left in its orange, Recovery's on the right in their bands' colours. */}
              {LEFT_TICKS.map((v) => (
                <SText key={v} x={x0 - AXIS.gap} y={ys(v) + AXIS.fontSize * 0.35} text={String(v)} font={tickFont} color={c.strain} anchor="end" />
              ))}
              <RightAxis x={x1} ys={RIGHT_TICKS.map(yr)} texts={rightTexts} font={tickFont} color={RIGHT_TICKS.map((v) => BAND_TEXT[recoveryBand(v)])} />
              {rows.map((r, i) => {
                const f = r.today ? fonts.sans(700, AXIS.fontSize) : fonts.sans(500, AXIS.fontSize);
                const color = r.today ? k.axisStrong : k.axis;
                const first = PLOT_BOTTOM + AXIS.tickMargin + AXIS.fontSize;
                return (
                  <Group key={r.day}>
                    <SText x={cx(i)} y={first} text={r.weekday} font={f} color={color} anchor="middle" />
                    <SText x={cx(i)} y={first + AXIS.fontSize * 1.4} text={r.dayOfMonth} font={r.today ? fonts.num(700, AXIS.fontSize) : fonts.num(500, AXIS.fontSize)} color={color} anchor="middle" />
                  </Group>
                );
              })}
              {/* Recovery's bars: capsule tops on the baseline, today's at full colour, the rest at 35 %. */}
              {rows.map((r, i) => {
                if (r.recovery === null) return null;
                const top = yr(Math.max(0, r.recovery));
                const d = barPath(cx(i) - barW / 2, top, barW, Math.max(0, PLOT_BOTTOM - top), barRadius(barW));
                return d ? <Path key={`b${r.day}`} path={sp(d)} color={BAND_FILL[recoveryBand(r.recovery)]} opacity={r.today ? 1 : k.dim} /> : null;
              })}
              {/* Strain's smooth line, then its ringed dots, then every label over everything, so nothing strikes a label. */}
              <Group>
                {runs(str).map((run, j) => (
                  <Path key={`s${j}`} path={sp(monotonePath(run))} style="stroke" strokeWidth={LINE.width} strokeJoin="round" strokeCap="round" color={c.strain} />
                ))}
                {rows.map((r, i) => {
                  const q = str[i];
                  return q && r.strain !== null ? <PointMark key={`sd${i}`} cx={q.x} cy={q.y} fill={c.strain} r={r.today ? 4 : 3.5} ring={2} /> : null;
                })}
                {rows.map((r, i) => {
                  const q = rec[i];
                  const y = labels[i].a;
                  return q && r.recovery !== null && y !== null ? (
                    <SText key={`rl${i}`} x={q.x} y={y + LABEL_SIZE * 0.35} text={`${Math.round(r.recovery)}%`} font={labelFont} color={BAND_TEXT[recoveryBand(r.recovery)]} anchor="middle" halo={k.card} opacity={r.today ? 1 : 0.85} />
                  ) : null;
                })}
                {rows.map((r, i) => {
                  const q = str[i];
                  const y = labels[i].b;
                  return q && r.strain !== null && y !== null ? (
                    <SText key={`sl${i}`} x={q.x} y={y + LABEL_SIZE * 0.35} text={formatValue("decimal1", r.strain)} font={labelFont} color={c.strain} anchor="middle" halo={k.card} />
                  ) : null;
                })}
              </Group>
            </Group>
          );
        }}
      </ChartFigure>
      <Legend />
    </View>
  );
}

export function StrainRecoveryChartSkeleton() {
  const c = useCalm();
  return <Skeleton radius={14} style={{ height: H, backgroundColor: alpha(c.line, 0.6) }} />;
}
StrainRecoveryChart.Skeleton = StrainRecoveryChartSkeleton;
