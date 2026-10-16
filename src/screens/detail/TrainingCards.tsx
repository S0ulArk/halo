// The Activity tab's training cards and the Activity screen's Training Effect (version 19): Garmin-style Training
// Readiness with Recovery Time, Training Status, and a workout's Aerobic Training Effect, in Apple Fitness's look: an
// Activity ring with the score in it and the band word in its tone's colour, numbers in Inter bold with small grey
// units, each factor a slim capsule bar, Training Effect as five rounded steps lit up to the workout's level. The ring
// sweeps in on its spring and the bars grow in once, staggered, on the UI thread (scales, never a re-layout); the
// cards rise with their section (DetailScreen's Rise).
import * as React from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { clock, formatValue } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import type { TrainingEffectVM, TrainingVM } from "@/queries";
import { ReasonPlaceholder, SectionShell, Txt, type InfoContent } from "@/ui";
import { useCalm } from "@/ui/calm";
import { HaloRing } from "@/ui/components/Halo";
import { alpha } from "@/lib/utils";
import { TonePill } from "@/ui/components/Meter";
import { SOURCE_NOTE } from "./info";
import { Caption, Num, Sentence, Title, toneInk } from "./calmKit";
import { useGrowIn } from "./ios";

/** An info sheet's paragraph in the kit's body text. */
function P({ children }: { children: React.ReactNode }) {
  return <Txt role="body">{children}</Txt>;
}

export const TRAINING_READINESS_INFO: InfoContent = {
  title: "Training Readiness",
  body: (
    <>
      <P>
        How ready you are for hard training today, from 1 to 100, in the manner of Garmin’s Training Readiness. Last night’s sleep and your recovery time weigh
        most (a quarter each), then your HRV status and load ratio, then your sleep over the last 3 nights and your stress over the last 3 days. One very
        weak factor caps the score, and a very long day awake before last night takes 10 off.
      </P>
      <P>95-100 Prime, 75-94 High, 50-74 Moderate, 25-49 Low, 1-24 Poor. It is set at wake and drops after training as recovery time builds.</P>
      <P>
        Recovery time is how long until you are ready for another hard session: each workout adds hours from its Training Effect (about a day at 3.5, three at
        5), up to 96. It counts down faster during good sleep and slower in stressful hours or after a poor night.
      </P>
      <P>Garmin doesn’t publish its weights; these are Halo’s.</P>
      {SOURCE_NOTE}
    </>
  ),
};

export const TRAINING_STATUS_INFO: InfoContent = {
  title: "Training Status",
  body: (
    <>
      <P>
        What your recent training is doing, in the manner of Garmin’s Training Status: from your load ratio (Garmin’s acute against chronic load), the trend
        of Fitbit’s VO2 max over 28 days, and your HRV Status.
      </P>
      <P>
        Productive: load at your usual or above, with VO2 max rising or HRV steady. Maintaining: enough to hold fitness. Recovery: a lighter stretch.
        Peaking: fitness up while load eases. Unproductive: steady load but VO2 max falling. Overreaching: very high load that is starting to cost you.
        Strained: HRV low under load. Detraining: far below your usual load for a week.
      </P>
      <P>Fitbit’s VO2 max moves slowly, so the trend is read over 28 days, not Garmin’s 14. Needs about 3 weeks of data, and a VO2 max or an HRV Status.</P>
      {SOURCE_NOTE}
    </>
  ),
};

export const TRAINING_EFFECT_INFO: InfoContent = {
  title: "Training Effect",
  body: (
    <>
      <P>
        How much this workout improves your aerobic fitness, from 0 to 5, in the manner of Garmin’s Aerobic Training Effect. Halo estimates the session’s
        EPOC (the extra oxygen your body uses afterwards to recover) from your heart rate and VO2 max, and compares it with what your fitness and recent
        training make routine: the same run counts for less the fitter and busier you are.
      </P>
      <P>0-0.9 No benefit, 1-1.9 Minor, 2-2.9 Maintaining, 3-3.9 Improving, 4-4.9 Highly improving, 5 Overreaching.</P>
      <P>
        Garmin estimates EPOC with beat-to-beat data and constants it doesn’t publish; Halo’s comes from heart rate alone, fitted to Firstbeat’s published
        figures. There is no anaerobic Training Effect: it needs pace or power.
      </P>
      {SOURCE_NOTE}
    </>
  ),
};

/** "13 h" / "1 h 30 min" for recovery hours. */
const hoursText = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min === 60 ? `${whole + 1} h` : min ? `${whole} h ${min} min` : `${whole} h`;
};

