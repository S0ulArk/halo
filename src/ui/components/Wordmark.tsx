import * as React from "react";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/ui/ThemeProvider";

/**
 * The Halo wordmark. The glyphs are monoline strokes on a 20-unit cap height, rounded like the ring in the icon: the A
 * is an arch with its bar, and the O a rounded ring.
 * bold: for the in-app header, about 14 to 18 px cap height. black: for a splash, 32 px and up.
 */
const CAP = 20;
const STROKE = { bold: 3.2, black: 4.4 } as const;

function build(s: number) {
  const h = s / 2;
  const r = 5; // corner radius on the centreline (A's arch, L, O)
  const gap = 5.5;
  const base = CAP - h; // centreline of strokes that sit on the baseline
  const d: string[] = [];
  let x = 0;

  // H: the bar a little under half way, level with the A's.
  d.push(`M${x + h} 0V${CAP}M${x + 19 - h} 0V${CAP}M${x + h} 12H${x + 19 - h}`);
  x += 19 + gap;

  // A: an arch with its bar.
  d.push(`M${x + h} ${CAP}V${h + r}A${r} ${r} 0 0 1 ${x + h + r} ${h}H${x + 20 - h - r}A${r} ${r} 0 0 1 ${x + 20 - h} ${h + r}V${CAP}M${x + h} 12H${x + 20 - h}`);
  x += 20 + gap;

  // L
  d.push(`M${x + h} 0V${base}H${x + 15}`);
  x += 15 + gap;

  // O: a rounded ring.
  d.push(`M${x + h + r} ${h}H${x + 20 - h - r}A${r} ${r} 0 0 1 ${x + 20 - h} ${h + r}V${base - r}A${r} ${r} 0 0 1 ${x + 20 - h - r} ${base}H${x + h + r}A${r} ${r} 0 0 1 ${x + h} ${base - r}V${h + r}A${r} ${r} 0 0 1 ${x + h + r} ${h}Z`);
  const width = x + 20;
  return { d: d.join(""), viewBox: `0 0 ${+width.toFixed(2)} ${CAP}`, width, height: CAP };
}

export const GLYPHS = { bold: build(STROKE.bold), black: build(STROKE.black) };

/** The wordmark at `height` px (default 16), in `color` (default the foreground). */
export function Wordmark({ height = 16, color, weight = "bold" }: { height?: number; color?: string; weight?: keyof typeof STROKE }) {
  const { c } = useTheme();
  const g = GLYPHS[weight];
  const width = (height * g.width) / g.height;
  return (
    <Svg width={width} height={height} viewBox={g.viewBox} accessibilityLabel="Halo">
      <Path d={g.d} fill="none" stroke={color ?? c.foreground} strokeWidth={STROKE[weight]} strokeMiterlimit={8} />
    </Svg>
  );
}
