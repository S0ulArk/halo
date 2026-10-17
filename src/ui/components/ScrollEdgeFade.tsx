// The scroll edge at a screen's foot, as iOS draws it under floating controls (the tab bar, a workout's round
// buttons): the page fades into its ground colour, so content that scrolls under the controls never fights their
// labels. Put it inside the GlassTarget's content, after the page, so the glass above bends the faded page rather
// than the raw text. One static gradient: nothing moves and nothing redraws.
import * as React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { alpha } from "@/lib/utils";
import { useTheme } from "@/ui/ThemeProvider";

/** `height`: from the screen's bottom edge to a little above the controls' top. */
export function ScrollEdgeFade({ height }: { height: number }) {
  const { c } = useTheme();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[alpha(c.background, 0), alpha(c.background, 0.82), c.background]}
      locations={[0, 0.45, 1]}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height }}
    />
  );
}
