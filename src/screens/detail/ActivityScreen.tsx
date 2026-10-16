// Activity `/activity/[id]` (spec §7.4), ported from the web's src/app/(app)/activity/[id]/page.tsx, as Apple Fitness's
// workout summary: the workout's name with its glyph as the large title and its day and times under it, then "Workout
// details" as a grid of big coloured numbers (activity strain, length, distance, pace, heart rate, calories), each
// against your 30-day average for this kind of workout, the strain's split between heart rate and muscle, the heart
// rate through the workout coloured by zone, time in zones, Training Effect, heart-rate recovery and what this kind of
// workout costs next-morning Recovery. No date switcher; back falls back to that day's Strain.
import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { deltaTone } from "@/lib/bands";
import { dayHref } from "@/lib/day";
import { clock, dayLabel, formatValue, hmm, NBSP, type FormatKey } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import { getActivity, type ActivityVM, type KeyStat } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { ACTIVITY_ICON, Card, EmptyState, InsightCard, IntradayHrChart, ReasonPlaceholder, SectionShell, Txt, ZoneBars } from "@/ui";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { TonePill } from "@/ui/components/Meter";
import { tagLabel } from "@/ui/components/primitives";
import { font, TABULAR } from "@/ui/fonts";
import { ActivityCostCard } from "./ActivityCost";
import { TrainingEffectCard } from "./TrainingCards";
import { Num, Sentence } from "./calmKit";
import { DetailScreen, LoadError } from "./DetailScreen";
import { useBack, useRefresh } from "./nav";
import { activitySkeleton } from "./skeletons";
import { hrSeries, statProps } from "./view";

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
  // numbers, instead of the same "band not worn" line three times over an empty page.
  const noHr = vm.hr.value === null && vm.zones.value === null;

  return (
    <DetailScreen
      {...common}
      title={vm.name}
      subtitle={`${dayLabel(vm.day, today)} ${clock(vm.start, timeZone)} to ${clock(vm.end, timeZone)}`}
      titleIcon={
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: calm.tint.peach, alignItems: "center", justifyContent: "center" }}>
          <Icon size={20} color={calm.tintInk.peach} strokeWidth={2} />
        </View>
      }
      hero={<WorkoutDetails vm={vm} noHr={noHr} />}
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
            <SectionShell variant="card" title="Time in zones" accent="heart">
              <ZoneBars variant="rows" data={vm.zones} note={vm.zoneNote} emptyCopy="No heart-rate zones for this activity." />
            </SectionShell>
          </View>
        )
      }
      secondary={[
        // Garmin-style Aerobic Training Effect (version 19), when the workout has heart rate.
        !noHr && <TrainingEffectCard key="te" te={vm.trainingEffect} />,
        // A card of its own. Without heart rate there is nothing to recover from, and the notice says why.
        !noHr && (
          <SectionShell key="hrr" variant="card" title="Heart rate recovery">
            <HeartRateRecovery hrr={vm.hrr} />
          </SectionShell>
        ),
        vm.cost && <ActivityCostCard key="cost" cost={vm.cost} />,
      ]}
      footer={vm.insight ? <InsightCard body={vm.insight} /> : null}
    />
  );
}

/** Each number's colour in the grid, as Fitness colours its own: length yellow, distance blue, pace teal, heart red, calories pink. */
function statInk(c: CalmPalette, key: string): string {
  switch (key) {
    case "duration":
      return c.tintInk.sand;
    case "distance":
      return c.system.blue;
    case "pace":
      return c.system.teal;
    case "avgHr":
    case "maxHr":
      return c.system.red;
    case "calories":
      return c.system.pink;
    default:
      return c.ink;
  }
}

/** One cell of the grid: the caps label, the big number in its colour with its grey unit, then how it compares. */
function Cell({ label, value, unit, color, note, noteColor, spoken, children }: { label: string; value: string; unit?: string; color: string; note?: string; noteColor?: string; spoken: string; children?: React.ReactNode }) {
  const c = useCalm();
  return (
    <View accessible accessibilityLabel={spoken} style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: 12 }}>
      <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
        {label}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" }}>
        <Txt size={28} lineHeight={32} style={[font.numberAt(28, 700), { color }]}>
          {value}
        </Txt>
        {unit ? (
          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.sub, marginLeft: unit === "%" ? 1 : 3 }}>
            {unit}
          </Txt>
        ) : null}
      </View>
      {note ? (
        <Txt size={12} lineHeight={16} weight={500} style={[TABULAR, { color: noteColor ?? c.sub }]}>
          {note}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

/** |n| in a stat's format, without the sign a signed format adds. */
const absText = (format: FormatKey, n: number) => formatValue(format, Math.abs(n)).replace(/^[+−-]/, "");

/** What a grid cell shows. */
type CellData = { key: string; label: string; value: string; unit?: string; color: string; note?: string; noteColor?: string; spoken: string };

/** A stat's cell: its value and unit, and today against the 30-day average for this kind of workout. */
function statCell(c: CalmPalette, k: KeyStat): CellData {
  const p = statProps(k, { iconColor: c.sub, icons: false });
  const v = k.metric.value;
  const unitText = p.unit ? (p.unit === "%" ? "%" : `${NBSP}${p.unit}`) : "";
  let note: string | undefined;
  let noteColor: string | undefined;
  if (v === null) note = reasonCopy(k.metric.reason, k.metric.nightsLeft).short;
  else if (k.average !== null) {
    const t = deltaTone(k.direction === "none" ? "neutral" : k.direction, v, k.average, k.sd);
    const diff = v - k.average;
    const same = absText(p.format, diff) === absText(p.format, 0) || t.dir === "flat";
    note = same ? `In line with avg ${formatValue(p.format, k.average)}${unitText}` : `${diff > 0 ? "▲" : "▼"} ${absText(p.format, diff)}${unitText} vs avg ${formatValue(p.format, k.average)}${unitText}`;
    noteColor = t.tone === "good" ? c.tintInk.mint : t.tone === "bad" ? c.system.orange : c.sub;
  }
  const tags = v === null ? [] : [...(k.metric.provisional ? ["provisional" as const] : []), ...(k.metric.tags ?? [])];
  if (tags.length) note = [note, tags.map(tagLabel).join(", ")].filter(Boolean).join(" · ");
  const value = formatValue(p.format, v);
  return { key: k.key, label: k.label, value, unit: v === null ? undefined : p.unit, color: v === null ? c.faint : statInk(c, k.key), note, noteColor, spoken: [k.label, v === null ? null : `${value}${p.unit ? ` ${p.unit}` : ""}`, note].filter(Boolean).join(", ") };
}

/** Two to a row, in order; an odd last one alone. */
const pairs = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 2) }, (_, i) => xs.slice(i * 2, i * 2 + 2));

