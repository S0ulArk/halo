// A metric's own screen `/metric/[key]?d=&r=` (spec §11 MD1), ported from Pulse's metric/[key]/page.tsx and its
// loading.tsx: the day, its history, then the metric's own sections.
import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { deltaTone } from "@/lib/bands";
import { useDay } from "@/lib/day";
import { DAY, formatDay, formatValue } from "@/lib/format";
import { DASHBOARD_LABEL, getMetricDetail, isDetailKey, RANGES, type DetailKey, type MetricDetailVM, type TrendRange } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { trendGoal, useGoals } from "@/state/goals";
import { ChartLine } from "lucide-react-native";
import { DeltaMark, EmptyState, KeyStatRowSkeleton, MetricState, MetricTags, ReasonPlaceholder, SectionShell, SkeletonText, TrendChart, TrendChartSkeleton, useTheme, type TrendSeries } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { CalmCard, Caption, Num, Sentence, toneInk } from "@/screens/detail/calmKit";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { useOpenChart } from "@/screens/chart/href";
import { MetricSection, RangeStatsCard } from "./MetricSections";
import { DetailScreen, ErrorState, useDaySwitcher } from "./shells";
import { mapMetric, Rows, STAT_ICON } from "./view";

const unitText = (unit?: string) => (unit ? (unit === "%" ? "%" : ` ${unit}`) : "");

/** Each metric group's pastel: activity sky, body sand, nutrition peach, vitals rose. */
const GROUP_TINT: Record<MetricDetailVM["group"], CalmTint> = { activity: "sky", body: "sand", nutrition: "peach", vitals: "rose" };

/** The lead card in the metric's pastel: the day's value (a reading metric's latest reading) against its 30-day average. */
function Hero({ vm }: { vm: MetricDetailVM }) {
  const c = useCalm();
  const tint = GROUP_TINT[vm.group];
  const ink = c.tintInk[tint];
  // The date switcher names the day; a reading from an earlier day says which.
  const when = vm.valueDay && vm.valueDay !== vm.day ? `Latest reading, ${formatDay(vm.valueDay, DAY.short)}` : null;
  return (
    <CalmCard tint={tint} icon={STAT_ICON[vm.key] ?? ChartLine} title={when ?? (vm.soFar ? "So far today" : vm.day === vm.today ? "Today" : "This day")} style={{ alignSelf: "stretch" }}>
      <MetricState metric={vm.value} skeleton={null} renderReason={(r) => <ReasonPlaceholder reason={r} size="lg" style={{ paddingVertical: 12 }} />}>
        {(value) => {
          const avg = vm.average;
          const t = avg !== null ? deltaTone(vm.direction, value, avg, vm.sd) : null;
          const diff = avg !== null ? value - avg : null;
          const toneColor = t ? toneInk(c, t.tone) : c.sub;
          return (
            <View style={{ gap: 10 }}>
              <View accessible accessibilityLabel={`${formatValue(vm.format, value)}${unitText(vm.unit)}`}>
                <Num value={formatValue(vm.format, value)} unit={vm.unit} size={64} color={ink} />
              </View>
              {vm.soFar && <MetricTags extra={["so_far"]} align="flex-start" />}
              {/* A running total against whole days would always read "below": today shows the average alone. */}
              {t && diff !== null && !vm.soFar && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <DeltaMark dir={t.dir} tone={t.tone} color={toneColor} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Sentence color={t.tone === "neutral" ? undefined : toneColor}>
                      {t.dir === "flat"
                        ? "In line with your 30-day average"
                        : `${formatValue(vm.format, Math.abs(diff))}${unitText(vm.unit)} ${t.dir === "up" ? "above" : "below"} your 30-day average`}
                    </Sentence>
                  </View>
                </View>
              )}
              {avg === null ? (
                <Sentence size={13}>No 30-day average yet</Sentence>
              ) : (
                <View accessible accessibilityLabel={`30-day average ${formatValue(vm.format, avg)}${unitText(vm.unit)}`}>
                  <Num value={formatValue(vm.format, avg)} unit={vm.unit} size={20} />
                  <Caption style={{ marginTop: 4 }}>30-day average</Caption>
                </View>
              )}
            </View>
          );
        }}
      </MetricState>
    </CalmCard>
  );
}

function Loading({ title, dateSwitcher }: { title: string; dateSwitcher: React.ComponentProps<typeof DetailScreen>["dateSwitcher"] }) {
  const c = useCalm();
  return (
    <DetailScreen
      title={title}
      dateSwitcher={dateSwitcher}
      hero={
        <View importantForAccessibility="no-hide-descendants" style={{ alignSelf: "stretch", gap: 10, borderRadius: 32, borderWidth: 1, borderColor: c.edge, backgroundColor: c.card, ...(c.shadow ? { boxShadow: c.shadow } : null), padding: 20 }}>
          <SkeletonText role="caption" width={64} />
          <SkeletonText role="value" size={64} lineHeight={72} chars={5} />
          <SkeletonText role="caption" width={160} />
        </View>
      }
      primary={
        <View style={{ gap: 14 }}>
          <SectionShell variant="card" title="History">
            <TrendChartSkeleton chip ranges={RANGES} />
          </SectionShell>
          <SectionShell variant="card" title="Last 30 days">
            <Rows>
              {["Daily average", "Highest", "Lowest", "Days with data"].map((l) => (
                <KeyStatRowSkeleton key={l} variant="row" label={l} />
              ))}
            </Rows>
          </SectionShell>
        </View>
      }
    />
  );
}

