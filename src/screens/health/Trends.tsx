// Trends `/trends?metric=&r=` (More, U21), ported from Pulse's trends/page.tsx, parts.tsx, MetricSheet.tsx and
// loading.tsx, as an Apple Health detail page: the metric on show as a card (its area's coloured icon square, the area
// in small capitals over the metric's name, the up-down chevrons that open the picker), the chart with its headline and
// range control (W / M / 6M / 1Y), then each range's average against the one before as a grouped list.
import * as React from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChartLine, ChevronDown, ChevronsUpDown } from "lucide-react-native";
import { getTrends, parseTrendMetric, RANGES, TREND_GROUPS, TREND_METRICS, type TrendGroup, type TrendMetricKey, type TrendRange } from "@/queries";
import { localizeDef } from "@/queries/units";
import { useApp, useQuery } from "@/state/app";
import { trendGoal, useGoals } from "@/state/goals";
import { useUnits } from "@/state/units";
import { BottomSheet, KeyStatRow, KeyStatRowSkeleton, SectionShell, TrendChart, TrendChartSkeleton } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { Caption, Num, Title } from "@/screens/detail/calmKit";
import { CalmChip, IconTile } from "@/screens/settings/calmKit";
import { Card } from "@/ui/components/Card";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { useOpenChart } from "@/screens/chart/href";
import { DetailScreen, ErrorState, usePush } from "./shells";
import { mapMetric, Rows } from "./view";

export const PERIOD: Record<TrendRange, { label: string; prior: string }> = {
  w: { label: "Last 7 days", prior: "the 7 days before" },
  m: { label: "Last 30 days", prior: "the 30 days before" },
  "6m": { label: "Last 6 months", prior: "the 6 months before" },
  "1y": { label: "Last 12 months", prior: "the year before" },
};

const GROUPS = TREND_GROUPS.map((g) => ({ group: g, metrics: TREND_METRICS.filter((m) => m.group === g) }));

/** Each section's system colour: recovery and sleep green, activity blue, body yellow, nutrition orange, vitals pink. */
const GROUP_TINT: Record<TrendGroup, CalmTint> = { "Recovery & sleep": "mint", Activity: "sky", Body: "sand", Nutrition: "peach", Vitals: "rose" };

/**
 * The metric picker (spec §7.17): the lead card naming the section and the metric on show. A tap opens a bottom sheet of
 * the sections, the current one open, its metrics as wrapping chips (one section at a time, so the sheet stays about a
 * screen tall). A tap on a metric switches and closes; the range stays.
 */
