// Heart rate `/health/heart-rate?d=`, ported from Pulse's health/heart-rate/page.tsx, LiveHeartRate.tsx and loading.tsx:
// the latest reading (today) or the day's average, the day's minutes and time in zones.
//
// The web polls its server every minute while today is on screen. The phone has no server to poll, but the app state's
// foreground ticker reads the last few minutes of heart rate from Health Connect every minute (src/health/live.ts) and
// bumps `liveVersion` when new samples land, which refetches today's minutes here; between refetches the hero shows
// the ticker's own newest reading. Full syncs (on open, after 10 minutes away, pull to refresh) re-run the query too.
// The "2 minutes ago" line ticks on its own.
//
// Live over Bluetooth (src/state/liveBle.tsx): while the band shares heart rate and Pulse is connected, today's hero
// becomes the Live section — the band's bpm, the heart-rate zone it is in (the day's zones from the pipeline: resting
// to max on heart-rate reserve, the profile's max when the day has none yet), the last 2 minutes and the live RMSSD.
// Otherwise the hero offers "Go live". Live readings are display-only; the chart and zones below stay Health Connect's.
import * as React from "react";
import { View } from "react-native";
import { zoneEdges, zoneNumber, zones as reserveZones, type HrZoneSet } from "@/core/scoring/zones";
import { DATA_COLORS } from "@/lib/bands";
import { useDay } from "@/lib/day";
import { dayLabel, MISSING } from "@/lib/format";
import { getHeartRate, type HeartRateVM } from "@/queries";
import { maxHrOf } from "@/queries/common";
import { useApp, useQuery, useQueryCtx, type LiveHr, useLiveHr } from "@/state/app";
import { useLiveBle, useLiveBleControl } from "@/state/liveBle";
import { HeartPulse } from "lucide-react-native";
import { IntradayHrChart, SectionShell, SkeletonText, useTheme, ZONE_COLOR, ZoneBars, type HrSeries } from "@/ui";
import { useCalm } from "@/ui/calm";
import { CalmCard, Caption, Num, Sentence } from "@/screens/detail/calmKit";
import { IntradayHrChartSkeleton } from "@/ui/components/IntradayHrChart";
import { ZoneBarsSkeleton } from "@/ui/components/ZoneBars";
import { DetailScreen, LoadError } from "@/screens/detail/DetailScreen";
import { useBack, useRefresh } from "@/screens/detail/nav";
import { BeatingHeart, GoLiveButton, GoLiveSheet, LivePill, LiveTrace } from "@/screens/settings/liveHr";
import { HEART_RATE_INFO } from "./detailInfo";
import { LastReading } from "./LastReading";
import { useDaySwitcher } from "./shells";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { useOpenChart } from "@/screens/chart/href";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The stats under the reading: three columns (range, average, resting) today, two on a past day, each a number with its label under it. */
function StatGrid({ stats }: { stats: { label: string; value: string | null; spoken: string }[] }) {
  const c = useCalm();
  return (
    <View style={{ width: "100%", flexDirection: "row", gap: 12 }}>
      {stats.map((s) => (
        <View key={s.label} accessible accessibilityLabel={`${s.label}: ${s.spoken}${/\d/.test(s.spoken) ? " beats per minute" : ""}`} style={{ flex: 1, minWidth: 0 }}>
          {s.value === null ? <SkeletonText role="value" chars={4} /> : <Num value={s.value} size={22} color={s.value === MISSING ? c.faint : c.ink} />}
          <Caption style={{ marginTop: 4 }}>{s.label}</Caption>
        </View>
      ))}
    </View>
  );
}

/** The day's range, average (today) and resting heart rate. */
function dayStats(vm: HeartRateVM) {
  const bpms = vm.points.flatMap((p) => (p.v === null ? [] : [p.v]));
  const avg = bpms.length ? Math.round(mean(bpms)) : null;
  const lo = bpms.length ? Math.min(...bpms) : null;
  const hi = bpms.length ? Math.max(...bpms) : null;
  return [
    { label: "Range", value: lo === null ? MISSING : `${lo}–${hi}`, spoken: lo === null ? "no readings" : `${lo} to ${hi}` },
    ...(vm.isToday ? [{ label: "Average", value: avg === null ? MISSING : String(avg), spoken: avg === null ? "no readings" : String(avg) }] : []),
    { label: "Resting", value: vm.restingHr === null ? MISSING : String(vm.restingHr), spoken: vm.restingHr === null ? "not yet" : String(vm.restingHr) },
  ];
}

