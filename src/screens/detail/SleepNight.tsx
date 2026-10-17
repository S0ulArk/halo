// Sleep's night in Apple Health's Sleep look: TIME ASLEEP over the hours and minutes (the digits roll into place, the
// units small and grey) with bed and wake under it and the 30-night average; the stages chart in a card of its own;
// the night's total in each stage as four numbers under their coloured dots; then the overnight heart rate with a
// stage list (a selection list, iOS's checkmark) whose chosen stage lights its stretches on the heart-rate line, each
// stage with its share against its typical range on a slim capsule track that grows in once.
import * as React from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { DATA_COLORS, deltaTone, GOOD_DIRECTION } from "@/lib/bands";
import { clock, durationWords, hmm, statSentence } from "@/lib/format";
import { alpha } from "@/lib/utils";
import type { SleepVM } from "@/queries";
import { DeltaMark, EmptyState, ReasonPlaceholder, Txt, useTheme } from "@/ui";
import { useCalm } from "@/ui/calm";
import { Caption } from "@/ui/components/calmKit";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { HypnogramChart, HypnogramSkeleton } from "@/ui/components/Hypnogram";
import { RollingNumber } from "@/ui/components/Halo";
import { SectionShell } from "@/ui/components/SectionShell";
import { SkeletonText } from "@/ui/components/Skeleton";
import { SleepHrChart } from "@/ui/components/SleepHrChart";
import { font, TABULAR } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { ListGroup, ListRow, useGrowIn } from "./ios";
import { nightDates } from "./lines";

type Stage = "awake" | "rem" | "light" | "deep";
type Night = NonNullable<NonNullable<SleepVM["stages"]>["value"]>;

/** Apple Health's order, top to bottom: awake, REM, light (Apple's "Core"), deep. */
const ORDER: Stage[] = ["awake", "rem", "light", "deep"];
const NAME: Record<Stage, string> = { awake: "Awake", rem: "REM", light: "Light", deep: "Deep" };
/** The breakdown's names: Fitbit's "Deep" is slow-wave sleep. */
const ROW_LABEL: Record<Stage, string> = { awake: "Awake", light: "Light", deep: "SWS (Deep)", rem: "REM" };
const NO_STAGES = "No stage data for this night. Fitbit only stages sleeps longer than about 3 hours.";

/** The big number's size and line, its units', for the rolling digits to sit on one baseline. */
const BIG = 34;
const BIG_LINE = 40;

/** "7 hr 12 min": the digits rolling into place, the units small and grey on their baseline. */
function HoursMinutes({ minutes }: { minutes: number }) {
  const c = useCalm();
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const face = [font.numberAt(BIG, 700), { color: c.ink, letterSpacing: -1 }];
  const unit = (u: string) => (
    <Txt size={17} lineHeight={22} weight={600} style={{ color: c.sub, marginLeft: 3, marginRight: 8, marginBottom: 5 }}>
      {u}
    </Txt>
  );
  return (
    <View accessible accessibilityLabel={durationWords(m)} style={{ flexDirection: "row", alignItems: "flex-end" }}>
      {h > 0 && (
        <>
          <RollingNumber text={String(h)} lineHeight={BIG_LINE} style={face} />
          {unit("hr")}
        </>
      )}
      <RollingNumber text={String(m % 60)} lineHeight={BIG_LINE} style={face} />
      {unit("min")}
    </View>
  );
}

/**
 * The night's headline on the ground, as Apple Health opens Sleep: TIME ASLEEP, the hours and minutes, bed and wake,
 * then the prior 30 nights' mean with an arrow in the tone of how tonight compares.
 */
export function TimeAsleep({ hours, stages, timeZone }: { hours: SleepVM["hours"]; stages: SleepVM["stages"]; timeZone: string }) {
  const c = useCalm();
  const h = hours.value;
  const night = stages?.value ?? null;
  const t = h && h.average !== null ? deltaTone(GOOD_DIRECTION.hours, h.asleepMin, h.average, h.sd) : null;
  const sentence = h ? statSentence({ label: "Hours of sleep", valueText: durationWords(h.asleepMin), averageText: h.average === null ? undefined : durationWords(h.average), dir: t?.dir, tone: t?.tone }) : undefined;
  return (
    <View accessibilityLabel={sentence} style={{ alignSelf: "stretch", paddingHorizontal: 4, gap: 2 }}>
      <Caption>Time asleep</Caption>
      {h ? (
        <>
          <HoursMinutes minutes={h.asleepMin} />
          {night && (
            <Txt size={15} lineHeight={20} style={[TABULAR, { color: c.sub }]}>
              {`${nightDates(night.bed, night.wake, timeZone)}, ${clock(night.bed, timeZone)} – ${clock(night.wake, timeZone)}`}
            </Txt>
          )}
          {h.average !== null && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {t && <DeltaMark dir={t.dir} tone={t.tone} />}
              <Txt size={13} lineHeight={18} style={[TABULAR, { color: c.sub }]}>
                {`30-night average ${hmm(h.average)}`}
              </Txt>
            </View>
          )}
        </>
      ) : (
        <View style={{ gap: 8 }}>
          <Txt size={BIG} lineHeight={BIG_LINE} style={[font.numberAt(BIG), { color: c.faint }]}>
            --
          </Txt>
          <ReasonPlaceholder reason={hours.reason} nightsLeft={hours.nightsLeft} size="sm" />
        </View>
      )}
    </View>
  );
}

