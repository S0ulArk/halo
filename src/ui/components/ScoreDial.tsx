import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { ChevronRight, Flame, Gauge, HeartPulse, Moon, type LucideIcon } from "lucide-react-native";
import { BAND_WORD, DATA_COLORS, dialColor, recoveryBand, STRESS_COLOR, STRESS_WORD, stressLevel, type DataColor, type RecoveryBand, type StressLevel } from "@/lib/bands";
import { dialAriaLabel, formatValue, type FormatKey } from "@/lib/format";
import { reasonCopy, type MetricTag, type ReasonCode } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { accentColor } from "@/ui/accents";
import { useCalm, type CalmTint } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import type { ColorToken, Tokens } from "@/ui/theme";
import { CalmSurface } from "./CalmSurface";
import { HaloRing, RollingNumber } from "./Halo";
import { unitSize as calmUnit } from "./calmKit";
import { CapsuleMeter, type MeterSegment } from "./CapsuleMeter";
import { MetricTags, type TagKind } from "./primitives";
import { REASON_ICON } from "./ReasonPlaceholder";
import { SkeletonText } from "./Skeleton";
import { Txt } from "./Text";
import { usePress } from "./press";

export type DialSize = "sm" | "md" | "lg";
export type DialVariant = "recovery" | "strain" | "sleep" | "stat" | "gauge";

