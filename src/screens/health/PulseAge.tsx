// Halo Age's hero, as the design draws it, shared by the Health tab and the Halo Age screen: a card washed from the
// family's soft fill into the card colour, the age large in a gradient (green into teal while you are younger than your
// age or level with it, orange into red once older) with "years" small beside it, what it means in a sentence, the age
// scale (your real age and the Halo Age on one capsule of years), then the pace pills (Pace of Aging and the change
// since last week) and any notes. The Pace of Aging ruler is shared too.
import * as React from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Hourglass, Rabbit, Turtle } from "lucide-react-native";
import { AGE_LABEL, formatValue, MISSING } from "@/lib/format";
import type { Metric, ReasonCode } from "@/lib/reasons";
import { ReasonPlaceholder, Skeleton, SkeletonText, TickScale, Txt } from "@/ui";
import { useCalm, type CalmPalette, type CalmTint } from "@/ui/calm";
import { Card } from "@/ui/components/Card";
import { softFill } from "@/ui/components/calmKit";
import { font } from "@/ui/fonts";
import { AgeRuler } from "./AgeRuler";
import { ageDelta } from "./format";
import { GradientNumber } from "./GradientNumber";
import { CardHead } from "./kit";

/** Older than your age (after rounding to a tenth) reads in orange; younger or level in green. */
function pulseAgeTint(deltaYears: number | null | undefined): CalmTint {
  return deltaYears != null && formatValue("decimal1", Math.abs(deltaYears)) !== "0.0" && deltaYears > 0 ? "peach" : "mint";
}

/** The hero's colours for a tint: the sentence's ink, the number's gradient and the scale knob's ring. */
function heroInk(c: CalmPalette, tint: CalmTint) {
  const older = tint === "peach";
  return { ink: c.tintInk[tint], gradient: (older ? [c.system.orange, c.system.red] : [c.system.green, c.system.teal]) as [string, string] };
}

/** One of the hero's two pills: a grey label over a value in its colour. */
export type AgePill = { label: string; value: string; color?: string; spoken?: string };

/** The Pace of Aging pill: "0.7×", green under 1.0x (aging slower), orange over it, ink level; a dash before it shows. */
export function pacePill(c: CalmPalette, pace: number | null): AgePill {
  if (pace === null) return { label: "Pace of aging", value: MISSING, color: c.faint, spoken: "not yet" };
  const text = formatValue("decimal1", pace);
  return { label: "Pace of aging", value: `${text}×`, color: pace < 1 ? c.tintInk.mint : pace > 1 ? c.tintInk.peach : c.ink, spoken: `${text} x` };
}

