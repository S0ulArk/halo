// The kit's card, iOS's: one flat face in the card colour with 20 px corners, no hairline and no shadow, and the quiet
// legend strip that sits under a summary card.
import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { OnCard } from "./calmKit";
import { usePress, usePressStyle } from "./press";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The card's corner radius (iOS's content card). */
export const CARD_RADIUS = 20;

export type CardProps = {
  /** Inner padding (default 16). */
  padding?: number;
  /** The whole card is one tap target: it settles and dims a little while pressed. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Warning ring (a flagged tile): a soft ring in the warning colour, in place of no edge at all. */
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
 * The card: one solid face (`calm.card`), 20 px corners, flat. A pressable card answers with the kit's press (settle
 * and dim, spring back) on the UI thread. Everything inside knows it sits on a card (OnCard), so its quiet fills (pills,
 * secondary buttons, segmented tracks) take the ground's colour.
 */
export function Card({ padding = 16, onPress, accessibilityLabel, ring, radius = CARD_RADIUS, style, children }: CardProps) {
  const c = useCalm();
  // A flagged card keeps a ring; every other card has no edge.
  const flag = ring === "warning" ? alpha(c.tintInk.sand, 0.55) : ring === "foreground" ? alpha(c.ink, 0.5) : null;
  const face: ViewStyle = { borderRadius: radius, backgroundColor: c.card, padding, overflow: "hidden", ...(flag ? { borderWidth: 1.5, borderColor: flag } : null) };
  const press = usePress();
  const pressed = usePressStyle(press, { dim: 0.88 });
  if (!onPress)
    return (
      <View style={[face, style]}>
        <OnCard>{children}</OnCard>
      </View>
    );
  return (
    <AnimatedPressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[face, style, pressed]}>
      <OnCard>{children}</OnCard>
    </AnimatedPressable>
  );
}

/** The quiet legend strip under a summary card: a 12 px rounded band in the ground's grey. */
export function LegendStrip({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const c = useCalm();
  return <View style={[{ marginTop: 4, marginBottom: 12, borderRadius: 12, backgroundColor: c.chip === c.card ? c.ground : c.chip, paddingHorizontal: 12, paddingVertical: 8 }, style]}>{children}</View>;
}
