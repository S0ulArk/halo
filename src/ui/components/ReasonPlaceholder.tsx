import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Activity, HeartPulse, Hourglass, RefreshCw, Watch, type LucideIcon } from "lucide-react-native";
import { reasonCopy, type ReasonCode } from "@/lib/reasons";
import { useCalm } from "@/ui/calm";
import { IconTile } from "./calmKit";
import { Txt } from "./Text";

/** The web's reason icons (its reasons.ts carries them; the mobile port maps them here). */
export const REASON_ICON: Record<ReasonCode, LucideIcon | null> = {
  calibrating: Hourglass,
  no_hrv_last_night: HeartPulse,
  awaiting_sleep_sync: RefreshCw,
  insufficient_hr_data: Activity,
  band_not_worn: Watch,
  no_data: null,
};

export type ReasonPlaceholderProps = {
  /** Any string; unknown codes fall back to `no_data`. */
  reason: string | null | undefined;
  nightsLeft?: number;
  size: "sm" | "md" | "lg";
  /** Replaces the long copy where a screen words it its own way ("Forecast starts after 14 nights."). */
  copy?: string;
  style?: StyleProp<ViewStyle>;
};

/** Copy and icon for a reason code (spec §5.14), in the Calm look: grey sentences, the icon in a quiet tile. */
export function ReasonPlaceholder({ reason, nightsLeft, size, copy, style }: ReasonPlaceholderProps) {
  const c = useCalm();
  const r = reasonCopy(reason, nightsLeft);
  const Icon = REASON_ICON[r.code];
  const long = copy ?? r.long;

  if (size === "sm")
    return (
      <View style={[{ flexDirection: "row", alignItems: "center", gap: 6 }, style]}>
        {Icon && <Icon size={14} color={c.faint} strokeWidth={2} />}
        <Txt size={13} lineHeight={18} color={c.sub} style={{ flexShrink: 1 }}>
          {long}
        </Txt>
      </View>
    );

  if (size === "md")
    return (
      <View style={[{ alignItems: "center", gap: 10, paddingVertical: 24 }, style]}>
        {Icon && <IconTile icon={<Icon size={20} color={c.sub} strokeWidth={1.75} />} tint={null} size={40} radius={13} iconSize={20} />}
        <Txt size={14} lineHeight={19} color={c.sub} align="center" style={{ maxWidth: 300 }}>
          {long}
        </Txt>
      </View>
    );

  return (
    <View style={[{ alignItems: "center", gap: 8 }, style]}>
      {Icon && <IconTile icon={<Icon size={22} color={c.sub} strokeWidth={1.75} />} tint={null} size={44} radius={14} iconSize={22} />}
      <Txt size={15} lineHeight={20} weight={600} color={c.sub} align="center" numberOfLines={2} style={{ maxWidth: 160 }}>
        {r.code === "no_data" ? "No data" : r.short}
      </Txt>
    </View>
  );
}
