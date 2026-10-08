import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { deltaTone, type ChipTone, type DeltaDir, type GoodDirection, type Tone } from "@/lib/bands";
import { formatValue, MISSING, statSentence, type FormatKey } from "@/lib/format";
import { reasonCopy, type Metric, type ReasonCode } from "@/lib/reasons";
import { NBSP } from "@/lib/format";
import { accentFamily, type AccentFamily } from "@/ui/accents";
import { useCalm, type CalmPalette } from "@/ui/calm";
import type { ColorToken } from "@/ui/theme";
import { Card } from "./Card";
import { ChevronSlot, familyTint, onBand, softFill } from "./calmKit";
import { MetricState, type MetricMeta } from "./MetricState";
import { Capsule, TonePill } from "./Meter";
import { AccentIcon, MetricTags, StatusChip, ValueUnit } from "./primitives";
import { SkeletonText } from "./Skeleton";
import { Sparkline } from "./Sparkline";
import { Txt } from "./Text";
import { TileLabel } from "./TileRow";

export type SleepStatus = "poor" | "sufficient" | "optimal";

export type KeyStatRowProps = {
  /** `row` inside a card's list; `card` is a row that is its own card (Home "My Dashboard"); `tile` for grids. */
  variant: "row" | "card" | "tile";
  /**
   * A lucide icon element or a swatch. A lucide icon is redrawn in its metric family's ink in the family's pastel
   * icon tile (44 px, src/ui/components/calmKit.tsx); a swatch is drawn as given.
   */
  icon?: React.ReactNode;
  /** The metric family whose pastel tints the icon tile and the value. Default: found from `label`; null: neutral. */
  accent?: AccentFamily | null;
  label: string;
  /** A caption under the label ("Typical 5-10%"). */
  caption?: string;
  metric: Metric<number> | null | undefined;
  unit?: string;
  format: FormatKey;
  /** The 30-day average, shown under the value (row) or as the delta chip (tile). */
  average?: number | null;
  /** Spoken name of the comparison; default "30-day average". */
  averageLabel?: string;
  /** Good direction for the arrow tone; "none" hides the arrow (Strain Target, stage rows). */
  direction: GoodDirection | "none";
  sd?: number;
  /** Sleep summary rows: a band-coloured capsule meter before the value. */
  status?: SleepStatus;
  /** Tile status chip ("within 16.1 - 16.9"); warning or alert rings the tile. */
  chip?: { tone: ChipTone; text: string };
  /** The row or tile is a tap target (the web's `href` / `onSelect`). */
  onPress?: () => void;
  /** Tile spanning a full grid row: a short strip with the comparison spelled out on the right. */
  wide?: boolean;
  /** A wide tile's recent values (oldest first) drawn on its right as a sparkline, with `band` shaded as the normal range. */
  spark?: { values: (number | null)[]; band?: { low: number; high: number } | null; caption?: string };
  style?: StyleProp<ViewStyle>;
};

/** Band colours of the sleep summary's meter (and Sleep's legend pills): poor warning, sufficient neutral, optimal. */
export const STATUS_COLOR: Record<SleepStatus, ColorToken> = { poor: "warning", sufficient: "foregroundSecondary", optimal: "optimal" };
const STATUS_WORD: Record<SleepStatus, string> = { poor: "poor", sufficient: "sufficient", optimal: "optimal" };

type Computed = {
  valueText: string;
  value?: number;
  avgText?: string;
  diffText?: string;
  /** value − average, raw. */
  diff?: number;
  dir?: DeltaDir;
  tone?: Tone;
  reason?: string;
  meta?: MetricMeta;
  loading?: boolean;
};
const LOADING: Computed = { valueText: "", loading: true };

function compute(p: KeyStatRowProps, value: number | null, meta?: MetricMeta, reason?: ReasonCode): Computed {
  if (value === null) return { valueText: MISSING, reason: reasonCopy(reason, meta?.nightsLeft).short };
  const avg = p.average ?? null;
  const t = avg !== null && p.direction !== "none" ? deltaTone(p.direction, value, avg, p.sd) : undefined;
  const diff = avg !== null ? value - avg : null;
  const diffText = diff === null || absText(p.format, diff) === absText(p.format, 0) ? undefined : `${diff > 0 ? "+" : "−"}${absText(p.format, diff)}`;
  return { valueText: formatValue(p.format, value), value, avgText: avg !== null ? formatValue(p.format, avg) : undefined, diffText, diff: diff ?? undefined, dir: t?.dir, tone: t?.tone, meta };
}

