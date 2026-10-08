import * as React from "react";
import { Image, Pressable, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { CircleUserRound } from "lucide-react-native";
import { BAND_WORD, recoveryBand } from "@/lib/bands";
import { formatValue } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher";
import { HeaderFrame } from "./DetailHeader";
import { MiniRing, type MiniRingVariant } from "./MiniRing";
import { SyncStatus, type SyncShellStatus } from "./SyncStatus";
import { Txt } from "./Text";

export type HeaderRing = { value: number | null; onPress: () => void };
/** The day's three scores for the ring row (the dials' own view model), with their detail links. */
export type HeaderRings = Record<MiniRingVariant, HeaderRing>;

const RING_ORDER: { key: MiniRingVariant; label: string }[] = [
  { key: "sleep", label: "Sleep" },
  { key: "recovery", label: "Recovery" },
  { key: "strain", label: "Strain" },
];

function ringLabel(key: MiniRingVariant, label: string, value: number | null) {
  if (value === null) return `${label}: no score. Open ${label}`;
  if (key === "recovery") return `Recovery ${formatValue("int", value)} percent, ${BAND_WORD[recoveryBand(value)].toLowerCase()}. Open Recovery`;
  if (key === "sleep") return `Sleep performance ${formatValue("int", value)} percent. Open Sleep`;
  return `Strain ${formatValue("decimal1", value)} of 21. Open Strain`;
}

/** The streak flame: a red-orange body and an orange-yellow core, flat fills (no SVG gradient). Sized by the row's `u`. */
export function StreakFlame({ u = 0.76 }: { u?: number }) {
  const { c } = useTheme();
  const h = u * 20;
  return (
    <Svg width={(h * 20) / 24} height={h} viewBox="0 0 20 24">
      <Path fill={c.flameBody} d="M10.4 0.6c.6 3.8 3.2 5.6 5.1 8.3 1.6 2.3 2.5 4.6 2.5 7.2 0 4.6-3.6 7.6-8 7.6s-8-3-8-7.4c0-3 1.4-5.2 3-7 .3 1.6 1 2.8 2.1 3.5-.3-3.6.9-6.6 3.3-12.2z" />
      <Path fill={c.flameCoreTop} d="M10.2 11.4c.5 2 2 2.9 2.9 4.4.6 1 .9 1.9.9 2.9 0 2.3-1.8 3.9-4 3.9s-4-1.5-4-3.7c0-1.6.8-2.7 1.8-3.6.2.8.6 1.4 1.1 1.7-.1-2 .3-3.7 1.3-5.6z" />
    </Svg>
  );
}

/** The user's photo, else the no-photo outline. */
export function UserAvatar({ src, size }: { src: string | null | undefined; size: number }) {
  const c = useCalm();
  return src ? (
    <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />
  ) : (
    <CircleUserRound size={size} color={c.ink} strokeWidth={1.5} />
  );
}

export type HomeHeaderProps = {
  dateSwitcher: DateSwitcherProps;
  sync: { status: SyncShellStatus; now: number | null; onPress?: () => void };
  /** Consecutive worn days; hidden on past days (pass null there). */
  streak?: { days: number } | null;
  avatar?: string | null;
  onAvatarPress?: () => void;
  /** The day's scores for the ring row; shown when `showRings` (the collapsed state). */
  rings?: HeaderRings;
  showRings?: boolean;
};

/**
 * Home's header (spec §4.3) in the Calm top bar's look: the avatar in a white 44 px circle with the streak in a white
 * pill beside it, the narrow white date pill, and the sync status in its white round button, all on the solid ground.
 * When `showRings`, the mini Sleep / Recovery / Strain ring row sits under it. The web morphs the dials into the ring
 * row on scroll; here the screen toggles `showRings` from its scroll offset (the dials' top passing under the header).
 */
export function HomeHeader({ dateSwitcher, sync, streak, avatar, onAvatarPress, rings, showRings }: HomeHeaderProps) {
  const c = useCalm();
  const { width } = useWindowDimensions();
  const narrow = width < 400;
  return (
    <HeaderFrame>
      <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: narrow ? 6 : 8, paddingHorizontal: 16, paddingVertical: 4 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Pressable
            onPress={onAvatarPress}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={4}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
          >
            <UserAvatar src={avatar} size={avatar ? 36 : 28} />
          </Pressable>
          {streak && streak.days > 0 && (
            <View accessibilityLabel={`${streak.days}-day streak`} style={{ height: 32, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 16, backgroundColor: c.card, paddingHorizontal: 10 }}>
              <StreakFlame u={0.56} />
              <Txt size={14} lineHeight={18} color={c.ink} style={font.numeric(700)}>
                {streak.days}
              </Txt>
            </View>
          )}
        </View>
        <DateSwitcher {...dateSwitcher} narrow style={[{ backgroundColor: c.card, height: 40, borderRadius: 20, paddingHorizontal: 4 }, dateSwitcher.style]} />
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end" }}>
          <SyncStatus status={sync.status} now={sync.now} onPress={sync.onPress} hideText={width < 380 && !streak} />
        </View>
      </View>
      {showRings && rings && (
        <View accessibilityLabel="Today’s scores" style={{ height: 40, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }}>
          {RING_ORDER.map(({ key, label }) => {
            const ring = rings[key];
            return (
              <View key={key} style={{ flex: 1, alignItems: "center" }}>
                <Pressable onPress={ring.onPress} accessibilityRole="button" accessibilityLabel={ringLabel(key, label, ring.value)} style={{ height: 40, flexDirection: "row", alignItems: "center", gap: width < 380 ? 6 : 8, paddingHorizontal: width < 380 ? 4 : 8 }}>
                  <MiniRing variant={key} value={ring.value} />
                  <Txt size={13} lineHeight={18} weight={600} color={c.ink}>
                    {label}
                  </Txt>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </HeaderFrame>
  );
}