/** A factor's colour by its value: 75+ green, 50+ blue, 25+ amber, under that red; none the track grey. */
const factorColor = (c: ReturnType<typeof useCalm>, v: number | null) => (v === null ? c.tertiary : v >= 75 ? c.tintInk.mint : v >= 50 ? c.tintInk.sky : v >= 25 ? c.tintInk.sand : c.system.red);

/** A slim capsule bar filled to `value` (0-1), growing in from its left end once, `index` steps after the first. */
function Bar({ value, color, index }: { value: number; color: string; index: number }) {
  const c = useCalm();
  const grow = useGrowIn(index, 160);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} style={{ height: 6, borderRadius: 3, backgroundColor: c.fill, overflow: "hidden" }}>
      <Animated.View style={[{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: color, transformOrigin: "left center" }, anim]} />
    </View>
  );
}

/** Training Readiness with its factors and Recovery Time (the Activity tab). */
export function TrainingReadinessCard({ vm, timeZone }: { vm: TrainingVM; timeZone: string }) {
  const c = useCalm();
  const r = vm.readiness;
  const rt = vm.recoveryTime.value;
  return (
    <SectionShell variant="card" title="Training Readiness" accent="strain" info={TRAINING_READINESS_INFO}>
      {r.value === null ? (
        <ReasonPlaceholder reason={r.reason} nightsLeft={r.nightsLeft} size="md" copy={r.reason === "calibrating" ? "Training Readiness needs a scored night and about 3 weeks of training data." : undefined} />
      ) : (
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <HaloRing size={88} progress={r.value.score / 100} stroke={9} track={alpha(toneInk(c, r.value.tone) === c.sub ? c.ink : toneInk(c, r.value.tone), 0.16)} color={toneInk(c, r.value.tone) === c.sub ? c.teal : toneInk(c, r.value.tone)}>
              <View accessible accessibilityLabel={`Training Readiness ${r.value.score} of 100, ${r.value.band}`} style={{ alignItems: "center" }}>
                <Num value={String(r.value.score)} size={26} color={c.ink} />
              </View>
            </HaloRing>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Txt size={20} lineHeight={25} weight={700} style={{ color: toneInk(c, r.value.tone) === c.sub ? c.ink : toneInk(c, r.value.tone) }}>
                {r.value.band}
              </Txt>
              {r.value.atWake !== null && vm.isToday && r.value.atWake !== r.value.score ? (
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                  <Caption>At wake</Caption>
                  <Num value={String(r.value.atWake)} size={15} color={c.sub} />
                </View>
              ) : null}
              <Sentence size={13}>{r.value.line}</Sentence>
            </View>
          </View>
          {rt && (
            <View accessible accessibilityLabel={rt.hours > 0 ? `Recovery time ${hoursText(rt.hours)}` : "Recovery time: fully recovered"} style={{ gap: 2, borderTopWidth: 0.5, borderTopColor: c.line, paddingTop: 12 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: 12 }}>
                <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
                  Recovery time
                </Txt>
                {rt.hours > 0 ? <Num value={hoursText(rt.hours)} size={20} color={c.tintInk.peach} /> : <Sentence color={c.tintInk.mint}>Recovered</Sentence>}
              </View>
              {rt.readyAt !== null && vm.isToday ? <Sentence size={13}>{`Ready for hard training around ${clock(rt.readyAt, timeZone)}${rt.hours >= 24 ? ` in ${Math.round(rt.hours / 24)} day${Math.round(rt.hours / 24) === 1 ? "" : "s"}` : ""}`}</Sentence> : null}
            </View>
          )}
          <View style={{ gap: 12, borderTopWidth: 0.5, borderTopColor: c.line, paddingTop: 12 }}>
            {r.value.factors.map((f, i) => (
              <View key={f.key} accessible accessibilityLabel={`${f.label}: ${f.value === null ? "not available" : `${f.value} of 100`}`} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
                  <Txt size={15} lineHeight={20} style={{ color: c.ink, flex: 1 }}>
                    {f.label}
                  </Txt>
                  <Num value={f.value === null ? "--" : String(f.value)} size={15} color={f.value === null ? c.faint : c.ink} />
                </View>
                <Bar value={(f.value ?? 0) / 100} color={factorColor(c, f.value)} index={i} />
              </View>
            ))}
          </View>
        </View>
      )}
    </SectionShell>
  );
}

