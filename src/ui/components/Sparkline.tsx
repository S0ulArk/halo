// A card's small line of recent values, as Apple Health's highlight cards draw one: a smooth line over a gradient fill
// that fades to nothing, the normal range a soft band behind it, the latest value a dot ringed in the card colour.
import * as React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { monotonePath, runs } from "@/lib/charts";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { Txt } from "./Text";

/** The dot on the latest value and its ring in the card colour. */
const DOT = 11;
const RING = 2;

/**
 * A small line of recent values (oldest first) with the normal range shaded and the latest value dotted: a smooth
 * 2.5 px monotone line (it never overshoots a point) with round ends, a fill in its colour fading from 28 % to nothing
 * at the floor, the range a soft band of the line's colour, the latest value a dot ringed in the card colour. Plain
 * SVG stretched to its box (the stroke keeps its width); the dot is a View so it stays round. Gaps (null) break the
 * line and its fill. It draws at once: no wipe or pop on mount.
 */
export function Sparkline({
  values,
  band,
  color,
  caption,
  style,
}: {
  values: (number | null)[];
  band?: { low: number; high: number } | null;
  color?: string;
  caption?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const calm = useCalm();
  const id = React.useId().replace(/:/g, "");
  const stroke = color ?? calm.sub;
  const xs = values.flatMap((v) => (v === null ? [] : [v]));
  if (xs.length < 2) return null;
  const lo = Math.min(...xs, band?.low ?? Infinity);
  const hi = Math.max(...xs, band?.high ?? -Infinity);
  const pad = (hi - lo || 1) * 0.12;
  const y = (v: number) => 100 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  const x = (i: number) => (values.length === 1 ? 50 : (i / (values.length - 1)) * 100);
  // A smooth curve through each run (a monotone cubic never overshoots a point); a lone point is a dot the round cap draws.
  const parts = runs(values.map((v, i) => (v === null ? null : { x: x(i), y: y(v) })));
  const d = parts.map((run) => (run.length === 1 ? `M${run[0].x.toFixed(2)} ${run[0].y.toFixed(2)}h0.01` : monotonePath(run))).join("");
  // Each run's fill: the curve closed down to the floor.
  const area = parts
    .filter((run) => run.length > 1)
    .map((run) => `${monotonePath(run)}L${run[run.length - 1].x.toFixed(2)} 100L${run[0].x.toFixed(2)} 100Z`)
    .join("");
  let lastI = values.length - 1;
  while (lastI >= 0 && values[lastI] === null) lastI--;
  return (
    <View style={[{ gap: 4 }, style]}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
            <Defs>
              <LinearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset={0} stopColor={stroke} stopOpacity={0.28} />
                <Stop offset={1} stopColor={stroke} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {band && <Rect x={0} y={y(band.high)} width={100} height={Math.max(0, y(band.low) - y(band.high))} fill={alpha(stroke, 0.12)} />}
            {area ? <Path d={area} fill={`url(#${id}f)`} /> : null}
            <Path d={d} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </Svg>
        </View>
        {lastI >= 0 && (
          <View
            style={{
              position: "absolute",
              left: `${x(lastI)}%`,
              top: `${y(values[lastI]!)}%`,
              width: DOT,
              height: DOT,
              marginLeft: -DOT / 2,
              marginTop: -DOT / 2,
              borderRadius: DOT / 2,
              borderWidth: RING,
              borderColor: calm.card,
              backgroundColor: stroke,
            }}
          />
        )}
      </View>
      {caption && (
        // The caption: small grey capitals with air between the letters.
        <Txt size={10} lineHeight={13} weight={700} uppercase color={calm.faint} align="right" style={{ letterSpacing: 1 }}>
          {caption}
        </Txt>
      )}
    </View>
  );
}
