// One Healthspan group card ("Sleep", "Strain", "Fitness"), ported from Pulse's health/healthspan/ContributorCard.tsx:
// each row opens its contributor sheet (journey 5). The web deep-links the sheet with `?contributor=`; here the card
// holds it, and Back closes it. Calm: one grouped list per card; each row's years ("+0.5 y") in rose when they add
// to your Pulse Age and mint when they take years off.
import * as React from "react";
import { Pressable, View } from "react-native";
import { CircleGauge, Dumbbell, Footprints, Heart, Moon, PersonStanding, Timer, type LucideIcon } from "lucide-react-native";
import { formatValue, isSymbolUnit, NBSP, spoken, type FormatKey } from "@/lib/format";
import { alpha } from "@/lib/utils";
import type { HealthspanContributor } from "@/queries";
import { BottomSheet, MetricTags, SectionShell, Skeleton, SkeletonText } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { ChevronSlot, onBand } from "@/ui/components/calmKit";
import { RangeTrack } from "@/ui/components/Meter";
import { Grouped, IconTile, Num, Sentence, Title } from "@/screens/detail/calmKit";

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
  // Lean mass % (100 − body fat %); the caption carries lean and fat mass in kg and per m².
  leanMass: { format: "decimal1", unit: "%" },
};

/** Each group's family pastel: sleep lavender, strain peach, fitness sky. */
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

/** An input row's band: its name (20) and the number or caption under it (2 + 19). */
const ITEM_BAND = 41;

/**
 * One input: its icon, name and value, the years it adds or takes off on the right, then its value on the axis against
 * the target for your age (the good side faintly shaded, the target a tick, you the dot).
 */
function ContributorItem({ x, tint, onPress }: { x: HealthspanContributor; tint: CalmTint; onPress: () => void }) {
  const c = useCalm();
  const s = SHOW[x.key] ?? { format: "decimal1" as const };
  const k = s.scale ?? 1;
  const Icon = ICON[x.key];
  const value = x.metric.value === null ? null : x.metric.value * k;
  const years = value === null ? null : roundYears(x.years);
  const [lo, hi] = [x.domain[0] * k, x.domain[1] * k];
  const target = x.target * k;
  const t = frac(target, lo, hi);
  const yearsInk = years === null || years === 0 ? c.sub : years > 0 ? c.tintInk.rose : c.tintInk.mint;
  const dot = years === null || years === 0 ? c.ink : years < 0 ? c.tintInk.mint : c.tintInk.rose;
  const sentence =
    value === null
      ? `${x.label}: ${x.caption ?? "No data"}`
      : `${x.label} ${spoken(formatValue(s.format, value), s.unit)}, target ${formatValue(s.format, target)}${years === null ? "" : years === 0 ? ", no change in years" : `, ${formatValue("decimal1", Math.abs(years))} years ${years < 0 ? "younger" : "older"}`}`;
  const captioned = !!x.caption && value !== null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sentence} style={({ pressed }) => ({ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}>
      {/* The tile on the name and the number under it (20 + 2 + 19); a row without an icon keeps the tile's column. */}
      <View style={{ width: 36, marginTop: onBand(ITEM_BAND, 36) }}>{Icon && <IconTile icon={Icon} color={c.tintInk[tint]} bg={c.tint[tint]} size={36} />}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Title size={15}>{x.label}</Title>
            {value !== null ? <Num value={formatValue(s.format, value)} unit={s.unit} size={17} /> : <Sentence size={13}>{x.caption ?? "No data"}</Sentence>}
          </View>
          {/* The years and the chevron on the name's line. */}
          {years !== null && (
            <View style={{ marginTop: -1 }}>
              <Num value={years === 0 ? "0.0" : formatValue("signed1", years)} unit="y" size={20} color={yearsInk} unitColor={yearsInk} />
            </View>
          )}
          <ChevronSlot shown size={18} style={{ marginTop: onBand(20, 18), marginLeft: 4 }} />
        </View>
        <RangeTrack value={value === null ? null : frac(value, lo, hi)} color={dot} range={x.higherIsBetter ? [t, 1] : [0, t]} rangeColor={alpha(c.tintInk.mint, 0.22)} tick={t} height={8} style={{ marginVertical: 3 }} />
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <Num value={formatValue(s.format, lo)} size={12} color={c.faint} />
          {value !== null && (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, flexShrink: 1 }}>
              <Sentence size={13}>Target</Sentence>
              <Num value={withUnit(formatValue(s.format, target), s.unit)} size={13} color={c.sub} />
            </View>
          )}
          <Num value={formatValue(s.format, hi)} size={12} color={c.faint} />
        </View>
        {value !== null && <MetricTags provisional={x.metric.provisional} tags={x.metric.tags} align="flex-start" />}
        {captioned && <Sentence size={13}>{x.caption}</Sentence>}
      </View>
    </Pressable>
  );
}

