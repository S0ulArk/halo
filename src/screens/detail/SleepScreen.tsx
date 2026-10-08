// Sleep `/sleep?d=` (spec §7.5), ported from the web's src/app/(app)/sleep/page.tsx: performance, stages, the week
// against your need, tonight's bedtime plan (`#planner` scrolls to it), need and debt. The same page is the Sleep tab
// (`tab`): the avatar in place of the back button, and the tab bar's clearance under it.
import * as React from "react";
import { View } from "react-native";
import { getSleep } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { InsightCard, KeyStatRow, ScoreDial, SectionShell, SleepStages, TrendChart, useTheme, type ColorToken, type TrendRange, type TrendSeries } from "@/ui";
import { Anchor, DetailScreen, LoadError, useAnchors } from "./DetailScreen";
import { SLEEP_INFO, TONIGHT_INFO } from "./info";
import { useBack, useDayNav, useHashScroll, usePush, useRefresh } from "./nav";
import { HoursVsNeed, Planner, SleepConsistency } from "./SleepCards";
import { sleepSkeleton } from "./skeletons";
import { Aside, Divided, statProps, SummaryCard, trendProps } from "./view";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { TonePill } from "@/ui/components/Meter";
import { useOpenChart, type ChartRange } from "@/screens/chart/href";
import { useCalm } from "@/ui/calm";
import { AvatarButton } from "@/ui/components/AvatarButton";
import { useBottomClearance } from "@/ui/components/PageShell";
import { SleepWeekCard } from "@/screens/home/calm";

const STATUS_LEGEND: [ColorToken, string][] = [
  ["warning", "Poor"],
  ["foregroundSecondary", "Sufficient"],
  ["optimal", "Optimal"],
];
const WEEK_MONTH = ["w", "m"] as const;

export default function SleepScreen() {
  return <SleepView />;
}

/** The Sleep tab (app/(tabs)/tab-sleep.tsx). */
export function SleepTab() {
  return <SleepView tab />;
}

