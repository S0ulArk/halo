import * as React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { monotonePath, runs } from "@/lib/charts";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { Txt } from "./Text";

/**
 * A small line of recent values (oldest first) with the normal range shaded and the latest value dotted, in the Calm
 * language: a smooth 2.5 px line with round ends, the range a soft pastel of the line's colour between dotted edges,
 * the latest value a dot ringed in the card colour. Plain SVG stretched to its box; the dot and the dotted edges are
 * Views so they stay round. Gaps (null) break the line. It draws at once: no wipe or pop on mount.
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
  const stroke = color ?? calm.sub;
  const xs = values.flatMap((v) => (v === null ? [] : [v]));
  if (xs.length < 2) return null;
  const lo = Math.min(...xs, band?.low ?? Infinity);
  const hi = Math.max(...xs, band?.high ?? -Infinity);
  const pad = (hi - lo || 1) * 0.12;
  const y = (v: number) => 100 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  const x = (i: number) =>
    values.length === 1 ? 50 : (i / (values.length - 1)) * 100;
  // A smooth curve through each run (a monotone cubic never overshoots a point); a lone point is a dot the round cap draws.
  const d = runs(values.map((v, i) => (v === null ? null : { x: x(i), y: y(v) })))
    .map((run) => (run.length === 1 ? `M${run[0].x.toFixed(2)} ${run[0].y.toFixed(2)}h0.01` : monotonePath(run)))
    .join("");
  let lastI = values.length - 1;
  while (lastI >= 0 && values[lastI] === null) lastI--;
  return (
    <View style={[{ gap: 4 }, style]}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={StyleSheet.absoluteFill}>
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ overflow: "visible" }}
          >
            {band && (
              <Rect
                x={0}
                y={y(band.high)}
                width={100}
                height={Math.max(0, y(band.low) - y(band.high))}
                fill={alpha(stroke, 0.1)}
              />
            )}
            <Path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </Svg>
        </View>
        {/* The range's edges: dotted, in the faint grey (native dotted borders keep their dots round at any stretch). */}
        {band &&
          [band.high, band.low].map((v) => (
            <View
              key={v}
              pointerEvents="none"
              style={{ position: "absolute", left: 0, right: 0, top: `${y(v)}%`, marginTop: -0.75, height: 0, borderTopWidth: 1.5, borderStyle: "dotted", borderColor: alpha(calm.faint, 0.7) }}
            />
          ))}
        {lastI >= 0 && (
          <View
            style={{
              position: "absolute",
              left: `${x(lastI)}%`,
              top: `${y(values[lastI]!)}%`,
              width: 13,
              height: 13,
              marginLeft: -6.5,
              marginTop: -6.5,
              borderRadius: 6.5,
              borderWidth: 2.5,
              borderColor: calm.card,
              backgroundColor: stroke,
            }}
          />
        )}
      </View>
      {caption && (
        // The Calm caption: small grey capitals with air between the letters.
        <Txt size={10} lineHeight={13} weight={700} uppercase color={calm.faint} align="right" style={{ letterSpacing: 1 }}>
          {caption}
        </Txt>
      )}
    </View>
  );
}
