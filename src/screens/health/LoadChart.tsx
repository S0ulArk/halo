// Fitness (CTL), fatigue (ATL) and form (TSB) over 90 days (spec §7.10), ported from Pulse's health/fitness/LoadChart.tsx
// (a Recharts ComposedChart) onto the kit's Skia chart pieces: form as thin bars around a zero line, fitness as a line
// with a fading area, fatigue as a thinner line. A finger over the plot shows that day's three values (UI thread).
import * as React from "react";
import { View } from "react-native";
import { Canvas, Group, Path, RoundedRect, Shadow, Text as SkText } from "@shopify/react-native-skia";
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";
import { areaPath, monotonePath, niceTicks, runs, scaleLinear, type XY } from "@/lib/charts";
import { DAY, formatDay, formatValue } from "@/lib/format";
import type { FitnessVM } from "@/queries";
import { Txt, useTheme } from "@/ui";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { AXIS, barPath, ChartFigure, FadeShader, Grid, GuideLine, LINE, PointMark, ScrubCursor, sp, SText, useBandScrub, useChartInk, useScrubArmed, type ChartFonts } from "@/ui/components/ChartFrame";

const H = 220;
const LABEL = { ctl: "Fitness", atl: "Fatigue", tsb: "Form" } as const;
const TIP_W = 112;

type Load = FitnessVM["load"];

/** The Calm series colours: fitness in the orange highlight, fatigue in navy, form in mint (fresh) or sand (fatigued). */
const loadInk = (c: CalmPalette) => ({ ctl: c.orange, atl: c.navy, fresh: c.tintInk.mint, tired: c.tintInk.sand });

/** Each series' mark as drawn (two lines, then the bars) with today's value, in the plot's order. */
function Legend({ last }: { last: Load[number] }) {
  const ink = loadInk(useCalm());
  const items = [
    { k: "ctl", mark: <View style={{ height: 3, width: 14, borderRadius: 1.5, backgroundColor: ink.ctl }} />, v: formatValue("int", last.ctl) },
    { k: "atl", mark: <View style={{ height: 3, width: 14, borderRadius: 1.5, backgroundColor: ink.atl }} />, v: formatValue("int", last.atl) },
    { k: "tsb", mark: <View style={{ height: 10, width: 4, borderRadius: 2, backgroundColor: ink.fresh }} />, v: formatValue("signedInt", last.tsb) },
  ] as const;
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 20, rowGap: 4 }}>
      {items.map((it) => (
        <View key={it.k} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {it.mark}
          <Txt role="caption">
            {LABEL[it.k]}{" "}
            <Txt role="numericSmall" weight={600} color="foregroundSecondary">
              {it.v}
            </Txt>
          </Txt>
        </View>
      ))}
    </View>
  );
}

/**
 * The scrubbed day's tooltip: a popover box beside the cursor (flipping left near the right edge) with four lines. A
 * small canvas of its own, moved by a transform and redrawn only when the day changes, never the chart.
 */
function LoadTip({ active, xs, x1, top, lines, fonts }: { active: SharedValue<number>; xs: number[]; x1: number; top: number; lines: string[][]; fonts: ChartFonts }) {
  const k = useChartInk();
  const tipH = 12 + 4 * 16;
  const m = 4;
  const mounted = useScrubArmed(active);
  const style = useAnimatedStyle(() => {
    const i = active.value;
    const cx = xs[i] ?? 0;
    return { opacity: i >= 0 ? 1 : 0, transform: [{ translateX: (i < 0 ? -1000 : cx + 12 + TIP_W > x1 ? cx - 12 - TIP_W : cx + 12) - m }] };
  });
  if (!mounted) return null;
  // The Calm readout card: white (a raised chip on dark) with a soft edge, the day in the grey, the values in the ink.
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: top - m, width: TIP_W + 2 * m, height: tipH + 2 * m }, style]}>
      <Canvas style={{ width: TIP_W + 2 * m, height: tipH + 2 * m }}>
        <RoundedRect x={m} y={m} width={TIP_W} height={tipH} r={12} color={k.readout}>
          <Shadow dx={0} dy={1} blur={3} color={k.readoutShadow} />
        </RoundedRect>
        <RoundedRect x={m + 0.5} y={m + 0.5} width={TIP_W - 1} height={tipH - 1} r={11.5} color={k.readoutEdge} style="stroke" strokeWidth={1} />
        {[0, 1, 2, 3].map((j) => (
          <TipLine key={j} active={active} x={m + 10} y={m + 6 + 12 + j * 16 - 3} texts={lines[j]} font={j ? fonts.num(600, 12) : fonts.sans(600, 12)} color={j ? k.ink : k.sub} />
        ))}
      </Canvas>
    </Animated.View>
  );
}

function TipLine({ active, x, y, texts, font, color }: { active: SharedValue<number>; x: number; y: number; texts: string[]; font: ReturnType<ChartFonts["num"]>; color: string }) {
  const text = useDerivedValue(() => texts[active.value] ?? "");
  return <SkText x={x} y={y} text={text} font={font} color={color} />;
}

