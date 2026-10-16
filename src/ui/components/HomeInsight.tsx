// Today's coach card, the mockup's: a flat card washed with the insight's family colour from its top left (Recovery
// green, Sleep indigo, Strain orange), a solid icon square in that colour with the sparkle in white, the title (16/21
// semibold) over the body (a 14/19 grey sentence). With several insights a second card peeks out underneath, and a
// footer counts them (a dot per card and "2 of 3") beside a round next button; the next one cross-fades in, rising a
// few dp, on the UI thread. Every card sits in the same cell, so nothing below moves on a cycle.
import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Sparkles } from "lucide-react-native";
import { useCalm, type CalmTint } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { REASE } from "@/ui/motion/easing";
import { haptic } from "@/ui/motion/haptics";
import { reduceMotionNow } from "@/ui/motion/system";
import { Card } from "./Card";
import { iconRadius, softFill } from "./calmKit";
import { Txt } from "./Text";

export type HomeInsightItem = { key: string; title: string; body: string };

/** An insight's family colour by what it is about. */
const TINT: Record<string, CalmTint> = { recovery: "mint", sleep: "lavender", strain: "peach" };
const tintOf = (key: string): CalmTint => TINT[key] ?? "lavender";

/** The cross-fade between two insights. */
const SWAP_MS = 280;

type Swap = { from: SharedValue<number>; to: SharedValue<number>; p: SharedValue<number> };

/** One insight's share of the cell while the cards swap: the incoming fades up, the outgoing fades away. */
function useShare(k: number, swap: Swap, rise = 0) {
  return useAnimatedStyle(() => {
    const p = swap.p.value;
    const o = k === swap.to.value ? p : k === swap.from.value ? 1 - p : 0;
    return rise ? { opacity: o, transform: [{ translateY: k === swap.to.value ? (1 - p) * rise : 0 }] } : { opacity: o };
  });
}

/** The card's wash for one insight: its family's soft fill melting into the card, faded by the swap. */
function Wash({ k, tint, swap }: { k: number; tint: CalmTint; swap: Swap }) {
  const c = useCalm();
  const share = useShare(k, swap);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, share]}>
      <LinearGradient colors={[c.tint[tint], c.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** The icon square for one insight, faded by the swap. */
function Square({ k, tint, swap }: { k: number; tint: CalmTint; swap: Swap }) {
  const c = useCalm();
  const share = useShare(k, swap);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: iconRadius(36), backgroundColor: c.tintInk[tint], alignItems: "center", justifyContent: "center" }, share]}>
      <Sparkles size={20} color="#ffffff" strokeWidth={2} />
    </Animated.View>
  );
}

/** One insight's words: in flow when shown (it sizes the cell), stacked out of flow otherwise. */
function Words({ k, item, shown, swap }: { k: number; item: HomeInsightItem; shown: boolean; swap: Swap }) {
  const c = useCalm();
  const share = useShare(k, swap, 6);
  return (
    <Animated.View
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
      pointerEvents={shown ? "auto" : "none"}
      style={[{ gap: 3 }, !shown && { position: "absolute", left: 0, top: 0, right: 0 }, share]}
    >
      <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
        {item.title}
      </Txt>
      <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
        {item.body}
      </Txt>
    </Animated.View>
  );
}

export function HomeInsight({ items }: { items: HomeInsightItem[] }) {
  const c = useCalm();
  const [i, setI] = React.useState(0);
  const n = items.length;
  const at = n ? Math.min(i, n - 1) : 0;
  const swap: Swap = { from: useSharedValue(-1), to: useSharedValue(at), p: useSharedValue(1) };
  const next = () => {
    const k = (at + 1) % n;
    haptic.select();
    swap.from.set(at);
    swap.to.set(k);
    swap.p.set(0);
    swap.p.set(reduceMotionNow() ? 1 : withTiming(1, { duration: SWAP_MS, easing: REASE.outCubic }));
    setI(k);
  };
  if (!n) return null;
  const several = n > 1;
  return (
    <View accessibilityLabel="Insights" style={{ paddingBottom: several ? 8 : 0 }}>
      {several && <View style={{ position: "absolute", left: 18, right: 18, bottom: 0, height: 32, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: softFill(c, "ground"), opacity: 0.7 }} />}
      <Card padding={16}>
        {items.map((it, k) => (
          <Wash key={it.key} k={k} tint={tintOf(it.key)} swap={swap} />
        ))}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ width: 36, height: 36 }}>
            {items.map((it, k) => (
              <Square key={it.key} k={k} tint={tintOf(it.key)} swap={swap} />
            ))}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {items.map((it, k) => (
              <Words key={it.key} k={k} item={it} shown={k === at} swap={swap} />
            ))}
          </View>
        </View>
        {several && (
          <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
            {/* The counter: a dot per card, the shown one wider in the action colour, then "2 of 3". */}
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityLabel={`Insight ${at + 1} of ${n}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {items.map((it, k) => (
                  <View key={it.key} style={{ height: 6, width: k === at ? 16 : 6, borderRadius: 3, backgroundColor: k === at ? c.teal : c.tertiary }} />
                ))}
              </View>
              <Txt size={13} lineHeight={18} weight={600} style={{ color: c.sub }}>
                <Txt size={13} lineHeight={18} style={[font.numeric(700), { color: c.ink }]}>
                  {String(at + 1)}
                </Txt>
                {" of "}
                <Txt size={13} lineHeight={18} style={[font.numeric(700), { color: c.ink }]}>
                  {String(n)}
                </Txt>
              </Txt>
            </View>
            <Pressable
              onPress={next}
              accessibilityRole="button"
              accessibilityLabel={`Next insight (${at + 1} of ${n})`}
              hitSlop={6}
              style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: c.fill, opacity: pressed ? 0.55 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] })}
            >
              <ChevronRight size={18} color={c.ink} strokeWidth={2.4} />
            </Pressable>
          </View>
        )}
      </Card>
    </View>
  );
}
