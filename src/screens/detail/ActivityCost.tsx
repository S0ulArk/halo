// Mobile: Activity Cost (what each kind of workout costs next-morning Recovery, and how long it takes to come back) and
// detected activities (sustained elevated HR with no workout recorded), shared by Activities, Activity and Behaviour
// insights, in the iOS look: each kind an inset grouped list row (its glyph on a blue square, the name over what it
// usually does, the next-morning change on the right in green or red), what they are measured against as the list's
// footer. The wording lives in src/queries/activityCost.ts.
import * as React from "react";
import { View } from "react-native";
import { Activity } from "lucide-react-native";
import { clock, formatValue, MISSING } from "@/lib/format";
import { baselineText, bounceText, costCaption, costSentence, costTone, costValue, getActivityCost } from "@/queries/activityCost";
import type { ActivityCostEntry, ActivityCostVM, ActivityVM, DetectedItem } from "@/queries";
import { useQuery } from "@/state/app";
import { ACTIVITY_ICON, SectionShell, Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { TIMELINE_TEXT_TOP, TIMELINE_TILE } from "@/ui/components/ActivityCard";
import { font } from "@/ui/fonts";
import { Caption, Num, Sentence, Title } from "./calmKit";
import { ListGroup, ListRow } from "./ios";

const CAVEAT = "Averages over your history, not proof of cause.";

/** A cost's ink: a dip in red (worse), a lift in green (better), barely any (or none measured) the secondary grey. */
function useToneColor(e: ActivityCostEntry) {
  const c = useCalm();
  const tone = costTone(e);
  return tone === "cost" ? c.system.red : tone === "lift" ? c.tintInk.mint : c.sub;
}

function CostRow({ e, minSessions }: { e: ActivityCostEntry; minSessions: number }) {
  const c = useCalm();
  const color = useToneColor(e);
  const value = costValue(e);
  const caption = costCaption(e, minSessions);
  return (
    <ListRow
      icon={ACTIVITY_ICON[e.kind]}
      iconColor={c.system.blue}
      label={e.name}
      detail={caption}
      value={value ?? MISSING}
      bold
      valueColor={value ? color : c.faint}
      accessibilityLabel={`${e.name}: ${value ? `${value} next-morning Recovery. ` : ""}${caption}`}
    />
  );
}

/** An inset grouped list: a row per kind (`items`, all of them by default), then what they are measured against. */
export function ActivityCostList({ vm, items = vm.items, title }: { vm: ActivityCostVM; items?: ActivityCostEntry[]; title?: string }) {
  const base = baselineText(vm);
  return (
    <ListGroup title={title} footer={base ? `${base}. ${CAVEAT}` : CAVEAT}>
      {items.map((e) => (
        <CostRow key={e.kind} e={e} minSessions={vm.minSessions} />
      ))}
    </ListGroup>
  );
}

/** Behaviour insights' group (Recovery only): every kind's cost, loaded on its own; nothing before any workout. */
export function ActivityCostSection() {
  const q = useQuery((ctx) => getActivityCost(ctx), [], "activitycost");
  const vm = q.data;
  if (!vm?.items.length) return null;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <View accessibilityRole="header">
          <Title>Activity cost</Title>
        </View>
        <Sentence>How each kind of workout changes your next-day Recovery, and how many days it takes to come back.</Sentence>
      </View>
      <ActivityCostList vm={vm} />
    </View>
  );
}

