// Activities `/activities`, ported from the web's src/app/(app)/activities/page.tsx: the workout journal behind Home's
// "Today's activities", as Apple Fitness lists workouts. A summary of the window (count, time, average Strain in big
// coloured numbers), a sport filter of capsules, each kind's recovery cost as an inset grouped list, then the days
// newest first, each a small capitals header with its steps and day strain over one card of workout rows (the glyph's
// disc, name, length, distance, Strain, chevron), and "Show older" a month at a time. `?days=` and `?kind=` are route
// params, as the web keeps them in the URL. Detected activities (dashed rows) sit among a day's workouts under "All".
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { dayLabel, formatValue, hmm } from "@/lib/format";
import { ACTIVITY_PAGE_DAYS, getActivities, type ActivitiesVM, type ActivityKind } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { ActivityCard, Card, EmptyState, TimelineSkeleton, Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { Caption } from "@/ui/components/calmKit";
import { Skeleton } from "@/ui/components/Skeleton";
import { font, TABULAR } from "@/ui/fonts";
import { SectionLabel } from "@/screens/settings/calmKit";
import { ActivityCostList, DETECTED_NOTE, DetectedRow } from "./ActivityCost";
import { ChoicePill, Sentence, TealButton } from "./calmKit";
import { DetailScreen, LoadError } from "./DetailScreen";
import { useBack, usePush, useRefresh } from "./nav";
import { activityHref } from "./view";

const KIND_LABEL: Record<ActivityKind, string> = { run: "Runs", ride: "Rides", walk: "Walks", strength: "Strength", workout: "Workouts" };
type Group = ActivitiesVM["groups"][number];

/** One centred column up to 640 px, 22 px between blocks (iOS's space between grouped sections). */
const COLUMN = { alignSelf: "center", width: "100%", maxWidth: 640, gap: 22 } as const;

export default function ActivitiesScreen() {
  const router = useRouter();
  const push = usePush();
  const { timeZone } = useApp();
  const onBack = useBack("/");
  const { refreshing, onRefresh, retry } = useRefresh();
  const params = useLocalSearchParams<{ days?: string; kind?: string }>();
  const pages = Math.min(120, Math.max(1, Math.round(Number(params.days) / ACTIVITY_PAGE_DAYS) || 1));
  const days = pages * ACTIVITY_PAGE_DAYS;
  const q = useQuery((ctx) => getActivities(days, ctx), [days], `activities:${days}`);
  // "Show older" keeps the list on screen while the longer window loads.
  const vm = q.data;
  const loadingOlder = !!vm && vm.days !== days;

  const common = { title: "Activities", onBack, refreshing, onRefresh } as const;
  if (q.error && !vm) return <DetailScreen {...common} primary={<LoadError onRetry={retry} />} />;
  if (!vm) return <DetailScreen {...common} primary={<ActivitiesSkeleton />} />;

  const kinds = [...new Set(vm.groups.flatMap((g) => g.items.map((a) => a.activityKind)))];
  const kind = kinds.find((k) => k === params.kind) ?? null;
  // Detected activities have no sport to filter by: they show under "All" only.
  const groups = vm.groups
    .map((g) => (kind ? { ...g, items: g.items.filter((a) => a.activityKind === kind), detected: [] } : g))
    .filter((g) => g.items.length || (!kind && (g.detected.length || g.day === vm.today)));
  const items = groups.flatMap((g) => g.items);
  const costs = vm.cost?.items.filter((x) => !kind || x.kind === kind) ?? [];

  return (
    <DetailScreen
      {...common}
      primary={
        <View style={COLUMN}>
          {items.length > 0 && <Summary items={items} days={vm.days} />}
          {kinds.length > 1 && <SportFilter kinds={kinds} kind={kind} onChange={(k) => router.setParams({ kind: k ?? undefined })} />}
          {vm.cost && costs.length > 0 && <ActivityCostList vm={vm.cost} items={costs} title="Recovery cost" />}
          {groups.map((g) => (
            <Day key={g.day} g={g} today={vm.today} timeZone={timeZone} onOpen={(id) => push(activityHref(id))} />
          ))}
          {!items.length && groups.length <= 1 && !vm.older && (
            <EmptyState body="No workouts in the last month. Workouts you record on your Fitbit or phone appear here after they sync." />
          )}
          {groups.some((g) => g.detected.length > 0) && (
            <View style={{ paddingHorizontal: 16, marginTop: -8 }}>
              <Sentence size={13}>{DETECTED_NOTE}</Sentence>
            </View>
          )}
          {vm.older ? (
            <TealButton label="Show older" loading={loadingOlder} onPress={() => router.setParams({ days: String(vm.days + ACTIVITY_PAGE_DAYS) })} />
          ) : (
            items.length > 0 && (
              <Sentence size={13} align="center">
                No older activities
              </Sentence>
            )
          )}
        </View>
      }
    />
  );
}

/** "All", then one capsule per sport in the list; the chosen one filled in the action blue. */
function SportFilter({ kinds, kind, onChange }: { kinds: ActivityKind[]; kind: ActivityKind | null; onChange: (k: ActivityKind | null) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Sport"
      style={{ marginHorizontal: -16, marginTop: -6 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {[null, ...kinds].map((k) => (
        <ChoicePill key={k ?? "all"} label={k ? KIND_LABEL[k] : "All"} on={kind === k} onPress={() => onChange(k)} />
      ))}
    </ScrollView>
  );
}

/** One big coloured number over its caps label, a third of the summary's width. */
function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Txt size={28} lineHeight={32} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={[font.numberAt(28, 700), { color }]}>
        {value}
      </Txt>
      <Caption>{label}</Caption>
    </View>
  );
}

/** The lead card, as Fitness sums a period up: count, total time and average activity Strain over what the list shows. */
function Summary({ items, days }: { items: Group["items"]; days: number }) {
  const c = useCalm();
  const minutes = items.reduce((m, a) => m + (a.end - a.start) / 60_000, 0);
  const strains = items.flatMap((a) => (a.strain.value === null ? [] : [a.strain.value]));
  const avg = strains.length ? strains.reduce((a, b) => a + b, 0) / strains.length : null;
  return (
    <View style={{ borderRadius: 20, backgroundColor: c.card, padding: 16, gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Txt size={17} lineHeight={22} weight={600} accessibilityRole="header" style={{ color: c.ink }}>
          {`Last ${days} days`}
        </Txt>
        <Sentence size={13}>Workouts you recorded, with their time and strain</Sentence>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat value={String(items.length)} label={items.length === 1 ? "Activity" : "Activities"} color={c.system.blue} />
        <Stat value={hmm(minutes)} label="Time" color={c.tintInk.sand} />
        <Stat value={formatValue("decimal1", avg)} label="Avg strain" color={avg === null ? c.faint : c.tintInk.peach} />
      </View>
    </View>
  );
}

/** A day's header, iOS's small capitals, with its steps and day strain on the right in grey. */
function DayHead({ g, today }: { g: Group; today: string }) {
  const c = useCalm();
  const aside = [g.steps !== null ? `${formatValue("grouped", g.steps)} steps` : null, g.dayStrain !== null ? `Day strain ${formatValue("decimal1", g.dayStrain)}` : null].filter(Boolean).join(" · ");
  return (
    <SectionLabel
      right={
        aside ? (
          <Txt size={13} lineHeight={18} style={[TABULAR, { color: c.sub, flexShrink: 1, textAlign: "right" }]}>
            {aside}
          </Txt>
        ) : undefined
      }
    >
      {dayLabel(g.day, today)}
    </SectionLabel>
  );
}

function Day({ g, today, timeZone, onOpen }: { g: Group; today: string; timeZone: string; onOpen: (id: string) => void }) {
  const c = useCalm();
  return (
    <View style={{ gap: 7 }}>
      <DayHead g={g} today={today} />
      {g.items.length || g.detected.length ? (
        // One card per day, its rows grouped inside it. Recorded and detected rows in one time order, newest first.
        <Card padding={16} style={{ paddingVertical: 4 }}>
          <View>
            {[
              ...g.items.map((a) => ({
                start: a.start,
                row: (
                  <ActivityCard
                    key={a.id}
                    name={a.name}
                    kind={a.activityKind}
                    strain={a.strain}
                    start={a.start}
                    end={a.end}
                    distanceKm={a.distanceKm}
                    paceS={a.paceS}
                    onPress={() => onOpen(a.id)}
                    timeZone={timeZone}
                  />
                ),
              })),
              ...g.detected.map((d) => ({ start: d.start, row: <DetectedRow key={`detected-${d.start}`} item={d} timeZone={timeZone} /> })),
            ]
              .sort((a, b) => b.start - a.start)
              .map((r, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <View style={{ height: 0.5, marginLeft: 56, backgroundColor: c.line }} />}
                  {r.row}
                </React.Fragment>
              ))}
          </View>
        </Card>
      ) : (
        <Card>
          <Sentence>No activities yet today. Workouts appear after Fitbit syncs them.</Sentence>
        </Card>
      )}
    </View>
  );
}

/** Activities loading (spec §5.19): the summary card and two day groups at their final size. */
function ActivitiesSkeleton() {
  const c = useCalm();
  return (
    <View style={COLUMN}>
      <View style={{ height: 132, borderRadius: 20, backgroundColor: c.card, padding: 16, gap: 14 }}>
        <Skeleton style={{ width: 120, height: 18 }} />
        <Skeleton style={{ width: "70%", height: 14 }} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ flex: 1, height: 32 }} />
          ))}
        </View>
      </View>
      {[1, 2].map((n) => (
        <View key={n} style={{ gap: 7 }}>
          <SectionLabel>{" "}</SectionLabel>
          <Card padding={16} style={{ paddingVertical: 4 }}>
            <TimelineSkeleton rows={n} />
          </Card>
        </View>
      ))}
    </View>
  );
}
