// Strain `/strain?d=` (spec §7.3), ported from the web's src/app/(app)/strain/page.tsx, in Apple Fitness's look: Day
// Strain as one big orange ring (0-21) on a card lit by its colour, the Strain Target a stronger stretch of the track,
// then the target and the day's parts as an inset grouped list (zones, strength, steps, each against your 30-day
// average), the coach, heart rate, time in zones, the day's workouts as Fitness lists them, and the trends. The same
// page is the Activity tab (`tab`): with the avatar in place of the back button, it adds the day's goals in full (with
// the day's activity and the weekly plan), the activities card with Add activity and Live workout, the Energy Bank and
// the training cards, ahead of the charts.
import * as React from "react";
import { View } from "react-native";
import { Dumbbell, Flame, Footprints, HeartPulse, Activity as ActivityIcon, type LucideIcon } from "lucide-react-native";
import { dayHref } from "@/lib/day";
import { formatValue } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import { getHome, getStrain, getTraining, type StrainVM } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { ActivityCard, EmptyState, InfoButton, InsightCard, IntradayHrChart, SectionShell, TrendChart, Txt, useTheme, ZoneBars, type TrendRange, type TrendSeries } from "@/ui";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { CalorieBreakdown } from "@/ui/components/CalorieBreakdown";
import { MetricTags } from "@/ui/components/primitives";
import { useOpenChart, type ChartRange } from "@/screens/chart/href";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { AvatarButton } from "@/ui/components/AvatarButton";
import { useBottomClearance } from "@/ui/components/PageShell";
import { font } from "@/ui/fonts";
import { GoalsCard } from "@/screens/home/GoalsCard";
import { Activities, EnergyCard } from "@/screens/home/sections";
import { SLEEP_TAB } from "@/screens/home/tabs";
import { homeKey, useDashboardKeys } from "@/screens/home/dashboard";
import { Anchor, DetailScreen, LoadError, useAnchors } from "./DetailScreen";
import { CALORIES_INFO, STRAIN_INFO, STRAIN_TARGET_INFO } from "./info";
import { ListGroup, ListRow } from "./ios";
import { useBack, useDayNav, useHashScroll, usePush, useRefresh } from "./nav";
import { ScoreHero } from "./ScoreHero";
import { strainSkeleton } from "./skeletons";
import { activityHref, hrSeries, StatRow, trendProps } from "./view";
import { TrainingReadinessCard, TrainingStatusCard } from "./TrainingCards";

/** The new cards open on the week; the page's Strain trend keeps its month default. */
const WEEK_MONTH = ["w", "m"] as const;

