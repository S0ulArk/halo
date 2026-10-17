// Sleep `/sleep?d=` (spec §7.5), ported from the web's src/app/(app)/sleep/page.tsx, in Apple Health's Sleep look: the
// large title, a glass D / W / M / 6M control, and then either the night (D) or the nights (W, M, 6M). The night: TIME
// ASLEEP with bed and wake, the stages chart and each stage's total, Sleep Performance and its parts as an inset
// grouped list (each row opens its section further down), the overnight heart rate with the stage breakdown, the week
// against your need, tonight's bedtime plan (`#planner` scrolls to it), hours against need, consistency, the
// restorative, efficiency and debt trends and the night's details. The nights: time asleep, performance and the
// trends over the chosen range. The same page is the Sleep tab (`tab`): the avatar in place of the back button, and
// the tab bar's clearance under it.
import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getSleep, type SleepVM } from "@/queries";
import { getChartSeries } from "@/queries/chart";
import { useApp, useQuery } from "@/state/app";
import { InsightCard, SectionShell, TrendChart, Txt, useTheme, type TrendRange, type TrendSeries } from "@/ui";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { useOpenChart, type ChartRange } from "@/screens/chart/href";
import { useCalm } from "@/ui/calm";
import { AvatarButton } from "@/ui/components/AvatarButton";
import { useBottomClearance } from "@/ui/components/PageShell";
import { SleepWeekCard } from "@/screens/home/calm";
import { Anchor, DetailScreen, LoadError, useAnchors, type Anchors } from "./DetailScreen";
import { SLEEP_INFO } from "./info";
import { GlassSegmented, ListGroup } from "./ios";
import { seriesPoints } from "./lines";
import { useBack, useDayNav, useHashScroll, usePush, useRefresh } from "./nav";
import { HoursVsNeed, Planner, SleepConsistency } from "./SleepCards";
import { NightHeart, StagesCards, TimeAsleep } from "./SleepNight";
import { sleepSkeleton } from "./skeletons";
import { StatRow, statusInk, trendProps } from "./view";
import { tagLabel } from "@/ui/components/primitives";

type Mode = "d" | "w" | "m" | "6m";
const MODES = [
  { value: "d", label: "D", accessibilityLabel: "Day" },
  { value: "w", label: "W", accessibilityLabel: "Week" },
  { value: "m", label: "M", accessibilityLabel: "Month" },
  { value: "6m", label: "6M", accessibilityLabel: "Six months" },
] as const;
const WEEK_MONTH = ["w", "m"] as const;
/** Sleep Performance's cut-offs, as the sleep insight's (queries/sleep.ts): optimal from 85 %, sufficient from 70 %. */
const performanceStatus = (v: number) => (v >= 85 ? "optimal" : v >= 70 ? "sufficient" : "poor");

export default function SleepScreen() {
  return <SleepView />;
}

/** The Sleep tab (app/(tabs)/tab-sleep.tsx). */
export function SleepTab() {
  return <SleepView tab />;
}

function SleepView({ tab = false }: { tab?: boolean }) {
  const { timeZone } = useApp();
  const { d, today, switcher } = useDayNav();
  const onBack = useBack();
  const tabClearance = useBottomClearance("tabs");
  const { refreshing, onRefresh, retry } = useRefresh();
  const anchors = useAnchors();
  const openChart = useOpenChart();
  const push = usePush();
  const [mode, setMode] = React.useState<Mode>("d");
  const dayParam = d === today ? undefined : d;
  const open = React.useCallback((metric: string, r: ChartRange) => () => openChart({ metric, r, d: dayParam }), [openChart, dayParam]);
  // The night's charts open the explorer on the night; one stable callback, so their memoised cards skip re-renders.
  const expandNight = React.useMemo(() => open("hours", "day"), [open]);
  const q = useQuery((ctx) => getSleep(d, ctx), [d], `sleep:${d}`);
  const vm = q.data?.day === d ? q.data : undefined;
  useHashScroll(anchors, !!vm);
  // A link to a section of the night (`#planner`) shows the night, whichever range the tab was left on.
  const params = useLocalSearchParams<{ "#"?: string }>();
  const hash = typeof params["#"] === "string" ? params["#"] : undefined;
  const [seenHash, setSeenHash] = React.useState(hash);
  if (hash !== seenHash) {
    setSeenHash(hash);
    if (hash) setMode("d");
  }

  const common = {
    title: "Sleep",
    info: SLEEP_INFO,
    onBack: tab ? undefined : onBack,
    lead: tab ? <AvatarButton /> : undefined,
    bottomInset: tab ? tabClearance : undefined,
    dateSwitcher: switcher(!!q.data && !vm),
    banner: <GlassSegmented value={mode} onChange={setMode} items={MODES} accessibilityLabel="Range" />,
    refreshing,
    onRefresh,
    anchors,
  } as const;
  if (q.error && !vm) return <DetailScreen {...common} primary={<LoadError onRetry={retry} />} />;
  if (!vm) return <DetailScreen {...common} {...sleepSkeleton()} />;
  if (mode !== "d") return <DetailScreen {...common} {...nightsSlots({ vm, mode, day: d, today, open })} />;
  return <DetailScreen {...common} {...nightSlots({ vm, day: d, today, timeZone, anchors, push, open, expandNight })} />;
}

