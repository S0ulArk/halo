// The kit's text: `Txt` and its type roles, iOS's type scale set in Inter (src/ui/fonts.ts). Every size is tracked as
// iOS tracks San Francisco (tighter as it grows) unless a role or caller sets its own tracking.
import * as React from "react";
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { font, iosTracking, type NumericWeight, type SansWeight } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import type { ColorToken } from "@/ui/theme";
import { em } from "@/lib/utils";

/**
 * The type roles of the kit, iOS's scale (large title 34/41, title2 22/28, headline 17/22, body 16/22, subhead 15/20,
 * footnote 13/18, caption 12/16), so screens never hand-roll typography. Sizes are px; tracking is in em (absent: iOS's
 * tracking for the size). `numeric` roles are Inter with tabular figures.
 */
export const ROLES = {
  /** 34/41 bold: a page's large title. */
  largeTitle: { size: 34, line: 41, family: "sans", weight: 700, color: "foreground" },
  /** 22/28 bold: a section's title over its cards ("Pinned"). */
  title2: { size: 22, line: 28, family: "sans", weight: 700, color: "foreground" },
  /** 17/22 semibold: a card's or a sheet's title. */
  headline: { size: 17, line: 22, family: "sans", weight: 600, color: "foreground" },
  /** 15/20: secondary lines under a title. */
  subhead: { size: 15, line: 20, family: "sans", weight: 400, color: "foregroundSecondary" },
  /** 13/18: notes under a list or a chart. */
  footnote: { size: 13, line: 18, family: "sans", weight: 400, color: "foregroundSecondary" },
  /** 15/20 semibold: card titles, row labels, dial labels. */
  label: { size: 15, line: 20, family: "sans", weight: 600, color: "foreground" },
  /** 13/18, secondary: captions under labels and charts (iOS's footnote). */
  caption: { size: 13, line: 18, family: "sans", weight: 400, color: "mutedForeground" },
  /** 16/22: body copy. */
  body: { size: 16, line: 22, family: "sans", weight: 400, color: "foreground" },
  bodySecondary: { size: 16, line: 22, family: "sans", weight: 400, color: "foregroundSecondary" },
  /** 16/21 medium: impact row names, popover titles. */
  bodyMedium: { size: 16, line: 21, family: "sans", weight: 500, color: "foreground" },
  /** 15/20: notes and subtitles (iOS's subhead). */
  small: { size: 15, line: 20, family: "sans", weight: 400, color: "mutedForeground" },
  /** 22/28 bold: section titles ("My Day"), iOS's title2. */
  sectionTitle: { size: 22, line: 28, family: "sans", weight: 700, color: "foreground" },
  /** 17/22 semibold: insight and coach card titles (iOS's headline). */
  insightTitle: { size: 17, line: 22, family: "sans", weight: 600, color: "foreground" },
  /** 17/22 semibold: navigation bar titles. */
  headerTitle: { size: 17, line: 22, family: "sans", weight: 600, color: "foreground" },
  /** 13/18 semibold, secondary: tile labels. */
  tileLabel: { size: 13, line: 18, family: "sans", weight: 600, color: "foregroundSecondary" },
  /** 12/16 semibold: tags, the date pill, ring-row labels (iOS's caption). */
  tag: { size: 12, line: 16, family: "sans", weight: 600, color: "foregroundSecondary" },
  /** 15/20 semibold secondary: the unit after a value. */
  unit: { size: 15, line: 20, family: "sans", weight: 600, color: "foregroundSecondary" },
  /** 17/22 semibold: timeline row names, sheet titles. */
  rowTitle: { size: 17, line: 22, family: "sans", weight: 600, color: "foreground" },
  /** 17/22 semibold: buttons; segmented controls set their own 13. */
  button: { size: 17, line: 22, family: "sans", weight: 600, color: "foreground" },
  // Numeric roles
  /** 20/24 bold: row values. */
  value: { size: 20, line: 24, family: "numeric", weight: 700, color: "foreground" },
  /** 28/34 bold: chart headline. */
  valueLg: { size: 28, line: 34, family: "numeric", weight: 700, color: "foreground" },
  /** 30/34 bold: tile values. */
  valueXl: { size: 30, line: 34, family: "numeric", weight: 700, color: "foreground" },
  /** 34/41 bold: the sleep hours hero. */
  valueHero: { size: 34, line: 41, family: "numeric", weight: 700, color: "foreground" },
  /** 18/22 semibold: wide-tile average, zone durations. */
  valueMd: { size: 18, line: 22, family: "numeric", weight: 600, color: "foreground" },
  /** 15/20 semibold: stage shares, stacked counts. */
  valueSm: { size: 15, line: 20, family: "numeric", weight: 600, color: "foreground" },
  /** 16/20 semibold: driver points. */
  valueBase: { size: 16, line: 20, family: "numeric", weight: 600, color: "foreground" },
  /** 13/18 medium secondary: the average under a value. */
  numericCaption: { size: 13, line: 18, family: "numeric", weight: 500, color: "mutedForeground" },
  /** 12/16 medium secondary numeric: axis end labels. */
  numericSmall: { size: 12, line: 16, family: "numeric", weight: 500, color: "mutedForeground" },
} as const satisfies Record<
  string,
  { size: number; line: number; family: "sans" | "numeric"; weight: number; tracking?: number; upper?: boolean; color: ColorToken }
