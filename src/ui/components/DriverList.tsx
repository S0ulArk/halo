// Ranked effects as Apple Health draws a diverging chart: one row per signal or behaviour, its name and signed effect
// over a slim capsule track with a hairline at no effect, the effect a rounded fill growing out of that hairline, green
// to the right (raised, helps) and orange to the left (lowered, hurts). The fills grow in once, staggered, on the UI
// thread (a scale from the hairline, never a re-layout), after the screen has opened; still under Reduce motion.
import * as React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { ChevronRight } from "lucide-react-native";
import { formatValue, NBSP } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { Card } from "./Card";
import { useAfterTransition } from "./AfterTransition";
import { Caption, useSoftFill } from "./calmKit";
import { EmptyState } from "./EmptyState";
import { DeltaGlyph } from "./Meter";
import { MetricState } from "./MetricState";
import { MetricTags } from "./primitives";
import { SkeletonText } from "./Skeleton";
import { Txt } from "./Text";
import { reduceMotionNow } from "@/ui/motion/system";

export type DriverItem = {
  key: string;
  label: string;
  /** Signed effect, in `unit`. Sorted by |delta| descending by the caller. */
  delta: number;
  /** "none": no clear effect (CI crosses zero). Defaults to the sign of `delta`. */
  effect?: "positive" | "negative" | "none";
  /** Impact variant: days with and without the behaviour, and the 90% CI. */
  yes?: number;
  no?: number;
  ci?: [number, number];
};

export type DriverListProps = {
  variant: "recovery" | "impact";
  unit: "pts" | "%" | "SD";
  data: Metric<DriverItem[]> | null | undefined;
  selectedKey?: string;
  /** Impact rows open their detail. */
  onSelect?: (key: string) => void;
  /** Impact variant: the next-day outcome in the spoken sentence ("Recovery", "HRV", "sleep performance"). */
  outcome?: string;
  /** Inside a card the rows step down to 10 px secondary rows (no card in a card). */
  inCard?: boolean;
  /** The impact empty state's action ("Check in"). */
  onCheckIn?: () => void;
};

const fmt = (v: number, unit: DriverListProps["unit"]) => (unit === "SD" ? `${formatValue("signed1", v)} SD` : `${formatValue("signedInt", v)}${unit === "%" ? "%" : ""}`);
const effectOf = (i: DriverItem) => i.effect ?? (i.delta > 0 ? "positive" : i.delta < 0 ? "negative" : "none");
/** The impact value's column at 17 px bold: "+12%" or "+0.4 SD" with room to spare. */
const valueWidth = (unit: DriverListProps["unit"]) => (unit === "SD" ? 64 : 52);
const unitWord = { pts: "points", "%": "percent", SD: "standard deviations" };

function sentence(i: DriverItem, variant: DriverListProps["variant"], unit: DriverListProps["unit"], outcome = "Recovery") {
  const e = effectOf(i);
  const size = `${formatValue(unit === "SD" ? "decimal1" : "int", Math.abs(i.delta))}${NBSP}${unitWord[unit]}`;
  if (variant === "recovery") return e === "none" ? `${i.label}: no clear effect` : `${i.label} ${e === "positive" ? "raised" : "lowered"} Recovery by ${size}`;
  const k = unit === "SD" ? "decimal1" : "int";
  const ci = i.ci ? `, 90 percent confidence ${formatValue(k, Math.min(Math.abs(i.ci[0]), Math.abs(i.ci[1])))} to ${formatValue(k, Math.max(Math.abs(i.ci[0]), Math.abs(i.ci[1])))}` : "";
  const n = i.yes !== undefined && i.no !== undefined ? `, from ${i.yes} days with and ${i.no} without` : "";
  const verb = e === "none" ? `had no clear effect on next-day ${outcome}` : `${e === "positive" ? "raised" : "lowered"} next-day ${outcome} by ${size}`;
  return `${i.label} ${verb}${ci}${n}`;
}

