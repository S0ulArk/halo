// Pure motion maths for the kit's animations (and their tests): easing curves, the entrance cascade, tweened
// numbers, and the stops that turn a linear clock into a smooth wave. No React Native imports, so vitest runs it.
import type { FormatKey } from "@/lib/format";
import { MOTION } from "@/ui/theme";

export type EasingFn = (t: number) => number;

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress: solves x(s) = t for the curve parameter (Newton
 * steps, bisection when the slope is flat) and returns y(s). The end points are exact.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = x(s) - t;
      if (Math.abs(err) < 1e-6) return y(s);
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
      if (x(s) < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return y(s);
  };
}

/** The kit's curves. `Animated.timing` takes these directly (the native driver samples them into frames). */
export const EASE = {
  /** Entrances: ease-out-expo (the web's `cubic-bezier(0.16,1,0.3,1)`). */
  outExpo: cubicBezier(0.16, 1, 0.3, 1),
  /** The dials' 700 ms fill sweep, and every count-up that runs beside it. */
  fill: cubicBezier(0, 0, 0.58, 1),
  /** Press and small state changes (spec §2.7 ease-standard). */
  standard: cubicBezier(0.2, 0, 0, 1),
  outCubic: (t: number) => 1 - (1 - clamp01(t)) ** 3,
  inQuad: (t: number) => clamp01(t) ** 2,
  linear: (t: number) => t,
} satisfies Record<string, EasingFn>;

// --- Entrance cascade ---

/** Cards and sections rise 8 px and fade in over 220 ms; a screen's first six cascade 40 ms apart. */
export const ENTER = { duration: MOTION.base, rise: 8, step: MOTION.stagger, steps: 6 } as const;

/** The delay before the `index`th item of a cascade starts: 40 ms apart, capped after `steps` items. */
export function staggerDelay(index: number, step: number = ENTER.step, steps: number = ENTER.steps): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index), steps - 1) * step;
}

/**
 * Numbers the items of a mount burst in render order: calls less than `gap` ms after the previous one continue the
 * count (0, 1, 2…), a pause starts a new burst at 0. A screen's cards render in one pass, so they cascade top to
 * bottom with no index passed by the screen; a card mounted later (a list scrolled into view) starts at once.
 */
export function burstCounter(gap = 120, now: () => number = () => Date.now()): () => number {
  let last = -Infinity;
  let n = 0;
  return () => {
    const t = now();
    n = t - last > gap ? 0 : n + 1;
    last = t;
    return n;
  };
}

// --- Count-up ---

export const COUNT = { duration: MOTION.fill } as const;

/** `from` → `to` at progress `t` (clamped to 0-1) along `ease`. */
export function tween(from: number, to: number, t: number, ease: EasingFn = EASE.fill): number {
  const k = ease(clamp01(t));
  return k >= 1 ? to : from + (to - from) * k;
}

/** A count-up's value `elapsed` ms in; the target itself once `duration` has passed (or for a zero duration). */
export function countUpAt(from: number, to: number, elapsed: number, duration: number = COUNT.duration, ease: EasingFn = EASE.fill): number {
  return duration <= 0 || elapsed >= duration ? to : tween(from, to, elapsed / duration, ease);
}

/**
 * Formats a number may count through. Clock-like values (a pace "5:32") would read as nonsense on the way, so they
 * appear at once.
 */
export const COUNTABLE: Record<FormatKey, boolean> = {
  int: true,
  grouped: true,
  decimal1: true,
  decimal2: true,
  signed1: true,
  signedInt: true,
  duration: true,
  durationHMS: true,
  pace: false,
};

// --- Waves from a linear clock ---

/**
 * `interpolate` stops that turn a phase in [0, 1] into one smooth cycle lo → hi → lo, `(1 − cos 2πx) / 2` sampled at
 * n + 1 points. Native-driven interpolation is piecewise linear; 16 segments read as a sine at breathing speeds.
 */
export function waveStops(lo = 0, hi = 1, n = 16): { inputRange: number[]; outputRange: number[] } {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    inputRange.push(x);
    outputRange.push(lo + (hi - lo) * (0.5 - 0.5 * Math.cos(2 * Math.PI * x)));
  }
  return { inputRange, outputRange };
}

/** The pop on a newly selected tab icon: up to 1.12, then back to 1 (110 + 170 ms). */
export const POP = { scale: 1.12, up: 110, down: 170 } as const;
