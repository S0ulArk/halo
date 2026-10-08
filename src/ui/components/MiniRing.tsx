import * as React from "react";
import { View } from "react-native";
import { DATA_COLORS, dialColor } from "@/lib/bands";
import { formatValue } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { CapsuleMeter } from "./CapsuleMeter";
import { Txt } from "./Text";

export type MiniRingVariant = "sleep" | "recovery" | "strain";

const MAX: Record<MiniRingVariant, number> = { sleep: 100, recovery: 100, strain: 21 };
const W = 36;
const H = 6;

/**
 * A score in miniature (the Home header's score row, the reports list): the value over a 36 × 6 capsule meter in the
 * score's colour (Recovery by band). The name keeps the old ring's, so callers need no change. `fill` false draws the
 * track only; turning it on moves the fill in once. `showValue` false leaves the number to the caller (a list that
 * prints its own aligned value column).
 */
export function MiniRing({ variant, value, fill = true, showValue = true }: { variant: MiniRingVariant; value: number | null; fill?: boolean; showValue?: boolean }) {
  const { c } = useTheme();
  const calm = useCalm();
  const max = MAX[variant];
  const frac = fill && value !== null ? Math.min(Math.max(value, 0), max) / max : null;
  const color = value === null ? calm.faint : c[DATA_COLORS[dialColor(variant, value)].fill];
  const meter = <CapsuleMeter frac={frac} color={color} height={H} width={W} />;
  if (!showValue) return meter;
  return (
    <View style={{ width: W, gap: 3 }}>
      <Txt role="valueSm" size={13} lineHeight={14} color={value === null ? calm.faint : calm.ink} numberOfLines={1} style={font.numeric(700)}>
        {formatValue(variant === "strain" ? "decimal1" : "int", value)}
      </Txt>
      {meter}
    </View>
  );
}