type Open = (metric: string, r: ChartRange) => () => void;

/** D: the night, as DetailScreen's slots. */
function nightSlots({ vm, day, today, timeZone, anchors, push, open, expandNight }: { vm: SleepVM; day: string; today: string; timeZone: string; anchors: Anchors; push: (href: string) => void; open: Open; expandNight: () => void }) {
  // Rows lead to their own section (`#need`, an Anchor below) or screen.
  const link = { d: day, today, push, scrollTo: anchors.scrollTo };
  return {
    hero: <TimeAsleep hours={vm.hours} stages={vm.stages} timeZone={timeZone} />,
    summary: <StagesCards stages={vm.stages} timeZone={timeZone} onExpand={expandNight} />,
    insight: vm.insight ? <InsightCard body={vm.insight} /> : null,
    primary: <Performance vm={vm} link={link} />,
    secondary: [
      <NightHeart key="hr" hr={vm.nightHr} stages={vm.stages} timeZone={timeZone} onExpand={expandNight} />,
      // The week of nights against your need, then tonight's plan: the two things to act on, before the detail.
      <SleepWeekCard key="week" day={day} goalMin={vm.hoursVsNeed.value?.needMin ?? 480} />,
      <Anchor key="planner" anchors={anchors} id="planner">
        <Planner vm={vm} timeZone={timeZone} />
      </Anchor>,
      <Anchor key="need" anchors={anchors} id="need">
        <SectionShell variant="card" title="Hours vs. needed" accent="sleep">
          <HoursVsNeed vm={vm} />
        </SectionShell>
      </Anchor>,
      <Anchor key="consistency" anchors={anchors} id="consistency">
        <SectionShell variant="card" title="Sleep consistency" accent="sleep">
          <SleepConsistency vm={vm} />
        </SectionShell>
      </Anchor>,
      <Anchor key="restorative" anchors={anchors} id="restorative">
        <Restorative vm={vm} today={today} open={open} />
      </Anchor>,
      <Anchor key="efficiency" anchors={anchors} id="efficiency">
        <Efficiency vm={vm} today={today} open={open} />
      </Anchor>,
      <ListGroup key="details" title="Details" inset={16}>
        {vm.details.map((k) => (
          <StatRow key={k.key} k={k} link={link} />
        ))}
      </ListGroup>,
      <Anchor key="debt" anchors={anchors} id="debt">
        <Debt vm={vm} today={today} open={open} />
      </Anchor>,
    ],
  };
}

/** Sleep Performance and its parts as an inset grouped list: the score and its status in the header, a row per part. */
function Performance({ vm, link }: { vm: SleepVM; link: { d: string; today: string; push: (href: string) => void; scrollTo: (id: string) => boolean } }) {
  const c = useCalm();
  const p = vm.performance;
  const status = p.value === null ? null : performanceStatus(p.value);
  // Under the list: the status words in their colours (each part's own cut-offs), and the score's tags.
  const footer = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 4, paddingHorizontal: 16 }}>
      {(["optimal", "sufficient", "poor"] as const).map((s) => (
        <StatusWord key={s} status={s} />
      ))}
      {p.provisional || p.tags?.length ? (
        <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
          {[p.provisional ? "Provisional" : null, ...(p.tags ?? []).map(tagLabel)].filter(Boolean).join(" · ")}
        </Txt>
      ) : null}
    </View>
  );
  return (
    <ListGroup
      title={p.value === null ? "Sleep performance" : `Sleep performance · ${Math.round(p.value)}%`}
      right={status ? <StatusWord status={status} /> : undefined}
      inset={16}
      footer={footer}
    >
      {vm.summary.map((k) => (
        // The reference app's sleep rows show their status instead of a 30-day comparison.
        <StatRow key={k.key} k={k} link={link} compare={false} />
      ))}
    </ListGroup>
  );
}

/** A status word after its dot, in its colour ("● Optimal"). */
function StatusWord({ status }: { status: "optimal" | "sufficient" | "poor" }) {
  const c = useCalm();
  const ink = statusInk(c, status);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: ink }} />
      <Txt size={13} lineHeight={18} weight={600} style={{ color: ink }}>
        {status === "optimal" ? "Optimal" : status === "sufficient" ? "Sufficient" : "Poor"}
      </Txt>
    </View>
  );
}

/** A sleep trend card's props: the night's model, today, the explorer, and (W, M, 6M) the page's range pinned. */
type CardProps = { vm: SleepVM; today: string; open: Open; fixed?: TrendRange };

