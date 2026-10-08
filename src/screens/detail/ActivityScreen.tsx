// Activity `/activity/[id]` (spec §7.4), ported from the web's src/app/(app)/activity/[id]/page.tsx: activity strain,
// heart rate, zones and recovery after the workout. No date switcher; back falls back to that day's Strain. Mobile: what
// this kind of workout usually costs next-morning Recovery (Activity Cost).
import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { dayHref } from "@/lib/day";
import { clock, dayLabel, formatValue, hmm } from "@/lib/format";
import { getActivity, type ActivityVM } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { ACTIVITY_ICON, Card, EmptyState, InsightCard, IntradayHrChart, KeyStatRow, ReasonPlaceholder, SectionShell, TileRow, useTheme, ZoneBars } from "@/ui";
import { useCalm } from "@/ui/calm";
import { TonePill } from "@/ui/components/Meter";
import { ActivityCostCard } from "./ActivityCost";
import { TrainingEffectCard } from "./TrainingCards";
import { CalmCard, Caption, Num, Sentence } from "./calmKit";
import { DetailScreen, LoadError } from "./DetailScreen";
import { useBack, useRefresh } from "./nav";
import { activitySkeleton } from "./skeletons";
import { Aside, hrSeries, statProps } from "./view";

/** The route's id; the web decodes it, and an id with a stray `%` stays as it is. */
function decodeId(raw: string | string[] | undefined) {
  const id = Array.isArray(raw) ? raw[0] : (raw ?? "");
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export default function ActivityScreen() {
  const { c } = useTheme();
  const calm = useCalm();
  const { timeZone, today } = useApp();
  const params = useLocalSearchParams<{ id: string }>();
  const id = decodeId(params.id);
  const { refreshing, onRefresh, retry } = useRefresh();
  const q = useQuery((ctx) => getActivity(id, ctx), [id]);
  const vm = q.data;
  const onBack = useBack(vm ? dayHref("/strain", vm.day, today) : "/");

  const common = { onBack, align: "start", refreshing, onRefresh } as const;
  if (q.error && !vm) return <DetailScreen {...common} title="Activity" primary={<LoadError onRetry={retry} />} />;
  if (vm === undefined) return <DetailScreen {...common} title="Activity" {...activitySkeleton()} />;
  if (vm === null)
    return (
      <DetailScreen
        {...common}
        title="Activity"
        primary={
          <View style={{ paddingTop: 64 }}>
            <EmptyState body="This activity isn’t on this phone." />
          </View>
        }
      />
    );

  const Icon = ACTIVITY_ICON[vm.kind];
  // No heart rate at all (band off): one notice replaces the empty chart, the empty zones and the dashed heart-rate
  // tiles, instead of the same "band not worn" line three times over an empty page.
  const noHr = vm.hr.value === null && vm.zones.value === null;
  const tiles = vm.stats.filter((k) => k.key !== "duration" && !(noHr && k.metric.value === null));

  return (
    <DetailScreen
      {...common}
      title={vm.name}
      subtitle={`${dayLabel(vm.day, today)} ${clock(vm.start, timeZone)} to ${clock(vm.end, timeZone)}`}
      titleIcon={<Icon size={24} color={c.foreground} strokeWidth={1.75} />}
      hero={<Hero vm={vm} />}
      // Calm: the heart rate and the zone rows each in a white card of their own.
      primary={
        noHr ? (
          <Card padding={0}>
            <View style={{ alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 }}>
              <ReasonPlaceholder reason={vm.hr.reason} size="md" copy={noHrCopy(vm.hr.reason)} />
            </View>
          </Card>
        ) : (
          <View style={{ gap: 14 }}>
            <SectionShell variant="card" title="Heart rate">
              <IntradayHrChart variant="activity" data={hrSeries(vm.hr, vm.maxHr)} timeZone={timeZone} />
            </SectionShell>
            <SectionShell variant="card" title="Time in zones">
              <ZoneBars variant="rows" data={vm.zones} note={vm.zoneNote} emptyCopy="No heart-rate zones for this activity." />
            </SectionShell>
          </View>
        )
      }
      secondary={[
        tiles.length > 0 && (
          <SectionShell key="stats" variant="section" title="Key statistics" aside={<Aside>vs. 30-day average</Aside>}>
            {/* Two tiles a row (TileRow: one height, the names one height, so the values share a line); an odd last
                tile spans the phone's two columns as a wide strip that spells out its comparison. */}
            <View style={{ gap: 12 }}>
              {pairs(tiles).map((row) => (
                <TileRow key={row[0].key} gap={12}>
                  {row.map((k) => (
                    <KeyStatRow key={k.key} variant="tile" {...statProps(k, { iconColor: calm.tintInk.peach, tile: true })} wide={row.length === 1} />
                  ))}
                </TileRow>
              ))}
            </View>
          </SectionShell>
        ),
        // Garmin-style Aerobic Training Effect (version 19), when the workout has heart rate.
        !noHr && <TrainingEffectCard key="te" te={vm.trainingEffect} />,
        // A white card of its own. Without heart rate there is nothing to recover from, and the notice says why.
        !noHr && (
          <SectionShell key="hrr" variant="card" title="Heart rate recovery">
            <HeartRateRecovery hrr={vm.hrr} />
          </SectionShell>
        ),
        vm.cost && (
          <SectionShell key="cost" variant="section" title="Recovery cost">
            <ActivityCostCard cost={vm.cost} />
          </SectionShell>
        ),
      ]}
      footer={vm.insight ? <InsightCard body={vm.insight} /> : null}
    />
  );
}

/** Two to a row, in order; an odd last one alone. */
const pairs = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 2) }, (_, i) => xs.slice(i * 2, i * 2 + 2));

