// Halo Age against your real age on one scale of years, as the design draws it: a thin capsule that runs green (younger)
// through yellow to red (older), every fifth year labelled under it, your age a small ringed dot and the Halo Age a
// larger white knob ringed in its colour, a dotted line over the track between the two, and a legend naming both. When
// the value arrives the knob springs from your age to the Halo Age (the gap it measures, drawn as motion) and the dotted
// line fades in behind it. All on the UI thread; Reduce motion places everything at once.
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, { cancelAnimation, interpolate, Extrapolation, useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { formatValue } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { iosSpring } from "@/ui/motion/springs";
import { entranceStill } from "@/ui/motion/system";
import { ageSpan } from "./format";

const TRACK = 8;
const KNOB = 20;
const DOT = 12;
/** The lane over the markers that holds the dotted gap line, and the marker row the track runs through. */
const LANE = 6;
const ROW = 24;
/** The knob's travel: a soft spring with the faintest settle (0.65 s, 0.8). */
const KNOB_SPRING = iosSpring(0.65, 0.8);

/**
 * The scale: `age` (your real age) and `pulseAge` (the Halo Age) in years; `color` rings the Halo Age's knob. `spoken`
 * false when a button around it already says both ages.
 */
export function AgeRuler({ age, pulseAge, color, spoken = true }: { age: number; pulseAge: number; color: string; spoken?: boolean }) {
  const c = useCalm();
  const [w, setW] = React.useState(0);
  const [lo, hi] = ageSpan(age, pulseAge);
  const x = (v: number) => ((v - lo) / (hi - lo)) * w;
  const from = x(age);
  const to = x(pulseAge);
  // 0: the knob on your age; 1: on the Halo Age.
  const p = useSharedValue(entranceStill() ? 1 : 0);
  const laid = w > 0;
  React.useEffect(() => {
    if (!laid) return;
    if (entranceStill()) {
      p.set(1);
      return;
    }
    p.set(0);
    p.set(withDelay(260, withSpring(1, KNOB_SPRING)));
    return () => cancelAnimation(p);
  }, [laid, age, pulseAge, p]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: from + (to - from) * p.value - KNOB / 2 }] }), [from, to]);
  const gap = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0.55, 1], [0, 1], Extrapolation.CLAMP) }));
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 5) ticks.push(t);
  const left = Math.min(from, to);
  const span = Math.abs(to - from);
  const dots = Math.max(0, Math.floor(span / 5));

  return (
    <View
      accessible={spoken}
      importantForAccessibility={spoken ? "auto" : "no-hide-descendants"}
      accessibilityLabel={`Halo Age ${formatValue("decimal1", pulseAge)} on a scale of ${lo} to ${hi} years, your age ${formatValue("decimal1", age)}`}
      style={{ gap: 8 }}
    >
      <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height: LANE + ROW + 20 }}>
        {laid && (
          <>
            {/* The gap between the two ages: a dotted line just over the markers, from one centre to the other. */}
            <Animated.View pointerEvents="none" style={[{ position: "absolute", top: LANE - 4, left, width: span, height: 2, flexDirection: "row", justifyContent: "space-between" }, gap]}>
              {Array.from({ length: dots }, (_, i) => (
                <View key={i} style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: alpha(c.ink, 0.25) }} />
              ))}
            </Animated.View>
            <LinearGradient
              colors={[c.system.green, c.system.yellow, c.system.red]}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ position: "absolute", left: 0, right: 0, top: LANE + (ROW - TRACK) / 2, height: TRACK, borderRadius: TRACK / 2, opacity: 0.9 }}
            />
            {/* Your age: a small dot in the card colour ringed in grey. */}
            <View style={{ position: "absolute", left: from - DOT / 2, top: LANE + (ROW - DOT) / 2, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: c.card, borderWidth: 2.5, borderColor: c.sub }} />
            {/* The Halo Age: a white knob ringed in its colour, springing from your age to its own. */}
            <Animated.View
              style={[
                { position: "absolute", left: 0, top: LANE + (ROW - KNOB) / 2, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: "#ffffff", borderWidth: 3.5, borderColor: color, boxShadow: "0 1px 3px rgba(0,0,0,0.18)" },
                knob,
              ]}
            />
            {ticks.map((t) => (
              <Txt key={t} size={11} lineHeight={14} align="center" style={{ position: "absolute", top: LANE + ROW + 4, left: x(t) - 16, width: 32, color: c.sub, fontVariant: ["tabular-nums"] }}>
                {String(t)}
              </Txt>
            ))}
          </>
        )}
      </View>
      <View importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: color }} />
          <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
            Halo Age
          </Txt>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5, borderColor: c.sub }} />
          <Txt size={13} lineHeight={18} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
            {`Your age, ${formatValue("decimal1", age)}`}
          </Txt>
        </View>
      </View>
    </View>
  );
}