function MetricPicker({ current, onPick }: { current: TrendMetricKey; onPick: (key: TrendMetricKey) => void }) {
  const c = useCalm();
  const metric = TREND_METRICS.find((m) => m.key === current) ?? TREND_METRICS[0];
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string>(metric.group);
  const tint = GROUP_TINT[metric.group];
  return (
    <>
      <Card
        accessibilityLabel={`Metric: ${metric.label}, ${metric.group}. Change metric`}
        onPress={() => {
          setExpanded(metric.group);
          setOpen(true);
        }}
        padding={14}
      >
        <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconTile icon={ChartLine} tint={tint} size={36} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Caption>{metric.group}</Caption>
            <Title>{metric.label}</Title>
          </View>
          <ChevronsUpDown size={20} color={c.tertiary} strokeWidth={2} />
        </View>
      </Card>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Metric">
        {GROUPS.map(({ group, metrics }, i) => {
          const on = group === expanded;
          return (
            <View key={group} style={{ borderBottomWidth: i < GROUPS.length - 1 ? 0.5 : 0, borderBottomColor: c.line }}>
              <Pressable
                onPress={() => setExpanded(group)}
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <Title size={16} color={on ? c.teal : undefined}>
                  {group}
                </Title>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Num value={String(metrics.length)} size={15} color={c.sub} />
                  <ChevronDown size={20} color={c.tertiary} strokeWidth={2} style={{ transform: [{ rotate: on ? "180deg" : "0deg" }] }} />
                </View>
              </Pressable>
              {on && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 16 }}>
                  {metrics.map((m) => {
                    const selected = m.key === metric.key;
                    return (
                      <CalmChip
                        key={m.key}
                        label={m.label}
                        selected={selected}
                        role="button"
                        onPress={() => {
                          setOpen(false);
                          if (!selected) onPick(m.key);
                        }}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </BottomSheet>
    </>
  );
}

export default function TrendsScreen() {
  const params = useLocalSearchParams<{ metric?: string; r?: string }>();
  const router = useRouter();
  const push = usePush();
  const openChart = useOpenChart();
  const { today } = useApp();
  const { goals } = useGoals();
  // In the person's units (Settings › Units): the unit beside every number, and the goal line, as the points are.
  const { units } = useUnits();
  const m = localizeDef(parseTrendMetric(params.metric), units);
  // A metric with a goal switched on (Settings › Goals) draws it as a dashed line.
  const goal = trendGoal(goals, m.key, units);
  const r: TrendRange = typeof params.r === "string" && (RANGES as readonly string[]).includes(params.r) ? (params.r as TrendRange) : "m";
  const { data, error } = useQuery((ctx) => getTrends(m.key, ctx), [m.key], `trends:${m.key}`);
  // A model worked out in other units (just before a switch) waits for its replacement.
  const vm = data && data.metric === m.key && data.unit === m.unit ? data : undefined;
  const picker = <MetricPicker current={m.key} onPick={(key) => router.setParams({ metric: key })} />;

  let body: React.ReactNode;
  if (error && !vm) body = <ErrorState error={error} />;
  else if (!vm)
    body = (
      <View style={{ gap: 14 }}>
        <SectionShell variant="card" title={m.label}>
          <TrendChartSkeleton chip ranges={RANGES} />
        </SectionShell>
        <SectionShell variant="card" title="Averages">
          <Rows>
            {RANGES.map((x) => (
              <KeyStatRowSkeleton key={x} variant="row" label={PERIOD[x].label} />
            ))}
          </Rows>
        </SectionShell>
      </View>
    );
  else {
    // Rounded as the chip shows it, so 0.04 km reads "+0.04", not "0.00".
    const k = m.format === "decimal2" ? 100 : 10;
    const deltas = Object.fromEntries(
      vm.periods.map((p) => [p.range, p.average.value === null || p.prior === null ? null : Math.round((p.average.value - p.prior) * k) / k]),
    ) as Record<TrendRange, number | null>;
    body = (
      <View style={{ gap: 14 }}>
        <SectionShell variant="card" title={m.label} aside={<ExpandButton onPress={() => openChart({ metric: m.key, r })} />} action={{ label: "Details", onPress: () => push(m.href) }}>
          <TrendChart
            key={m.key}
            onPress={(range) => openChart({ metric: m.key, r: range })}
            label={m.label}
            unit={m.unit}
            format={m.format}
            colorBy={m.colorBy}
            direction={m.direction}
            data={mapMetric(vm.points, (ps) => ps.map((p) => ({ date: p.day, value: p.value, provisional: p.provisional })))}
            deltas={deltas}
            ranges={RANGES}
            range={r}
            onRangeChange={(next) => router.setParams({ r: next })}
            reference={goal !== null ? { y: goal, label: "Goal" } : undefined}
            today={today}
          />
        </SectionShell>
        <SectionShell variant="card" title="Averages">
          <Rows>
            {vm.periods.map((p) => (
              <KeyStatRow
                key={p.range}
                variant="row"
                label={PERIOD[p.range].label}
                caption={`vs. ${PERIOD[p.range].prior}`}
                metric={p.average}
                unit={m.unit}
                format={m.format}
                average={p.prior}
                averageLabel={PERIOD[p.range].prior}
                direction={m.direction}
              />
            ))}
          </Rows>
        </SectionShell>
      </View>
    );
  }

  return (
    <DetailScreen
      title="Trends"
      primary={
        <View style={{ gap: 14 }}>
          {picker}
          {body}
        </View>
      }
    />
  );
}