/** The legend over the rows: "Lowered" left in orange with a down mark, the unit in the middle, "Raised" right in green. */
function Header({ variant, unit, provisional }: { variant: DriverListProps["variant"]; unit: DriverListProps["unit"]; provisional: boolean }) {
  const c = useCalm();
  const [left, mid, right] = variant === "recovery" ? ["Lowered", "Points", "Raised"] : ["Hurts", unit === "SD" ? "Impact (SD)" : "% Impact", "Helps"];
  return (
    <View style={{ marginBottom: 2, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 5 }}>
        <DeltaGlyph dir="down" color={c.system.orange} size={8} />
        <Caption color={c.system.orange}>{left}</Caption>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Caption>{mid}</Caption>
        {provisional && <MetricTags provisional />}
      </View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
        <Caption color={c.tintInk.mint}>{right}</Caption>
        <DeltaGlyph dir="up" color={c.tintInk.mint} size={8} />
      </View>
    </View>
  );
}

/** The track's height and the fill's grow-in. */
const TRACK = 6;
const GROW_MS = 650;

/**
 * The diverging capsule: a quiet track, a hairline at no effect, the effect a rounded fill growing out of the hairline
 * (left for lowered, right for raised) by a scale on the UI thread, `index` steps after the list's first.
 */
function Track({ i, max, fill, index = 0, style }: { i: DriverItem | null; max: number; fill: string; index?: number; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const share = i && i.delta !== 0 ? Math.min(50, (Math.abs(i.delta) / (max || 1)) * 50) : 0;
  const opened = useAfterTransition();
  const [still] = React.useState(() => reduceMotionNow());
  const grow = useSharedValue(still ? 1 : 0);
  React.useEffect(() => {
    if (!opened || still) return;
    grow.set(withDelay(120 + index * 45, withTiming(1, { duration: GROW_MS, easing: Easing.bezier(0.16, 1, 0.3, 1) })));
  }, [opened, still, index, grow]);
  const right = !!i && i.delta > 0;
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  return (
    <View style={[{ height: TRACK, borderRadius: TRACK / 2, backgroundColor: c.fill }, style]}>
      {i && share > 0 && (
        <Animated.View
          style={[
            { position: "absolute", top: 0, bottom: 0, borderRadius: TRACK / 2, backgroundColor: fill, width: `${share}%`, transformOrigin: right ? "left center" : "right center" },
            right ? { left: "50%" } : { right: "50%" },
            anim,
          ]}
        />
      )}
      <View style={{ position: "absolute", top: -4, bottom: -4, left: "50%", width: 1.5, marginLeft: -0.75, borderRadius: 0.75, backgroundColor: c.tertiary }} />
    </View>
  );
}

function Item({ i, max, p, index }: { i: DriverItem; max: number; p: DriverListProps; index: number }) {
  const c = useCalm();
  const soft = useSoftFill();
  const e = effectOf(i);
  const impact = p.variant === "impact";
  // Raised in green, lowered in orange, no clear effect grey.
  const fill = e === "positive" ? c.tintInk.mint : e === "negative" ? c.system.orange : c.faint;
  const value = (
    <Txt size={17} lineHeight={22} color={e === "positive" ? c.tintInk.mint : e === "negative" ? c.system.orange : c.sub} style={font.numberAt(17)}>
      {fmt(i.delta, p.unit)}
    </Txt>
  );
  const track = <Track i={i} max={max} fill={fill} index={index} style={impact ? { flex: 1 } : undefined} />;
  const content = (
    <View style={{ gap: 10 }}>
      {impact ? (
        // The behaviour rows: the name in sentence case with a chevron (on its first line if it wraps), the % at the
        // track's end (spec §11 F17).
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <Txt size={16} lineHeight={21} color={c.ink} style={{ flexShrink: 1 }}>
            {i.label}
          </Txt>
          {p.onSelect && <ChevronRight size={18} color={c.tertiary} strokeWidth={2.4} style={{ marginRight: -4, marginTop: (21 - 18) / 2 }} />}
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <Txt size={16} lineHeight={21} color={c.ink} style={{ flexShrink: 1 }}>
            {i.label}
          </Txt>
          {value}
        </View>
      )}
      {impact ? (
        // The value's column has one width on every row, so the tracks (and their no-effect ticks) line up.
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {track}
          <View style={{ minWidth: valueWidth(p.unit), alignItems: "flex-end" }}>{value}</View>
        </View>
      ) : (
        track
      )}
      {impact && i.yes !== undefined && i.no !== undefined && (
        <Txt size={13} lineHeight={18} color={c.sub} style={{ fontVariant: ["tabular-nums"] }}>
          {i.yes} days with, {i.no} without.
          {i.ci && ` 90% CI ${fmt(i.ci[0], p.unit).replace(/^\+/, "")} to ${fmt(i.ci[1], p.unit).replace(/^\+/, "")}`}
        </Txt>
      )}
    </View>
  );
  const selected = p.selectedKey === i.key;
  const label = sentence(i, p.variant, p.unit, p.outcome);
  // One grouped list: rows split by hairlines. A row that opens a sheet presses in; the open one stays lit.
  return (
    <>
      {index > 0 && <Hairline inCard={p.inCard} />}
      <Pressable
        onPress={p.onSelect ? () => p.onSelect?.(i.key) : undefined}
        disabled={!p.onSelect}
        accessibilityRole={p.onSelect ? "button" : undefined}
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={({ pressed }) => [rowBox(p.inCard), { backgroundColor: selected ? alpha(c.teal, 0.1) : pressed && p.onSelect ? soft : "transparent" }]}
      >
        {content}
      </Pressable>
    </>
  );
}

/** Inside a card a row keeps the card's inset (its press tint overhangs 8 px); alone it pads itself in its card. */
const rowBox = (inCard?: boolean): ViewStyle => (inCard ? { marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 12, borderRadius: 12 } : { paddingHorizontal: 16, paddingVertical: 12 });

function Hairline({ inCard }: { inCard?: boolean }) {
  const c = useCalm();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: inCard ? 0 : 16 }} />;
}