/**
 * The zones the live bpm is placed in: the day's own (stage 1's resting → max on heart-rate reserve, as the chart's
 * bands), else core's zones on the day's resting HR (60 without one, the pipeline's last fallback) and the max HR.
 */
function liveZones(vm: HeartRateVM | undefined, profileMax: number): HrZoneSet {
  const bands = vm?.zoneBands ?? [];
  if (vm && bands.length === 5) {
    const maxHR = vm.maxHr;
    return {
      zones: bands.map((z) => ({ number: z.zone, lower: z.min, upper: z.max === null ? Math.max(maxHR, z.min) : z.max + 1 })),
      maxHR,
      // Zone 1 starts at e = zoneEdges[0] of the reserve (40 %): floor = resting + e·(max − resting), so resting =
      // (floor − e·max) / (1 − e).
      restingHR: Math.round((bands[0].min - zoneEdges[0] * maxHR) / (1 - zoneEdges[0])),
    };
  }
  return reserveZones(vm?.restingHr ?? 60, vm?.maxHr ?? profileMax);
}

/**
 * Today's Live section: the band's bpm, its zone, the last 2 minutes and the live RMSSD, over the day's stats. It
 * reads the per-beat data itself, so only this section re-renders with each beat (≤ 4 a second), not the day's chart.
 */