/** The Activity screen's card: this kind's cost, the morning after this workout, and the baseline, as a grouped list. */
export function ActivityCostCard({ cost }: { cost: NonNullable<ActivityVM["cost"]> }) {
  const c = useCalm();
  const e = cost.item;
  const color = useToneColor(e);
  const value = costValue(e);
  const rows: [string, string][] = [];
  if (cost.nextMorning !== null) rows.push(["Recovery after this one", `${formatValue("int", cost.nextMorning)}%`]);
  // Only a dip has a bounce-back; the sentence says what a lift or no change means.
  if (costTone(e) === "cost") rows.push(["Typical bounce-back", bounceText(e)]);
  rows.push([cost.baselineKind === "rest" ? "Rest-day Recovery" : "Average Recovery", `${formatValue("int", cost.baseline)}${cost.baseline === null ? "" : "%"}`]);
  return (
    <SectionShell variant="card" title="Recovery cost" accent="recovery">
      <View style={{ gap: 12 }}>
        {value !== null && (
          <View accessible accessibilityLabel={`${value} next-morning Recovery`}>
            <Num value={value} size={34} color={color} />
            <Caption style={{ marginTop: 2 }}>Next-morning Recovery</Caption>
          </View>
        )}
        <Sentence>{costSentence(e, cost)}</Sentence>
        <View style={{ borderTopWidth: 0.5, borderTopColor: c.line }}>
          {rows.map(([k, v], i) => (
            // A label that wraps keeps its value on its first line.
            <View key={k} accessible accessibilityLabel={`${k}: ${v}`} style={[{ minHeight: 44, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingVertical: 11 }, i > 0 && { borderTopWidth: 0.5, borderTopColor: c.line }]}>
              <Txt size={16} lineHeight={21} style={{ flex: 1, minWidth: 0, color: c.ink }}>
                {k}
              </Txt>
              <Txt size={16} lineHeight={21} style={[font.numeric(500), { color: c.sub, flexShrink: 1, textAlign: "right" }]}>
                {v}
              </Txt>
            </View>
          ))}
        </View>
        <Sentence size={13}>{CAVEAT}</Sentence>
      </View>
    </SectionShell>
  );
}

/**
 * A detected activity on the day's list: the timeline row's box, dashed and unfilled where a recorded one is solid,
 * with a faint strain chip, and no detail screen to open.
 */
export function DetectedRow({ item, timeZone }: { item: DetectedItem; timeZone: string }) {
  const c = useCalm();
  const Icon = item.kind === "cardio" ? Activity : ACTIVITY_ICON[item.kind];
  const s = clock(item.start, timeZone);
  const e = clock(item.end, timeZone);
  const steps = item.steps ? ` · ${formatValue("grouped", item.steps)} steps` : "";
  // The timeline row's shape (icon tile, name over its times, the number on the right), told apart from a recorded
  // workout by its dashed tile and grey name: shown for reference only.
  return (
    // The same box, lines and line heights as the timeline row it sits between, so the lists' columns hold.
    <View
      accessible
      accessibilityLabel={`Detected activity, likely ${item.label.toLowerCase()}, average heart rate ${item.avgHr} bpm, ${s} to ${e}. Not a recorded workout.`}
      style={{ minHeight: 64, paddingVertical: 10, flexDirection: "row", alignItems: "flex-start", gap: 12 }}
    >
      <View style={{ width: TIMELINE_TILE, height: TIMELINE_TILE, borderRadius: TIMELINE_TILE / 2, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.tintInk.peach, alignItems: "center", justifyContent: "center" }}>
        <Icon size={22} color={c.tintInk.peach} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1, paddingTop: TIMELINE_TEXT_TOP }}>
        <Txt size={16} lineHeight={21} weight={600} color={c.sub}>
          Detected activity
        </Txt>
        <Txt size={13} lineHeight={18} color={c.sub} style={font.numeric(500)}>
          {`${s} – ${e}`}
        </Txt>
        <Txt size={13} lineHeight={18} color={c.sub}>
          {`${item.label} · ${item.avgHr} bpm avg${steps}`}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
        <Txt size={22} lineHeight={26} color={c.tintInk.peach} style={font.numberAt(22, 700)}>
          {formatValue("decimal1", item.strain)}
        </Txt>
        <Caption style={{ marginTop: 2 }}>Strain</Caption>
      </View>
    </View>
  );
}

export const DETECTED_NOTE =
  "Detected activity: 12 minutes or more of raised heart rate with no workout recorded, labelled from your steps. It is shown for reference and adds nothing to your scores.";