/** |n| in the row's format, without the sign a signed format adds. */
const absText = (format: FormatKey, n: number) => formatValue(format, Math.abs(n)).replace(/^[+−-]/, "");

const unitText = (unit?: string) => (unit ? (unit === "%" ? "%" : `${NBSP}${unit}`) : "");

const familyOf = (p: KeyStatRowProps) => (p.accent !== undefined ? p.accent : accentFamily(p.label));

/** The value's ink: the family's (recovery by its band), plain ink without one, the faint grey when there is none. */
function valueInk(c: CalmPalette, p: KeyStatRowProps, k: Computed): string {
  if (k.reason) return c.faint;
  const tint = familyTint(familyOf(p), k.value);
  return tint ? c.tintInk[tint] : c.ink;
}

/** The status meter's band ink: poor sand, sufficient grey, optimal mint. */
const STATUS_INK = (c: CalmPalette): Record<SleepStatus, string> => ({ poor: c.tintInk.sand, sufficient: c.faint, optimal: c.tintInk.mint });

/**
 * The comparison as a meaning chip: "▲ 4 ms" tinted good or bad (the metric's good direction decides), a dot and the
 * signed difference when it sits inside the normal band, "No change" when it rounds away. Null without an average.
 */
function DeltaPill({ p, c, suffix }: { p: KeyStatRowProps; c: Computed; suffix?: string }) {
  if (c.reason || c.loading || c.avgText === undefined || c.diff === undefined) return null;
  const tone = c.tone ?? "neutral";
  const end = suffix ? ` ${suffix}` : "";
  if (!c.diffText)
    return (
      <TonePill tone="neutral" dir="flat">
        {`No change${end}`}
      </TonePill>
    );
  // Inside ±1 σ the reading is "in line": a dot, and the sign spelled out since no arrow carries it.
  if (c.dir === "flat")
    return (
      <TonePill tone="neutral" dir="flat">
        {`${c.diffText}${unitText(p.unit)}${end}`}
      </TonePill>
    );
  return (
    <TonePill tone={tone} dir={c.diff > 0 ? "up" : "down"}>
      {`${absText(p.format, c.diff)}${unitText(p.unit)}${end}`}
    </TonePill>
  );
}

/** The average the difference is against, by the pill ("30-day avg 62 ms"), 12 px faint, so the row still shows it. */
function AverageLine({ p, c }: { p: KeyStatRowProps; c: Computed }) {
  const calm = useCalm();
  if (c.reason || c.loading || c.avgText === undefined) return null;
  return (
    <Txt size={12} lineHeight={16} weight={500} style={{ color: calm.faint, fontVariant: ["tabular-nums"] }}>
      {`${p.averageLabel ?? "30-day avg"} ${c.avgText}${unitText(p.unit)}`}
    </Txt>
  );
}

/** Sleep's summary rows: the value's share (of 100 %) filled in its band's ink. */
function StatusMeter({ p, c }: { p: KeyStatRowProps; c: Computed }) {
  const calm = useCalm();
  if (!p.status) return null;
  const share = c.reason || c.value === undefined ? null : p.unit === "%" ? c.value / 100 : 1;
  return <Capsule value={share} color={STATUS_INK(calm)[p.status]} height={8} style={{ width: 64 }} />;
}

/** The metric's name (16/21 600 ink) over its caption or reason (13/18 grey); both wrap, never cut short. */
function LabelBlock({ p, c }: { p: KeyStatRowProps; c: Computed }) {
  const calm = useCalm();
  return (
    <View style={{ gap: 2 }}>
      {p.label ? (
        <Txt size={16} lineHeight={21} weight={600} style={{ color: calm.ink }}>
          {p.label}
        </Txt>
      ) : (
        <SkeletonText size={16} lineHeight={21} role="label" width={128} />
      )}
      {(c.reason || p.caption) && (
        <Txt size={13} lineHeight={18} style={{ color: calm.sub }}>
          {c.reason ?? p.caption}
        </Txt>
      )}
    </View>
  );
}

/**
 * A row's lead band, the icon tile's height: the icon, the name's first line, the value and the chevron are centred on
 * it, in every row of a list, with or without an icon; the caption, the comparison and the tags hang under the name.
 */
const BAND = 44;
const LABEL_LINE = 21;
const VALUE_LINE = 28;
const CHEVRON = 18;

/**
 * A row (in a card's list) or a row that is its own card: the family's icon tile, the name over its caption, the value
 * on the right in the family's ink, the chevron (or its empty column) after it; under the name, in the name's column,
 * the comparison as a pastel pill with the average beside it (it wraps under the pill when narrow), the band meter and
 * the metric's tags.
 */
