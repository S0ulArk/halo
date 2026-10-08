// Healthspan `/health/healthspan?d=` (spec §7.7), ported from Pulse's health/healthspan/page.tsx and its loading.tsx:
// Pulse Age for the ISO week containing `d`: the Calm lead card (Pulse Age large beside its growth rings), then Pace of Aging,
// the history and the contributors, with the sticky header that collapses to the compact age badge.
import * as React from "react";
import { RefreshControl, View } from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useRouter } from "expo-router";
import { useDay } from "@/lib/day";
import { AGE_LABEL, formatValue, MISSING } from "@/lib/format";
import { getHealthspan, type HealthspanVM } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { DateSwitcher, EmptyState, Ground, InsightCard, SectionShell, SkeletonText, TickScaleSkeleton, TrendChart, TrendChartSkeleton, useTheme, type DateSwitcherProps } from "@/ui";
import { CollapsingHeader, type HeaderStats } from "@/ui/components/CollapsingHeader";
import { useCalm } from "@/ui/calm";
import { useAfterTransition } from "@/ui/components/AfterTransition";
import { useBottomClearance } from "@/ui/components/PageShell";
import { InsightCardSkeleton } from "@/ui/components/InsightCard";
import { LoadError } from "@/screens/detail/DetailScreen";
import { useBack, useRefresh } from "@/screens/detail/nav";
import { Sentence } from "@/screens/detail/calmKit";
import { AgeBadge } from "./AgeRuler";
import { ContributorCard, ContributorCardSkeleton } from "./ContributorCard";
import { HEALTHSPAN_INFO } from "./detailInfo";
import { PaceScale, PulseAgeHero, PulseAgeHeroSkeleton, pulseAgeTint } from "./PulseAge";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { useOpenChart } from "@/screens/chart/href";

type ViewRef = React.ComponentRef<typeof View>;

/** The lead card: Pulse Age large in its pastel (mint younger, sand older), your age under it, the growth rings beside it. */
function Orb({ vm }: { vm: HealthspanVM }) {
  const r = vm.result.value;
  return (
    <PulseAgeHero
      age={r?.pulseAge ?? null}
      deltaYears={r?.deltaYears ?? null}
      provisional={vm.result.provisional}
      reason={vm.result.reason}
      yourAge={vm.age}
      orbSize={290}
    >
      {r && vm.result.provisional ? <Sentence size={13}>Provisional: firms up with 20 days of data and at least 7 of its 9 inputs.</Sentence> : null}
    </PulseAgeHero>
  );
}

function PaceOfAging({ vm }: { vm: HealthspanVM }) {
  const r = vm.result.value;
  const pace = r
    ? { value: r.pace, reason: r.pace == null ? ("calibrating" as const) : null, provisional: r.paceProvisional }
    : { value: null, reason: vm.result.reason, provisional: false };
  return (
    <SectionShell variant="card" title="Pace of Aging">
      <PaceScale pace={pace} />
      <View style={{ marginTop: 12 }}>
        <Sentence size={13}>
          {r && r.pace == null
            ? `Pace of Aging updates each Monday, once 21 of the last 31 days have a Recovery score${r.paceDays != null ? ` (${r.paceDays} so far)` : ""}.`
            : r?.paceProvisional
              ? "Pace of Aging uses a 6-month window and updates each Monday. It firms up as history builds."
              : "Compares your last 30 days with your 6-month Halo Age. Updated each Monday."}
        </Sentence>
      </View>
    </SectionShell>
  );
}

/** The screen's sections; `vm` undefined is the loading shape (spec §5.19). */
function sectionsOf(vm: HealthspanVM | undefined, openHistory?: () => void) {
  if (!vm)
    return {
      summary: (
        <SectionShell variant="card" title="Pace of Aging">
          <View importantForAccessibility="no-hide-descendants">
            <TickScaleSkeleton variant="marker" />
            <SkeletonText role="caption" width={256} style={{ marginTop: 12 }} />
            <SkeletonText role="caption" width={96} />
          </View>
        </SectionShell>
      ),
      insight: <InsightCardSkeleton title />,
      primary: (
        <SectionShell variant="card" title={`${AGE_LABEL} history`}>
          <TrendChartSkeleton />
        </SectionShell>
      ),
      secondary: [<ContributorCardSkeleton key="sleep" title="Sleep" n={2} />, <ContributorCardSkeleton key="strain" title="Strain" n={4} />, <ContributorCardSkeleton key="fitness" title="Fitness" n={3} />],
    };
  const hasHistory = vm.history.some((p) => p.value !== null);
  const group = (g: "sleep" | "strain" | "fitness") => vm.contributors.filter((x) => x.group === g);
  return {
    summary: <PaceOfAging vm={vm} />,
    insight: vm.insight ? <InsightCard title={vm.insight.title} body={vm.insight.body} /> : null,
    primary: (
      <SectionShell variant="card" title={`${AGE_LABEL} history`} action={hasHistory && openHistory ? <ExpandButton onPress={openHistory} /> : undefined}>
        {hasHistory ? (
          <TrendChart
            onPress={openHistory}
            label={AGE_LABEL}
            data={{ value: vm.history.map((p) => ({ date: p.day, value: p.value })), reason: null, provisional: false }}
            format="decimal1"
            colorBy="single"
            fixedRange="6m"
            reference={{ y: vm.age, label: "Your age" }}
          />
        ) : (
          <EmptyState body="History builds one week at a time." />
        )}
      </SectionShell>
    ),
    secondary: [
      <ContributorCard key="sleep" title="Sleep" items={group("sleep")} />,
      <ContributorCard key="strain" title="Strain" items={group("strain")} />,
      <ContributorCard key="fitness" title="Fitness" items={group("fitness")} />,
    ],
  };
}

