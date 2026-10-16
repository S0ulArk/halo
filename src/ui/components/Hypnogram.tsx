// The night's sleep stages as Apple Health draws them: four lanes (Awake, REM, Light, Deep) named on the left in their
// colours, each stretch a solid rounded block in its lane, a thin connector in the two stages' colours from each block
// to the next, dashed hairline rules between the lanes, the hours under them with bed and wake at the two ends, and
// the night's total in each stage underneath. Drawn once with Skia; a scrub outlines the stretch under the finger.
import * as React from "react";
import { View } from "react-native";
import { Canvas, Group, LinearGradient, Path, RoundedRect, Skia, vec, type SkPath } from "@shopify/react-native-skia";
import { useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import { DATA_COLORS } from "@/lib/bands";
import { hourStepFor, spacedLabels } from "@/lib/chartmath";
import { hourTicks, scaleLinear, STAGE_LANE, STAGES, type Stage, type StageSegment } from "@/lib/charts";
import { clock, durationWords, hmm } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import {
  AXIS,
  barPath,
  CapsText,
  capsWidth,
  ChartFigure,
  DashLine,
  GRID,
  hourText,
  measure,
  ScrubCursor,
  ScrubLabel,
  sp,
  SText,
  useChartFonts,
  useChartInk,
  useScrubArmed,
  type ChartFonts,
  type Scrub,
} from "./ChartFrame";
import { EmptyState } from "./EmptyState";
import { MetricState } from "./MetricState";
import { ReasonPlaceholder } from "./ReasonPlaceholder";
import { Skeleton } from "./Skeleton";
import { Txt } from "./Text";

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

/** The stages' names. Health Connect's light sleep is Apple's "Core"; the app calls it Light everywhere. */
export const STAGE_NAME: Record<Stage, string> = {
  awake: "Awake",
  rem: "REM",
  light: "Light",
  deep: "Deep",
};
/** Lanes top to bottom, as Apple Health draws the night: awake at the top, deepest at the bottom. */
const LANE_STAGE: Stage[] = ["awake", "rem", "light", "deep"];
/** The band over the lanes the scrub readout sits in. */
const TOP = 28;
/** Each lane's pitch and the block inside it (centred, so the rules between lanes keep clear of the blocks). */
const LANE = 38;
const BLOCK = 24;
const LANES_BOTTOM = TOP + 4 * LANE;
/** Under the lanes: the clock times, then BED and WAKE under the night's two ends. */
const AXIS_H = 40;
const H = LANES_BOTTOM + AXIS_H;
const TIME_BASE = LANES_BOTTOM + 18;
const CAPS_BASE = LANES_BOTTOM + 33;
const RIGHT = 4;
/** Hour labels keep this far apart. */
const TICK_MIN = 34;
/** The narrowest block: an Awake minute still shows as a sliver. */
const MIN_BLOCK = 2.5;
/** The legend under the chart: one row of stage totals. */
const LEGEND_H = 44;

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

/** The lane names' font: the label face at 12 px, semibold, in each stage's colour. */
const laneFont = (fonts: ChartFonts) => fonts.sans(600, 12);
/** The lanes' left edge: room for the widest stage name, 10 px off the lanes. */
const laneLeft = (fonts: ChartFonts) => Math.max(40, Math.ceil(Math.max(...LANE_STAGE.map((s) => measure(laneFont(fonts), STAGE_NAME[s])))) + 10);

/** The lanes and each stretch's block at a width: shared by the drawing, the scrub and the outlined stretch. */
function layoutOf(segs: readonly StageSegment[], bed: number, wake: number, width: number, x0: number) {
  const x1 = width - RIGHT;
  const laneTop = (st: Stage) => TOP + (3 - STAGE_LANE[st]) * LANE;
  const blockTop = (st: Stage) => laneTop(st) + (LANE - BLOCK) / 2;
  const x = scaleLinear([bed, wake], [x0, x1]);
  // Each stretch's block: its lane, rounded as far as its width allows.
  const blocks = segs.map((s) => {
    const left = x(s.start);
    const w = Math.max(MIN_BLOCK, x(s.end) - left);
    return { left, w, top: blockTop(s.stage), r: Math.min(5, w / 2) };
  });
  return { x1, laneTop, blockTop, x, blocks };
}

const NO_PATH = Skia.Path.Make();

/** The scrubbed stretch outlined in the ink over the chart: one path per stretch, built at the first scrub, picked on the UI thread. */
function LitStretch({ active, width, segs, bed, wake, x0, color }: { active: SharedValue<number>; width: number; segs: readonly StageSegment[]; bed: number; wake: number; x0: number; color: string }) {
  const armed = useScrubArmed(active);
  const paths = React.useMemo<(SkPath | null)[] | null>(() => {
    if (!armed) return null;
    const { blocks } = layoutOf(segs, bed, wake, width, x0);
    return blocks.map((b) => Skia.Path.MakeFromSVGString(sp(barPath(b.left - 2, b.top - 2, b.w + 4, BLOCK + 4, b.r + 2, b.r + 2))));
  }, [armed, segs, bed, wake, width, x0]);
  const path = useDerivedValue(() => (paths ? (paths[active.value] ?? NO_PATH) : NO_PATH));
  if (!paths) return null;
  return (
    <Canvas pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height: H }}>
      <Path path={path} style="stroke" strokeWidth={2} color={color} />
    </Canvas>
  );
}