function Row({ p, c }: { p: KeyStatRowProps; c: Computed }) {
  const calm = useCalm();
  const tappable = !!p.onPress && !c.loading;
  const family = familyOf(p);
  const base = c.loading
    ? ""
    : c.reason
      ? `${p.label}: ${c.reason}`
      : statSentence({ label: p.label, valueText: c.valueText, unit: p.unit, averageText: c.avgText, averageLabel: p.averageLabel, dir: c.dir, tone: c.tone });
  const sentence = base && p.status && !c.reason ? `${base}, ${STATUS_WORD[p.status]}` : base;
  const compare = !c.loading && !c.reason && (c.avgText !== undefined || !!p.status);
  const tags = !!c.meta && (c.meta.provisional || !!c.meta.tags?.length);
  // A grouped-list row: the screen's divider draws the hairline between rows; the row owns its 14 px of air.
  const inner = (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 72, paddingVertical: 14 }}>
      {p.icon && (
        // A swatch keeps the tile's box, so every row's name starts at one x.
        <View style={{ width: BAND, height: BAND, alignItems: "center", justifyContent: "center" }}>
          <AccentIcon icon={p.icon} family={family} value={c.value} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, paddingTop: onBand(BAND, LABEL_LINE) }}>
            <LabelBlock p={p} c={c} />
          </View>
          <View style={{ alignItems: "flex-end", flexShrink: 0, maxWidth: "50%", paddingTop: onBand(BAND, VALUE_LINE) }}>
            {c.loading ? (
              <SkeletonText role="value" size={24} lineHeight={VALUE_LINE} chars={4} />
            ) : (
              <ValueUnit value={c.valueText} unit={p.unit} role="value" size={24} lineHeight={VALUE_LINE} color={valueInk(calm, p, c)} style={{ textAlign: "right" }} />
            )}
          </View>
        </View>
        {compare && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
            <StatusMeter p={p} c={c} />
            <DeltaPill p={p} c={c} />
            <AverageLine p={p} c={c} />
          </View>
        )}
        {tags && <MetricTags provisional={c.meta!.provisional} tags={c.meta!.tags} align="flex-start" />}
      </View>
      {/* The chevron's column on every row of a list, tappable or not, so the values share one right edge. My
          Dashboard's cards carry no chevron (spec §11 F10); the card still presses in. */}
      {p.variant !== "card" && <ChevronSlot shown={tappable} size={CHEVRON} style={{ marginTop: onBand(BAND, CHEVRON) }} />}
    </View>
  );
  if (p.variant === "card")
    return (
      <Card padding={0} onPress={tappable ? p.onPress : undefined} accessibilityLabel={sentence} style={p.style}>
        <View style={{ paddingHorizontal: 16 }}>{inner}</View>
      </Card>
    );
  if (tappable)
    return (
      <Pressable
        onPress={p.onPress}
        accessibilityRole="button"
        accessibilityLabel={sentence}
        style={({ pressed }) => [{ marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 16, backgroundColor: pressed ? softFill(calm, "card") : "transparent" }, p.style]}
      >
        {inner}
      </Pressable>
    );
  return (
    <View accessibilityLabel={sentence} style={p.style}>
      {inner}
    </View>
  );
}

/**
 * A grid tile (never more than two across): the family's icon tile, the name (wrapping, never cut), the value in the
 * family's ink with its unit small and grey, then its range chip or the comparison pill over the average. A wide tile
 * (a full grid row) puts the value block on the left and the sparkline or the average on the right. In a TileRow the
 * tile fills the row's height and its name takes the row's tallest name's height, so the two values share a line.
 */
