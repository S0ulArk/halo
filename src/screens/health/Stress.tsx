// Stress Monitor `/health/stress?d=` (spec §7.9), ported from Pulse's health/stress/page.tsx and its loading.tsx, as an
// Apple Health detail page: the large title with the day under it, the gauge ring (it sweeps to the latest score as the
// number rolls in), the insight, the day's line, the day's minutes per level as one capsule over the typical same
// weekday's (dimmed) with each level's time in a grouped list, the breathing entry, then the 30-day trend.
import * as React from "react";
import { View } from "react-native";
import { clock, dayLabel, durationWords, hmm } from "@/lib/format";
import { useDay } from "@/lib/day";
import { alpha } from "@/lib/utils";
import { getStress, type StressVM } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { EmptyState, InsightCard, MetricState, ScoreDial, ScoreDialSkeleton, SectionShell, Skeleton, SkeletonText, TrendChart, TrendChartSkeleton, Txt, useTheme } from "@/ui";
import { useCalm } from "@/ui/calm";
import { Num, Sentence, Title } from "@/screens/detail/calmKit";
import { Hairline } from "@/screens/settings/calmKit";
import { Grow } from "./kit";
import type { ColorToken } from "@/ui/theme";
import { STRESS_INFO } from "./info";
import { DetailScreen, ErrorState, useDaySwitcher } from "./shells";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { useOpenChart } from "@/screens/chart/href";
import { StressChart, StressChartSkeleton } from "./StressChart";
import { BreatheCard } from "@/screens/breathe/entries";

const EMPTY = "No still minutes to score yet today.";

const LEVEL_KEYS: { key: "lowMin" | "mediumMin" | "highMin"; word: string; color: ColorToken }[] = [
  { key: "lowMin", word: "Low", color: "stressLow" },
  { key: "mediumMin", word: "Medium", color: "stressMedium" },
  { key: "highMin", word: "High", color: "stressHigh" },
];

type Levels = NonNullable<StressVM["levels"]["value"]>;

/** One capsule split in three, each level as wide as its share of the day's scored minutes, wiping in once. */
function LevelBar({ m, height, dim }: { m: { lowMin: number; mediumMin: number; highMin: number }; height: number; dim?: boolean }) {
  const { c } = useTheme();
  return (
    <Grow mode="wipe" style={{ height }}>
      <View style={{ height, flexDirection: "row", gap: 2, opacity: dim ? 0.35 : 1 }}>
        {LEVEL_KEYS.map((k) => (m[k.key] > 0 ? <View key={k.key} style={{ flexGrow: m[k.key], borderRadius: height / 2, backgroundColor: c[k.color] }} /> : null))}
      </View>
    </Grow>
  );
}

function typicalLine(l: Levels) {
  if (l.typicalDeltaMin === null) return null;
  const m = Math.round(l.typicalDeltaMin);
  const delta = Math.abs(m) < 1 ? "about the same high stress" : `${durationWords(Math.abs(m))} ${m > 0 ? "more" : "less"} high stress`;
  return `vs. your typical ${l.weekday}: ${delta}`;
}

/**
 * The reference app's "Total day": the day's minutes per level over the typical same weekday (dimmed), then the three
 * durations in their level colours.
 */
function TotalDay({ l, day }: { l: Levels; day: string }) {
  const { c } = useTheme();
  const calm = useCalm();
  const total = l.lowMin + l.mediumMin + l.highMin;
  if (!total) return <EmptyState body={EMPTY} />;
  const line = typicalLine(l);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 2 }}>
        <Title size={15}>{`${day} stress`}</Title>
        {l.typical && <Sentence size={13}>{`vs. typical ${l.weekday}, the fainter bar`}</Sentence>}
      </View>
      <View style={{ gap: 6 }}>
        <LevelBar m={l} height={12} />
        {l.typical && <LevelBar m={l.typical} height={8} dim />}
      </View>
      {/* Each level as a row: its colour, its name, the typical time under it, its time on the day on the right. */}
      <View>
        {LEVEL_KEYS.map((k, i) => (
          <React.Fragment key={k.key}>
            {i > 0 ? <Hairline inset={20} /> : null}
            <View
              accessible
              accessibilityLabel={`${k.word}: ${durationWords(Math.round(l[k.key]))}${l.typical ? `, typical ${durationWords(Math.round(l.typical[k.key]))}` : ""}`}
              style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c[k.color] }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={16} lineHeight={21} style={{ color: calm.ink }}>
                  {k.word}
                </Txt>
                {l.typical && <Sentence size={13}>{`Typical ${hmm(l.typical[k.key])}`}</Sentence>}
              </View>
              <Num value={hmm(l[k.key])} size={20} color={c[k.color]} />
            </View>
          </React.Fragment>
        ))}
      </View>
      {line && <Sentence size={13}>{line}</Sentence>}
    </View>
  );
}

