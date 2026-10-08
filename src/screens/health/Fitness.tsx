// Fitness `/health/fitness` (spec §7.10), ported from Pulse's health/fitness/page.tsx and its loading.tsx: latest
// values, no date switcher.
import * as React from "react";
import { View } from "react-native";
import { Gauge } from "lucide-react-native";
import { DAY, formatDay, formatValue, MISSING } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { getFitness, type FitnessVM } from "@/queries";
import { useQuery } from "@/state/app";
import { MetricTags, ReasonPlaceholder, SectionShell, Skeleton, SkeletonText, TickScale, TickScaleSkeleton, TrendChart, TrendChartSkeleton, Txt, useTheme } from "@/ui";
import { useCalm } from "@/ui/calm";
import { TonePill } from "@/ui/components/Meter";
import { CalmCard, Caption, Num, Sentence } from "@/screens/detail/calmKit";
import { DetailScreen, LoadError } from "@/screens/detail/DetailScreen";
import { useBack, useRefresh } from "@/screens/detail/nav";
import { FITNESS_INFO } from "./detailInfo";
import { categoryInk, categoryWord, ordinal } from "./format";
import { LoadChart } from "./LoadChart";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { useOpenChart } from "@/screens/chart/href";

// Both thresholds follow the pipeline: ACWR shows after 14 days of strain (readiness `minChronic`), fitness and fatigue
// after 14 days in a row (training load `minimumDays`).
const NO_LOAD = "Training load needs about 3 weeks of strain.";
const NO_FFS = "Fitness, fatigue and form need 14 days of strain in a row.";
const FFS_CAPTION = "Fitness is your 42-day load, fatigue your 7-day load, form the difference.";

const STATUS: Record<NonNullable<FitnessVM["trainingLoad"]["value"]>["status"], { word: string; body: string }> = {
  detraining: { word: "Detraining", body: "Detraining: your recent load is well below your usual. Fitness slowly drops if this lasts." },
  optimal: { word: "Optimal", body: "Optimal: your recent load matches what you are used to." },
  pushing: { word: "Pushing", body: "Pushing: load is rising faster than usual. Watch your Recovery." },
  high_risk: { word: "High risk", body: "High risk: load jumped well above your usual. Injury and illness risk rise." },
};
const CATEGORIES = ["Poor", "Fair", "Good", "Excellent", "Superior"];
// Mobile: Fitness Age and Pulse's own VO2 max estimate (fitnessLevel.ts, ported from noop's FitnessAgeEngine).
const ESTIMATED = "Estimated from resting heart rate and activity";
const NO_FITNESS_AGE = "Fitness Age needs 4 of the last 7 days with a resting heart rate and 12 hours of heart rate.";

/** The lead card in the activity pastel: VO2 max large with its unit, its category, where it came from and the estimate tag. */
function Hero({ vo2 }: { vo2: FitnessVM["vo2"] }) {
  const c = useCalm();
  const v = vo2.value;
  if (!v)
    return (
      <CalmCard tint="sky" icon={Gauge} title="VO2 max" subtitle="No VO2 max yet. Fitbit estimates it from runs and resting heart rate." style={{ alignSelf: "stretch" }}>
        <Num value={MISSING} size={64} color={c.faint} />
      </CalmCard>
    );
  const source = v.source === "run" ? `Measured on ${formatDay(v.sourceDay, DAY.monthDay)}` : v.source === "daily" ? "Daily estimate from Fitbit" : ESTIMATED;
  return (
    <CalmCard tint="sky" icon={Gauge} title="VO2 max" subtitle={source} style={{ alignSelf: "stretch" }}>
      <View accessible accessibilityLabel={`VO2 max ${formatValue("decimal1", v.value)} millilitres per kilogram per minute, ${categoryWord(v.category)}`} style={{ gap: 6 }}>
        <Num value={formatValue("decimal1", v.value)} unit="ml/kg/min" size={64} color={c.tintInk.sky} />
        <Txt size={17} lineHeight={22} weight={600} style={{ color: categoryInk(c, v.category) }}>
          {categoryWord(v.category)}
        </Txt>
      </View>
      {vo2.provisional && <MetricTags extra={["estimate"]} align="flex-start" />}
    </CalmCard>
  );
}