function Screen({ metricKey }: { metricKey: DetailKey }) {
  const { d, today } = useDay();
  const { timeZone } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const openChart = useOpenChart();
  const params = useLocalSearchParams<{ r?: string }>();
  const range: TrendRange = typeof params.r === "string" && (RANGES as readonly string[]).includes(params.r) ? (params.r as TrendRange) : "m";
  const dateSwitcher = useDaySwitcher(d, today);
  const { goals } = useGoals();
  // The person's own goal (Settings › Goals) takes the reference line's place; without one, the metric's reference stays.
  const goal = trendGoal(goals, metricKey);
  const { data, error } = useQuery((ctx) => getMetricDetail(metricKey, d, ctx), [metricKey, d], `metric:${metricKey}:${d}`);
  const vm = data && data.key === metricKey && data.day === d ? data : undefined;
  const title = vm?.label ?? DASHBOARD_LABEL[metricKey];

  if (error && !vm) return <DetailScreen title={title} dateSwitcher={dateSwitcher} primary={<ErrorState error={error} />} />;
  if (!vm) return <Loading title={title} dateSwitcher={dateSwitcher} />;

  const stack: Record<"calories" | "distance", readonly TrendSeries[]> = {
    calories: [
      { key: "resting", label: "Resting", color: c.energyResting },
      { key: "everyday", label: "Everyday", color: c.energyActive },
      { key: "workouts", label: "Workouts", color: c.chart4 },
    ],
    distance: [
      { key: "everyday", label: "Everyday", color: c.energyResting },
      { key: "workouts", label: "Workouts", color: c.energyActive },
    ],
  };
  const empty = vm.value.value === null && vm.history.value === null;
  // The day's hourly view sits under the hero; every other section follows the history.
  const [first, ...rest] = vm.sections;
  const lead = first?.kind === "hourly" && !empty ? first : null;
  const more = lead ? rest : vm.sections;
  // Rounded as the chip shows it, so 0.04 km reads "+0.04", not "0.00".
  const k = vm.format === "decimal2" ? 100 : vm.format === "decimal1" ? 10 : 1;
  const deltas = Object.fromEntries(
    RANGES.map((r) => [r, vm.ranges[r].average === null || vm.ranges[r].prior === null ? null : Math.round((vm.ranges[r].average! - vm.ranges[r].prior!) * k) / k]),
  ) as Record<TrendRange, number | null>;
  const label = vm.label.toLowerCase();

  return (
    <DetailScreen
      title={vm.label}
      dateSwitcher={dateSwitcher}
      hero={<Hero vm={vm} />}
      summary={lead && <MetricSection s={lead} vm={vm} timeZone={timeZone} />}
      primary={
        empty ? (
          <SectionShell variant="card" title="History">
            <EmptyState
              body={
                vm.group === "nutrition"
                  ? `No ${label} logged yet. Log it in Halo’s Journal, or in Fitbit or another app that writes to Health Connect, and it shows here.`
                  : `No ${label} from Health Connect yet. It shows here once your phone, Fitbit or a connected device records it and syncs.`
              }
            />
          </SectionShell>
        ) : (
          <View style={{ gap: 14 }}>
            <SectionShell variant="card" title="History" action={<ExpandButton onPress={() => openChart({ metric: vm.key, r: range, d: vm.day === today ? undefined : vm.day })} />}>
              <TrendChart
                key={vm.key}
                onPress={(r) => openChart({ metric: vm.key, r, d: vm.day === today ? undefined : vm.day })}
                label={vm.label}
                unit={vm.unit}
                format={vm.format}
                colorBy="single"
                direction={vm.direction}
                data={mapMetric(vm.history, (ps) => ps.map((p) => ({ date: p.day, value: p.value, provisional: p.provisional, parts: p.parts })))}
                deltas={deltas}
                ranges={RANGES}
                range={range}
                onRangeChange={(r) => router.setParams({ r })}
                stack={vm.chart.stack && stack[vm.chart.stack]}
                reference={goal !== null ? { y: goal, label: "Goal" } : vm.chart.reference}
                baseline={vm.chart.baseline}
                smooth={vm.chart.smooth}
                today={today}
              />
            </SectionShell>
            <RangeStatsCard ranges={vm.ranges} format={vm.format} unit={vm.unit} direction={vm.direction} total={vm.total} range={range} />
          </View>
        )
      }
      secondary={empty ? [] : more.map((s) => <MetricSection key={s.kind} s={s} vm={vm} timeZone={timeZone} />)}
      footer={
        <SectionShell variant="card" title={`About ${label}`}>
          <View style={{ gap: 8 }}>
            <Sentence>{vm.about}</Sentence>
            <Sentence>{vm.source}</Sentence>
          </View>
        </SectionShell>
      }
    />
  );
}

/** `/metric/[key]`: an unknown key gets the not-found state (the web's notFound()). */
export default function MetricDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const k = typeof key === "string" ? key : "";
  if (!isDetailKey(k)) return <DetailScreen title="Metric" primary={<EmptyState body="This metric does not exist." />} />;
  return <Screen metricKey={k} />;
}
