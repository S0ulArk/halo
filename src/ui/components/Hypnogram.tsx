import * as React from "react";
import { Group, LinearGradient, Path, RoundedRect, vec } from "@shopify/react-native-skia";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { DATA_COLORS } from "@/lib/bands";
import { hourStepFor, spacedLabels } from "@/lib/chartmath";
import { hourTicks, scaleLinear, STAGE_LANE, STAGES, type Stage, type StageSegment } from "@/lib/charts";
import { clock, durationWords } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import {
  barPath,
  CapsText,
  capsWidth,
  ChartFigure,
  DashLine,
  GRID_DOT,
  measure,
  pastel,
  ScrubBars,
  ScrubCursor,
  ScrubLabel,
  sp,
  SText,
  toPaths,
  useChartFonts,
  useChartInk,
  useScrubArmed,
  type ChartFonts,
  type Scrub,
  type ScrubBarLayer,
} from "./ChartFrame";
import { EmptyState } from "./EmptyState";
import { MetricState } from "./MetricState";
import { ReasonPlaceholder } from "./ReasonPlaceholder";
import { Skeleton } from "./Skeleton";

export type HypnogramNight = {
  bed: number;
  wake: number;
  segments: StageSegment[];
};
export type HypnogramProps = {
  /** null or no segments: the night has no stage data (Fitbit only stages sleeps over about 3 h). */
  data: Metric<HypnogramNight> | null | undefined;
  timeZone?: string;
  /** A tap opens the explorer on the night. */
  onPress?: () => void;
};

const STAGE_NAME: Record<Stage, string> = {
  awake: "Awake",
  rem: "REM",
  light: "Light",
  deep: "Deep",
};
/** Lanes top to bottom, as the Google Health app draws the night: awake at the top, deepest at the bottom. */
const LANE_STAGE: Stage[] = ["awake", "rem", "light", "deep"];
const H = 214;
const RIGHT = 10;
/** The band over the lanes the scrub readout sits in. */
const TOP = 28;
const LANE_GAP = 6;
/** Under the lanes: the clock times, then BED and WAKE under the night's two ends. */
const AXIS_H = 40;
const PLOT_BOTTOM = H - AXIS_H;
const TIME_BASE = PLOT_BOTTOM + 18;
const CAPS_BASE = PLOT_BOTTOM + 33;
/** Hour labels keep this far apart (a clock time is about 30 px at 12 px). */
const TICK_MIN = 46;

/** Index of the segment under time `t` (sorted, non-overlapping segments), or the nearest one. */
function segmentAt(starts: readonly number[], ends: readonly number[], t: number): number {
  "worklet";
  const n = starts.length;
  if (!n) return -1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  // Between two stretches (a gap Fitbit left unstaged): the nearer one.
  if (t > ends[lo] && lo + 1 < n && starts[lo + 1] - t < t - ends[lo]) return lo + 1;
  return lo;
}

/** The lanes' left edge: room for the widest stage name in caps, right-aligned 10 px off the lanes. */
const laneLeft = (fonts: ChartFonts) => Math.max(52, Math.ceil(Math.max(...LANE_STAGE.map((s) => capsWidth(fonts.sans(700, 11), STAGE_NAME[s])))) + 16);

/** The lanes and each stretch's block at a width: shared by the drawing, the scrub and the lit stretch. */
function layoutOf(segs: readonly StageSegment[], bed: number, wake: number, width: number, x0: number) {
  const x1 = width - RIGHT;
  const laneH = (PLOT_BOTTOM - TOP - LANE_GAP * 3) / 4;
  const laneTop = (st: Stage) => TOP + (3 - STAGE_LANE[st]) * (laneH + LANE_GAP);
  const x = scaleLinear([bed, wake], [x0, x1]);
  // Each stretch's block: its lane, rounded as far as its width allows.
  const blocks = segs.map((s) => {
    const left = x(s.start);
    const w = Math.max(1.5, x(s.end) - left);
    return { left, w, top: laneTop(s.stage), r: Math.min(6, w / 2, laneH / 2) };
  });
  return { x1, laneH, laneTop, x, blocks };
}

/** The scrubbed stretch at full colour over the soft blocks: one path per stretch, built at the first scrub. */
function LitStretch({ active, width, segs, bed, wake, x0, colors }: { active: SharedValue<number>; width: number; segs: readonly StageSegment[]; bed: number; wake: number; x0: number; colors: readonly string[] }) {
  const armed = useScrubArmed(active);
  const layers = React.useMemo<ScrubBarLayer[] | null>(() => {
    if (!armed) return null;
    const { laneH, blocks } = layoutOf(segs, bed, wake, width, x0);
    return [{ paths: toPaths(blocks.map((b) => barPath(b.left, b.top, b.w, laneH, b.r, b.r))), colors }];
  }, [armed, segs, bed, wake, width, x0, colors]);
  if (!layers) return null;
  return <ScrubBars active={active} width={width} height={H} layers={layers} />;
}

