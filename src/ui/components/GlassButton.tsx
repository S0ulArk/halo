// The round floating buttons of iOS 26's bars: 38 px, their face the Liquid Glass material (GlassMaterial, src/ui/
// glass.tsx: live when the bar is a GlassTarget's overlay, its stand-in elsewhere), the glyph in ink (the back chevron
// in blue). Headers, the info trigger, the avatar and the sheets' close all use them. A press settles and dims the
// button on the UI thread.
import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { ChevronLeft, X } from "lucide-react-native";
import { useCalm } from "@/ui/calm";
import { GlassMaterial } from "@/ui/glass";
import { usePress, usePressStyle } from "./press";

/** A round bar button's size. */
export const BAR_BUTTON = 38;

/** A glass bar button around a glyph; `wide` lets it grow into a capsule around a label. */
export function GlassButton({ onPress, accessibilityLabel, children, disabled, wide = false, style }: { onPress?: () => void; accessibilityLabel: string; children: React.ReactNode; disabled?: boolean; wide?: boolean; style?: StyleProp<ViewStyle> }) {
  const press = usePress(0.92);
  const pressed = usePressStyle(press, { rest: disabled ? 0.4 : 1, dim: 0.7 });
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} disabled={disabled || !onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={6}>
      <Animated.View
        style={[
          { height: BAR_BUTTON, minWidth: BAR_BUTTON, borderRadius: BAR_BUTTON / 2, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: wide ? 14 : 0 },
          style,
          pressed,
        ]}
      >
        <GlassMaterial />
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** A glass capsule that only shows something (the streak): a bar button's face, not a button. */
export function GlassCapsule({ children, accessibilityLabel, style }: { children: React.ReactNode; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      style={[
        { height: BAR_BUTTON, borderRadius: BAR_BUTTON / 2, alignItems: "center", flexDirection: "row", gap: 6, paddingHorizontal: 14 },
        style,
      ]}
    >
      <GlassMaterial />
      {children}
    </View>
  );
}

/** Back (a blue chevron) or close (an X) as a glass bar button. */
export function BackButton({ onPress, dismiss = "back" }: { onPress?: () => void; dismiss?: "back" | "close" }) {
  const c = useCalm();
  return (
    <GlassButton onPress={onPress} accessibilityLabel={dismiss === "close" ? "Close" : "Back"}>
      {dismiss === "close" ? <X size={20} color={c.ink} strokeWidth={2.2} /> : <ChevronLeft size={24} color={c.teal} strokeWidth={2.4} style={{ marginLeft: -2 }} />}
    </GlassButton>
  );
}
