// Health Monitor `/health/monitor?d=` (spec §7.8), ported from Pulse's health/monitor/page.tsx and its loading.tsx, as an
// Apple Health detail page: the large title with the night under it, the hero (a ring that sweeps to the share of
// last night's vitals in your range, the count rolling into place in it, and the status chip), the illness signal when
// several moved together, the five vitals as tiles with their in-range chips, Heart rhythm as a grouped list, then the
// body measurements. Everything below the hero rises into place once the push lands.
import * as React from "react";
import { View } from "react-native";
import { CircleAlert, ShieldCheck } from "lucide-react-native";
import { dayHref, useDay } from "@/lib/day";
import { MISSING } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import { getMonitor, metricHref, type MonitorVM } from "@/queries";
import { useQuery } from "@/state/app";
import { KeyStatRow, KeyStatRowSkeleton, SectionShell, Skeleton, SkeletonText, Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { Card } from "@/ui/components/Card";
import { ActivityRings } from "@/ui/components/Halo";
import { TonePill } from "@/ui/components/Meter";
import { CalmCard, Sentence } from "@/screens/detail/calmKit";
import { HeartRhythm, HeartRhythmSkeleton } from "./HeartRhythm";
import { MONITOR_INFO } from "./info";
import { CardHead, RollingValue } from "./kit";
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

const RING = 112;

/**
 * The hero: last night's vitals as one ring that sweeps to the share in your range (green when all are, orange when one
 * is out, red with the illness signal), the count rolling into place in its middle, and beside it what it means.
 */
function Count({ count }: { count: MonitorVM["count"] | undefined }) {
  const c = useCalm();
  const v = count?.value ?? null;
  const reason = count && !v ? reasonCopy(count.reason) : null;
  const chip = v ? CHIP[v.status] : null;
  const color = !v ? c.system.gray : v.status === "within" ? c.system.green : v.status === "out" ? c.system.orange : c.system.red;
  return (
    <Card style={{ alignSelf: "stretch" }}>
      <View style={{ gap: 14 }}>
        <CardHead tint="sand" icon={ShieldCheck} title="Last night’s vitals" />
        <View
          accessible
          accessibilityLabel={!count ? "Loading last night's vitals" : v ? `${v.inRange} of ${v.total} metrics within range${chip ? `, ${chip.text}` : ""}` : `Metrics within range unavailable: ${reason!.long}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 18 }}
        >
          <ActivityRings size={RING} rings={[{ progress: v ? v.inRange / v.total : null, color }]} delay={120}>
            {!count ? (
              <SkeletonText role="valueXl" size={30} lineHeight={34} chars={2} />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <RollingValue value={v ? String(v.inRange) : MISSING} size={34} />
                <Txt size={17} lineHeight={22} weight={600} style={{ color: c.sub }}>
                  {`/${v?.total ?? 5}`}
                </Txt>
              </View>
            )}
          </ActivityRings>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <Txt size={17} lineHeight={22} weight={600} style={{ color: c.ink }}>
              Metrics within range
            </Txt>
            {!count ? <Skeleton style={{ height: 24, width: 112 }} /> : chip ? <TonePill tone={chip.tone}>{chip.text}</TonePill> : <Sentence size={13}>{reason!.long}</Sentence>}
          </View>
        </View>
      </View>
    </Card>
  );
}

/** Several vitals out together: the illness signal under the count, in the pink soft fill. */
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

/** A section's title over its tiles: 22/28 bold, iOS's title2. */
function SectionTitle({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={22} lineHeight={28} weight={700} accessibilityRole="header" style={{ color: c.ink, paddingHorizontal: 4, marginBottom: 10 }}>
      {children}
    </Txt>
  );
}

/**
 * Weight and body fat, then blood glucose and core temperature once ever recorded: each the latest reading with its
 * date, against the mean of the readings in the 30 days before it. One card, its rows grouped.
 */
function Measurements({ rows, open }: { rows: MonitorVM["measurements"] | undefined; open: (key: string) => void }) {
  return (
    <SectionShell variant="card" title="Measurements" accent={null}>
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
      primary={
        <View>
          <SectionTitle>Last night’s readings</SectionTitle>
          {vm ? <VitalTiles vitals={vm.vitals} /> : <VitalTilesSkeleton />}
        </View>
      }
      // The reference app's order below the vitals: heart rhythm (Heart Screener's place), then body measurements (spec §11 HM1).
      footer={
        <View style={{ gap: 20, marginTop: 6 }}>
          {vm ? <HeartRhythm rhythm={vm.heartRhythm} /> : <HeartRhythmSkeleton />}
          <Measurements rows={vm?.measurements} open={(key) => push(dayHref(metricHref(key), d, today))} />
        </View>
      }
    />
  );
}
