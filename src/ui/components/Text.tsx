import * as React from "react";
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { font, type NumericWeight, type SansWeight } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import type { ColorToken } from "@/ui/theme";
import { em } from "@/lib/utils";

/**
 * The type roles of the kit (spec §3.4), so screens never hand-roll typography. Sizes are px; tracking is in em.
 * `numeric` roles use Barlow with tabular figures.
 */
export const ROLES = {
  /** 14/18 semibold, sentence case: card titles, row labels, dial labels. (WHOOP-style bold caps retired: they shouted.) */
  label: { size: 14, line: 18, family: "sans", weight: 600, color: "foreground" },
  /** 13/18 medium, muted: captions under labels and charts. */
  caption: { size: 13, line: 18, family: "sans", weight: 500, color: "mutedForeground" },
  /** 16/24: body copy (room to breathe between lines). */
  body: { size: 16, line: 24, family: "sans", weight: 400, color: "foreground" },
  bodySecondary: { size: 16, line: 24, family: "sans", weight: 400, color: "foregroundSecondary" },
  /** 16/22 medium: impact row names, popover titles. */
  bodyMedium: { size: 16, line: 22, family: "sans", weight: 500, color: "foreground" },
  /** 14/20: notes and subtitles. */
  small: { size: 14, line: 20, family: "sans", weight: 400, color: "mutedForeground" },
  /** 24/30 bold, −0.01 em: section titles ("My Day"). */
  sectionTitle: { size: 24, line: 30, family: "sans", weight: 700, tracking: -0.01, color: "foreground" },
  /** 16/22 semibold: insight and coach card titles. */
  insightTitle: { size: 16, line: 22, family: "sans", weight: 600, color: "foreground" },
  /** 17/22 semibold: header bar titles, as a navigation bar sets them. */
  headerTitle: { size: 17, line: 22, family: "sans", weight: 600, color: "foreground" },
  /** 12/16 semibold: tile labels. */
  tileLabel: { size: 12, line: 16, family: "sans", weight: 600, color: "foregroundSecondary" },
  /** 12/16 semibold: tags, date pill, ring-row labels. */
  tag: { size: 12, line: 16, family: "sans", weight: 600, color: "foregroundSecondary" },
  /** 13/16 semibold secondary: the unit after a value. */
  unit: { size: 13, line: 16, family: "sans", weight: 600, color: "foregroundSecondary" },
  /** 16/22 semibold: timeline row names, sheet titles. */
  rowTitle: { size: 16, line: 22, family: "sans", weight: 600, color: "foreground" },
  /** 15/20 semibold: touch buttons, segmented controls. */
  button: { size: 15, line: 20, family: "sans", weight: 600, color: "foreground" },
  // Numeric roles
  /** 20/24 bold: row values. */
  value: { size: 20, line: 24, family: "numeric", weight: 700, color: "foreground" },
  /** 28/32 bold: chart headline. */
  valueLg: { size: 28, line: 32, family: "numeric", weight: 700, color: "foreground" },
  /** 30/36 bold −0.01 em: tile values. */
  valueXl: { size: 30, line: 36, family: "numeric", weight: 700, tracking: -0.01, color: "foreground" },
  /** 32/36 bold −0.01 em: the sleep hours hero. */
  valueHero: { size: 32, line: 36, family: "numeric", weight: 700, tracking: -0.01, color: "foreground" },
  /** 18/24 bold: wide-tile average, zone durations. */
  valueMd: { size: 18, line: 24, family: "numeric", weight: 700, color: "foreground" },
  /** 15/20 bold: stage shares, stacked counts. */
  valueSm: { size: 15, line: 20, family: "numeric", weight: 700, color: "foreground" },
  /** 16/20 bold: driver points. */
  valueBase: { size: 16, line: 20, family: "numeric", weight: 700, color: "foreground" },
  /** 14/18 medium muted: the average under a value. */
  numericCaption: { size: 14, line: 18, family: "numeric", weight: 500, color: "mutedForeground" },
  /** 13/18 medium muted numeric: axis end labels. */
  numericSmall: { size: 13, line: 18, family: "numeric", weight: 500, color: "mutedForeground" },
} as const satisfies Record<
  string,
  { size: number; line: number; family: "sans" | "numeric"; weight: number; tracking?: number; upper?: boolean; color: ColorToken }
>;
export type TextRole = keyof typeof ROLES;

export type TxtProps = Omit<TextProps, "style" | "role"> & {
  role?: TextRole;
  /** A token name, or any colour string. */
  color?: ColorToken | (string & {});
  /** Overrides the role's weight (sans 400-800, numeric 500-700). */
  weight?: SansWeight | NumericWeight;
  size?: number;
  lineHeight?: number;
  /** Tracking in em. */
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
  const tracking = p.tracking ?? ("tracking" in r ? r.tracking : 0);
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