/** Training Status: the word, what it means, and what it rests on (the Activity tab). */
export function TrainingStatusCard({ vm }: { vm: TrainingVM }) {
  const c = useCalm();
  const s = vm.status;
  return (
    <SectionShell variant="card" title="Training Status" accent="activity" info={TRAINING_STATUS_INFO}>
      {s.value === null ? (
        <ReasonPlaceholder
          reason={s.reason}
          nightsLeft={s.nightsLeft}
          size="md"
          copy={s.reason === "calibrating" ? "Training Status needs about 3 weeks of training data." : s.reason === "no_data" ? "Training Status needs a VO2 max from Fitbit or an HRV Status." : undefined}
        />
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <Txt size={22} lineHeight={28} weight={700} style={{ color: toneInk(c, s.value.tone) === c.sub ? c.ink : toneInk(c, s.value.tone) }}>
              {s.value.status}
            </Txt>
            <Sentence>{s.value.line}</Sentence>
          </View>
          {/* Two columns at most: the numbers on their own line under each label, so nothing truncates at 363 dp. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 12, borderTopWidth: 0.5, borderTopColor: c.line, paddingTop: 12 }}>
            <View style={{ width: "50%", gap: 2 }}>
              <Caption>Load ratio</Caption>
              <Num value={s.value.loadRatio === null ? "--" : formatValue("decimal2", s.value.loadRatio)} size={20} color={s.value.loadRatio === null ? c.faint : c.ink} />
            </View>
            <View style={{ width: "50%", gap: 2 }}>
              <Caption>VO2 max trend</Caption>
              <Num value={s.value.vo2PerMonth === null ? "--" : `${s.value.vo2PerMonth > 0 ? "+" : ""}${formatValue("decimal1", s.value.vo2PerMonth)}`} unit={s.value.vo2PerMonth === null ? undefined : "a month"} size={20} color={s.value.vo2PerMonth === null ? c.faint : c.ink} />
            </View>
            <View style={{ width: "50%", gap: 2 }}>
              <Caption>HRV status</Caption>
              <Sentence weight={600} color={s.value.hrv ? c.ink : c.faint}>
                {s.value.hrv ?? "Not yet"}
              </Sentence>
            </View>
          </View>
          <View style={{ flexDirection: "row" }}>
            <TonePill tone={s.value.tone}>{s.value.status}</TonePill>
          </View>
        </View>
      )}
    </SectionShell>
  );
}

/** Training Effect's five levels as rounded steps, lit in the tone's colour up to the workout's level (a part step at the top). */
function EffectSteps({ te, color }: { te: number; color: string }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.fill, overflow: "hidden" }}>
          <EffectFill share={Math.max(0, Math.min(1, te - i))} color={color} index={i} />
        </View>
      ))}
    </View>
  );
}

/** One step's light, growing in from its left once after the step before it. */
function EffectFill({ share, color, index }: { share: number; color: string; index: number }) {
  const grow = useGrowIn(index, 160, 420);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  if (share <= 0) return null;
  return <Animated.View style={[{ width: `${share * 100}%`, height: "100%", borderRadius: 4, backgroundColor: color, transformOrigin: "left center" }, anim]} />;
}

/** A workout's Aerobic Training Effect, its main benefit and the recovery time it added (the Activity screen). */
export function TrainingEffectCard({ te }: { te: TrainingEffectVM | null }) {
  const c = useCalm();
  const ink = te ? (toneInk(c, te.tone) === c.sub ? c.teal : toneInk(c, te.tone)) : c.sub;
  return (
    <SectionShell variant="card" title="Training effect" accent="activity" info={TRAINING_EFFECT_INFO}>
      {te === null ? (
        <Sentence>{reasonCopy("insufficient_hr_data").long}</Sentence>
      ) : (
        <View style={{ gap: 14 }}>
          <View accessible accessibilityLabel={`Aerobic Training Effect ${formatValue("decimal1", te.te)} of 5, ${te.label}`} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 8 }}>
            <Num value={formatValue("decimal1", te.te)} unit="of 5" size={36} color={ink} />
            <TonePill tone={te.tone}>{te.label}</TonePill>
          </View>
          <EffectSteps te={te.te} color={ink} />
          <View style={{ gap: 4, borderTopWidth: 0.5, borderTopColor: c.line, paddingTop: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8 }}>
              <Caption>Main benefit</Caption>
              <Title size={15}>{te.benefit}</Title>
            </View>
            <Sentence size={13}>{te.benefitLine}</Sentence>
          </View>
          {te.recoveryHours > 0 ? (
            <View accessible accessibilityLabel={`Adds ${hoursText(te.recoveryHours)} of recovery time`} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: 8 }}>
              <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
                Adds recovery time
              </Txt>
              <Num value={hoursText(te.recoveryHours)} size={20} color={c.tintInk.peach} />
            </View>
          ) : null}
        </View>
      )}
    </SectionShell>
  );
}
