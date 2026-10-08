import * as React from "react";
import { Pressable, View } from "react-native";
import { Bike, Dumbbell, Footprints, PersonStanding, Timer, type LucideIcon } from "lucide-react-native";
import { clock, formatValue, spoken } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { useCalm, type CalmTint } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { Caption, useSoftFill } from "./calmKit";
import { Skeleton, SkeletonText } from "./Skeleton";
import { Txt } from "./Text";

export type ActivityKind = "run" | "ride" | "walk" | "strength" | "workout";
export const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = { run: PersonStanding, ride: Bike, walk: Footprints, strength: Dumbbell, workout: Timer };

export type ActivityCardProps = {
  /** "Running", "Strength training", "Cycling", "Walking", "Workout". */
  name: string;
  kind: ActivityKind;
  /** Activity strain; null with `insufficient_hr_data` shows "--". */
  strain: Metric<number>;
  /** Epoch ms. */
  start: number;
  end: number;
  /** Opens the activity (the web's `href`). */
  onPress: () => void;
  timeZone?: string;
  /** Recorded distance; the caption shows it (with pace) under the name. Omit or null for none. */
  distanceKm?: number | null;
  /** Seconds per km (runs and walks). */
  paceS?: number | null;
};

/** "5.21 km at 5:32 /km", "18.40 km", or null with no distance. */
export function distanceText(km: number | null | undefined, paceS?: number | null) {
  if (km == null) return null;
  return paceS == null ? `${formatValue("decimal2", km)} km` : `${formatValue("decimal2", km)} km at ${formatValue("pace", paceS)} /km`;
}

/** The timeline row's icon tile; the name over its times (40 px) and the number over its label (43 px) sit on it. */
export const TIMELINE_TILE = 44;
/** The name's block (21 + 1 + 18) centred on the tile: a longer name or a caption grows the row downward only. */
export const TIMELINE_TEXT_TOP = (TIMELINE_TILE - 40) / 2;

/**
 * One row on the day's timeline (spec §5.12), shared by ActivityCard and SleepCard, Calm: the family's pastel icon
 * tile, the name (16/21 600 ink) over its time range in the numeric face and an optional caption, and the row's number
 * on the right in the family's ink with its caps label under it. Flat (no fill, no shadow): a press tints the row with
 * the quiet fill. Names and captions wrap, never cut short; the tile and the number stay on the name's first lines.
 */
export function TimelineRow({
  onPress,
  icon,
  tint,
  value,
  valueLabel,
  muted,
  name,
  caption,
  start,
  end,
  label,
}: {
  onPress: () => void;
  icon: LucideIcon;
  /** The family's pastel: peach for activities, lavender for sleep. */
  tint: CalmTint;
  /** The number on the right ("8.4", or a duration node). */
  value: React.ReactNode;
  /** Its caps label ("Strain", "Asleep"). */
  valueLabel: string;
  /** No number to show: the value is drawn in the faint grey. */
  muted?: boolean;
  name: string;
  caption?: string;
  start: string;
  end: string;
  label: string;
}) {
  const c = useCalm();
  const fill = useSoftFill();
  const Icon = icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ minHeight: 64, marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 18, flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: pressed ? fill : "transparent" })}
    >
      <View style={{ width: TIMELINE_TILE, height: TIMELINE_TILE, borderRadius: 14, backgroundColor: c.tint[tint], alignItems: "center", justifyContent: "center" }}>
        <Icon size={22} color={c.tintInk[tint]} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1, paddingTop: TIMELINE_TEXT_TOP }}>
        <Txt size={16} lineHeight={21} weight={600} color={c.ink}>
          {name}
        </Txt>
        <Txt size={13} lineHeight={18} color={c.sub} style={font.numeric(600)}>
          {`${start} – ${end}`}
        </Txt>
        {caption && (
          <Txt size={13} lineHeight={18} color={c.sub}>
            {caption}
          </Txt>
        )}
      </View>
      <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
        {typeof value === "string" ? (
          <Txt size={22} lineHeight={26} color={muted ? c.faint : c.tintInk[tint]} style={font.numeric(700)}>
            {value}
          </Txt>
        ) : (
          // A duration's own numbers, in the same 26 px line, so every row's caps label sits at one height.
          <View style={{ minHeight: 26, justifyContent: "center" }}>{value}</View>
        )}
        <Caption style={{ marginTop: 2 }}>{valueLabel}</Caption>
      </View>
    </Pressable>
  );
}

export function ActivityCard({ name, kind, strain, start, end, onPress, timeZone, distanceKm, paceS }: ActivityCardProps) {
  const Icon = ACTIVITY_ICON[kind];
  const s = clock(start, timeZone);
  const e = clock(end, timeZone);
  const value = formatValue("decimal1", strain.value);
  const distance = distanceText(distanceKm, paceS);
  const noStrain = strain.value === null;
  // The full reason when it is the only caption; beside a distance, the short form keeps the row on one line.
  const caption = distance ? (noStrain ? `${distance} · No strain` : distance) : noStrain ? "No strain: not enough heart-rate data" : undefined;
  const spokenDistance = distanceKm == null ? "" : `, ${spoken(formatValue("decimal2", distanceKm), "km")}${paceS == null ? "" : ` at ${spoken(formatValue("pace", paceS), "/km")}`}`;
  return (
    <TimelineRow
      onPress={onPress}
      // Strain's pastel: the peach tile, the strain number in its ink.
      icon={Icon}
      tint="peach"
      value={value}
      valueLabel="Strain"
      muted={noStrain}
      name={name}
      caption={caption}
      start={s}
      end={e}
      label={`${name}${spokenDistance}, ${noStrain ? "no strain" : `strain ${value}`}, ${s} to ${e}`}
    />
  );
}

/** Timeline rows in their real box: the icon tile, bars for the name and times, and the number on the right. */
export function TimelineSkeleton({ rows = 2 }: { rows?: number }) {
  const c = useCalm();
  return (
    <View>
      {Array.from({ length: rows }, (_, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={{ height: 1, marginLeft: 56, backgroundColor: c.line }} />}
          <View style={{ minHeight: 64, paddingVertical: 10, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <Skeleton radius={14} style={{ width: TIMELINE_TILE, height: TIMELINE_TILE }} />
            <View style={{ flex: 1, minWidth: 0, gap: 1, paddingTop: TIMELINE_TEXT_TOP }}>
              <SkeletonText role="rowTitle" size={16} lineHeight={21} width={96} />
              <SkeletonText role="caption" size={13} lineHeight={18} width={88} />
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <SkeletonText role="value" size={22} lineHeight={26} width={36} />
              <SkeletonText role="caption" size={11} lineHeight={15} width={44} style={{ marginTop: 2 }} />
            </View>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
ActivityCard.Skeleton = TimelineSkeleton;
