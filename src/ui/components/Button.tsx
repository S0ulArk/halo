import * as React from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { useSoftFill } from "./calmKit";
import { Txt } from "./Text";
import { usePress } from "./press";

export type ButtonVariant = "default" | "secondary" | "ghost" | "outline-pill" | "destructive";
/** The touch sizes: `touch` 48 px text button, `icon-touch` 44 px round icon button, `sheet` 56 px footer button, `sm` 32 px pill. */
export type ButtonSize = "touch" | "icon-touch" | "sheet" | "sm";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * The Calm button. `default` (primary): the deep teal fill with white text. `secondary` and `outline-pill`: a quiet
 * fill (white on the ground, the ground's grey on a card) with ink text. `ghost`: transparent. `destructive`: the rose
 * pastel with rose ink. 22 px corners, sentence case, no outline, no shadow. Presses scale to 0.96 over 150 ms (UI
 * thread).
 */
export function Button({ variant = "default", size = "touch", onPress, disabled, accessibilityLabel, style, children }: ButtonProps) {
  const c = useCalm();
  const { scheme } = useTheme();
  const quiet = useSoftFill();
  const { animatedStyle, onPressIn, onPressOut } = usePress();
  const face: ViewStyle =
    variant === "default"
      ? { backgroundColor: c.teal }
      : variant === "secondary" || variant === "outline-pill"
        ? { backgroundColor: quiet, borderWidth: 1, borderColor: c.hairline }
        : variant === "destructive"
          ? { backgroundColor: c.tint.rose }
          : { backgroundColor: "transparent" };
  // White on the deep teal; the dark scheme's teal is light, so its label is the deep ground.
  const color = variant === "default" ? (scheme === "dark" ? c.ground : "#ffffff") : variant === "destructive" ? c.tintInk.rose : c.ink;
  const box: ViewStyle =
    size === "icon-touch"
      ? { width: 44, height: 44, borderRadius: 22 }
      : size === "sheet"
        ? { minHeight: 56, borderRadius: 22, paddingHorizontal: 24, paddingVertical: 8, alignSelf: "stretch" }
        : size === "sm"
          ? { minHeight: 32, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 }
          : { minHeight: 48, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 6 };
  const text = typeof children === "string" || typeof children === "number";
  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }} hitSlop={size === "sm" ? 8 : 0}>
      <Animated.View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: disabled ? 0.45 : 1 }, face, box, animatedStyle, style]}>
        {text ? (
          <Txt size={size === "sm" ? 14 : 16} lineHeight={size === "sm" ? 18 : 20} weight={600} color={color} align="center">
            {children}
          </Txt>
        ) : (
          children
        )}
      </Animated.View>
    </Pressable>
  );
}
