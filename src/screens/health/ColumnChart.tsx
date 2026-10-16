// Category columns (steps by hour, the weekday pattern, weekly totals against a target; metric detail, spec §11 MD1),
// ported from the web's Recharts ColumnChart, in the Apple Health chart language: capsule-topped bars in Activity's
// blue (the highlighted ones in full and the rest at 35 % when some are highlighted), dashed hairline rows with the
// value axis on the right, the labels under the plot, a target as a dashed guide with its pill at the plot's right
// end. The bars rise from the floor once as the chart mounts; a finger scrubs a soft column with the bar's readout.
import * as React from "react";
import { Group, Path } from "@shopify/react-native-skia";
import { niceTicks, scaleLinear } from "@/lib/charts";
import { formatValue, type FormatKey } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { Skeleton, useTheme } from "@/ui";
import { useCalm } from "@/ui/calm";
import {
  AXIS,
  barPath,
  barRadius,
  ChartFigure,
  Grid,
  GuideLine,
  measure,
  Pill,
  RightAxis,
  ScrubBand,
  ScrubBars,
  ScrubLabel,
  sp,
  SText,
  textWidth,
  toPaths,
  useBandScrub,
  useChartFonts,
  useChartInk,
  useScrubArmed,
  type Scrub,
  type ScrubBarLayer,
} from "@/ui/components/ChartFrame";

export type Column = {
  /** Axis label ("06:00", "Mon", "Sep 21"). */
  label: string;
  /** Tooltip heading; defaults to `label`. */
  title?: string;
  value: number | null;
  /** The column the card is about (the best weekday, a week on target): full colour; the rest muted. */
  highlight?: boolean;
};

export type ColumnChartProps = {
  /** The figure's spoken summary. */
  summary: string;
  data: Column[];
  format: FormatKey;
  unit?: string;
  /** Show every `tickEvery`-th label (hours: 6). */
  tickEvery?: number;
  /** A dashed target line ("2:30"). */
  reference?: { y: number; label: string };
};

const H = 176;
const X0 = 4;

/** The Calm column at a width: rounded top (a full capsule while thin) from `top` down to `bottom`. */
function columnD(x: number, w: number, top: number, bottom: number) {
  const r = barRadius(w);
  return barPath(x, top, w, Math.max(0, bottom - top), r, w <= 12 ? r : 0);
}

/** The plot's box and scales at a width (`gutter` is the value axis on the right), shared by the drawing and the scrub layers. */
function frameOf(n: number, max: number, gutter: number, width: number) {
  const x1 = width - gutter;
  const plotTop = 8;
  const plotBottom = H - AXIS.xAxisHeight;
  const band = (x1 - X0) / Math.max(1, n);
  return { x1, plotTop, plotBottom, band, barW: Math.min(24, band * 0.6), y: scaleLinear([0, max], [plotBottom, plotTop]), cx: (i: number) => X0 + (i + 0.5) * band };
}

/** Each column's path at a width (null: no value). */
function columnsOf(data: Column[], max: number, gutter: number, width: number) {
  const { plotBottom, barW, y, cx } = frameOf(data.length, max, gutter, width);
  return data.map((d, i) => (d.value === null || plotBottom - y(d.value) <= 0 ? null : columnD(cx(i) - barW / 2, barW, y(d.value), plotBottom)));
}

/** The scrubbed column at full ink over the dimmed ones (built at the first scrub, then once per data and width). */
function ScrubColumns({ scrub, data, max, gutter, color, width }: { scrub: Scrub; data: Column[]; max: number; gutter: number; color: string; width: number }) {
  const armed = useScrubArmed(scrub.active);
  const layers = React.useMemo<ScrubBarLayer[] | null>(() => {
    if (!armed) return null;
    const ds = columnsOf(data, max, gutter, width);
    return [{ paths: toPaths(ds), colors: ds.map(() => color) }];
  }, [armed, data, max, gutter, width, color]);
  if (!layers) return null;
  return <ScrubBars active={scrub.active} width={width} height={H} layers={layers} />;
}

/**
 * The columns. Columns with `highlight` take the data colour in full and the rest sit at 35 %; when none is highlighted
 * every column does. A finger over the plot shows the column's title and value (the web's tooltip), on the UI thread.
 */
