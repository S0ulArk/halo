import * as React from "react";
import { placeTarget } from "@/lib/labels";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { deltaTone, type GoodDirection, type Tone } from "@/lib/bands";
import { formatValue, isSymbolUnit, NBSP, spoken, type FormatKey } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { accentFamily, type AccentFamily } from "@/ui/accents";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { ChevronSlot, onBand, softFill } from "./calmKit";
import { RangeTrack, TonePill } from "./Meter";
import { MetricState, type MetricMeta } from "./MetricState";
import { AccentIcon, MetricTags, ValueUnit } from "./primitives";
import { Skeleton, SkeletonText } from "./Skeleton";
import { Txt } from "./Text";

type Common = {
  /** A lucide icon element: redrawn in the metric family's ink in its pastel icon tile (src/ui/components/calmKit.tsx). */
  icon?: React.ReactNode;
  /** The family whose accent tints the icon. Default: found from `label`; null keeps the icon as passed. */
  accent?: AccentFamily | null;
  label: string;
  metric: Metric<number> | null | undefined;
  unit?: string;
  format: FormatKey;
  /** Overrides the reason caption (e.g. "No lean body mass: add weight and body fat in Fitbit"). */
  reasonCopy?: string;
  style?: StyleProp<ViewStyle>;
  /** Opens the contributor's own detail (Recovery: its chart; Healthspan: its sheet). */
  onPress?: () => void;
};

export type ContributorRowProps =
  | (Common & {
      variant: "recovery";
      /** The personal normal: mean ± 1 σ is shaded, the track spans mean ± 3 σ. */
      baseline: { mean: number; sd: number };
      /** Points this input moved today's Recovery. */
      points: number | null;
      direction: GoodDirection;
    })
  | (Common & {
      variant: "healthspan";
      /** Axis ends, low to high value, left to right. */
      domain: [number, number];
      target: number;
      /** Years this input adds (positive, older) or removes (negative, younger). */
      years: number | null;
      higherIsBetter: boolean;
    });

const frac = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
/** The reading's dot: good mint, bad sand, in line the ink. */
const MARKER = (c: CalmPalette): Record<Tone, string> => ({ good: c.tintInk.mint, bad: c.tintInk.sand, neutral: c.ink });

/** The icon tile's size; the row's lead band (icon, name's first line, value, chevron) is as tall. */
const TILE = 44;
const LABEL_LINE = 20;
const VALUE_LINE = 26;
const CHEVRON = 18;
/** Where the lines under the head start: the name's column, past the icon tile. */
const textInset = (p: Common) => (p.icon ? TILE + 12 : 0);

/**
 * The family's icon tile, the name (15/20 600 ink, wrapping, never clamped) and the value in the numeric face on one
 * band, the effect pill under the name. The pill sits under the name, so the name keeps the row's width; a wrapped name
 * keeps the value on its first line. `trailing` is the chevron's column (Healthspan's rows).
 */
