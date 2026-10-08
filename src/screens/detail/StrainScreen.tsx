// Strain `/strain?d=` (spec §7.3), ported from the web's src/app/(app)/strain/page.tsx: Day Strain, the Strain Target,
// heart-rate zones, activities, calories burned and workout time. The same page is the Activity tab (`tab`): with the
// avatar in place of the back button, it adds the day's goals in full (with the day's activity and the weekly plan),
// the activities card with Add activity and Live workout, and the Energy Bank, ahead of the charts.
import * as React from "react";
import { View } from "react-native";
import { Flame } from "lucide-react-native";
import { dayHref } from "@/lib/day";
import { formatValue } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import { getHome, getStrain, getTraining, type StrainVM } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import {
  AccentIcon,
  ActivityCard,
  DeltaMark,
  EmptyState,
  InfoButton,
  InsightCard,
  IntradayHrChart,
  KeyStatRow,
  MetricTags,
  ScoreDial,
  SectionShell,
  TrendChart,
  Txt,
  useTheme,
  ZoneBars,
  type TrendRange,
  type TrendSeries,
} from "@/ui";
import { Anchor, DetailScreen, LoadError, useAnchors } from "./DetailScreen";
import { CALORIES_INFO, STRAIN_INFO, STRAIN_TARGET_INFO } from "./info";
import { useBack, useDayNav, useHashScroll, usePush, useRefresh } from "./nav";
import { strainSkeleton } from "./skeletons";
import { activityHref, hrSeries, LegendText, statProps, SummaryCard, trendProps } from "./view";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { CalorieBreakdown } from "@/ui/components/CalorieBreakdown";
import { useOpenChart, type ChartRange } from "@/screens/chart/href";
import { useCalm } from "@/ui/calm";
import { onBand } from "@/ui/components/calmKit";
import { AvatarButton } from "@/ui/components/AvatarButton";
import { useBottomClearance } from "@/ui/components/PageShell";
import { GoalsCard } from "@/screens/home/GoalsCard";
import { Activities, EnergyCard } from "@/screens/home/sections";
import { SLEEP_TAB } from "@/screens/home/tabs";
import { homeKey, useDashboardKeys } from "@/screens/home/dashboard";
import { Num } from "./calmKit";
import { TrainingReadinessCard, TrainingStatusCard } from "./TrainingCards";

/** The new cards open on the week; the page's Strain trend keeps its month default. */
const WEEK_MONTH = ["w", "m"] as const;

export default function StrainScreen() {
  return <StrainView />;
}

/** The Activity tab (app/(tabs)/tab-activity.tsx). */
export function ActivityTab() {
  return <StrainView tab />;
}

