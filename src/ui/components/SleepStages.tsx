import * as React from "react";
import { Pressable, View } from "react-native";
import { DATA_COLORS, deltaTone, GOOD_DIRECTION } from "@/lib/bands";
import { clock, durationWords, hmm, statSentence } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { Caption } from "./calmKit";
import { EmptyState } from "./EmptyState";
import { Hatch } from "./Hatch";
import { HypnogramChart } from "./Hypnogram";
import { MetricState } from "./MetricState";
import { DeltaMark } from "./primitives";
import { ReasonPlaceholder } from "./ReasonPlaceholder";
import { Skeleton, SkeletonText } from "./Skeleton";
import { SleepHrChart, SleepHrChartSkeleton, type SleepHr } from "./SleepHrChart";
import { Txt } from "./Text";
import { ToggleGroup } from "./ToggleGroup";

type Stage = "awake" | "rem" | "light" | "deep";
export type SleepStagesNight = {
  bed: number;
  wake: number;
  segments: { stage: Stage; start: number; end: number }[];
  rows: { stage: Stage; label: string; pct: number; minutes: number; typical: [number, number] }[];
};
/** Time asleep in the main sleep and the prior 30 nights' mean, minutes. */
export type SleepHours = { asleepMin: number; average: number | null; sd?: number };

export type SleepStagesProps = {
  /** The hero: no value means no night, and the whole card shows the reason. */
  hours: Metric<SleepHours> | undefined;
  hr: Metric<SleepHr> | undefined;
  /** null: a night Fitbit did not stage. */
  data: Metric<SleepStagesNight> | null | undefined;
  timeZone?: string;
  /** A tap on the night's heart rate or hypnogram opens the chart explorer on the night. */
  onExpand?: () => void;
};

// The reference app's order, top to bottom.
const ORDER: Stage[] = ["awake", "light", "deep", "rem"];
const EMPTY = "No stage data for this night. Fitbit only stages sleeps longer than about 3 hours.";

/** "Hours of sleep": time asleep, the arrow against the prior 30 nights and their mean under it. */
function HoursHero({ h }: { h: SleepHours }) {
  const t = h.average === null ? undefined : deltaTone(GOOD_DIRECTION.hours, h.asleepMin, h.average, h.sd);
  const sentence = statSentence({ label: "Hours of sleep", valueText: durationWords(h.asleepMin), averageText: h.average === null ? undefined : durationWords(h.average), dir: t?.dir, tone: t?.tone });
  const c = useCalm();
  // The number first in the sleep ink, the caps caption under it, then the 30 nights' mean it is set against.
  return (
    <View accessibilityLabel={sentence}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Txt size={34} lineHeight={38} style={[font.numberAt(34), { color: c.tintInk.lavender }]}>
          {hmm(h.asleepMin)}
        </Txt>
        <View style={{ width: 8, alignSelf: "flex-start", marginTop: 10 }}>{t && <DeltaMark dir={t.dir} tone={t.tone} />}</View>
      </View>
      <Caption style={{ marginTop: 2 }}>Hours of sleep</Caption>
      {h.average !== null && (
        <Txt size={12} lineHeight={16} style={[font.numeric(500), { color: c.faint, marginTop: 4 }]}>
          {`30-night avg ${hmm(h.average)}`}
        </Txt>
      )}
    </View>
  );
}

