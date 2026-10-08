import * as React from "react";
import { Dimensions, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from "@expo-google-fonts/barlow";
import { Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from "@expo-google-fonts/figtree";
import {
  Canvas,
  Circle,
  DashPathEffect,
  Glyphs,
  Group,
  Line,
  LinearGradient,
  loadData,
  Path,
  RoundedRect,
  Shadow,
  Skia,
  Text as SkText,
  vec,
  type SkFont,
  type SkPath,
  type SkTypeface,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { ArrowUpRight } from "lucide-react-native";
import { bandColor, bandStops, type Band } from "@/lib/charts";
import { bandIndexClamped, minuteText } from "@/lib/chartmath";
import { clock } from "@/lib/format";
import { alpha, mix } from "@/lib/utils";
import { CALM, useCalm, type CalmPalette } from "@/ui/calm";
import { useReduceMotion } from "@/ui/motion";
import { useAfterTransition } from "./AfterTransition";
import { softFill, useSoftFill } from "./calmKit";

// The pieces every chart shares, drawn on the GPU with Skia: a measured figure that waits for the screen's open
// transition, the chart typefaces, the tap / scrub gestures (run on the UI thread), the draw-in progress and the
// shared marks in the Calm chart language (dotted grid, pills, gradients, the scrub cursor, dot and readout).

export type { Band };

/** Axis text: Barlow 500 at 12 px in the Calm faint grey, the tick 8 px off the axis. */
export const AXIS = { fontSize: 12, tickMargin: 8, xAxisHeight: 30 } as const;

// --- The Calm chart colours ---

/**
 * What every chart paints with, from the Calm palette (src/ui/calm.ts): a dotted grid and axis text in the faint grey,
 * guides and the scrub cursor in the ink at low opacity, marked points ringed in the card colour, the readout a white
 * pill (a raised chip on dark) with a soft edge. One object per scheme, so a chart's memo deps stay stable.
 */
export type ChartInk = {
  /** The grid's dots: the faint grey, softened. */
  grid: string;
  /** Axis text. */
  axis: string;
  /** Emphasised axis text (the shown day, bed and wake). */
  axisStrong: string;
  /** Value labels on a plot. */
  label: string;
  ink: string;
  sub: string;
  faint: string;
  card: string;
  /** The dashed scrub cursor: the ink at 30 %. */
  cursor: string;
  /** Dashed reference lines (average, goal, now, bed and wake). */
  guide: string;
  /** The ring round a marked point (the card colour, so the dot reads as cut out of the line). */
  ring: string;
  /** The scrubbed dot's ring: white on light, the near-white ink on dark. */
  scrubRing: string;
  /** The readout pill, its hairline edge and its soft shadow. */
  readout: string;
  readoutEdge: string;
  readoutShadow: string;
  /** A neutral wash (the scrubbed column, a lit day). */
  wash: string;
  /** A bar's empty track. */
  track: string;
  /** The highlight accent ("this one") and the secondary series hue. */
  orange: string;
  navy: string;
  /** Opacity of past / non-selected bars; the selected or latest bar is at full ink. */
  dim: number;
  palette: CalmPalette;
};

function makeInk(c: CalmPalette, dark: boolean): ChartInk {
  return {
    grid: alpha(c.faint, dark ? 0.5 : 0.6),
    axis: c.faint,
    axisStrong: c.ink,
    label: c.sub,
    ink: c.ink,
    sub: c.sub,
    faint: c.faint,
    card: c.card,
    cursor: alpha(c.ink, 0.3),
    guide: alpha(c.ink, dark ? 0.32 : 0.36),
    ring: c.card,
    scrubRing: dark ? c.ink : c.card,
    readout: c.chip,
    readoutEdge: c.edge,
    readoutShadow: dark ? alpha(c.ground, 0.7) : alpha(c.ink, 0.12),
    wash: alpha(c.ink, dark ? 0.06 : 0.045),
    track: c.line,
    orange: c.orange,
    navy: c.navy,
    dim: dark ? 0.45 : 0.4,
    palette: c,
  };
}
// Made on first use (not at module load), one per palette, so the object a chart keys its memos on never changes.
const inks = new WeakMap<CalmPalette, ChartInk>();

/** The Calm chart colours for a palette (stable per scheme). */
export function chartInk(c: CalmPalette): ChartInk {
  let k = inks.get(c);
  if (!k) {
    k = makeInk(c, c === CALM.dark);
    inks.set(c, k);
  }
  return k;
}

/** The Calm chart colours for the active scheme. */
export function useChartInk(): ChartInk {
  return chartInk(useCalm());
}

/** `color` mixed toward the card by `1 - p` (opaque): a zone, band or stage fill made a soft pastel of its colour. */
export function pastel(color: string, k: ChartInk, p = 0.55): string {
  return mix(color, k.card, p);
}

// --- Typefaces ---

export type FaceWeight = 500 | 600 | 700;
/** Barlow (numerals) and Figtree (words) as Skia fonts, created once per weight and size. */
export type ChartFonts = { num: (weight: FaceWeight, size: number) => SkFont; sans: (weight: FaceWeight, size: number) => SkFont };

const SOURCES = { n500: Barlow_500Medium, n600: Barlow_600SemiBold, n700: Barlow_700Bold, s500: Figtree_500Medium, s600: Figtree_600SemiBold, s700: Figtree_700Bold } as const;
type FaceKey = keyof typeof SOURCES;
const FACE_KEYS = Object.keys(SOURCES) as FaceKey[];

let faces: Record<FaceKey, SkTypeface> | null = null;
let pending: Promise<void> | null = null;
const faceListeners = new Set<() => void>();

/** Reads the six TTFs once for the whole app (the same files expo-font registers for the RN text). */
function loadFaces(): Promise<void> {
  if (faces) return Promise.resolve();
  if (!pending)
    pending = Promise.all(FACE_KEYS.map((k) => loadData<SkTypeface>(SOURCES[k], (d) => Skia.Typeface.MakeFreeTypeFaceFromData(d))))
      .then((list) => {
        if (list.some((t) => !t)) throw new Error("A chart typeface did not load");
        faces = Object.fromEntries(FACE_KEYS.map((k, i) => [k, list[i]])) as Record<FaceKey, SkTypeface>;
        faceListeners.forEach((l) => l());
      })
      .catch(() => {
        // A failed read retries on the next chart mount.
        pending = null;
      });
  return pending;
}
// Start as soon as the kit loads, so the faces are in before the first chart's screen has finished opening.
Promise.resolve().then(loadFaces, () => {});

const fontCache = new Map<string, SkFont>();
function fontOf(face: FaceKey, size: number): SkFont {
  const key = `${face}:${size}`;
  let f = fontCache.get(key);
  if (!f) {
    // (No setSubpixel: Skia 2.6.2's native side reads its argument as a number and throws on a boolean.)
    f = Skia.Font(faces![face], size);
    fontCache.set(key, f);
  }
  return f;
}
const FONTS: ChartFonts = { num: (w, s) => fontOf(`n${w}`, s), sans: (w, s) => fontOf(`s${w}`, s) };
const subscribeFaces = (l: () => void) => {
  faceListeners.add(l);
  return () => {
    faceListeners.delete(l);
  };
};
const facesReady = () => faces !== null;

/** The chart fonts, or null until the typefaces have loaded (a chart draws nothing until then, holding its box). */
export function useChartFonts(): ChartFonts | null {
  const ready = React.useSyncExternalStore(subscribeFaces, facesReady, facesReady);
  React.useEffect(() => {
    if (!ready) void loadFaces();
  }, [ready]);
  return ready ? FONTS : null;
}

/**
 * A path string Skia will accept: Skia throws on a malformed SVG path (react-native-svg drew nothing), so a value
 * that went NaN or an empty run becomes an empty move instead of a crash.
 */
export const sp = (d: string) => (!d || d.includes("NaN") || d.includes("Infinity") ? "M0 0" : d);

/** Width of `text` set in `font`. */
export const measure = (font: SkFont, text: string) => (text ? font.getTextWidth(text) : 0);

/** The baseline of a single line of `font` centred in a line box of `lineHeight` starting at `top` (RN's text layout). */
export function baselineIn(font: SkFont, top: number, lineHeight: number) {
  const m = font.getMetrics();
  return top + (lineHeight - (m.descent - m.ascent)) / 2 - m.ascent;
}

/** Glyphs of `text` with `tracking` px after each glyph (RN's letterSpacing), for a caps label drawn in Skia. */
export function trackedGlyphs(font: SkFont, text: string, tracking: number): { glyphs: { id: number; pos: { x: number; y: number } }[]; width: number } {
  if (!text) return { glyphs: [], width: 0 };
  const ids = font.getGlyphIDs(text);
  const widths = font.getGlyphWidths(ids);
  let x = 0;
  const glyphs = ids.map((id, i) => {
    const g = { id, pos: { x, y: 0 } };
    x += widths[i] + tracking;
    return g;
  });
  return { glyphs, width: Math.max(0, x - tracking) };
}

/**
 * "HH:mm" for each instant (epoch ms) in `timeZone`, a whole day of minutes at a time: Intl formats one instant per
 * UTC hour and the minutes inside it are added on (zone changes happen on whole hours, so this stays exact).
 */
export function clockLabels(ts: readonly number[], timeZone?: string): string[] {
  const hours = new Map<number, number>();
  return ts.map((t) => {
    const h0 = Math.floor(t / 3_600_000) * 3_600_000;
    let base = hours.get(h0);
    if (base === undefined) {
      const s = clock(h0, timeZone);
      base = Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
      hours.set(h0, base);
    }
    return minuteText(base + Math.floor((t - h0) / 60_000));
  });
}

// --- Mounting and draw-in ---

const DRAW_IN_MS = 520;

const sameDeps = (a?: React.DependencyList, b?: React.DependencyList) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Canvas mounts, one per frame: a chart's first draw is its one expensive frame, so a screen's charts (and their
 * small scrub layers) take turns instead of all drawing in the same frame. First come, first served: top to bottom.
 */
const slots: (() => void)[] = [];
let pumping = false;
function pump() {
  const next = slots.shift();
  next?.();
  if (slots.length) requestAnimationFrame(() => requestAnimationFrame(pump));
  else pumping = false;
}
function requestSlot(grant: () => void): () => void {
  slots.push(grant);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return () => {
    const i = slots.indexOf(grant);
    if (i >= 0) slots.splice(i, 1);
  };
}

/** Whether a box at window y (height h) is on screen or about to scroll onto it. */
const nearScreen = (y: number, h: number) => h > 0 && y < Dimensions.get("window").height + 80 && y + h > -80;

/**
 * Charts below the fold wait until they scroll near the screen (a TextureView's creation and first draw is the one
 * expensive frame a chart has; a screen opening shouldn't pay it for charts nobody sees yet). One poll for all of them,
 * five times a second, only while some are waiting. A covered screen's charts don't move, so they keep waiting.
 */
type Waiting = { node: View; grant: () => void };
const waiting = new Set<Waiting>();
let poll: ReturnType<typeof setInterval> | null = null;
function checkWaiting() {
  for (const w of waiting)
    w.node.measureInWindow((_x, y, _w, h) => {
      if (waiting.has(w) && nearScreen(y, h)) {
        waiting.delete(w);
        w.grant();
      }
    });
  if (!waiting.size && poll) {
    clearInterval(poll);
    poll = null;
  }
}
function waitForScreen(w: Waiting): () => void {
  waiting.add(w);
  if (!poll) poll = setInterval(checkWaiting, 200);
  return () => {
    waiting.delete(w);
  };
}

/**
 * False until `want` has held, the box (when given) is on or near the screen, and this component's turn to mount a
 * canvas has come.
 */
export function useMountSlot(want: boolean, box?: React.RefObject<View | null>): boolean {
  const [granted, setGranted] = React.useState(false);
  React.useEffect(() => {
    if (!want || granted) return;
    let cancel = () => {};
    let live = true;
    const grant = () => {
      if (live) cancel = requestSlot(() => setGranted(true));
    };
    const node = box?.current;
    if (!node) grant();
    else
      node.measureInWindow((_x, y, _w, h) => {
        if (!live) return;
        if (nearScreen(y, h)) grant();
        else cancel = waitForScreen({ node, grant });
      });
    return () => {
      live = false;
      cancel();
    };
  }, [want, granted, box]);
  return want && granted;
}

/**
 * False until the first scrub: the scrub's text layers (readouts, tooltips) are canvases of their own, so they mount
 * when a finger first lands on the chart rather than with the screen. One JS call per chart, ever.
 */
export function useScrubArmed(active: SharedValue<number>): boolean {
  const [armed, setArmed] = React.useState(false);
  useAnimatedReaction(
    () => active.value >= 0,
    (on, was) => {
      if (on && !was && !armed) scheduleOnRN(setArmed, true);
    },
    [armed],
  );
  return armed;
}

/** What replays a chart's draw-in when it changes: a range, a day. */
export type DrawInKey = string | number | null | undefined;

/**
 * 0 → 1 over ~500 ms (Reanimated, UI thread) once the chart has drawn, and again whenever `key` changes; at once
 * when the system asks to remove animations or the chart mounted below the screen's fold (it is never seen drawing).
 */
export function useDrawIn(ready: boolean, key: DrawInKey, box: React.RefObject<View | null>): SharedValue<number> {
  const reduce = useReduceMotion();
  const progress = useSharedValue(0);
  // Hidden before the first frame of new content shows (a layout effect runs ahead of the next frame).
  React.useLayoutEffect(() => {
    if (!ready) return;
    if (reduce) {
      progress.set(1);
      return;
    }
    progress.set(0);
    let live = true;
    const node = box.current;
    const run = (visible: boolean) => {
      if (!live) return;
      progress.set(visible ? withTiming(1, { duration: DRAW_IN_MS, easing: Easing.out(Easing.cubic) }) : 1);
    };
    if (node) node.measureInWindow((_x, y, _w, h) => run(h > 0 && y < Dimensions.get("window").height && y + h > 0));
    else run(true);
    return () => {
      live = false;
    };
  }, [ready, key, reduce, progress, box]);
  return progress;
}

/**
 * The draw-in without redrawing the chart: the canvas is drawn once and revealed by two counter-moving native views
 * (the outer clips, the inner holds the drawing in place), so each frame only moves two layers on the render thread.
 * `wipe` reveals left to right (a line is traced); `rise` bottom up (bars grow from the floor).
 */
export function NativeReveal({ progress, mode, width, height, children }: { progress: SharedValue<number>; mode: "wipe" | "rise"; width: number; height: number; children: React.ReactNode }) {
  const outer = useAnimatedStyle(() => {
    const k = 1 - progress.value;
    return { transform: mode === "wipe" ? [{ translateX: -width * k }] : [{ translateY: height * k }] };
  });
  const inner = useAnimatedStyle(() => {
    const k = 1 - progress.value;
    return { transform: mode === "wipe" ? [{ translateX: width * k }] : [{ translateY: -height * k }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ width, height, overflow: "hidden" }, outer]}>
      <Animated.View style={[{ width, height }, inner]}>{children}</Animated.View>
    </Animated.View>
  );
}

// --- Gestures ---

/** A scrub: `toIndex` (a worklet) maps a finger's x on the canvas to the index it points at, -1 for none. */
export type Scrub = { active: SharedValue<number>; toIndex: (x: number, width: number) => number };

/** A shared value holding the scrubbed index (-1: none) and the scrub for a band chart of `n` columns across [x0, width - right]. */
export function useBandScrub(x0: number, right: number, n: number): Scrub {
  const active = useSharedValue(-1);
  const toIndex = React.useCallback(
    (x: number, width: number) => {
      "worklet";
      return bandIndexClamped(x, x0, width - right, n);
    },
    [x0, right, n],
  );
  return React.useMemo(() => ({ active, toIndex }), [active, toIndex]);
}

/**
 * The figure's gestures, all on the UI thread: a horizontal drag (or a press held ~0.2 s) scrubs, a tap opens the
 * explorer. A vertical drag fails both, so the screen still scrolls under a finger that lands on a chart.
 */
function useChartGesture(width: number, press: (() => void) | null, scrub?: Scrub) {
  const active = scrub?.active;
  const toIndex = scrub?.toIndex;
  return React.useMemo(() => {
    const list: GestureType[] = [];
    if (active && toIndex) {
      const set = (x: number) => {
        "worklet";
        active.set(toIndex(x, width));
      };
      const clear = () => {
        "worklet";
        active.set(-1);
      };
      list.push(
        Gesture.Pan()
          .activeOffsetX([-6, 6])
          .failOffsetY([-12, 12])
          .onStart((e) => {
            "worklet";
            set(e.x);
          })
          .onUpdate((e) => {
            "worklet";
            set(e.x);
          })
          .onEnd(() => {
            "worklet";
            clear();
          }),
      );
      list.push(
        Gesture.Pan()
          .activateAfterLongPress(press ? 220 : 120)
          .onStart((e) => {
            "worklet";
            set(e.x);
          })
          .onUpdate((e) => {
            "worklet";
            set(e.x);
          })
          .onEnd(() => {
            "worklet";
            clear();
          }),
      );
    }
    if (press)
      list.push(
        Gesture.Tap()
          .maxDuration(320)
          .maxDistance(12)
          .onEnd((_e, success) => {
            "worklet";
            if (success) scheduleOnRN(press);
          }),
      );
    if (!list.length) return null;
    return list.length === 1 ? list[0] : Gesture.Race(...list);
  }, [width, press, active, toIndex]);
}

// --- The figure ---

export type ChartRender = { width: number; fonts: ChartFonts };

/**
 * A chart's box at a fixed height: measures its width and hands it to `children`, which draw with Skia. The summary is
 * the figure's accessible description.
 *
 * The drawing waits for the screen's open transition (useAfterTransition), the chart typefaces and its turn to mount
 * (one canvas per frame): the box holds its height, so nothing moves. The canvas is drawn once per data and width
 * (`deps`) and then only revealed (`reveal`, a native wipe or rise); nothing in it animates. `underlay` and `overlay`
 * are React Native layers under and over it (the scrub band, cursor, dot and readout), bound to shared values, so a
 * scrub moves a few small layers and never redraws the chart. `onPress` makes a tap open the explorer.
 */
export function ChartFigure({
  height,
  summary,
  style,
  deps,
  drawIn,
  reveal = "wipe",
  onPress,
  scrub,
  underlay,
  overlay,
  children,
}: {
  height: number;
  summary: string;
  style?: StyleProp<ViewStyle>;
  deps?: React.DependencyList;
  /**
   * What replays the draw-in when it changes (a new range, another day). Without it the chart draws in once, on mount:
   * a refetch or a parent re-render redraws it in place.
   */
  drawIn?: DrawInKey;
  /** `wipe` (lines: traced left to right) or `rise` (bars: revealed from the floor up). */
  reveal?: "wipe" | "rise";
  onPress?: () => void;
  scrub?: Scrub;
  /** React Native layers under the canvas (a scrubbed bar's highlight). */
  underlay?: (r: ChartRender) => React.ReactNode;
  /** React Native layers over the canvas (the scrub cursor, dot and readout). */
  overlay?: (r: ChartRender) => React.ReactNode;
  children: (r: ChartRender) => React.ReactNode;
}) {
  const [width, setWidth] = React.useState(0);
  const opened = useAfterTransition();
  const fonts = useChartFonts();
  const boxRef = React.useRef<View>(null);
  const mounted = useMountSlot(width > 0 && opened && !!fonts, boxRef);
  const progress = useDrawIn(mounted, drawIn, boxRef);
  // A stable JS callback for the tap (the gesture is rebuilt only when the press appears or goes).
  const pressRef = React.useRef(onPress);
  React.useLayoutEffect(() => {
    pressRef.current = onPress;
  });
  const fire = React.useCallback(() => pressRef.current?.(), []);
  const gesture = useChartGesture(width, onPress ? fire : null, scrub);
  const r: ChartRender | null = mounted ? { width, fonts: fonts! } : null;

  const box = (
    <View
      ref={boxRef}
      accessible
      accessibilityLabel={summary}
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityHint={onPress ? "Opens the chart explorer" : undefined}
      accessibilityActions={onPress ? [{ name: "activate" }] : undefined}
      onAccessibilityAction={onPress ? (e) => e.nativeEvent.actionName === "activate" && fire() : undefined}
      style={[{ height, width: "100%" }, gesture ? null : style]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {r && (
        <>
          {underlay?.(r)}
          <NativeReveal progress={progress} mode={reveal} width={width} height={height}>
            <Canvas style={{ width, height }}>
              <Plot r={r} draw={children} deps={deps} />
            </Canvas>
          </NativeReveal>
          {overlay?.(r)}
        </>
      )}
    </View>
  );
  if (!gesture) return box;
  // The app's root GestureHandlerRootView (app/_layout.tsx) handles these, sheets included (they render in its portal).
  return (
    <View style={[{ height, width: "100%" }, style]}>
      <GestureDetector gesture={gesture}>{box}</GestureDetector>
    </View>
  );
}

/** The static drawing: skipped while the width, the fonts and every dep are unchanged (always redrawn without deps). */
const Plot = React.memo(
  function Plot({ r, draw }: { r: ChartRender; draw: (r: ChartRender) => React.ReactNode; deps?: React.DependencyList }) {
    return <>{draw(r)}</>;
  },
  (prev, next) => prev.r.width === next.r.width && prev.r.fonts === next.r.fonts && sameDeps(prev.deps, next.deps),
);

/**
 * A signature of a series' numbers: equal for equal content. Screens rebuild a chart's data object on every render; a
 * chart keyed on this (not on the object) redraws only when its numbers change.
 */
export function numbersSig(...lists: readonly (readonly (number | null | undefined)[])[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0;
  let n = 0;
  for (const list of lists) {
    for (const v of list) {
      const q = v == null || !Number.isFinite(v) ? -0x5f3759df : Math.round(v * 1000);
      h1 = Math.imul(h1 ^ (q & 0xffff), 16777619) ^ Math.imul(h1, 31);
      h2 = (h2 + Math.imul(q | 0, 2654435761)) | 0;
      n++;
    }
    h1 = Math.imul(h1 ^ 0x9e37, 16777619);
  }
  return `${n}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
}

/** `value` as first seen for `sig` (its content's signature): a re-render with equal content keeps the same object. */
export function useStableBy<T>(value: T, sig: string): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useMemo(() => value, [sig]);
}

// --- Layout helpers (unchanged from the SVG kit) ---

/** Tick text for a numeric axis: whole numbers drop their ".0" (48, not 48.0); others keep the metric's format. */
export const wholeTick = (fmt: (v: number) => string) => (v: number) => (Number.isInteger(v) ? Math.round(v).toLocaleString("en-US") : fmt(v));

/** Characters to px at 11 px bold, for pills and gutters. */
export const textWidth = (t: string) => Math.ceil(t.length * 6.6);

/** Right margin that holds reference-line pills ("Avg", "7,000", "Your age") outside the plot. */
export const labelGutter = (labels: (string | false | null | undefined)[], base = 4) => {
  const widest = Math.max(0, ...labels.map((l) => (l ? textWidth(l) : 0)));
  return widest ? Math.max(base, widest + 16) : base;
};

// --- Marks ---

type Anchor = "start" | "middle" | "end";

/** Skia text with an SVG-style anchor; `y` is the baseline. `halo` strokes the glyphs first in that colour (4 px). */
export function SText({ x, y, text, font, color, anchor = "start", halo, opacity }: { x: number; y: number; text: string; font: SkFont; color: string; anchor?: Anchor; halo?: string; opacity?: number }) {
  if (!text) return null;
  const w = anchor === "start" ? 0 : measure(font, text);
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return (
    <Group opacity={opacity}>
      {halo && <SkText x={left} y={y} text={text} font={font} color={halo} style="stroke" strokeWidth={4} strokeJoin="round" />}
      <SkText x={left} y={y} text={text} font={font} color={color} />
    </Group>
  );
}

/** The Calm caption's tracking (px), for caps labels drawn by Skia. */
export const CAPS_TRACKING = 1.1;

/** Width of `text` as CapsText draws it (upper-cased, tracked). */
export const capsWidth = (font: SkFont, text: string, tracking = CAPS_TRACKING) => trackedGlyphs(font, text.toUpperCase(), tracking).width;

/**
 * A caps label drawn by Skia like the Calm caption: upper-cased and tracked, so a chart's lane and axis names read as
 * labels, never as values. `y` is the baseline; `anchor` places the tracked run's start, middle or end at `x`.
 */
export function CapsText({ x, y, text, font, color, anchor = "start", tracking = CAPS_TRACKING }: { x: number; y: number; text: string; font: SkFont; color: string; anchor?: Anchor; tracking?: number }) {
  const run = React.useMemo(() => trackedGlyphs(font, text.toUpperCase(), tracking), [font, text, tracking]);
  if (!run.glyphs.length) return null;
  const left = anchor === "middle" ? x - run.width / 2 : anchor === "end" ? x - run.width : x;
  return <Glyphs font={font} glyphs={run.glyphs} x={left} y={y} color={color} />;
}

/**
 * Text in the chart face (Barlow, or Figtree with `numeric={false}`). `baseline` "middle" centres on y; "hanging" hangs
 * under y (the web's dy 0.71em).
 */
export function AxisText({
  x,
  y,
  children,
  anchor = "middle",
  baseline = "middle",
  size = AXIS.fontSize,
  weight = 500,
  color,
  numeric = true,
}: {
  x: number;
  y: number;
  children: string;
  anchor?: Anchor;
  baseline?: "middle" | "hanging" | "alphabetic";
  size?: number;
  weight?: FaceWeight;
  color?: string;
  numeric?: boolean;
}) {
  const k = useChartInk();
  const fonts = useChartFonts();
  if (!fonts) return null;
  const dy = baseline === "middle" ? size * 0.35 : baseline === "hanging" ? size * 0.71 + size * 0.35 : 0;
  return <SText x={x} y={y + dy} text={children} font={numeric ? fonts.num(weight, size) : fonts.sans(weight, size)} color={color ?? k.axis} anchor={anchor} />;
}

/** A straight line, dashed with `dash` ([on, off] px); `round` gives the dashes round caps (soft guides). */
export function DashLine({ x1, y1, x2, y2, color, dash, width = 1, round = false }: { x1: number; y1: number; x2: number; y2: number; color: string; dash?: number[]; width?: number; round?: boolean }) {
  return (
    <Line p1={vec(x1, y1)} p2={vec(x2, y2)} color={color} strokeWidth={width} strokeCap={round ? "round" : "butt"} style="stroke">
      {dash && <DashPathEffect intervals={dash} />}
    </Line>
  );
}

/** The Calm guide: a soft dashed line in the ink at low opacity, round-capped (averages, goals, now, bed and wake). */
export function GuideLine({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color?: string }) {
  const k = useChartInk();
  return <DashLine x1={x1} y1={y1} x2={x2} y2={y2} color={color ?? k.guide} dash={[3, 5]} width={1.5} round />;
}

/** Dot spacing and size of the Calm grid: round dots on each row, never a solid rule. */
export const GRID_DOT = { gap: 6, size: 1.6 } as const;

/** A row of round dots from `x1` to `x2` at `y` (a zero-length dash with round caps is a dot). */
export function DotLine({ x1, x2, y, color }: { x1: number; x2: number; y: number; color: string }) {
  return (
    <Line p1={vec(x1, y)} p2={vec(x2, y)} color={color} strokeWidth={GRID_DOT.size} strokeCap="round" style="stroke">
      <DashPathEffect intervals={[0, GRID_DOT.gap]} />
    </Line>
  );
}

/** The Calm grid: dotted rows at `ys` from `x1` to `x2`, in the faint grey. */
export function Grid({ ys, x1, x2 }: { ys: number[]; x1: number; x2: number }) {
  const k = useChartInk();
  return (
    <Group>
      {ys.map((y, i) => (
        <DotLine key={i} x1={x1} x2={x2} y={y} color={k.grid} />
      ))}
    </Group>
  );
}

/** A filled pill at (x, y), vertically centred: the label of a reference line or a marked point. */
export function Pill({ x, y, text, fill, color, anchor = "start" }: { x: number; y: number; text: string; fill?: string; color?: string; anchor?: "start" | "middle" }) {
  const c = useCalm();
  const fonts = useChartFonts();
  if (!fonts) return null;
  const font = fonts.num(700, 11);
  const w = Math.max(textWidth(text) - 6, measure(font, text)) + 10;
  const left = anchor === "middle" ? x - w / 2 : x;
  return (
    <Group>
      {/* Charts sit on cards: the Calm quiet pill (the ground's grey, a raised chip on dark) with grey numerals. */}
      <RoundedRect x={left} y={y - 9} width={w} height={18} r={9} color={fill ?? softFill(c, "card")} />
      <SText x={left + w / 2} y={y + 11 * 0.35} text={text} font={font} color={color ?? c.sub} anchor="middle" />
    </Group>
  );
}

/**
 * A point's value on a small Calm pill (the latest reading on a line): right of the point when there is room (the empty
 * time after the latest reading), else over it (under it near the top), always inside the plot [left, right] × [top,
 * bottom], so it never runs off the chart or into the axes.
 */
export function ValuePill({
  x,
  y,
  text,
  font,
  left,
  right,
  top,
  bottom,
  color,
  fill,
}: {
  x: number;
  y: number;
  text: string;
  font: SkFont;
  left: number;
  right: number;
  top: number;
  bottom: number;
  color?: string;
  fill?: string;
}) {
  const c = useCalm();
  if (!text) return null;
  const h = 18;
  const w = measure(font, text) + 12;
  const gap = 10;
  let px: number;
  let py: number;
  if (x + gap + w <= right) {
    px = x + gap;
    py = y - h / 2;
  } else {
    px = x - w / 2;
    py = y - gap - h >= top ? y - gap - h : y + gap;
  }
  px = Math.min(right - w, Math.max(left, px));
  py = Math.min(bottom - h, Math.max(top, py));
  return (
    <Group>
      <RoundedRect x={px} y={py} width={w} height={h} r={h / 2} color={fill ?? softFill(c, "card")} />
      <SText x={px + w / 2} y={py + h / 2 + font.getSize() * 0.35} text={text} font={font} color={color ?? c.ink} anchor="middle" />
    </Group>
  );
}

/**
 * A vertical gradient that colours each height by the band of its value, between the series' top and bottom y (a
 * child of the Path it paints). Null when the series is flat: paint it `bandColor(top)` instead (see bandPaint).
 */
export function BandShader({ yTop, yBottom, top, bottom, bands }: { yTop: number; yBottom: number; top: number; bottom: number; bands: Band[] }) {
  if (!(top > bottom)) return null;
  const stops = bandStops(top, bottom, bands);
  return <LinearGradient start={vec(0, yTop)} end={vec(0, yBottom)} colors={stops.map((s) => s.color)} positions={stops.map((s) => s.offset)} />;
}

/** The solid colour of a flat banded series (no gradient needed), else undefined (the BandShader paints it). */
export const bandPaint = (top: number, bottom: number, bands: Band[]) => (top > bottom ? undefined : bandColor(top, bands));

/** A one-colour fade: `color` at `from` opacity at `y1` to `to` at `y2` (the Calm area under a line: 18 % to nothing). */
export function FadeShader({ color, from = 0.18, to = 0, y1, y2 }: { color: string; from?: number; to?: number; y1: number; y2: number }) {
  return <LinearGradient start={vec(0, y1)} end={vec(0, y2 === y1 ? y1 + 1 : y2)} colors={[alpha(color, from), alpha(color, to)]} />;
}

/** The Calm line stroke: 2.5 px, round caps and joins. */
export const LINE = { width: 2.5, thin: 2 } as const;

/** A marked point: a dot in `fill` ringed in the card colour (`ring` px), so it reads as cut out of the line. */
export function PointMark({ cx, cy, fill, r = 4.5, ring = 2.5, color }: { cx: number; cy: number; fill: string; r?: number; ring?: number; color?: string }) {
  const k = useChartInk();
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r + ring} color={color ?? k.ring} />
      <Circle cx={cx} cy={cy} r={r} color={fill} />
    </Group>
  );
}

/** Active dot: the series colour ringed in the card colour, at a marked point (static props). */
export function GlowDot({ cx, cy, fill }: { cx?: number; cy?: number; fill?: string }) {
  const k = useChartInk();
  if (cx == null || cy == null) return null;
  return <PointMark cx={cx} cy={cy} fill={fill ?? k.ink} />;
}

/** A path for a bar from `y` down `h` px: the top corners rounded `top`, the bottom ones `bottom` (a capsule when both are half the width). */
export function barPath(x: number, y: number, w: number, h: number, top: number, bottom = 0) {
  if (!(w > 0) || !(h > 0)) return "";
  const t = Math.max(0, Math.min(top, w / 2, h));
  const b = Math.max(0, Math.min(bottom, w / 2, h - t));
  let d = `M${x} ${y + t}`;
  d += t ? `a${t} ${t} 0 0 1 ${t} ${-t}h${w - 2 * t}a${t} ${t} 0 0 1 ${t} ${t}` : `h${w}`;
  d += `v${h - t - b}`;
  d += b ? `a${b} ${b} 0 0 1 ${-b} ${b}h${-(w - 2 * b)}a${b} ${b} 0 0 1 ${-b} ${-b}` : `h${-w}`;
  return `${d}Z`;
}

/** The Calm bar's corner radius at width `w`: a full capsule top while thin, a soft 8 px round once wide. */
export const barRadius = (w: number) => Math.min(w / 2, 8);

// --- Scrub layers (React Native views over the canvas, moved on the UI thread) ---

/** A dashed vertical line `height` tall: 4 on, 4 off, 1.5 px wide with round ends. */
function Dashes({ height, color }: { height: number; color: string }) {
  const n = Math.max(1, Math.floor(height / 8) + 1);
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ position: "absolute", left: 0, top: i * 8, width: 1.5, height: Math.max(0, Math.min(4, height - i * 8)), borderRadius: 0.75, backgroundColor: color }} />
      ))}
    </>
  );
}

const DOT = 14;
const HALO = 24;

/**
 * The scrub marks bound to the scrubbed index, on the UI thread: a dashed cursor (the ink at 30 %) through the plot and
 * a dot with a white ring at the point. `xs`/`ys` are each index's point (NaN y: no dot), `colors` its dot colour.
 * Native views: moving them is a transform, the chart under them is never redrawn.
 */
export function ScrubCursor({
  active,
  xs,
  ys,
  colors,
  top,
  bottom,
  dot = true,
  line = true,
}: {
  active: SharedValue<number>;
  xs: readonly number[];
  ys: readonly number[];
  colors: readonly string[];
  top: number;
  bottom: number;
  dot?: boolean;
  /** The dashed cursor line (off for a second series' dot on the same cursor). */
  line?: boolean;
}) {
  const k = useChartInk();
  // The halo colours are made here on the JS thread: the worklets only pick one (alpha() is not a worklet).
  const halos = React.useMemo(() => colors.map((x) => alpha(x, 0.16)), [colors]);
  const fallback = k.ink;
  const lineStyle = useAnimatedStyle(() => {
    const i = active.value;
    const on = i >= 0 && i < xs.length;
    return { opacity: on ? 1 : 0, transform: [{ translateX: on ? xs[i] - 0.75 : -100 }] };
  });
  const dotStyle = useAnimatedStyle(() => {
    const i = active.value;
    const y = ys[i];
    const on = i >= 0 && i < xs.length && y !== undefined && !Number.isNaN(y);
    return { opacity: on ? 1 : 0, transform: [{ translateX: on ? xs[i] - HALO / 2 : -100 }, { translateY: on ? y - HALO / 2 : -100 }] };
  });
  const fill = useAnimatedStyle(() => ({ backgroundColor: colors[active.value] ?? fallback }));
  const halo = useAnimatedStyle(() => ({ backgroundColor: halos[active.value] ?? "transparent" }));
  return (
    <>
      {line && (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top, width: 1.5, height: Math.max(0, bottom - top) }, lineStyle]}>
          <Dashes height={Math.max(0, bottom - top)} color={k.cursor} />
        </Animated.View>
      )}
      {dot && (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: HALO, height: HALO }, dotStyle]}>
          <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: HALO, height: HALO, borderRadius: HALO / 2 }, halo]} />
          <Animated.View style={[{ position: "absolute", left: (HALO - DOT) / 2, top: (HALO - DOT) / 2, width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 3, borderColor: k.scrubRing }, fill]} />
        </Animated.View>
      )}
    </>
  );
}

/** A soft rounded column behind the scrubbed bar (bar charts' hover): a native view under the canvas. */
export function ScrubBand({ active, x0, bandW, top, bottom }: { active: SharedValue<number>; x0: number; bandW: number; top: number; bottom: number }) {
  const k = useChartInk();
  const inset = Math.min(2, bandW * 0.08);
  const style = useAnimatedStyle(() => ({ opacity: active.value >= 0 ? 1 : 0, transform: [{ translateX: x0 + inset + Math.max(0, active.value) * bandW }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: 0, top, width: Math.max(0, bandW - 2 * inset), height: Math.max(0, bottom - top), borderRadius: Math.min(10, bandW / 2), backgroundColor: k.wash }, style]}
    />
  );
}

/** One full-ink part of a bar: its path and colour per index (null: nothing to redraw at that index). */
export type ScrubBarLayer = { paths: readonly (SkPath | null)[]; colors: readonly string[] };

const NO_PATH = Skia.Path.Make();

function ScrubBarPart({ active, layer }: { active: SharedValue<number>; layer: ScrubBarLayer }) {
  const path = useDerivedValue(() => layer.paths[active.value] ?? NO_PATH);
  const color = useDerivedValue(() => layer.colors[active.value] ?? "transparent");
  return <Path path={path} color={color} />;
}

/**
 * The scrubbed bar at full ink over the canvas, where the rest of the bars sit dimmed: each part's path is built once
 * per data and width and picked by the scrubbed index on the UI thread (a canvas of its own, mounted at the first
 * scrub), so a scrub never redraws the chart.
 */
export function ScrubBars({ active, width, height, layers }: { active: SharedValue<number>; width: number; height: number; layers: readonly ScrubBarLayer[] }) {
  const mounted = useScrubArmed(active);
  if (!mounted) return null;
  return (
    <Canvas pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height }}>
      {layers.map((l, k) => (
        <ScrubBarPart key={k} active={active} layer={l} />
      ))}
    </Canvas>
  );
}

/** SVG path strings to Skia paths (null for none), for ScrubBars. */
export const toPaths = (ds: readonly (string | null)[]): (SkPath | null)[] => ds.map((d) => (d ? Skia.Path.MakeFromSVGString(sp(d)) : null));

/** The readout pill's height and padding. */
const READOUT = { h: 22, pad: 9, gap: 6, margin: 4 } as const;

/**
 * The Calm readout bound to the scrubbed index: a small white pill with a soft edge, centred over its point and kept
 * inside [minX, maxX], the value in the numeric face (`texts`, in `color`) and an optional label after it in the grey
 * (`labels`). Every index's text is precomputed with its width; it is a small canvas of its own, moved by a transform
 * and redrawn only when the index changes, never the chart. `y` is the pill's vertical centre.
 */
export function ScrubLabel({
  active,
  xs,
  texts,
  widths,
  labels,
  labelWidths,
  y,
  minX,
  maxX,
  font,
  labelFont,
  color,
}: {
  active: SharedValue<number>;
  xs: readonly number[];
  texts: readonly string[];
  widths: readonly number[];
  labels?: readonly string[];
  labelWidths?: readonly number[];
  y: number;
  minX: number;
  maxX: number;
  font: SkFont;
  labelFont?: SkFont;
  color: string;
}) {
  const k = useChartInk();
  const { h, pad, gap, margin: m } = READOUT;
  const pills = React.useMemo(() => widths.map((w, i) => Math.ceil(w + (labels?.[i] ? gap + (labelWidths?.[i] ?? 0) : 0) + 2 * pad)), [widths, labels, labelWidths, gap, pad]);
  const boxW = React.useMemo(() => Math.max(0, ...pills) + 2 * m, [pills, m]);
  const mounted = useScrubArmed(active);
  const style = useAnimatedStyle(() => {
    const i = active.value;
    const on = i >= 0 && !!texts[i];
    const w = pills[i] ?? 0;
    const left = Math.min(maxX - w, Math.max(minX, (xs[i] ?? 0) - w / 2));
    return { opacity: on ? 1 : 0, transform: [{ translateX: on ? left - m : -1000 }] };
  });
  const text = useDerivedValue(() => texts[active.value] ?? "");
  const label = useDerivedValue(() => labels?.[active.value] ?? "");
  const labelX = useDerivedValue(() => m + pad + (widths[active.value] ?? 0) + gap);
  const pillW = useDerivedValue(() => pills[active.value] ?? 0);
  const edgeW = useDerivedValue(() => Math.max(0, (pills[active.value] ?? 0) - 1));
  if (!mounted) return null;
  const lf = labelFont ?? font;
  const base = m + h / 2 + font.getSize() * 0.35;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: y - h / 2 - m, width: boxW, height: h + 2 * m }, style]}>
      <Canvas style={{ width: boxW, height: h + 2 * m }}>
        <RoundedRect x={m} y={m} width={pillW} height={h} r={h / 2} color={k.readout}>
          <Shadow dx={0} dy={1} blur={3} color={k.readoutShadow} />
        </RoundedRect>
        <RoundedRect x={m + 0.5} y={m + 0.5} width={edgeW} height={h - 1} r={(h - 1) / 2} color={k.readoutEdge} style="stroke" strokeWidth={1} />
        <SkText x={m + pad} y={base} text={text} font={font} color={color} />
        {labels && <SkText x={labelX} y={m + h / 2 + lf.getSize() * 0.35} text={label} font={lf} color={k.sub} />}
      </Canvas>
    </Animated.View>
  );
}

// --- The explorer affordance ---

/** The ↗ in a chart card's header (SectionShell `action`): a 32 px round quiet button that opens the chart explorer. */
export function ExpandButton({ onPress, label = "Open chart explorer" }: { onPress: () => void; label?: string }) {
  const c = useCalm();
  const fill = useSoftFill();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: fill, opacity: pressed ? 0.6 : 1 })}
    >
      <ArrowUpRight size={16} color={c.sub} strokeWidth={2} />
    </Pressable>
  );
}
