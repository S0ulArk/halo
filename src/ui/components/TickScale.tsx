// A ruler or a meter on one capsule, in the Apple Health language (spec §5.15). `marker` (Pace of Aging, a VO2 max
// percentile, the training load ratio): a thin track, a gradient from one end to the other or soft band stretches on
// iOS's track fill, with a white knob ringed in the value's colour that springs from the track's start to the value as
// it mounts (and from where it is to a new value), the value named over it and the ends labelled under it. `meter`
// (Energy): the value beside a capsule that fills to it. Every move runs on the UI thread; Reduce motion places them.
import * as React from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { DATA_COLORS, recoveryColor } from "@/lib/bands";
import { colorAt } from "@/lib/charts";
import { formatValue, spoken, type FormatKey } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { iosSpring } from "@/ui/motion/springs";
import { entranceStill } from "@/ui/motion/system";
import { useTheme } from "@/ui/ThemeProvider";
import { CapsuleMeter } from "./CapsuleMeter";
import { MetricState } from "./MetricState";
import { MetricTags } from "./primitives";
import { Skeleton } from "./Skeleton";
import { Txt } from "./Text";

export type TickScaleProps = {
  /** `marker`: a ruler with a knob (Pace of Aging, ACWR). `meter`: a capsule that fills (Energy). */
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
  /** Marker variant: soft stretches of the track inside a range (ACWR 0.8-1.5 optimal, above 1.5 warning). */
  bands?: { from: number; to: number; tone: "optimal" | "warning" }[];
  /** Marker variant: the track as a gradient from `min` to `max` (Pace of Aging: green, yellow, red); wins over bands. */
  colors?: readonly string[];
  /** End labels under the track, spread edge to edge ("−1.0x", "1.0x", "3.0x"). */
  ends?: string[];
  /** Marker variant: "Slow" / "Fast" with Turtle / Rabbit (icon + text nodes). */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

const TRACK = 8;
const KNOB = 20;
/** The knob's travel: a soft spring with the faintest settle (0.7 s, 0.82). */
const KNOB_SPRING = iosSpring(0.7, 0.82);

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

export function TickScale(p: TickScaleProps) {
  return (
    <MetricState metric={p.metric} skeleton={<TickScaleSkeleton variant={p.variant} />} empty={<Scale p={p} value={null} />} renderReason={() => <Scale p={p} value={null} />}>
      {(v, meta) => <Scale p={p} value={v} provisional={meta.provisional} />}
    </MetricState>
  );
}

/** The ruler's track and knob: the knob springs to `frac` along the measured width (a shared value: no re-render). */
function Track({ frac, color, colors, segments }: { frac: number | null; color: string; colors?: readonly string[]; segments: { from: number; to: number; color: string }[] }) {
  const calm = useCalm();
  const w = useSharedValue(0);
  const f = useSharedValue(frac !== null && entranceStill() ? frac : 0);
  React.useEffect(() => {
    if (frac === null) return;
    if (entranceStill()) {
      f.set(frac);
      return;
    }
    f.set(withDelay(120, withSpring(frac, KNOB_SPRING)));
    return () => cancelAnimation(f);
  }, [frac, f]);
  const knob = useAnimatedStyle(() => ({ opacity: w.value > 0 ? 1 : 0, transform: [{ translateX: f.value * w.value - KNOB / 2 }] }));
  return (
    <View onLayout={(e) => w.set(e.nativeEvent.layout.width)} style={{ height: KNOB, justifyContent: "center" }}>
      {colors?.length ? (
        <LinearGradient colors={colors.length > 1 ? [colors[0], colors[1], ...colors.slice(2)] : [colors[0], colors[0]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ height: TRACK, borderRadius: TRACK / 2, opacity: 0.9 }} />
      ) : (
        <View style={{ height: TRACK, borderRadius: TRACK / 2, backgroundColor: calm.fill, overflow: "hidden" }}>
          {segments.map((s, i) => (
            <View key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${s.from * 100}%`, width: `${(s.to - s.from) * 100}%`, borderRadius: TRACK / 2, backgroundColor: s.color }} />
          ))}
        </View>
      )}
      {frac !== null && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", left: 0, top: 0, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: "#ffffff", borderWidth: 3.5, borderColor: color, boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }, knob]}
        />
      )}
    </View>
  );
}

function Scale({ p, value, provisional }: { p: TickScaleProps; value: number | null; provisional?: boolean }) {
  const { c } = useTheme();
  const calm = useCalm();
  const span = p.max - p.min;
  const frac = value === null ? null : clamp01((value - p.min) / span);
  const text = formatValue(p.format, value);
  const valueText = value === null ? `${p.label}: no data` : `${p.label} ${spoken(text, p.unit)}${p.describe ? `: ${p.describe}` : ""}`;
  const band = value === null ? undefined : p.bands?.find((b) => value >= b.from && value <= b.to);
  const toneColor = (tone: "optimal" | "warning") => (tone === "optimal" ? calm.system.green : calm.system.orange);
  // The knob's ring: the gradient's colour under it, else its band's, else the ink.
  const knobColor = frac === null ? calm.faint : p.colors?.length ? colorAt(p.colors, frac) : band ? toneColor(band.tone) : calm.ink;
  const segments = (p.bands ?? []).map((b) => ({ from: clamp01((b.from - p.min) / span), to: clamp01((b.to - p.min) / span), color: alpha(toneColor(b.tone), 0.45) }));
  const symbol = p.unit === "%" || p.unit === "x";
  const size = p.variant === "meter" ? 24 : 22;
  const label = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Txt size={size} lineHeight={size + 6} numberOfLines={1} style={[font.numberAt(size), { color: value === null ? calm.faint : calm.ink }]}>
        {text}
        {/* A symbol unit (% or x) stays with the number in its face; a word unit is small and grey. */}
        {p.unit && value !== null ? (
          symbol ? (
            p.unit
          ) : (
            <Txt size={13} lineHeight={18} weight={600} style={{ color: calm.sub }}>
              {` ${p.unit}`}
            </Txt>
          )
        ) : null}
      </Txt>
      {provisional && <MetricTags provisional />}
    </View>
  );

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={valueText} style={{ minWidth: 0 }}>
      {p.variant === "meter" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {label}
          <View style={{ flex: 1, minWidth: 0 }}>
            <CapsuleMeter frac={frac} color={value === null ? calm.line : c[DATA_COLORS[recoveryColor(value)].fill]} height={TRACK} grow />
          </View>
        </View>
      ) : (
        <>
          <View style={{ marginBottom: 6, height: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>{p.leading}</View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>{p.trailing}</View>
            {/* The value named over its place on the track (kept clear of the ends' labels). */}
            <View style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.min(88, Math.max(12, (frac ?? 0.5) * 100))}%`, justifyContent: "center", alignItems: "center", width: 0 }}>
              <View style={{ position: "absolute", alignItems: "center" }}>{label}</View>
            </View>
          </View>
          <Track frac={frac} color={knobColor} colors={p.colors} segments={segments} />
        </>
      )}
      {p.ends && (
        <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
          {p.ends.map((e) => (
            <Txt key={e} size={12} lineHeight={16} style={[font.numeric(500), { color: calm.sub }]}>
              {e}
            </Txt>
          ))}
        </View>
      )}
    </View>
  );
}

/** The scale's box: the meter's 32 px row, or the marker's 82 px (value row, track, end labels). */
export function TickScaleSkeleton({ variant = "meter" }: { variant?: TickScaleProps["variant"] }) {
  return <Skeleton radius={variant === "marker" ? 14 : 8} style={variant === "marker" ? { height: 82, width: "100%" } : { height: 32, width: "100%" }} />;
}
TickScale.Skeleton = TickScaleSkeleton;
