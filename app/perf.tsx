// A hidden route for frame-time measurements over adb: pulse://perf?glass=0&shadow=0&layer=0 turns off the live glass
// backdrop, the glass shadows or the rising cards' GPU layers for this run (src/lib/perfFlags.ts), then goes to Today.
import * as React from "react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { setPerfFlags } from "@/lib/perfFlags";

export default function PerfRoute() {
  const p = useLocalSearchParams<{ glass?: string; shadow?: string; layer?: string; bar?: string }>();
  const router = useRouter();
  React.useEffect(() => {
    const on = (v: string | undefined) => v !== "0";
    setPerfFlags({ liveGlass: on(p.glass), glassShadow: on(p.shadow), riseLayer: on(p.layer), barOnlyGlass: p.bar === "1" });
    router.replace("/" as Href);
  }, [p.glass, p.shadow, p.layer, p.bar, router]);
  return null;
}