/**
 * The night as a stepped hypnogram, as the Google Health app shows it: one lane per stage (Awake, REM, Light, Deep), each
 * stretch a rounded block in its stage's colour in its lane, a thin step line joining each stretch to the next, dotted
 * hour guides, and the bed and wake times at the two ends. A drag lights the stretch under the finger and names it with
 * its times ("REM · 23 minutes", "02:14–02:37"); a tap opens the explorer.
 */
export function HypnogramChart({ night, timeZone: tz, onPress }: { night: HypnogramNight; timeZone?: string; onPress?: () => void }) {
  const { c } = useTheme();
  const k = useChartInk();
  const fonts = useChartFonts();
  const color = React.useCallback((st: Stage) => c[DATA_COLORS[`stage-${st}`].fill], [c]);
  const { segs, starts, ends, summary } = React.useMemo(() => {
    const sorted = [...night.segments].sort((a, b) => a.start - b.start);
    const total = sorted.reduce((a, s) => a + (s.end - s.start), 0);
    const minutes = (st: Stage) => sorted.filter((s) => s.stage === st).reduce((a, s) => a + s.end - s.start, 0) / 60_000;
    return {
      segs: sorted,
      starts: sorted.map((s) => s.start),
      ends: sorted.map((s) => s.end),
      summary: `Sleep stages from ${clock(night.bed, tz)} to ${clock(night.wake, tz)}, ${sorted.length} stretches: ${STAGES.map(
        (s) => `${STAGE_NAME[s]} ${durationWords(minutes(s))}, ${Math.round(((minutes(s) * 60_000) / (total || 1)) * 100)} percent`,
      ).join("; ")}.`,
    };
  }, [night, tz]);
  const X0 = React.useMemo(() => (fonts ? laneLeft(fonts) : 56), [fonts]);

  // One readout per stretch ("REM · 23 minutes", "02:14–02:37"), measured once.
  const readout = React.useMemo(() => {
    if (!fonts) return null;
    const font = fonts.num(700, 12);
    const labelFont = fonts.num(500, 12);
    const texts = segs.map((s) => `${STAGE_NAME[s.stage]} · ${durationWords(Math.max(1, Math.round((s.end - s.start) / 60_000)))}`);
    const labels = segs.map((s) => `${clock(s.start, tz)}–${clock(s.end, tz)}`);
    return {
      font,
      labelFont,
      texts,
      widths: texts.map((t) => measure(font, t)),
      labels,
      labelWidths: labels.map((t) => measure(labelFont, t)),
      colors: segs.map((s) => color(s.stage)),
    };
  }, [fonts, segs, tz, color]);

  const active = useSharedValue(-1);
  const toIndex = React.useCallback(
    (px: number, width: number) => {
      "worklet";
      const x1 = width - RIGHT;
      if (x1 <= X0) return -1;
      const t = night.bed + ((Math.min(Math.max(px, X0), x1) - X0) / (x1 - X0)) * (night.wake - night.bed);
      return segmentAt(starts, ends, t);
    },
    [night.bed, night.wake, starts, ends, X0],
  );
  const scrub = React.useMemo<Scrub>(() => ({ active, toIndex }), [active, toIndex]);

  const frame = (width: number) => layoutOf(segs, night.bed, night.wake, width, X0);

  return (
    <ChartFigure
      height={H}
      summary={summary}
      scrub={scrub}
      deps={[night, tz, c, k, X0]}
      drawIn={night.bed}
      onPress={onPress}
      overlay={({ width }) => {
        if (!readout) return null;
        const { x, laneTop, laneH } = frame(width);
        const xs = segs.map((s) => (x(s.start) + x(s.end)) / 2);
        const ys = segs.map((s) => laneTop(s.stage) + laneH / 2);
        return (
          <>
            <LitStretch active={active} width={width} segs={segs} bed={night.bed} wake={night.wake} x0={X0} colors={readout.colors} />
            <ScrubCursor active={active} xs={xs} ys={ys} colors={readout.colors} top={TOP} bottom={PLOT_BOTTOM} />
            <ScrubLabel
              active={active}
              xs={xs}
              texts={readout.texts}
              widths={readout.widths}
              labels={readout.labels}
              labelWidths={readout.labelWidths}
              y={TOP - 14}
              minX={0}
              maxX={width}
              font={readout.font}
              labelFont={readout.labelFont}
              color={k.ink}
            />
          </>
        );
      }}
    >
      {({ width, fonts: f }) => {
        const { x1, laneH, laneTop, x, blocks } = frame(width);
        const axis = f.num(500, 12);
        const edgeFont = f.num(700, 12);
        const capsFont = f.sans(700, 11);
        const lanesTop = TOP;
        // Bed and wake pinned at the two ends; whole hours between them, every second or third hour on a long night,
        // each kept only where its label clears the others.
        const bedText = clock(night.bed, tz);
        const wakeText = clock(night.wake, tz);
        const bedW = Math.max(measure(edgeFont, bedText), capsWidth(capsFont, "Bed"));
        const wakeW = Math.max(measure(edgeFont, wakeText), capsWidth(capsFont, "Wake"));
        const hours = hourTicks(night.bed, night.wake, hourStepFor(night.wake - night.bed, x1 - X0, TICK_MIN), tz);
        const hourX = hours.map((t) => x(t));
        const hourText = hours.map((t) => clock(t, tz));
        const keep = spacedLabels(
          hourX,
          hourText.map((t) => measure(axis, t)),
          [
            [X0, X0 + bedW],
            [x1 - wakeW, x1],
          ],
          10,
        );
        // The step line: along each stretch's lane centre, straight down or up into the next one.
        let step = "";
        segs.forEach((s, i) => {
          const y = laneTop(s.stage) + laneH / 2;
          const joined = i > 0 && s.start - segs[i - 1].end <= 60_000;
          step += `${joined ? "L" : "M"}${x(s.start).toFixed(2)} ${y.toFixed(2)}H${x(s.end).toFixed(2)}`;
        });
        return (
          <Group>
            {/* Each lane a soft pill of its stage's colour, named in that colour on the left: the legend is the chart. */}
            {LANE_STAGE.map((st) => (
              <Group key={st}>
                <RoundedRect x={X0} y={laneTop(st)} width={x1 - X0} height={laneH} r={Math.min(10, laneH / 2)} color={alpha(color(st), 0.07)} />
                <CapsText x={X0 - 10} y={laneTop(st) + laneH / 2 + 11 * 0.35} text={STAGE_NAME[st]} font={f.sans(700, 11)} color={color(st)} anchor="end" />
              </Group>
            ))}
            {/* Dotted guides at the labelled hours, through the lanes. */}
            {hourX.map((hx, i) => (keep[i] ? <DashLine key={hours[i]} x1={hx} x2={hx} y1={lanesTop} y2={PLOT_BOTTOM} color={k.grid} dash={[0, GRID_DOT.gap]} width={GRID_DOT.size} round /> : null))}
            <Path path={sp(step)} style="stroke" strokeWidth={1.5} strokeJoin="round" color={alpha(k.ink, 0.28)} />
            {/* The stretches: rounded blocks in their stage's colour, a touch deeper at the foot. */}
            {segs.map((s, i) => {
              const b = blocks[i];
              const col = color(s.stage);
              return (
                <RoundedRect key={`s${s.start}`} x={b.left} y={b.top} width={b.w} height={laneH} r={b.r}>
                  <LinearGradient start={vec(0, b.top)} end={vec(0, b.top + laneH)} colors={[pastel(col, k, 0.82), pastel(col, k, 0.7)]} />
                </RoundedRect>
              );
            })}
            {/* The axis: bed and wake bold at the ends with BED and WAKE under them, the hours between. */}
            <SText x={X0} y={TIME_BASE} text={bedText} font={edgeFont} color={k.axisStrong} />
            <CapsText x={X0} y={CAPS_BASE} text="Bed" font={capsFont} color={k.faint} />
            <SText x={x1} y={TIME_BASE} text={wakeText} font={edgeFont} color={k.axisStrong} anchor="end" />
            <CapsText x={x1} y={CAPS_BASE} text="Wake" font={capsFont} color={k.faint} anchor="end" />
            {hourX.map((hx, i) => (keep[i] ? <SText key={hours[i]} x={hx} y={TIME_BASE} text={hourText[i]} font={axis} color={k.axis} anchor="middle" /> : null))}
          </Group>
        );
      }}
    </ChartFigure>
  );
}

/** Last night's stages, one row per stage, as the Google Health app shows them (spec §5.6). */
export function Hypnogram({ data, timeZone, onPress }: HypnogramProps) {
  const empty = <EmptyState body="No stage data for this night. Fitbit only stages sleeps longer than about 3 hours." />;
  return (
    <MetricState metric={data} skeleton={<HypnogramSkeleton />} empty={empty} renderReason={(r) => <ReasonPlaceholder reason={r} size="md" />}>
      {(night) => (night.segments.length ? <HypnogramChart night={night} timeZone={timeZone} onPress={onPress} /> : empty)}
    </MetricState>
  );
}

export function HypnogramSkeleton() {
  const c = useCalm();
  return <Skeleton radius={14} style={{ height: H, backgroundColor: alpha(c.line, 0.6) }} />;
}
Hypnogram.Skeleton = HypnogramSkeleton;
