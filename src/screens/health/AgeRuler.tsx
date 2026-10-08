// Pulse Age against your real age, on a ruler of years: a teal dot for the age you are, the Pulse Age marker in the
// card's ink, and the stretch between them filled (rose-ish sand when older, mint when younger). When the value
// arrives the fill grows from your age to the Pulse Age and the marker settles there; then the marker breathes slowly.
// Everything moves on the UI thread and stops while the screen is out of view.
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useIsFocused } from "expo-router";
import { formatValue } from "@/lib/format";
import { Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { reduceMotionNow } from "@/ui/motion/system";

const TRACK = 10;
const DOT = 14;
const MARK = 22;

/** The ruler's span: whole fives around both ages, with a few years of air either side. */
function span(a: number, b: number): [number, number] {
  const lo = Math.floor((Math.min(a, b) - 4) / 5) * 5;
  const hi = Math.ceil((Math.max(a, b) + 4) / 5) * 5;
  return [lo, Math.max(hi, lo + 10)];
}

export function AgeRuler({ age, pulseAge, ink }: { age: number; pulseAge: number; ink: string }) {
  const c = useCalm();
  const focused = useIsFocused();
  const [w, setW] = React.useState(0);
  const [lo, hi] = span(age, pulseAge);
  const x = (v: number) => ((v - lo) / (hi - lo)) * w;
  const grow = useSharedValue(reduceMotionNow() ? 1 : 0);
  const breathe = useSharedValue(0);

  React.useEffect(() => {
    if (reduceMotionNow()) return;
    grow.value = 0;
    grow.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [age, pulseAge, grow]);
  React.useEffect(() => {
    if (!focused || reduceMotionNow()) {
      cancelAnimation(breathe);
      return;
    }
    breathe.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [focused, breathe]);

  const from = x(age);
  const to = x(pulseAge);
  const fill = useAnimatedStyle(() => {
    const end = from + (to - from) * grow.value;
    return { left: Math.min(from, end), width: Math.abs(end - from) };
  });
  const marker = useAnimatedStyle(() => ({ transform: [{ translateX: from + (to - from) * grow.value - MARK / 2 }, { scale: 1 + 0.12 * breathe.value }] }));
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))} style={{ gap: 8 }}>
      {w > 0 && (
        <>
          {/* The two ages named above their marks. */}
          <View style={{ height: 34 }}>
            <View style={{ position: "absolute", left: Math.min(Math.max(from - 40, 0), w - 80), width: 80, alignItems: "center" }}>
              <Txt size={11} lineHeight={14} weight={700} style={{ color: c.faint, letterSpacing: 1 }}>
                YOU
              </Txt>
              <Txt size={15} lineHeight={18} style={[font.numeric(700), { color: c.teal }]}>
                {formatValue("decimal1", age)}
              </Txt>
            </View>
            <View style={{ position: "absolute", left: Math.min(Math.max(to - 40, 0), w - 80), width: 80, alignItems: "center", opacity: Math.abs(to - from) < 44 ? 0 : 1 }}>
              <Txt size={11} lineHeight={14} weight={700} style={{ color: c.faint, letterSpacing: 1 }}>
                HALO
              </Txt>
              <Txt size={15} lineHeight={18} style={[font.numeric(700), { color: ink }]}>
                {formatValue("decimal1", pulseAge)}
              </Txt>
            </View>
          </View>
          <View style={{ height: MARK, justifyContent: "center" }}>
            <View style={{ height: TRACK, borderRadius: TRACK / 2, backgroundColor: c.chip }} />
            <Animated.View style={[{ position: "absolute", height: TRACK, borderRadius: TRACK / 2, backgroundColor: ink, opacity: 0.45 }, fill]} />
            <View style={{ position: "absolute", left: from - DOT / 2, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: c.teal, borderWidth: 2, borderColor: c.chip }} />
            <Animated.View style={[{ position: "absolute", left: 0, width: MARK, height: MARK, borderRadius: MARK / 2, backgroundColor: ink, borderWidth: 3, borderColor: c.chip }, marker]} />
          </View>
          {/* A year per tick, labelled every five. */}
          <View style={{ height: 22 }}>
            {ticks.map((t) => (
              <View key={t} style={{ position: "absolute", left: x(t) - 0.5, top: 0, width: 1, height: t % 5 === 0 ? 8 : 4, backgroundColor: c.faint, opacity: t % 5 === 0 ? 0.8 : 0.4 }} />
            ))}
            {ticks
              .filter((t) => t % 5 === 0)
              .map((t) => (
                <Txt key={`l${t}`} size={11} lineHeight={14} style={[font.numeric(600), { position: "absolute", top: 9, left: Math.min(Math.max(x(t) - 12, 0), w - 24), width: 24, textAlign: "center", color: c.faint }]}>
                  {String(t)}
                </Txt>
              ))}
          </View>
        </>
      )}
    </View>
  );
}

/** The collapsed header's Pulse Age: a small pill with the age in the card's ink. */
export function AgeBadge({ age, ink, bg }: { age: number | null; ink: string; bg: string }) {
  return (
    <View style={{ minWidth: 56, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Txt size={16} lineHeight={20} style={[font.numeric(700), { color: ink }]}>
        {age === null ? "—" : formatValue("decimal1", age)}
      </Txt>
    </View>
  );
}
