import * as React from "react";
import { View } from "react-native";
import { Group, Path, RoundedRect } from "@shopify/react-native-skia";
import { recoveryBand } from "@/lib/bands";
import { monotonePath, runs, scaleLinear, type XY } from "@/lib/charts";
import { formatDay, formatValue } from "@/lib/format";
import { labelWidth, placeDotLabels, type Box } from "@/lib/labels";
import { alpha, mix } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { AXIS, ChartFigure, Grid, LINE, PointMark, sp, SText, useChartInk } from "./ChartFrame";
import { Skeleton } from "./Skeleton";
import { Txt } from "./Text";

export type StrainRecoveryPoint = { day: string; strain: number | null; recovery: number | null };

const RIGHT_TICKS = [0, 33, 66, 100];
const LEFT_TICKS = [0, 7, 14, 21];
/** How far today's lit column runs below the plot, behind the 40 px two-line day tick, with room under the date. */
const TODAY_TAIL = 48;
const H = 232;
const X_AXIS_H = 40;

type Row = StrainRecoveryPoint & { weekday: string; dayOfMonth: string; today: boolean };

/** The two series by name and axis under the plot: Strain's peach line on the left axis, Recovery's dots on the right. */
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
          <View style={{ position: "absolute", width: 16, height: 2.5, borderRadius: 1.25, backgroundColor: calm.tintInk.peach }} />
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: calm.tintInk.peach }} />
        </View>,
        "Strain",
        "0–21, left",
      )}
      {item(
        <View style={{ width: 16, height: 8, justifyContent: "center", alignItems: "center" }}>
          <View style={{ position: "absolute", width: 16, height: 2, borderRadius: 1, backgroundColor: alpha(calm.tintInk.mint, 0.4) }} />
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.recoveryGreen }} />
        </View>,
        "Recovery",
        "%, right",
      )}
    </View>
  );
}

/**
 * Home's "Strain & Recovery" week: Strain on the left axis (0-21, Strain's peach ink), Recovery on the right (0-100 %,
 * band colours on Recovery's soft mint line), dots ringed in the card colour with value labels, today's column a soft
 * orange wash. Missing days are gaps, never interpolated. The week draws in left to right; a tap opens the explorer
 * comparing the two.
 */
