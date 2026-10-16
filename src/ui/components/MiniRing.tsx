// A score in miniature (the Home header's score row, the reports list) as a small Apple Activity ring in the score's
// colour (Recovery by band), its value in the middle. Lists of them stay still: a ring starts at its value, and only a
// later change (or turning `fill` on) sweeps it, on the UI thread (src/ui/components/Halo.tsx).
import * as React from "react";
import { View } from "react-native";
import { DATA_COLORS, dialColor } from "@/lib/bands";
import { formatValue } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { ActivityRings } from "./Halo";
import { Txt } from "./Text";

export type MiniRingVariant = "sleep" | "recovery" | "strain";

const MAX: Record<MiniRingVariant, number> = { sleep: 100, recovery: 100, strain: 21 };
/** The ring with its value inside, and its stroke (an eighth of it: a small ring reads thicker). */
const SIZE = 36;
const STROKE = 4.5;
/** The ring alone, beside a value its caller prints. */
const BARE = 24;
const BARE_STROKE = 3.5;

/**
 * A score in miniature: a 36 px ring in the score's colour (Recovery by band) with the value in its middle. `fill`
 * false draws the track only; turning it on sweeps the ring in once. `showValue` false draws a 24 px ring alone and
 * leaves the number to the caller (a list that prints its own aligned value column).
 */
export function MiniRing({ variant, value, fill = true, showValue = true }: { variant: MiniRingVariant; value: number | null; fill?: boolean; showValue?: boolean }) {
  const { c } = useTheme();
  const calm = useCalm();
  const max = MAX[variant];
  const frac = fill && value !== null ? Math.min(Math.max(value, 0), max) / max : null;
  const color = value === null ? calm.faint : c[DATA_COLORS[dialColor(variant, value)].fill];
  const size = showValue ? SIZE : BARE;
  return (
    <View importantForAccessibility={showValue ? "auto" : "no-hide-descendants"} style={{ width: size, height: size }}>
      <ActivityRings size={size} stroke={showValue ? STROKE : BARE_STROKE} rings={[{ progress: frac, color }]} still>
        {showValue ? (
          <Txt size={value !== null && variant === "strain" && value >= 10 ? 11 : 12} lineHeight={14} color={value === null ? calm.faint : calm.ink} numberOfLines={1} style={font.numeric(700)}>
            {formatValue(variant === "strain" ? "decimal1" : "int", value)}
          </Txt>
        ) : null}
      </ActivityRings>
    </View>
  );
}
