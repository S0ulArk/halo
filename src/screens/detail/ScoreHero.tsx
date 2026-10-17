// The score hero of Recovery, Strain and Live workout, as Apple Health's highlighted card: one big Activity ring in the
// score's colour on a card lit by a soft pool of that colour, the number rolling into place in its middle (a small grey
// unit beside it) with the band word under it in the colour, then one line that explains the day. Strain's ring runs
// 0-21 with the Strain Target a stronger stretch of its track and a tick at each end. The ring sweeps in on its
// spring, the digits roll and the glow blooms with them, all on the UI thread; Reduce motion shows the end state.
import * as React from "react";
import { View } from "react-native";
import { BAND_WORD, DATA_COLORS, recoveryBand } from "@/lib/bands";
import { dialAriaLabel, formatValue } from "@/lib/format";
import { reasonCopy, type MetricTag, type ReasonCode } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { Txt, useTheme } from "@/ui";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { ActivityRings, RING_LAND_MS, RollingNumber, type RingSegment } from "@/ui/components/Halo";
import { MetricTags, type TagKind } from "@/ui/components/primitives";
import { REASON_ICON } from "@/ui/components/ReasonPlaceholder";
import { SkeletonText } from "@/ui/components/Skeleton";
import type { Tokens } from "@/ui/theme";
import { GlowCard } from "./ios";
import { strainWord } from "./lines";

/** The ring and its stroke (Apple's tenth of the diameter), the number in its 136 px hole. */
const RING = 172;
const STROKE = 18;
const NUMBER = 54;
const NUMBER_LINE = 58;

/** A Recovery score's fill (the band's system colour) and its readable ink (yellow is a deeper amber as text on white). */
export function recoveryInks(c: Tokens, calm: CalmPalette, value: number): { fill: string; ink: string } {
  const band = recoveryBand(value);
  const fill = c[DATA_COLORS[band === "green" ? "recovery-green" : band === "yellow" ? "recovery-yellow" : "recovery-red"].fill];
  const ink = band === "green" ? calm.tintInk.mint : band === "yellow" ? calm.tintInk.sand : c.recoveryRedText;
  return { fill, ink };
}

export type ScoreHeroProps = {
  variant: "recovery" | "strain";
  value: number | null;
  reason?: ReasonCode | null;
  nightsLeft?: number;
  provisional?: boolean;
  tags?: MetricTag[];
  extraTags?: TagKind[];
  /** Strain only: the Strain Target on the 0-21 ring. */
  target?: readonly [number, number] | null;
  /** The score's name for the spoken label ("Recovery", "Day strain"). */
  label?: string;
  /** The one line under the ring that explains the day (the insight). */
  sentence?: string | null;
  loading?: boolean;
  /** More under the sentence (a small row of numbers). */
  children?: React.ReactNode;
};

export function ScoreHero({ variant, value, reason, nightsLeft, provisional, tags, extraTags, target, label, sentence, loading, children }: ScoreHeroProps) {
  const { c } = useTheme();
  const calm = useCalm();
  const strain = variant === "strain";
  const max = strain ? 21 : 100;
  const empty = value === null;
  const name = label ?? (strain ? "Strain" : "Recovery");
  const inks = strain ? { fill: c.strain, ink: calm.tintInk.peach } : value === null ? { fill: c.recoveryGreen, ink: calm.tintInk.mint } : recoveryInks(c, calm, value);
  const word = empty ? null : strain ? strainWord(value) : BAND_WORD[recoveryBand(value)];
  const text = formatValue(strain ? "decimal1" : "int", value);
  const why = empty ? reasonCopy(reason, nightsLeft) : null;
  const ReasonIcon = why ? REASON_ICON[why.code] : null;
  const frac = empty || loading ? null : Math.min(Math.max(value, 0), max) / max;
  // The Strain Target: a stronger stretch of the track with a tick at each end, over the arc.
  const segments: RingSegment[] = [];
  const ticks: number[] = [];
  if (strain && target) {
    const lo = Math.min(Math.max(target[0], 0), max);
    const hi = Math.min(Math.max(target[1], lo), max);
    segments.push({ from: lo / max, to: hi / max, color: alpha(inks.fill, 0.42) });
    ticks.push(lo / max, hi / max);
  }
  const aria = dialAriaLabel({
    variant: strain ? "strain" : "recovery",
    label: name,
    value,
    valueText: text,
    unit: strain ? undefined : "%",
    provisional,
    reasonText: why?.long,
    bandWord: strain || empty ? undefined : (word ?? undefined),
    target: strain ? target : undefined,
    soFar: extraTags?.includes("so_far"),
  });
  const glow = loading || empty ? null : inks.fill;
  return (
    <GlowCard color={glow} padding={18} gap={14} style={{ alignSelf: "stretch", alignItems: "center", paddingTop: 22 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={aria}>
        <ActivityRings size={RING} stroke={STROKE} rings={[{ progress: frac, color: inks.fill, track: alpha(inks.fill, 0.18), segments, ticks, tickColor: alpha(calm.ink, 0.85) }]}>
          {loading ? (
            <SkeletonText role="valueHero" size={NUMBER} lineHeight={NUMBER_LINE} chars={2.4} />
          ) : empty ? (
            ReasonIcon ? <ReasonIcon size={30} color={calm.faint} strokeWidth={1.75} /> : <Txt size={34} lineHeight={40} style={[font.numberAt(34), { color: calm.faint }]}>--</Txt>
          ) : (
            <View style={{ alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                <RollingNumber text={text} lineHeight={NUMBER_LINE} duration={RING_LAND_MS} style={[font.numberAt(NUMBER, 800), { color: calm.ink, letterSpacing: -1.5 }]} />
                {!strain && (
                  <Txt size={22} lineHeight={28} weight={700} style={{ color: calm.sub, marginLeft: 1, marginBottom: 8 }}>
                    %
                  </Txt>
                )}
              </View>
              {word && (
                <Txt size={15} lineHeight={20} weight={600} align="center" style={{ color: inks.ink, marginTop: -2 }}>
                  {word}
                </Txt>
              )}
            </View>
          )}
        </ActivityRings>
      </View>
      {!loading && why && (
        <View style={{ alignItems: "center", gap: 2, paddingHorizontal: 8 }}>
          <Txt size={16} lineHeight={21} weight={600} align="center" style={{ color: calm.ink }}>
            {why.code === "no_data" ? why.long : why.short}
          </Txt>
          {why.code !== "no_data" && why.long !== why.short && (
            <Txt size={15} lineHeight={20} align="center" style={{ color: calm.sub }}>
              {why.long}
            </Txt>
          )}
        </View>
      )}
      {!loading && !empty && sentence ? (
        <Txt size={15} lineHeight={20} align="center" style={{ color: calm.sub, paddingHorizontal: 8 }}>
          {sentence}
        </Txt>
      ) : null}
      {!loading && (provisional || tags?.length || extraTags?.length) ? <MetricTags provisional={!empty && provisional} tags={empty ? undefined : tags} extra={extraTags} /> : null}
      {children}
    </GlowCard>
  );
}

/** The hero's loading shape: the card, the ring's track in the score's hue and a bar where the number goes. */
export function ScoreHeroSkeleton({ variant }: { variant: "recovery" | "strain" }) {
  return <ScoreHero variant={variant} value={null} loading />;
}