/** The day's parts' icon squares, in Fitness's colours: easy zones green, hard zones red, strength orange, steps blue. */
const PART_ICON: Record<string, { icon: LucideIcon; color: (c: CalmPalette) => string }> = {
  zones13: { icon: HeartPulse, color: (c) => c.system.green },
  zones45: { icon: HeartPulse, color: (c) => c.system.red },
  strength: { icon: Dumbbell, color: (c) => c.system.orange },
  steps: { icon: Footprints, color: (c) => c.system.blue },
};

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
    refreshing,
    onRefresh,
    anchors,
  } as const;
  if (q.error && !vm) return <DetailScreen {...common} primary={<LoadError onRetry={retry} />} />;
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
  const link = { d, today, push, scrollTo: anchors.scrollTo };
  const heart = (
    <SectionShell variant="card" title="Heart rate" action={expand("strain", "day")}>
      <IntradayHrChart data={hrSeries(vm.hr, vm.maxHr)} timeZone={timeZone} onPress={open("strain", "day")} />
    </SectionShell>
  );

  return (
    <DetailScreen
      {...common}
      hero={<ScoreHero variant="strain" value={s.value} reason={s.reason} target={t ? [t.low, t.high] : null} extraTags={vm.soFar && s.value !== null ? ["so_far"] : undefined} />}
      summary={
        <ListGroup footer="Each part against your prior 30 days: green better, orange worse.">
          <TargetRow vm={vm} />
          {vm.summary.map((k) => {
            const part = PART_ICON[k.key];
            return <StatRow key={k.key} k={k} link={link} bold icon={part?.icon ?? ActivityIcon} iconColor={part ? part.color(calm) : calm.system.teal} />;
          })}
        </ListGroup>
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
          heart
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
            {heart}
          </Anchor>
        ),
        <Anchor key="zones" anchors={anchors} id="zones">
          <SectionShell variant="card" title="Time in zones" accent="heart" fill>
            <ZoneBars variant="rows" data={vm.zones} note={vm.zoneNote} emptyCopy={vm.isToday ? "No heart-rate zones yet today." : "No heart-rate zones on this day."} />
          </SectionShell>
        </Anchor>,
        // The Activity tab lists them in the activities card above (with Add activity and Live workout).
        !tab && <Workouts key="activities" vm={vm} timeZone={timeZone} onOpen={(id) => push(activityHref(id))} />,
        <Anchor key="trend" anchors={anchors} id="trend">
          <SectionShell variant="card" title={ranges.trend === "w" ? "Weekly trends" : "Strain trend"} accent="strain" action={expand("strain", ranges.trend)}>
            <TrendChart label="Strain" format="decimal1" colorBy="strain" today={today} onPress={(r) => open("strain", r)()} {...rangeOf("trend")} {...trend} />
          </SectionShell>
        </Anchor>,
        <Anchor key="calories" anchors={anchors} id="calories">
          <SectionShell variant="card" title="Calories burned" accent="strain" info={CALORIES_INFO} action={expand("calories", ranges.calories)}>
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
          <SectionShell variant="card" title="Workout duration" accent="strain" action={expand("workouts", ranges.workouts)}>
            <TrendChart label="Workout duration" format="duration" colorBy="strain" ranges={WEEK_MONTH} today={today} onPress={(r) => open("workouts", r)()} {...rangeOf("workouts")} {...trendProps(vm.workouts)} />
          </SectionShell>
        </Anchor>,
      ]}
    />
  );
}

/**
 * "Strain Target 12.0 – 15.0": a range, so it is its own row rather than a stat (no comparison): the flame square, the
 * name (and why it is missing, or that it is an estimate), the range in the strain orange, and the info button in the
 * chevron's place.
 */
function TargetRow({ vm }: { vm: StrainVM }) {
  const c = useCalm();
  const t = vm.target;
  const text = t.value ? `${formatValue("decimal1", t.value.low)} – ${formatValue("decimal1", t.value.high)}` : "--";
  const reason = t.value ? null : reasonCopy(t.reason, t.nightsLeft).short;
  return (
    <ListRow
      icon={Flame}
      iconColor={c.system.orange}
      label="Strain Target"
      detail={reason ?? (t.value?.estimate ? <MetricTags extra={["estimate"]} align="flex-start" style={{ marginTop: 3 }} /> : undefined)}
      accessibilityLabel={reason ? `Strain Target: ${reason}` : `Strain Target ${text.replace(" – ", " to ")}${t.value?.estimate ? ", estimate" : ""}`}
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Txt size={20} lineHeight={24} style={[font.numberAt(20), { color: reason ? c.faint : c.tintInk.peach }]}>
            {text}
          </Txt>
          <InfoButton info={STRAIN_TARGET_INFO} label="Strain Target" variant="card" />
        </View>
      }
      chevron={false}
    />
  );
}

/** The day's workouts as Fitness lists them: one card, each row the workout's disc, name, length, distance and Strain. */
function Workouts({ vm, timeZone, onOpen }: { vm: StrainVM; timeZone: string; onOpen: (id: string) => void }) {
  const c = useCalm();
  return (
    <SectionShell variant="card" title="Workouts" accent="strain">
      {vm.activities.length ? (
        <View>
          {vm.activities.map((a, i) => (
            <React.Fragment key={a.id}>
              {i > 0 && <View style={{ height: 0.5, marginLeft: 56, backgroundColor: c.line }} />}
              <ActivityCard name={a.name} kind={a.activityKind} strain={a.strain} start={a.start} end={a.end} distanceKm={a.distanceKm} paceS={a.paceS} onPress={() => onOpen(a.id)} timeZone={timeZone} />
            </React.Fragment>
          ))}
        </View>
      ) : (
        <EmptyState body="No activities on this day." />
      )}
    </SectionShell>
  );
}
