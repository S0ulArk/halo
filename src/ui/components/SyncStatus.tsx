import * as React from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { ago, agoShort, clock } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import type { ColorToken } from "@/ui/theme";
import { BandIcon } from "./BandIcon";
import { Txt } from "./Text";

/** Global shell state read by the headers and sync status (the web's ShellStatus, the parts this needs). */
export type SyncShellStatus = {
  mode: "demo" | "google";
  sync: { state: "ok" | "syncing" | "stale" | "error"; lastSuccessAt: number | null };
  connection?: "connected" | "not_connected" | "not_linked" | "no_device" | "importing" | "auth_revoked" | "stale";
  timeZone?: string;
};

export type SyncView = { dot: ColorToken; label: string; line: string; syncing: boolean };

/** The sync state as a dot colour, a short label and a longer line (popover copy). */
export function syncView(s: SyncShellStatus, nowMs: number | null): SyncView {
  const last = s.sync.lastSuccessAt;
  const rel = last && nowMs ? ago(last, nowMs) : null;
  const at = last ? clock(last, s.timeZone) : null;
  if (s.connection === "auth_revoked" || s.sync.state === "error") return { dot: "recoveryRed", label: "Sync failed", line: at ? `Sync failed. Last success ${at}` : "Sync failed", syncing: false };
  if (s.sync.state === "syncing") return { dot: "coach", label: "Syncing…", line: "Syncing now…", syncing: true };
  if (s.sync.state === "stale") return { dot: "warning", label: rel ? `Last sync ${rel}` : "Sync is behind", line: at ? `Last sync ${at}` : "Sync is behind", syncing: false };
  return { dot: "optimal", label: rel ? `Synced ${rel}` : "Synced", line: at ? `Last sync ${at}` : "Synced", syncing: false };
}

/**
 * The band in the reference app's battery slot (spec §4.3.2): steady, a status dot; syncing, two teal arcs turning
 * around it in place of the dot. The 4 px left margin keeps the ring clear of the "6m" beside it.
 */
function Band({ dot, syncing }: { dot: string; syncing: boolean }) {
  const c = useCalm();
  const [spin] = React.useState(() => new Animated.Value(0));
  React.useEffect(() => {
    if (!syncing) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [syncing, spin]);
  return (
    <View style={{ marginLeft: 4, width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
      <BandIcon size={22} />
      {syncing ? (
        <Animated.View style={{ position: "absolute", left: -4, top: -4, width: 32, height: 32, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
          <Svg width={32} height={32} viewBox="0 0 36 36">
            <Circle cx={18} cy={18} r={16} fill="none" stroke={c.teal} strokeOpacity={0.18} strokeWidth={1.8} />
            {/* Two 25-unit arcs opposite each other on a 100.5-unit circumference. */}
            <Circle cx={18} cy={18} r={16} fill="none" stroke={c.teal} strokeWidth={1.8} strokeLinecap="round" strokeDasharray={[25, 25.3]} />
          </Svg>
        </Animated.View>
      ) : (
        // Ringed in the button's white, so the dot sits cut out of the band.
        <View style={{ position: "absolute", top: -4, right: -6, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: c.card, backgroundColor: dot }} />
      )}
    </View>
  );
}

/**
 * Sync freshness in the battery slot, as the Calm top bar's white round button (a pill with the text): "12m" or
 * "Demo", the band icon and a status dot. The web opens a popover; here `onPress` opens whatever the screen provides
 * (a BottomSheet with `syncView(...).line` and a Sync now button).
 */
export function SyncStatus({ status, now, onPress, hideText }: { status: SyncShellStatus; now: number | null; onPress?: () => void; hideText?: boolean }) {
  const { c } = useTheme();
  const calm = useCalm();
  const v = syncView(status, now);
  const short = status.mode === "demo" ? "Demo" : status.sync.lastSuccessAt && now ? agoShort(status.sync.lastSuccessAt, now) : "";
  const text = !hideText && !!short;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={status.mode === "demo" ? `Demo data. ${v.label}` : v.label}
      style={({ pressed }) => ({ height: 44, minWidth: 44, borderRadius: 22, backgroundColor: calm.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingLeft: text ? 14 : 6, paddingRight: text ? 12 : 8, opacity: pressed ? 0.7 : 1 })}
    >
      {text && (
        <Txt size={15} lineHeight={20} color={calm.ink} align="right" style={font.numeric(600)}>
          {short}
        </Txt>
      )}
      <Band dot={c[v.dot]} syncing={v.syncing} />
    </Pressable>
  );
}
