// Healthspan `/health/healthspan?d=` (spec §7.7), ported from Pulse's health/healthspan/page.tsx and its loading.tsx, as
// the design's Halo Age page: the large title with its week under it, the hero (the age in its gradient, rolling into
// place, the sentence, the scale of years against your real age, the Pace of Aging and week-on-week pills), then Pace of
// Aging on its ruler, the insight, the Halo Age history, and "What moves it": the nine inputs as grouped lists by area.
// Everything below the hero rises into place as the push lands; the knob springs, the number rolls (UI thread).
import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useDay } from "@/lib/day";
import { AGE_LABEL, formatValue, MISSING } from "@/lib/format";
import { getHealthspan, type HealthspanVM } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { EmptyState, InsightCard, SectionShell, SkeletonText, TickScaleSkeleton, TrendChart, TrendChartSkeleton, Txt, type DateSwitcherProps } from "@/ui";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { InsightCardSkeleton } from "@/ui/components/InsightCard";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { Sentence } from "@/screens/detail/calmKit";
import { useOpenChart } from "@/screens/chart/href";
import { ContributorList, ContributorListSkeleton } from "./ContributorCard";
import { HEALTHSPAN_INFO } from "./detailInfo";
import { HaloAgeHero, HaloAgeHeroSkeleton, PaceScale, type AgePill } from "./PulseAge";
import { DetailScreen, ErrorState } from "./shells";
import { weekBefore } from "./format";

/** A pace's colour: under 1.0x (aging slower) green, over it orange, level in ink. */
const paceInk = (c: CalmPalette, pace: number) => (pace < 1 ? c.tintInk.mint : pace > 1 ? c.tintInk.peach : c.ink);

/** The hero's pills: Pace of Aging, and how far the Halo Age moved since the week before. */
function pillsOf(vm: HealthspanVM, c: CalmPalette): AgePill[] {
  const r = vm.result.value;
  if (!r) return [];
  const prev = weekBefore(vm.history, vm.asOf);
  const delta = prev === null ? null : r.pulseAge - prev;
  const moved = delta === null ? null : formatValue("decimal1", Math.abs(delta)) === "0.0" ? 0 : delta;
  return [
    { label: "Pace of aging", value: r.pace == null ? MISSING : `${formatValue("decimal1", r.pace)}×`, color: r.pace == null ? c.faint : paceInk(c, r.pace), spoken: r.pace == null ? "not yet" : `${formatValue("decimal1", r.pace)} x` },
    ...(moved === null
      ? []
      : [
          {
            label: "vs. last week",
            value: moved === 0 ? "No change" : `${formatValue("signed1", moved)} yr`,
            color: moved === 0 ? c.ink : moved < 0 ? c.tintInk.mint : c.tintInk.peach,
            spoken: moved === 0 ? "no change" : `${formatValue("decimal1", Math.abs(moved))} years ${moved < 0 ? "younger" : "older"} than last week`,
          },
        ]),
  ];
}

/** The hero: the Halo Age in its gradient, your age under its scale, the pace pills and the provisional note. */
function Hero({ vm }: { vm: HealthspanVM }) {
  const c = useCalm();
  const r = vm.result.value;
  return (
    <HaloAgeHero age={r?.pulseAge ?? null} deltaYears={r?.deltaYears ?? null} provisional={vm.result.provisional} reason={vm.result.reason} yourAge={vm.age} pills={pillsOf(vm, c)}>
      {r && vm.result.provisional ? (
        <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
          Provisional: firms up with 20 days of data and at least 7 of its 9 inputs.
        </Txt>
      ) : null}
    </HaloAgeHero>
  );
}

