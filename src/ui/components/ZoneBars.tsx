import * as React from "react";
import { StyleSheet, View } from "react-native";
import { DATA_COLORS, type DataColor } from "@/lib/bands";
import { durationWords, hmm, NBSP } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha, mix } from "@/lib/utils";
import { GrowIn } from "@/ui/motion/Rise";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { Caption, useSoftFill } from "./calmKit";
import { EmptyState } from "./EmptyState";
import { Hatch } from "./Hatch";
import { MetricState } from "./MetricState";
import { Skeleton, SkeletonText } from "./Skeleton";
import { Txt } from "./Text";

/** `zone` 0-5 orders the rows (0 is time under Zone 1: `min` 0, `max` the bpm below Zone 1); `label` names it ("Zone 1"). */
export type ZoneRow = {
  zone: number;
  label: string;
  min: number;
  max: number | null;
  seconds: number;
  /** Activity only: the mean seconds and share (0-1) in this zone over the last 30 days of the same kind. */
  typical?: { seconds: number; share: number };
};
export type StackedSegment = { key: string; label: string; count: number; color: DataColor };

export type ZoneBarsProps =
  | {
      variant: "rows";
      /** Zones in any order; drawn top zone first. `max: null` is the open top zone ("173+ bpm"). */
      data: Metric<ZoneRow[]> | null | undefined;
      /** Where the zones came from, under the rows. */
      note?: string;
      emptyCopy?: string;
    }
  | {
      variant: "stacked";
      /** "days": Recovery breakdown (4x). "minutes": stress levels (h:mm). */
      unit: "days" | "minutes";
      data: Metric<StackedSegment[]> | null | undefined;
      emptyCopy?: string;
    };

/** Each zone's fill, cool to hot: violet, blue, green, orange (the strain hue), rose. */
export const ZONE_COLOR: Record<number, DataColor> = { 1: "sleep", 2: "chart-5", 3: "optimal", 4: "strain", 5: "recovery-red" };

/** A zone's or level's fill: its meaning colour made a soft pastel (mixed toward the card), never a saturated block. */
const softOf = (color: string, c: CalmPalette, dark: boolean, p = 0.6) => mix(color, c.card, dark ? Math.min(1, p + 0.12) : p);

function share(part: number, total: number) {
  if (!total || !part) return "0%";
  const p = (part / total) * 100;
  return p < 1 ? "<1%" : `${Math.round(p)}%`;
}

/** "1:05" with the seconds small and grey: 1:05:32 (the numeric face, the seconds as a unit would be). */
function Clock({ seconds, size }: { seconds: number; size: "lg" | "md" }) {
  const c = useCalm();
  const t = Math.round(seconds);
  return (
    <Txt role={size === "lg" ? "valueMd" : "valueSm"} color={c.ink} style={font.numeric(700)}>
      {hmm(Math.floor(t / 60))}
      <Txt role={size === "lg" ? "valueMd" : "valueSm"} size={12} lineHeight={size === "lg" ? 24 : 20} weight={500} color={c.sub}>
        :{String(t % 60).padStart(2, "0")}
      </Txt>
    </Txt>
  );
}

function Rows({ zones, note }: { zones: ZoneRow[]; note?: string }) {
  const { c, scheme } = useTheme();
  const calm = useCalm();
  const soft = useSoftFill();
  const total = zones.reduce((a, z) => a + z.seconds, 0);
  const sorted = [...zones].sort((a, b) => b.zone - a.zone);
  const typical = sorted.some((z) => z.typical);
  let lowest: ZoneRow | undefined;
  for (let i = sorted.length - 1; i >= 0; i--)
    if (sorted[i].zone > 0) {
      lowest = sorted[i];
      break;
    }
  // No time in any zone (an easy walk): one line that says so, not greyed rows of 0:00:00.
  if (!total && lowest)
    return (
      <View style={{ justifyContent: "center" }}>
        <View style={{ borderRadius: 14, backgroundColor: soft, paddingHorizontal: 14, paddingVertical: 12 }}>
          <Txt size={14} lineHeight={19} color={calm.sub}>
            Heart rate stayed under the {lowest.label} zone ({lowest.min}
            {NBSP}bpm) the whole time.
          </Txt>
        </View>
        {note && (
          <Txt size={13} lineHeight={18} color={calm.sub} style={{ marginTop: 12 }}>
            {note}
          </Txt>
        )}
      </View>
    );
  return (
    <View>
      <View style={{ marginBottom: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, opacity: typical ? 1 : 0 }}>
          <View style={{ width: 2, height: 12, borderRadius: 1, backgroundColor: calm.ink }} />
          <Txt size={13} lineHeight={18} weight={500} color={calm.sub}>
            Typical range
          </Txt>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Caption>Duration</Caption>
          <Clock seconds={total} size="md" />
        </View>
      </View>
      <View>
        {sorted.map((z, i) => {
          const below = z.zone === 0;
          const range = below ? `<${z.max! + 1}${NBSP}bpm` : z.max === null ? `${z.min}+${NBSP}bpm` : `${z.min}–${z.max}${NBSP}bpm`;
          const spokenRange = below ? `under ${z.max! + 1} bpm` : z.max === null ? `${z.min} bpm and above` : `${z.min} to ${z.max} bpm`;
          const sh = share(z.seconds, total);
          const minutes = Math.floor(Math.round(z.seconds) / 60);
          const color = ZONE_COLOR[z.zone] ? DATA_COLORS[ZONE_COLOR[z.zone]] : null;
          const diffMin = z.typical ? Math.round((z.seconds - z.typical.seconds) / 60) : 0;
          return (
            <View
              key={z.zone}
              accessibilityLabel={`${z.label} zone, ${spokenRange}, ${durationWords(minutes)}, ${sh === "<1%" ? "under 1 percent" : sh.replace("%", " percent")}`}
              // One grouped list: hairlines between the zones, no box per row.
              style={{ gap: 10, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: calm.line, opacity: z.seconds ? 1 : 0.4 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {/* The zone, its bpm range, share and the change against typical wrap as one block; the time keeps its column. */}
                <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8 }}>
                  <Txt size={15} lineHeight={20} weight={600} color={calm.ink}>
                    {z.label}
                  </Txt>
                  <Txt size={14} lineHeight={20} color={calm.sub} style={font.numeric(600)}>
                    {range}
                  </Txt>
                  <Txt size={14} lineHeight={20} color={color && z.zone > 1 && z.seconds > 0 ? c[color.text] : calm.sub} style={font.numeric(700)}>
                    {sh}
                  </Txt>
                  {z.typical && diffMin !== 0 && (
                    <Txt size={14} lineHeight={20} color={z.seconds > z.typical.seconds ? calm.ink : calm.sub} style={font.numeric(700)}>
                      {z.seconds > z.typical.seconds ? "+" : "−"}
                      {Math.abs(diffMin)}
                      {NBSP}min
                    </Txt>
                  )}
                </View>
                <Clock seconds={z.seconds} size="lg" />
              </View>
              <Hatch height={10}>
                <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 5, backgroundColor: color ? softOf(c[color.fill], calm, scheme === "dark") : alpha(calm.ink, 0.22), width: total ? `${(z.seconds / total) * 100}%` : 0 }} />
                {/* Your typical share for this kind of activity: a thin tick across the capsule. */}
                {z.typical && <View style={{ position: "absolute", top: -2, bottom: -2, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: calm.ink, left: `${Math.min(100, z.typical.share * 100)}%` }} />}
              </Hatch>
            </View>
          );
        })}
      </View>
      {note && (
        <Txt size={13} lineHeight={18} color={calm.sub} style={{ marginTop: 12 }}>
          {note}
        </Txt>
      )}
    </View>
  );
}