function Tile({ p, c }: { p: KeyStatRowProps; c: Computed }) {
  const calm = useCalm();
  const family = familyOf(p);
  const tint = familyTint(family, c.value);
  const flagged = !c.reason && !c.loading && (p.chip?.tone === "warning" || p.chip?.tone === "alert");
  const sentence = c.loading
    ? ""
    : c.reason
      ? `${p.label}: ${c.reason}`
      : [statSentence({ label: p.label, valueText: c.valueText, unit: p.unit, averageText: p.chip ? undefined : c.avgText, averageLabel: p.averageLabel, dir: c.dir, tone: c.tone }), p.chip?.text]
          .filter(Boolean)
          .join(", ");
  const wide = !!p.wide;
  // The range chip when the tile has one, else the comparison as a delta pill ("▲ 4 ms vs avg") over the average.
  const chipNode = p.chip ? (
    <StatusChip tone={p.chip.tone} compact>
      {p.chip.text}
    </StatusChip>
  ) : (
    <View style={{ gap: 4 }}>
      <DeltaPill p={p} c={c} suffix="vs avg" />
      <AverageLine p={p} c={c} />
    </View>
  );
  return (
    <Card padding={16} onPress={c.loading ? undefined : p.onPress} accessibilityLabel={sentence} ring={flagged ? "warning" : null} style={[{ flexGrow: 1, minHeight: wide ? undefined : 156 }, p.style]}>
      <View style={{ flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", gap: 12, flexGrow: 1 }}>
        <View style={{ gap: 10, flex: wide && !p.spark ? 1 : undefined, flexGrow: wide ? (p.spark ? 0 : 1) : 1, flexShrink: 1, minWidth: 0 }}>
          {/* The icon tile, then the name under it: a two-across tile has no room for both on one line. */}
          {p.icon && (
            <View style={{ width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" }}>
              <AccentIcon icon={p.icon} family={family} value={c.value} disc={40} />
            </View>
          )}
          <TileLabel>
            {p.label ? (
              <Txt size={16} lineHeight={21} weight={600} style={{ color: calm.ink }}>
                {p.label}
              </Txt>
            ) : (
              <SkeletonText role="label" size={16} lineHeight={21} width={96} />
            )}
          </TileLabel>
          {/* Straight under the name (the row's names share a height), so the two values of a row share a line. */}
          <View style={{ alignItems: "flex-start", gap: 8 }}>
            {c.loading ? (
              <>
                <SkeletonText role="valueXl" size={28} lineHeight={32} chars={3} />
                <SkeletonText role="tag" size={11} lineHeight={22} width={112} />
              </>
            ) : (
              <ValueUnit value={c.valueText} align="left" unit={p.unit} role="valueXl" size={28} lineHeight={32} color={valueInk(calm, p, c)} />
            )}
            {c.loading ? null : c.reason ? (
              <Txt size={13} lineHeight={18} style={{ color: calm.sub }}>
                {c.reason}
              </Txt>
            ) : (
              <>
                {c.meta && <MetricTags provisional={c.meta.provisional} tags={c.meta.tags} align="flex-start" />}
                {(!wide || p.spark) && chipNode}
              </>
            )}
          </View>
        </View>
        {wide && p.spark && !c.loading && (
          <Sparkline
            values={p.spark.values}
            band={p.spark.band}
            color={p.chip?.tone === "warning" || p.chip?.tone === "alert" ? calm.tintInk.sand : tint ? calm.tintInk[tint] : calm.sub}
            caption={p.spark.caption}
            style={{ height: 64, flex: 1, minWidth: 0, alignSelf: "center" }}
          />
        )}
        {wide && !p.spark && !c.loading && !c.reason && (p.chip || c.avgText) && (
          <View style={{ alignItems: "flex-end", gap: 4, flexShrink: 1 }}>
            <Txt size={11} lineHeight={15} weight={600} style={{ color: calm.faint, letterSpacing: 1.4 }}>
              {(p.chip ? "Your range" : (p.averageLabel ?? "30-day avg")).toUpperCase()}
            </Txt>
            {p.chip ? (
              <StatusChip tone={p.chip.tone} compact>
                {p.chip.text}
              </StatusChip>
            ) : (
              <>
                <ValueUnit value={c.avgText!} unit={p.unit} role="valueMd" size={20} lineHeight={24} />
                <DeltaPill p={p} c={c} />
              </>
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

/** One metric with label, value, unit and its comparison as a direction-aware delta pill (spec §5.2). */
export function KeyStatRow(p: KeyStatRowProps) {
  const View_ = p.variant === "tile" ? Tile : Row;
  return (
    <MetricState
      metric={p.metric}
      skeleton={<View_ p={p} c={LOADING} />}
      empty={<View_ p={p} c={compute(p, null, undefined, "no_data")} />}
      renderReason={(reason, meta) => <View_ p={p} c={compute(p, null, meta, reason)} />}
    >
      {(value, meta) => <View_ p={p} c={compute(p, value, meta)} />}
    </MetricState>
  );
}

/** Loading shape (spec §5.19): the row or tile's own box, with its real icon and label when known, and a bar for the value. */
export function KeyStatRowSkeleton({ variant, label = "", icon }: { variant: KeyStatRowProps["variant"]; label?: string; icon?: React.ReactNode }) {
  const p: KeyStatRowProps = { variant, label, icon, metric: undefined, format: "int", direction: "none" };
  return variant === "tile" ? <Tile p={p} c={LOADING} /> : <Row p={p} c={LOADING} />;
}
KeyStatRow.Skeleton = KeyStatRowSkeleton;