/** The time asleep's loading shape: the caption, then bars for the number and the times. */
export function TimeAsleepSkeleton() {
  return (
    <View style={{ alignSelf: "stretch", paddingHorizontal: 4, gap: 4 }}>
      <Caption>Time asleep</Caption>
      <SkeletonText role="valueHero" size={BIG} lineHeight={BIG_LINE} chars={6} />
      <SkeletonText role="caption" size={15} lineHeight={20} chars={13} />
    </View>
  );
}

/** A stage's colour (the chart's). */
function useStageColor() {
  const { c } = useTheme();
  return React.useCallback((st: Stage) => c[DATA_COLORS[`stage-${st}`].fill], [c]);
}

/** A stage's total as Apple Health prints it: "1:38" from an hour, "22" with a small "m" under one. */
function StageTime({ minutes, size = 22 }: { minutes: number; size?: number }) {
  const c = useCalm();
  const m = Math.max(0, Math.round(minutes));
  return (
    <Txt size={size} lineHeight={size + 4} style={[font.numberAt(size, 700), { color: c.ink }]}>
      {m >= 60 ? hmm(m) : String(m)}
      {m < 60 && (
        <Txt size={13} lineHeight={size + 4} weight={600} style={{ color: c.sub }}>
          m
        </Txt>
      )}
    </Txt>
  );
}

/**
 * The night's stages: the chart in one card (a tap opens the explorer on the night), and the night's total in each
 * stage in a second, four across under their coloured dots with each stage's share of the night. Memoised: a page
 * re-render (a refresh) skips it.
 */
