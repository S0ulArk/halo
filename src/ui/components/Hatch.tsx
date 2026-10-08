import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useCalm } from "@/ui/calm";

/**
 * The track under zone rows and stage rows: a Calm capsule in the hairline grey (`calm.line`; it was a hatched SVG
 * pattern, the name stays so callers need no change). Give it a height; the corners default to half of it. Children
 * (fills, markers) lay over it and are clipped to it.
 */
export function Hatch({ height, radius = height / 2, style, children }: { height: number; radius?: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const c = useCalm();
  return <View style={[{ height, borderRadius: radius, overflow: "hidden", backgroundColor: c.line }, style]}>{children}</View>;
}
