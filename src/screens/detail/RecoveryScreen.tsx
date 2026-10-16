// Recovery `/recovery?d=` (spec §7.2), ported from the web's src/app/(app)/recovery/page.tsx, in Apple Health's look:
// the big ring hero lit by its band's colour with the band word ("Ready") and the day's one-line explanation, "What
// shaped it" as an inset grouped list (each signal's coloured icon square, today against your normal, the value and a
// chevron to its history), the week as rounded band-coloured bars against a dashed grid with the average marked, then
// how much each signal moved the score, the trend over months and tomorrow's forecast.
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { Activity, BedDouble, Heart, Thermometer, Wind, type LucideIcon } from "lucide-react-native";
import { DATA_COLORS, recoveryBand, recoveryColor } from "@/lib/bands";
import { formatDay, formatValue, type FormatKey } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { getRecovery, type Contributor, type RecoveryVM } from "@/queries";
import { useQuery } from "@/state/app";
import { ContributorRow, DriverList, EmptyState, ReasonPlaceholder, SectionShell, TrendChart, Txt, useTheme, type TrendPoint, type TrendRange } from "@/ui";
import { useCalm } from "@/ui/calm";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { HaloRing } from "@/ui/components/Halo";
import { MetricTags } from "@/ui/components/primitives";
import { font, TABULAR } from "@/ui/fonts";
import { useOpenChart } from "@/screens/chart/href";
import { dayHref } from "@/lib/day";
import { SLEEP_TAB } from "@/screens/home/tabs";
import { Sentence } from "./calmKit";
import { Anchor, DetailScreen, LoadError, useAnchors } from "./DetailScreen";
import { RECOVERY_INFO } from "./info";
import { ListGroup, useGrowIn } from "./ios";
import { useBack, useDayNav, usePush, useRefresh } from "./nav";
import { recoveryInks, ScoreHero } from "./ScoreHero";
import { recoverySkeleton } from "./skeletons";
import { trendProps } from "./view";

const ICON: Record<Contributor["key"], LucideIcon> = { hrv: Activity, rhr: Heart, resp: Wind, sleep: BedDouble, skinTemp: Thermometer };
/** Each signal's icon square, in Apple Health's colours: HRV blue, heart pink, breathing teal, sleep indigo, temperature orange. */
const SQUARE: Record<Contributor["key"], "blue" | "pink" | "teal" | "indigo" | "orange"> = { hrv: "blue", rhr: "pink", resp: "teal", sleep: "indigo", skinTemp: "orange" };
const FORMAT: Record<Contributor["key"], FormatKey> = { hrv: "int", rhr: "int", resp: "decimal1", sleep: "int", skinTemp: "signed1" };
/** The chart each contributor opens (sleep opens the Sleep tab instead). */
const CONTRIBUTOR_CHART: Record<Exclude<Contributor["key"], "sleep">, string> = { hrv: "hrv", rhr: "rhr", resp: "resp", skinTemp: "skin_temp" };

export default function RecoveryScreen() {
  const { d, today, switcher } = useDayNav();
  const onBack = useBack();
  const { refreshing, onRefresh, retry } = useRefresh();
  const anchors = useAnchors();
  const openChart = useOpenChart();
  const push = usePush();
  // The trend's range is the page's (the web keeps it in `?r=`): W retitles the card "Weekly trends".
  const [range, setRange] = React.useState<TrendRange>("m");
  const q = useQuery((ctx) => getRecovery(d, ctx), [d], `recovery:${d}`);
  const vm = q.data?.day === d ? q.data : undefined;

  const common = { title: "Recovery", info: RECOVERY_INFO, onBack, dateSwitcher: switcher(!!q.data && !vm), notch: true, refreshing, onRefresh, anchors } as const;
  if (q.error && !vm) return <DetailScreen {...common} notch={false} primary={<LoadError onRetry={retry} />} />;
  if (!vm) return <DetailScreen {...common} {...recoverySkeleton()} />;

  const r = vm.recovery;
  const trend = trendProps(vm.trend);
  const dParam = d === today ? undefined : d;
  // Each contributor opens its own history: its chart, or the Sleep tab for the night behind it.
  const openContributor = (key: Contributor["key"]) => (key === "sleep" ? push(dayHref(SLEEP_TAB, d, today)) : openChart({ metric: CONTRIBUTOR_CHART[key], r: "m", d: dParam }));
  return (
    <DetailScreen
      {...common}
      hero={<ScoreHero variant="recovery" value={r.value} reason={r.reason} nightsLeft={r.nightsLeft} provisional={r.provisional} tags={r.tags} sentence={vm.insight} />}
      summary={
        <Anchor anchors={anchors} id="drivers">
          <WhatShapedIt vm={vm} nightsLeft={r.nightsLeft} onOpen={openContributor} />
        </Anchor>
      }
      primary={<RecoveryWeek points={trend.data.value} day={d} onPress={() => openChart({ metric: "recovery", r: "w", d: dParam })} />}
      secondary={[
        <SectionShell key="effect" variant="card" title="Effect on Recovery" accent="recovery">
          <Effect vm={vm} />
        </SectionShell>,
        <SectionShell key="trend" variant="card" title={range === "w" ? "Weekly trends" : "Recovery trend"} action={<ExpandButton onPress={() => openChart({ metric: "recovery", r: range, d: dParam })} />}>
          <TrendChart label="Recovery" unit="%" format="int" colorBy="band" direction="up" today={today} range={range} onRangeChange={setRange} onPress={(rr) => openChart({ metric: "recovery", r: rr, d: dParam })} {...trend} />
        </SectionShell>,
        <Forecast key="forecast" vm={vm} />,
      ]}
    />
  );
}