export const StagesCards = React.memo(function StagesCards({ stages, timeZone, onExpand }: { stages: SleepVM["stages"]; timeZone: string; onExpand: () => void }) {
  const c = useCalm();
  const color = useStageColor();
  const card = { borderRadius: 20, backgroundColor: c.card } as const;
  if (stages === null)
    return (
      <View style={[card, { padding: 16 }]}>
        <EmptyState body={NO_STAGES} />
      </View>
    );
  const night = stages.value;
  if (!night)
    return (
      <View style={[card, { padding: 16 }]}>
        <ReasonPlaceholder reason={stages.reason} nightsLeft={stages.nightsLeft} size="md" />
      </View>
    );
  if (!night.segments.length)
    return (
      <View style={[card, { padding: 16 }]}>
        <EmptyState body={NO_STAGES} />
      </View>
    );
  return (
    <View style={{ gap: 10 }}>
      <View style={[card, { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 }]}>
        <HypnogramChart night={night} timeZone={timeZone} onPress={onExpand} legend={false} />
      </View>
      <View style={[card, { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 14 }]}>
        {ORDER.map((st) => {
          const row = night.rows.find((r) => r.stage === st);
          const minutes = row?.minutes ?? 0;
          return (
            <View key={st} accessible accessibilityLabel={`${NAME[st]} ${durationWords(minutes)}${row ? `, ${Math.round(row.pct)} percent` : ""}`} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color(st) }} />
                <Txt size={13} lineHeight={18} numberOfLines={1} style={{ color: c.sub, flexShrink: 1 }}>
                  {NAME[st]}
                </Txt>
              </View>
              <StageTime minutes={minutes} />
              {row && (
                <Txt size={12} lineHeight={16} style={[TABULAR, { color: c.sub }]}>
                  {`${Math.round(row.pct)}%`}
                </Txt>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
});

/** The stages chart's loading shape. */
export function StagesCardsSkeleton() {
  const c = useCalm();
  return (
    <View style={{ borderRadius: 20, backgroundColor: c.card, padding: 12 }}>
      <HypnogramSkeleton />
    </View>
  );
}

/** Where a share sits against its typical range, in words. */
function against(pct: number, [lo, hi]: [number, number]): string {
  const p = Math.round(pct);
  return p < lo ? "below range" : p > hi ? "above range" : "in range";
}

/** A stage's share on a slim capsule track, its typical range a soft band with crisp ends; the fill grows in once. */
function StageTrack({ pct, typical, fill, index }: { pct: number; typical: [number, number]; fill: string; index: number }) {
  const c = useCalm();
  const grow = useGrowIn(index, 160);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  const [lo, hi] = typical;
  return (
    <View style={{ height: 12, justifyContent: "center", marginTop: 8 }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: `${lo}%`, width: `${hi - lo}%`, borderRadius: 3, backgroundColor: alpha(c.ink, 0.07) }} />
      <View style={{ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: c.fill }}>
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 3, width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: fill, transformOrigin: "left center" }, anim]} />
      </View>
      {[lo, hi].map((v) => (
        <View key={v} style={{ position: "absolute", top: 0, bottom: 0, left: `${v}%`, width: 1.5, marginLeft: -0.75, borderRadius: 0.75, backgroundColor: alpha(c.ink, 0.4) }} />
      ))}
    </View>
  );
}

/**
 * The overnight heart rate (a tap opens the explorer), then the stages as a selection list: each stage's time and
 * share against its typical range, and the checked one lighting its stretches on the heart-rate line above. The
 * choice is this card's own state, so a tap redraws the chart and the list alone.
 */
export const NightHeart = React.memo(function NightHeart({ hr, stages, timeZone, onExpand }: { hr: SleepVM["nightHr"]; stages: SleepVM["stages"]; timeZone: string; onExpand: () => void }) {
  const c = useCalm();
  const color = useStageColor();
  const [selected, setSelected] = React.useState<Stage>("awake");
  const night: Night | null = stages?.value && stages.value.segments.length ? stages.value : null;
  const segments = night?.segments;
  const highlight = React.useMemo(() => (segments ? segments.filter((g) => g.stage === selected) : undefined), [segments, selected]);
  const rows = night ? ORDER.flatMap((s) => night.rows.filter((r) => r.stage === s)) : [];
  return (
    <View style={{ gap: 14 }}>
      <SectionShell variant="card" title="Heart rate" accent="heart" action={<ExpandButton onPress={onExpand} />}>
        <SleepHrChart data={hr} highlight={highlight} highlightLabel={highlight ? ROW_LABEL[selected] : undefined} highlightColor={highlight ? color(selected) : undefined} timeZone={timeZone} onPress={onExpand} />
      </SectionShell>
      {night && (
        <ListGroup
          title="Stages"
          right={
            <Txt size={13} lineHeight={18} style={[TABULAR, { color: c.sub }]}>
              {`Duration ${hmm(Math.max(1, night.wake - night.bed) / 60_000)}`}
            </Txt>
          }
          inset={16 + 12 + 12}
          radioGroup="Highlight a sleep stage"
          footer="Choose a stage to light its stretches on the heart rate above. The band behind each bar is the typical range."
        >
          {rows.map((r, i) => {
            const status = against(r.pct, r.typical);
            return (
              <ListRow
                key={r.stage}
                lead={<View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color(r.stage) }} />}
                label={ROW_LABEL[r.stage]}
                detail={`Typical ${r.typical[0]}–${r.typical[1]}% · ${status}`}
                detailColor={status === "in range" ? c.tintInk.mint : c.system.orange}
                right={
                  <View style={{ alignItems: "flex-end" }}>
                    <Txt size={17} lineHeight={22} style={[font.numberAt(17, 700), { color: c.ink }]}>
                      {hmm(r.minutes)}
                    </Txt>
                    <Txt size={12} lineHeight={16} style={[TABULAR, { color: c.sub }]}>{`${Math.round(r.pct)}%`}</Txt>
                  </View>
                }
                checked={r.stage === selected}
                role="radio"
                onPress={() => {
                  if (r.stage !== selected) haptic.select();
                  setSelected(r.stage);
                }}
                accessibilityLabel={`${ROW_LABEL[r.stage]}, ${hmm(r.minutes)}, ${Math.round(r.pct)} percent of the night. Typical ${r.typical[0]} to ${r.typical[1]} percent, ${status}`}
              >
                <StageTrack pct={r.pct} typical={r.typical} fill={color(r.stage)} index={i} />
              </ListRow>
            );
          })}
        </ListGroup>
      )}
    </View>
  );
});
