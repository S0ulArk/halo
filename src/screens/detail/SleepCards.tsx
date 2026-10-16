// Sleep's measure cards, ported from the web's src/app/(app)/sleep/SleepCards.tsx, in Apple Health's chart language:
// hours against need as two rounded capsule bars (the need's parts stacked, a legend list under them), the last five
// nights' bed and wake times as rounded floating bars against dashed rules with the clock on the right and the optimal
// times a dashed line, and tonight's bedtimes as an inset grouped list. Plain views and one SVG path, no chart library;
// the bars grow in once on the UI thread (a scale from their start, never a re-layout).
import * as React from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import Svg, { Line, Path } from "react-native-svg";
import { deltaTone } from "@/lib/bands";
import { clock, hmm } from "@/lib/format";
import { alpha } from "@/lib/utils";
import type { KeyStat, SleepVM } from "@/queries";
import { DeltaMark, InfoButton, ReasonPlaceholder, Txt, useTheme } from "@/ui";
import { useCalm } from "@/ui/calm";
import { font, TABULAR } from "@/ui/fonts";
import { Caption, Num, Sentence } from "./calmKit";
import { TONIGHT_INFO } from "./info";
import { ListGroup, ListRow, useGrowIn } from "./ios";

const BAR = 12;
const signed = (min: number, sign: "+" | "−") => `${sign}${hmm(Math.abs(min))}`;

/**
 * A card's headline: the percentage large in the sleep indigo with its arrow against the prior 30 nights, and their
 * mean under it as a small number with its label.
 */
