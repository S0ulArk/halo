// The Halo Age hero's number, as the design draws it: Inter extra bold in a diagonal gradient (green into teal while
// younger than your age, orange into red once older), its digits rolling into place like a watch's date wheel as it
// mounts. Drawn with Skia: the glyphs go white into a layer and the gradient is laid over them with `srcIn`, so only the
// glyphs take it; each digit is a column of 0-9 slid by one transform on the UI thread, so a roll redraws one small
// canvas and runs no JS. Until Skia has read the typeface the same number shows as plain text in the gradient's first
// colour, in the same box, so nothing moves when the canvas takes over.
import * as React from "react";
import { View } from "react-native";
import { Canvas, Group, LinearGradient, Rect, Text as SkText, rect, useFont, vec, type SkFont } from "@shopify/react-native-skia";
import { cancelAnimation, useDerivedValue, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { Txt } from "@/ui";
import { DRAW_MS } from "@/ui/components/Halo";
import { font as type, iosTracking } from "@/ui/fonts";
import { REASE } from "@/ui/motion/easing";
import { reduceMotionNow } from "@/ui/motion/system";

const DIGITS = "0123456789".split("");
/** A rolling column's clip reaches this far past its digit either side, so a wider passing digit is never cut. */
const BLEED = 8;

/** One digit's column: 0-9 stacked a line apart, slid up so `digit` shows; it rolls from 0 on mount and to each new digit. */
function DigitColumn({ digit, x, w, line, base, font, delay }: { digit: number; x: number; w: number; line: number; base: number; font: SkFont; delay: number }) {
  const [still] = React.useState(() => reduceMotionNow());
  const y = useSharedValue(still ? digit : 0);
  React.useEffect(() => {
    y.set(reduceMotionNow() ? digit : withDelay(delay, withTiming(digit, { duration: DRAW_MS, easing: REASE.outExpo })));
    return () => cancelAnimation(y);
  }, [digit, delay, y]);
  const transform = useDerivedValue(() => [{ translateY: -y.value * line }]);
  const clip = React.useMemo(() => rect(x - BLEED, 0, w + 2 * BLEED, line), [x, w, line]);
  return (
    <Group clip={clip}>
      <Group transform={transform}>
        {DIGITS.map((d, k) => (
          <SkText key={d} x={x + (w - font.getTextWidth(d)) / 2} y={base + k * line} text={d} font={font} color="#ffffff" />
        ))}
      </Group>
    </Group>
  );
}

/**
 * `text` (a number such as "34.0") at `size` px in a gradient from `colors[0]` (top left) to `colors[1]` (bottom right),
 * tracked as iOS tracks its large figures; digits roll in after `delay` ms, 40 ms apart.
 */
export function GradientNumber({ text, size, colors, delay = 0 }: { text: string; size: number; colors: readonly [string, string]; delay?: number }) {
  const font = useFont(Inter_800ExtraBold, size);
  const line = Math.round(size * 1.1);
  const tracking = size * iosTracking(size);
  const layout = React.useMemo(() => {
    if (!font) return null;
    const m = font.getMetrics();
    let x = 2;
    const chars = text.split("").map((ch) => {
      const w = font.getTextWidth(ch);
      const at = { ch, x, w };
      x += w + tracking;
      return at;
    });
    return { chars, base: (line - (m.descent - m.ascent)) / 2 - m.ascent, width: Math.ceil(x - tracking + 2) };
  }, [font, text, line, tracking]);
  if (!font || !layout)
    return (
      <Txt size={size} lineHeight={line} style={[type.numberAt(size, 800), { color: colors[0] }]}>
        {text}
      </Txt>
    );
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={text} style={{ width: layout.width, height: line }}>
      <Canvas style={{ width: layout.width, height: line }}>
        <Group layer>
          {layout.chars.map((c, i) =>
            /\d/.test(c.ch) ? (
              // A different length re-keys the columns, so a changed digit count rolls fresh.
              <DigitColumn key={`${text.length}:${i}`} digit={Number(c.ch)} x={c.x} w={c.w} line={line} base={layout.base} font={font} delay={delay + i * 40} />
            ) : (
              <SkText key={`${text.length}:${i}`} x={c.x} y={layout.base} text={c.ch} font={font} color="#ffffff" />
            ),
          )}
          <Rect x={0} y={0} width={layout.width} height={line} blendMode="srcIn">
            <LinearGradient start={vec(0, 0)} end={vec(layout.width, line)} colors={[colors[0], colors[1]]} />
          </Rect>
        </Group>
      </Canvas>
    </View>
  );
}