/**
 * Deep under REM, as WHOOP stacks them, the night's minutes of each: on the card's own W / M control, or the page's
 * range pinned. Memoised with its range inside it: a range tap redraws this card alone.
 */
const Restorative = React.memo(function Restorative({ vm, today, open, fixed }: CardProps) {
  const { c } = useTheme();
  const [own, setOwn] = React.useState<TrendRange>("w");
  const range = fixed ?? own;
  const parts = React.useMemo<TrendSeries[]>(
    () => [
      { key: "rem", label: "REM", color: c.stageRem },
      { key: "deep", label: "Deep", color: c.stageDeep },
    ],
    [c],
  );
  const data = React.useMemo(() => ({ value: vm.restorative.map((pt) => ({ date: pt.day, value: pt.value, parts: pt.parts })), reason: null, provisional: false }), [vm.restorative]);
  return (
    <SectionShell variant="card" title="Restorative sleep" accent="sleep" action={<ExpandButton onPress={open("restorative", range)} />}>
      <TrendChart onPress={(r) => open("restorative", r)()} label="Restorative sleep" format="duration" colorBy="single" stack={parts} headline="day" ranges={WEEK_MONTH} fixedRange={fixed} today={today} range={range} onRangeChange={setOwn} data={data} />
    </SectionShell>
  );
});

/** Sleep efficiency night by night, a line, on its own W / M / 6M or the page's range. */
const Efficiency = React.memo(function Efficiency({ vm, today, open, fixed }: CardProps) {
  const [own, setOwn] = React.useState<TrendRange>("w");
  const range = fixed ?? own;
  const trend = React.useMemo(() => trendProps(vm.efficiencyTrend), [vm.efficiencyTrend]);
  return (
    <SectionShell variant="card" title="Sleep efficiency" accent="sleep" action={<ExpandButton onPress={open("efficiency", range)} />}>
      <TrendChart label="Sleep efficiency" unit="%" format="int" colorBy="sleep" direction="up" line today={today} fixedRange={fixed} range={range} onRangeChange={setOwn} onPress={(r) => open("efficiency", r)()} {...trend} />
    </SectionShell>
  );
});

/** Sleep debt night by night, on its own W / M / 6M (the month first) or the page's range. */
const Debt = React.memo(function Debt({ vm, today, open, fixed }: CardProps) {
  const [own, setOwn] = React.useState<TrendRange>("m");
  const range = fixed ?? own;
  const trend = React.useMemo(() => trendProps(vm.debtTrend), [vm.debtTrend]);
  return (
    <SectionShell variant="card" title="Sleep debt" accent="sleep" action={<ExpandButton onPress={open("debt", range)} />}>
      <TrendChart label="Sleep debt" unit="h" format="decimal1" colorBy="sleep" direction="down" today={today} fixedRange={fixed} range={range} onRangeChange={setOwn} onPress={(r) => open("debt", r)()} {...trend} />
    </SectionShell>
  );
});

/** W, M, 6M: the nights over the range, as DetailScreen's slots. */
function nightsSlots({ vm, mode, day, today, open }: { vm: SleepVM; mode: Exclude<Mode, "d">; day: string; today: string; open: Open }) {
  return {
    primary: <NightsTrend metric="hours" title="Time asleep" format="duration" mode={mode} day={day} today={today} open={open} />,
    secondary: [
      <NightsTrend key="performance" metric="sleep" title="Sleep performance" unit="%" format="int" mode={mode} day={day} today={today} open={open} />,
      // Restorative sleep holds the last 30 nights: at six months it stays on the month.
      <Restorative key="restorative" vm={vm} today={today} open={open} fixed={mode === "w" ? "w" : "m"} />,
      <Efficiency key="efficiency" vm={vm} today={today} open={open} fixed={mode} />,
      <Debt key="debt" vm={vm} today={today} open={open} fixed={mode} />,
    ],
  };
}

/** One nightly series over the page's range (the explorer's own series, so the numbers match it), in a card. */
function NightsTrend({ metric, title, unit, format, mode, day, today, open }: { metric: "hours" | "sleep"; title: string; unit?: string; format: "duration" | "int"; mode: Exclude<Mode, "d">; day: string; today: string; open: Open }) {
  const q = useQuery((ctx) => getChartSeries(metric, ctx), [metric], `chartseries:${metric}`);
  const points = React.useMemo(() => (q.data ? seriesPoints(q.data, day) : null), [q.data, day]);
  return (
    <SectionShell variant="card" title={title} accent="sleep" action={<ExpandButton onPress={open(metric, mode)} />}>
      <TrendChart
        label={title}
        unit={unit}
        format={format}
        colorBy="sleep"
        direction="up"
        today={today}
        fixedRange={mode}
        onPress={(r) => open(metric, r)()}
        data={q.error ? { value: null, reason: "no_data", provisional: false } : points ? { value: points, reason: null, provisional: false } : undefined}
      />
    </SectionShell>
  );
}
