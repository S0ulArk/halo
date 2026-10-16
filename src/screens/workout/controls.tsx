// The session controls Live workout and Breathe float over their page, as Apple's Workout app sets its own: large round
// buttons of Liquid Glass tinted in their action's colour (green to start, red to end), the glyph in that colour and its
// word under it, in a row at the foot of the screen. They sit in a GlassTarget's overlay, so the glass bends the page
// scrolling under it. A press settles the button to 92 % and dims it on the UI thread, springing back on release, and a
// tap confirms with a light haptic; a disabled button dims and ignores the finger.
import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import { Txt } from "@/ui";
import { usePress, usePressStyle } from "@/ui/components/press";
import { LiquidGlass } from "@/ui/glass";
import { haptic } from "@/ui/motion/haptics";
import { useTheme } from "@/ui/ThemeProvider";

/** A round control's diameter, and the room the row of them needs at the foot of a page (button, word, air). */
export const ROUND = 76;
export const CONTROLS_CLEARANCE = ROUND + 64;

/** One large round glass button: the glass tinted in `color`, the glyph in it, the word under it. */
export function GlassRound({ icon: Icon, label, color, onPress, disabled = false, accessibilityLabel }: { icon: LucideIcon; label: string; color: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const dark = useTheme().scheme === "dark";
  const press = usePress(0.92);
  const pressed = usePressStyle(press, { rest: disabled ? 0.4 : 1, dim: 0.8 });
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Pressable
        onPress={() => {
          haptic.confirm();
          onPress();
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        hitSlop={8}
      >
        <Animated.View style={[{ width: ROUND, height: ROUND, borderRadius: ROUND / 2, alignItems: "center", justifyContent: "center" }, pressed]}>
          <LiquidGlass style={StyleSheet.absoluteFill} cornerRadius={ROUND / 2} tint={color} frost={dark ? 0.3 : 0.22} shadow={dark ? "0 8px 24px rgba(0,0,0,0.5)" : `0 8px 22px ${color}40`} />
          <Icon size={30} color={color} strokeWidth={2.4} />
        </Animated.View>
      </Pressable>
      <Txt size={13} lineHeight={17} weight={600} style={{ color, opacity: disabled ? 0.5 : 1 }}>
        {label}
      </Txt>
    </View>
  );
}

/** The row of round controls, floating at the foot of the screen above the system's navigation area. */
export function FloatingControls({ children }: { children: React.ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: bottom + 14, flexDirection: "row", justifyContent: "center", gap: 40 }}>
      {children}
    </View>
  );
}
