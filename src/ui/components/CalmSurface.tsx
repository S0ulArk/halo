// The card surface, one for every card in the app. What makes a card read as crafted rather than a flat box:
//  - soft depth: a faint hairline and, in the light scheme, a two-layer shadow (a tight contact shadow under a wide soft
//    one), so it lifts off the ground; the dark scheme has the hairline alone, where shadows don't read;
//  - a tinted card is a gentle diagonal gradient of its pastel (deeper at the top left, paler at the bottom right),
//    not a flat fill, with a large faint watermark icon in its corner;
//  - a lit top edge: a thin highlight along the top, as light catching a rim;
//  - a hero (`breathe`) has a slow breathing light across it (Halo.tsx's HeroSheen, one opacity on the UI thread);
//  - a press answers in the same frame: the card settles a little and veils its face, on the UI thread.
// One gradient and one icon per card, shadows drawn once and cached by the platform: cheap enough for every card on a
// screen; rows inside a card never get this.
import * as React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { useCalm, type CalmTint } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { Txt } from "./Text";
import { HeroSheen } from "./Halo";
import { PressGlow, usePress } from "./press";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const SURFACE_RADIUS = 32;

export type CalmSurfaceProps = {
  tint?: CalmTint;
  /** A large faint icon in the bottom-right corner (tinted cards). */
  watermark?: LucideIcon;
  onPress?: () => void;
  accessibilityLabel?: string;
  padding?: number;
  gap?: number;
  radius?: number;
  /** Lift the card with the soft shadow (default true). Off for cards nested in cards. */
  elevated?: boolean;
  /** A hero: a slow breathing light across the card. */
  breathe?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function CalmSurface({ tint, watermark: Watermark, onPress, accessibilityLabel, padding = 20, gap, radius = SURFACE_RADIUS, elevated = true, breathe = false, style, children }: CalmSurfaceProps) {
  const c = useCalm();
  const { scheme } = useTheme();
  const dark = scheme === "dark";
  const base = tint ? c.tint[tint] : c.card;
  // The family's gradient: its fresh pastel at the top left, paling (light) or deepening (dark) to the bottom right.
  const [from, to] = tint ? c.tintGrad[tint] : [base, base];
  const outer: ViewStyle = {
    borderRadius: radius,
    backgroundColor: base,
    borderWidth: 1,
    borderColor: tint ? c.tintEdge[tint] : c.edge,
    // A tinted card floats in its own coloured glow (both schemes); a white card keeps the neutral lift.
    ...(elevated && tint ? { boxShadow: `0 2px 4px ${c.glow[tint]}${dark ? "26" : "22"}, 0 16px 32px ${c.glow[tint]}${dark ? "38" : "45"}` } : elevated && c.shadow ? { boxShadow: c.shadow } : null),
  };
  const press = usePress(0.985);
  const content = (
    <>
      {tint && <LinearGradient pointerEvents="none" colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />}
      {breathe && <HeroSheen radius={radius} color={dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.6)"} />}
      {Watermark && tint && (
        <View pointerEvents="none" style={{ position: "absolute", right: -18, bottom: -18, opacity: dark ? 0.09 : 0.07, transform: [{ rotate: "-12deg" }] }}>
          <Watermark size={132} color={c.tintInk[tint]} strokeWidth={1} />
        </View>
      )}
      {/* The lit top edge. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: radius * 0.6, right: radius * 0.6, height: 1, backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.9)" }} />
      <View style={{ padding, gap }}>{children}</View>
    </>
  );
  if (!onPress)
    return (
      <View style={[outer, { overflow: "hidden" }, style]}>
        {content}
      </View>
    );
  // The press: the scale and the highlight run on the UI thread off one shared value; a press re-renders nothing.
  return (
    <AnimatedPressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[outer, { overflow: "hidden" }, style, press.animatedStyle]}>
      {content}
      <PressGlow press={press} radius={radius} />
    </AnimatedPressable>
  );
}

/** The header pill action: "Details ›" on a chip, instead of a bare chevron. `accessibilityLabel` names what it opens when the label alone doesn't ("Sleep details"). */
export function PillAction({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, height: 32, paddingLeft: 12, paddingRight: 8, borderRadius: 16, backgroundColor: c.chip, borderWidth: 1, borderColor: c.hairline, opacity: pressed ? 0.8 : 1 })}
    >
      <Txt size={13} lineHeight={16} weight={600} numberOfLines={1} style={{ color: c.teal }}>
        {label}
      </Txt>
      <ChevronRight size={16} color={c.teal} strokeWidth={2.25} />
    </Pressable>
  );
}
