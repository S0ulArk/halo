// The chart explorer `/chart?metric=&r=&d=&compare=`: one metric full screen over its whole history (W / M / 6M / 1Y /
// All) or one day's minutes, with pinch-zoom and pan, a hold-to-inspect crosshair and readout, the window's average,
// low and high, its normal range and goal, and a second metric on its own axis to compare against. Every chart card
// opens it on its own metric and range. A day shows the metric's own picture of it beside the day's heart rate: Day
// Strain building up, stress or the Energy Bank with heart rate on the right axis; resting and average heart rate as a
// labelled line on the heart rate; workouts lit on it; the night's heart rate over its stage lanes. Calm chrome: the
// window's numbers on a white card, the chart on its own white card, white pills for the metric and compare pickers,
// the range as the kit's teal segmented control.
import * as React from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronsUpDown, Plus, X } from "lucide-react-native";
import { DATA_COLORS, recoveryColor, STRESS_COLOR, stressLevel } from "@/lib/bands";
import { bandColor, type Band } from "@/lib/charts";
import { formatValue, MISSING, type FormatKey } from "@/lib/format";
import { CHART_GROUPS, CHART_METRICS, chartDef, DAY_VIEW, getChartDay, getChartSeries, type ChartDayVM, type ChartDef, type ChartSeriesVM, type DayView } from "@/queries/chart";
import { useApp, useQuery } from "@/state/app";
import { trendGoal, useGoals } from "@/state/goals";
import { accentFamily, Button, DateSwitcher, EmptyState, Ground, HeaderFrame, Skeleton, ToggleGroup, Txt, useTheme, type Tokens } from "@/ui";
import type { CalmPalette } from "@/ui/calm";
import { FAMILY_TINT } from "@/ui/components/calmKit";
import { CALM_RADIUS, Caption, Num, Sentence, useCalm } from "@/screens/settings/calmKit";
import { useChartFonts, wholeTick } from "@/ui/components/ChartFrame";
import { zoneBands } from "@/ui/components/IntradayHrChart";
import { ExplorerChart } from "./ExplorerChart";
import { MetricSheet, type SheetGroup } from "./MetricSheet";
import {
  alignDaily,
  compareDomain,
  compareIndex,
  DAILY_RANGES,
  dailySeries,
  DAY_COMPARE,
  dayCompareView,
  dayReference,
  daySeries,
  dayWhy,
  deltaText,
  drawsBars,
  extentOf,
  gainNotes,
  inWorkouts,
  levelsFor,
  NO_COMPARE,
  noteFor,
  parseRange,
  pointLabels,
  RANGE_ARIA,
  RANGE_LABEL,
  runningStats,
  STAGE_NAME,
  stageNotes,
  summaryOf,
  unitText,
  valueText,
  windowFor,
  windowText,
  workoutNotes,
  workoutWindow,
  yDomain,
  type Range,
  type Series,
  type SeriesColor,
} from "./model";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HINT = "Pinch to zoom · drag to pan · hold to inspect · double-tap to reset";
/** The header's side slots: the back button and the Metric pill, equal so the title stays centred. */
const SIDE = 92;
/** A day view with nothing to draw. */
const EMPTY_DAY: Record<DayView, string> = {
  hr: "No heart rate recorded on this day.",
  strain: "No Strain on this day: too little heart rate was recorded to score it.",
  stress: "No stress readings on this day.",
  energy: "No Energy Bank on this day.",
  sleep: "No night recorded for this day.",
};
/** The compare's short name in the window's numbers ("Avg HR"). */
const SHORT: Record<DayView, string> = { hr: "HR", strain: "strain", stress: "stress", energy: "energy", sleep: "HR" };

type Paint = { line: string; bands: Band[] | null; barColors: string[]; group: (v: number) => number; point: (v: number) => string };

