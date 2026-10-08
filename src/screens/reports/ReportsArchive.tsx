// Reports archive `/reports?view=&all=` (More, U21), ported from Pulse's src/app/(app)/reports/page.tsx and its
// loading.tsx: one period kind at a time (Weekly / Monthly), newest first. Weeks are grouped by month and only the
// last few months show until "Show earlier weeks"; months are grouped by year. The view lives in the route params,
// as the web keeps it in the URL, so Back keeps it.
import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { recoveryBand } from "@/lib/bands";
import { DAY, formatDay, formatValue, MISSING, rangeLabel } from "@/lib/format";
import { getReportArchive, type ReportListItem } from "@/queries/reports";
import { useQuery } from "@/state/app";
import { EmptyState, MiniRing, Skeleton } from "@/ui";
import { CalmButton, CalmSegmented, Num, useCalm } from "@/screens/settings/calmKit";
import { DetailScreen, LoadError } from "@/screens/detail/DetailScreen";
import { useBack, usePush, useRefresh } from "@/screens/detail/nav";
import { LinkList, LinkListSkeleton, MORE_COLUMN_GAP, type LinkListRow } from "./LinkList";

/** Month groups of weeks shown before "Show earlier weeks": about a quarter. */
const RECENT_MONTHS = 3;

type ArchiveView = "weeks" | "months";
type Group = { title: string; rows: LinkListRow[] };

/** The period's average Recovery as a mini capsule meter and its value, in the band's ink with "%" small and grey. */
function Aside({ r }: { r: ReportListItem }) {
  const c = useCalm();
  const band = r.recovery === null ? null : recoveryBand(r.recovery);
  const ink = band === "green" ? c.tintInk.mint : band === "yellow" ? c.tintInk.sand : band === "red" ? c.tintInk.rose : c.faint;
  return (
    <View style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <MiniRing variant="recovery" value={r.recovery} showValue={false} />
      {/* A fixed width: the values line up down the list. */}
      <View style={{ width: 52, alignItems: "flex-end" }}>
        <Num value={r.recovery === null ? MISSING : formatValue("int", r.recovery)} unit={r.recovery === null ? undefined : "%"} size={18} color={ink} />
      </View>
    </View>
  );
}

/** Consecutive items sharing a key become one titled group, keeping the newest-first order. */
function groupRows(items: ReportListItem[], key: (r: ReportListItem) => string, row: (r: ReportListItem) => LinkListRow): Group[] {
  const groups: Group[] = [];
  for (const r of items) {
    const title = key(r);
    if (groups.at(-1)?.title !== title) groups.push({ title, rows: [] });
    groups.at(-1)!.rows.push(row(r));
  }
  return groups;
}

const spokenRecovery = (r: ReportListItem) => (r.recovery === null ? "" : `, average Recovery ${formatValue("int", r.recovery)}%`);

/** "Show earlier weeks": a centred white pill with a teal label. */
function ShowEarlier({ onPress }: { onPress: () => void }) {
  return (
    <CalmButton variant="secondary" size="md" onPress={onPress} style={{ alignSelf: "center" }}>
      Show earlier weeks
    </CalmButton>
  );
}

/** Reports archive: the view switch and two month groups at their final size (spec §5.19). */
function ArchiveSkeleton() {
  const c = useCalm();
  return (
    <View style={{ gap: MORE_COLUMN_GAP }}>
      <Skeleton radius={18} style={{ height: 52, backgroundColor: c.card }} />
      <LinkListSkeleton title="" rows={4} />
      <LinkListSkeleton title="" rows={4} />
    </View>
  );
}

export default function ReportsArchive() {
  const router = useRouter();
  const push = usePush();
  const onBack = useBack("/more");
  const { refreshing, onRefresh, retry } = useRefresh();
  const params = useLocalSearchParams<{ view?: string; all?: string }>();
  const { data: vm, error } = useQuery((ctx) => getReportArchive(ctx));
  const common = { title: "Reports", onBack, refreshing, onRefresh } as const;

  if (error && !vm) return <DetailScreen {...common} primary={<LoadError onRetry={retry} />} />;
  if (!vm) return <DetailScreen {...common} primary={<ArchiveSkeleton />} />;

  const empty = !vm.weeks.length && !vm.months.length;
  // A first week can exist before any month has data, and vice versa: fall back to the kind that has rows.
  const view: ArchiveView = (params.view === "months" && vm.months.length) || !vm.weeks.length ? "months" : "weeks";
  const all = params.all === "1";
  const open = (r: ReportListItem) => () => push(`/reports/${r.period}`);
  const weekRow = (r: ReportListItem): LinkListRow => ({
    key: r.period,
    label: rangeLabel(r.start, r.end),
    aside: <Aside r={r} />,
    description: r.partial ? "Partial week" : undefined,
    accessibilityLabel: `${rangeLabel(r.start, r.end)}${r.partial ? ", partial week" : ""}${spokenRecovery(r)}`,
    onPress: open(r),
  });
  const monthRow = (r: ReportListItem): LinkListRow => ({
    key: r.period,
    label: formatDay(r.start, { month: "long" }),
    aside: <Aside r={r} />,
    description: r.partial ? "Partial month" : undefined,
    accessibilityLabel: `${formatDay(r.start, DAY.monthYear)}${r.partial ? ", partial month" : ""}${spokenRecovery(r)}`,
    onPress: open(r),
  });
  const groups = view === "weeks" ? groupRows(vm.weeks, (r) => formatDay(r.start, DAY.monthYear), weekRow) : groupRows(vm.months, (r) => r.start.slice(0, 4), monthRow);
  const shown = view === "weeks" && !all ? groups.slice(0, RECENT_MONTHS) : groups;

  return (
    <DetailScreen
      {...common}
      primary={
        empty ? (
          <EmptyState body="No reports yet. Your first weekly report appears once a week has data." />
        ) : (
          <View style={{ gap: MORE_COLUMN_GAP }}>
            {/* Weekly / Monthly in place, as the web's links replace the URL. */}
            <CalmSegmented
              value={view}
              on="ground"
              onChange={(v) => router.setParams({ view: v === "months" ? "months" : undefined, all: undefined })}
              items={[
                { value: "weeks", label: "Weekly" },
                { value: "months", label: "Monthly" },
              ]}
              accessibilityLabel="Report period"
            />
            {shown.map((g) => (
              <LinkList key={g.title} title={g.title} rows={g.rows} />
            ))}
            {shown.length < groups.length && <ShowEarlier onPress={() => router.setParams({ view: undefined, all: "1" })} />}
          </View>
        )
      }
    />
  );
}