function StrainView({ tab = false }: { tab?: boolean }) {
  const { c } = useTheme();
  const calm = useCalm();
  const { timeZone } = useApp();
  const { d, today, switcher } = useDayNav();
  const onBack = useBack();
  const push = usePush();
  const tabClearance = useBottomClearance("tabs");
  const openChart = useOpenChart();
  const open = (metric: string, r: ChartRange) => () => openChart({ metric, r, d: d === today ? undefined : d });
  const expand = (metric: string, r: ChartRange) => <ExpandButton onPress={open(metric, r)} />;
  const { refreshing, onRefresh, retry } = useRefresh();
  // Sections links can scroll to (`#zones` from the zone rows and Today's Zone min, `#goals` from Today's goals, …).
  const anchors = useAnchors();
  const [ranges, setRanges] = React.useState<Record<"trend" | "calories" | "workouts", TrendRange>>({ trend: "m", calories: "w", workouts: "w" });
  const rangeOf = (k: keyof typeof ranges) => ({ range: ranges[k], onRangeChange: (r: TrendRange) => setRanges((s) => ({ ...s, [k]: r })) });
  const q = useQuery((ctx) => getStrain(d, ctx), [d], `strain:${d}`);
  const dashboard = useDashboardKeys();
  const vm = q.data?.day === d ? q.data : undefined;
  // The Activity tab's own cards (goals, activities, Energy Bank) are Home's, on the day's Home data.
  const homeQ = useQuery((ctx) => (tab ? getHome(d, ctx, { dashboardKeys: dashboard ?? undefined }) : Promise.resolve(null)), [tab, d, dashboard], tab ? homeKey(d, dashboard) : undefined);
  const home = homeQ.data && homeQ.data.day === d ? homeQ.data : undefined;
  const slot = home ? { vm: home, timeZone, at: (path: string) => dayHref(path, d, today), go: push } : null;
  // The Activity tab's Garmin-style training cards (version 19): readiness with recovery time, and training status.
  const trainingQ = useQuery((ctx) => (tab ? getTraining(d, ctx) : Promise.resolve(null)), [tab, d], tab ? `training:${d}` : undefined);
  const training = trainingQ.data && trainingQ.data.day === d ? trainingQ.data : undefined;
  // Scrolls to a linked section once the page (and, on the tab, the goals card) has drawn.
  useHashScroll(anchors, !!vm && (!tab || !!home));

  const common = {
    title: tab ? "Activity" : "Strain",
    info: STRAIN_INFO,
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
  if (!vm) return <DetailScreen {...common} {...strainSkeleton()} />;

  const s = vm.strain;
  const t = vm.target.value;
  const trend = trendProps(vm.trend);
  const calories = vm.calories.map((p) => ({ date: p.day, value: p.value, provisional: p.provisional, parts: p.parts }));
  /** Bottom first: the day's base burn, then everyday movement, then workouts on top. */
  const calorieParts: TrendSeries[] = [
    { key: "resting", label: "Resting", color: c.energyResting },
    { key: "everyday", label: "Everyday", color: c.energyActive },
    { key: "workouts", label: "Workouts", color: c.chart4 },
  ];
  // The selected day's split, the last point of the calories series (strain.ts calorieSplit).
  const dayCalories = vm.calories[vm.calories.length - 1];
  const NOTES: Record<string, string> = {
    resting: "Your body's base burn: heart, lungs, brain",
    everyday: "Walking and moving outside workouts",
    workouts: "Inside your recorded workouts",
  };
  const calorieLegend = calorieParts.map((p) => ({ key: p.key, label: p.label, color: p.color, note: NOTES[p.key] }));

  return (
    <DetailScreen
      {...common}
      hero={<ScoreDial variant="strain" size="lg" value={s.value} reason={s.reason} target={t ? [t.low, t.high] : null} extraTags={vm.soFar && s.value !== null ? ["so_far"] : undefined} />}
      summary={
        <SummaryCard
          legend={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <DeltaMark dir="up" tone="good" />
                <DeltaMark dir="down" tone="bad" />
              </View>
              <LegendText>Today vs. prior 30 days</LegendText>
            </View>
          }
        >
          <TargetRow vm={vm} />
          {vm.summary.map((k) => (
            <KeyStatRow key={k.key} variant="row" {...statProps(k, { iconColor: calm.tintInk.peach, link: { d, today, push, scrollTo: anchors.scrollTo } })} />
          ))}
        </SummaryCard>
      }
      insight={vm.coach ? <InsightCard body={vm.coach} action={{ label: "Plan tonight’s sleep", onPress: () => push(dayHref(tab ? `${SLEEP_TAB}#planner` : "/sleep#planner", d, today)) }} /> : null}
      primary={
        tab ? (
          // The day's goals in full, with the day's activity and the weekly plan at its foot.
          slot ? (
            <Anchor anchors={anchors} id="goals">
              <GoalsCard {...slot} />
            </Anchor>
          ) : null
        ) : (
          <SectionShell variant="card" title="Heart rate" action={expand("strain", "day")}>
            <IntradayHrChart data={hrSeries(vm.hr, vm.maxHr)} timeZone={timeZone} onPress={open("strain", "day")} />
          </SectionShell>
        )
      }
      secondary={[
        tab && slot && (
          <Anchor key="tab-activities" anchors={anchors} id="activities">
            <Activities {...slot} />
          </Anchor>
        ),
        tab && slot && (
          <Anchor key="tab-energy" anchors={anchors} id="energy">
            <EnergyCard {...slot} />
          </Anchor>
        ),
        tab && training && (
          <Anchor key="tab-readiness" anchors={anchors} id="readiness">
            <TrainingReadinessCard vm={training} timeZone={timeZone} />
          </Anchor>
        ),
        tab && training && (
          <Anchor key="tab-training-status" anchors={anchors} id="training-status">
            <TrainingStatusCard vm={training} />
          </Anchor>
        ),
        tab && (
          <Anchor key="hr" anchors={anchors} id="hr">
            <SectionShell variant="card" title="Heart rate" action={expand("strain", "day")}>
              <IntradayHrChart data={hrSeries(vm.hr, vm.maxHr)} timeZone={timeZone} onPress={open("strain", "day")} />
            </SectionShell>
          </Anchor>
        ),
        <Anchor key="zones" anchors={anchors} id="zones">
          <SectionShell variant="card" title="Time in zones" fill>
            <ZoneBars variant="rows" data={vm.zones} note={vm.zoneNote} emptyCopy={vm.isToday ? "No heart-rate zones yet today." : "No heart-rate zones on this day."} />
          </SectionShell>
        </Anchor>,
        // The Activity tab lists them in the activities card above (with Add activity and Live workout).
        !tab && (
        <SectionShell key="activities" variant="card" title="Activities">
          {vm.activities.length ? (
            <View style={{ gap: 6 }}>
              {vm.activities.map((a) => (
                <ActivityCard
                  key={a.id}
                  name={a.name}
                  kind={a.activityKind}
                  strain={a.strain}
                  start={a.start}
                  end={a.end}
                  distanceKm={a.distanceKm}
                  paceS={a.paceS}
                  onPress={() => push(activityHref(a.id))}
                  timeZone={timeZone}
                />
              ))}
            </View>
          ) : (
            <EmptyState body="No activities on this day." />
          )}
        </SectionShell>
        ),
        <Anchor key="trend" anchors={anchors} id="trend">
          <SectionShell variant="card" title={ranges.trend === "w" ? "Weekly trends" : "Strain trend"} action={expand("strain", ranges.trend)}>
            <TrendChart label="Strain" format="decimal1" colorBy="strain" today={today} onPress={(r) => open("strain", r)()} {...rangeOf("trend")} {...trend} />
          </SectionShell>
        </Anchor>,
        <Anchor key="calories" anchors={anchors} id="calories">
        <SectionShell variant="card" title="Calories burned" info={CALORIES_INFO} action={expand("calories", ranges.calories)}>
          <CalorieBreakdown total={dayCalories?.value ?? null} parts={dayCalories?.parts} series={calorieLegend} soFar={vm.soFar} />
          <TrendChart
            onPress={(r) => open("calories", r)()}
            label="Calories burned"
            unit="kcal"
            format="grouped"
            colorBy="single"
            stack={calorieParts}
            headline="day"
            ranges={WEEK_MONTH}
            today={today}
            {...rangeOf("calories")}
            data={{ value: calories, reason: null, provisional: false }}
          />
        </SectionShell>
        </Anchor>,
        <Anchor key="workouts" anchors={anchors} id="workouts">
          <SectionShell variant="card" title="Workout duration" action={expand("workouts", ranges.workouts)}>
            <TrendChart label="Workout duration" format="duration" colorBy="strain" ranges={WEEK_MONTH} today={today} onPress={(r) => open("workouts", r)()} {...rangeOf("workouts")} {...trendProps(vm.workouts)} />
          </SectionShell>
        </Anchor>,
      ]}
    />
  );
}

/** KeyStatRow's lead band: its icon tile's height. */
const ROW_BAND = 44;

/**
 * "Strain Target 12.0 - 15.0": a range, so it is drawn beside the KeyStatRows rather than as one (no arrow), in their
 * box and on their band: the strain tile, the name (and why it is missing) with the range on its line, and the info
 * button in the chevron's column, so the range shares the right edge with the values under it.
 */
function TargetRow({ vm }: { vm: StrainVM }) {
  const c = useCalm();
  const t = vm.target;
  const text = t.value ? `${formatValue("decimal1", t.value.low)} - ${formatValue("decimal1", t.value.high)}` : "--";
  const reason = t.value ? null : reasonCopy(t.reason, t.nightsLeft).short;
  return (
    <View style={{ minHeight: 72, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14 }}>
      <AccentIcon icon={<Flame size={20} color={c.tintInk.peach} strokeWidth={1.75} />} family="strain" />
      <View accessible accessibilityLabel={reason ? `Strain Target: ${reason}` : `Strain Target ${text.replace(" - ", " to ")}`} style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: onBand(ROW_BAND, 21) }}>
            <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
              Strain Target
            </Txt>
            {reason ? (
              <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
                {reason}
              </Txt>
            ) : null}
          </View>
          <View style={{ flexShrink: 0, paddingTop: onBand(ROW_BAND, 22) }}>
            <Num value={text} size={20} color={reason ? c.faint : c.tintInk.peach} />
          </View>
        </View>
        {t.value?.estimate ? <MetricTags extra={["estimate"]} align="flex-start" /> : null}
      </View>
      {/* The info button's glyph where the rows' chevrons are: its 26 px box (32 less its −6 px edge) laid over the
          18 px column, centred on the band. */}
      <View style={{ marginLeft: 18 - 26, marginTop: onBand(ROW_BAND, 24) }}>
        <InfoButton info={STRAIN_TARGET_INFO} label="Strain Target" variant="card" />
      </View>
    </View>
  );
}