function Header({ p, value, pill, trailing }: { p: Common; value: number | null; pill?: React.ReactNode; trailing?: React.ReactNode }) {
  const c = useCalm();
  const band = p.icon ? TILE : VALUE_LINE;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      {p.icon && (
        <View style={{ width: TILE, height: TILE, alignItems: "center", justifyContent: "center" }}>
          <AccentIcon icon={p.icon} family={p.accent !== undefined ? p.accent : accentFamily(p.label)} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          {/* Wraps, never clamps: "Light and moderate zones" takes two lines on a 361 px phone. */}
          <Txt size={15} lineHeight={LABEL_LINE} weight={600} style={{ flex: 1, minWidth: 0, color: c.ink, marginTop: onBand(band, LABEL_LINE) }}>
            {p.label}
          </Txt>
          <View style={{ flexShrink: 0, maxWidth: "45%", alignItems: "flex-end", paddingTop: onBand(band, VALUE_LINE) }}>
            <ValueUnit value={formatValue(p.format, value)} unit={p.unit} role="value" size={22} lineHeight={VALUE_LINE} color={value === null ? c.faint : c.ink} style={{ textAlign: "right" }} />
          </View>
        </View>
        {pill}
      </View>
      {trailing && <View style={{ marginTop: onBand(band, CHEVRON) }}>{trailing}</View>}
    </View>
  );
}

function RecoveryRow({ p, value, meta }: { p: Extract<ContributorRowProps, { variant: "recovery" }>; value: number | null; meta?: MetricMeta }) {
  const c = useCalm();
  const { mean, sd } = p.baseline;
  const lo = mean - 3 * sd;
  const hi = mean + 3 * sd;
  const tone = value === null ? "neutral" : deltaTone(p.direction, value, mean, sd).tone;
  const pts = value === null ? null : p.points;
  const unitSpoken = (v: number) => spoken(formatValue(p.format, v), p.unit);
  const sentence =
    value === null
      ? `${p.label}: ${p.reasonCopy ?? "Not measured: left out of today’s score"}`
      : `${p.label} ${unitSpoken(value)}, ${value > mean + sd ? "above" : value < mean - sd ? "below" : "within"} your normal range of ${formatValue(p.format, mean - sd)} to ${formatValue(p.format, mean + sd)}${pts === null ? "" : pts === 0 ? ", no change" : `, ${pts > 0 ? "added" : "took off"} ${Math.abs(Math.round(pts))} points`}`;
  const body = (
    <>
      <Header p={p} value={value} pill={pts !== null && <TonePill tone={pts > 0 ? "good" : pts < 0 ? "bad" : "neutral"}>{`${formatValue("signedInt", pts)}${NBSP}pts`}</TonePill>} />
      {/* In the name's column, as the pill is: the track spans mean ± 3 σ; your normal (± 1 σ) is the faint segment,
          today the dot in its tone. */}
      <View style={{ marginLeft: textInset(p), gap: 12 }}>
        <RangeTrack value={value === null ? null : frac(value, lo, hi)} color={MARKER(c)[tone]} range={[frac(mean - sd, lo, hi), frac(mean + sd, lo, hi)]} height={8} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <Txt size={13} lineHeight={18} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
            {value === null
              ? (p.reasonCopy ?? "Not measured: left out of today’s score")
              : `Baseline ${formatValue(p.format, mean)} ± ${formatValue(p.format, sd).replace(/^\+/, "")}${p.unit ? (isSymbolUnit(p.unit) ? p.unit : `${NBSP}${p.unit}`) : ""}`}
          </Txt>
          {meta && value !== null && <MetricTags provisional={meta.provisional} tags={meta.tags} />}
        </View>
      </View>
    </>
  );
  // With a detail to open, the whole row is the button; a press tints it with the quiet fill.
  if (p.onPress)
    return (
      <Pressable
        onPress={p.onPress}
        accessibilityRole="button"
        accessibilityLabel={`${sentence}. Opens its history`}
        style={({ pressed }) => [{ gap: 12, paddingVertical: 14, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 16, backgroundColor: pressed ? softFill(c, "card") : "transparent" }, p.style]}
      >
        {body}
      </Pressable>
    );
  return (
    <View accessibilityLabel={sentence} style={[{ gap: 12, paddingVertical: 14 }, p.style]}>
      {body}
    </View>
  );
}

function HealthspanRow({ p, value, meta }: { p: Extract<ContributorRowProps, { variant: "healthspan" }>; value: number | null; meta?: MetricMeta }) {
  const c = useCalm();
  const [lo, hi] = p.domain;
  // Under 0.05 years rounds to "0.0": no change, neither younger nor older.
  const years = value === null || p.years === null ? null : Math.abs(p.years) < 0.05 ? 0 : p.years;
  const [loText, hiText] = [formatValue(p.format, lo), formatValue(p.format, hi)];
  const sentence =
    value === null
      ? `${p.label}: ${p.reasonCopy ?? "No data"}`
      : `${p.label} ${spoken(formatValue(p.format, value), p.unit)}, target ${formatValue(p.format, p.target)}${years === null ? "" : years === 0 ? ", no change in years" : `, ${formatValue("decimal1", Math.abs(years))} years ${years < 0 ? "younger" : "older"}`}`;
  const t = frac(p.target, lo, hi);
  // The good side of the target is the faint mint stretch; the target a tick; you the dot (mint younger, sand older).
  const good: [number, number] = p.higherIsBetter ? [t, 1] : [0, t];
  const dot = years === null || years === 0 ? c.ink : years < 0 ? c.tintInk.mint : c.tintInk.sand;
  const body = (
    <View style={{ gap: 12 }}>
      <Header
        p={p}
        value={value}
        pill={years !== null && <TonePill tone={years < 0 ? "good" : years > 0 ? "bad" : "neutral"}>{`${formatValue("decimal1", years)}${NBSP}years`}</TonePill>}
        // The chevron's column on every row, on the value's band.
        trailing={<ChevronSlot shown={!!p.onPress} size={CHEVRON} />}
      />
      {/* In the name's column, as the pill is, ending where the value does (the chevron keeps its column). */}
      <View style={{ marginLeft: textInset(p), marginRight: CHEVRON + 12, gap: 12 }}>
        <RangeTrack value={value === null ? null : frac(value, lo, hi)} color={dot} range={good} rangeColor={alpha(c.tintInk.mint, 0.3)} tick={t} height={8} style={{ marginVertical: 3 }} />
        <TargetLabels
          t={t}
          loText={loText}
          hiText={hiText}
          target={
            value !== null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Txt role="numericSmall" color={c.sub}>
                  Target {formatValue(p.format, p.target)}
                </Txt>
                {meta && <MetricTags provisional={meta.provisional} tags={meta.tags} />}
              </View>
            ) : null
          }
        />
        {value === null && (
          <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
            {p.reasonCopy ?? "No data"}
          </Txt>
        )}
      </View>
    </View>
  );
  if (p.onPress)
    return (
      <Pressable
        onPress={p.onPress}
        accessibilityRole="button"
        accessibilityLabel={sentence}
        style={({ pressed }) => [{ marginHorizontal: -8, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 14, backgroundColor: pressed ? softFill(c, "card") : "transparent" }, p.style]}
      >
        {body}
      </Pressable>
    );
  return (
    <View accessibilityLabel={sentence} style={[{ paddingVertical: 14 }, p.style]}>
      {body}
    </View>
  );
}

