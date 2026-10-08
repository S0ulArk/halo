// Activities `/activities`, ported from the web's src/app/(app)/activities/page.tsx: the workout journal behind Home's
// "Today's activities". Day groups newest first, each row the same timeline row as Home, a sport filter, and "Show
// older" a month at a time. `?days=` and `?kind=` are route params, as the web keeps them in the URL. Mobile: each kind's
// recovery cost under the filter, and detected activities (dashed rows) among a day's workouts under "All".
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { dayLabel, formatValue, hmm } from "@/lib/format";
import { ACTIVITY_PAGE_DAYS, getActivities, type ActivitiesVM, type ActivityKind } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { Dumbbell } from "lucide-react-native";
import { ActivityCard, Card, EmptyState, TimelineSkeleton } from "@/ui";
import { useCalm } from "@/ui/calm";
import { ActivityCostList, DETECTED_NOTE, DetectedRow } from "./ActivityCost";
import { CalmCard, ChoicePill, GroupHead, MiniStat, Num, Sentence, TealButton } from "./calmKit";
import { DetailScreen, LoadError } from "./DetailScreen";
import { useBack, usePush, useRefresh } from "./nav";
import { activityHref } from "./view";

const KIND_LABEL: Record<ActivityKind, string> = { run: "Runs", ride: "Rides", walk: "Walks", strength: "Strength", workout: "Workouts" };
type Group = ActivitiesVM["groups"][number];

/** One centred column up to 640 px, 18 px between blocks. */
const COLUMN = { alignSelf: "center", width: "100%", maxWidth: 640, gap: 18 } as const;

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
          {vm.cost && costs.length > 0 && (
            <View style={{ gap: 10 }}>
              <GroupHead title="Recovery cost" />
              <ActivityCostList vm={vm.cost} items={costs} />
            </View>
          )}
          {groups.map((g) => (
            <Day key={g.day} g={g} today={vm.today} timeZone={timeZone} onOpen={(id) => push(activityHref(id))} />
          ))}
          {!items.length && groups.length <= 1 && !vm.older && (
            <EmptyState body="No workouts in the last month. Workouts you record on your Fitbit or phone appear here after they sync." />
          )}
          {groups.some((g) => g.detected.length > 0) && (
            <View style={{ paddingHorizontal: 4 }}>
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

/** "All", then one pill per sport in the list; the chosen one in the accent teal. */
function SportFilter({ kinds, kind, onChange }: { kinds: ActivityKind[]; kind: ActivityKind | null; onChange: (k: ActivityKind | null) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Sport"
      style={{ marginHorizontal: -16 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {[null, ...kinds].map((k) => (
        <ChoicePill key={k ?? "all"} label={k ? KIND_LABEL[k] : "All"} on={kind === k} onPress={() => onChange(k)} />
      ))}
    </ScrollView>
  );
}

/** The lead card: count, total time and average activity Strain over what the list shows. */
function Summary({ items, days }: { items: Group["items"]; days: number }) {
  const c = useCalm();
  const minutes = items.reduce((m, a) => m + (a.end - a.start) / 60_000, 0);
  const strains = items.flatMap((a) => (a.strain.value === null ? [] : [a.strain.value]));
  const avg = strains.length ? strains.reduce((a, b) => a + b, 0) / strains.length : null;
  return (
    <CalmCard tint="sky" icon={Dumbbell} title={`Last ${days} days`} subtitle="Workouts you recorded, with their time and strain">
      <View style={{ flexDirection: "row", gap: 12 }}>
        <MiniStat value={String(items.length)} label={items.length === 1 ? "Activity" : "Activities"} color={c.tintInk.sky} />
        <MiniStat value={hmm(minutes)} label="Time" color={c.tintInk.sky} />
        <MiniStat value={formatValue("decimal1", avg)} label="Avg strain" color={avg === null ? c.faint : c.tintInk.peach} />
      </View>
    </CalmCard>
  );
}

/** A day's heading: its name, then its steps and day strain (numbers in the numeric face, words in grey). */
function DayHead({ g, today }: { g: Group; today: string }) {
  const c = useCalm();
  const aside =
    g.steps !== null || g.dayStrain !== null ? (
      <View
        accessible
        accessibilityLabel={[g.steps !== null && `${formatValue("grouped", g.steps)} steps`, g.dayStrain !== null && `day strain ${formatValue("decimal1", g.dayStrain)}`].filter(Boolean).join(", ")}
        style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 }}
      >
        {g.steps !== null && <Num value={formatValue("grouped", g.steps)} unit="steps" size={15} color={c.sub} />}
        {g.steps !== null && g.dayStrain !== null && <Sentence size={13}>·</Sentence>}
        {g.dayStrain !== null && (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
            <Sentence size={13}>Day strain</Sentence>
            <Num value={formatValue("decimal1", g.dayStrain)} size={15} color={c.tintInk.peach} />
          </View>
        )}
      </View>
    ) : undefined;
  return <GroupHead title={dayLabel(g.day, today)} aside={aside} />;
}

function Day({ g, today, timeZone, onOpen }: { g: Group; today: string; timeZone: string; onOpen: (id: string) => void }) {
  const c = useCalm();
  return (
    <View style={{ gap: 10 }}>
      <DayHead g={g} today={today} />
      {g.items.length || g.detected.length ? (
        // One white card per day, its rows grouped inside it. Recorded and detected rows in one time order, newest first.
        <Card padding={16} style={{ paddingVertical: 6 }}>
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
                  {i > 0 && <View style={{ height: 1, marginLeft: 56, backgroundColor: c.line }} />}
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
      <View style={{ height: 166, borderRadius: 30, backgroundColor: c.tint.sky }} />
      {[1, 2].map((n) => (
        <View key={n} style={{ gap: 10 }}>
          <GroupHead title={"\u00a0"} />
          <Card padding={16} style={{ paddingVertical: 6 }}>
            <TimelineSkeleton rows={n} />
          </Card>
        </View>
      ))}
    </View>
  );
}
