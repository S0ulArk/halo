// The kit's button, in iOS's button styles: filled (a blue capsule with white text), tinted (blue at 15 % with blue
// text), gray (a quiet fill with blue text), plain (text alone), and destructive (red at 15 % with red text). Sentence
// case, capsule corners, no outline, no shadow; a press settles and dims on the UI thread (press.tsx).
import * as React from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { useSoftFill } from "./calmKit";
import { Txt } from "./Text";
import { usePress, usePressStyle } from "./press";

export type ButtonVariant = "default" | "secondary" | "ghost" | "outline-pill" | "destructive";
/** The touch sizes: `touch` 48 px text button, `icon-touch` 44 px round icon button, `sheet` 50 px footer button, `sm` 32 px pill. */
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
 * The button. `default`: filled, the blue capsule with white text. `secondary`: tinted, blue at 15 % with blue text.
 * `outline-pill`: gray, the quiet fill of the surface it sits on with blue text. `ghost`: plain, no fill. `destructive`:
 * red at 15 % with red text. A press settles to 97 % and dims, springing back on release (UI thread).
 */
export function Button({ variant = "default", size = "touch", onPress, disabled, accessibilityLabel, style, children }: ButtonProps) {
  const c = useCalm();
  const quiet = useSoftFill();
  const press = usePress();
  const pressed = usePressStyle(press, { rest: disabled ? 0.4 : 1, dim: variant === "default" ? 0.8 : 0.6 });
  const red = c.system.red;
  const face: ViewStyle =
    variant === "default"
      ? { backgroundColor: c.teal }
      : variant === "secondary"
        ? { backgroundColor: alpha(c.teal, 0.15) }
        : variant === "outline-pill"
          ? { backgroundColor: quiet }
          : variant === "destructive"
            ? { backgroundColor: alpha(red, 0.15) }
            : { backgroundColor: "transparent" };
  const color = variant === "default" ? "#ffffff" : variant === "destructive" ? red : variant === "ghost" ? c.ink : c.teal;
  const box: ViewStyle =
    size === "icon-touch"
      ? { width: 44, height: 44, borderRadius: 22 }
      : size === "sheet"
        ? { minHeight: 50, borderRadius: 25, paddingHorizontal: 24, paddingVertical: 8, alignSelf: "stretch" }
        : size === "sm"
          ? { minHeight: 32, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 }
          : { minHeight: 48, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 6 };
  const text = typeof children === "string" || typeof children === "number";
  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }} hitSlop={size === "sm" ? 8 : 0}>
      <Animated.View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, face, box, style, pressed]}>
        {text ? (
          <Txt size={size === "sm" ? 15 : 17} lineHeight={size === "sm" ? 20 : 22} weight={600} color={color} align="center">
            {children}
          </Txt>
        ) : (
          children
        )}
      </Animated.View>
    </Pressable>
  );
}
