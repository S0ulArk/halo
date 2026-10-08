// The Calm design's shared parts for the kit's components (the reference is Home, src/screens/home/calm.tsx): the
// metric family → pastel map, the tone pastels, the icon tile, a number with its small grey unit, the caps caption
// under a number, and the surface a control sits on (so a quiet fill reads on a white card and on the grey ground
// alike). Every colour comes from useCalm() (src/ui/calm.ts).
import * as React from "react";
import { View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { recoveryBand, type ChipTone, type Tone } from "@/lib/bands";
import type { AccentFamily } from "@/ui/accents";
import { useCalm, type CalmPalette, type CalmTint } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { Txt } from "./Text";

/** One soft pastel per metric family. */
export const FAMILY_TINT: Record<AccentFamily, CalmTint> = {
  recovery: "mint",
  sleep: "lavender",
  stress: "lavender",
  strain: "peach",
  activity: "sky",
  body: "sand",
  heart: "rose",
};

/**
 * A family's pastel, or null. Recovery follows its band when `value` is a recovery score (0-100): green mint, yellow
 * sand, red rose, as Home colours its Recovery number.
 */
export function familyTint(family: AccentFamily | null | undefined, value?: number | null): CalmTint | null {
  if (!family) return null;
  if (family === "recovery" && value !== null && value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100) {
    const band = recoveryBand(value);
    return band === "green" ? "mint" : band === "yellow" ? "sand" : "rose";
  }
  return FAMILY_TINT[family];
}

/** A delta tone or a chip tone as a pastel: good mint, warning sand, alert rose; neutral has none (a quiet grey). */
export function toneTint(tone: Tone | ChipTone): CalmTint | null {
  return tone === "good" || tone === "optimal" ? "mint" : tone === "bad" || tone === "warning" ? "sand" : tone === "alert" ? "rose" : null;
}

// --- The surface under a control ---

export type CalmSurface = "ground" | "card";
const Surface = React.createContext<CalmSurface>("ground");

/** Marks everything under it as sitting on a card (Card, sheets and dialogs provide it). */
export function OnCard({ children }: { children: React.ReactNode }) {
  return <Surface.Provider value="card">{children}</Surface.Provider>;
}

export const useSurface = (): CalmSurface => React.useContext(Surface);

/**
 * The quiet fill of a pill, a secondary button or a segmented track: a card's white on the ground; on a card the
 * ground's grey (light) or the raised chip (dark), so it never vanishes into the surface under it.
 */
export function softFill(c: CalmPalette, surface: CalmSurface): string {
  if (surface === "ground") return c.card;
  return c.chip === c.card ? c.ground : c.chip;
}

/** `softFill` for the surface this component sits on. */
export function useSoftFill(): string {
  return softFill(useCalm(), useSurface());
}

// --- Icons ---

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
const isComponent = (x: unknown): x is IconComponent => typeof x === "function" || (typeof x === "object" && x !== null && "$$typeof" in x);

/**
 * The icon element redrawn in `color` (and at `size` when given): lucide elements take both as props; wrappers that
 * take the glyph as `icon` (`<StatIcon icon={Heart} />`) are unwrapped. Anything else (a swatch) is drawn as given.
 */
export function recolorIcon(node: React.ReactNode, color: string, size?: number): React.ReactNode {
  if (!React.isValidElement<Record<string, unknown>>(node)) return node;
  const props = node.props;
  if ("color" in props) return React.cloneElement(node, size !== undefined && typeof props.size === "number" ? { color, size } : { color });
  if (isComponent(props.icon)) {
    const Icon = props.icon;
    return <Icon size={size ?? (typeof props.size === "number" ? props.size : 20)} color={color} strokeWidth={typeof props.strokeWidth === "number" ? props.strokeWidth : 1.75} />;
  }
  return node;
}

/**
 * The Calm icon tile (Home's): a 44 px rounded square in the family's pastel with the icon in its ink. Without a tint
 * it is a quiet grey tile with the icon in the ink colour. A swatch (not an icon) is drawn as given, centred.
 */
export function IconTile({ icon, tint, size = 44, radius = 14, iconSize, bg, style }: { icon: React.ReactNode; tint: CalmTint | null; size?: number; radius?: number; iconSize?: number; bg?: string; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const fill = bg ?? (tint ? c.tint[tint] : softFill(c, "card"));
  const ink = tint ? c.tintInk[tint] : c.sub;
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, backgroundColor: fill, alignItems: "center", justifyContent: "center" }, style]}>
      {recolorIcon(icon, ink, iconSize ?? Math.round(size / 2))}
    </View>
  );
}

// --- List rows ---

/**
 * A list row's trailing chevron, or an empty box of the same size when the row opens nothing: every row of a list
 * keeps the column, so the values beside it share one right edge and the lines under them wrap at one width.
 */
export function ChevronSlot({ shown, size = 18, color, style }: { shown: boolean; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ width: size, height: size, flexShrink: 0 }, style]}>
      {shown && <ChevronRight size={size} color={color ?? c.label} strokeWidth={1.5} />}
    </View>
  );
}

/**
 * The offset that centres a line `h` px tall on a row's lead band (`band`, the icon tile's size): list rows put the
 * icon, the first line of the name, the value and the chevron on that band, and hang everything else under it.
 */
export const onBand = (band: number, h: number) => Math.max(0, (band - h) / 2);

// --- Numbers ---

/**
 * A number with its unit beside it on the baseline (Home's Num): Barlow (tabular), a step lighter from 28 px
 * up,, in the number's colour, the unit small (0.42×, at least 12 px) and grey in the text face, so "43 ms" reads as a value with a
 * unit, never as a phrase.
 */
export function Num({ value, unit, size, color, unitColor, style, numberOfLines = 1 }: { value: string; unit?: string; size: number; color?: string; unitColor?: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 1 }}>
      <Txt size={size} lineHeight={Math.round(size * 1.15)} numberOfLines={numberOfLines} style={[font.numberAt(size), { color: color ?? c.ink }, style]}>
        {value}
      </Txt>
      {unit ? (
        <Txt size={unitSize(size)} lineHeight={Math.round(unitSize(size) * 1.3)} weight={500} numberOfLines={1} style={{ color: unitColor ?? c.sub, marginLeft: unit === "%" ? 1 : 4 }}>
          {unit}
        </Txt>
      ) : null}
    </View>
  );
}

/** The unit's size beside a number of `size` px: 0.42×, never under 12 px. */
export const unitSize = (size: number) => Math.max(12, Math.round(size * 0.42));

/** The caps caption under a number: 11 px semibold, tracked 1.4, the faint grey, never mistaken for the value. */
export function Caption({ children, color, numberOfLines = 1, style }: { children: string; color?: string; numberOfLines?: number; style?: StyleProp<TextStyle> }) {
  const c = useCalm();
  return (
    <Txt size={11} lineHeight={15} weight={600} numberOfLines={numberOfLines} style={[{ color: color ?? c.faint, letterSpacing: 1.4 }, style]}>
      {children.toUpperCase()}
    </Txt>
  );
}

/** The Calm text styles, for places that build their own Text (ValueUnit's unit, the chart readouts). */
export const CALM_TYPE = {
  /** Titles: Figtree 600 17/22. */
  title: { size: 17, line: 22, weight: 600 },
  /** Sentences: 14/19. */
  sentence: { size: 14, line: 19, weight: 400 },
  /** Labels under numbers: 11/15 600 caps, 1.4 tracking. */
  caption: { size: 11, line: 15, weight: 600, tracking: 1.4 },
} as const;