/** One input's value against its normal band and its effect on the score (spec §5.3). */
export function ContributorRow(p: ContributorRowProps) {
  const render = (value: number | null, meta?: MetricMeta) => (p.variant === "recovery" ? <RecoveryRow p={p} value={value} meta={meta} /> : <HealthspanRow p={p} value={value} meta={meta} />);
  return (
    <MetricState metric={p.metric} skeleton={<ContributorRowSkeleton variant={p.variant} icon={p.icon ? TILE : undefined} />} empty={render(null)} renderReason={(_, meta) => render(null, meta)}>
      {(v, meta) => render(v, meta)}
    </MetricState>
  );
}

/** The row's loading shape in its real box: `icon` is the icon tile's size (none: no tile), the lines under it in the name's column. */
export function ContributorRowSkeleton({ variant = "recovery", icon }: { variant?: ContributorRowProps["variant"]; icon?: number }) {
  const c = useCalm();
  const band = icon ?? VALUE_LINE;
  const track = <View style={{ height: 8, borderRadius: 4, backgroundColor: c.line }} />;
  return (
    <View style={{ gap: 10, paddingVertical: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        {icon ? <Skeleton radius={Math.round(icon * 0.32)} style={{ width: icon, height: icon }} /> : null}
        <SkeletonText role="label" size={15} lineHeight={LABEL_LINE} width={144} style={{ flex: 1, marginTop: onBand(band, LABEL_LINE) }} />
        <SkeletonText role="value" size={22} lineHeight={VALUE_LINE} chars={6} style={{ marginTop: onBand(band, VALUE_LINE) }} />
      </View>
      <View style={{ marginLeft: icon ? icon + 12 : 0, gap: 10 }}>
        {variant === "healthspan" ? <View style={{ marginVertical: 3 }}>{track}</View> : track}
        <SkeletonText role="caption" width={variant === "healthspan" ? undefined : 112} />
      </View>
    </View>
  );
}
ContributorRow.Skeleton = ContributorRowSkeleton;

function TargetLabels({ t, loText, hiText, target }: { t: number; loText: string; hiText: string; target: React.ReactNode }) {
  const c = useCalm();
  const [w, setW] = React.useState({ row: 0, label: 0, lo: 0, hi: 0 });
  const set = (k: keyof typeof w) => (e: { nativeEvent: { layout: { width: number } } }) => {
    const v = Math.round(e.nativeEvent.layout.width);
    setW((s) => (s[k] === v ? s : { ...s, [k]: v }));
  };
  const measured = w.row > 0 && w.label > 0;
  const place = target && measured ? placeTarget(w.row, w.label, w.lo, w.hi, t) : null;
  return (
    <View onLayout={set("row")} style={{ height: 16, flexDirection: "row", justifyContent: "space-between" }}>
      <View onLayout={set("lo")} style={{ opacity: place?.hideLo ? 0 : 1 }}>
        <Txt role="numericSmall" color={c.faint}>
          {loText}
        </Txt>
      </View>
      {target && (
        <View onLayout={set("label")} style={{ position: "absolute", top: 0, bottom: 0, justifyContent: "center", left: place?.left ?? 0, opacity: place ? 1 : 0 }}>
          {target}
        </View>
      )}
      <View onLayout={set("hi")} style={{ opacity: place?.hideHi ? 0 : 1 }}>
        <Txt role="numericSmall" color={c.faint}>
          {hiText}
        </Txt>
      </View>
    </View>
  );
}
