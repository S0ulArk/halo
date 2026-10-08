import * as React from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { DATA_COLORS, recoveryColor } from "@/lib/bands";
import { formatValue, spoken, type FormatKey } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { Reveal, useSlide } from "@/ui/motion/Slide";
import { COUNTABLE } from "@/ui/motion/timing";
import { useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { MetricState } from "./MetricState";
import { MetricTags, ValueUnit } from "./primitives";
import { Skeleton } from "./Skeleton";
import { Txt } from "./Text";

export type TickScaleProps = {
  /** `marker`: the reference app's ruler (Pace of Aging, ACWR). `meter`: a segmented meter (Energy). */
  variant: "marker" | "meter";
  /** Spoken name for the meter: "Pace of Aging", "Energy". */
  label: string;
  metric: Metric<number> | null | undefined;
  min: number;
  max: number;
  format: FormatKey;
  unit?: string;
  /** Appended to the spoken value: "aging slower than your 6-month average". */
  describe?: string;
  /** Marker variant: tint ticks inside a range (ACWR 0.8-1.3 optimal, above 1.5 warning). */
  bands?: { from: number; to: number; tone: "optimal" | "warning" }[];
  /** End labels under the ticks, spread edge to edge ("−1.0x", "1.0x", "3.0x"). */
  ends?: string[];
  /** Marker variant: "Slow" / "Fast" with Turtle / Rabbit (icon + text nodes). */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

const COUNT = 48;
/** Ticks are 2 px wide, spread edge to edge: tick i starts at i × gap. */
const gapOf = (width: number) => (width - 2) / (COUNT - 1);

/**
 * A tick ruler or meter (spec §5.15). The meter's lit ticks wipe in from the left as its value counts up (700 ms);
 * the ruler's marker slides in from the left end. Both re-run from where they are when the value changes.
 */
export function TickScale(p: TickScaleProps) {
  return (
    <MetricState metric={p.metric} skeleton={<TickScaleSkeleton variant={p.variant} />} empty={<Scale p={p} value={null} />} renderReason={() => <Scale p={p} value={null} />}>
      {(v, meta) => <Scale p={p} value={v} provisional={meta.provisional} />}
    </MetricState>
  );
}

function Scale({ p, value, provisional }: { p: TickScaleProps; value: number | null; provisional?: boolean }) {
  const { c } = useTheme();
  const calm = useCalm();
  const span = p.max - p.min;
  const at = (i: number) => p.min + (i / (COUNT - 1)) * span;
  const frac = value === null ? null : Math.min(1, Math.max(0, (value - p.min) / span));
  const near = frac === null ? -9 : Math.round(frac * (COUNT - 1));
  const text = formatValue(p.format, value);
  const fill = value === null ? null : c[DATA_COLORS[recoveryColor(value)].fill];
  const valueText = value === null ? `${p.label}: no data` : `${p.label} ${spoken(text, p.unit)}${p.describe ? `: ${p.describe}` : ""}`;

  // The track: every tick 2 × 20, tinted inside the ruler's bands. The lit ticks and the marker are drawn over it.
  const track = (i: number) => {
    const band = p.variant === "marker" && p.bands?.find((b) => at(i) >= b.from && at(i) <= b.to);
    return band ? alpha(band.tone === "optimal" ? c.optimal : c.warning, 0.6) : calm.line;
  };
  const lit = fill !== null && near >= 0;
  // The meter's wipe stops in the gap after the last lit tick, so no tick is ever cut in half.
  const cut = (w: number) => (near >= COUNT - 1 ? w : near * gapOf(w) + 1 + gapOf(w) / 2);
  // The ruler's marker: three 3 × 32 bars centred on the ticks around the value.
  const marker = useSlide(p.variant === "marker" && near >= 0 ? (w) => near * gapOf(w) + 1 : null, () => 1);
  const row = (color: (i: number) => string) => (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
      {Array.from({ length: COUNT }, (_, i) => (
        <View key={i} style={{ height: 20, width: 2, borderRadius: 2, backgroundColor: color(i) }} />
      ))}
    </View>
  );

  const symbol = p.unit === "%" || p.unit === "x";
  const label = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <ValueUnit
        value={text}
        // The meter's number counts with its fill; the ruler's sits still over its marker.
        count={p.variant === "meter" && value !== null && COUNTABLE[p.format] ? { value, format: p.format } : null}
        align="left"
        unit={p.unit}
        role="value"
        size={p.variant === "meter" ? 24 : 22}
        lineHeight={p.variant === "meter" ? 32 : 28}
        color={value === null ? calm.faint : calm.ink}
        // A symbol unit (% or x) stays with the number in its face; a word unit is the Calm unit: small, grey, Figtree.
        unitStyle={
          symbol
            ? { fontSize: Math.round((p.variant === "meter" ? 24 : 22) * 0.7), fontFamily: "Barlow_700Bold", color: calm.ink, marginLeft: 0 }
            : { fontSize: 12, lineHeight: 16, fontFamily: "Figtree_500Medium", color: calm.sub }
        }
      />
      {provisional && <MetricTags provisional />}
    </View>
  );

  const ticks = (
    <View onLayout={marker.onLayout} style={{ height: 32, flex: 1, minWidth: 0, overflow: "hidden" }}>
      {row(track)}
      {p.variant === "meter" && lit && (
        <Reveal cut={cut} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
          {row(() => fill ?? calm.line)}
        </Reveal>
      )}
      {p.variant === "marker" && lit && marker.width > 0 && (
        <Animated.View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: -gapOf(marker.width) - 1.5, width: 2 * gapOf(marker.width) + 3, height: 32, flexDirection: "row", justifyContent: "space-between", transform: [{ translateX: marker.x }] }}>
          {[-1, 0, 1].map((k) => (
            <View key={k} style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: calm.ink, opacity: near + k < 0 || near + k > COUNT - 1 ? 0 : 1 }} />
          ))}
        </Animated.View>
      )}
    </View>
  );

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={valueText} style={{ minWidth: 0 }}>
      {p.variant === "meter" ? (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          {label}
          {ticks}
        </View>
      ) : (
        <>
          <View style={{ marginBottom: 4, height: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>{p.leading}</View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>{p.trailing}</View>
            <View style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.min(88, Math.max(12, (frac ?? 0.5) * 100))}%`, justifyContent: "center", alignItems: "center", width: 0 }}>
              <View style={{ position: "absolute", alignItems: "center" }}>{label}</View>
            </View>
          </View>
          {ticks}
        </>
      )}
      {p.ends && (
        <View style={{ marginTop: 4, flexDirection: "row", justifyContent: "space-between" }}>
          {p.ends.map((e) => (
            <Txt key={e} role="numericSmall" color={calm.faint}>
              {e}
            </Txt>
          ))}
        </View>
      )}
    </View>
  );
}

/** The scale's box: the meter's 32 px row, or the marker's 84 px (value row, ticks, end labels). */
export function TickScaleSkeleton({ variant = "meter" }: { variant?: TickScaleProps["variant"] }) {
  return <Skeleton radius={variant === "marker" ? 14 : 8} style={variant === "marker" ? { height: 84, width: "100%" } : { height: 32, width: "100%" }} />;
}
TickScale.Skeleton = TickScaleSkeleton;