/** How a series is coloured: band and stress metrics by value (a gradient line, bars in three colours), heart rate by zone. */
// Calm inks for the single-hue series (TrendChart's): Strain peach, Sleep lavender, any other metric its family's ink.
// Bands, stress levels and heart-rate zones keep their meaning colours.
function paintOf(colorBy: SeriesColor, c: Tokens, k: CalmPalette, metric: string, zones: ChartDayVM["zones"], view?: DayView): Paint {
  if (colorBy === "band") {
    const bands = [0, 34, 67].map((from) => ({ from, color: c[DATA_COLORS[recoveryColor(from)].fill] }));
    return { line: bands[2].color, bands, barColors: bands.map((b) => b.color), group: (v) => (v >= 67 ? 2 : v >= 34 ? 1 : 0), point: (v) => bandColor(v, bands) };
  }
  if (colorBy === "stress") {
    const bands = [0, 1, 2].map((from) => ({ from, color: c[DATA_COLORS[STRESS_COLOR[stressLevel(from)]].fill] }));
    return { line: bands[1].color, bands, barColors: bands.map((b) => b.color), group: (v) => (v >= 2 ? 2 : v >= 1 ? 1 : 0), point: (v) => bandColor(v, bands) };
  }
  if (colorBy === "zones") {
    const bands = zoneBands(zones.map((z) => ({ zone: z.zone, label: z.label, min: z.min, max: z.max })), c);
    return { line: k.sub, bands: zones.length ? bands : null, barColors: [c.heart], group: () => 0, point: (v) => (zones.length ? bandColor(v, bands) : c.heart) };
  }
  const family = accentFamily(metric);
  const line = view === "sleep" || colorBy === "sleep" ? k.tintInk.lavender : colorBy === "strain" ? k.tintInk.peach : k.tintInk[family ? FAMILY_TINT[family] : "sky"];
  return { line, bands: null, barColors: [line], group: () => 0, point: () => line };
}

/** A compare line's colour: the metric's own hue, unless the primary already wears it. */
function compareColorOf(primary: SeriesColor, compare: SeriesColor, c: Tokens, k: CalmPalette): string {
  const hue = (x: SeriesColor) => (x === "strain" ? k.tintInk.peach : x === "sleep" ? k.tintInk.lavender : x === "band" ? c.recoveryGreen : x === "stress" ? c.stressHigh : x === "zones" ? c.heart : k.tintInk.sky);
  return hue(compare) !== hue(primary) ? hue(compare) : k.orange;
}

const tickText = (format: FormatKey) => (format === "duration" ? (v: number) => formatValue(format, v) : wholeTick((v) => formatValue(format, v)));

/** One of the window's numbers: the value in the numeric face with its unit small beside it, the label under it. */
function Stat({ label, value, format, unit, text }: { label: string; value: number | null | undefined; format: FormatKey; unit?: string; text?: string }) {
  const s = value === undefined ? MISSING : (text ?? formatValue(format, value));
  const has = s !== MISSING && s !== "--" && value !== null;
  return (
    <View accessible accessibilityLabel={`${label}: ${has ? (text ?? valueText(value, format, unit)) : "no data"}`} style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Num value={has ? s : "--"} unit={has && unit ? unitText(unit).trim() : undefined} size={22} />
      <Caption>{label}</Caption>
    </View>
  );
}