export function ContributorCard({ title, items }: { title: string; items: HealthspanContributor[] }) {
  const c = useCalm();
  const [open, setOpen] = React.useState<string | null>(null);
  // The last opened row stays in the sheet while it slides out.
  const [last, setLast] = React.useState<HealthspanContributor | null>(null);
  const current = items.find((x) => x.key === open);
  const item = current ?? last;
  const show = item ? (SHOW[item.key] ?? { format: "decimal1" as const }) : null;
  const scale = (v: number) => v * (show?.scale ?? 1);
  const years = item && item.metric.value !== null ? item.years : null;
  const line = yearsLine(years);
  const tint = GROUP_TINT[items[0]?.group ?? "sleep"];

  return (
    <SectionShell variant="card" title={title}>
      <Grouped inset={48}>
        {items.map((x) => (
          <ContributorItem
            key={x.key}
            x={x}
            tint={tint}
            onPress={() => {
              setOpen(x.key);
              setLast(x);
            }}
          />
        ))}
      </Grouped>
      <BottomSheet open={!!current} onClose={() => setOpen(null)} title={item?.label ?? title}>
        {item && show ? (
          <View style={{ gap: 16 }}>
            <Num value={formatValue(show.format, item.metric.value === null ? null : scale(item.metric.value))} unit={show.unit} size={36} />
            <View style={{ gap: 4 }}>
              <Sentence>{`Target for your age: ${withUnit(formatValue(show.format, scale(item.target)), show.unit)}`}</Sentence>
              {line && <Sentence color={years! < 0 ? c.tintInk.mint : years! > 0 ? c.tintInk.rose : undefined}>{line}</Sentence>}
              {item.metric.value === null && item.caption && <Sentence>{item.caption}</Sentence>}
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
    </SectionShell>
  );
}

/** One input row's loading shape in ContributorItem's box: the tile, bars for the name and its number, the chevron, the track. */
function ContributorItemSkeleton() {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14 }}>
      <Skeleton radius={12} style={{ width: 36, height: 36, marginTop: onBand(ITEM_BAND, 36) }} />
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <SkeletonText size={15} lineHeight={20} width={144} />
            <SkeletonText size={17} lineHeight={19} width={72} />
          </View>
          <ChevronSlot shown size={18} style={{ marginTop: onBand(20, 18), marginLeft: 4 }} />
        </View>
        <View style={{ height: 8, borderRadius: 4, marginVertical: 3, backgroundColor: c.line }} />
        <SkeletonText size={13} lineHeight={16} />
      </View>
    </View>
  );
}

/** A contributor card's loading shape: `n` input rows. */
export function ContributorCardSkeleton({ title, n }: { title: string; n: number }) {
  return (
    <SectionShell variant="card" title={title}>
      <Grouped inset={48}>
        {Array.from({ length: n }, (_, i) => (
          <ContributorItemSkeleton key={i} />
        ))}
      </Grouped>
    </SectionShell>
  );
}