export type ScoreDialProps = {
  variant: DialVariant;
  size: DialSize;
  /** null with a `reason` renders the reason state. */
  value: number | null;
  reason?: ReasonCode | null;
  nightsLeft?: number;
  provisional?: boolean;
  tags?: MetricTag[];
  /** Extra tags such as "so_far" (today's strain) or "estimate" (forecast). */
  extraTags?: TagKind[];
  /** Strain Target range on the 0-21 track. */
  target?: readonly [number, number] | null;
  /** Overrides the default label ("Recovery", "Strain"…). Required for `stat`. */
  label?: string;
  /** `stat` only: colour token, domain max, value format and unit. */
  color?: DataColor;
  max?: number;
  format?: FormatKey;
  unit?: string;
  /** `gauge`: "Last updated 15:05" or "Day average". */
  caption?: string;
  /** `sleep lg`: the status word ("Optimal", "Sufficient", "Poor") as the band chip. */
  status?: "poor" | "sufficient" | "optimal";
  /** Home: the whole tile becomes one tap target (the web's `href`). */
  onPress?: () => void;
  /** Loading (spec §5.19): the real label and track, bars where the numbers go. */
  loading?: boolean;
  /** The inline form: the number and a short capsule, no label or tags. `size` is ignored. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Every size is a number first, then a capsule meter (src/ui/components/CapsuleMeter) in the family or band colour.
// The lg hero's number rolls into place while a thin ring beside it draws on and the meter grows, all in step on the
// UI thread (src/ui/components/Halo.tsx).

/** The hero number: well past valueHero's 32 px, so the score reads before anything else on the screen. */
const HERO_SIZE = 56;
const HERO_LINE = 60;
/** The hero's ring, as tall as the number's line so it never adds height. */
const HERO_RING = 60;
/** The lg hero card's height, the same on every detail tab whatever optional rows it shows. */
const HERO_CARD_MIN = 228;
const METER = { lg: 12, md: 6, sm: 6, compact: 6 } as const;
const COMPACT_METER_W = 40;
const ICON: Record<DialVariant, LucideIcon> = { sleep: Moon, recovery: HeartPulse, strain: Flame, gauge: Gauge, stat: Gauge };
/** Sleep status chip colours: the same tokens as the Sleep screen's status legend. */
const STATUS_TOKEN: Record<"poor" | "sufficient" | "optimal", ColorToken> = { poor: "warning", sufficient: "foregroundSecondary", optimal: "optimal" };
const STATUS_WORD: Record<"poor" | "sufficient" | "optimal", string> = { poor: "Poor", sufficient: "Sufficient", optimal: "Optimal" };
/** Recovery's band zones on the 0-100 track (bands.ts: ≥ 67 green, 34-66 yellow, below 34 red). */
const RECOVERY_ZONE: Record<RecoveryBand, [number, number]> = { red: [0, 34], yellow: [34, 67], green: [67, 100] };
/** Stress levels on the 0-3 track (bands.ts: ≥ 2 high, ≥ 1 medium). */
const STRESS_ZONE: Record<StressLevel, [number, number]> = { low: [0, 1], medium: [1, 2], high: [2, 3] };

/** The Strain bands as "How Strain works" names them: 0-9.9 light, 10-13.9 moderate, 14-17.9 strenuous, 18-21 all out. */
function strainWord(v: number): string {
  const s = Math.round(v * 10) / 10;
  return s >= 18 ? "All out" : s >= 14 ? "Strenuous" : s >= 10 ? "Moderate" : "Light";
}

type Word = { text: string; fill: string; ink: string };
type Resolved = {
  label: string;
  max: number;
  /** Meter fill and icon chip. */
  fill: string;
  /** Text-safe version of the same colour: the md label, the chevron. */
  ink: string;
  format: FormatKey;
  text: string;
  unit?: string;
  /** The band chip. */
  word?: Word;
  /** The value's band zone, a faint stretch on the hero's track. */
  zone?: [number, number];
};

export function ScoreDial(props: ScoreDialProps) {
  const { variant, size, value, onPress, loading, compact } = props;
  const { c } = useTheme();
  const calm = useCalm();
  const lg = !compact && size === "lg";
  const gauge = variant === "gauge";
  const empty = value === null;
  const reason = empty ? reasonCopy(props.reason, props.nightsLeft) : null;
  const target = variant === "strain" ? props.target : null;

  const resolve = (c: Tokens): Resolved => {
    switch (variant) {
      case "recovery": {
        const band = value === null ? null : recoveryBand(value);
        const dc = value === null ? null : DATA_COLORS[dialColor("recovery", value)];
        const fill = dc ? c[dc.fill] : accentColor(c, "recovery");
        const ink = dc ? c[dc.text] : fill;
        return {
          label: props.label ?? "Recovery",
          max: 100,
          fill,
          ink,
          unit: "%",
          format: "int",
          text: formatValue("int", value),
          word: band ? { text: BAND_WORD[band], fill, ink } : undefined,
          zone: band ? RECOVERY_ZONE[band] : undefined,
        };
      }
      case "strain": {
        const fill = c[DATA_COLORS.strain.fill];
        const ink = c[DATA_COLORS.strain.text];
        return { label: props.label ?? "Strain", max: 21, fill, ink, format: "decimal1", text: formatValue("decimal1", value), word: value === null ? undefined : { text: strainWord(value), fill, ink } };
      }
      case "sleep": {
        const fill = c[DATA_COLORS.sleep.fill];
        const st = props.status;
        const word = st ? { text: STATUS_WORD[st], fill: c[STATUS_TOKEN[st]], ink: c[STATUS_TOKEN[st]] } : undefined;
        return { label: props.label ?? (lg ? "Sleep performance" : "Sleep"), max: 100, fill, ink: c[DATA_COLORS.sleep.text], unit: "%", format: "int", text: formatValue("int", value), word };
      }
      case "gauge": {
        const level = value === null ? null : stressLevel(value);
        const dc = level ? DATA_COLORS[STRESS_COLOR[level]] : null;
        const fill = dc ? c[dc.fill] : accentColor(c, "stress");
        const ink = dc ? c[dc.text] : fill;
        return {
          label: props.label ?? "Stress",
          max: 3,
          fill,
          ink,
          format: "decimal1",
          text: formatValue("decimal1", value),
          word: level ? { text: STRESS_WORD[level], fill, ink } : undefined,
          zone: level ? STRESS_ZONE[level] : undefined,
        };
      }
      default: {
        const dc = DATA_COLORS[props.color ?? "chart-5"];
        return { label: props.label ?? "", max: props.max ?? 100, fill: c[dc.fill], ink: c[dc.text], unit: props.unit, format: props.format ?? "int", text: formatValue(props.format ?? "int", value) };
      }
    }
  };
  const r = resolve(c);

  const aria = dialAriaLabel({
    variant,
    label: r.label,
    value,
    valueText: r.text,
    unit: r.unit,
    provisional: props.provisional,
    reasonText: reason?.long,
    bandWord: variant === "strain" || empty ? undefined : r.word?.text,
    target,
    soFar: props.extraTags?.includes("so_far"),
  });

  // --- The meter ---
  const frac = empty || loading ? null : Math.min(Math.max(value, 0), r.max) / r.max;
  const ticks: number[] = [];
  /** The track's faint stretches (the Strain Target, the value's band zone) in `fill`. */
  const segmentsIn = (fill: string): MeterSegment[] => {
    const out: MeterSegment[] = [];
    if (target) {
      const lo = Math.min(Math.max(target[0], 0), r.max);
      const hi = Math.min(Math.max(target[1], lo), r.max);
      out.push({ from: lo / r.max, to: hi / r.max, color: alpha(fill, 0.32) });
    }
    if (lg && r.zone && frac !== null) out.push({ from: r.zone[0] / r.max, to: r.zone[1] / r.max, color: alpha(fill, 0.22) });
    return out;
  };
  const segments = segmentsIn(r.fill);
  if (target) {
    const lo = Math.min(Math.max(target[0], 0), r.max);
    ticks.push(lo / r.max, Math.min(Math.max(target[1], lo), r.max) / r.max);
  }
  const meter = (height: number, width?: number) => (
    <CapsuleMeter frac={frac} color={r.fill} height={height} width={width} segments={segments} ticks={ticks} tickColor={alpha(calm.ink, 0.85)} />
  );
  // Calm: the score's family pastel (recovery by band), for the hero card and the tile's icon.
  const heroBand = variant === "recovery" && !empty ? recoveryBand(value) : null;
  const tint: CalmTint = variant === "sleep" ? "lavender" : variant === "strain" ? "peach" : variant === "recovery" ? (heroBand === "yellow" ? "sand" : heroBand === "red" ? "rose" : "mint") : variant === "gauge" ? "lavender" : "sky";

  const hasTags = !!((!empty && props.provisional) || (!empty && props.tags?.length) || props.extraTags?.length);
  const tags = !loading && hasTags && <MetricTags provisional={!empty && props.provisional} tags={empty ? undefined : props.tags} extra={props.extraTags} align={size === "sm" && !lg ? "center" : "flex-start"} />;
  // The number in the numeric face and ink; the unit small, grey and in the text face beside it.
  const numberColor = empty ? calm.faint : calm.ink;
  const number = (role: "valueXl" | "value", unitSize: number) => (
    <Txt role={role} color={numberColor} numberOfLines={1}>
      {r.text}
      {r.unit && !empty && (
        <Txt role="unit" size={unitSize} weight={500} color={calm.sub}>
          {r.unit}
        </Txt>
      )}
    </Txt>
  );

  // --- Compact: the number and a short capsule on one line ---
  if (compact)
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={aria} style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, props.style]}>
        {loading ? <SkeletonText role="value" chars={2.2} /> : number("value", 13)}
        {meter(METER.compact, COMPACT_METER_W)}
      </View>
    );

  // --- lg: the detail screen's hero block, left-aligned, full width ---
  if (lg) {
    const ReasonIcon = reason ? REASON_ICON[reason.code] : null;
    const headline = reason ? (reason.code === "no_data" ? reason.long : reason.short) : null;
    // The hero is a soft card in its family's pastel (recovery by band), the number in that pastel's ink, rolling into
    // place as the ring beside it draws on and the meter grows, with a slow breathing light across the card.
    const ink = calm.tintInk[tint];
    const HeroIcon = ICON[variant];
    const body = (
      // One height for every hero (Sleep, Activity, Recovery), with room for the tags row whether or not it's there, so
      // the tabs' first cards match: 20 + header 44 + 16 + number 60 + 14 + meter 12 + 16 + tags 26 + 20.
      <CalmSurface tint={tint} watermark={HeroIcon} gap={16} breathe style={[{ alignSelf: "stretch", width: "100%", minHeight: HERO_CARD_MIN }, !onPress && props.style]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: calm.chip, alignItems: "center", justifyContent: "center" }}>
            <HeroIcon size={22} color={ink} strokeWidth={1.75} />
          </View>
          <Txt size={17} lineHeight={22} weight={600} numberOfLines={1} style={{ flexShrink: 1, color: calm.ink }}>
            {r.label}
          </Txt>
          {gauge && props.caption && (
            <>
              <View style={{ flex: 1 }} />
              <Txt size={13} lineHeight={18} color={calm.sub} numberOfLines={2} style={{ flexShrink: 1, textAlign: "right" }}>
                {props.caption}
              </Txt>
            </>
          )}
        </View>
        <View accessible accessibilityRole="image" accessibilityLabel={aria} style={{ gap: 14 }}>
          <View style={{ minHeight: HERO_LINE, flexDirection: "row", alignItems: "center", gap: 12 }}>
            {loading ? (
              <SkeletonText role="valueHero" size={HERO_SIZE} lineHeight={HERO_LINE} chars={2.4} />
            ) : empty && headline ? (
              <View style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                {ReasonIcon && <ReasonIcon size={20} color={calm.sub} strokeWidth={1.75} />}
                <Txt size={16} lineHeight={21} weight={600} color={calm.sub} style={{ flexShrink: 1 }}>
                  {headline}
                </Txt>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                <RollingNumber text={r.text} lineHeight={HERO_LINE} style={[font.numberAt(HERO_SIZE), { color: empty ? calm.faint : ink, letterSpacing: -1 }]} />
                {r.unit && !empty && (
                  <Txt size={calmUnit(HERO_SIZE)} lineHeight={30} weight={500} style={{ color: calm.sub, marginLeft: r.unit === "%" ? 2 : 6, marginBottom: 8 }}>
                    {r.unit}
                  </Txt>
                )}
              </View>
            )}
            {!loading && !empty && r.word && <BandChip word={r.word} />}
            <View style={{ flex: 1 }} />
            {/* The score's share of its scale as a thin ring in the family's ink, drawing on with the number. */}
            <HaloRing size={HERO_RING} stroke={5} progress={frac} track={calm.chip} color={ink} colors={calm.vivid[tint]} />
          </View>
          <CapsuleMeter frac={frac} color={r.fill} height={METER.lg} segments={segments} ticks={ticks} tickColor={alpha(calm.ink, 0.85)} track={calm.chip} grow />
          {gauge && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: -8 }}>
              <Txt role="numericSmall">0.0</Txt>
              <Txt role="numericSmall">3.0</Txt>
            </View>
          )}
        </View>
        {!loading && empty && reason && reason.long !== headline && (
          <Txt size={14} lineHeight={19} color={calm.sub}>
            {reason.long}
          </Txt>
        )}
        {tags}
      </CalmSurface>
    );
    return onPress ? (
      <DialLink onPress={onPress} label={`${aria}. Open ${r.label} details`} style={props.style} bare>
        {body}
      </DialLink>
    ) : (
      body
    );
  }

  // --- sm: number, capsule, label; centred, sized to its column (Goals, the forecast, report rows) ---
  if (size === "sm") {
    const body = (
      <View style={[{ alignSelf: "stretch", minWidth: 64, alignItems: "center", gap: 6 }, !onPress && props.style]}>
        <View accessible accessibilityRole="image" accessibilityLabel={aria} style={{ alignSelf: "stretch", alignItems: "center", gap: 6 }}>
          {loading ? <SkeletonText role="value" chars={2.4} /> : number("value", 12)}
          {meter(METER.sm)}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Txt size={13} lineHeight={18} weight={500} color={calm.sub} align="center" numberOfLines={2} style={{ flexShrink: 1 }}>
            {r.label}
          </Txt>
          {onPress && <ChevronRight size={12} color={calm.faint} strokeWidth={2.5} />}
        </View>
        {tags}
      </View>
    );
    return onPress ? (
      <DialLink onPress={onPress} label={`${aria}. Open ${r.label} details`} style={props.style} bare>
        {body}
      </DialLink>
    ) : (
      body
    );
  }

  // --- md: Home's score tile, filling its column ---
  const tile = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconChip Icon={ICON[variant]} color={calm.tintInk[tint]} bg={calm.tint[tint]} size={32} />
        <Txt size={14} lineHeight={18} weight={600} color={calm.ink} numberOfLines={2} style={{ flexShrink: 1 }}>
          {r.label}
        </Txt>
        {onPress && (
          <>
            <View style={{ flex: 1 }} />
            <ChevronRight size={16} color={calm.faint} strokeWidth={2.25} />
          </>
        )}
      </View>
      <View accessible={!onPress} accessibilityRole={onPress ? undefined : "image"} accessibilityLabel={onPress ? undefined : aria} style={{ gap: 8 }}>
        {loading ? <SkeletonText role="valueXl" chars={2.2} /> : number("valueXl", 15)}
        {meter(METER.md)}
      </View>
      {gauge && !loading && (r.word || props.caption) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          {r.word && <BandChip word={r.word} small />}
          {props.caption && (
            <Txt size={13} lineHeight={18} color={calm.sub}>
              {props.caption}
            </Txt>
          )}
        </View>
      )}
      {tags}
    </>
  );
  // The card: white, soft corners, the hairline and the soft lift.
  const surface: ViewStyle = { alignSelf: "stretch", flexGrow: 1, minWidth: 0, gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 24, backgroundColor: calm.card, borderWidth: 1, borderColor: calm.edge, ...(calm.shadow ? { boxShadow: calm.shadow } : null) };
  if (onPress)
    return (
      <DialLink onPress={onPress} label={`${aria}. Open ${r.label} details`} style={[surface, props.style]} grow>
        {tile}
      </DialLink>
    );
  return <View style={[surface, props.style]}>{tile}</View>;
}

