import * as React from "react";
import { View } from "react-native";
import { Moon } from "lucide-react-native";
import { clock, durationWords } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { TimelineRow, TimelineSkeleton } from "./ActivityCard";
import { Num } from "./calmKit";

export type SleepCardProps = {
  kind: "sleep" | "nap";
  /** Time asleep, minutes. */
  minutes: number;
  /** Epoch ms. */
  start: number;
  end: number;
  /** Opens the sleep screen for the day (the web's `href`). */
  onPress: () => void;
  timeZone?: string;
};

/** "6h 30m" as numbers with small units, so a duration never reads as a clock time beside the row's time range. */
function Asleep({ minutes, color }: { minutes: number; color: string }) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
      {h > 0 && <Num value={String(h)} unit="h" size={22} color={color} />}
      <Num value={h > 0 ? String(m % 60).padStart(2, "0") : String(m)} unit="m" size={22} color={color} />
    </View>
  );
}

/** Sleep or nap row on the day's timeline (spec §5.12): the lavender tile, the times, and the time asleep on the right. */
export function SleepCard({ kind, minutes, start, end, onPress, timeZone }: SleepCardProps) {
  const c = useCalm();
  const name = kind === "nap" ? "Nap" : "Sleep";
  const s = clock(start, timeZone);
  const e = clock(end, timeZone);
  return (
    <TimelineRow
      onPress={onPress}
      // Sleep's pastel: the lavender tile, the hours in its ink.
      icon={Moon}
      tint="lavender"
      value={<Asleep minutes={minutes} color={c.tintInk.lavender} />}
      valueLabel="Asleep"
      name={name}
      start={s}
      end={e}
      label={`${name}, ${durationWords(minutes)}, ${s} to ${e}`}
    />
  );
}
SleepCard.Skeleton = TimelineSkeleton;