/** The rows' container: inside a card they sit flush (the card's padding is theirs); alone, one card holds them all. */
function Group({ inCard, children }: { inCard?: boolean; children: React.ReactNode }) {
  if (inCard) return <View>{children}</View>;
  return (
    <Card padding={0}>
      <View style={{ paddingVertical: 2 }}>{children}</View>
    </Card>
  );
}

/** Ranked effects as diverging capsule bars around a no-effect tick (spec §5.4). */
export function DriverList(p: DriverListProps) {
  const empty =
    p.variant === "recovery" ? (
      <EmptyState body="No drivers yet: Recovery needs 7 nights first." />
    ) : (
      <EmptyState
        body="Not enough check-ins yet. Insights need 5 days with and 5 without a behaviour in the last 90 days."
        action={p.onCheckIn ? { label: "Check in", onPress: p.onCheckIn } : undefined}
      />
    );
  return (
    <MetricState metric={p.data} skeleton={<DriverListSkeleton variant={p.variant} unit={p.unit} inCard={p.inCard} />} empty={empty} renderReason={() => null}>
      {(items, meta) => {
        const max = Math.max(...items.map((i) => Math.abs(i.delta)));
        return (
          <View style={{ gap: 8 }}>
            <Header variant={p.variant} unit={p.unit} provisional={meta.provisional} />
            <Group inCard={p.inCard}>
              {items.map((i, k) => (
                <Item key={i.key} i={i} max={max} p={p} index={k} />
              ))}
            </Group>
          </View>
        );
      }}
    </MetricState>
  );
}

/** Loading shape (spec §5.19): the real header and each row's own shape, with bars for the label, value and caption. */
export function DriverListSkeleton({ variant = "impact", unit = "%", rows = 3, inCard }: { variant?: DriverListProps["variant"]; unit?: DriverListProps["unit"]; rows?: number; inCard?: boolean }) {
  const c = useCalm();
  const impact = variant === "impact";
  const value = <SkeletonText role="valueBase" chars={4} />;
  return (
    <View style={{ gap: 8 }}>
      <Header variant={variant} unit={unit} provisional={false} />
      <Group inCard={inCard}>
        {Array.from({ length: rows }, (_, k) => (
          <React.Fragment key={k}>
            {k > 0 && <Hairline inCard={inCard} />}
            <View style={[rowBox(inCard), { gap: 10 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <SkeletonText role={impact ? "bodyMedium" : "label"} width={112} />
                {!impact && value}
              </View>
              <View style={impact ? { flexDirection: "row", alignItems: "center", gap: 12 } : undefined}>
                <Track i={null} max={1} fill={c.faint} style={impact ? { flex: 1 } : undefined} />
                {impact && <View style={{ minWidth: valueWidth(unit), alignItems: "flex-end" }}>{value}</View>}
              </View>
              {impact && <SkeletonText role="caption" width={224} />}
            </View>
          </React.Fragment>
        ))}
      </Group>
    </View>
  );
}
DriverList.Skeleton = DriverListSkeleton;