/** WHOOP's stage names; Fitbit's "Deep" is slow-wave sleep. */
const ROW_LABEL: Record<Stage, string> = { awake: "Awake", light: "Light", deep: "SWS (Deep)", rem: "REM" };
const TABS = [
  { value: "breakdown", label: "Breakdown" },
  { value: "timeline", label: "Timeline" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** The numbers' columns, right-aligned so each row's time and share sit under the last row's. */
const TIME_W = 56;
const SHARE_W = 46;
const RADIO = 24;
/** The track and the typical band around it. */
const TRACK_H = 8;
const BAND_H = 18;

/** Where a share sits against its typical range, in words. */
function against(pct: number, [lo, hi]: [number, number]): string {
  const p = Math.round(pct);
  return p < lo ? "below range" : p > hi ? "above range" : "in range";
}

/**
 * The typical range as each track draws it: a soft band a little taller than the track with a crisp tick at each end
 * (`width`/`height` for the legend's swatch).
 */
function RangeMark({ width, height }: { width: number; height: number }) {
  const c = useCalm();
  return (
    <View style={{ width, height, borderRadius: 4, backgroundColor: alpha(c.ink, 0.08), borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: alpha(c.ink, 0.4) }} />
  );
}

/** A stage's share of the night on a capsule track, its typical range a soft band with crisp ends over it. */
function StageTrack({ pct, typical, fill }: { pct: number; typical: [number, number]; fill: string }) {
  const c = useCalm();
  const [lo, hi] = typical;
  return (
    <View style={{ height: BAND_H, justifyContent: "center" }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: `${lo}%`, width: `${hi - lo}%`, borderRadius: 4, backgroundColor: alpha(c.ink, 0.07) }} />
      <Hatch height={TRACK_H}>
        <View style={{ position: "absolute", top: 0, bottom: 0, left: `${lo}%`, width: `${hi - lo}%`, backgroundColor: alpha(c.ink, 0.1) }} />
        <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: TRACK_H / 2, width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: fill }} />
      </Hatch>
      {/* The range's two ends over everything, so they read even where the share's fill runs through them. */}
      {[lo, hi].map((v) => (
        <View key={v} style={{ position: "absolute", top: 0, bottom: 0, left: `${v}%`, width: 1.5, marginLeft: -0.75, borderRadius: 0.75, backgroundColor: alpha(c.ink, 0.45) }} />
      ))}
    </View>
  );
}

