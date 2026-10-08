// Small shared helpers (the web's `cn` has no RN equivalent: styles are arrays).

/** `items` with the one at `i` swapped with its neighbour `by` (-1 up, +1 down); unchanged at either end. */
export function moved<T>(items: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A colour at `a` opacity: the web's `bg-foreground/8`, `ring-warning/50`. Takes `#rgb`, `#rrggbb`, `#rrggbbaa`
 * and `rgba(r,g,b,a)` strings (every theme token is one of these); anything else is returned untouched.
 */
export function alpha(color: string, a: number): string {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${+a.toFixed(3)})`;
  if (color[0] === "#") {
    let h = color.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length === 8) h = h.slice(0, 6);
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${+a.toFixed(3)})`;
  }
  return color;
}

/** The web's `color-mix(in srgb, A p%, B)`: a straight sRGB blend of two opaque colours. */
export function mix(a: string, b: string, p: number): string {
  const rgb = (c: string): [number, number, number] => {
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(c);
    if (m) return [+m[1], +m[2], +m[3]];
    let h = c.slice(1);
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const A = rgb(a);
  const B = rgb(b);
  const c = A.map((v, i) => Math.round(v * p + B[i] * (1 - p)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Tailwind's `tracking-[0.1em]` in RN: letterSpacing is in px, so it scales with the font size. */
export const em = (fontSize: number, tracking: number) => Math.round(fontSize * tracking * 100) / 100;

/** A stable id for SVG defs (gradients, patterns) inside one component instance. */
let seq = 0;
export const uid = (prefix = "id") => `${prefix}-${(seq = (seq + 1) % 1_000_000)}`;