function Headline({ value, stat }: { value: number; stat?: KeyStat }) {
  const c = useCalm();
  const avg = stat?.average ?? null;
  const t = avg === null ? null : deltaTone("up", value, avg, stat?.sd);
  return (
    <View accessible accessibilityLabel={`${Math.round(value)}%${avg !== null ? `, prior 30-night average ${Math.round(avg)}%` : ""}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Num value={String(Math.round(value))} unit="%" size={34} color={c.tintInk.lavender} />
        {t && <DeltaMark dir={t.dir} tone={t.tone} />}
      </View>
      {avg !== null && (
        <View style={{ marginTop: 2, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 }}>
          <Num value={String(Math.round(avg))} unit="%" size={15} color={c.sub} />
          <Caption>Prior 30-night average</Caption>
        </View>
      )}
    </View>
  );
}

/** A coloured dot, a name and a right-aligned value: the legend under a bar, as an inset list's rows. */
function Legend({ rows }: { rows: { swatch: string; label: string; value: string }[] }) {
  const c = useCalm();
  return (
    <View style={{ marginTop: 14, borderTopWidth: 0.5, borderTopColor: c.line }}>
      {rows.map((r, i) => (
        <View
          key={r.label}
          accessible
          accessibilityLabel={`${r.label} ${r.value}`}
          style={[{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 }, i > 0 && { borderTopWidth: 0.5, borderTopColor: c.line }]}
        >
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.swatch }} />
          <Txt size={15} lineHeight={20} style={{ flex: 1, color: c.ink }}>
            {r.label}
          </Txt>
          <Txt size={15} lineHeight={20} style={[TABULAR, { color: c.sub }]}>
            {r.value}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** A bar's name and value above it: "Hours of sleep 7:12". */
function BarTitle({ label, value }: { label: string; value: string }) {
  const c = useCalm();
  return (
    <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <Txt size={15} lineHeight={20} weight={600} style={{ flexShrink: 1, color: c.ink }}>
        {label}
      </Txt>
      <Txt size={17} lineHeight={22} style={[font.numberAt(17), { color: c.tintInk.lavender }]}>
        {value}
      </Txt>
    </View>
  );
}

/** A capsule that grows in from its left end (a scale on the UI thread), `index` steps after its card's first. */
function GrowBar({ index, style }: { index: number; style: object }) {
  const grow = useGrowIn(index, 140);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  return <Animated.View style={[style, { transformOrigin: "left center" }, anim]} />;
}

export function HoursVsNeed({ vm }: { vm: SleepVM }) {
  const { c } = useTheme();
  const calm = useCalm();
  const m = vm.hoursVsNeed;
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />;
  const h = m.value;
  const stat = vm.summary.find((k) => k.key === "hours");
  const scale = Math.max(h.asleepMin, h.needMin, 1);
  const pct = (min: number) => `${Math.min(100, (min / scale) * 100)}%` as const;
  const { baselineMin, strainMin, debtMin, napMin } = h.parts;
  const parts: [number, string][] = [
    [baselineMin, alpha(calm.ink, 0.55)],
    [strainMin, c.strain],
    [debtMin, alpha(calm.ink, 0.22)],
  ];
  return (
    <View>
      <Headline value={(h.asleepMin / h.needMin) * 100} stat={stat} />
      <View style={{ marginTop: 16, gap: 16 }}>
        <View>
          <BarTitle label="Hours of sleep" value={hmm(h.asleepMin)} />
          <View style={{ height: BAR, borderRadius: BAR / 2, backgroundColor: calm.fill }}>
            <GrowBar index={0} style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: pct(h.asleepMin), borderRadius: BAR / 2, backgroundColor: c.sleep }} />
            {/* Where the need ends: a hairline through the track, so a short night leaves a visible gap and a long one a visible surplus. */}
            <View style={{ position: "absolute", top: -4, bottom: -4, left: pct(h.needMin), width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: calm.ink }} />
          </View>
        </View>
        <View>
          <BarTitle label="Sleep needed" value={hmm(h.needMin)} />
          {h.calibrating ? (
            <Sentence>{`Your need settles after 7 nights. Using ${hmm(h.needMin)} until then.`}</Sentence>
          ) : (
            <View style={{ flexDirection: "row", gap: 2, width: pct(h.needMin) }}>
              {parts.map(([min, color], i) => (
                <View key={i} style={{ flexGrow: Math.max(0, min), flexBasis: 0, height: BAR, overflow: "hidden", borderRadius: BAR / 2 }}>
                  <GrowBar index={1 + i} style={{ flex: 1, borderRadius: BAR / 2, backgroundColor: color }} />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
      {!h.calibrating && (
        <Legend
          rows={[
            { swatch: alpha(calm.ink, 0.55), label: "Healthy minimum", value: hmm(baselineMin) },
            { swatch: c.strain, label: "Recent strain", value: signed(strainMin, "+") },
            { swatch: alpha(calm.ink, 0.22), label: "Sleep debt", value: signed(debtMin, "+") },
            ...(napMin > 0 ? [{ swatch: c.sleep, label: "Naps", value: signed(napMin, "−") }] : []),
          ]}
        />
      )}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Minutes from local midnight (negative = before it) as 24-hour clock text. */
const at = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/**
 * A path through the nights' optimal times (x and y in 0-100): level across each night's column, easing to the next
 * night's height between columns, from the first column's left edge to the last one's right. A missing night breaks it.
 * `sx` and `sy` scale the 0-100 box to the plot's pixels (RN has no non-scaling stroke).
 */
function optimalPath(points: ({ x: number; y: number } | null)[], sx: number, sy: number) {
  const P = (x: number, y: number) => `${(x * sx).toFixed(2)} ${(y * sy).toFixed(2)}`;
  let d = "";
  let prev: { x: number; y: number } | null = null;
  for (const p of points) {
    if (!p) {
      prev = null;
      continue;
    }
    if (!prev) d += `M${P(p.x - 9, p.y)} L${P(p.x + 4, p.y)}`;
    else {
      const mid = (prev.x + p.x) / 2;
      d += ` C${P(mid, prev.y)} ${P(mid, p.y)} ${P(p.x - 4, p.y)} L${P(p.x + 4, p.y)}`;
    }
    prev = p;
  }
  return prev ? `${d} L${P(prev.x + 9, prev.y)}` : d;
}

const PLOT_H = 208;
const LABEL_H = 16;
const AXIS_W = 40;
const NIGHT_W = 16;

/** One night's bar: a capsule from bed to wake that grows down from bedtime once (a scale on the UI thread). */
function NightBar({ index, top, height, color }: { index: number; top: number; height: number; color: string }) {
  const grow = useGrowIn(index, 140);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));
  return <Animated.View style={[{ position: "absolute", left: "50%", marginLeft: -NIGHT_W / 2, width: NIGHT_W, borderRadius: NIGHT_W / 2, top, height, backgroundColor: color, transformOrigin: "top" }, anim]} />;
}

export function SleepConsistency({ vm }: { vm: SleepVM }) {
  const { c } = useTheme();
  const calm = useCalm();
  const [width, setWidth] = React.useState(0);
  const m = vm.consistency;
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />;
  const cm = m.value;
  const nights = cm.nights.flatMap((n) => (n ? [n] : []));
  if (!nights.length) return <ReasonPlaceholder reason="no_data" size="md" />;
  const beds = nights.flatMap((n) => [n.bed, ...(n.typicalBed != null ? [n.typicalBed] : [])]);
  const wakes = nights.flatMap((n) => [n.wake, ...(n.typicalWake != null ? [n.typicalWake] : [])]);
  // Axis in 4-hour steps (19:00, 23:00, 03:00…) with room above the earliest bed and below the latest wake for last
  // night's labels.
  const lo = Math.floor((Math.min(...beds) - 60) / 240) * 240;
  const hi = Math.ceil((Math.max(...wakes) + 60) / 240) * 240;
  const pctOf = (min: number) => ((min - lo) / (hi - lo)) * 100;
  const yOf = (min: number) => (pctOf(min) / 100) * PLOT_H;
  const ticks = Array.from({ length: Math.floor((hi - lo) / 240) + 1 }, (_, i) => lo + i * 240);
  const last = cm.nights.at(-1);
  const optimal = (pick: (n: (typeof nights)[number]) => number | null) =>
    optimalPath(
      cm.nights.map((n, i) => (n && pick(n) != null ? { x: i * 20 + 10, y: pctOf(pick(n)!) } : null)),
      width / 100,
      PLOT_H / 100,
    );
  const dash = alpha(calm.ink, 0.5);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <Headline value={cm.pct} stat={vm.summary.find((k) => k.key === "consistency")} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 1, flexShrink: 1 }}>
          <Svg width={20} height={2}>
            <Line x1={0} x2={20} y1={1} y2={1} stroke={dash} strokeWidth={1.5} strokeDasharray={[3, 2]} />
          </Svg>
          <Txt size={13} lineHeight={18} style={{ flexShrink: 1, color: calm.sub }}>
            Optimal bed/wake time
          </Txt>
        </View>
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Bed and wake times for the last five nights${last ? `, last night ${at(last.bed)} to ${at(last.wake)}` : ""}`}
        style={{ marginTop: 16, flexDirection: "row", gap: 8 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ height: PLOT_H }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {/* Dashed hairline rules at the clock times, as Apple Health's grid. */}
            {width > 0 && (
              <Svg width={width} height={PLOT_H} style={{ position: "absolute", top: 0, left: 0 }} pointerEvents="none">
                {ticks.map((t) => (
                  <Line key={t} x1={0} x2={width} y1={yOf(t)} y2={yOf(t)} stroke={calm.line} strokeWidth={0.8} strokeDasharray={[2, 4]} />
                ))}
              </Svg>
            )}
            <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, flexDirection: "row" }}>
              {cm.nights.map((n, i) => (
                <View key={i} style={{ flex: 1 }}>
                  {n && <NightBar index={i} top={yOf(n.bed)} height={Math.max(0, yOf(n.wake) - yOf(n.bed))} color={i === 4 ? c.sleep : alpha(c.sleep, 0.35)} />}
                </View>
              ))}
            </View>
            {/* Each night's optimal bed and wake time, joined into one dashed line that eases from night to night. */}
            {width > 0 && (
              <Svg width={width} height={PLOT_H} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }} pointerEvents="none">
                {[optimal((n) => n.typicalBed), optimal((n) => n.typicalWake)].map((d, i) => (d ? <Path key={i} d={d} fill="none" stroke={dash} strokeWidth={1.5} strokeDasharray={[5, 4]} /> : null))}
              </Svg>
            )}
            {/* Last night's times beside its bar: bed above, wake below, clear of the dashed lines. */}
            <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, flexDirection: "row" }}>
              {cm.nights.map((n, i) => (
                <View key={i} style={{ flex: 1 }}>
                  {n && i === 4 && (
                    <>
                      <Label top={yOf(Math.min(n.bed, n.typicalBed ?? n.bed)) - LABEL_H - 4} text={at(n.bed)} />
                      <Label top={yOf(Math.max(n.wake, n.typicalWake ?? n.wake)) + 4} text={at(n.wake)} />
                    </>
                  )}
                </View>
              ))}
            </View>
          </View>
          <View style={{ marginTop: 8, flexDirection: "row" }}>
            {cm.nights.map((n, i) => (
              <Txt key={i} size={12} lineHeight={16} weight={i === 4 ? 700 : 600} align="center" style={{ flex: 1, color: i === 4 ? calm.ink : calm.sub }}>
                {n?.label ?? "·"}
              </Txt>
            ))}
          </View>
        </View>
        {/* The clock on the right, as Apple Health sets its value axis. */}
        <View style={{ height: PLOT_H, width: AXIS_W }}>
          {ticks.map((t) => (
            <Txt key={t} size={11} lineHeight={14} style={[TABULAR, { position: "absolute", left: 0, top: yOf(t) - 7, color: calm.sub }]}>
              {at(t)}
            </Txt>
          ))}
        </View>
      </View>
    </View>
  );
}