/** A legend entry: the series' mark (a line, a dashed line, a block or a dot) and its name. */
function LegendKey({ color, label, mark = "line" }: { color: string; label: string; mark?: "line" | "dash" | "block" | "dot" }) {
  const k = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 24 }}>
      {mark === "line" && <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: color }} />}
      {mark === "dash" && (
        <View style={{ width: 14, flexDirection: "row", justifyContent: "space-between" }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: 3, height: 2, borderRadius: 1, backgroundColor: color }} />
          ))}
        </View>
      )}
      {mark === "block" && <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color }} />}
      {mark === "dot" && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
      <Txt size={13} lineHeight={18} weight={600} style={{ color: k.ink }}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * The explorer's header: back and the Metric pill in equal side slots, the metric's name centred between them (two lines
 * when long), and under it, across the full width, what the chart draws.
 */
function ExplorerHeader({ title, subtitle, onBack, action }: { title: string; subtitle?: string; onBack: () => void; action: React.ReactNode }) {
  const k = useCalm();
  return (
    <HeaderFrame>
      <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
        <View style={{ width: SIDE, alignItems: "flex-start" }}>
          <Button variant="ghost" size="icon-touch" onPress={onBack} accessibilityLabel="Back" style={{ backgroundColor: k.card }}>
            <ChevronLeft size={24} color={k.ink} strokeWidth={2} style={{ marginLeft: -2 }} />
          </Button>
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
          <Txt size={18} lineHeight={24} weight={600} align="center" accessibilityRole="header" style={{ color: k.ink }}>
            {title}
          </Txt>
        </View>
        <View style={{ width: SIDE, alignItems: "flex-end" }}>{action}</View>
      </View>
      {subtitle ? (
        <Txt size={13} lineHeight={18} weight={500} align="center" style={{ color: k.sub, paddingHorizontal: 16, marginTop: -4, paddingBottom: 6 }}>
          {subtitle}
        </Txt>
      ) : null}
    </HeaderFrame>
  );
}

export default function ChartExplorer() {
  const params = useLocalSearchParams<{ metric?: string; r?: string; d?: string; compare?: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const k = useCalm();
  const insets = useSafeAreaInsets();
  const fonts = useChartFonts();
  const { today, sync } = useApp();
  const { goals } = useGoals();

  const def: ChartDef = chartDef(params.metric) ?? CHART_METRICS[0];
  const range: Range = parseRange(typeof params.r === "string" ? params.r : undefined, !!def.day);
  const mode = range === "day" ? "day" : "daily";
  const view = mode === "day" ? def.day! : null;
  const d = typeof params.d === "string" && DAY_RE.test(params.d) && params.d <= today ? params.d : today;
  const rawParam = typeof params.compare === "string" ? params.compare : undefined;
  const rawCompare = chartDef(rawParam);
  const picked = rawCompare && rawCompare.key !== def.key ? rawCompare : null;
  // Daily: any other metric. A day: another of the clock-sharing day views, by default the day's heart rate beside
  // Strain, stress and the Energy Bank ("none" turns that off).
  const cmpView: DayView | null = view ? dayCompareView(view, rawParam === NO_COMPARE ? NO_COMPARE : (picked?.day ?? null)) : null;
  const cmp: ChartDef | null = mode === "daily" ? picked : cmpView ? chartDef(DAY_COMPARE.find((x) => x.view === cmpView)?.key) : null;

  const back = () => (router.canGoBack() ? router.back() : router.replace("/" as Href));
  // Only the keys given change; a null clears that param.
  const setParams = (next: { metric?: string; r?: Range; d?: string; compare?: string | null }) => {
    const out: Record<string, string | undefined> = {};
    for (const [key, val] of Object.entries(next)) out[key] = val === null ? undefined : val;
    router.setParams(out);
  };
  // Clearing the compare: a day view remembers "none" (its default would come back otherwise).
  const clearCompare = () => setParams({ compare: mode === "day" ? NO_COMPARE : null });

  // --- Data ---
  const series = useQuery((ctx) => (mode === "daily" ? getChartSeries(def.key, ctx) : Promise.resolve(null)), [mode, def.key], mode === "daily" ? `chartseries:${def.key}` : undefined);
  const day = useQuery((ctx) => (view ? getChartDay(view, d, ctx) : Promise.resolve(null)), [view, d], view ? `chartday:${view}:${d}` : undefined);
  const cmpSeries = useQuery((ctx) => (mode === "daily" && cmp ? getChartSeries(cmp.key, ctx) : Promise.resolve(null)), [mode, cmp?.key], mode === "daily" && cmp ? `chartseries:${cmp.key}` : undefined);
  const cmpDay = useQuery((ctx) => (mode === "day" && cmpView ? getChartDay(cmpView, d, ctx) : Promise.resolve(null)), [mode, cmpView, d], mode === "day" && cmpView ? `chartday:${cmpView}:${d}` : undefined);
  const dailyVm: ChartSeriesVM | null = mode === "daily" && series.data?.key === def.key ? series.data : null;
  const dayVm: ChartDayVM | null = view && day.data?.view === view && day.data.day === d ? day.data : null;
  const cmpDailyVm = mode === "daily" && cmp && cmpSeries.data?.key === cmp.key ? cmpSeries.data : null;
  const cmpDayVm = mode === "day" && cmpView && cmpDay.data?.view === cmpView && cmpDay.data.day === d ? cmpDay.data : null;
  const error = mode === "daily" ? series.error : day.error;

  const title = view ? DAY_VIEW[view].label : def.label;
  const unit = view ? DAY_VIEW[view].unit : def.unit;
  const format = view ? DAY_VIEW[view].format : def.format;
  const workouts = view === "hr" && def.key === "workouts";

  // --- The model: series, colours, the readout's text ---
  const model = React.useMemo(() => {
    let primary: Series | null = null;
    let compare: Series | null = null;
    let days: string[] | null = null;
    let end = 0;
    let extent: { min: number; max: number; minSpan: number } | null = null;
    if (mode === "daily" && dailyVm) {
      primary = dailySeries(def, dailyVm);
      days = dailyVm.days;
      end = Math.max(0, days.indexOf(d) >= 0 ? days.indexOf(d) : days.length - 1);
      extent = extentOf("daily", primary);
      if (cmp && cmpDailyVm)
        compare = {
          ...dailySeries(cmp, cmpDailyVm),
          xs: primary.xs,
          ys: alignDaily(dailyVm, cmpDailyVm),
          partial: alignDaily(dailyVm, { ...cmpDailyVm, values: cmpDailyVm.partial.map((p) => (p ? 1 : null)) }).map((x) => x === 1),
        };
    } else if (mode === "day" && dayVm && view) {
      primary = daySeries(dayVm, title, unit, format);
      extent = extentOf("day", primary, dayVm.from, dayVm.to);
      // A compare with nothing on this day (no Energy Bank yet) draws no line and no axis.
      if (cmpView && cmpDayVm && cmpDayVm.ys.some((y) => y !== null)) compare = daySeries(cmpDayVm, DAY_VIEW[cmpView].label, DAY_VIEW[cmpView].unit, DAY_VIEW[cmpView].format);
    }
    if (!primary || !extent) return null;
    const paint = paintOf(primary.colorBy, c, k, def.key, dayVm?.zones ?? [], view ?? undefined);
    const comparePaint = compare ? compareColorOf(primary.colorBy, compare.colorBy, c, k) : k.orange;
    // Heart rate beside Day Strain keeps its zone colours (Strain builds only in the zones); beside stress or the Energy
    // Bank it is one quiet colour, so the primary's own colours stay the ones that mean something.
    const compareBands = compare && view === "strain" && cmpView === "hr" && cmpDayVm?.zones.length ? zoneBands(cmpDayVm.zones, c) : null;
    const compareColors = compare && compareBands ? compare.ys.map((v) => (v === null ? comparePaint : bandColor(v, compareBands))) : null;
    const baseline = dailyVm?.baseline ?? null;
    // The shaded range: the normal range (daily), or the day's Strain Target under Day Strain.
    const shade = baseline ? { lo: baseline.mean - baseline.sd, hi: baseline.mean + baseline.sd, label: "Shaded: your normal range" } : view === "strain" && dayVm?.band ? { ...dayVm.band, label: `Shaded: Strain Target ${formatValue("decimal1", dayVm.band.lo)}–${formatValue("decimal1", dayVm.band.hi)}` } : null;
    const goalY = mode === "daily" ? trendGoal(goals, def.key) : null;
    // A heart-rate day draws its metric's own value as a labelled line: the day's resting heart rate, or its average.
    const ref = view === "hr" && dayVm ? dayReference(def.key, dayVm.refs) : null;
    const goal = goalY !== null ? { y: goalY, label: `Goal ${formatValue(format, goalY)}` } : mode === "daily" ? (dailyVm?.reference ?? null) : ref ? { y: ref.y, label: `${ref.label} ${valueText(ref.y, format, unit)}` } : null;
    const cIdx = compare ? compareIndex(mode, primary, compare) : primary.xs.map(() => -1);
    const dates = pointLabels(mode, primary.xs, days, today);
    const values = primary.ys.map((v) => (v === null ? "No data" : valueText(v, format, unit)));
    const compares = compare ? cIdx.map((j) => (j < 0 ? "--" : valueText(compare!.ys[j], compare!.format, compare!.unit))) : [];
    // What a day view says of each point from its own data (else the window's: the normal range, the goal or the average):
    // the night's stage, what Strain gained in the last hour, the workout a minute falls in, or heart rate against the line.
    const refNotes = ref ? primary.ys.map((v) => noteFor(v, format, unit, { reference: ref })) : null;
    const viewNotes: (string | null)[] | null =
      !dayVm || !view
        ? null
        : view === "sleep"
          ? stageNotes(primary.xs, dayVm.stages, dayVm.bed, dayVm.wake)
          : view === "strain"
            ? gainNotes(primary)
            : workouts
              ? workoutNotes(primary.xs, dayVm.spans).map((w, i) => w ?? refNotes?.[i] ?? null)
              : refNotes;
    const colors = primary.ys.map((v) => (v === null ? c.mutedForeground : paint.point(v)));
    // Group 3: today's running total, drawn faded in its own colour.
    const barGroup = primary.ys.map((v, i) => (v === null ? 0 : primary!.partial?.[i] ? 3 : paint.group(v)));
    const partialAt = primary.partial?.findIndex(Boolean) ?? -1;
    const partialColor = partialAt >= 0 && primary.ys[partialAt] !== null ? paint.point(primary.ys[partialAt]!) : null;
    // Day Strain so far is the number this view is about: its latest point is marked with its value.
    let latest: { index: number; text: string } | null = null;
    if (primary.cumulative)
      for (let i = primary.ys.length - 1; i >= 0 && !latest; i--) if (primary.ys[i] !== null) latest = { index: i, text: valueText(primary.ys[i], format, unit) };
    const hot = workouts && dayVm ? inWorkouts(primary.xs, dayVm.spans) : null;
    // A day names both series in the readout; a daily chart leaves the metric to the header and names the compare.
    const names = mode === "day" ? { primary: primary.label, compare: compare?.label ?? null } : compare ? { primary: null, compare: compare.label } : null;
    const home = mode === "day" ? ((workouts && dayVm ? workoutWindow(dayVm.spans, extent) : null) ?? { start: extent.min, span: extent.max - extent.min }) : null;
    const dataKey = `${mode}|${primary.key}|${days?.length ?? primary.xs.length}|${dayVm?.day ?? ""}|${compare?.key ?? ""}|${compare ? compare.ys.length : 0}`;
    return {
      primary,
      compare,
      days,
      end,
      extent,
      home,
      paint,
      comparePaint,
      compareBands,
      compareColors,
      baseline,
      shade,
      goal,
      ref,
      personalGoal: goalY !== null,
      cIdx,
      dates,
      values,
      compares,
      viewNotes,
      colors,
      barGroup,
      partialColor,
      latest,
      hot,
      names,
      dataKey,
      levels: levelsFor(mode, days, extent.min, extent.max),
    };
  }, [mode, dailyVm, dayVm, cmp, cmpView, cmpDailyVm, cmpDayVm, def, d, view, title, unit, format, c, k, goals, today, workouts]);

  // --- The viewport JS knows about: the range's window, then wherever a gesture settled ---
  const home = React.useMemo(() => (!model ? null : (model.home ?? windowFor(range, model.primary, model.end))), [model, range]);
  const viewKey = model ? `${model.dataKey.split("|").slice(0, 4).join("|")}|${range}` : "";
  const [settled, setSettled] = React.useState<{ key: string; start: number; span: number } | null>(null);
  const v = model && home ? (settled && settled.key === viewKey ? settled : { key: viewKey, ...home }) : null;
  const onViewport = React.useCallback((start: number, span: number) => setSettled({ key: viewKey, start, span }), [viewKey]);
  const win = React.useMemo(() => (v ? { start: v.start, span: v.span } : { start: 0, span: 1 }), [v?.start, v?.span]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Axes and summary for the visible window ---
  const axes = React.useMemo(() => {
    if (!model || !v) return null;
    const from = v.start;
    const to = v.start + v.span;
    const bars = drawsBars(model.primary, v.span);
    const extra = [model.goal?.y, model.shade?.lo, model.shade?.hi];
    const domain = yDomain(model.primary, from, to, { bars, extra, count: 5 });
    const domain2 = model.compare ? compareDomain(model.compare, from, to, domain.ticks.length) : null;
    const stats = summaryOf(model.primary, from, to);
    const running = model.primary.cumulative ? runningStats(model.primary, from, to) : null;
    const cStats = model.compare ? summaryOf(model.compare, from, to) : null;
    const yLabels = domain.ticks.map(tickText(format));
    const y2Labels = domain2 && model.compare ? domain2.ticks.map(tickText(model.compare.format)) : [];
    // Each point against the normal range, else the goal, else the window's average (a day view's own note first).
    const basis = { baseline: model.baseline, goal: model.goal && model.personalGoal && !model.baseline ? model.goal.y : null, average: stats.avg };
    const notes = model.primary.ys.map((y, i) => (model.primary.partial?.[i] ? "So far today" : (model.viewNotes?.[i] ?? noteFor(y, format, unit, basis))));
    return { from, to, domain, domain2, stats, running, cStats, yLabels, y2Labels, notes };
  }, [model, v?.start, v?.span, format, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const readout = React.useMemo(
    () => (model && axes ? { dates: model.dates, values: model.values, compares: model.compares, notes: axes.notes, colors: model.colors, compareColors: model.compareColors } : null),
    [model, axes],
  );

  // --- Layout ---
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [sheet, setSheet] = React.useState<"metric" | "compare" | null>(null);
  const ranges: Range[] = def.day ? ["day", ...DAILY_RANGES] : [...DAILY_RANGES];
  const metricGroups: SheetGroup[] = CHART_GROUPS.map((g) => ({ group: g.group, metrics: g.metrics.map((m) => ({ key: m.key, label: m.label })) }));
  const compareGroups: SheetGroup[] =
    mode === "daily"
      ? CHART_GROUPS.map((g) => ({ group: g.group, metrics: g.metrics.filter((m) => m.key !== def.key).map((m) => ({ key: m.key, label: m.label })) })).filter((g) => g.metrics.length)
      : [{ group: "Same day", metrics: DAY_COMPARE.filter((x) => x.view !== view).map((x) => ({ key: x.key, label: DAY_VIEW[x.view].label })) }];
  const canCompare = mode === "daily" || (view !== null && view !== "sleep");
  const empty = model ? model.primary.ys.every((y) => y === null) : false;
  // A day's line beside it (heart rate by default) is waited for, so both draw in together, once.
  const loading = (!model && !error) || (mode === "day" && !!cmpView && !cmpDayVm && !cmpDay.error);

  // A day view draws the metric's own picture of the day beside its heart rate. The header keeps the metric's name and
  // says what is drawn (and what sits beside it), so switching to Day never reads as a different chart.
  // The compare's day loaded with nothing on it: the chart has no second line, so neither does the header.
  const cmpEmpty = !!cmpDayVm && cmpDayVm.ys.every((y) => y === null);
  const subtitle = mode === "daily" ? def.group : view ? dayWhy(view, def.key, cmp && !cmpEmpty ? cmpView : null) : undefined;
  const windowLabel = model && axes ? windowText(mode, axes.from, axes.to, model.days, today) : "";
  const compareName = mode === "day" && cmpView ? DAY_VIEW[cmpView].label : (cmp?.label ?? "");
  const primaryColor = model?.paint.bands ? model.paint.bands[model.paint.bands.length - 1].color : (model?.paint.line ?? k.tintInk.sky);
  const stageColor = { awake: c.stageAwake, rem: c.stageRem, light: c.stageLight, deep: c.stageDeep } as const;

  // The window's numbers: a running total (Day Strain) as where it stood, what it gained and the compare's average;
  // everything else as its average, low and high.
  const stats = !axes ? (
    <>
      <Stat label="Average" value={undefined} format={format} unit={unit} />
      <Stat label="Low" value={undefined} format={format} unit={unit} />
      <Stat label="High" value={undefined} format={format} unit={unit} />
    </>
  ) : axes.running ? (
    <>
      <Stat label="Strain" value={axes.running.end} format={format} unit={unit} />
      <Stat label="Gained" value={axes.running.gained} format={format} unit={unit} text={axes.running.gained === null ? undefined : deltaText(axes.running.gained, format, unit)} />
      {model?.compare && cmpView ? (
        <Stat label={`Avg ${SHORT[cmpView]}`} value={axes.cStats?.avg ?? null} format={model.compare.format} unit={model.compare.unit} />
      ) : (
        <Stat label="Start" value={axes.running.start} format={format} unit={unit} />
      )}
    </>
  ) : (
    <>
      <Stat label="Average" value={axes.stats.avg} format={format} unit={unit} />
      <Stat label="Low" value={axes.stats.min} format={format} unit={unit} />
      <Stat label="High" value={axes.stats.max} format={format} unit={unit} />
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: k.ground }}>
      <Ground />
      <ExplorerHeader
        title={def.label}
        subtitle={subtitle}
        onBack={back}
        action={
          <Pressable
            onPress={() => setSheet("metric")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Metric: ${def.label}. Change metric`}
            style={({ pressed }) => ({ height: 40, paddingHorizontal: 12, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: k.card, opacity: pressed ? 0.8 : 1 })}
          >
            <Txt size={14} lineHeight={18} weight={600} style={{ color: k.ink }}>
              Metric
            </Txt>
            <ChevronsUpDown size={16} color={k.teal} strokeWidth={2} />
          </Pressable>
        }
      />
      <View style={{ flex: 1, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 12), gap: 12 }}>
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <ToggleGroup
            value={range}
            onChange={(r) => setParams({ r })}
            items={ranges.map((r) => ({ value: r, label: RANGE_LABEL[r], accessibilityLabel: RANGE_ARIA[r] }))}
            font="numeric"
            fill
            minItemWidth={36}
            accessibilityLabel="Range"
          />
          {mode === "day" && (
            <View style={{ alignItems: "center" }}>
              <DateSwitcher mode="day" date={d} today={today} firstDay={sync.firstDay} calendar={false} onChange={(next) => setParams({ d: next })} loading={!dayVm && !day.error} />
            </View>
          )}
          {/* The visible window's numbers (refreshed when a gesture settles), on a white card. */}
          <View style={{ borderRadius: CALM_RADIUS, backgroundColor: k.card, paddingHorizontal: 18, paddingVertical: 14, gap: 10 }}>
            <Sentence size={13} weight={500} style={{ fontVariant: ["tabular-nums"] }}>
              {windowLabel || " "}
            </Sentence>
            <View style={{ flexDirection: "row", gap: 12 }}>{stats}</View>
          </View>
        </View>

        {/* The chart on its own white card; it fills the card's width and the height left over. */}
        <View style={{ flex: 1, minHeight: 220, marginHorizontal: 16, borderRadius: CALM_RADIUS, backgroundColor: k.card, overflow: "hidden", paddingVertical: 8 }}>
          <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}>
            {error && !model ? (
              <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
                <EmptyState body="This chart could not load. Pull to refresh on the screen you came from, then try again." />
              </View>
            ) : loading || !fonts || !box.w || !axes || !readout || !model || !home ? (
              <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 4 }}>
                <Skeleton radius={20} style={{ flex: 1, backgroundColor: k.ground }} />
              </View>
            ) : empty ? (
              <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
                <EmptyState body={view ? EMPTY_DAY[view] : `No ${def.label.toLowerCase()} recorded yet.`} />
              </View>
            ) : (
              <ExplorerChart
                width={box.w}
                height={box.h}
                mode={mode}
                primary={model.primary}
                compare={model.compare}
                extent={model.extent}
                window={win}
                home={home}
                domain={axes.domain}
                domain2={axes.domain2}
                yLabels={axes.yLabels}
                y2Labels={axes.y2Labels}
                levels={model.levels}
                baseline={model.shade ? [model.shade.lo, model.shade.hi] : null}
                goal={model.goal}
                spans={dayVm?.spans ?? []}
                emphasis={workouts ? "workouts" : null}
                stages={dayVm?.stages ?? []}
                bed={dayVm?.bed ?? null}
                wake={dayVm?.wake ?? null}
                now={dayVm?.now ?? null}
                readout={readout}
                names={model.names}
                compareIdx={model.cIdx}
                lineColor={model.paint.line}
                bands={model.paint.bands}
                hot={model.hot}
                barGroup={model.barGroup}
                partialColor={model.partialColor}
                barColors={model.paint.barColors}
                compareColor={model.comparePaint}
                compareBands={model.compareBands}
                latest={model.latest}
                dataKey={model.dataKey}
                onViewport={onViewport}
                fonts={fonts}
              />
            )}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {/* The legend: every series and line on the chart by name, then the compare (or the button that adds one). */}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 14, rowGap: 6 }}>
            <LegendKey color={primaryColor} label={title} />
            {model?.ref && model.goal && <LegendKey color={k.sub} label={model.goal.label} mark="dash" />}
            {workouts && <LegendKey color={k.tintInk.peach} label="Workouts" mark="block" />}
            {view === "sleep" && (dayVm?.stages.length ?? 0) > 0 && (["awake", "rem", "light", "deep"] as const).map((s) => <LegendKey key={s} color={stageColor[s]} label={STAGE_NAME[s]} mark="dot" />)}
            {canCompare &&
              (cmp ? (
                <Pressable
                  onPress={clearCompare}
                  accessibilityRole="button"
                  accessibilityLabel={`Stop comparing with ${compareName}`}
                  style={({ pressed }) => ({ minHeight: 36, paddingVertical: 6, paddingLeft: 12, paddingRight: 10, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: k.card, flexShrink: 1, opacity: pressed ? 0.8 : 1 })}
                >
                  <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: model?.compareBands ? model.compareBands[model.compareBands.length - 1].color : (model?.comparePaint ?? c.chart4) }} />
                  <Txt size={13} lineHeight={18} weight={600} style={{ color: k.ink, flexShrink: 1 }}>
                    {compareName}
                    {axes?.cStats?.avg != null && model?.compare ? (
                      <Txt size={13} lineHeight={18} weight={500} style={{ color: k.sub }}>{` · avg ${valueText(axes.cStats.avg, model.compare.format, model.compare.unit)}`}</Txt>
                    ) : cmpEmpty ? (
                      <Txt size={13} lineHeight={18} weight={500} style={{ color: k.sub }}>
                        {" · none this day"}
                      </Txt>
                    ) : (
                      ""
                    )}
                  </Txt>
                  <X size={15} color={k.sub} strokeWidth={2} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setSheet("compare")}
                  accessibilityRole="button"
                  accessibilityLabel="Compare with another metric"
                  style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: k.card, opacity: pressed ? 0.8 : 1 })}
                >
                  <Plus size={15} color={k.teal} strokeWidth={2.25} />
                  <Txt size={13} lineHeight={18} weight={600} style={{ color: k.teal }}>
                    Compare
                  </Txt>
                </Pressable>
              ))}
          </View>
          {model?.shade && <Sentence size={13}>{model.shade.label}</Sentence>}
          <Sentence size={13}>{HINT}</Sentence>
        </View>
      </View>

      <MetricSheet
        open={sheet === "metric"}
        onClose={() => setSheet(null)}
        title="Metric"
        groups={metricGroups}
        current={def.key}
        // A metric without the current day view falls back to its month.
        // Turning a day's heart rate off ("none") was for that metric: another metric gets its own default back.
        onPick={(key) => key && setParams({ metric: key, r: range === "day" && !chartDef(key)?.day ? "m" : range, ...(cmp?.key === key || rawParam === NO_COMPARE ? { compare: null } : {}) })}
      />
      <MetricSheet
        open={sheet === "compare"}
        onClose={() => setSheet(null)}
        title="Compare with"
        groups={compareGroups}
        current={cmp?.key ?? null}
        none="None"
        onPick={(key) => (key ? setParams({ compare: key }) : clearCompare())}
      />
    </View>
  );
}