/** The pills under the scale, side by side (one fills the row): the card's quiet fill, 14 px corners. */
function Pills({ pills, spoken }: { pills: AgePill[]; spoken: boolean }) {
  const c = useCalm();
  if (!pills.length) return null;
  return (
    <View importantForAccessibility={spoken ? "auto" : "no-hide-descendants"} style={{ flexDirection: "row", gap: 8 }}>
      {pills.map((p) => (
        <View key={p.label} accessible={spoken} accessibilityLabel={`${p.label}: ${p.spoken ?? p.value}`} style={{ flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: softFill(c, "card"), paddingHorizontal: 12, paddingVertical: 10 }}>
          <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
            {p.label}
          </Txt>
          <Txt size={20} lineHeight={25} style={[font.numberAt(20), { color: p.color ?? c.ink }]}>
            {p.value}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** The card's wash: the family's soft fill at its top left, fading into the card colour by halfway down. */
function Wash({ tint }: { tint: CalmTint }) {
  const c = useCalm();
  return <LinearGradient pointerEvents="none" colors={[c.tint[tint], c.card]} locations={[0, 0.55]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />;
}

export type HaloAgeHeroProps = {
  age: number | null;
  deltaYears: number | null;
  provisional?: boolean;
  reason?: ReasonCode | null;
  /** Your age in years (the Halo Age screen); the Health tab works it out from the gap. */
  yourAge?: number | null;
  /** What to say when there is no Halo Age yet. */
  emptyCopy?: string;
  pills?: AgePill[];
  /** The Health tab: the card's head (glyph, name, "Weekly", chevron) and the whole card one button. */
  onPress?: () => void;
  /** With `onPress`: what the card's notes say, added to its spoken label (the card speaks as one button). */
  spokenExtra?: string | null;
  children?: React.ReactNode;
};

export function HaloAgeHero({ age, deltaYears, provisional = false, reason, yourAge, emptyCopy = "Healthspan needs 20 days of data.", pills = [], onPress, spokenExtra, children }: HaloAgeHeroProps) {
  const c = useCalm();
  const has = age !== null && deltaYears !== null;
  const tint = pulseAgeTint(has ? deltaYears : null);
  const { ink, gradient } = heroInk(c, tint);
  const d = has ? ageDelta(deltaYears) : null;
  // Your real age is the Halo Age less its gap when the caller doesn't pass it (the Health tab).
  const realAge = has ? (yourAge ?? age - deltaYears) : null;
  const same = !!d && d.text === "Same as your age";
  const sentence = d ? (same ? d.text : `${d.text} than your age`) : emptyCopy;
  const spokenAge = has ? `${AGE_LABEL} ${formatValue("decimal1", age)} years, ${same ? "same as your age" : `${d!.text} than your age`}${provisional ? ", provisional" : ""}` : `${AGE_LABEL} unavailable. ${emptyCopy}`;
  return (
    <Card onPress={onPress} padding={0} accessibilityLabel={onPress ? `${spokenAge}.${spokenExtra ? ` ${spokenExtra}.` : ""} Open Healthspan` : undefined}>
      <Wash tint={tint} />
      <View style={{ paddingHorizontal: 16, paddingTop: onPress ? 14 : 20, paddingBottom: 18, gap: 14 }}>
        {onPress ? <CardHead tint={tint} icon={Hourglass} title={AGE_LABEL} when="Weekly" chevron /> : null}
        <View accessible={!onPress} accessibilityLabel={spokenAge} style={{ gap: 2 }}>
          {has ? (
            <View style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", columnGap: 8 }}>
              <GradientNumber text={formatValue("decimal1", age)} size={64} colors={gradient} />
              {/* On the number's baseline: Inter's sits about 12 px above the foot of the number's 70 px line. */}
              <Txt size={17} lineHeight={22} weight={600} style={{ color: c.sub, marginBottom: 7 }}>
                years
              </Txt>
            </View>
          ) : (
            <Txt size={64} lineHeight={70} style={[font.numberAt(64), { color: c.faint }]}>
              {MISSING}
            </Txt>
          )}
          <Txt size={17} lineHeight={22} weight={600} style={{ color: d && !same ? ink : c.sub }}>
            {sentence}
          </Txt>
        </View>
        {/* On the Health tab the card is one button whose label says all of this; elsewhere each part speaks for itself. */}
        {has && <AgeRuler age={realAge!} pulseAge={age!} color={c.system[tint === "peach" ? "orange" : "green"]} spoken={!onPress} />}
        {!has && reason && <ReasonPlaceholder reason={reason} size="sm" />}
        {has && <Pills pills={pills} spoken={!onPress} />}
        {children}
      </View>
    </Card>
  );
}

/** The hero's loading shape: the same card with bars where the age, the sentence, the scale and the pills go. */
export function HaloAgeHeroSkeleton({ head = false, children }: { head?: boolean; children?: React.ReactNode }) {
  const c = useCalm();
  return (
    <Card padding={0}>
      <Wash tint="mint" />
      <View importantForAccessibility="no-hide-descendants" style={{ paddingHorizontal: 16, paddingTop: head ? 14 : 20, paddingBottom: 18, gap: 14 }}>
        {head ? <CardHead tint="mint" icon={Hourglass} title={AGE_LABEL} when="Weekly" chevron /> : null}
        <View style={{ gap: 2 }}>
          <SkeletonText role="valueHero" size={64} lineHeight={70} chars={4} />
          <SkeletonText role="headline" width={220} />
        </View>
        {/* The scale's box (its marker row, year labels and legend), the track where the real one runs. */}
        <View style={{ height: 76 }}>
          <Skeleton radius={4} style={{ height: 8, marginTop: 14 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[0, 1].map((i) => (
            <View key={i} style={{ flex: 1, height: 63, borderRadius: 14, backgroundColor: softFill(c, "card") }} />
          ))}
        </View>
        {children}
      </View>
    </Card>
  );
}

/** The Pace of Aging ruler, −1.0x to 3.0x, slow (turtle, green) to fast (rabbit, red). */
export function PaceScale({ pace }: { pace: Metric<number> }) {
  const c = useCalm();
  const v = pace.value;
  return (
    <TickScale
      variant="marker"
      label="Pace of Aging"
      metric={pace}
      min={-1}
      max={3}
      format="decimal1"
      unit="x"
      describe={v == null ? undefined : v < 1 ? "aging slower than your 6-month average" : v > 1 ? "aging faster than your 6-month average" : "aging at the normal rate"}
      ends={["−1.0x", "1.0x", "3.0x"]}
      colors={[c.system.green, c.system.yellow, c.system.red]}
      leading={
        <>
          <Turtle size={18} color={c.sub} strokeWidth={1.75} />
          <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
            Slow
          </Txt>
        </>
      }
      trailing={
        <>
          <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
            Fast
          </Txt>
          <Rabbit size={18} color={c.sub} strokeWidth={1.75} />
        </>
      }
    />
  );
}
