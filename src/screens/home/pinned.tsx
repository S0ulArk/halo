// Today's "Pinned" metrics as Apple Health's highlight cards: each a flat card led by its category line (the metric's
// glyph and name in its family's colour, when on the right with a thin chevron), then the value large with its unit
// small and grey, a one-line context (how it sits against your 30-day average) and a small chart on the right: a week
// of rounded bars with a dashed line at the average for what adds up through a day (steps, calories, sleep), dots over
// the normal band for readings (HRV, resting heart rate, the vitals). The same cards make My Dashboard on Health.
//
// Light: every card is memoised (a re-render of Today redraws none of them unless its own numbers change), its chart is
// Views or one small Svg, and its number rolls into place on the UI thread (RollingNumber).
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { Activity, type LucideIcon } from "lucide-react-native";
import { deltaTone } from "@/lib/bands";
import { dayLabel, formatValue, MISSING, NBSP, statSentence, type FormatKey } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import type { KeyStat } from "@/queries";
import { accentFamily, MetricTags, Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { CalmSurface } from "@/ui/components/CalmSurface";
import { ChevronSlot, familyTint, OnCard } from "@/ui/components/calmKit";
import { RollingNumber } from "@/ui/components/Halo";
import { DeltaGlyph } from "@/ui/components/Meter";
import { usePress, usePressStyle } from "@/ui/components/press";
import { font } from "@/ui/fonts";
import { useTitleInk } from "./controls";
import { MiniBars, MiniDots } from "./miniCharts";
import { STAT_ICON, statProps } from "./view";

// ── The card ─────────────────────────────────────────────────────────────────

/** The big number's size and line, Health's highlight value. */
const VALUE = { size: 30, line: 36 } as const;

export type HealthCardProps = {
  icon: LucideIcon;
  /** The family's colour: the category line and the chart. */
  color: string;
  title: string;
  /** Right of the title, grey: when the value is from ("Today", "2 min ago", "Live"). */
  when?: string | null;
  onPress?: () => void;
  accessibilityLabel: string;
  /** The value line (HealthValue). */
  value: React.ReactNode;
  /** The grey line under the value. */
  context?: React.ReactNode;
  /** The small chart on the right, its foot on the value block's foot. */
  chart?: React.ReactNode;
  /** The glyph drawn filled (the heart). */
  filled?: boolean;
  /** Under the value, inside the card's one target (tags, a note). */
  children?: React.ReactNode;
  /** At the card's foot, a target of its own beside the card's (a button), so a screen reader reaches it. */
  footer?: React.ReactNode;
};

const PressableView = Animated.createAnimatedComponent(Pressable);

/**
 * The card's shell, Apple Health's highlight card. The head, value, chart and children are one target (it settles and
 * dims while pressed, or one spoken block when it opens nothing); the footer sits under them, its own target.
 */
export function HealthCard({ icon: Icon, color, title, when, onPress, accessibilityLabel, value, context, chart, filled, children, footer }: HealthCardProps) {
  const c = useCalm();
  const press = usePress(footer ? 0.985 : 0.97);
  const pressed = usePressStyle(press, { dim: 0.88 });
  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, minHeight: 22 }}>
        <Icon size={18} color={color} fill={filled ? color : "none"} strokeWidth={2.2} />
        {/* A long name wraps under itself rather than being cut. */}
        <Txt size={16} lineHeight={21} weight={600} style={{ color, flex: 1, minWidth: 0 }}>
          {title}
        </Txt>
        {when ? (
          <Txt size={14} lineHeight={19} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
            {when}
          </Txt>
        ) : null}
        <ChevronSlot shown={!!onPress} size={16} style={{ marginRight: -4 }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {value}
          {context}
        </View>
        {chart ? <View style={{ marginBottom: 3 }}>{chart}</View> : null}
      </View>
      {children}
    </>
  );
  const box = { padding: 16, paddingBottom: footer ? 12 : 16 };
  return (
    <CalmSurface padding={0}>
      <OnCard>
        {onPress ? (
          <PressableView onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[box, pressed]}>
            {body}
          </PressableView>
        ) : (
          <View accessible accessibilityLabel={accessibilityLabel} style={box}>
            {body}
          </View>
        )}
        {footer ? <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>{footer}</View> : null}
      </OnCard>
    </CalmSurface>
  );
}

/**
 * The value line: the number rolling into place in `color` (ink by default), its unit small and grey after it; a
 * missing value is the faint dash.
 */
export function HealthValue({ text, unit, color, delay = 0 }: { text: string | null; unit?: string; color?: string; delay?: number }) {
  const c = useCalm();
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "flex-end" }}>
      {text === null ? (
        <Txt size={VALUE.size} lineHeight={VALUE.line} style={[font.numberAt(VALUE.size), { color: c.faint }]}>
          {MISSING}
        </Txt>
      ) : (
        <RollingNumber text={text} lineHeight={VALUE.line} delay={delay} style={[font.numberAt(VALUE.size, 700), { color: color ?? c.ink }]} />
      )}
      {unit && text !== null ? (
        <Txt size={15} lineHeight={20} weight={600} numberOfLines={1} style={{ color: c.sub, marginLeft: unit === "%" ? 1 : 4, marginBottom: 5 }}>
          {unit}
        </Txt>
      ) : null}
    </View>
  );
}

/** The context line: 14/19 grey, wrapping under the number rather than cut. */
export function HealthContext({ children, color }: { children: React.ReactNode; color?: string }) {
  const c = useCalm();
  return (
    <Txt size={14} lineHeight={19} style={{ color: color ?? c.sub, fontVariant: ["tabular-nums"] }}>
      {children}
    </Txt>
  );
}