/** The family's icon on its pastel rounded square (the Calm icon tile, small). */
function IconChip({ Icon, color, bg, size }: { Icon: LucideIcon; color: string; bg: string; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.32), backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon size={Math.round(size * 0.58)} color={color} strokeWidth={2.25} />
    </View>
  );
}

/** The meaning chip: the band word in its colour on a 15 % tint of it. */
function BandChip({ word, small }: { word: Word; small?: boolean }) {
  return (
    <View style={{ minHeight: small ? 20 : 26, paddingHorizontal: small ? 8 : 10, borderRadius: 999, justifyContent: "center", backgroundColor: alpha(word.fill, 0.15), flexShrink: 1 }}>
      <Txt size={small ? 11 : 13} lineHeight={small ? 14 : 16} weight={600} color={word.ink}>
        {word.text}
      </Txt>
    </View>
  );
}

/** A tappable score: the tile (or block) scales on press, on the UI thread. `bare`: no surface of its own; `grow`: fills its column's height. */
function DialLink({ onPress, label, style, bare, grow, children }: { onPress: () => void; label: string; style?: StyleProp<ViewStyle>; bare?: boolean; grow?: boolean; children: React.ReactNode }) {
  const { animatedStyle, onPressIn, onPressOut } = usePress(bare ? 0.98 : 0.96);
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} accessibilityRole="button" accessibilityLabel={label} style={{ alignSelf: "stretch", flexGrow: grow ? 1 : 0 }}>
      <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Loading shape (spec §5.19): the score's own block with its real label and track, bars for the numbers. */
export function ScoreDialSkeleton({ size, variant = "stat", label }: { size: DialSize; variant?: DialVariant; label?: string }) {
  return <ScoreDial variant={variant} size={size} value={null} label={label} loading />;
}
ScoreDial.Skeleton = ScoreDialSkeleton;