function LiveHero({ vm, zoneSet }: { vm: HeartRateVM | undefined; zoneSet: HrZoneSet }) {
  const { c } = useTheme();
  const calm = useCalm();
  const live = useLiveBle();
  const lost = live.status !== "live";
  const bpm = live.bpm;
  const zone = bpm === null ? null : zoneNumber(zoneSet, bpm);
  const band = zone ? zoneSet.zones[zone - 1] : null;
  const zoneColor = zone && ZONE_COLOR[zone] ? c[DATA_COLORS[ZONE_COLOR[zone]].fill] : c.mutedForeground;
  const ofMax = bpm === null ? null : Math.round((bpm / zoneSet.maxHR) * 100);
  const zoneRange = band ? (zone === 5 ? `${Math.round(band.lower)}+ bpm` : `${Math.round(band.lower)}–${Math.round(band.upper) - 1} bpm`) : zone === 0 ? `Under ${Math.round(zoneSet.zones[0].lower)} bpm` : null;
  const cells = [
    { label: "Zone", value: zone === null ? MISSING : String(zone), color: zoneColor, caption: zoneRange, spoken: zone === null ? "unknown" : zone === 0 ? "below zone 1" : `zone ${zone}${zoneRange ? `, ${zoneRange}` : ""}` },
    { label: "HRV", value: live.rmssd === null ? MISSING : `${Math.round(live.rmssd)}`, color: undefined, caption: live.rmssd === null ? (live.rrMs.length ? "Measuring…" : "No RR from the band") : "ms RMSSD, 1 min", spoken: live.rmssd === null ? "not available" : `${Math.round(live.rmssd)} milliseconds RMSSD` },
    { label: "Of max", value: ofMax === null ? MISSING : `${ofMax}%`, color: undefined, caption: `Max ${zoneSet.maxHR} bpm`, spoken: ofMax === null ? "unknown" : `${ofMax} percent of max heart rate ${zoneSet.maxHR}` },
  ];
  return (
    <CalmCard tint="rose" icon={HeartPulse} title="Live heart rate" style={{ alignSelf: "stretch" }}>
      <View style={{ gap: 10 }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          accessible
          accessibilityLabel={`${lost ? "Reconnecting. Last live reading" : "Live heart rate"} ${bpm ?? "unknown"} beats per minute${live.device?.name ? ` from ${live.device.name}` : ""}`}
        >
          <BeatingHeart bpm={bpm ?? 60} live={!lost} color={calm.tintInk.rose} size={30} />
          <Num value={bpm === null ? MISSING : String(bpm)} unit="bpm" size={64} color={lost ? calm.faint : calm.tintInk.rose} />
        </View>
        <LivePill name={live.device?.name ?? null} lost={lost} />
        {live.contact === false && <Sentence color={calm.tintInk.rose}>No skin contact: wear the band snug.</Sentence>}
      </View>
      <LiveTrace history={live.history} height={88} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        {cells.map((s) => (
          <View key={s.label} accessible accessibilityLabel={`${s.label}: ${s.spoken}`} style={{ flex: 1, minWidth: 0 }}>
            <Num value={s.value} size={22} color={s.color ?? calm.ink} />
            <Caption style={{ marginTop: 4 }}>{s.label}</Caption>
            {!!s.caption && (
              <View style={{ marginTop: 2 }}>
                <Sentence size={13}>{s.caption}</Sentence>
              </View>
            )}
          </View>
        ))}
      </View>
      {vm && <StatGrid stats={dayStats(vm)} />}
    </CalmCard>
  );
}

/** The lead card in the heart pastel: the latest reading (today) or the day's average (a past day), over the day's range, average and resting HR. */
function Hero({ vm, onGoLive }: { vm: HeartRateVM; onGoLive: () => void }) {
  const c = useCalm();
  const bpms = vm.points.flatMap((p) => (p.v === null ? [] : [p.v]));
  const avg = bpms.length ? Math.round(mean(bpms)) : null;
  const big = vm.isToday ? (vm.latest?.bpm ?? null) : avg;
  const stats = dayStats(vm);
  return (
    <CalmCard tint="rose" icon={HeartPulse} title={vm.isToday ? "Latest reading" : "Day average"} style={{ alignSelf: "stretch" }}>
      <View style={{ gap: 8 }}>
        <View accessible accessibilityLabel={big === null ? "No reading" : `${big} beats per minute`}>
          <Num value={big === null ? MISSING : String(big)} unit="bpm" size={64} color={big === null ? c.faint : c.tintInk.rose} />
        </View>
        {vm.isToday ? vm.latest ? <LastReading t={vm.latest.t} /> : <Sentence size={13}>No readings yet today</Sentence> : <Sentence size={13}>{avg === null ? "No readings on this day" : "Day average"}</Sentence>}
        {vm.isToday && <GoLiveButton onPress={onGoLive} style={{ alignSelf: "flex-start", marginTop: 4 }} />}
      </View>
      <StatGrid stats={stats} />
    </CalmCard>
  );
}

function HeroSkeleton() {
  return (
    <CalmCard tint="rose" icon={HeartPulse} title="Latest reading" style={{ alignSelf: "stretch" }}>
      <View importantForAccessibility="no-hide-descendants" style={{ gap: 8 }}>
        <SkeletonText role="value" size={64} lineHeight={72} chars={3} />
        <SkeletonText role="caption" width={112} />
      </View>
      <StatGrid stats={["Range", "Average", "Resting"].map((label) => ({ label, value: null, spoken: "" }))} />
    </CalmCard>
  );
}

/** The day's minute chart: a minute without a reading is a gap, never a line across it. */
function chartOf(vm: HeartRateVM) {
  const value: HrSeries = {
    points: vm.points.map((p) => ({ t: p.t, bpm: p.v })),
    zones: vm.zoneBands.map((z) => ({ zone: z.zone, label: z.label, min: z.min, max: z.max ?? vm.maxHr })),
    now: vm.isToday && vm.latest ? vm.latest.t : undefined,
  };
  return { value, reason: null, provisional: false };
}

/** Today's view model with the live reading in place of the query's when it is newer (the ticker runs ahead of the refetch). */
function withLive(vm: HeartRateVM, live: LiveHr["latest"]): HeartRateVM {
  if (!vm.isToday || !live) return vm;
  const t = live.ts * 1000;
  if (vm.latest && vm.latest.t >= t) return vm;
  return { ...vm, latest: { t, bpm: live.bpm } };
}

/** Heart rate `/health/heart-rate?d=`: the latest reading, the day's minutes and time in zones. */
export default function HeartRateScreen() {
  const { timeZone } = useApp();
  const { liveHr, liveVersion, refreshLiveHr } = useLiveHr();
  const liveStatus = useLiveBleControl().status;
  const [sheet, setSheet] = React.useState(false);
  const qctx = useQueryCtx();
  const onBack = useBack("/health");
  const { refreshing, onRefresh: fullRefresh, retry } = useRefresh();
  // Pull to refresh: the live reading first (it lands within a second), then the full import and rescoring.
  const onRefresh = () => {
    void refreshLiveHr();
    fullRefresh();
  };
  const { d, today } = useDay();
  const dateSwitcher = useDaySwitcher(d, today);
  const openChart = useOpenChart();
  const openDay = () => openChart({ metric: "avg_hr", r: "day", d: d === today ? undefined : d });
  // Today's minutes run up to the moment the query runs, not to when the last sync built the query context, and
  // refetch when the live ticker brings new samples; a past day only changes with a scoring run.
  const q = useQuery((ctx) => getHeartRate(d, { ...ctx, now: Math.floor(Date.now() / 1000) }), [d, d === today ? liveVersion : 0]);
  // A query for another day is still in flight: show the loading shape, not the previous day.
  const vm = q.data && q.data.day === d ? withLive(q.data, liveHr.latest) : undefined;
  const common = { title: "Heart rate", info: HEART_RATE_INFO, onBack, refreshing, onRefresh, dateSwitcher: { ...dateSwitcher, loading: q.loading && !vm && !!q.data } } as const;
  const chartTitle = d === today ? "Today" : dayLabel(d, today);
  // Today, while the band is live: the Live section replaces the reading hero.
  const isLive = d === today && (liveStatus === "live" || liveStatus === "lost");
  const profileMax = qctx ? maxHrOf(qctx) : 190;
  const zoneSet = React.useMemo(() => liveZones(vm, profileMax), [vm, profileMax]);
  const liveHero = isLive ? <LiveHero vm={vm} zoneSet={zoneSet} /> : null;
  // The chart's minutes are mapped once per query result; a live reading only moves its "now" line.
  const chartBase = React.useMemo(() => (vm ? chartOf(vm).value : null), [vm?.points, vm?.zoneBands, vm?.maxHr]); // eslint-disable-line react-hooks/exhaustive-deps
  const chartNow = vm?.isToday && vm.latest ? vm.latest.t : undefined;
  const chart = React.useMemo(() => (chartBase ? { value: { ...chartBase, now: chartNow }, reason: null, provisional: false } : null), [chartBase, chartNow]);

  if (q.error && !vm) return <DetailScreen {...common} hero={liveHero ?? undefined} primary={<LoadError onRetry={retry} />} />;
  if (!vm)
    return (
      <DetailScreen
        {...common}
        hero={liveHero ?? <HeroSkeleton />}
        primary={
          <SectionShell variant="card" title={chartTitle}>
            <IntradayHrChartSkeleton />
          </SectionShell>
        }
        secondary={[
          <SectionShell key="zones" variant="card" title="Time in zones">
            <ZoneBarsSkeleton variant="rows" />
          </SectionShell>,
        ]}
      />
    );

  return (
    <>
      <DetailScreen
        {...common}
        hero={liveHero ?? <Hero vm={vm} onGoLive={() => setSheet(true)} />}
        primary={
          <SectionShell variant="card" title={vm.isToday ? "Today" : dayLabel(d, today)} action={<ExpandButton onPress={openDay} />}>
            <IntradayHrChart data={chart} timeZone={timeZone} onPress={openDay} />
          </SectionShell>
        }
        secondary={[
          <SectionShell key="zones" variant="card" title="Time in zones">
            <ZoneBars variant="rows" data={vm.zones} note={vm.zoneNote} emptyCopy={vm.isToday ? "No heart-rate zones yet today." : "No heart-rate zones on this day."} />
          </SectionShell>,
        ]}
      />
      <GoLiveSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}