function PaceOfAging({ vm }: { vm: HealthspanVM }) {
  const r = vm.result.value;
  const pace = r ? { value: r.pace, reason: r.pace == null ? ("calibrating" as const) : null, provisional: r.paceProvisional } : { value: null, reason: vm.result.reason, provisional: false };
  return (
    <SectionShell variant="card" title="Pace of Aging" accent={null}>
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

/** "What moves it": a section title over the three areas' grouped lists. */
function WhatMovesIt({ children }: { children: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={{ gap: 16, marginTop: 8 }}>
      <Txt size={22} lineHeight={28} weight={700} accessibilityRole="header" style={{ color: c.ink, paddingHorizontal: 4 }}>
        What moves it
      </Txt>
      {children}
    </View>
  );
}

/** The screen's sections; `vm` undefined is the loading shape (spec §5.19). */
function sectionsOf(vm: HealthspanVM | undefined, openHistory: () => void) {
  if (!vm)
    return {
      hero: <HaloAgeHeroSkeleton />,
      summary: (
        <SectionShell variant="card" title="Pace of Aging" accent={null}>
          <View importantForAccessibility="no-hide-descendants">
            <TickScaleSkeleton variant="marker" />
            <SkeletonText role="caption" width={256} style={{ marginTop: 12 }} />
            <SkeletonText role="caption" width={96} />
          </View>
        </SectionShell>
      ),
      insight: <InsightCardSkeleton title />,
      primary: (
        <SectionShell variant="card" title={`${AGE_LABEL} history`} accent={null}>
          <TrendChartSkeleton />
        </SectionShell>
      ),
      footer: (
        <WhatMovesIt>
          <ContributorListSkeleton title="Sleep" n={2} />
          <ContributorListSkeleton title="Strain" n={4} />
          <ContributorListSkeleton title="Fitness" n={3} />
        </WhatMovesIt>
      ),
    };
  const hasHistory = vm.history.some((p) => p.value !== null);
  const group = (g: "sleep" | "strain" | "fitness") => vm.contributors.filter((x) => x.group === g);
  return {
    hero: <Hero vm={vm} />,
    summary: <PaceOfAging vm={vm} />,
    insight: vm.insight ? <InsightCard title={vm.insight.title} body={vm.insight.body} /> : null,
    primary: (
      <SectionShell variant="card" title={`${AGE_LABEL} history`} accent={null} action={hasHistory ? <ExpandButton onPress={openHistory} /> : undefined}>
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
    footer: (
      <WhatMovesIt>
        <ContributorList title="Sleep" items={group("sleep")} />
        <ContributorList title="Strain" items={group("strain")} />
        <ContributorList title="Fitness" items={group("fitness")} />
      </WhatMovesIt>
    ),
  };
}

/** Healthspan `/health/healthspan?d=` (spec §7.7): the ISO week containing `d`. */
export default function HealthspanScreen() {
  const router = useRouter();
  const app = useApp();
  const { d, today } = useDay();
  const q = useQuery((ctx) => getHealthspan(d, ctx), [d], `healthspan:${d}`);
  // A query for another week is still in flight: show the loading shape, not the previous week.
  const vm = q.data && q.data.day === d ? q.data : undefined;
  const n = vm?.nextUpdateInDays ?? 0;
  const subtitle = n > 0 ? `Next update in ${n} ${n === 1 ? "day" : "days"}` : undefined;
  const dateSwitcher: DateSwitcherProps = { mode: "week", date: d, today, firstDay: app.sync.firstDay, onChange: (day) => router.setParams({ d: day === today ? undefined : day }), loading: q.loading && !vm && !!q.data };
  const openChart = useOpenChart();
  // The sections only change with the week's data.
  const s = React.useMemo(() => sectionsOf(vm, () => openChart({ metric: "pulse_age", r: "6m" })), [vm, openChart]);
  const common = { title: AGE_LABEL, subtitle, info: HEALTHSPAN_INFO, dateSwitcher, backTo: "/health" } as const;

  if (q.error && !vm) return <DetailScreen {...common} primary={<ErrorState error={q.error} />} />;
  return <DetailScreen {...common} hero={s.hero} summary={s.summary} insight={s.insight} primary={s.primary} footer={s.footer} />;
}