/**
 * The lead card in the strain pastel: the activity's strain large in the strain ink and its duration beside it, each
 * with its label under it, then the day's strain (or why the strain is missing).
 */
function Hero({ vm }: { vm: ActivityVM }) {
  const c = useCalm();
  const s = vm.strain.value;
  const duration = vm.stats.find((k) => k.key === "duration")?.metric.value ?? (vm.end - vm.start) / 60_000;
  return (
    <CalmCard tint="peach" gap={14} style={{ alignSelf: "stretch" }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", columnGap: 32, rowGap: 12 }}>
        <View accessible accessibilityLabel={`Activity strain ${formatValue("decimal1", s)}`}>
          <Num value={formatValue("decimal1", s)} size={52} color={s === null ? c.faint : c.tintInk.peach} />
          <Caption style={{ marginTop: 4 }}>Activity strain</Caption>
        </View>
        <View accessible accessibilityLabel={`Duration ${hmm(duration)}`}>
          <Num value={hmm(duration)} size={34} />
          <Caption style={{ marginTop: 4 }}>Duration</Caption>
        </View>
      </View>
      {vm.loadSplit && (
        // WHOOP-style split of a strength session's strain: words as captions, the shares as numbers.
        <View
          accessible
          accessibilityLabel={`Heart rate ${vm.loadSplit.cardioPct} percent, muscular ${vm.loadSplit.muscularPct} percent of this strain`}
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 18, rowGap: 4 }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Sentence>Heart rate</Sentence>
            <Num value={`${vm.loadSplit.cardioPct}%`} size={17} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Sentence>Muscular</Sentence>
            <Num value={`${vm.loadSplit.muscularPct}%`} size={17} />
          </View>
        </View>
      )}
      {s === null ? (
        // The band-off notice under the hero already says why; repeating it here was the first of three copies.
        vm.hr.value !== null ? <ReasonPlaceholder reason={vm.strain.reason} size="sm" /> : null
      ) : vm.dayStrain !== null ? (
        <View accessible accessibilityLabel={`Day strain ${formatValue("decimal1", vm.dayStrain)}`} style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Sentence>Day strain</Sentence>
          <Num value={formatValue("decimal1", vm.dayStrain)} size={17} color={c.tintInk.peach} />
        </View>
      ) : null}
    </CalmCard>
  );
}

/** The one band-off notice: what is missing and why. */
function noHrCopy(reason: string | null | undefined) {
  const what = "heart rate, zones or strain for this activity";
  return reason === "band_not_worn" ? `Band not worn, so there's no ${what}.` : `Too little heart-rate data to show ${what}.`;
}

function HeartRateRecovery({ hrr }: { hrr: ActivityVM["hrr"] }) {
  const c = useCalm();
  if (hrr.value === null) return <ReasonPlaceholder reason="insufficient_hr_data" size="md" copy="Not enough heart-rate data after the workout." />;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <Num value={formatValue("int", hrr.value.value)} unit="bpm" size={36} color={c.tintInk.rose} />
        <TonePill tone={hrr.value.tone}>{hrr.value.label}</TonePill>
      </View>
      <Sentence>Drop in the first 60 seconds after you stopped. Above 20 is typical for fit adults.</Sentence>
    </View>
  );
}
