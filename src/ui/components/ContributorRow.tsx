// One input to a score as a row: Recovery's contributors as Apple Health's "What shaped it" rows (an inset grouped list
// row with a coloured icon square, today's reading against your normal, a slim range track and the points it moved the
// score), and Healthspan's inputs against their targets.
import * as React from "react";
import { placeTarget } from "@/lib/labels";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { deltaTone, type GoodDirection } from "@/lib/bands";
import { formatValue, isSymbolUnit, NBSP, spoken, type FormatKey } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { accentFamily, type AccentFamily } from "@/ui/accents";
import { useCalm } from "@/ui/calm";
import { ChevronSlot, iconRadius, onBand, recolorIcon, softFill } from "./calmKit";
import { RangeTrack, TonePill } from "./Meter";
import { MetricState, type MetricMeta } from "./MetricState";
import { AccentIcon, MetricTags, ValueUnit } from "./primitives";
import { usePress, usePressStyle } from "./press";
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
  /** Recovery: the icon square's colour (a system colour); default the Recovery green. */
  color?: string;
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

/** The icon tile's size; the row's lead band (icon, name's first line, value, chevron) is as tall. */
const TILE = 44;
const LABEL_LINE = 20;
const VALUE_LINE = 26;
const CHEVRON = 18;
/** Recovery's row: the icon square, iOS Settings' 29 px. */
const SQUARE = 29;

const PressableView = Animated.createAnimatedComponent(Pressable);
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

/**
 * Recovery's row, as an inset grouped list row in Apple Health's "What shaped it": the coloured icon square (`color`,
 * a system colour, the glyph white), the name with today's reading against your normal under it in the tone's colour
 * (green when it helps or sits in range, orange when it costs), the value with its small grey unit and the chevron.
 * Under the name, a slim range track (your normal shaded, today the dot) and the normal range with the points it moved
 * Recovery. A wrapped name keeps the value on its first line; a press settles and dims the row on the UI thread.
 */
