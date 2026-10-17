// The web's SyncNowButton as an iOS action row, shared by Settings › Data source's sources (sections.tsx, google.tsx):
// "Sync now" in blue re-imports and rescores; while it runs the row reads "Syncing…" and its arrows turn, one
// revolution a second, on the UI thread (a Reanimated repeat; still under Reduce motion).
import * as React from "react";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { RefreshCw } from "lucide-react-native";
import { useApp } from "@/state/app";
import { reduceMotionNow } from "@/ui/motion/system";
import { useCalm } from "./calmKit";
import { ButtonRow } from "./list";

/** The two arrows, turning while `spinning`. */
function Arrows({ spinning, color }: { spinning: boolean; color?: string }) {
  const turn = useSharedValue(0);
  React.useEffect(() => {
    if (!spinning || reduceMotionNow()) return;
    turn.set(0);
    turn.set(withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1));
    return () => {
      cancelAnimation(turn);
      turn.set(0);
    };
  }, [spinning, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return (
    <Animated.View style={style}>
      <RefreshCw size={19} color={color} strokeWidth={2.2} />
    </Animated.View>
  );
}

export function SyncNowRow({ description }: { description?: string }) {
  const c = useCalm();
  const app = useApp();
  const running = app.status === "syncing";
  return (
    <ButtonRow
      label={running ? "Syncing…" : "Sync now"}
      description={description}
      leading={<Arrows spinning={running} color={c.teal} />}
      disabled={running}
      onPress={() => void app.refresh()}
    />
  );
}
