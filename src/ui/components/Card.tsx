import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { alpha } from "@/lib/utils";
import { useTheme } from "@/ui/ThemeProvider";
import { useCalm } from "@/ui/calm";
import { OnCard } from "./calmKit";
import { PressGlow, usePress } from "./press";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The card's corner radius (Calm: large, soft corners). */
export const CARD_RADIUS = 32;

export type CardProps = {
  /** Inner padding (default 20). */
  padding?: number;
  /** The whole card is one tap target: its face darkens or lightens (`cardHover`) while pressed. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Warning ring (a flagged tile): `ring-1 ring-warning/50`, in place of the hairline. */
  ring?: "warning" | "foreground" | null;
  radius?: number;
  /** Kept for API compatibility: cards no longer animate in (no entrance or stagger while a screen slides in). */
  animateIn?: boolean;
  /** Kept for API compatibility (the old cascade's position); ignored. */
  index?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * The card: one white solid (`calm.card`) with 32 px corners, a faint hairline and, on light, the soft two-layer lift
 * (CalmSurface's). A pressable card settles a little and veils its face while pressed, both on the
 * UI thread off one shared value. Everything inside knows it sits on a card (OnCard), so its quiet fills (pills,
 * secondary buttons, segmented tracks) take the ground's colour.
 */
export function Card({ padding = 20, onPress, accessibilityLabel, ring, radius = CARD_RADIUS, style, children }: CardProps) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  // A hairline edge keeps every card crisp against the ground; a stronger ring flags one.
  const flag = ring === "warning" ? alpha(c.tintInk.sand, 0.55) : ring === "foreground" ? alpha(c.ink, 0.5) : null;
  const face: ViewStyle = { borderRadius: radius, borderWidth: flag ? 1.5 : 1, borderColor: flag ?? c.edge, backgroundColor: c.card, padding, overflow: "hidden", ...(c.shadow ? { boxShadow: c.shadow } : null) };
  const press = usePress(0.985);
  // The lit top edge (CalmSurface's): light catching the card's rim.
  const rim = <View pointerEvents="none" style={{ position: "absolute", top: 0, left: radius * 0.6, right: radius * 0.6, height: 1, backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.9)" }} />;
  if (!onPress)
    return (
      <View style={[face, style]}>
        {rim}
        <OnCard>{children}</OnCard>
      </View>
    );
  // The press re-renders nothing: the scale and the veil follow one shared value on the UI thread.
  return (
    <AnimatedPressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[face, style, press.animatedStyle]}>
      {rim}
      <OnCard>{children}</OnCard>
      <PressGlow press={press} radius={radius} />
    </AnimatedPressable>
  );
}

/** The quiet legend strip under a summary card (spec §7.2, §7.3, §7.5): a 14 px rounded band in the ground's grey. */
export function LegendStrip({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const c = useCalm();
  return <View style={[{ marginTop: 4, marginBottom: 12, borderRadius: 14, backgroundColor: c.chip === c.card ? c.ground : c.chip, paddingHorizontal: 12, paddingVertical: 8 }, style]}>{children}</View>;
}
