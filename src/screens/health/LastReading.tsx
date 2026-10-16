// How long ago the newest heart-rate reading landed ("2 minutes ago"), with a live dot that sends out a soft ring while
// the reading is under five minutes old (the web's LastReading). The ring is one Reanimated loop on the UI thread that
// runs only while the reading is fresh, the screen is focused and the app is open; Reduce motion keeps the dot still.
import * as React from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useIsFocused } from "expo-router";
import { ago } from "@/lib/format";
import { Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { useAppActive, useReduceMotion } from "@/ui/motion/system";
import { useNow } from "./shells";

/** A reading this recent counts as live: the band, the phone and Health Connect take a minute or three between them. */
const LIVE_MS = 5 * 60_000;

/** "● 2 minutes ago": the dot pings while the reading is under 5 minutes old. */
export function LastReading({ t }: { t: number }) {
  const c = useCalm();
  const now = useNow();
  const fresh = now - t < LIVE_MS;
  const focused = useIsFocused();
  const active = useAppActive();
  const reduce = useReduceMotion();
  const running = fresh && focused && active && !reduce;
  const ping = useSharedValue(0);
  React.useEffect(() => {
    if (!running) {
      cancelAnimation(ping);
      ping.set(0);
      return;
    }
    ping.set(0);
    ping.set(withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.cubic) }), -1, false));
    return () => cancelAnimation(ping);
  }, [running, ping]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - ping.value), transform: [{ scale: 1 + ping.value }] }));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessible accessibilityLabel={`${fresh ? "Live, " : ""}${ago(t, now)}`}>
      {fresh && (
        <View style={{ width: 8, height: 8 }}>
          <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 4, backgroundColor: c.tintInk.rose }, ring]} />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.tintInk.rose }} />
        </View>
      )}
      <Txt size={13} lineHeight={18} style={{ color: c.sub, fontVariant: ["tabular-nums"], flexShrink: 1 }}>
        {ago(t, now)}
      </Txt>
    </View>
  );
}