/** "What shaped it": each signal as a grouped list row, today against your normal, opening its history. */
function WhatShapedIt({ vm, nightsLeft, onOpen }: { vm: RecoveryVM; nightsLeft?: number; onOpen: (key: Contributor["key"]) => void }) {
  const c = useCalm();
  return (
    <ListGroup title="What shaped it" footer="Dot: today. Shaded: your normal range.">
      {vm.contributors.map((x) => {
        // A contributor without a usable baseline (calibrating) reads as its reason rather than a bare number.
        const metric = x.baseline || x.metric.value === null ? x.metric : { value: null, reason: "calibrating" as const, provisional: false, nightsLeft };
        const reason = metric.reason && metric.reason !== "no_data" ? reasonCopy(metric.reason, metric.nightsLeft ?? nightsLeft).long : undefined;
        const Icon = ICON[x.key];
        return (
          <ContributorRow
            key={x.key}
            variant="recovery"
            icon={<Icon size={18} color="#ffffff" strokeWidth={2.2} />}
            color={c.system[SQUARE[x.key]]}
            label={x.label}
            unit={x.unit}
            format={FORMAT[x.key]}
            metric={metric}
            baseline={x.baseline ?? { mean: 0, sd: 1 }}
            points={x.points}
            direction={x.direction}
            reasonCopy={reason}
            onPress={() => onOpen(x.key)}
          />
        );
      })}
    </ListGroup>
  );
}

/** How many points each signal moved the score, as a diverging chart. */
function Effect({ vm }: { vm: RecoveryVM }) {
  const m = vm.drivers;
  if (m.value === null && m.reason === "calibrating") return <EmptyState body="No drivers yet: Recovery needs 7 nights first." />;
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />;
  return <DriverList variant="recovery" unit="pts" data={m} inCard />;
}

// ── The week ─────────────────────────────────────────────────────────────────

/** The plot's height, its right axis and the bars' width (whole capsules). */
const WEEK_H = 120;
const AXIS_W = 28;
const BAR_W = 18;
const GRID = [0, 33, 67, 100] as const;

/**
 * The last seven days as Apple Health's week: rounded bars in their band's colour (the past at 45 %, the day shown at
 * full), dashed rules at 0, 33, 67 and 100 with the axis on the right, the week's average a dashed line with its pill,
 * the weekday letters under the bars. The bars grow up from the floor once, staggered, on the UI thread (a scale).
 */
