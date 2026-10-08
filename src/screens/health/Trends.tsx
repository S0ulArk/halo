// Trends `/trends?metric=&r=` (More, U21), ported from Pulse's trends/page.tsx, parts.tsx, MetricSheet.tsx and
// loading.tsx: one daily metric over up to a year, each range against the one before.
import * as React from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChartLine, ChevronDown, ChevronsUpDown } from "lucide-react-native";
import { getTrends, parseTrendMetric, RANGES, TREND_GROUPS, TREND_METRICS, type TrendGroup, type TrendMetricKey, type TrendRange } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { trendGoal, useGoals } from "@/state/goals";
import { BottomSheet, KeyStatRow, KeyStatRowSkeleton, SectionShell, TrendChart, TrendChartSkeleton, Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { Caption, IconTile, Num, Title } from "@/screens/detail/calmKit";
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

/** Each section's pastel: recovery and sleep mint, activity sky, body sand, nutrition peach, vitals rose. */
const GROUP_TINT: Record<TrendGroup, CalmTint> = { "Recovery & sleep": "mint", Activity: "sky", Body: "sand", Nutrition: "peach", Vitals: "rose" };

/**
 * The metric picker (spec §7.17): the lead card, in the section's pastel, naming the section and the metric on show. A
 * tap opens a bottom sheet of the sections, the current one open, its metrics as wrapping chips (one section at a time,
 * so the sheet stays about a screen tall). A tap on a metric switches and closes; the range stays.
 */
function MetricPicker({ current, onPick }: { current: TrendMetricKey; onPick: (key: TrendMetricKey) => void }) {
  const c = useCalm();
  const metric = TREND_METRICS.find((m) => m.key === current) ?? TREND_METRICS[0];
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string>(metric.group);
  const tint = GROUP_TINT[metric.group];
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Metric: ${metric.label}, ${metric.group}. Change metric`}
        onPress={() => {
          setExpanded(metric.group);
          setOpen(true);
        }}
        style={({ pressed }) => ({ minHeight: 72, flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 32, borderWidth: 1, borderColor: c.tintEdge[tint], backgroundColor: c.tint[tint], ...(c.shadow ? { boxShadow: c.shadow } : null), paddingHorizontal: 18, paddingVertical: 14, opacity: pressed ? 0.92 : 1 })}
      >
        <IconTile icon={ChartLine} color={c.tintInk[tint]} bg={c.chip} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Caption>{metric.group}</Caption>
          <Title>{metric.label}</Title>
        </View>
        <ChevronsUpDown size={20} color={c.sub} strokeWidth={1.75} />
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Metric">
        {GROUPS.map(({ group, metrics }, i) => {
          const on = group === expanded;
          return (
            <View key={group} style={{ borderBottomWidth: i < GROUPS.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
              <Pressable
                onPress={() => setExpanded(group)}
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <Title size={16}>{group}</Title>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Num value={String(metrics.length)} size={15} color={c.sub} />
                  <ChevronDown size={20} color={c.sub} strokeWidth={1.75} style={{ transform: [{ rotate: on ? "180deg" : "0deg" }] }} />
                </View>
              </Pressable>
              {on && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 16 }}>
                  {metrics.map((m) => {
                    const selected = m.key === metric.key;
                    return (
                      <Pressable
                        key={m.key}
                        onPress={() => {
                          setOpen(false);
                          if (!selected) onPick(m.key);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => ({
                          minHeight: 40,
                          borderRadius: 20,
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          justifyContent: "center",
                          backgroundColor: selected ? c.teal : c.tint[GROUP_TINT[group]],
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <Txt size={14} lineHeight={20} weight={600} style={{ color: selected ? c.card : c.ink }}>
                          {m.label}
                        </Txt>
                      </Pressable>
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
  const m = parseTrendMetric(params.metric);
  // A metric with a goal switched on (Settings › Goals) draws it as a dashed line.
  const goal = trendGoal(goals, m.key);
  const r: TrendRange = typeof params.r === "string" && (RANGES as readonly string[]).includes(params.r) ? (params.r as TrendRange) : "m";
  const { data, error } = useQuery((ctx) => getTrends(m.key, ctx), [m.key], `trends:${m.key}`);
  const vm = data && data.metric === m.key ? data : undefined;
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
