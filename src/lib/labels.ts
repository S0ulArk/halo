// Value labels on a two-series dot chart (Home's Strain & Recovery week): each day's two labels go on opposite sides
// of their dots, and a label whose box would overlap one already placed is dropped, least important first. Pure, so
// it is unit tested; the chart only draws what this returns.

/** A box in chart coordinates. */
export type Box = { x1: number; y1: number; x2: number; y2: number };

/** One day's two dots (null: no value that day). `y` is the dot's centre on the plot; `text` its label. */
export type LabelDay = {
  x: number;
  a: { y: number; text: string } | null;
  b: { y: number; text: string } | null;
  today?: boolean;
};

export type LabelPlacement = {
  /** The label's vertical centre, or null when it was dropped. */
  a: number | null;
  b: number | null;
};

export type LabelOptions = {
  fontSize: number;
  /** The labels' vertical room: a label never reaches above `top` or below `bottom` (the day ticks under the plot). */
  top: number;
  bottom: number;
  /** Horizontal room: a label never reaches past either edge. */
  left: number;
  right: number;
  /** The dots' outer radius (radius plus half the stroke). Default 5. */
  dotRadius?: number;
  /** Air between a dot and its label, and around every label box. Default 2. */
  gap?: number;
  /** Other text on the chart the labels must clear (axis ticks). */
  obstacles?: Box[];
};

/** Advance widths of Barlow bold, in em, rounded up: digits, the decimal point, the percent sign. */
const EM: Record<string, number> = { ".": 0.28, ",": 0.28, "%": 0.86, "-": 0.42, "−": 0.6 };
/** A label's width at `fontSize`, a little generous so near misses count as overlaps. */
export const labelWidth = (text: string, fontSize: number) => [...text].reduce((w, ch) => w + (EM[ch] ?? 0.58), 0) * fontSize;

export const overlaps = (p: Box, q: Box) => p.x1 < q.x2 && q.x1 < p.x2 && p.y1 < q.y2 && q.y1 < p.y2;

type Candidate = { day: number; key: "a" | "b"; x: number; dotY: number; text: string; rank: number; first: "above" | "below" };

/**
 * Places each day's labels: the higher dot's label above it and the lower dot's below (an only dot's above), then
 * keeps them in importance order (today's, then each series' highest and lowest, then the most recent days) and drops
 * any whose box would overlap a kept label, a dot, an obstacle or the edges, after trying its other side.
 */
export function placeDotLabels(days: LabelDay[], o: LabelOptions): LabelPlacement[] {
  const r = o.dotRadius ?? 5;
  const gap = o.gap ?? 2;
  const h = o.fontSize;
  const offset = r + gap + h / 2;

  const extremes = (key: "a" | "b") => {
    const ys = days.flatMap((d) => (d[key] ? [d[key]!.y] : []));
    return ys.length ? { hi: Math.min(...ys), lo: Math.max(...ys) } : null;
  };
  const ext = { a: extremes("a"), b: extremes("b") };

  const candidates: Candidate[] = [];
  days.forEach((d, i) => {
    for (const key of ["a", "b"] as const) {
      const self = d[key];
      if (!self) continue;
      const other = d[key === "a" ? "b" : "a"];
      // The higher dot (smaller y) labels above; on a tie `a` goes above. Alone, above.
      const above = !other || self.y < other.y || (self.y === other.y && key === "a");
      const e = ext[key];
      const extreme = !!e && (self.y === e.hi || self.y === e.lo);
      candidates.push({ day: i, key, x: d.x, dotY: self.y, text: self.text, rank: d.today ? 0 : extreme ? 1 : 2, first: above ? "above" : "below" });
    }
  });
  // Stable: within a rank, the most recent day first, `a` before `b`.
  candidates.sort((p, q) => p.rank - q.rank || q.day - p.day || (p.key === q.key ? 0 : p.key === "a" ? -1 : 1));

  const dots: Box[] = days.flatMap((d) => [d.a, d.b].flatMap((s) => (s ? [{ x1: d.x - r, y1: s.y - r, x2: d.x + r, y2: s.y + r }] : [])));
  const kept: Box[] = [];
  const blocked = [...dots, ...(o.obstacles ?? [])];
  const out: LabelPlacement[] = days.map(() => ({ a: null, b: null }));

  for (const c of candidates) {
    const w = labelWidth(c.text, o.fontSize);
    const sides: ("above" | "below")[] = c.first === "above" ? ["above", "below"] : ["below", "above"];
    for (const side of sides) {
      const cy = side === "above" ? c.dotY - offset : c.dotY + offset;
      const box: Box = { x1: c.x - w / 2 - gap / 2, y1: cy - h / 2, x2: c.x + w / 2 + gap / 2, y2: cy + h / 2 };
      if (box.y1 < o.top || box.y2 > o.bottom || box.x1 < o.left || box.x2 > o.right) continue;
      if (kept.some((k) => overlaps(k, box)) || blocked.some((k) => overlaps(k, box))) continue;
      kept.push(box);
      out[c.day][c.key] = cy;
      break;
    }
  }
  return out;
}

const LABEL_GAP = 8;

/**
 * "Target X" centred under its ▲ (spec §11 M5), measured rather than guessed: it slides away from the end labels so
 * nothing overlaps at any width, and when there's no room beside an end label, that end label gives way.
 */
export function placeTarget(width: number, label: number, lo: number, hi: number, t: number): { left: number; hideLo: boolean; hideHi: boolean } {
  const want = t * width - label / 2;
  const min = lo + LABEL_GAP;
  const max = width - hi - LABEL_GAP - label;
  if (min <= max) return { left: Math.min(max, Math.max(min, want)), hideLo: false, hideHi: false };
  // No room between the end labels: keep the target, drop the end label on its side.
  const left = Math.min(width - label, Math.max(0, want));
  return t > 0.5 ? { left: Math.max(left, Math.min(min, width - label)), hideLo: false, hideHi: true } : { left: Math.min(left, Math.max(0, max)), hideLo: true, hideHi: false };
}
