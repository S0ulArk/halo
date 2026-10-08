import * as React from "react";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useCalm } from "@/ui/calm";

/**
 * The Halo mark, as the app icon draws it: a luminous ring running mint, sky, lavender and peach, with a soft glow under
 * it. brand: in colour. mono: the ring alone in `mono` (default the ink).
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
          <Stop offset="0" stopColor="#5ef2c0" />
          <Stop offset="0.35" stopColor="#6cc7ff" />
          <Stop offset="0.7" stopColor="#b9a6ff" />
          <Stop offset="1" stopColor="#ffb38a" />
        </LinearGradient>
      </Defs>
      <Circle cx={12} cy={12} r={7.5} stroke={`url(#${id})`} strokeWidth={5.5} strokeOpacity={0.25} fill="none" />
      <Circle cx={12} cy={12} r={7.5} stroke={`url(#${id})`} strokeWidth={3} fill="none" />
    </Svg>
  );
}
