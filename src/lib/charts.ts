// Data helpers for the hand-drawn SVG charts, ported from the web app (where Recharts drew the shapes), plus the
// geometry the mobile charts need in their place: scales, curve paths and the dial arcs (spec §5.0, §5.1, §5.6).

/** A colour band: values at or above `from` take `color` (bands ascending). `color` is a resolved colour string. */
export type Band = { from: number; color: string };

/** The band colour of a value. */
export const bandColor = (v: number, bands: Band[]) => [...bands].reverse().find((b) => v >= b.from)?.color ?? bands[0].color;

/**
 * Gradient stops, top (offset 0) to bottom (offset 1), for a shape spanning values `top` to `bottom`: the top's colour,
 * a hard switch at every threshold strictly inside the span, and the bottom's colour.
 */
export function bandStops(top: number, bottom: number, bands: Band[]): { offset: number; color: string }[] {
  const at = (v: number) => (top - v) / (top - bottom);
  const stops = [{ offset: 0, color: bandColor(top, bands) }];
  for (const b of [...bands].reverse()) {
    if (b.from >= top || b.from <= bottom) continue;
    stops.push({ offset: at(b.from), color: bandColor(b.from, bands) }, { offset: at(b.from), color: bandColor(b.from - 1e-9, bands) });
  }
  stops.push({ offset: 1, color: bandColor(bottom, bands) });
  return stops;
}

// --- Hypnogram ---

export type Stage = "awake" | "rem" | "light" | "deep";
export const STAGES: Stage[] = ["awake", "rem", "light", "deep"];
export const STAGE_LANE: Record<Stage, number> = { awake: 3, rem: 2, light: 1, deep: 0 };
export type StageSegment = { stage: Stage; start: number; end: number };
export type LanePoint = { t: number; lane: number | null };

/**
 * The connector runs through every segment start (stepAfter) and ends at the last wake. Each stage
 * gets its own series holding its lane only inside its segments, with a null after each one so
 * two separate REM blocks never join across the night.
 */
export function hypnogramSeries(segments: StageSegment[]) {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const connector: LanePoint[] = sorted.map((s) => ({ t: s.start, lane: STAGE_LANE[s.stage] }));
  const last = sorted[sorted.length - 1];
  if (last) connector.push({ t: last.end, lane: STAGE_LANE[last.stage] });
  const stages = Object.fromEntries(STAGES.map((s) => [s, [] as LanePoint[]])) as Record<Stage, LanePoint[]>;
  for (const s of sorted) {
    const lane = STAGE_LANE[s.stage];
    stages[s.stage].push({ t: s.start, lane }, { t: s.end, lane }, { t: s.end, lane: null });
  }
  return { connector, stages };
}

// --- Time axes ---

const MINUTE = 60_000;
function localMinuteOfDay(ms: number, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone }).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Ticks on whole local clock times that are multiples of `stepMinutes` (60 = whole hours), inside [start, end]. */
export function clockTicks(start: number, end: number, stepMinutes = 60, timeZone?: string) {
  const firstMinute = Math.ceil(start / MINUTE) * MINUTE;
  const into = localMinuteOfDay(firstMinute, timeZone) % stepMinutes;
  const ticks: number[] = [];
  for (let t = firstMinute + (into ? stepMinutes - into : 0) * MINUTE; t <= end; t += stepMinutes * MINUTE) ticks.push(t);
  return ticks;
}

/** Whole local hours that are multiples of `stepHours`. */
export const hourTicks = (start: number, end: number, stepHours = 1, timeZone?: string) => clockTicks(start, end, stepHours * 60, timeZone);

/** Y domain rounded out to 10s with 10 of headroom: [min - 10, max + 10]. */
export function paddedDomain(values: (number | null)[]): [number, number] {
  const v = values.filter((x): x is number => x !== null);
  if (!v.length) return [40, 180];
  return [Math.floor((Math.min(...v) - 10) / 10) * 10, Math.ceil((Math.max(...v) + 10) / 10) * 10];
}

// --- ScoreDial slices (data, not angles) ---

/** Strain Target band on the 0-21 track: [before, band, after]. */
export function targetSlices(lo: number, hi: number, max = 21) {
  const a = Math.min(Math.max(lo, 0), max);
  const b = Math.min(Math.max(hi, a), max);
  return [a, b - a, max - b];
}

