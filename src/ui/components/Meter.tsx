// Calm meters: a flat capsule track (`calm.line`) with the value as a fill in its family or band ink, or as a dot on
// a track whose normal range is a faint segment; and the pastel pill a delta or a band word sits in. Views only (no
// SVG, no gradients).
// A fill or dot is placed with a UI-thread transform (Reanimated) and slides only when its value changes: never on
// mount, so a screen opening draws each meter once, already at its value.
import * as React from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { type ChipTone, type DeltaDir, type Tone } from "@/lib/bands";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { REASE } from "@/ui/motion/easing";
import { reduceMotionNow } from "@/ui/motion/system";
import { TABULAR } from "@/ui/fonts";
import { toneTint, useSoftFill } from "./calmKit";
import { Txt } from "./Text";

/** A changed value's fill or dot slides this long (the spec's ≤ 450 ms). */
const SLIDE_MS = 400;

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const fracOf = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : clamp01(v));

/**
 * A fraction (0-1) held on the UI thread: it starts at the first value at once and slides to each later one. The
 * track's width is a shared value too (set from onLayout), so measuring never re-renders the row.
 */
function useTrack(frac: number | null) {
  const f = useSharedValue(frac ?? 0);
  const width = useSharedValue(0);
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (frac === null) return;
    f.set(reduceMotionNow() ? frac : withTiming(frac, { duration: SLIDE_MS, easing: REASE.standard }));
  }, [frac, f]);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => width.set(e.nativeEvent.layout.width), [width]);
  return { f, width, onLayout };
}

export type CapsuleProps = {
  /** The fill as a share of the track, 0-1 (clamped); null draws the empty track. */
  value: number | null | undefined;
  /** The fill's colour (a family or band colour). */
  color: string;
  /** 6-12 px; the corners are always half of it. Default 8. */
  height?: number;
  /** A faint highlighted stretch of the track (a target or normal range), as 0-1 shares. */
  range?: [number, number] | null;
  style?: StyleProp<ViewStyle>;
};

/** A rounded horizontal bar filled to `value`: the kit's progress and band meter. */
export function Capsule({ value, color, height = 8, range, style }: CapsuleProps) {
  const c = useCalm();
  const frac = fracOf(value);
  const { f, width, onLayout } = useTrack(frac);
  const r = height / 2;
  // A full-width capsule slid left out of the clipped track: its right end stays round at any value, and a new value
  // is a transform, never a re-layout. Hidden for the one frame before the track is measured.
  const fill = useAnimatedStyle(() => ({ opacity: width.value > 0 ? 1 : 0, transform: [{ translateX: (f.value - 1) * width.value }] }));
  return (
    <View onLayout={onLayout} style={[{ height, borderRadius: r, backgroundColor: c.line, overflow: "hidden" }, style]}>
      {range && <Segment range={range} radius={r} color={alpha(c.ink, 0.12)} />}
      {frac !== null && frac > 0 && <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: "100%", borderRadius: r, backgroundColor: color }, fill]} />}
    </View>
  );
}

function Segment({ range, radius, color }: { range: [number, number]; radius: number; color: string }) {
  const lo = clamp01(Math.min(range[0], range[1]));
  const hi = clamp01(Math.max(range[0], range[1]));
  if (hi <= lo) return null;
  return <View style={{ position: "absolute", top: 0, bottom: 0, left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, borderRadius: radius, backgroundColor: color }} />;
}

export type RangeTrackProps = {
  /** Where the reading sits on the track, 0-1 (clamped); null: no dot. */
  value: number | null | undefined;
  /** The dot's colour. */
  color: string;
  /** The faint segment: the normal range, or the target's good side. */
  range?: [number, number] | null;
  /** Its colour; default a faint foreground. */
  rangeColor?: string;
  /** A thin tick across the track (a target), 0-1. */
  tick?: number | null;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

/** A capsule track with a highlighted range, an optional target tick, and the reading as a solid dot. */
export function RangeTrack({ value, color, range, rangeColor, tick, height = 8, style }: RangeTrackProps) {
  const c = useCalm();
  const frac = fracOf(value);
  const { f, width, onLayout } = useTrack(frac);
  const r = height / 2;
  const dot = height + 6;
  const dotStyle = useAnimatedStyle(() => ({ opacity: width.value > 0 ? 1 : 0, transform: [{ translateX: f.value * width.value - dot / 2 }] }));
  const t = fracOf(tick);
  return (
    <View onLayout={onLayout} style={[{ height, borderRadius: r, backgroundColor: c.line }, style]}>
      {range && <Segment range={range} radius={r} color={rangeColor ?? alpha(c.ink, 0.16)} />}
      {t !== null && <View style={{ position: "absolute", top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1, left: `${t * 100}%`, backgroundColor: c.sub }} />}
      {frac !== null && (
        <Animated.View
          style={[{ position: "absolute", left: 0, top: (height - dot) / 2, width: dot, height: dot, borderRadius: dot / 2, borderWidth: 2, borderColor: c.card, backgroundColor: color }, dotStyle]}
        />
      )}
    </View>
  );
}

/** A filled triangle (up or down) or a dot (flat), drawn with Views: no SVG per row. */
export function DeltaGlyph({ dir, color, size = 8 }: { dir: DeltaDir; color: string; size?: number }) {
  if (dir === "flat") return <View style={{ width: size - 2, height: size - 2, borderRadius: (size - 2) / 2, backgroundColor: color }} />;
  const half = size / 2;
  const h = Math.round(size * 0.8);
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: half,
        borderRightWidth: half,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        ...(dir === "up" ? { borderBottomWidth: h, borderBottomColor: color } : { borderTopWidth: h, borderTopColor: color }),
      }}
    />
  );
}

/**
 * A meaning chip: text (and an optional delta glyph) in a Calm pastel pill: good mint, bad / warning sand, alert rose,
 * neutral a quiet grey with grey text. `tone` is a good/bad/neutral delta tone or a chip tone; `color` tints it with
 * any colour instead (a band's).
 */
export function TonePill({ tone = "neutral", color, dir, children, style }: { tone?: Tone | ChipTone; color?: string; dir?: DeltaDir; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const quiet = useSoftFill();
  const tint = toneTint(tone);
  const fg = color ?? (tint ? c.tintInk[tint] : c.sub);
  const bg = color ? alpha(color, 0.15) : tint ? c.tint[tint] : quiet;
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, height: 24, borderRadius: 12, paddingHorizontal: 9, backgroundColor: bg }, style]}>
      {dir && <DeltaGlyph dir={dir} color={fg} size={8} />}
      <Txt size={12} lineHeight={16} weight={600} color={fg} numberOfLines={1} style={TABULAR}>
        {children}
      </Txt>
    </View>
  );
}