function Stacked({ segments, unit }: { segments: StackedSegment[]; unit: "days" | "minutes" }) {
  const { c, scheme } = useTheme();
  const calm = useCalm();
  const shown = segments.filter((s) => s.count > 0);
  const count = (n: number) => (unit === "days" ? `${n}x` : hmm(n));
  // Each part a soft capsule of its meaning colour, the legend's dot in the same tone.
  const soft = (s: StackedSegment) => softOf(c[DATA_COLORS[s.color].fill], calm, scheme === "dark", 0.72);
  return (
    <View>
      <View style={{ height: 12, flexDirection: "row", gap: 3 }}>
        {shown.map((s) => (
          <View key={s.key} style={{ height: "100%", flexGrow: s.count, flexBasis: 0, minWidth: 6, borderRadius: 6, backgroundColor: soft(s) }} />
        ))}
      </View>
      <View style={{ marginTop: 14, gap: 8 }}>
        {segments.map((s) => (
          <View key={s.key} accessibilityLabel={`${s.label}: ${unit === "days" ? `${s.count} ${s.count === 1 ? "day" : "days"}` : durationWords(s.count)}`} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: soft(s) }} />
            <Txt size={16} lineHeight={20} color={calm.ink} style={[font.numeric(700), { width: 52 }]}>
              {count(s.count)}
            </Txt>
            <Txt size={14} lineHeight={19} color={calm.sub} style={{ flex: 1 }}>
              {s.label}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Meters, not a chart (spec §5.8): time in zones as rows, or a stacked breakdown bar. */
export function ZoneBars(p: ZoneBarsProps) {
  const empty = <EmptyState body={p.emptyCopy ?? (p.variant === "rows" ? "No heart-rate zones yet today." : "No days with Recovery in this period.")} />;
  if (p.variant === "rows")
    return (
      <MetricState metric={p.data} skeleton={<ZoneBarsSkeleton variant="rows" />} empty={empty}>
        {(zones) => (
          // Traced in left to right once, as the Skia charts are.
          <GrowIn mode="wipe">
            <Rows zones={zones} note={p.note} />
          </GrowIn>
        )}
      </MetricState>
    );
  return (
    <MetricState metric={p.data} skeleton={<ZoneBarsSkeleton variant="stacked" />} empty={empty}>
      {(segments) => (segments.some((s) => s.count > 0) ? <Stacked segments={segments} unit={p.unit} /> : empty)}
    </MetricState>
  );
}

export function ZoneBarsSkeleton({ variant }: { variant: "rows" | "stacked" }) {
  const c = useCalm();
  if (variant === "rows")
    return (
      <View>
        {["Zone 5", "Zone 4", "Zone 3", "Zone 2", "Zone 1", "Zone 0"].map((k, i) => (
          <View key={k} style={{ gap: 10, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.line }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Txt size={15} lineHeight={20} weight={600} color={c.ink}>
                {k}
              </Txt>
              <SkeletonText role="label" width={80} />
              <SkeletonText role="valueMd" chars={7} style={{ marginLeft: "auto" }} />
            </View>
            <Hatch height={10} />
          </View>
        ))}
      </View>
    );
  return (
    <View style={{ gap: 12 }}>
      <Skeleton radius={6} style={{ height: 12 }} />
      {[0, 1, 2].map((k) => (
        <Skeleton key={k} style={{ height: 16, width: 160 }} />
      ))}
    </View>
  );
}
ZoneBars.Skeleton = ZoneBarsSkeleton;