/** A stage's total as Apple Health prints it: "1:38" from an hour, "22" with a small "m" under one. */
function Duration({ minutes }: { minutes: number }) {
  const c = useCalm();
  const m = Math.max(0, Math.round(minutes));
  return (
    <Txt size={18} lineHeight={22} color={c.ink} style={font.numeric(700)}>
      {m >= 60 ? hmm(m) : String(m)}
      {m < 60 && (
        <Txt size={12} lineHeight={20} weight={600} color={c.sub}>
          m
        </Txt>
      )}
    </Txt>
  );
}

/** The night's total in each stage, in the lanes' order: a dot and the name in the stage's colour over the time. */
function StageTotals({ minutes, color }: { minutes: Record<Stage, number>; color: (st: Stage) => string }) {
  const c = useCalm();
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ marginTop: 6, minHeight: LEGEND_H, flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
      {LANE_STAGE.map((st) => (
        <View key={st} style={{ width: "25%", minWidth: 72, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color(st) }} />
            <Txt size={12} lineHeight={16} weight={600} color={c.sub}>
              {STAGE_NAME[st]}
            </Txt>
          </View>
          <Duration minutes={minutes[st]} />
        </View>
      ))}
    </View>
  );
}

/**
 * The night as Apple Health's stages chart: one lane per stage (Awake, REM, Light, Deep) named on the left in its
 * colour, each stretch a solid rounded block in its lane, a thin connector from each block to the next shaded from
 * one stage's colour to the other's, dashed rules between the lanes and at the labelled hours, and the bed and wake
 * times at the two ends. Under it, the night's total in each stage (`legend`, on by default). A drag outlines the
 * stretch under the finger and names it with its times ("REM · 23 minutes", "02:14–02:37"); a tap opens the explorer.
 */