// ── A pinned metric ──────────────────────────────────────────────────────────

/** Metrics that add up through a day: a week of bars. Every other one is a reading: dots over its normal band. */
const BAR_KEYS = new Set([
  "steps",
  "calories",
  "sleep",
  "distance",
  "floors",
  "elevation",
  "active_minutes",
  "light_minutes",
  "azm",
  "active_calories",
  "sedentary_minutes",
  "swim_strokes",
  "water",
  "calories_in",
  "protein",
  "carbs",
  "fat",
]);

const unitText = (unit?: string) => (unit ? (unit === "%" ? "%" : `${NBSP}${unit}`) : "");
/** |n| in the stat's format, without the sign a signed format adds. */
const absText = (format: FormatKey, n: number) => formatValue(format, Math.abs(n)).replace(/^[+−-]/, "");

/**
 * How the value sits against its 30-day average: the difference with its arrow, in green when it moved the good way and
 * yellow when not (a dot and the signed difference when it is within the normal spread, "No change" when it rounds
 * away), then the average itself.
 */
function Compare({ diff, diffText, dir, tone, unit, format, avgText }: { diff: number | null; diffText: string | null; dir?: "up" | "down" | "flat"; tone?: "good" | "bad" | "neutral"; unit?: string; format: FormatKey; avgText: string | null }) {
  const c = useCalm();
  if (avgText === null) return null;
  const ink = tone === "good" ? c.tintInk.mint : tone === "bad" ? c.tintInk.sand : c.sub;
  const lead =
    diff === null ? null : !diffText ? (
      <Txt size={14} lineHeight={19} weight={600} style={{ color: c.sub }}>
        No change
      </Txt>
    ) : (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <DeltaGlyph dir={dir === "flat" ? "flat" : diff > 0 ? "up" : "down"} color={dir === "flat" ? c.sub : ink} size={8} />
        <Txt size={14} lineHeight={19} weight={600} style={[font.numeric(600), { color: dir === "flat" ? c.sub : ink }]}>
          {`${dir === "flat" ? diffText : absText(format, diff)}${unitText(unit)}`}
        </Txt>
      </View>
    );
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 }}>
      {lead}
      <HealthContext>{`30-day avg ${avgText}${unitText(unit)}`}</HealthContext>
    </View>
  );
}

export type StatCardProps = {
  s: KeyStat;
  /** The last 7 days' values ending on the day shown (oldest first); null while they load. */
  series: (number | null)[] | null;
  day: string;
  today: string;
  /** Opens the stat's detail route (the caller adds the day). */
  open: (href: string) => void;
  /** Its place among the cards: its number rolls in a beat after the one above. */
  order?: number;
};

/** One pinned metric as a Health card. */
export const StatCard = React.memo(function StatCard({ s, series, day, today, open, order = 0 }: StatCardProps) {
  const c = useCalm();
  const p = statProps(s, c.sub, open);
  const family = accentFamily(s.key) ?? accentFamily(s.label);
  const v = s.metric.value;
  const value = v !== null && Number.isFinite(v) ? v : null;
  const tint: CalmTint = familyTint(family, value) ?? "sky";
  // The category line keeps its family's colour; Recovery's number takes its band's.
  const head = useTitleInk(familyTint(family) ?? "sky");
  const color = c.tintInk[tint];
  const reason = value === null ? reasonCopy(s.metric.reason, s.metric.nightsLeft).short : null;
  const avg = p.average ?? null;
  const t = value !== null && avg !== null && p.direction !== "none" ? deltaTone(p.direction, value, avg, p.sd) : null;
  const diff = value !== null && avg !== null ? value - avg : null;
  const diffText = diff === null || absText(p.format, diff) === absText(p.format, 0) ? null : `${diff > 0 ? "+" : "−"}${absText(p.format, diff)}`;
  const valueText = value === null ? null : formatValue(p.format, value);
  const avgText = avg !== null ? formatValue(p.format, avg) : null;
  const sentence = reason
    ? `${s.label}: ${reason}`
    : statSentence({ label: s.label, valueText: valueText ?? MISSING, unit: p.unit, averageText: avgText ?? undefined, dir: t?.dir, tone: t?.tone });
  const Icon = STAT_ICON[s.key] ?? Activity;
  const bars = BAR_KEYS.has(s.key);
  const known = series?.some((x) => x !== null) ?? false;
  const chart = !series || !known ? null : bars ? (
    <MiniBars values={series} color={head} guide={avg} />
  ) : (
    <MiniDots values={series} color={head} band={avg !== null && p.sd ? { low: avg - p.sd, high: avg + p.sd } : null} />
  );
  const tags = !!s.metric.provisional || !!s.metric.tags?.length;
  return (
    <HealthCard
      icon={Icon}
      color={head}
      title={s.label}
      when={dayLabel(day, today)}
      onPress={p.onPress}
      accessibilityLabel={p.onPress ? `${sentence}. Opens ${s.label}` : sentence}
      value={<HealthValue text={valueText} unit={value === null ? undefined : p.unit} color={family === "recovery" ? color : undefined} delay={80 + order * 60} />}
      context={
        reason ? (
          <HealthContext>{reason}</HealthContext>
        ) : (
          <Compare diff={diff} diffText={diffText} dir={t?.dir} tone={t?.tone} unit={p.unit} format={p.format} avgText={value === null ? null : avgText} />
        )
      }
      chart={chart}
    >
      {tags && <MetricTags provisional={s.metric.provisional} tags={s.metric.tags} align="flex-start" style={{ marginTop: 8 }} />}
    </HealthCard>
  );
});
