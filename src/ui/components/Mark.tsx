// The Halo mark: the app icon's ring, drawn as a vector so it stays sharp at any size (the onboarding and About heads,
// the coach's empty state, the tab bar's action, the demo data source).
import * as React from "react";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { HALO, useCalm } from "@/ui/calm";

/**
 * The mark as the app icon draws it: a ring running green, cyan, indigo and orange (the halo in iOS's system colours)
 * over a faint wider pass of the same colours. brand: in colour. mono: the ring alone in `mono` (default the ink).
 */
export function Mark({ size = 24, color = "brand", mono }: { size?: number; color?: "brand" | "mono"; mono?: string }) {
  const c = useCalm();
  const id = React.useId().replace(/:/g, "");
  if (color === "mono") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Halo">
        <Circle cx={12} cy={12} r={7.5} stroke={mono ?? c.ink} strokeWidth={3} fill="none" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Halo">
      <Defs>
        <LinearGradient id={id} x1="0.15" y1="0" x2="0.85" y2="1">
          {HALO.map((stop, i) => (
            <Stop key={stop} offset={String(i / (HALO.length - 1))} stopColor={stop} />
          ))}
        </LinearGradient>
      </Defs>
      <Circle cx={12} cy={12} r={7.5} stroke={`url(#${id})`} strokeWidth={5.5} strokeOpacity={0.25} fill="none" />
      <Circle cx={12} cy={12} r={7.5} stroke={`url(#${id})`} strokeWidth={3} fill="none" />
    </Svg>
  );
}
