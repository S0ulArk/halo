import * as React from "react";
import { Animated, Easing, View } from "react-native";
import { ago } from "@/lib/format";
import { Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { useNow } from "./shells";

/** A reading this recent counts as live: the band, the phone and Health Connect take a minute or three between them. */
const LIVE_MS = 5 * 60_000;

/** "● 2 minutes ago": the dot pulses while the reading is under 5 minutes old (the web's LastReading). */
export function LastReading({ t }: { t: number }) {
  const c = useCalm();
  const now = useNow();
  const fresh = now - t < LIVE_MS;
  const ping = React.useState(() => new Animated.Value(0))[0];
  React.useEffect(() => {
    if (!fresh) return;
    const loop = Animated.loop(Animated.timing(ping, { toValue: 1, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [fresh, ping]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityLabel={`${fresh ? "Live, " : ""}${ago(t, now)}`}>
      {fresh && (
        <View style={{ width: 8, height: 8 }}>
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 4,
              backgroundColor: c.tintInk.rose,
              opacity: ping.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
              transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
            }}
          />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.tintInk.rose }} />
        </View>
      )}
      <Txt size={13} lineHeight={18} style={{ color: c.sub, fontVariant: ["tabular-nums"], flexShrink: 1 }}>
        {ago(t, now)}
      </Txt>
    </View>
  );
}