function HeroSkeleton() {
  return (
    <CalmCard tint="sky" icon={Gauge} title="VO2 max" style={{ alignSelf: "stretch" }}>
      <View importantForAccessibility="no-hide-descendants" style={{ gap: 6 }}>
        <SkeletonText role="value" size={64} lineHeight={72} chars={4} />
        <SkeletonText role="label" width={64} />
      </View>
    </CalmCard>
  );
}

/** The five category words under the percentile ruler, the person's in bold. */
function Categories({ current }: { current?: string }) {
  const c = useCalm();
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ marginTop: 8, flexDirection: "row" }}>
      {CATEGORIES.map((w) => (
        <Txt key={w} size={12} lineHeight={16} align="center" weight={w === current ? 700 : 500} style={{ flex: 1, minWidth: 0, color: w === current ? c.ink : c.faint }}>
          {w}
        </Txt>
      ))}
    </View>
  );
}

function Percentile({ v }: { v: NonNullable<FitnessVM["vo2"]["value"]> }) {
  const people = v.sex === "male" ? "men" : "women";
  return (
    <SectionShell variant="card" title="Percentile">
      <TickScale
        variant="marker"
        label="VO2 max percentile"
        metric={{ value: v.percentile, reason: null, provisional: false }}
        min={0}
        max={100}
        format="int"
        describe={`${categoryWord(v.category)} for ${people} ${v.ageBand}`}
        bands={[
          { from: 0, to: 39.9, tone: "warning" },
          { from: 60, to: 100, tone: "optimal" },
        ]}
        ends={["0", "50", "100"]}
      />
      <Categories current={categoryWord(v.category)} />
      <View style={{ marginTop: 12 }}>
        <Sentence size={13}>{`${ordinal(v.percentile)} percentile for ${people} ${v.ageBand} (FRIEND registry).`}</Sentence>
      </View>
    </SectionShell>
  );
}

/** Fitness Age (Nes 2011, after noop): the age whose typical fitness matches yours, with the VO2 max it estimates. */
function FitnessAge({ m }: { m: FitnessVM["fitnessAge"] }) {
  const c = useCalm();
  const v = m.value;
  if (!v) return <ReasonPlaceholder reason="calibrating" size="md" copy={NO_FITNESS_AGE} />;
  const gap = v.fitnessAge - v.age;
  const chip = Math.abs(gap) < 0.5 ? { tone: "neutral" as const, text: "Your age" } : gap > 0 ? { tone: "warning" as const, text: `${formatValue("decimal1", gap)} years older` } : { tone: "optimal" as const, text: `${formatValue("decimal1", -gap)} years younger` };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <Num value={formatValue("decimal1", v.fitnessAge)} unit="years" size={36} color={c.tintInk.sky} />
        <TonePill tone={chip.tone}>{chip.text}</TonePill>
      </View>
      <Sentence>{`Your age ${formatValue("decimal1", v.age)}. Estimated VO2 max ${formatValue("decimal1", v.vo2max)} ml/kg/min, from a resting heart rate of ${formatValue("int", v.restingHr)} bpm.`}</Sentence>
      <Sentence size={13}>
        {`${ESTIMATED} (Nes 2011, the HUNT study${v.method === "uth" ? "; VO2 max from the ratio of your max to resting heart rate, Uth 2004, until you add your waist in Profile" : ""}). Good to about 5 years: a fitness comparison, not a medical test.`}
      </Sentence>
    </View>
  );
}

function TrainingLoad({ tl }: { tl: FitnessVM["trainingLoad"]["value"] }) {
  if (!tl) return <ReasonPlaceholder reason="calibrating" size="md" copy={NO_LOAD} />;
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <View>
          <Num value={formatValue("decimal2", tl.acwr)} size={36} />
          <Caption style={{ marginTop: 4 }}>Acute to chronic ratio</Caption>
        </View>
        <TonePill tone={tl.tone}>{STATUS[tl.status].word}</TonePill>
      </View>
      <TickScale
        variant="marker"
        label="Training load"
        metric={{ value: tl.acwr, reason: null, provisional: false }}
        min={0.5}
        max={2.5}
        format="decimal2"
        // Garmin's 2026 Load Ratio bands (readiness.ts acwrBand): optimal 0.8–1.5, high from 1.5 (very high from 2.0, which
        // the pill names).
        bands={[
          { from: 0.8, to: 1.5, tone: "optimal" },
          { from: 1.5, to: 2.5, tone: "warning" },
        ]}
        ends={["0.5", "1.0", "1.5", "2.0", "2.5"]}
      />
      <Sentence>{STATUS[tl.status].body}</Sentence>
    </View>
  );
}

