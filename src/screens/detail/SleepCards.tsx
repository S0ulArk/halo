// Sleep's measure cards (Calm), ported from the web's src/app/(app)/sleep/SleepCards.tsx:
// hours against need as two bars, the last five nights' bed and wake times against your usual ones, and the planner's
// bedtimes. Plain views and one SVG path, no chart library.
import * as React from "react";
import { View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { deltaTone } from "@/lib/bands";
import { clock, hmm } from "@/lib/format";
import { alpha } from "@/lib/utils";
import type { KeyStat, SleepVM } from "@/queries";
import { DeltaMark, ReasonPlaceholder, Txt, useTheme } from "@/ui";
import { useCalm } from "@/ui/calm";
import { onBand } from "@/ui/components/calmKit";
import { Caption, Grouped, Num, Sentence, Title } from "./calmKit";
import { Divided } from "./view";

const BAR = { height: 14, borderRadius: 7 } as const;
const signed = (min: number, sign: "+" | "−") => `${sign}${hmm(Math.abs(min))}`;

/**
 * A card's headline: the percentage large in the sleep ink with its arrow against the prior 30 nights, and their mean
 * under it as a small number with its label.
 */
function Headline({ value, stat }: { value: number; stat?: KeyStat }) {
  const c = useCalm();
  const avg = stat?.average ?? null;
  const t = avg === null ? null : deltaTone("up", value, avg, stat?.sd);
  return (
    <View accessible accessibilityLabel={`${Math.round(value)}%${avg !== null ? `, prior 30-night average ${Math.round(avg)}%` : ""}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Num value={String(Math.round(value))} unit="%" size={36} color={c.tintInk.lavender} />
        {t && <DeltaMark dir={t.dir} tone={t.tone} />}
      </View>
      {avg !== null && (
        <View style={{ marginTop: 4, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 }}>
          <Num value={String(Math.round(avg))} unit="%" size={15} color={c.sub} />
          <Caption>Prior 30-night average</Caption>
        </View>
      )}
    </View>
  );
}

const LEGEND_LINE = 19;

/** A swatch, a name and a right-aligned value: the legend under a bar, as a plain grouped list. */
function Legend({ rows }: { rows: { swatch: string; label: string; value: string }[] }) {
  const c = useCalm();
  return (
    <View style={{ marginTop: 16 }}>
      <Grouped>
        {rows.map((r) => (
          // The swatch and the value stay on the name's first line if it wraps.
          <View key={r.label} accessible accessibilityLabel={`${r.label} ${r.value}`} style={{ minHeight: 40, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 }}>
            <View style={{ width: 12, height: 12, borderRadius: 4, marginTop: onBand(LEGEND_LINE, 12), backgroundColor: r.swatch }} />
            <Txt size={14} lineHeight={LEGEND_LINE} style={{ flex: 1, color: c.sub }}>
              {r.label}
            </Txt>
            <View style={{ marginTop: onBand(LEGEND_LINE, 18) }}>
              <Num value={r.value} size={16} />
            </View>
          </View>
        ))}
      </Grouped>
    </View>
  );
}

/** A bar's name and value above it: "Hours of sleep 7:12". */
function BarTitle({ label, value }: { label: string; value: string }) {
  const c = useCalm();
  return (
    <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <Txt size={14} lineHeight={19} weight={600} style={{ flexShrink: 1, color: c.ink }}>
        {label}
      </Txt>
      <Num value={value} size={18} color={c.tintInk.lavender} />
    </View>
  );
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
    [baselineMin, alpha(c.foreground, 0.7)],
    [strainMin, c.strain],
    [debtMin, alpha(c.foreground, 0.35)],
  ];
  return (
    <View>
      <Headline value={(h.asleepMin / h.needMin) * 100} stat={stat} />
      <View style={{ marginTop: 16, gap: 16 }}>
        <View>
          <BarTitle label="Hours of sleep" value={hmm(h.asleepMin)} />
          <View style={[BAR, { backgroundColor: calm.tint.lavender }]}>
            <View style={[BAR, { position: "absolute", top: 0, bottom: 0, left: 0, width: pct(h.asleepMin), backgroundColor: c.sleep }]} />
            {/* Where the need ends: a hairline through the track, so a short night leaves a visible gap and a long one a visible surplus. */}
            <View style={{ position: "absolute", top: -4, bottom: -4, left: pct(h.needMin), width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: c.foreground }} />
          </View>
        </View>
        <View>
          <BarTitle label="Sleep needed" value={hmm(h.needMin)} />
          {h.calibrating ? (
            <Sentence>{`Your need settles after 7 nights. Using ${hmm(h.needMin)} until then.`}</Sentence>
          ) : (
            <View style={{ flexDirection: "row", gap: 2, width: pct(h.needMin) }}>
              {parts.map(([min, color], i) => (
                <View key={i} style={[BAR, { flexGrow: Math.max(0, min), flexBasis: 0, backgroundColor: color }, i === 0 && { borderTopRightRadius: 0, borderBottomRightRadius: 0 }]} />
              ))}
            </View>
          )}
        </View>
      </View>
      {!h.calibrating && (
        <Legend
          rows={[
            { swatch: alpha(c.foreground, 0.7), label: "Healthy minimum", value: hmm(baselineMin) },
            { swatch: c.strain, label: "Recent strain", value: signed(strainMin, "+") },
            { swatch: alpha(c.foreground, 0.35), label: "Sleep debt", value: signed(debtMin, "+") },
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
  const dash = alpha(c.foreground, 0.55);
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
        style={{ marginTop: 16, flexDirection: "row", gap: 12 }}
      >
        <View style={{ height: PLOT_H, width: 40 }}>
          {ticks.map((t) => (
            <Txt key={t} role="numericSmall" weight={600} lineHeight={14} style={{ position: "absolute", right: 0, top: yOf(t) - 7 }}>
              {at(t)}
            </Txt>
          ))}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ height: PLOT_H }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {ticks.map((t) => (
              <View key={t} style={{ position: "absolute", left: 0, right: 0, top: yOf(t), height: 1, backgroundColor: calm.line }} />
            ))}
            <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, flexDirection: "row" }}>
              {cm.nights.map((n, i) => (
                <View key={i} style={{ flex: 1 }}>
                  {n && (
                    <View
                      style={{
                        position: "absolute",
                        left: "50%",
                        marginLeft: -9,
                        width: 18,
                        borderRadius: 6,
                        top: yOf(n.bed),
                        height: Math.max(0, yOf(n.wake) - yOf(n.bed)),
                        backgroundColor: i === 4 ? c.sleep : alpha(c.foreground, 0.3),
                      }}
                    />
                  )}
                </View>
              ))}
            </View>
            {/* Each night's optimal bed and wake time, joined into one dashed line that eases from night to night. */}
            {width > 0 && (
              <Svg width={width} height={PLOT_H} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }} pointerEvents="none">
                {[optimal((n) => n.typicalBed), optimal((n) => n.typicalWake)].map((d, i) =>
                  d ? <Path key={i} d={d} fill="none" stroke={dash} strokeWidth={1.5} strokeDasharray={[5, 4]} /> : null,
                )}
              </Svg>
            )}
            {/* Last night's times beside its bar, as WHOOP labels them: bed above, wake below, clear of the dashed lines. */}
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
              <Txt key={i} role="caption" size={13} lineHeight={16} weight={i === 4 ? 700 : 500} color={i === 4 ? "foreground" : "mutedForeground"} align="center" style={{ flex: 1 }}>
                {n?.label ?? "·"}
              </Txt>
            ))}
          </View>
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
      <Txt role="numericCaption" weight={700} color={c.sleep} numberOfLines={1}>
        {text}
      </Txt>
    </View>
  );
}

/** Tonight's bedtimes for each goal and the typical wake, worked back from the need (the planner section). */
export function Planner({ vm, timeZone }: { vm: SleepVM; timeZone: string }) {
  const calm = useCalm();
  const m = vm.planner;
  if (m.value === null)
    return (
      <ReasonPlaceholder
        reason={m.reason}
        nightsLeft={m.nightsLeft}
        size="md"
        copy={m.reason === "calibrating" ? "Sleep Planner needs 7 nights to learn your wake time." : undefined}
      />
    );
  const plan = m.value;
  // The time on the name's line, wherever the caption wraps.
  const row = (label: string, caption: string, time: string) => (
    <View key={label} accessible accessibilityLabel={`${label}, ${caption}: ${time}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Title size={15}>{label}</Title>
        <Sentence size={13}>{caption}</Sentence>
      </View>
      <View style={{ flexShrink: 0 }}>
        <Num value={time} size={20} color={calm.tintInk.lavender} />
      </View>
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      <Divided>
        {plan.plans.map((p) => row(p.label, `${Math.round(p.share * 100)}% of need`, clock(p.bedtimeAt, timeZone)))}
        {row("Typical wake", plan.weekdayWake ? "Weekday wake time" : "Weekend wake time", clock(plan.wakeAt, timeZone))}
      </Divided>
      <View accessible accessibilityLabel={`Need tonight ${hmm(plan.needMin)}`} style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Caption>Need tonight</Caption>
        <Num value={hmm(plan.needMin)} size={16} />
      </View>
      {plan.latencyMin >= 1 ? (
        // The bedtimes leave the minutes you usually take to fall asleep (median of recent nights).
        <View accessible accessibilityLabel={`Bedtimes leave ${Math.round(plan.latencyMin)} minutes to fall asleep`} style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Caption>Time to fall asleep</Caption>
          <Num value={String(Math.round(plan.latencyMin))} unit="min" size={16} />
        </View>
      ) : null}
    </View>
  );
}
