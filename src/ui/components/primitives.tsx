import * as React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Check, CircleAlert, Triangle, TriangleAlert } from "lucide-react-native";
import { type ChipTone, type DeltaDir, type Tone } from "@/lib/bands";
import { isSymbolUnit, type FormatKey } from "@/lib/format";
import { familyTint, IconTile, recolorIcon, toneTint, unitSize, useSoftFill } from "./calmKit";
import { type AccentFamily } from "@/ui/accents";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { CountUpText } from "@/ui/motion/CountUp";
import { TAG_COPY, type MetricTag } from "./tagCopy";
import { ROLES, Txt, useTextStyle } from "./Text";

// Small shared marks used by every kit component (spec §5.0). One look per meaning.

export type TagKind = keyof typeof TAG_COPY | "so_far" | "partial_week" | "partial_month" | "estimate";
const EXTRA_TAGS: Record<Exclude<TagKind, keyof typeof TAG_COPY>, string> = {
  so_far: "So far",
  partial_week: "Partial week",
  partial_month: "Partial month",
  estimate: "Estimate",
};
export const tagLabel = (kind: TagKind) =>
  kind in TAG_COPY ? TAG_COPY[kind as keyof typeof TAG_COPY].label : EXTRA_TAGS[kind as keyof typeof EXTRA_TAGS];

/** Status tag ("Provisional", "So far"…): a quiet grey pill with grey text. Never coloured: colour is for data. */
export function Tag({ kind, style }: { kind: TagKind; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const fill = useSoftFill();
  return (
    <View style={[{ minHeight: 22, borderRadius: 14, backgroundColor: fill, paddingHorizontal: 9, paddingVertical: 3, justifyContent: "center" }, style]}>
      <Txt size={12} lineHeight={16} weight={600} style={{ color: c.sub }}>
        {tagLabel(kind)}
      </Txt>
    </View>
  );
}

/** The tags a metric carries: "Provisional" first, then "Baseline stale" / "Updated". */
export function MetricTags({
  provisional,
  tags,
  extra,
  align = "center",
  style,
}: {
  provisional?: boolean;
  tags?: MetricTag[];
  extra?: TagKind[];
  align?: "center" | "flex-start";
  style?: StyleProp<ViewStyle>;
}) {
  const all: TagKind[] = [...(provisional ? ["provisional" as const] : []), ...(tags ?? []), ...(extra ?? [])];
  if (!all.length) return null;
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: align, gap: 4 }, style]}>
      {all.map((k) => (
        <Tag key={k} kind={k} />
      ))}
    </View>
  );
}

const CHIP_ICON = { optimal: Check, warning: TriangleAlert, alert: CircleAlert, neutral: null } as const;

/**
 * Value plus tone, e.g. "✓ within 16.1 - 16.9", as a Calm pill: the tone's pastel (good mint, warning sand, alert rose)
 * with the text and icon in its ink; neutral a quiet grey with grey text. Icon follows the tone unless `delta` is
 * given. `compact`: the tile chip (22 px).
 */
export function StatusChip({
  tone,
  children,
  delta,
  compact,
  style,
}: {
  tone: ChipTone;
  children: React.ReactNode;
  delta?: DeltaDir;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useCalm();
  const quiet = useSoftFill();
  const tint = toneTint(tone);
  const Icon = CHIP_ICON[tone];
  const color = tint ? c.tintInk[tint] : c.sub;
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: 5,
          minHeight: compact ? 22 : 26,
          borderRadius: 14,
          paddingHorizontal: compact ? 8 : 10,
          paddingVertical: 3,
          backgroundColor: tint ? c.tint[tint] : quiet,
        },
        style,
      ]}
    >
      {delta ? <DeltaMark dir={delta} tone="neutral" color={color} /> : Icon && <Icon size={12} color={color} strokeWidth={2.5} />}
      <Txt size={12} lineHeight={16} weight={600} numberOfLines={2} style={[{ color, flexShrink: 1 }, TABULAR_STYLE]}>
        {children}
      </Txt>
    </View>
  );
}

const TABULAR_STYLE: TextStyle = { fontVariant: ["tabular-nums"] };

/** Filled 8 px triangle (up/down), or a 6 px dot when flat, in the tone's ink (good mint, bad sand). `color` overrides it. */
export function DeltaMark({ dir, tone, color, style }: { dir: DeltaDir; tone: Tone; color?: string; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  if (dir === "flat") return <View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color ?? c.faint }, style]} />;
  const tint = toneTint(tone);
  const fill = color ?? (tint ? c.tintInk[tint] : c.sub);
  return (
    <View style={[{ width: 8, height: 8, transform: [{ rotate: dir === "down" ? "180deg" : "0deg" }] }, style]}>
      <Triangle size={8} color={fill} fill={fill} strokeWidth={0} />
    </View>
  );
}