function RecoveryRow({ p, value, meta }: { p: Extract<ContributorRowProps, { variant: "recovery" }>; value: number | null; meta?: MetricMeta }) {
  const c = useCalm();
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { dim: 0.55 });
  const { mean, sd } = p.baseline;
  const lo = mean - 3 * sd;
  const hi = mean + 3 * sd;
  const t = value === null ? null : deltaTone(p.direction, value, mean, sd);
  const pts = value === null ? null : p.points;
  const unit = p.unit ? (isSymbolUnit(p.unit) ? p.unit : `${NBSP}${p.unit}`) : "";
  const unitSpoken = (v: number) => spoken(formatValue(p.format, v), p.unit);
  const span = (v: number) => formatValue(p.format, v).replace(/^\+/, "");
  // Today against the normal, in words: inside ±1 σ "In your normal range", else how far above or below the mean.
  const diff = value === null ? 0 : value - mean;
  const away = value === null ? "" : `${formatValue(p.format, Math.abs(diff)).replace(/^[+−-]/, "")}${unit} ${diff > 0 ? "above" : "below"} your normal`;
  const said = value === null ? (p.reasonCopy ?? "Not measured: left out of today’s score") : t?.dir === "flat" ? "In your normal range" : away;
  // Green when it helps or sits in range, orange when it costs; outside the range of a signal with no good direction
  // (breathing rate), the plain grey (the dot in ink).
  const tone = value === null ? c.sub : t?.tone === "bad" ? c.system.orange : t?.tone === "good" || t?.dir === "flat" ? c.tintInk.mint : c.sub;
  const dot = tone === c.sub ? c.ink : tone;
  const normal = `Normal ${span(mean - sd)}–${span(mean + sd)}${unit}`;
  const moved = pts === null ? "" : pts === 0 ? " · no change" : ` · ${formatValue("signedInt", pts)}${NBSP}pts`;
  const sentence =
    value === null
      ? `${p.label}: ${said}`
      : `${p.label} ${unitSpoken(value)}, ${value > mean + sd ? "above" : value < mean - sd ? "below" : "within"} your normal range of ${formatValue(p.format, mean - sd)} to ${formatValue(p.format, mean + sd)}${pts === null ? "" : pts === 0 ? ", no change" : `, ${pts > 0 ? "added" : "took off"} ${Math.abs(Math.round(pts))} points`}`;
  const square = p.color ?? c.tintInk.mint;
  const body = (
    <>
      {p.icon && (
        <View style={{ width: SQUARE, height: SQUARE, borderRadius: iconRadius(SQUARE), backgroundColor: square, alignItems: "center", justifyContent: "center", marginTop: onBand(LABEL_LINE, SQUARE) + 1 }}>
          {recolorIcon(p.icon, "#ffffff", 18)}
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            {/* Wraps, never clamps: "Respiratory rate" keeps its value beside its first line. */}
            <Txt size={16} lineHeight={LABEL_LINE} style={{ color: c.ink }}>
              {p.label}
            </Txt>
            <Txt size={13} lineHeight={18} weight={value === null ? 400 : 500} style={{ color: tone, fontVariant: ["tabular-nums"] }}>
              {said}
            </Txt>
          </View>
          <View style={{ flexShrink: 0, maxWidth: "45%", flexDirection: "row", alignItems: "center", gap: 6, marginTop: onBand(LABEL_LINE, VALUE_LINE) + 6 }}>
            <ValueUnit value={formatValue(p.format, value)} unit={p.unit} role="value" size={20} lineHeight={VALUE_LINE} color={value === null ? c.faint : c.ink} style={{ textAlign: "right" }} />
            <ChevronSlot shown={!!p.onPress} size={CHEVRON} />
          </View>
        </View>
        {value !== null && (
          <View style={{ marginTop: 9, marginRight: CHEVRON + 6, gap: 7 }}>
            <RangeTrack value={frac(value, lo, hi)} color={dot} range={[frac(mean - sd, lo, hi), frac(mean + sd, lo, hi)]} rangeColor={alpha(c.ink, 0.13)} height={4} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <Txt size={12} lineHeight={16} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
                {normal}
                {/* What it did to the score is the point of the row: bold, green when it added, orange when it took off. */}
                {moved ? (
                  <Txt size={13} lineHeight={16} weight={700} style={{ color: pts === null || pts === 0 ? c.sub : pts > 0 ? c.tintInk.mint : c.system.orange }}>
                    {moved}
                  </Txt>
                ) : null}
              </Txt>
              {meta && <MetricTags provisional={meta.provisional} tags={meta.tags} />}
            </View>
          </View>
        )}
      </View>
    </>
  );
  const box = [{ flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 12 }, p.style];
  // With a detail to open, the whole row is the button.
  if (p.onPress)
    return (
      <PressableView onPress={p.onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={`${sentence}. Opens its history`} style={[box, pressed]}>
        {body}
      </PressableView>
    );
  return (
    <View accessible accessibilityLabel={sentence} style={box}>
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

/** The row's loading shape in its real box: `icon` is the icon's size (none: no icon), the lines under it in the name's column. */
export function ContributorRowSkeleton({ variant = "recovery", icon }: { variant?: ContributorRowProps["variant"]; icon?: number }) {
  const c = useCalm();
  if (variant === "recovery")
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 12 }}>
        {icon ? <Skeleton radius={iconRadius(SQUARE)} style={{ width: SQUARE, height: SQUARE, marginTop: onBand(LABEL_LINE, SQUARE) + 1 }} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View style={{ flex: 1, gap: 1 }}>
              <SkeletonText role="body" size={16} lineHeight={LABEL_LINE} width={144} />
              <SkeletonText role="caption" size={13} lineHeight={18} width={120} />
            </View>
            <SkeletonText role="value" size={20} lineHeight={VALUE_LINE} chars={5} style={{ marginTop: onBand(LABEL_LINE, VALUE_LINE) + 6 }} />
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: c.line, marginRight: CHEVRON + 6 }} />
          <SkeletonText role="caption" size={12} lineHeight={16} width={112} />
        </View>
      </View>
    );
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
        <View style={{ marginVertical: 3 }}>{track}</View>
        <SkeletonText role="caption" />
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