/** Fitness loading (spec §7.10, §5.19): the VO2 max hero, Percentile, the VO2 max trend, Training load, then fitness, fatigue and form. */
function useFitnessSkeleton() {
  const { c } = useTheme();
  return {
    hero: <HeroSkeleton />,
    summary: (
      <SectionShell variant="card" title="Percentile">
        <View importantForAccessibility="no-hide-descendants">
          <TickScaleSkeleton variant="marker" />
          <Categories />
          <SkeletonText role="caption" width={256} style={{ marginTop: 12 }} />
        </View>
      </SectionShell>
    ),
    primary: (
      <SectionShell variant="card" title="VO2 max trend">
        <TrendChartSkeleton />
      </SectionShell>
    ),
    secondary: [
      <SectionShell key="age" variant="card" title="Fitness Age">
        <View importantForAccessibility="no-hide-descendants" style={{ gap: 12 }}>
          <SkeletonText role="valueXl" size={36} lineHeight={40} chars={4} />
          <SkeletonText role="body" width="80%" />
          <SkeletonText role="caption" width={256} />
        </View>
      </SectionShell>,
      <SectionShell key="load" variant="card" title="Training load">
        <View importantForAccessibility="no-hide-descendants" style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <SkeletonText role="valueXl" size={36} lineHeight={40} chars={4} />
            <Skeleton style={{ height: 24, width: 80 }} />
          </View>
          <TickScaleSkeleton variant="marker" />
          <View>
            <SkeletonText role="body" />
            <SkeletonText role="body" width="50%" />
          </View>
        </View>
      </SectionShell>,
      <SectionShell key="ffs" variant="card" title="Fitness, fatigue and form">
        <View importantForAccessibility="no-hide-descendants">
          <Skeleton radius={10} style={{ height: 220, backgroundColor: alpha(c.muted, 0.6) }} />
          <View style={{ marginTop: 8 }}>
            <Sentence size={13}>{FFS_CAPTION}</Sentence>
          </View>
        </View>
      </SectionShell>,
    ],
  };
}

/** Fitness `/health/fitness` (spec §7.10): latest values, no date switcher. */
export default function FitnessScreen() {
  const onBack = useBack("/health");
  const { refreshing, onRefresh, retry } = useRefresh();
  const { data: vm, error } = useQuery((ctx) => getFitness(ctx), [], "fitness");
  const skeleton = useFitnessSkeleton();
  const openChart = useOpenChart();
  const common = { title: "Fitness", info: FITNESS_INFO, onBack, refreshing, onRefresh } as const;

  if (error && !vm) return <DetailScreen {...common} primary={<LoadError onRetry={retry} />} />;
  if (!vm) return <DetailScreen {...common} {...skeleton} />;

  const v = vm.vo2.value;
  return (
    <DetailScreen
      {...common}
      hero={<Hero vo2={vm.vo2} />}
      summary={v ? <Percentile v={v} /> : undefined}
      primary={
        <SectionShell variant="card" title="VO2 max trend" action={<ExpandButton onPress={() => openChart({ metric: "vo2max", r: "6m" })} />}>
          <TrendChart
            onPress={(r) => openChart({ metric: "vo2max", r })}
            label="VO2 max"
            data={{ value: vm.trend.points.map((p) => ({ date: p.day, value: p.value })), reason: null, provisional: false }}
            unit="ml/kg/min"
            format="decimal1"
            colorBy="single"
            direction="up"
            defaultRange="6m"
          />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="age" variant="card" title="Fitness Age">
          <FitnessAge m={vm.fitnessAge} />
        </SectionShell>,
        <SectionShell key="load" variant="card" title="Training load">
          <TrainingLoad tl={vm.trainingLoad.value} />
        </SectionShell>,
        <SectionShell key="ffs" variant="card" title="Fitness, fatigue and form">
          {vm.loadReason ? (
            <ReasonPlaceholder reason={vm.loadReason.reason} size="md" copy={NO_FFS} />
          ) : (
            <>
              <LoadChart load={vm.load} />
              <View style={{ marginTop: 8 }}>
                <Sentence size={13}>{FFS_CAPTION}</Sentence>
              </View>
            </>
          )}
        </SectionShell>,
      ]}
    />
  );
}