/** Healthspan `/health/healthspan?d=` (spec §7.7): the ISO week containing `d`. */
export default function HealthspanScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const app = useApp();
  const onBack = useBack("/health");
  const { refreshing, onRefresh, retry } = useRefresh();
  const { d, today } = useDay();
  const q = useQuery((ctx) => getHealthspan(d, ctx), [d], `healthspan:${d}`);
  // A query for another week is still in flight: show the loading shape, not the previous week.
  const vm = q.data && q.data.day === d ? q.data : undefined;

  // The sticky hero: collapsed once the lead card's bottom edge has scrolled under the header (the web's useHeroCollapse).
  const content = React.useRef<ViewRef | null>(null);
  const hero = React.useRef<ViewRef | null>(null);
  const [heroBottom, setHeroBottom] = React.useState<number | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  const measure = () => {
    const h = hero.current;
    const host = content.current;
    if (h && host) h.measureLayout(host, (_x, y, _w, height) => setHeroBottom(y + height), () => {});
  };
  // Decided on the UI thread: React hears only of the crossing, never of each scroll event.
  const collapseAtUI = useSharedValue(-1);
  React.useEffect(() => {
    // The content View sits 8 px down the scroll view (its top padding).
    collapseAtUI.value = heroBottom === null ? -1 : heroBottom + 8;
  }, [heroBottom, collapseAtUI]);
  const collapsedUI = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const at = collapseAtUI.value;
      if (at < 0) return;
      const next = e.contentOffset.y >= at;
      if (next === collapsedUI.value) return;
      collapsedUI.value = next;
      scheduleOnRN(setCollapsed, next);
    },
  });

  const r = vm?.result.value ?? null;
  const n = vm?.nextUpdateInDays ?? 0;
  // Collapsed header stats ([latest-healthspan-collapsed-1..5]): years younger in green, older in amber; pace in white.
  const older = !!r && r.deltaYears > 0;
  const stats: HeaderStats = {
    left: { value: r ? formatValue("decimal1", Math.abs(r.deltaYears)) : MISSING, label: older ? "Years older" : "Years younger", tone: r ? (older ? "warning" : "optimal") : undefined },
    right: { value: r?.pace != null ? `${formatValue("decimal1", r.pace)}x` : MISSING, label: "Pace of aging" },
  };
  const dateSwitcher: DateSwitcherProps = { mode: "week", date: d, today, firstDay: app.sync.firstDay, onChange: (day) => router.setParams({ d: day === today ? undefined : day }), placement: "header" };
  // The sections only change with the week's data: the header's collapse (a scroll-driven state) must not rebuild them.
  const openChart = useOpenChart();
  const s = React.useMemo(() => sectionsOf(vm, () => openChart({ metric: "pulse_age", r: "6m" })), [vm, openChart]);
  // The slide runs over the lead card and Pace of Aging alone; the rest mounts once the screen has opened.
  const opened = useAfterTransition();
  const clearance = useBottomClearance("detail");

  const calm = useCalm();
  return (
    <View style={{ flex: 1, backgroundColor: c.groundHealthspan }}>
      <Ground variant="healthspan" />
      <CollapsingHeader
        title="Healthspan"
        subtitle={n > 0 ? `Next update in ${n} ${n === 1 ? "day" : "days"}` : undefined}
        info={HEALTHSPAN_INFO}
        onBack={onBack}
        ground="healthspan"
        collapsed={collapsed && !!vm}
        compact={<AgeBadge age={r?.pulseAge ?? null} ink={calm.tintInk[pulseAgeTint(r?.deltaYears)]} bg={calm.tint[pulseAgeTint(r?.deltaYears)]} />}
        stats={stats}
      />
      <Animated.ScrollView
        onScroll={onScroll}
        // ~30 events a second is plenty to collapse the header; 16 would send one every frame (Android throttles from 17).
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: clearance }}
        contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.foregroundSecondary} colors={[c.foreground]} progressBackgroundColor={c.card} />}
      >
        <View ref={content} collapsable={false}>
          {/* Bare chevrons and caps label: "‹ SEP 28 - OCT 4 ›" (spec §11 F15). */}
          <View style={{ marginBottom: 16, alignItems: "center" }}>
            <DateSwitcher {...dateSwitcher} loading={q.loading && !vm && !!q.data} />
          </View>
          {q.error && !vm ? (
            <LoadError onRetry={retry} />
          ) : (
            <View style={{ gap: 14 }}>
              <View style={{ gap: 14 }}>
                {/* The lead card; the header collapses once its bottom edge has scrolled under it. */}
                <View ref={hero} collapsable={false} onLayout={measure}>
                  {vm ? <Orb vm={vm} /> : <PulseAgeHeroSkeleton orbSize={290} />}
                </View>
                {s.summary}
              </View>
              {opened && s.insight}
              {opened && s.primary}
              {opened && <View style={{ gap: 14 }}>{s.secondary}</View>}
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </View>
  );
}