export function StrainRecoveryChart({ points, today, onPress }: { points: StrainRecoveryPoint[]; today: string; onPress?: () => void }) {
  const { c } = useTheme();
  const calm = useCalm();
  const k = useChartInk();
  const strainInk = calm.tintInk.peach;
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
          const x0 = 4 + 24;
          const x1 = width - 4 - 40;
          const plotTop = 20;
          const plotBottom = H - (TODAY_TAIL - 40 + 2) - X_AXIS_H;
          const ys = scaleLinear([0, 21], [plotBottom, plotTop]);
          const yr = scaleLinear([0, 100], [plotBottom, plotTop]);
          const bandW = (x1 - x0) / Math.max(1, rows.length);
          const cx = (i: number) => x0 + (i + 0.5) * bandW;
          const colW = bandW * 0.64;
          // Today's labels sit on the lit column: their halo is the column's tone over the card.
          const litHalo = mix(k.orange, k.card, 0.1);
          const rec: (XY | null)[] = rows.map((r, i) => (r.recovery === null ? null : { x: cx(i), y: yr(r.recovery) }));
          const str: (XY | null)[] = rows.map((r, i) => (r.strain === null ? null : { x: cx(i), y: ys(r.strain) }));
          // Value labels: each day's two on opposite sides of their dots; where two would touch at this width, the less
          // important one goes (today's stay, then each series' high and low). They clear the axis ticks and day labels.
          const tick = (text: string, x: number, y: number, anchor: "start" | "end"): Box => {
            const w = labelWidth(text, 12);
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
              fontSize: 12,
              top: 2,
              bottom: plotBottom + 2,
              left: 0,
              right: width,
              obstacles: [...LEFT_TICKS.map((v) => tick(String(v), x0 - AXIS.tickMargin, ys(v), "end")), ...RIGHT_TICKS.map((v) => tick(`${v}%`, x1 + AXIS.tickMargin, yr(v), "start"))],
            },
          );
          const tickFont = fonts.num(600, 12);
          const labelFont = fonts.num(700, 12);
          return (
            <Group>
              <Grid ys={LEFT_TICKS.map(ys)} x1={x0} x2={x1} />
              {/* Today's column: a soft orange wash ("this one") behind both series, running down behind the day ticks (spec §11 F9). */}
              {rows.map((r, i) => (r.today ? <RoundedRect key={r.day} x={cx(i) - colW / 2} y={plotTop} width={colW} height={plotBottom - plotTop + TODAY_TAIL} r={Math.min(12, colW / 2)} color={alpha(k.orange, 0.1)} /> : null))}
              {/* Axes */}
              {LEFT_TICKS.map((v) => (
                <SText key={v} x={x0 - AXIS.tickMargin} y={ys(v) + 12 * 0.32} text={String(v)} font={tickFont} color={strainInk} anchor="end" />
              ))}
              {RIGHT_TICKS.map((v) => (
                <SText key={v} x={x1 + AXIS.tickMargin} y={yr(v) + 12 * 0.32} text={`${v}%`} font={tickFont} color={BAND_TEXT[recoveryBand(v)]} />
              ))}
              {rows.map((r, i) => {
                const font = fonts.num(r.today ? 700 : 500, 12);
                const color = r.today ? k.axisStrong : k.axis;
                const first = plotBottom + 4 + 4 + 12 * 0.71;
                return (
                  <Group key={r.day}>
                    <SText x={cx(i)} y={first} text={r.weekday} font={font} color={color} anchor="middle" />
                    <SText x={cx(i)} y={first + 12 * 1.35} text={r.dayOfMonth} font={font} color={color} anchor="middle" />
                  </Group>
                );
              })}
              {/* The smooth lines, then the ringed dots over them, then the value labels over everything, so a line never strikes a label. */}
              <Group>
                {runs(rec).map((run, j) => (
                  <Path key={`r${j}`} path={sp(monotonePath(run))} style="stroke" strokeWidth={LINE.thin} strokeJoin="round" strokeCap="round" color={alpha(calm.tintInk.mint, 0.4)} />
                ))}
                {runs(str).map((run, j) => (
                  <Path key={`s${j}`} path={sp(monotonePath(run))} style="stroke" strokeWidth={LINE.width} strokeJoin="round" strokeCap="round" color={strainInk} />
                ))}
                {rows.map((r, i) => {
                  const q = rec[i];
                  return q && r.recovery !== null ? <PointMark key={`rd${i}`} cx={q.x} cy={q.y} fill={BAND_FILL[recoveryBand(r.recovery)]} r={3.5} ring={1.5} color={r.today ? litHalo : k.card} /> : null;
                })}
                {rows.map((r, i) => {
                  const q = str[i];
                  return q && r.strain !== null ? <PointMark key={`sd${i}`} cx={q.x} cy={q.y} fill={strainInk} r={3.5} ring={1.5} color={r.today ? litHalo : k.card} /> : null;
                })}
                {rows.map((r, i) => {
                  const q = rec[i];
                  const y = labels[i].a;
                  return q && r.recovery !== null && y !== null ? (
                    <SText key={`rl${i}`} x={q.x} y={y + 12 * 0.35} text={`${Math.round(r.recovery)}%`} font={labelFont} color={BAND_TEXT[recoveryBand(r.recovery)]} anchor="middle" halo={r.today ? litHalo : k.card} />
                  ) : null;
                })}
                {rows.map((r, i) => {
                  const q = str[i];
                  const y = labels[i].b;
                  return q && r.strain !== null && y !== null ? (
                    <SText key={`sl${i}`} x={q.x} y={y + 12 * 0.35} text={formatValue("decimal1", r.strain)} font={labelFont} color={strainInk} anchor="middle" halo={r.today ? litHalo : k.card} />
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
