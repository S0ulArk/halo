// Pure parts of the Pulse Age orb, ported from Pulse's src/lib/orb.ts (docs/design/orb.md): colour stops, shape
// noise, seeded RNG. Hues are theme tokens (`orbGreen`…) instead of CSS variables.
import { clamp, lerp } from "@/lib/utils";
import type { ColorToken } from "@/ui/theme";

export type RGB = readonly [number, number, number];
type Stop = { at: number; top: ColorToken; bottom: ColorToken };

export const ORB = {
  stops: [
    { at: -7, top: "orbGreen", bottom: "orbGreen" },
    { at: -4, top: "orbTeal", bottom: "orbTeal" },
    { at: -1.5, top: "orbCyan", bottom: "orbCyan" },
    { at: 0, top: "orbBlue", bottom: "orbBlue" },
    { at: 0.8, top: "orbBlue", bottom: "orbOlive" },
    { at: 2.1, top: "orbBlue2", bottom: "orbOrange" },
    { at: 3, top: "orbAmber", bottom: "orbAmber" },
    { at: 7, top: "orbRust", bottom: "orbRust" },
    { at: 12, top: "orbRed", bottom: "orbRed" },
  ] satisfies Stop[],
  empty: "orbEmpty" as ColorToken,
  /** Delta line inside the orb: pale cyan, mint (`optimal`) once the orb is green (at or below this delta). */
  greenText: -2,
  /** Rim fill = edge colour × this; particles and the edge line are brighter tints. */
  fillShade: 0.68,
  /** The web's `--orb-lift` and `--orb-sparkle` defaults. */
  lift: 1.3,
  sparkle: 0.12,
  shape: { radius: 0.9, lowFreq: 0.85, lowAmp: 0.075, highFreq: 2.1, highAmp: 0.028, smallHighAmp: 0.05, drift: 0.05 },
  particles: { at320: 3000, min: 280, max: 3000, mix: [0.68, 0.27, 0.05] as const },
  /**
   * The phone's motion (docs/design/orb.md, "Motion"), run on the native driver from one linear clock in seconds.
   * Every period divides `loop` and every drift is whole turns per loop, so the clock's restart is seamless.
   */
  motion: {
    loop: 240,
    /** Seconds per cycle: the outline and glow breathe, the rim twinkles and sways, the core shimmers. */
    breath: 6,
    twinkle: 8,
    /** The counter-turning inner layer twinkles on its own beat. */
    twinkleInner: 10,
    sway: 12,
    shimmer: 5,
    /** Turns per loop: the two inner particle layers drift opposite ways at 3°/s and 1.5°/s; the shimmer at 1.5°/s. */
    turnsA: 2,
    turnsB: -1,
    turnsShimmer: -1,
    /** The rim layer's sway, ± degrees: small enough that no rim particle crosses the lobed outline. */
    swayDeg: 2,
    /** Breathing: the body grows 3 %, the glow 4.5 % and brightens from 85 %. */
    breathScale: 0.03,
    glowScale: 0.045,
    glowDim: 0.85,
    /** Press and hold: the inner field spins up over `ramp` ms to a turn per `period` ms and gathers inward; release coasts it down. */
    swirl: { period: 5000, ramp: 600, rampTurns: 0.06, deceleration: 0.998, gather: 0.86, rimGather: 0.95, bodyGrow: 0.02, glowGrow: 0.03 },
    /** Entry: the inner field spirals in from 130 % and −40° while the body charges from 45 %. */
    enter: { duration: 900, scale: 1.3, turnDeg: -40, body: 0.45 },
  },
} as const;

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const shadeRGB = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
export const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+a.toFixed(3)})`;

/** "#rrggbb" (a token's value) as RGB; anything else reads as black. */
export function hexRGB(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

/** The two stops around a Pulse Age delta and how far between them; `null` (no result) is the empty orb. */
export function orbStops(delta: number | null): { top: [ColorToken, ColorToken]; bottom: [ColorToken, ColorToken]; t: number } {
  if (delta === null || !Number.isFinite(delta)) return { top: [ORB.empty, ORB.empty], bottom: [ORB.empty, ORB.empty], t: 0 };
  const s = ORB.stops;
  const d = clamp(delta, s[0].at, s[s.length - 1].at);
  const i = Math.max(0, s.findIndex((x) => x.at >= d) - 1);
  const a = s[i];
  const b = s[Math.min(i + 1, s.length - 1)];
  const t = b.at === a.at ? 0 : (d - a.at) / (b.at - a.at);
  return { top: [a.top, b.top], bottom: [a.bottom, b.bottom], t };
}

/** Rim colours for a Pulse Age delta (years older is positive), with `rgb` resolving a token. */
export function orbColors(delta: number | null, rgb: (token: ColorToken) => RGB): { top: RGB; bottom: RGB } {
  const { top, bottom, t } = orbStops(delta);
  return { top: mixRGB(rgb(top[0]), rgb(top[1]), t), bottom: mixRGB(rgb(bottom[0]), rgb(bottom[1]), t) };
}

function hash2(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 2D value noise in [-1, 1], smooth and deterministic. */
export function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const top = lerp(hash2(xi, yi), hash2(xi + 1, yi), u);
  const bot = lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u);
  return lerp(top, bot, v) * 2 - 1;
}

/** Blob radius multiplier at angle `theta` and time `t` (seconds). */
export function blobRadius(theta: number, t: number, seed: number, small = false, wobble = 1) {
  const s = ORB.shape;
  const c = Math.cos(theta);
  const n = Math.sin(theta);
  const o = t * s.drift;
  const low = noise2(seed + c * s.lowFreq + o, seed * 0.37 + n * s.lowFreq + o * 0.6);
  const high = noise2(seed * 1.9 + c * s.highFreq - o * 1.3, 11 + n * s.highFreq + o);
  return 1 + wobble * (s.lowAmp * low + (small ? s.smallHighAmp : s.highAmp) * high);
}

/** How many particles an orb of `size` px gets. */
export const particleCount = (size: number) => Math.round(clamp(ORB.particles.at320 * (size / 320) ** 2, ORB.particles.min, ORB.particles.max));

/** Seeded RNG (mulberry32) so the same orb draws the same particles on every render. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Motion geometry ---

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

/** The radius table's entry nearest angle `a` (the table holds STEPS + 1 samples over a full turn). */
export const edgeIndex = (a: number, steps: number) => Math.round((norm(a) / TAU) * steps) % steps;

/** The outline's smallest radius within ±`span` radians of angle `a`, from a radius table of `steps` samples per turn. */
export function lowestEdge(rTab: ArrayLike<number>, steps: number, a: number, span: number): number {
  const i0 = edgeIndex(a, steps);
  const k = Math.ceil(span / (TAU / steps));
  let m = Infinity;
  for (let j = -k; j <= k; j++) m = Math.min(m, rTab[(((i0 + j) % steps) + steps) % steps]);
  return m;
}

/**
 * Which motion layer a particle can join without ever crossing the outline: `free` turns any amount (it sits inside
 * the outline's smallest radius), `sway` turns ±`swaySpan` radians, `fixed` stays put with the body. `dist` is its
 * distance from the centre and `r` its drawn radius, both in px.
 */
export function particleLayer(rTab: ArrayLike<number>, steps: number, minEdge: number, angle: number, dist: number, r: number, swaySpan: number): "free" | "sway" | "fixed" {
  const reach = dist + r + 0.5;
  if (reach <= minEdge) return "free";
  return reach <= lowestEdge(rTab, steps, angle, swaySpan) ? "sway" : "fixed";
}

/** The press swirl's speed (turns per ms) after holding `heldMs`: the ease-in ramp's, then the loop's steady speed. */
export function swirlVelocity(heldMs: number): number {
  const s = ORB.motion.swirl;
  return ((2 * s.rampTurns) / s.ramp) * Math.min(1, Math.max(0, heldMs) / s.ramp);
}