function Rows({ night, selected, onSelect, timeZone, onExpand }: { night: SleepStagesNight; selected: Stage; onSelect: (s: Stage) => void; timeZone?: string; onExpand?: () => void }) {
  const { c } = useTheme();
  const calm = useCalm();
  const [tab, setTab] = React.useState<Tab>("breakdown");
  const span = Math.max(1, night.wake - night.bed);
  const rows = ORDER.map((s) => night.rows.find((r) => r.stage === s)).filter((r): r is SleepStagesNight["rows"][number] => !!r);

  return (
    <View style={{ gap: 16 }}>
      {/* One view at a time: the stage breakdown (rows) or the night's timeline (the hypnogram). */}
      <ToggleGroup value={tab} onChange={setTab} items={TABS} font="caps" fill accessibilityLabel="Stages view" />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {tab === "breakdown" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <RangeMark width={18} height={12} />
            <Txt size={13} lineHeight={18} weight={500} color={calm.sub}>
              Typical range
            </Txt>
          </View>
        ) : (
          <Txt size={13} lineHeight={18} weight={500} color={calm.sub}>
            {`${clock(night.bed, timeZone)} – ${clock(night.wake, timeZone)}`}
          </Txt>
        )}
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Caption>Duration</Caption>
          <Txt size={18} lineHeight={22} style={[font.numeric(700), { color: calm.ink }]}>
            {hmm(span / 60_000)}
          </Txt>
        </View>
      </View>
      {tab === "timeline" ? (
        <HypnogramChart night={night} timeZone={timeZone} onPress={onExpand} />
      ) : (
        // Choosing a stage lights its stretches on the heart-rate line above.
        <View style={{ gap: 18, paddingTop: 2 }} accessibilityRole="radiogroup" accessibilityLabel="Highlight a sleep stage">
          {/* The columns' names over the numbers, so a time never reads as a share. */}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: -8 }} importantForAccessibility="no-hide-descendants">
            <Caption style={{ width: TIME_W, textAlign: "right" }}>Time</Caption>
            <Caption style={{ width: SHARE_W, textAlign: "right" }}>Share</Caption>
          </View>
          {rows.map((r) => {
            const on = r.stage === selected;
            const color = DATA_COLORS[`stage-${r.stage}`];
            const status = against(r.pct, r.typical);
            return (
              <Pressable
                key={r.stage}
                onPress={() => onSelect(r.stage)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${ROW_LABEL[r.stage]}, ${hmm(r.minutes)}, ${Math.round(r.pct)} percent of the night. Typical ${r.typical[0]} to ${r.typical[1]} percent, ${status}`}
                style={{ flexDirection: "row", gap: 12 }}
              >
                {/* The radio: a grey ring, filled teal (the active colour) with a white centre when chosen. */}
                <View style={{ width: RADIO, height: 24, alignItems: "center", justifyContent: "center" }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? calm.teal : calm.faint, backgroundColor: on ? calm.teal : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {on && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: calm.card }} />}
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  {/* The stage, then its time and share right-aligned in their columns, all on one baseline. */}
                  <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                    <Txt size={15} lineHeight={24} weight={600} color={calm.ink} style={{ flex: 1, minWidth: 0 }}>
                      {ROW_LABEL[r.stage]}
                    </Txt>
                    <Txt size={20} lineHeight={24} align="right" style={[font.numeric(700), { color: calm.ink, width: TIME_W }]}>
                      {hmm(r.minutes)}
                    </Txt>
                    <Txt size={15} lineHeight={24} align="right" style={[font.numeric(700), { color: c[color.text], width: SHARE_W }]}>
                      {`${Math.round(r.pct)}%`}
                    </Txt>
                  </View>
                  <StageTrack pct={r.pct} typical={r.typical} fill={c[color.fill]} />
                  <Txt size={12} lineHeight={16} color={calm.sub} style={font.numeric(500)}>
                    {`Typical ${r.typical[0]}–${r.typical[1]}% · ${status}`}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * The "Last night's sleep" card (spec §7.5): the hours hero, the overnight heart rate, then the stages as a
 * breakdown (rows) or a timeline (hypnogram). Choosing a stage row lights its stretches on the heart-rate line.
 */
export function SleepStages({ hours, hr, data, timeZone, onExpand }: SleepStagesProps) {
  const c = useCalm();
  const [selected, setSelected] = React.useState<Stage>("awake");
  const segments = data?.value?.segments;
  const highlight = React.useMemo(() => (segments?.length ? segments.filter((g) => g.stage === selected) : undefined), [segments, selected]);
  return (
    <MetricState metric={hours} skeleton={<SleepStagesSkeleton />} renderReason={(r, meta) => <ReasonPlaceholder reason={r} nightsLeft={meta.nightsLeft} size="md" />}>
      {(h) => (
        <View style={{ gap: 16 }}>
          <HoursHero h={h} />
          <SleepHrChart data={hr} highlight={highlight} highlightLabel={highlight ? ROW_LABEL[selected] : undefined} timeZone={timeZone} onPress={onExpand} />
          <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16 }}>
            <MetricState metric={data} skeleton={<StageRowsSkeleton />} empty={<EmptyState body={EMPTY} />} renderReason={(r) => <ReasonPlaceholder reason={r} size="md" />}>
              {(night) => (night.segments.length ? <Rows night={night} selected={selected} onSelect={setSelected} timeZone={timeZone} onExpand={onExpand} /> : <EmptyState body={EMPTY} />)}
            </MetricState>
          </View>
        </View>
      )}
    </MetricState>
  );
}

function StageRowsSkeleton() {
  const c = useCalm();
  return (
    <View style={{ gap: 16 }}>
      <Skeleton radius={22} style={{ height: 44 }} />
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Txt size={13} lineHeight={18} weight={500} color={c.sub}>
          Typical range
        </Txt>
        <SkeletonText role="valueSm" size={18} lineHeight={22} width={96} />
      </View>
      {["Awake", "Light", "SWS (Deep)", "REM"].map((l) => (
        <View key={l} style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: RADIO, height: 24, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.line }} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Txt size={15} lineHeight={24} weight={600} color={c.ink} style={{ flex: 1 }}>
                {l}
              </Txt>
              <SkeletonText role="value" size={20} lineHeight={24} chars={4} />
            </View>
            <View style={{ height: BAND_H, justifyContent: "center" }}>
              <Skeleton radius={TRACK_H / 2} style={{ height: TRACK_H, backgroundColor: alpha(c.line, 0.6) }} />
            </View>
            <SkeletonText role="caption" size={12} lineHeight={16} width={140} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Loading shape: the hero's label and number, the chart box, then the rows with real stage names and their tracks. */
export function SleepStagesSkeleton() {
  const c = useCalm();
  return (
    <View style={{ gap: 16 }}>
      <View>
        <SkeletonText role="valueHero" size={34} lineHeight={38} chars={4} />
        <Caption style={{ marginTop: 2 }}>Hours of sleep</Caption>
        <SkeletonText role="numericCaption" size={12} lineHeight={16} chars={10} style={{ marginTop: 4 }} />
      </View>
      <SleepHrChartSkeleton />
      <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16 }}>
        <StageRowsSkeleton />
      </View>
    </View>
  );
}
SleepStages.Skeleton = SleepStagesSkeleton;