function TotalDaySkeleton() {
  return (
    <View style={{ gap: 16 }}>
      <SkeletonText role="label" width={192} />
      <View style={{ gap: 6 }}>
        <Skeleton radius={4} style={{ height: 12 }} />
        <Skeleton radius={4} style={{ height: 8 }} />
      </View>
      <View>
        {["Low", "Medium", "High"].map((w, i) => (
          <React.Fragment key={w}>
            {i > 0 ? <Hairline inset={20} /> : null}
            <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
              <Skeleton radius={5} style={{ width: 10, height: 10 }} />
              <View style={{ flex: 1 }}>
                <SkeletonText size={16} lineHeight={21} width={72} />
              </View>
              <SkeletonText role="value" chars={4} />
            </View>
          </React.Fragment>
        ))}
      </View>
      <SkeletonText role="caption" width={224} />
    </View>
  );
}

export default function StressScreen() {
  const { d, today } = useDay();
  const { timeZone } = useApp();
  const { data, error } = useQuery((ctx) => getStress(d, ctx), [d], `stress:${d}`);
  const dateSwitcher = useDaySwitcher(d, today);
  const openChart = useOpenChart();
  const openDay = () => openChart({ metric: "stress", r: "day", d: d === today ? undefined : d });
  const { c } = useTheme();
  const vm = data && data.day === d ? data : undefined;

  if (error && !vm) return <DetailScreen title="Stress Monitor" info={STRESS_INFO} dateSwitcher={dateSwitcher} primary={<ErrorState error={error} />} />;

  if (!vm)
    return (
      <DetailScreen
        title="Stress Monitor"
        dateSwitcher={dateSwitcher}
        info={STRESS_INFO}
        hero={<ScoreDialSkeleton variant="gauge" size="lg" />}
        insight={<InsightCard.Skeleton />}
        primary={
          <SectionShell variant="card" title={d === today ? "Today" : dayLabel(d, today)}>
            <StressChartSkeleton variant="full" />
          </SectionShell>
        }
        secondary={[
          <SectionShell key="levels" variant="card" title="Total day">
            <TotalDaySkeleton />
          </SectionShell>,
          <SectionShell key="trend" variant="card" title="30-day trend">
            <TrendChartSkeleton />
          </SectionShell>,
        ]}
      />
    );

  const g = vm.gauge;
  const dayName = vm.isToday ? "Today" : dayLabel(d, today);
  const chart = vm.chart.value
    ? {
        ...vm.chart,
        value: {
          points: vm.chart.value.points.map((p) => ({ t: p.t, value: p.v })),
          spans: vm.chart.value.spans.map((s) => ({ ...s, kind: s.kind === "workout" ? ("workout" as const) : ("sleep" as const) })),
          now: vm.chart.value.now ?? undefined,
        },
      }
    : { ...vm.chart, value: null };

  return (
    <DetailScreen
      title="Stress Monitor"
      dateSwitcher={dateSwitcher}
      info={STRESS_INFO}
      hero={
        <View style={{ alignSelf: "stretch", gap: 8 }}>
          <ScoreDial
            variant="gauge"
            size="lg"
            value={g.value?.value ?? null}
            reason={g.reason}
            provisional={g.provisional}
            caption={g.value ? (g.value.dayAverage || !vm.isToday ? "Day average" : g.value.at ? `Last updated ${clock(g.value.at, timeZone)}` : undefined) : undefined}
          />
          {g.reason === "no_data" && (
            <View style={{ paddingHorizontal: 4 }}>
              <Sentence size={13}>{EMPTY}</Sentence>
            </View>
          )}
        </View>
      }
      insight={vm.insight ? <InsightCard body={vm.insight} /> : null}
      primary={
        <SectionShell variant="card" title={dayName} action={chart.value ? <ExpandButton onPress={openDay} /> : undefined}>
          <StressChart variant="full" data={chart} timeZone={timeZone} onPress={openDay} />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="levels" variant="card" title="Total day">
          <MetricState metric={vm.levels} skeleton={<Skeleton style={{ height: 96, backgroundColor: alpha(c.muted, 0.6) }} />} renderReason={() => <EmptyState body={EMPTY} />}>
            {(l) => <TotalDay l={l} day={dayName} />}
          </MetricState>
        </SectionShell>,
        <BreatheCard key="breathe" />,
        <SectionShell key="trend" variant="card" title="30-day trend" action={<ExpandButton onPress={() => openChart({ metric: "stress", r: "m", d: d === today ? undefined : d })} />}>
          <TrendChart
            onPress={(r) => openChart({ metric: "stress", r, d: d === today ? undefined : d })}
            label="Stress"
            data={{ value: vm.trend.points.map((p) => ({ date: p.day, value: p.value })), reason: null, provisional: false }}
            format="decimal1"
            colorBy="stress"
            direction="down"
            fixedRange="m"
            today={today}
          />
        </SectionShell>,
      ]}
    />
  );
}
