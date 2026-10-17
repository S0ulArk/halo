// One Healthspan group ("Sleep", "Strain", "Fitness") as an iOS grouped list under its caps header, the design's "What
// moves it" (ported from Pulse's health/healthspan/ContributorCard.tsx): each input a row with its coloured icon square,
// its name, its value and the target for your age under it, the years it adds or takes off on the right (red when it
// adds years, green when it takes them off) and a thin chevron. A row opens the input's sheet (journey 5; the web
// deep-links it with `?contributor=`, here the list holds it and Back closes it): the value large, where it sits between
// its ends and the target, the years in words, what it means and where the evidence comes from.
import * as React from "react";
import { View } from "react-native";
import { CircleGauge, Dumbbell, Footprints, Heart, Moon, PersonStanding, Timer, type LucideIcon } from "lucide-react-native";
import { formatValue, isSymbolUnit, NBSP, spoken, type FormatKey } from "@/lib/format";
import { alpha } from "@/lib/utils";
import type { HealthspanContributor } from "@/queries";
import { BottomSheet, MetricTags, Skeleton, SkeletonText, Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { RangeTrack } from "@/ui/components/Meter";
import { font } from "@/ui/fonts";
import { Num, Sentence } from "@/screens/detail/calmKit";
import { GroupList, Hairline, LIST_RADIUS, SectionLabel, type GroupRowProps } from "@/screens/settings/calmKit";

const ICON: Record<string, LucideIcon> = {
  sleepHours: Moon,
  sri: Moon,
  zone13: Timer,
  zone45: Timer,
  strength: Dumbbell,
  steps: Footprints,
  vo2max: CircleGauge,
  restingHr: Heart,
  leanMass: PersonStanding,
};

/** How each Healthspan input is shown: sleep hours in h:mm, weekly minutes in h:mm (spec §7.7). */
const SHOW: Record<string, { format: FormatKey; unit?: string; scale?: number }> = {
  sleepHours: { format: "duration", scale: 60 },
  sri: { format: "int", unit: "%" },
  zone13: { format: "duration" },
  zone45: { format: "duration" },
  strength: { format: "duration" },
  steps: { format: "grouped" },
  vo2max: { format: "decimal1", unit: "ml/kg/min" },
  restingHr: { format: "int", unit: "bpm" },
  // Lean mass % (100 − body fat %); the caption carries lean and fat mass in kg or lb (Settings › Units) and per m².
  leanMass: { format: "decimal1", unit: "%" },
};

/** Each group's system colour for its icon squares: sleep indigo, strain orange, fitness blue. */
const GROUP_TINT: Record<HealthspanContributor["group"], CalmTint> = { sleep: "lavender", strain: "peach", fitness: "sky" };

const withUnit = (text: string, unit?: string) => (unit ? `${text}${isSymbolUnit(unit) ? "" : NBSP}${unit}` : text);
const frac = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
/** Under 0.05 years rounds to "0.0": no change, neither younger nor older. */
const roundYears = (y: number | null) => (y === null ? null : Math.abs(y) < 0.05 ? 0 : y);

function yearsLine(years: number | null) {
  if (years === null) return null;
  const v = formatValue("decimal1", Math.abs(years));
  return v === "0.0" ? "No change from your age" : `${v}${NBSP}years ${years < 0 ? "younger" : "older"} than your age`;
}

/** An input's value scaled for display (sleep hours to minutes), or null without one. */
function shownValue(x: HealthspanContributor) {
  const k = SHOW[x.key]?.scale ?? 1;
  return x.metric.value === null ? null : x.metric.value * k;
}

/** The years an input adds (red) or takes off (green), signed, with a small "y"; grey at no change. */
function Years({ years }: { years: number }) {
  const c = useCalm();
  const ink = years === 0 ? c.sub : years > 0 ? c.tintInk.rose : c.tintInk.mint;
  return (
    <Txt size={17} lineHeight={22} style={[font.numberAt(17), { color: ink }]}>
      {years === 0 ? "0.0" : formatValue("signed1", years)}
      <Txt size={13} lineHeight={18} weight={600} style={{ color: ink }}>
        {" y"}
      </Txt>
    </Txt>
  );
}

/** The input's row: its icon square, name, "value · target" under it (or why there is none), the years and a chevron. */
function rowOf(x: HealthspanContributor, tint: CalmTint, open: () => void): GroupRowProps {
  const s = SHOW[x.key] ?? { format: "decimal1" as const };
  const k = s.scale ?? 1;
  const value = shownValue(x);
  const years = value === null ? null : roundYears(x.years);
  const target = x.target * k;
  const parts =
    value === null
      ? [x.caption ?? "No data"]
      : [`${withUnit(formatValue(s.format, value), s.unit)} · target ${withUnit(formatValue(s.format, target), s.unit)}`, x.metric.provisional ? "Provisional" : null, x.caption ?? null];
  const sentence =
    value === null
      ? `${x.label}: ${x.caption ?? "No data"}`
      : `${x.label} ${spoken(formatValue(s.format, value), s.unit)}, target ${formatValue(s.format, target)}${years === null ? "" : years === 0 ? ", no change in years" : `, ${formatValue("decimal1", Math.abs(years))} years ${years < 0 ? "younger" : "older"}`}`;
  return {
    label: x.label,
    icon: ICON[x.key] ?? Timer,
    tint,
    description: parts.filter(Boolean).join("\n"),
    aside: years === null ? undefined : <Years years={years} />,
    onPress: open,
    accessibilityLabel: sentence,
  };
}

/** A group of inputs as one grouped list with its caps header; each row opens its sheet. */
export function ContributorList({ title, items }: { title: string; items: HealthspanContributor[] }) {
  const c = useCalm();
  const [open, setOpen] = React.useState<string | null>(null);
  // The last opened row stays in the sheet while it slides out.
  const [last, setLast] = React.useState<HealthspanContributor | null>(null);
  const current = items.find((x) => x.key === open);
  const item = current ?? last;
  const show = item ? (SHOW[item.key] ?? { format: "decimal1" as const }) : null;
  const scale = (v: number) => v * (show?.scale ?? 1);
  const value = item ? shownValue(item) : null;
  const years = item && item.metric.value !== null ? item.years : null;
  const line = yearsLine(years);
  const tint = GROUP_TINT[items[0]?.group ?? "sleep"];
  const rows = items.map((x) =>
    rowOf(x, tint, () => {
      setOpen(x.key);
      setLast(x);
    }),
  );
  const lo = item && show ? scale(item.domain[0]) : 0;
  const hi = item && show ? scale(item.domain[1]) : 1;
  const t = item ? frac(scale(item.target), lo, hi) : 0;
  const dot = years === null || Math.abs(years) < 0.05 ? c.ink : years < 0 ? c.tintInk.mint : c.tintInk.rose;

  return (
    <>
      <GroupList title={title} rows={rows} />
      <BottomSheet open={!!current} onClose={() => setOpen(null)} title={item?.label ?? title}>
        {item && show ? (
          <View style={{ gap: 16 }}>
            <Num value={formatValue(show.format, value)} unit={show.unit} size={36} />
            {/* Where the value sits between the input's ends, the good side of the target shaded, the target a tick. */}
            <View style={{ gap: 8 }}>
              <RangeTrack value={value === null ? null : frac(value, lo, hi)} color={dot} range={item.higherIsBetter ? [t, 1] : [0, t]} rangeColor={alpha(c.tintInk.mint, 0.22)} tick={t} height={8} style={{ marginVertical: 3 }} />
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <Num value={formatValue(show.format, lo)} size={12} color={c.faint} />
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, flexShrink: 1 }}>
                  <Sentence size={13}>Target</Sentence>
                  <Num value={withUnit(formatValue(show.format, scale(item.target)), show.unit)} size={13} color={c.sub} />
                </View>
                <Num value={formatValue(show.format, hi)} size={12} color={c.faint} />
              </View>
            </View>
            {value !== null && <MetricTags provisional={item.metric.provisional} tags={item.metric.tags} align="flex-start" />}
            <View style={{ gap: 4 }}>
              <Sentence>{`Target for your age: ${withUnit(formatValue(show.format, scale(item.target)), show.unit)}`}</Sentence>
              {line && <Sentence color={years! < 0 ? c.tintInk.mint : years! > 0 ? c.tintInk.rose : undefined}>{line}</Sentence>}
              {item.caption && <Sentence>{item.caption}</Sentence>}
            </View>
            <Sentence color={c.ink} weight={400}>
              {item.explanation}
            </Sentence>
            <Sentence size={13}>{`Source: ${item.source}.`}</Sentence>
          </View>
        ) : (
          <View />
        )}
      </BottomSheet>
    </>
  );
}

/** A group's loading shape: its caps header over `n` rows with bars for the name and the value line. */
export function ContributorListSkeleton({ title, n }: { title: string; n: number }) {
  const c = useCalm();
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ gap: 7 }}>
      <SectionLabel>{title}</SectionLabel>
      <View style={{ borderRadius: LIST_RADIUS, backgroundColor: c.card, overflow: "hidden" }}>
        {Array.from({ length: n }, (_, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Hairline inset={57} /> : null}
            <View style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Skeleton radius={7} style={{ width: 29, height: 29 }} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <SkeletonText size={16} lineHeight={21} width={144} />
                <SkeletonText size={13} lineHeight={18} width={112} />
              </View>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}