/**
 * A formatted value with its unit ("124 ms", "72%"): nested Text, so the unit sits on the value's baseline. The Calm
 * split: the value in the numeric face in ink (or `color`), the unit small (0.42× the value, at least 12 px) in the
 * grey text face. `style` is the value's text style (a `useTextStyle` result or a Txt role via `role`). With `count`, the
 * number counts up to `value` (src/ui/motion): an invisible copy of the final text holds the layout, so nothing around
 * it moves or re-wraps while the digits change, and the counting text is drawn over it from the `align` side.
 */
export function ValueUnit({
  value,
  unit,
  count,
  style,
  unitStyle,
  color,
  role = "value",
  size,
  lineHeight,
  numberOfLines,
  align = "right",
}: {
  value: string;
  unit?: string;
  /** The raw number behind `value` and its format: the shown text counts to it on mount and on change. */
  count?: { value: number; format: FormatKey } | null;
  /** With `count`: the side the value lines up on (a row's right-aligned value, a tile's left-aligned one). */
  align?: "left" | "right";
  style?: StyleProp<TextStyle>;
  unitStyle?: StyleProp<TextStyle>;
  color?: string;
  role?: React.ComponentProps<typeof Txt>["role"];
  size?: number;
  lineHeight?: number;
  numberOfLines?: number;
}) {
  const calm = useCalm();
  const valueStyle = useTextStyle({ role, color: color ?? calm.ink, size, lineHeight });
  const shown = StyleSheet.flatten(style)?.fontSize ?? valueStyle.fontSize ?? ROLES[role ?? "value"].size;
  const unitBase: TextStyle = { ...font.sans(500), fontSize: unitSize(shown), color: calm.sub, letterSpacing: 0, includeFontPadding: false };
  const unitNode = unit && value !== "--" && <Text style={[unitBase, { marginLeft: isSymbolUnit(unit) ? 2 : 4 }, unitStyle]}>{`${isSymbolUnit(unit) ? " " : " "}${unit}`}</Text>;
  if (!count)
    return (
      <Text allowFontScaling={false} numberOfLines={numberOfLines} style={[valueStyle, style]}>
        {value}
        {unitNode}
      </Text>
    );
  return (
    <View>
      {/* The final text, invisible, holds the box (and is what a screen reader reads). */}
      <Text allowFontScaling={false} numberOfLines={numberOfLines} style={[valueStyle, style, { opacity: 0 }]}>
        {value}
        {unitNode}
      </Text>
      {/* Room to spare on the far side, so a longer number on the way (counting down) never wraps. */}
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[{ position: "absolute", top: 0 }, align === "right" ? { right: 0, left: -COUNT_ROOM, alignItems: "flex-end" } : { left: 0, right: -COUNT_ROOM, alignItems: "flex-start" }]}
      >
        <Text allowFontScaling={false} numberOfLines={1} style={[valueStyle, style]}>
          <CountUpText value={count.value} format={count.format} />
          {unitNode}
        </Text>
      </View>
    </View>
  );
}

const COUNT_ROOM = 240;

/**
 * A row's leading icon in the Calm icon tile: a 44 px rounded square in its metric family's pastel (src/ui/calm.ts)
 * with the icon in the family's ink; with no family a quiet grey tile with a grey icon. `disc` is the tile's size
 * (default 44) and `slot` only matters without a tile. `backdrop={false}`: the bare icon in its family's ink, no tile.
 * Anything that is not an icon (a swatch) is drawn as given.
 */
export function AccentIcon({ icon, family, value, slot = 20, disc = 44, backdrop = true }: { icon: React.ReactNode; family: AccentFamily | null; value?: number | null; slot?: number; disc?: number; backdrop?: boolean }) {
  const c = useCalm();
  const tint = familyTint(family, value);
  const ink = tint ? c.tintInk[tint] : c.sub;
  const redrawn = recolorIcon(icon, ink);
  // A swatch (nothing to recolour) keeps its own small slot.
  if (redrawn === icon || !backdrop) return <View style={{ width: slot, height: slot, alignItems: "center", justifyContent: "center" }}>{redrawn}</View>;
  return <IconTile icon={icon} tint={tint} size={disc} radius={Math.round(disc * 0.32)} />;
}