export function ColumnChart({ summary, data, format, unit, tickEvery = 1, reference }: ColumnChartProps) {
  const { c } = useTheme();
  const calm = useCalm();
  const k = useChartInk();
  const fonts = useChartFonts();
  // Activity's ink: the highlighted columns (or all, when none is) at full ink, the rest dimmed.
  const ink = calm.tintInk.sky;
  const any = data.some((d) => d.highlight);
  const unitText = unit ? (unit === "%" ? "%" : ` ${unit}`) : "";
  const max = Math.max(0, ...data.map((d) => d.value ?? 0), reference?.y ?? 0) || 1;
  const ticks = niceTicks(0, max, 3);
  const tickText = ticks.map((v) => formatValue(format, v));
  // The value axis on the right: as wide as its widest label, the gap and air.
  const gutter = Math.max(...tickText.map(textWidth)) + AXIS.gap + 2;
  const scrub = useBandScrub(X0, gutter, data.length);
  // Each column's tooltip, precomputed so the scrub only picks one.
  const tips = React.useMemo(() => {
    if (!fonts) return null;
    const font = fonts.num(700, 12);
    const labelFont = fonts.num(500, 12);
    const texts = data.map((d) => (d.value === null ? "No data" : `${formatValue(format, d.value)}${unitText}`));
    const labels = data.map((d) => d.title ?? d.label);
    return { font, labelFont, texts, widths: texts.map((t) => measure(font, t)), labels, labelWidths: labels.map((t) => measure(labelFont, t)) };
  }, [fonts, data, format, unitText]);

  const frame = (width: number) => frameOf(data.length, max, gutter, width);

  return (
    <ChartFigure
      height={H}
      summary={summary}
      scrub={scrub}
      deps={[data, format, unit, tickEvery, reference?.y, reference?.label, c, k, ink, gutter]}
      drawIn={summary}
      reveal="rise"
      underlay={({ width }) => {
        const { band, plotTop, plotBottom } = frame(width);
        return <ScrubBand active={scrub.active} x0={X0} bandW={band} top={plotTop} bottom={plotBottom} />;
      }}
      overlay={({ width }) => {
        if (!tips) return null;
        const { cx, plotTop } = frame(width);
        return (
          <>
            {any && <ScrubColumns scrub={scrub} data={data} max={max} gutter={gutter} color={ink} width={width} />}
            <ScrubLabel
              active={scrub.active}
              xs={data.map((_, i) => cx(i))}
              texts={tips.texts}
              widths={tips.widths}
              labels={tips.labels}
              labelWidths={tips.labelWidths}
              y={plotTop + 11}
              minX={2}
              maxX={width - 2}
              font={tips.font}
              labelFont={tips.labelFont}
              color={k.ink}
            />
          </>
        );
      }}
    >
      {({ width, fonts: f }) => {
        const { x1, plotBottom, y, cx } = frame(width);
        const ds = columnsOf(data, max, gutter, width);
        const axis = f.num(500, AXIS.fontSize);
        return (
          <Group>
            <Grid ys={ticks.map(y)} x1={X0} x2={x1} />
            <RightAxis x={x1} ys={ticks.map(y)} texts={tickText} font={axis} />
            {ds.map((col, i) => (col ? <Path key={i} path={sp(col)} color={ink} opacity={!any || data[i].highlight ? 1 : k.dim} /> : null))}
            {data.map((d, i) =>
              i % tickEvery === 0 ? <SText key={`t${i}`} x={cx(i)} y={plotBottom + AXIS.tickMargin + AXIS.fontSize} text={d.label} font={axis} color={k.axis} anchor="middle" /> : null,
            )}
            {reference && (
              <Group>
                <GuideLine x1={X0} x2={x1} y1={y(reference.y)} y2={y(reference.y)} />
                {/* The target's pill at the plot's right end, on its line. */}
                <Pill x={x1 - Math.max(textWidth(reference.label) - 6, measure(f.num(700, 11), reference.label)) - 12} y={y(reference.y)} text={reference.label} />
              </Group>
            )}
          </Group>
        );
      }}
    </ChartFigure>
  );
}

export function ColumnChartSkeleton() {
  const { c } = useTheme();
  return <Skeleton radius={10} style={{ height: H, backgroundColor: alpha(c.muted, 0.6) }} />;
}
