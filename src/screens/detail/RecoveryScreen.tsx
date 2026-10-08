// Recovery `/recovery?d=` (spec §7.2), ported from the web's src/app/(app)/recovery/page.tsx.
import * as React from "react";
import { View } from "react-native";
import { Activity, Heart, Moon, Thermometer, Wind, type LucideIcon } from "lucide-react-native";
import type { RecoveryBand } from "@/lib/bands";
import { formatValue, type FormatKey } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import { getRecovery, type Contributor, type RecoveryVM } from "@/queries";
import { useQuery } from "@/state/app";
import { ContributorRow, DriverList, EmptyState, InsightCard, MetricTags, ReasonPlaceholder, ScoreDial, SectionShell, TrendChart, type TrendRange } from "@/ui";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { Capsule } from "@/ui/components/Meter";
import { Caption, Num, Sentence } from "./calmKit";
import { DetailScreen, LoadError, useAnchors } from "./DetailScreen";
import { RECOVERY_INFO } from "./info";
import { useBack, useDayNav, usePush, useRefresh } from "./nav";
import { recoverySkeleton } from "./skeletons";
import { LegendText, SummaryCard, trendProps } from "./view";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { useOpenChart } from "@/screens/chart/href";
import { dayHref } from "@/lib/day";
import { SLEEP_TAB } from "@/screens/home/tabs";

const ICON: Record<Contributor["key"], LucideIcon> = { hrv: Activity, rhr: Heart, resp: Wind, sleep: Moon, skinTemp: Thermometer };
const FORMAT: Record<Contributor["key"], FormatKey> = { hrv: "int", rhr: "int", resp: "decimal1", sleep: "int", skinTemp: "signed1" };
/** The chart each contributor opens (sleep opens the Sleep tab instead). */
const CONTRIBUTOR_CHART: Record<Exclude<Contributor["key"], "sleep">, string> = { hrv: "hrv", rhr: "rhr", resp: "resp", skinTemp: "skin_temp" };
/** A Recovery band's ink: green in mint, yellow in sand, red in rose (as the hero card's pastel). */
const BAND_INK: Record<RecoveryBand, (c: CalmPalette) => string> = { green: (c) => c.tintInk.mint, yellow: (c) => c.tintInk.sand, red: (c) => c.tintInk.rose };

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
  // Each contributor opens its own history: its chart, or the Sleep tab for the night behind it.
  const dParam = d === today ? undefined : d;
  const openContributor = (key: Contributor["key"]) =>
    key === "sleep" ? push(dayHref(SLEEP_TAB, d, today)) : openChart({ metric: CONTRIBUTOR_CHART[key], r: "m", d: dParam });
  return (
    <DetailScreen
      {...common}
      hero={<ScoreDial variant="recovery" size="lg" value={r.value} reason={r.reason} nightsLeft={r.nightsLeft} provisional={r.provisional} tags={r.tags} />}
      summary={
        <SummaryCard legend={<LegendText>Dot: today. Shaded: your normal range.</LegendText>}>
          {vm.contributors.map((c) => (
            <ContributorItem key={c.key} c={c} nightsLeft={r.nightsLeft} onPress={() => openContributor(c.key)} />
          ))}
        </SummaryCard>
      }
      insight={vm.insight ? <InsightCard body={vm.insight} action={{ label: "See what shaped it", onPress: () => anchors.scrollTo("drivers") }} /> : null}
      primary={
        <SectionShell variant="card" title={range === "w" ? "Weekly trends" : "Recovery trend"} action={<ExpandButton onPress={() => openChart({ metric: "recovery", r: range, d: d === today ? undefined : d })} />}>
          <TrendChart label="Recovery" unit="%" format="int" colorBy="band" direction="up" today={today} range={range} onRangeChange={setRange} onPress={(r) => openChart({ metric: "recovery", r, d: d === today ? undefined : d })} {...trend} />
        </SectionShell>
      }
      secondary={[
        <View key="drivers" ref={anchors.ref("drivers")} collapsable={false}>
          <SectionShell variant="card" title="What shaped it">
            <Drivers vm={vm} />
          </SectionShell>
        </View>,
        <SectionShell key="forecast" variant="card" title="Tomorrow’s forecast" fill>
          <Forecast vm={vm} />
        </SectionShell>,
      ]}
    />
  );
}

/** A contributor without a usable baseline (calibrating) reads as its reason rather than a bare number. */
function ContributorItem({ c, nightsLeft, onPress }: { c: Contributor; nightsLeft?: number; onPress: () => void }) {
  const t = useCalm();
  const metric = c.baseline || c.metric.value === null ? c.metric : { value: null, reason: "calibrating" as const, provisional: false, nightsLeft };
  const reason = metric.reason && metric.reason !== "no_data" ? reasonCopy(metric.reason, metric.nightsLeft ?? nightsLeft).long : undefined;
  const Icon = ICON[c.key];
  return (
    <ContributorRow
      variant="recovery"
      icon={<Icon size={20} color={t.tintInk.mint} strokeWidth={1.75} />}
      label={c.label}
      unit={c.unit}
      format={FORMAT[c.key]}
      metric={metric}
      baseline={c.baseline ?? { mean: 0, sd: 1 }}
      points={c.points}
      direction={c.direction}
      reasonCopy={reason}
      onPress={onPress}
    />
  );
}

function Drivers({ vm }: { vm: RecoveryVM }) {
  const m = vm.drivers;
  if (m.value === null && m.reason === "calibrating") return <EmptyState body="No drivers yet: Recovery needs 7 nights first." />;
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />;
  return <DriverList variant="recovery" unit="pts" data={m} inCard />;
}

/** Tomorrow's estimate: the number in its band's ink with its label under it, a short meter, then the sentence. */
function Forecast({ vm }: { vm: RecoveryVM }) {
  const c = useCalm();
  const f = vm.forecast;
  if (f.value === null)
    return <ReasonPlaceholder reason={f.reason} nightsLeft={f.nightsLeft} size="sm" copy={f.reason === "calibrating" ? "Forecast starts after 14 nights." : undefined} />;
  const ink = BAND_INK[f.value.band](c);
  return (
    <View style={{ gap: 12 }}>
      <View
        accessible
        accessibilityLabel={`Tomorrow ${formatValue("int", f.value.value)} percent, estimate`}
        style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", columnGap: 14, rowGap: 6 }}
      >
        <View>
          <Num value={formatValue("int", f.value.value)} unit="%" size={34} color={ink} />
          <Caption style={{ marginTop: 4 }}>Tomorrow</Caption>
        </View>
        <MetricTags extra={["estimate"]} align="flex-start" style={{ marginBottom: 2 }} />
      </View>
      <Capsule value={f.value.value / 100} color={ink} height={8} />
      <Sentence>Estimate. Based on today’s strain and your recent trend.</Sentence>
    </View>
  );
}