/** One of last night's times, centred on its column (wider than the column, so it never wraps). */
function Label({ top, text }: { top: number; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ position: "absolute", top, left: -24, right: -24, alignItems: "center" }}>
      <Txt size={12} lineHeight={16} weight={700} numberOfLines={1} style={[TABULAR, { color: c.sleep }]}>
        {text}
      </Txt>
    </View>
  );
}

/**
 * Tonight's bedtimes for each goal and the typical wake, worked back from the need (the planner section), as an inset
 * grouped list: each goal's share of the need under its name, its bedtime on the right in the sleep indigo; the night's
 * need and the minutes left to fall asleep in the footer.
 */
export function Planner({ vm, timeZone }: { vm: SleepVM; timeZone: string }) {
  const calm = useCalm();
  const m = vm.planner;
  const info = <InfoButton info={TONIGHT_INFO} label="Tonight’s sleep" variant="card" />;
  if (m.value === null)
    return (
      <ListGroup title="Tonight’s sleep" right={info} inset={16}>
        <View style={{ padding: 16 }}>
          <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" copy={m.reason === "calibrating" ? "Sleep Planner needs 7 nights to learn your wake time." : undefined} />
        </View>
      </ListGroup>
    );
  const plan = m.value;
  const footer = [`Need tonight ${hmm(plan.needMin)}.`, plan.latencyMin >= 1 ? `Bedtimes leave ${Math.round(plan.latencyMin)} min to fall asleep.` : null].filter(Boolean).join(" ");
  return (
    <ListGroup title="Tonight’s sleep" right={info} inset={16} footer={footer}>
      {plan.plans.map((p) => (
        <ListRow key={p.label} label={p.label} detail={`${Math.round(p.share * 100)}% of need`} value={clock(p.bedtimeAt, timeZone)} bold valueColor={calm.tintInk.lavender} accessibilityLabel={`${p.label}, ${Math.round(p.share * 100)}% of need: bedtime ${clock(p.bedtimeAt, timeZone)}`} />
      ))}
      <ListRow
        label="Typical wake"
        detail={plan.weekdayWake ? "Weekday wake time" : "Weekend wake time"}
        value={clock(plan.wakeAt, timeZone)}
        bold
        accessibilityLabel={`Typical wake, ${plan.weekdayWake ? "weekday" : "weekend"} wake time: ${clock(plan.wakeAt, timeZone)}`}
      />
    </ListGroup>
  );
}