/** A thin marker slice centred on `value`: [before, width, after], clamped to the domain. */
export function markerSlices(value: number, max: number, width: number) {
  const mid = Math.min(Math.max(value, width / 2), max - width / 2);
  return [mid - width / 2, width, max - mid - width / 2];
}

/**
 * Ring radii in px. `inset` px are reserved outside the ring for the strain tick, which overhangs the ring by 2 px.
 * `hole` is the inset of the ring's inner edge from the box edge: the dial's centre content lays out in that square
 * and sizes itself from it (spec §11 F23). The web returns percentages; px is what RN lays out in.
 */
export function ringRadii(diameter: number, ring: number, inset = 2) {
  const r = diameter / 2;
  return {
    outer: r - inset,
    inner: r - inset - ring,
    tickOuter: r,
    tickInner: r - inset - ring - 2,
    hole: inset + ring,
    /** The hole's inner diameter: 1 "cqi" of the web's centre type is 1 % of this. */
    innerDiameter: diameter - 2 * (inset + ring),
  };
}

// --- Arcs (Recharts angles: counter-clockwise from 3 o'clock; a decreasing angle sweeps clockwise) ---

/** Every current ring opens with a 4° gap each side of 12 o'clock: start 86, a 352° clockwise sweep. */
export const DIAL_ARC = { start: 86, sweep: 352 } as const;
/** The stress gauge arc: 215 → −35, a 250° clockwise sweep open at the bottom. */
export const GAUGE_ARC = { start: 215, sweep: 250 } as const;

/** The point at `deg` (Recharts convention) on a circle of radius `r`. */
export function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

/** An SVG path along the circle of radius `r`, from `startDeg` sweeping `sweepDeg` clockwise. Stroke it for a ring. */
export function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) {
  const sweep = Math.max(0, Math.min(sweepDeg, 359.999));
  if (sweep <= 0) return "";
  const a = polar(cx, cy, r, startDeg);
  const b = polar(cx, cy, r, startDeg - sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M${a.x.toFixed(3)} ${a.y.toFixed(3)}A${r} ${r} 0 ${large} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`;
}

/** Length of an arc of `sweepDeg` on radius `r`. */
export const arcLength = (r: number, sweepDeg: number) => (2 * Math.PI * r * sweepDeg) / 360;

// --- Cartesian scales and curves ---

export type Scale = ((v: number) => number) & { domain: [number, number]; range: [number, number] };

/** A linear scale from `domain` onto `range` (clamped off). */
export function scaleLinear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.domain = domain;
  f.range = range;
  return f;
}

/** Evenly spaced "nice" ticks: `count` of them from 0 (or the floor) to a rounded-up top, for bar charts. */
export function niceTicks(lo: number, hi: number, count = 3): number[] {
  if (hi <= lo) return [lo];
  const raw = (hi - lo) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v < hi + step; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export type XY = { x: number; y: number };

/** Straight segments through the points. */
export function linePath(points: XY[]) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("");
}

/** Recharts' stepAfter: hold each value until the next x. */
export function stepAfterPath(points: XY[]) {
  let d = "";
  points.forEach((p, i) => {
    if (!i) d += `M${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    else d += `H${p.x.toFixed(2)}V${p.y.toFixed(2)}`;
  });
  return d;
}

/** d3's curveMonotoneX (Recharts' "monotone"): a cubic through the points that never overshoots them. */
export function monotonePath(points: XY[]) {
  const n = points.length;
  if (n < 2) return n ? `M${points[0].x} ${points[0].y}` : "";
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    dy.push(points[i + 1].y - points[i].y);
    m.push(dx[i] ? dy[i] / dx[i] : 0);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
    }
  }
  t.push(m[n - 2]);
  let d = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(points[i].x + h).toFixed(2)} ${(points[i].y + t[i] * h).toFixed(2)} ${(points[i + 1].x - h).toFixed(2)} ${(points[i + 1].y - t[i + 1] * h).toFixed(2)} ${points[i + 1].x.toFixed(2)} ${points[i + 1].y.toFixed(2)}`;
  }
  return d;
}

/** Splits a series at nulls into runs of points (a gap breaks the line, never interpolated). */
export function runs<T>(items: (T | null)[]): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const it of items) {
    if (it === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(it);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Closes a line path down to `floorY` for an area fill. */
export function areaPath(linePathD: string, first: XY, last: XY, floorY: number) {
  if (!linePathD) return "";
  return `${linePathD}L${last.x.toFixed(2)} ${floorY.toFixed(2)}L${first.x.toFixed(2)} ${floorY.toFixed(2)}Z`;
}
