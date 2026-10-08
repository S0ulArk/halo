import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { cubicBezier, CSSKeyframesRule } from "react-native-reanimated";

// "Pulse 2: calm data": nothing animates on mount. Entrances and cascades ran while a screen slid in, and each one is
// a layer the GPU composites on frames the transition needs, so the helpers below keep their API and render their
// children at once. Motion that answers a change (a value, a tab, a press) lives in the other motion helpers.

/** True under an element that is already making its entrance (kept for API compatibility; nothing enters now). */
const InEntrance = React.createContext(false);

/** Marks its subtree as part of an entrance in progress. Kept for API compatibility. */
export function EntranceScope({ children }: { children: React.ReactNode }) {
  return <InEntrance.Provider value>{children}</InEntrance.Provider>;
}

export type EntranceOptions = {
  /** Position in a cascade (0 first). Ignored: nothing cascades. */
  index?: number;
  /** Explicit delay in ms. Ignored. */
  delay?: number;
  disabled?: boolean;
};

/** A Reanimated CSS animation style (the shape the old entrance returned). */
export type EntranceStyle = {
  animationName: CSSKeyframesRule;
  animationDuration: number;
  animationDelay: number;
  animationTimingFunction: ReturnType<typeof cubicBezier>;
  animationFillMode: "backwards";
};

/** The entrance style for a mounting element: always null now, so it shows at once on its first frame. */
export function useEntrance(_options: EntranceOptions = {}): EntranceStyle | null {
  return null;
}

export type FadeInProps = EntranceOptions & { style?: StyleProp<ViewStyle>; children?: React.ReactNode };

/** A plain View around its block (it used to fade the block in); the block shows at once. */
export function FadeIn({ style, children }: FadeInProps) {
  return <View style={style}>{children}</View>;
}

/** Each child in its own View with `style`, as the old cascade laid them out, all shown at once. */
export function Stagger({ style, children }: { start?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <>
      {React.Children.toArray(children).map((child, i) => (
        <View key={React.isValidElement(child) && child.key !== null ? child.key : i} style={style}>
          {child}
        </View>
      ))}
    </>
  );
}
