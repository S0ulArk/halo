// Health Monitor `/health/monitor?d=` (spec §7.8), ported from Pulse's health/monitor/page.tsx and its loading.tsx.
import * as React from "react";
import { View } from "react-native";
import { CircleAlert, ShieldCheck } from "lucide-react-native";
import { dayHref, useDay } from "@/lib/day";
import { MISSING } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import { getMonitor, metricHref, type MonitorVM } from "@/queries";
import { useQuery } from "@/state/app";
import { KeyStatRow, KeyStatRowSkeleton, SectionShell, Skeleton, SkeletonText } from "@/ui";
import { useCalm } from "@/ui/calm";
import { TonePill } from "@/ui/components/Meter";
import { CalmCard, Caption, Num, Sentence } from "@/screens/detail/calmKit";
import { HeartRhythm } from "./HeartRhythm";
import { MONITOR_INFO } from "./info";
import { DetailScreen, ErrorState, useDaySwitcher, usePush } from "./shells";
import { Rows, statIcon } from "./view";
import { VitalTiles, VitalTilesSkeleton } from "./VitalTiles";

// One phrasing with Home's monitor card: "N/5 within range" for the count, "Out of range" for the status (SYM).
// The illness alert below the count names the illness signal.
const CHIP = {
  within: { tone: "optimal", text: "Within range" },
  out: { tone: "warning", text: "Out of range" },
  illness: { tone: "alert", text: "Out of range" },
} as const;

/** The lead card in the body pastel: how many of last night's vitals sat in your range, large, and what that means. */
function Count({ count }: { count: MonitorVM["count"] | undefined }) {
  const c = useCalm();
  const ink = c.tintInk.sand;
  if (count === undefined)
    return (
      <CalmCard tint="sand" icon={ShieldCheck} title="Last night’s vitals" style={{ alignSelf: "stretch" }}>
        <View importantForAccessibility="no-hide-descendants" style={{ gap: 4 }}>
          <SkeletonText role="value" size={64} lineHeight={70} chars={2.5} />
          <Caption>Metrics within range</Caption>
          <Skeleton style={{ marginTop: 8, height: 24, width: 112 }} />
        </View>
      </CalmCard>
    );
  const v = count.value;
  const reason = v ? null : reasonCopy(count.reason);
  const chip = v ? CHIP[v.status] : null;
  return (
    <CalmCard tint="sand" icon={ShieldCheck} title="Last night’s vitals" subtitle={reason?.long} style={{ alignSelf: "stretch" }}>
      <View
        accessible
        accessibilityLabel={v ? `${v.inRange} of ${v.total} metrics within range` : `Metrics within range unavailable: ${reason!.long}`}
        style={{ gap: 4 }}
      >
        <Num value={v ? String(v.inRange) : MISSING} unit={`/${v?.total ?? 5}`} size={64} color={v ? ink : c.faint} />
        <Caption>Metrics within range</Caption>
      </View>
      {chip && <TonePill tone={chip.tone}>{chip.text}</TonePill>}
    </CalmCard>
  );
}

/** Several vitals out together: the illness signal under the count, in the rose pastel. */
function IllnessAlert() {
  return (
    <View accessibilityRole="alert">
      <CalmCard
        tint="rose"
        icon={CircleAlert}
        title="Possible illness signal"
        subtitle="Several vitals moved away from your normal range together, a pattern that often comes before feeling unwell. Consider an easier day and extra sleep."
      />
    </View>
  );
}

/**
 * Weight and body fat, then blood glucose and core temperature once ever recorded: each the latest reading with its
 * date, against the mean of the readings in the 30 days before it. One white card, its rows grouped.
 */
function Measurements({ rows, open }: { rows: MonitorVM["measurements"] | undefined; open: (key: string) => void }) {
  return (
    <SectionShell variant="card" title="Measurements">
      <Rows>
        {rows
          ? rows.map((m) => (
              <KeyStatRow
                key={m.key}
                variant="row"
                icon={statIcon(m.key)}
                label={m.label}
                caption={m.caption}
                metric={m.metric}
                unit={m.unit}
                format={m.format}
                average={m.average}
                averageLabel="prior 30-day average"
                sd={m.sd}
                direction="neutral"
                onPress={() => open(m.key)}
              />
            ))
          : [<KeyStatRowSkeleton key="w" variant="row" label="Weight" icon={statIcon("weight")} />, <KeyStatRowSkeleton key="b" variant="row" label="Body fat" icon={statIcon("body_fat")} />]}
      </Rows>
      {rows && (
        <View style={{ marginTop: 8 }}>
          <Sentence size={13}>Latest reading vs. the 30 days before it</Sentence>
        </View>
      )}
    </SectionShell>
  );
}

export default function MonitorScreen() {
  const { d, today } = useDay();
  const { data, error } = useQuery((ctx) => getMonitor(d, ctx), [d], `monitor:${d}`);
  const push = usePush();
  const dateSwitcher = useDaySwitcher(d, today);
  // A query for another day is still in flight: show the loading shape, not the previous day.
  const vm = data && data.day === d ? data : undefined;

  if (error && !vm) return <DetailScreen title="Health Monitor" info={MONITOR_INFO} dateSwitcher={dateSwitcher} primary={<ErrorState error={error} />} />;

  return (
    <DetailScreen
      title="Health Monitor"
      dateSwitcher={dateSwitcher}
      info={MONITOR_INFO}
      hero={<Count count={vm?.count} />}
      summary={vm?.illness ? <IllnessAlert /> : null}
      primary={<SectionShell variant="section" title="Last night’s readings">{vm ? <VitalTiles vitals={vm.vitals} /> : <VitalTilesSkeleton />}</SectionShell>}
      // The reference app's order below the vitals: heart rhythm (Heart Screener's place), then body measurements (spec §11 HM1).
      footer={
        <View style={{ gap: 14 }}>
          <SectionShell variant="card" title="Heart rhythm">
            {vm ? <HeartRhythm rhythm={vm.heartRhythm} /> : <Skeleton radius={16} style={{ height: 56 }} />}
          </SectionShell>
          <Measurements rows={vm?.measurements} open={(key) => push(dayHref(metricHref(key), d, today))} />
        </View>
      }
    />
  );
}