>;
export type TextRole = keyof typeof ROLES;

export type TxtProps = Omit<TextProps, "style" | "role"> & {
  role?: TextRole;
  /** A token name, or any colour string. */
  color?: ColorToken | (string & {});
  /** Overrides the role's weight (sans 400-800, numeric 500-800). */
  weight?: SansWeight | NumericWeight;
  size?: number;
  lineHeight?: number;
  /** Tracking in em; iOS's for the size when absent. */
  tracking?: number;
  uppercase?: boolean;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
};

/** Resolves a role (with overrides) to a TextStyle, for places that need the style object itself (nested Text, SVG). */
export function useTextStyle(p: Pick<TxtProps, "role" | "color" | "weight" | "size" | "lineHeight" | "tracking" | "uppercase" | "align">): TextStyle {
  const { c } = useTheme();
  const r = ROLES[p.role ?? "body"];
  // Android throws on a non-positive fontSize (with letterSpacing it crashes the whole tree), so never pass one.
  const asked = p.size ?? r.size;
  const size = asked > 0 ? asked : 1;
  if (__DEV__ && !(asked > 0)) console.warn("[Txt] non-positive size", asked, p.role);
  const line = p.lineHeight ?? (p.size ? Math.round(p.size * (r.line / r.size)) : r.line);
  const tracking = p.tracking ?? iosTracking(size);
  const color = p.color ? ((c as Record<string, string>)[p.color] ?? p.color) : c[r.color];
  const face = r.family === "numeric" ? font.numeric((p.weight as NumericWeight | undefined) ?? (r.weight as NumericWeight)) : font.sans((p.weight as SansWeight | undefined) ?? (r.weight as SansWeight));
  return {
    ...face,
    fontSize: size,
    lineHeight: line,
    letterSpacing: tracking ? em(size, tracking) : 0,
    textTransform: (p.uppercase ?? ("upper" in r && r.upper)) ? "uppercase" : "none",
    color,
    textAlign: p.align,
    includeFontPadding: false,
  };
}

/** The kit's text. `role` picks the type style; everything else is an override. */
export function Txt({ role, color, weight, size, lineHeight, tracking, uppercase, align, style, children, ...rest }: TxtProps) {
  const s = useTextStyle({ role, color, weight, size, lineHeight, tracking, uppercase, align });
  // Android measures `textTransform: "uppercase"` text before transforming it, so wide caps with letter spacing get
  // clipped ("SAVE DASHBOARD" → "SAVE"). Upper-case the strings ourselves and let the platform measure the real text.
  const upper = StyleSheet.flatten([s, style])?.textTransform === "uppercase";
  return (
    <Text allowFontScaling={false} {...rest} style={upper ? [s, style, NO_TRANSFORM] : [s, style]}>
      {upper ? upperStrings(children) : children}
    </Text>
  );
}

const NO_TRANSFORM = { textTransform: "none" } as const;

/** Upper-cases string and number children; nested elements (e.g. a nested <Txt>) keep their own styling. */
function upperStrings(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (c) => (typeof c === "string" ? c.toUpperCase() : typeof c === "number" ? String(c) : c));
}