export function LoadChart({ load }: { load: Load }) {
  const { c } = useTheme();
  const calm = useCalm();
  const k = useChartInk();
  const ink = loadInk(calm);
  const last = [...load].reverse().find((p) => p.ctl !== null);
  const summary = last
    ? `Training load over 90 days: fitness ${formatValue("int", last.ctl)}, fatigue ${formatValue("int", last.atl)}, form ${formatValue("signedInt", last.tsb)} today.`
    : "No training load data yet.";
  const m = React.useMemo(() => {
    // A tick at each month's first day.
    const ticks = load.flatMap((p, i) => (i > 0 && p.day.slice(0, 7) !== load[i - 1].day.slice(0, 7) ? [i] : []));
    const values = load.flatMap((p) => [p.ctl, p.atl, p.tsb]).filter((v): v is number => v !== null);
    const yTicks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
    const lo = Math.min(yTicks[0], ...values);
    const hi = Math.max(yTicks[yTicks.length - 1], ...values, lo + 1);
    // The tooltip's four lines per day, precomputed so a scrub only picks them.
    const lines = [
      load.map((p) => formatDay(p.day, DAY.short)),
      load.map((p) => `${LABEL.ctl}  ${formatValue("int", p.ctl)}`),
      load.map((p) => `${LABEL.atl}  ${formatValue("int", p.atl)}`),
      load.map((p) => `${LABEL.tsb}  ${formatValue("signedInt", p.tsb)}`),
    ];
    return { ticks, yTicks, lo, hi, lines };
  }, [load]);
  const { ticks, yTicks, lo, hi, lines } = m;
  const x0 = 4 + 32;
  // The same 8 px right edge as the other charts, so the latest day never sits flush with the card.
  const scrub = useBandScrub(x0, 8, load.length);

  const frame = (width: number) => {
    const x1 = width - 8;
    const plotTop = 8;
    const plotBottom = H - AXIS.xAxisHeight;
    const band = (x1 - x0) / Math.max(1, load.length);
    const cx = (i: number) => x0 + (i + 0.5) * band;
    const y = scaleLinear([lo, hi], [plotBottom, plotTop]);
    const series = (k: "ctl" | "atl"): (XY | null)[] => load.map((p, i) => (p[k] === null ? null : { x: cx(i), y: y(p[k]!) }));
    return { x1, plotTop, plotBottom, band, cx, y, ctl: series("ctl"), atl: series("atl") };
  };

  return (
    <View>
      <ChartFigure
        height={H}
        summary={summary}
        scrub={scrub}
        deps={[m, c, k]}
        drawIn={load[0]?.day}
        overlay={({ width, fonts }) => {
          const { x1, plotTop, plotBottom, cx, ctl, atl } = frame(width);
          const xs = load.map((_, i) => cx(i));
          return (
            <>
              <ScrubCursor active={scrub.active} xs={xs} ys={ctl.map((q) => q?.y ?? NaN)} colors={load.map(() => ink.ctl)} top={plotTop} bottom={plotBottom} />
              <ScrubCursor active={scrub.active} xs={xs} ys={atl.map((q) => q?.y ?? NaN)} colors={load.map(() => ink.atl)} top={plotTop} bottom={plotBottom} line={false} />
              <LoadTip active={scrub.active} xs={xs} x1={x1} top={plotTop} lines={lines} fonts={fonts} />
            </>
          );
        }}
      >
        {({ width, fonts }) => {
          const { x1, plotTop, plotBottom, band, cx, y, ctl, atl } = frame(width);
          const barW = Math.min(4, band * 0.8);
          const axis = fonts.num(500, 12);
          const lastI = load.length - 1;
          return (
            <Group>
              <Grid ys={yTicks.map(y)} x1={x0} x2={x1} />
              {yTicks.map((v) => (
                <SText key={v} x={x0 - AXIS.tickMargin} y={y(v) + 12 * 0.32} text={formatValue("int", v)} font={axis} color={k.axis} anchor="end" />
              ))}
              {ticks.map((i) => (
                <SText key={i} x={cx(i)} y={plotBottom + AXIS.tickMargin + 12} text={formatDay(load[i].day, { month: "short" })} font={axis} color={k.axis} anchor="middle" />
              ))}
              <GuideLine x1={x0} x2={x1} y1={y(0)} y2={y(0)} />
              <Group>
                {/* Form: thin capsules, sand below zero (fatigue above fitness), else mint; past days dimmed, today at full ink. */}
                {load.map((p, i) =>
                  p.tsb === null || p.tsb === 0 ? null : (
                    <Path
                      key={p.day}
                      path={sp(barPath(cx(i) - barW / 2, Math.min(y(p.tsb), y(0)), barW, Math.abs(y(p.tsb) - y(0)), barW / 2, barW / 2))}
                      color={p.tsb < 0 ? ink.tired : ink.fresh}
                      opacity={i === lastI ? 1 : k.dim}
                    />
                  ),
                )}
                {runs(ctl).map((run, j) => {
                  const d = monotonePath(run);
                  return (
                    <Group key={`c${j}`}>
                      <Path path={sp(areaPath(d, run[0], run[run.length - 1], plotBottom))}>
                        <FadeShader color={ink.ctl} y1={plotTop} y2={plotBottom} />
                      </Path>
                      <Path path={sp(d)} style="stroke" strokeWidth={LINE.width} strokeJoin="round" strokeCap="round" color={ink.ctl} />
                    </Group>
                  );
                })}
                {runs(atl).map((run, j) => (
                  <Path key={`a${j}`} path={sp(monotonePath(run))} style="stroke" strokeWidth={LINE.thin} strokeJoin="round" strokeCap="round" color={ink.atl} />
                ))}
                {/* Today's fitness, ringed in the card colour. */}
                {(() => {
                  const q = [...ctl].reverse().find((v) => v !== null);
                  return q ? <PointMark cx={q.x} cy={q.y} fill={ink.ctl} r={4} ring={2} /> : null;
                })()}
              </Group>
            </Group>
          );
        }}
      </ChartFigure>
      {last && <Legend last={last} />}
    </View>
  );
}
