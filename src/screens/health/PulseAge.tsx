// Pulse Age in the Calm style, shared by the Health hub and the Healthspan screen: a pastel card (mint while you are
// younger than your age or level with it, sand once older) with the age large in the card's ink, what it means in a
// sentence across the card, the orb (always moving) with the Pulse Age and its gap inside it, then the age ruler: your
// real age and the Pulse Age on one scale of years, the gap between them filled in. The Pace of Aging ruler is shared too.
import * as React from "react";
import { View } from "react-native";
import { Hourglass, Rabbit, Turtle } from "lucide-react-native";
import { AGE_LABEL, formatValue, MISSING } from "@/lib/format";
import type { Metric, ReasonCode } from "@/lib/reasons";
import { ReasonPlaceholder, SkeletonText, TickScale, Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { CalmCard, Caption, Num } from "@/screens/detail/calmKit";
import { AgeOrb } from "./AgeOrb";
import { AgeRuler } from "./AgeRuler";
import { ageDelta } from "./format";

/** Older than your age (after rounding to a tenth) reads in sand; younger or level in mint. */
export function pulseAgeTint(deltaYears: number | null | undefined): CalmTint {
  return deltaYears != null && formatValue("decimal1", Math.abs(deltaYears)) !== "0.0" && deltaYears > 0 ? "sand" : "mint";
}

export type PulseAgeHeroProps = {
  age: number | null;
  deltaYears: number | null;
  provisional?: boolean;
  reason?: ReasonCode | null;
  /** Your age in years: shown under the Pulse Age (Healthspan). */
  yourAge?: number | null;
  /** What to say when there is no Pulse Age yet. */
  emptyCopy?: string;
  orbSize?: number;
  onPress?: () => void;
  /** With `onPress`: what the card's children say, added to the card's spoken label (the card speaks as one button). */
  spokenExtra?: string | null;
  children?: React.ReactNode;
};

export function PulseAgeHero({ age, deltaYears, provisional = false, reason, yourAge, emptyCopy = "Healthspan needs 20 days of data.", orbSize = 280, onPress, spokenExtra, children }: PulseAgeHeroProps) {
  const c = useCalm();
  const has = age !== null && deltaYears !== null;
  const tint = pulseAgeTint(has ? deltaYears : null);
  const ink = c.tintInk[tint];
  const d = has ? ageDelta(deltaYears) : null;
  // Your real age is the Pulse Age less its gap when the caller doesn't pass it (the Health hub).
  const realAge = has ? (yourAge ?? age - deltaYears) : null;
  const same = !!d && d.text === "Same as your age";
  const sentence = d ? (same ? d.text : `${d.text} than your age`) : emptyCopy;
  const spokenAge = has
    ? `${AGE_LABEL} ${formatValue("decimal1", age)}, ${same ? "same as your age" : `${d!.text} than your age`}${provisional ? ", provisional" : ""}`
    : `${AGE_LABEL} unavailable. ${emptyCopy}`;
  return (
    <CalmCard
      tint={tint}
      icon={Hourglass}
      title={AGE_LABEL}
      subtitle={sentence}
      subtitleColor={d && !same ? ink : undefined}
      onPress={onPress}
      accessibilityLabel={onPress ? `${spokenAge}.${spokenExtra ? ` ${spokenExtra}.` : ""} Open Healthspan` : undefined}
      style={{ alignSelf: "stretch" }}
    >
      <View accessible={!onPress} accessibilityLabel={spokenAge} style={{ gap: 16 }}>
        {has ? (
          // The orb, always moving, with the Pulse Age and its gap to your age on its core.
          <View style={{ alignItems: "center" }}>
            <AgeOrb age={age} deltaYears={deltaYears} provisional={provisional} size={orbSize} reason={reason} />
          </View>
        ) : (
          <View>
            <Num value={MISSING} size={56} color={c.faint} />
            <Caption style={{ marginTop: 4 }}>{`${AGE_LABEL} in years`}</Caption>
          </View>
        )}
        {has && <AgeRuler age={realAge!} pulseAge={age!} ink={ink} />}
        {!has && reason && <ReasonPlaceholder reason={reason} size="sm" />}
      </View>
      {children}
    </CalmCard>
  );
}

/** The hero's loading shape: the same mint card, with bars for the numbers. */
export function PulseAgeHeroSkeleton({ orbSize = 280, children }: { orbSize?: number; children?: React.ReactNode }) {
  const c = useCalm();
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ alignSelf: "stretch", borderRadius: 32, borderWidth: 1, borderColor: c.tintEdge.mint, backgroundColor: c.tint.mint, padding: 20, gap: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.chip, alignItems: "center", justifyContent: "center" }}>
          <Hourglass size={22} color={c.tintInk.mint} strokeWidth={1.75} />
        </View>
        <Txt size={17} lineHeight={22} weight={600} style={{ color: c.ink }}>
          {AGE_LABEL}
        </Txt>
      </View>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: orbSize * 0.78, height: orbSize * 0.78, margin: orbSize * 0.11, borderRadius: orbSize, backgroundColor: c.chip, opacity: 0.6, alignItems: "center", justifyContent: "center" }}>
          <SkeletonText role="value" size={40} lineHeight={46} chars={4} />
        </View>
      </View>
      {children}
    </View>
  );
}

/** The Pace of Aging ruler, −1.0x to 3.0x, slow (turtle) to fast (rabbit). */
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