/**
 * The workout's numbers as Fitness's "Workout Details": two to a row between half-point rules, each a caps label over
 * a big number in its colour. Activity strain leads in the strain orange with the day's strain under it; the strain's
 * split between heart rate and muscle closes the card as one two-part capsule.
 */
function WorkoutDetails({ vm, noHr }: { vm: ActivityVM; noHr: boolean }) {
  const c = useCalm();
  const s = vm.strain.value;
  const duration = vm.stats.find((k) => k.key === "duration");
  // Without heart rate the heart-rate numbers are dashes the notice below explains: they are left out.
  const stats = vm.stats.filter((k) => k.key !== "duration" && !(noHr && k.metric.value === null));
  const strainCell: CellData = {
    key: "strain",
    label: "Activity strain",
    value: formatValue("decimal1", s),
    color: s === null ? c.faint : c.tintInk.peach,
    note: s === null ? (vm.hr.value !== null ? reasonCopy(vm.strain.reason).short : undefined) : vm.dayStrain !== null ? `Day strain ${formatValue("decimal1", vm.dayStrain)}` : undefined,
    spoken: `Activity strain ${formatValue("decimal1", s)}${vm.dayStrain !== null ? `, day strain ${formatValue("decimal1", vm.dayStrain)}` : ""}`,
  };
  const length: CellData = duration ? statCell(c, duration) : { key: "duration", label: "Duration", value: hmm((vm.end - vm.start) / 60_000), color: c.tintInk.sand, spoken: `Duration ${hmm((vm.end - vm.start) / 60_000)}` };
  const cells = [strainCell, length, ...stats.map((k) => statCell(c, k))];
  const split = vm.loadSplit;
  return (
    <View style={{ alignSelf: "stretch", borderRadius: 20, backgroundColor: c.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: split ? 16 : 4 }}>
      <Txt size={17} lineHeight={22} weight={600} accessibilityRole="header" style={{ color: c.ink }}>
        Workout details
      </Txt>
      {pairs(cells).map((row, i) => (
        <View key={row[0].key} style={[{ flexDirection: "row", gap: 16 }, i > 0 && { borderTopWidth: 0.5, borderTopColor: c.line }]}>
          {row.map((x) => (
            <Cell key={x.key} label={x.label} value={x.value} unit={x.unit} color={x.color} note={x.note} noteColor={x.noteColor} spoken={x.spoken} />
          ))}
          {row.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
      {cells.length > 2 && (
        <Txt size={12} lineHeight={16} style={{ color: c.sub, paddingBottom: split ? 12 : 10 }}>
          Against your 30-day average for this kind of workout.
        </Txt>
      )}
      {split && (
        // WHOOP-style split of the strain: heart rate in the heart red, muscle in the strain orange, in one capsule.
        <View accessible accessibilityLabel={`Heart rate ${split.cardioPct} percent, muscular ${split.muscularPct} percent of this strain`} style={{ gap: 8, borderTopWidth: 0.5, borderTopColor: c.line, paddingTop: 12 }}>
          <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
            {split.cardioPct > 0 && <View style={{ flexGrow: split.cardioPct, backgroundColor: c.system.red }} />}
            {split.muscularPct > 0 && <View style={{ flexGrow: split.muscularPct, backgroundColor: c.system.orange }} />}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Sentence size={13}>Heart rate</Sentence>
              <Num value={`${split.cardioPct}%`} size={15} color={c.system.red} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Sentence size={13}>Muscular</Sentence>
              <Num value={`${split.muscularPct}%`} size={15} color={c.system.orange} />
            </View>
          </View>
        </View>
      )}
    </View>
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
        <Num value={formatValue("int", hrr.value.value)} unit="bpm" size={36} color={c.system.red} />
        <TonePill tone={hrr.value.tone}>{hrr.value.label}</TonePill>
      </View>
      <Sentence>Drop in the first 60 seconds after you stopped. Above 20 is typical for fit adults.</Sentence>
    </View>
  );
}