function SleepView({ tab = false }: { tab?: boolean }) {
  const { c } = useTheme();
  const calm = useCalm();
  const { timeZone } = useApp();
  const { d, today, switcher } = useDayNav();
  const onBack = useBack();
  const tabClearance = useBottomClearance("tabs");
  const { refreshing, onRefresh, retry } = useRefresh();
  const anchors = useAnchors();
  const openChart = useOpenChart();
  const push = usePush();
  const dayParam = d === today ? undefined : d;
  const open = (metric: string, r: ChartRange) => () => openChart({ metric, r, d: dayParam });
  const expand = (metric: string, r: ChartRange) => <ExpandButton onPress={open(metric, r)} />;
  const [ranges, setRanges] = React.useState<Record<"restorative" | "efficiency" | "debt", TrendRange>>({ restorative: "w", efficiency: "w", debt: "m" });
  const rangeOf = (k: keyof typeof ranges) => ({ range: ranges[k], onRangeChange: (r: TrendRange) => setRanges((s) => ({ ...s, [k]: r })) });
  const q = useQuery((ctx) => getSleep(d, ctx), [d], `sleep:${d}`);
  const vm = q.data?.day === d ? q.data : undefined;
  useHashScroll(anchors, !!vm);

  const common = {
    title: "Sleep",
    info: SLEEP_INFO,
    onBack: tab ? undefined : onBack,
    lead: tab ? <AvatarButton /> : undefined,
    bottomInset: tab ? tabClearance : undefined,
    dateSwitcher: switcher(!!q.data && !vm),
    notch: true,
    refreshing,
    onRefresh,
    anchors,
  } as const;
  if (q.error && !vm) return <DetailScreen {...common} notch={false} primary={<LoadError onRetry={retry} />} />;
  if (!vm) return <DetailScreen {...common} {...sleepSkeleton()} />;

  const p = vm.performance;
  // Rows lead to their own section (`#need`, an Anchor below) or screen.
  const link = { d, today, push, scrollTo: anchors.scrollTo };

  /** Deep under REM, as WHOOP stacks them. */
  const restorativeParts: TrendSeries[] = [
    { key: "rem", label: "REM", color: c.stageRem },
    { key: "deep", label: "Deep", color: c.stageDeep },
  ];
  return (
    <DetailScreen
      {...common}
      hero={
        <ScoreDial
          variant="sleep"
          size="lg"
          value={p.value}
          reason={p.reason}
          nightsLeft={p.nightsLeft}
          provisional={p.provisional}
          tags={p.tags}
          // Same cut-offs as the sleep insight: optimal from 85%, sufficient from 70% (queries/sleep.ts).
          status={p.value === null ? undefined : p.value >= 85 ? "optimal" : p.value >= 70 ? "sufficient" : "poor"}
        />
      }
      summary={
        <SummaryCard
          legend={
            // The meters' bands as small tinted pills, in the meters' own colours.
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              {STATUS_LEGEND.map(([swatch, word]) => (
                <TonePill key={word} color={c[swatch]}>
                  {word}
                </TonePill>
              ))}
            </View>
          }
        >
          {vm.summary.map((k) => (
            // The reference app's sleep rows show the status segments instead of a 30-day comparison.
            <KeyStatRow key={k.key} variant="row" {...statProps(k, { iconColor: calm.tintInk.lavender, link })} average={null} direction="none" />
          ))}
        </SummaryCard>
      }
      insight={vm.insight ? <InsightCard body={vm.insight} /> : null}
      primary={
        <SectionShell variant="card" title="Last night’s sleep" aside={<Aside>vs. prior 30 days</Aside>} action={expand("hours", "day")}>
          <SleepStages hours={vm.hours} hr={vm.nightHr} data={vm.stages} timeZone={timeZone} onExpand={open("hours", "day")} />
        </SectionShell>
      }
      secondary={[
        // The week of nights against your need, then tonight's plan: the two things to act on, before the detail.
        <SleepWeekCard key="week" day={d} goalMin={vm.hoursVsNeed.value?.needMin ?? 480} />,
        <View key="planner" ref={anchors.ref("planner")} collapsable={false}>
          <SectionShell variant="card" title="Tonight’s sleep" info={TONIGHT_INFO}>
            <Planner vm={vm} timeZone={timeZone} />
          </SectionShell>
        </View>,
        <Anchor key="need" anchors={anchors} id="need">
          <SectionShell variant="card" title="Hours vs. needed">
            <HoursVsNeed vm={vm} />
          </SectionShell>
        </Anchor>,
        <Anchor key="consistency" anchors={anchors} id="consistency">
          <SectionShell variant="card" title="Sleep consistency">
            <SleepConsistency vm={vm} />
          </SectionShell>
        </Anchor>,
        <Anchor key="restorative" anchors={anchors} id="restorative">
        <SectionShell variant="card" title="Restorative sleep" action={expand("restorative", ranges.restorative)}>
          <TrendChart
            onPress={(r) => open("restorative", r)()}
            label="Restorative sleep"
            format="duration"
            colorBy="single"
            stack={restorativeParts}
            headline="day"
            ranges={WEEK_MONTH}
            today={today}
            {...rangeOf("restorative")}
            data={{ value: vm.restorative.map((pt) => ({ date: pt.day, value: pt.value, parts: pt.parts })), reason: null, provisional: false }}
          />
        </SectionShell>
        </Anchor>,
        <Anchor key="efficiency" anchors={anchors} id="efficiency">
          <SectionShell variant="card" title="Sleep efficiency" action={expand("efficiency", ranges.efficiency)}>
            <TrendChart label="Sleep efficiency" unit="%" format="int" colorBy="sleep" direction="up" line today={today} onPress={(r) => open("efficiency", r)()} {...rangeOf("efficiency")} {...trendProps(vm.efficiencyTrend)} />
          </SectionShell>
        </Anchor>,
        <SectionShell key="details" variant="card" title="Details">
          <Divided>
            {vm.details.map((k) => (
              <KeyStatRow key={k.key} variant="row" {...statProps(k, { iconColor: calm.tintInk.lavender, icons: false, link })} />
            ))}
          </Divided>
        </SectionShell>,
        <Anchor key="debt" anchors={anchors} id="debt">
          <SectionShell variant="card" title="Sleep debt" action={expand("debt", ranges.debt)}>
            <TrendChart label="Sleep debt" unit="h" format="decimal1" colorBy="sleep" direction="down" today={today} onPress={(r) => open("debt", r)()} {...rangeOf("debt")} {...trendProps(vm.debtTrend)} />
          </SectionShell>
        </Anchor>,
      ]}
    />
  );
}