function RecoveryWeek({ points, day, onPress }: { points: TrendPoint[] | null; day: string; onPress: () => void }) {
  const { c } = useTheme();
  const calm = useCalm();
  const [width, setWidth] = React.useState(0);
  const week = (points ?? []).filter((p) => p.date <= day).slice(-7);
  const values = week.flatMap((p) => (p.value === null ? [] : [p.value]));
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const green = values.filter((v) => recoveryBand(v) === "green").length;
  const plotW = Math.max(0, width - AXIS_W);
  const y = (v: number) => WEEK_H - (Math.min(100, Math.max(0, v)) / 100) * WEEK_H;
  const pitch = week.length > 1 ? (plotW - BAR_W) / (week.length - 1) : 0;
  const summary = `Recovery this week${avg === null ? ": no scores yet" : `: average ${Math.round(avg)} percent, ${green} ${green === 1 ? "day" : "days"} green`}. ${week
    .map((p) => `${formatDay(p.date, { weekday: "long" })} ${p.value === null ? "no score" : `${Math.round(p.value)} percent`}`)
    .join(", ")}.`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${summary} Opens the chart`}>
      <View style={{ borderRadius: 20, backgroundColor: calm.card, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 14 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: 12, rowGap: 2 }}>
          <Txt size={17} lineHeight={22} weight={600} style={{ color: calm.ink }}>
            This week
          </Txt>
          {avg !== null && (
            <Txt size={13} lineHeight={18} style={[TABULAR, { color: calm.sub }]}>
              {`Avg ${Math.round(avg)}% · ${green} ${green === 1 ? "day" : "days"} green`}
            </Txt>
          )}
        </View>
        <View importantForAccessibility="no-hide-descendants" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: WEEK_H + 26 }}>
          {width > 0 && (
            <>
              <Svg width={width} height={WEEK_H + 2} style={{ position: "absolute", top: 0, left: 0 }}>
                {GRID.map((t) => (
                  <Line key={t} x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={calm.line} strokeWidth={0.8} strokeDasharray={[2, 4]} />
                ))}
                {avg !== null && <Line x1={0} x2={plotW} y1={y(avg)} y2={y(avg)} stroke={alpha(calm.ink, 0.55)} strokeWidth={1.2} strokeDasharray={[4, 3]} />}
              </Svg>
              {GRID.map((t) => (
                <Txt key={t} size={11} lineHeight={14} style={[TABULAR, { position: "absolute", left: plotW + 6, top: y(t) - 7, color: calm.sub }]}>
                  {String(t)}
                </Txt>
              ))}
              {week.map((p, i) => (
                <WeekBar
                  key={p.date}
                  index={i}
                  left={i * pitch}
                  top={p.value === null ? WEEK_H : y(p.value)}
                  color={p.value === null ? "transparent" : c[DATA_COLORS[recoveryColor(p.value)].fill]}
                  opacity={i === week.length - 1 ? 1 : 0.45}
                />
              ))}
              {avg !== null && (
                <View style={{ position: "absolute", left: 2, top: Math.max(0, y(avg) - 21), height: 18, borderRadius: 9, paddingHorizontal: 8, justifyContent: "center", backgroundColor: calm.chip === calm.card ? calm.ground : calm.chip }}>
                  <Txt size={11} lineHeight={14} weight={600} style={[TABULAR, { color: calm.ink }]}>{`Avg ${Math.round(avg)}%`}</Txt>
                </View>
              )}
              {week.map((p, i) => (
                <Txt key={p.date} size={12} lineHeight={16} weight={i === week.length - 1 ? 700 : 600} align="center" style={{ position: "absolute", top: WEEK_H + 8, left: i * pitch - 6, width: BAR_W + 12, color: i === week.length - 1 ? calm.ink : calm.sub }}>
                  {formatDay(p.date, { weekday: "narrow" })}
                </Txt>
              ))}
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** One day's bar: a whole capsule from the floor to its score, growing up from the floor once (scaleY on the UI thread). */
function WeekBar({ index, left, top, color, opacity }: { index: number; left: number; top: number; color: string; opacity: number }) {
  const grow = useGrowIn(index);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));
  const h = Math.max(0, WEEK_H - top);
  if (h <= 0) return null;
  return <Animated.View style={[{ position: "absolute", left, top, width: BAR_W, height: h, borderRadius: BAR_W / 2, backgroundColor: color, opacity, transformOrigin: "bottom" }, anim]} />;
}

// ── Tomorrow ─────────────────────────────────────────────────────────────────

/** Tomorrow's estimate: a ring in its band's colour with the number in it, the likely range, then what it rests on. */
function Forecast({ vm }: { vm: RecoveryVM }) {
  const { c } = useTheme();
  const calm = useCalm();
  const f = vm.forecast;
  return (
    <SectionShell variant="card" title="Tomorrow’s forecast" accent="recovery">
      {f.value === null ? (
        <ReasonPlaceholder reason={f.reason} nightsLeft={f.nightsLeft} size="sm" copy={f.reason === "calibrating" ? "Forecast starts after 14 nights." : undefined} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <HaloRing size={76} progress={f.value.value / 100} stroke={8} track={alpha(recoveryInks(c, calm, f.value.value).fill, 0.18)} color={recoveryInks(c, calm, f.value.value).fill}>
            <View accessible accessibilityLabel={`Tomorrow ${formatValue("int", f.value.value)} percent, estimate, likely ${formatValue("int", f.value.low)} to ${formatValue("int", f.value.high)} percent`} style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Txt size={22} lineHeight={26} style={[font.numberAt(22, 800), { color: calm.ink }]}>
                {formatValue("int", f.value.value)}
              </Txt>
              <Txt size={12} lineHeight={16} weight={600} style={{ color: calm.sub }}>
                %
              </Txt>
            </View>
          </HaloRing>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <Txt size={17} lineHeight={22} weight={600} style={{ color: recoveryInks(c, calm, f.value.value).ink }}>
                {`Likely ${formatValue("int", f.value.low)}–${formatValue("int", f.value.high)}%`}
              </Txt>
              <MetricTags extra={["estimate"]} align="flex-start" />
            </View>
            <Sentence size={13}>Estimate. Based on today’s strain and your recent trend.</Sentence>
          </View>
        </View>
      )}
    </SectionShell>
  );
}
