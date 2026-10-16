// The card surface, one for every card in the app, iOS's: a flat face in the card colour (or a family's soft fill of
// its system colour, `tint`) with 20 px corners, no hairline, no shadow, no gradient. One view per card, so a screen of
// them costs nothing extra to scroll. A pressable card answers with the kit's press (it settles to 97 % and dims a
// little, springing back on release), on the UI thread.
import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { useCalm, type CalmTint } from "@/ui/calm";
import { Txt } from "./Text";
import { usePress, usePressStyle } from "./press";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A content card's corner radius (iOS's 20). */
export const SURFACE_RADIUS = 20;

export type CalmSurfaceProps = {
  tint?: CalmTint;
  /** Kept for API compatibility: iOS cards carry no watermark. */
  watermark?: LucideIcon;
  onPress?: () => void;
  accessibilityLabel?: string;
  padding?: number;
  gap?: number;
  radius?: number;
  /** Kept for API compatibility: iOS cards are flat. */
  elevated?: boolean;
  /** Kept for API compatibility: no card breathes a light any more. */
  breathe?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function CalmSurface({ tint, onPress, accessibilityLabel, padding = 16, gap, radius = SURFACE_RADIUS, style, children }: CalmSurfaceProps) {
  const c = useCalm();
  const face: ViewStyle = { borderRadius: radius, backgroundColor: tint ? c.tint[tint] : c.card, padding, gap, overflow: "hidden" };
  const press = usePress();
  const pressed = usePressStyle(press, { dim: 0.88 });
  if (!onPress) return <View style={[face, style]}>{children}</View>;
  return (
    <AnimatedPressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[face, style, pressed]}>
      {children}
    </AnimatedPressable>
  );
}

/** A card header's action, iOS's: a blue link with a chevron ("Details ›"). `accessibilityLabel` names what it opens. */
export function PillAction({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={10}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 1, minHeight: 32, opacity: pressed ? 0.5 : 1 })}
    >
      <Txt size={15} lineHeight={20} weight={500} numberOfLines={1} style={{ color: c.teal }}>
        {label}
      </Txt>
      <ChevronRight size={17} color={c.teal} strokeWidth={2.4} />
    </Pressable>
  );
}
