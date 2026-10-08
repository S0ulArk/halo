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
  labelGutter,
  measure,
  Pill,
  ScrubBand,
  ScrubBars,
  ScrubLabel,
  sp,
  SText,
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
const X0 = 12;

/** The Calm column at a width: rounded top (a full capsule while thin) from `top` down to `bottom`. */
function columnD(x: number, w: number, top: number, bottom: number) {
  const r = barRadius(w);
  return barPath(x, top, w, Math.max(0, bottom - top), r, w <= 12 ? r : 0);
}

/** The plot's box and scales at a width, shared by the drawing and the scrub layers. */
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
 * Category columns: steps by hour, the weekday pattern, weekly totals against a target (metric detail, spec §11 MD1),
 * ported from the web's Recharts ColumnChart. Columns with `highlight` take the data colour; when none is highlighted
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
  const gutter = labelGutter([reference?.label], 12);
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
      deps={[data, format, unit, tickEvery, reference?.y, reference?.label, c, k, ink]}
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
        const { x1, plotTop, plotBottom, barW, y, cx } = frame(width);
        const ds = columnsOf(data, max, gutter, width);
        return (
          <Group>
            <Grid ys={niceTicks(0, max, 3).filter((v) => v > 0).map(y)} x1={X0} x2={x1} />
            {data.map((d, i) => {
              const x = cx(i) - barW / 2;
              const col = ds[i];
              return (
                <Group key={i}>
                  {/* A soft full-height track behind each column, so the scale reads without a y-axis. */}
                  <Path path={sp(columnD(x, barW, plotTop, plotBottom))} color={k.wash} />
                  {col && <Path path={sp(col)} color={ink} opacity={!any || d.highlight ? 1 : k.dim} />}
                </Group>
              );
            })}
            {data.map((d, i) =>
              i % tickEvery === 0 ? <SText key={`t${i}`} x={cx(i)} y={plotBottom + AXIS.tickMargin + 12} text={d.label} font={f.num(500, 12)} color={k.axis} anchor="middle" /> : null,
            )}
            {reference && (
              <Group>
                <GuideLine x1={X0} x2={x1} y1={y(reference.y)} y2={y(reference.y)} />
                <Pill x={x1 + 4} y={y(reference.y)} text={reference.label} />
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
