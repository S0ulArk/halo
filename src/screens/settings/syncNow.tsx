// The web's SyncNowButton, shared by Settings › Data source's sources (sections.tsx, google.tsx): re-imports and
// rescores; the icon spins while it runs.
import * as React from "react";
import { Animated, Easing } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { useApp } from "@/state/app";
import { Txt } from "@/ui";
import { CalmButton, useCalm } from "./calmKit";

export function SyncNowButton() {
  const c = useCalm();
  const app = useApp();
  const running = app.status === "syncing";
  const [spin] = React.useState(() => new Animated.Value(0));
  React.useEffect(() => {
    if (!running) return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [running, spin]);
  const run = async () => {
    await app.refresh();
  };
  return (
    <CalmButton variant="secondary" on="card" onPress={() => void run()} disabled={running} accessibilityLabel={running ? "Syncing…" : "Sync now"}>
      <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
        <RefreshCw size={18} color={c.teal} strokeWidth={2} />
      </Animated.View>
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal }}>
        {running ? "Syncing…" : "Sync now"}
      </Txt>
    </CalmButton>
  );
}