export function HypnogramChart({ night, timeZone: tz, onPress, legend = true }: { night: HypnogramNight; timeZone?: string; onPress?: () => void; legend?: boolean }) {
  const { c } = useTheme();
  const k = useChartInk();
  const fonts = useChartFonts();
  const color = React.useCallback((st: Stage) => c[DATA_COLORS[`stage-${st}`].fill], [c]);
  const { segs, starts, ends, minutes, summary } = React.useMemo(() => {
    const sorted = [...night.segments].sort((a, b) => a.start - b.start);
    const total = sorted.reduce((a, s) => a + (s.end - s.start), 0);
    const mins = Object.fromEntries(STAGES.map((st) => [st, sorted.filter((s) => s.stage === st).reduce((a, s) => a + s.end - s.start, 0) / 60_000])) as Record<Stage, number>;
    return {
      segs: sorted,
      starts: sorted.map((s) => s.start),
      ends: sorted.map((s) => s.end),
      minutes: mins,
      summary: `Sleep stages from ${clock(night.bed, tz)} to ${clock(night.wake, tz)}, ${sorted.length} stretches: ${STAGES.map(
        (s) => `${STAGE_NAME[s]} ${durationWords(mins[s])}, ${Math.round(((mins[s] * 60_000) / (total || 1)) * 100)} percent`,
      ).join("; ")}.`,
    };
  }, [night, tz]);
  const X0 = React.useMemo(() => (fonts ? laneLeft(fonts) : 48), [fonts]);

  // One readout per stretch ("REM · 23 minutes", "02:14–02:37"), measured once.
  const readout = React.useMemo(() => {
    if (!fonts) return null;
    const f = fonts.num(700, 12);
    const labelFont = fonts.num(500, 12);
    const texts = segs.map((s) => `${STAGE_NAME[s.stage]} · ${durationWords(Math.max(1, Math.round((s.end - s.start) / 60_000)))}`);
    const labels = segs.map((s) => `${clock(s.start, tz)}–${clock(s.end, tz)}`);
    return {
      font: f,
      labelFont,
      texts,
      widths: texts.map((t) => measure(f, t)),
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
    <View>
      <ChartFigure
        height={H}
        summary={summary}
        scrub={scrub}
        deps={[night, tz, c, k, X0]}
        drawIn={night.bed}
        onPress={onPress}
        overlay={({ width }) => {
          if (!readout) return null;
          const { x, blockTop } = frame(width);
          const xs = segs.map((s) => (x(s.start) + x(s.end)) / 2);
          const ys = segs.map((s) => blockTop(s.stage) + BLOCK / 2);
          return (
            <>
              <ScrubCursor active={active} xs={xs} ys={ys} colors={readout.colors} top={TOP} bottom={LANES_BOTTOM} dot={false} />
              <LitStretch active={active} width={width} segs={segs} bed={night.bed} wake={night.wake} x0={X0} color={k.ink} />
              <ScrubLabel
                active={active}
                xs={xs}
                texts={readout.texts}
                widths={readout.widths}
                labels={readout.labels}
                labelWidths={readout.labelWidths}
                y={TOP - 15}
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
          const { x1, blockTop, x, blocks } = frame(width);
          const axis = f.num(500, AXIS.fontSize);
          const edgeFont = f.num(600, AXIS.fontSize);
          const capsFont = f.sans(700, 10);
          // Bed and wake pinned at the two ends; whole hours between them, every second or third hour on a long night,
          // each kept only where its label clears the others.
          const bedText = clock(night.bed, tz);
          const wakeText = clock(night.wake, tz);
          const bedW = Math.max(measure(edgeFont, bedText), capsWidth(capsFont, "Bed"));
          const wakeW = Math.max(measure(edgeFont, wakeText), capsWidth(capsFont, "Wake"));
          const hours = hourTicks(night.bed, night.wake, hourStepFor(night.wake - night.bed, x1 - X0, TICK_MIN), tz);
          const hourX = hours.map((t) => x(t));
          const hourLabels = hours.map((t) => hourText(t, tz));
          const keep = spacedLabels(
            hourX,
            hourLabels.map((t) => measure(axis, t)),
            [
              [X0, X0 + bedW],
              [x1 - wakeW, x1],
            ],
            8,
          );
          return (
            <Group>
              {/* Each lane named on the left in its stage's colour: the legend is the chart. */}
              {LANE_STAGE.map((st) => (
                <SText key={st} x={X0 - 10} y={blockTop(st) + BLOCK / 2 + 12 * 0.35} text={STAGE_NAME[st]} font={laneFont(f)} color={color(st)} anchor="end" />
              ))}
              {/* Dashed hairline rules between the lanes, and at the labelled hours through them. */}
              {[1, 2, 3].map((i) => (
                <DashLine key={`l${i}`} x1={X0} x2={x1} y1={TOP + i * LANE} y2={TOP + i * LANE} color={k.grid} dash={GRID.dash} width={GRID.width} />
              ))}
              {hourX.map((hx, i) => (keep[i] ? <DashLine key={hours[i]} x1={hx} x2={hx} y1={TOP} y2={LANES_BOTTOM} color={k.grid} dash={GRID.dash} width={GRID.width} /> : null))}
              {/* The connectors: at each change of stage, a thin rule from one block's middle to the next one's, shaded from one colour to the other (behind the blocks). */}
              {segs.map((s, i) => {
                if (i === 0) return null;
                const prev = segs[i - 1];
                if (s.start - prev.end > 60_000 || prev.stage === s.stage) return null;
                const y0 = blockTop(prev.stage) + BLOCK / 2;
                const y1 = blockTop(s.stage) + BLOCK / 2;
                const cx = x(s.start);
                const top = Math.min(y0, y1);
                return (
                  <RoundedRect key={`c${s.start}`} x={cx - 0.75} y={top} width={1.5} height={Math.abs(y1 - y0)} r={0.75}>
                    <LinearGradient start={vec(0, y0)} end={vec(0, y1)} colors={[alpha(color(prev.stage), 0.75), alpha(color(s.stage), 0.75)]} />
                  </RoundedRect>
                );
              })}
              {/* The stretches: solid rounded blocks in their stage's colour. */}
              {segs.map((s, i) => {
                const b = blocks[i];
                return <RoundedRect key={`s${s.start}`} x={b.left} y={b.top} width={b.w} height={BLOCK} r={b.r} color={color(s.stage)} />;
              })}
              {/* The axis: bed and wake at the ends with BED and WAKE under them, the hours between. */}
              <SText x={X0} y={TIME_BASE} text={bedText} font={edgeFont} color={k.axisStrong} />
              <CapsText x={X0} y={CAPS_BASE} text="Bed" font={capsFont} color={k.axis} />
              <SText x={x1} y={TIME_BASE} text={wakeText} font={edgeFont} color={k.axisStrong} anchor="end" />
              <CapsText x={x1} y={CAPS_BASE} text="Wake" font={capsFont} color={k.axis} anchor="end" />
              {hourX.map((hx, i) => (keep[i] ? <SText key={hours[i]} x={hx} y={TIME_BASE} text={hourLabels[i]} font={axis} color={k.axis} anchor="middle" /> : null))}
            </Group>
          );
        }}
      </ChartFigure>
      {legend && <StageTotals minutes={minutes} color={color} />}
    </View>
  );
}

/** Last night's stages, one lane per stage, as Apple Health shows them (spec §5.6). */
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
  return <Skeleton radius={14} style={{ height: H + 6 + LEGEND_H, backgroundColor: alpha(c.line, 0.6) }} />;
}
Hypnogram.Skeleton = HypnogramSkeleton;
