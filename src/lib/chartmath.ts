// Pure chart maths shared by the GPU (Skia) charts and the chart explorer: hit-testing a finger against the plot,
// viewport zoom and pan, nice and aligned axes, range windows, window statistics and the axis tick levels. Every
// function that runs inside a gesture or a derived value is a worklet (the "worklet" directive is a plain string
// outside Reanimated's Babel plugin, so vitest runs these unchanged). No React Native imports.

// --- Hit-testing ---

/** The band under `x` when `n` equal bands span [x0, x1] (bars, day columns); -1 outside the plot. */
export function bandIndexAt(x: number, x0: number, x1: number, n: number): number {
  "worklet";
  if (!(x1 > x0) || n <= 0) return -1;
  const i = Math.floor(((x - x0) / (x1 - x0)) * n);
  return i < 0 || i >= n ? -1 : i;
}

/** The band under `x`, clamped to the first and last band (a finger past either end keeps the end band). */
export function bandIndexClamped(x: number, x0: number, x1: number, n: number): number {
  "worklet";
  if (!(x1 > x0) || n <= 0) return -1;
  const i = Math.floor(((x - x0) / (x1 - x0)) * n);
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

/** Index of the entry of ascending `xs` nearest to `x`; -1 when `xs` is empty. Binary search. */
export function nearestIndex(xs: readonly number[], x: number): number {
  "worklet";
  const n = xs.length;
  if (!n) return -1;
  if (x <= xs[0]) return 0;
  if (x >= xs[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return x - xs[lo] <= xs[hi] - x ? lo : hi;
}

/**
 * Index of the entry nearest to `x` that has a value (a gap never takes the cursor); -1 when no entry within
 * `maxGap` of `x` (in x units) has one.
 */
export function nearestValued(xs: readonly number[], ys: readonly (number | null)[], x: number, maxGap = Infinity): number {
  "worklet";
  const i = nearestIndex(xs, x);
  if (i < 0) return -1;
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < xs.length; k++) {
    // Walk outwards from i on both sides; stop once both sides are farther than the best so far.
    const l = i - k;
    const r = i + k;
    const dl = l >= 0 ? Math.abs(xs[l] - x) : Infinity;
    const dr = r < xs.length ? Math.abs(xs[r] - x) : Infinity;
    if (dl > bestD && dr > bestD) break;
    if (l >= 0 && ys[l] != null && dl < bestD) {
      best = l;
      bestD = dl;
    }
    if (r < xs.length && ys[r] != null && dr < bestD) {
      best = r;
      bestD = dr;
    }
    if (l < 0 && r >= xs.length) break;
  }
  return bestD <= maxGap ? best : -1;
}

// --- Viewport (the explorer's visible x window) ---

/** `start` moved so the window [start, start + span] stays inside [min, max] (a wider window pins to `min`). */
export function clampStart(start: number, span: number, min: number, max: number): number {
  "worklet";
  if (span >= max - min) return min;
  return start < min ? min : start + span > max ? max - span : start;
}

/**
 * The window after zooming `scale`× (2 = twice as close) about data x `focal`: the focal point stays where it was on
 * screen, the span stays within [minSpan, max − min] and the window inside [min, max].
 */
export function zoomViewport(start: number, span: number, focal: number, scale: number, min: number, max: number, minSpan: number): { start: number; span: number } {
  "worklet";
  const full = max - min;
  const s = !(scale > 0) ? 1 : scale;
  const next = Math.min(full, Math.max(Math.min(minSpan, full), span / s));
  const t = span > 0 ? (focal - start) / span : 0.5;
  return { start: clampStart(focal - t * next, next, min, max), span: next };
}

/** Data x under screen x `px` for a window drawn across [left, left + width]. */
export function dataXAt(px: number, start: number, span: number, left: number, width: number): number {
  "worklet";
  return width > 0 ? start + ((px - left) / width) * span : start;
}

/** Screen x of data x `x` for a window drawn across [left, left + width]. */
export function screenXOf(x: number, start: number, span: number, left: number, width: number): number {
  "worklet";
  return span > 0 ? left + ((x - start) / span) * width : left;
}

/**
 * The 3×3 row-major matrix (Skia's 9-number form) taking data space to screen space: x from the window
 * [start, start + span] onto [left, left + width], y from [lo, hi] onto [bottom, top] (up is larger).
 */
export function dataMatrix(start: number, span: number, left: number, width: number, lo: number, hi: number, top: number, bottom: number): number[] {
  "worklet";
  const sx = span > 0 ? width / span : 1;
  const sy = hi > lo ? -(bottom - top) / (hi - lo) : 1;
  return [sx, 0, left - start * sx, 0, sy, bottom - lo * sy, 0, 0, 1];
}

// --- Axes ---

const STEPS = [1, 2, 2.5, 5, 10];

/** The smallest "nice" step (1, 2, 2.5, 5 × 10^k) at or above `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of STEPS) if (m * mag >= raw - 1e-12) return m * mag;
  return 10 * mag;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * A nice linear axis around [lo, hi] with about `count` ticks: the domain is rounded out to whole steps. `zero` keeps
 * the floor at 0 for data that never goes below it (bars). A flat or empty range still gets a usable axis.
 */
export function niceScale(lo: number, hi: number, count = 4, zero = false): { lo: number; hi: number; ticks: number[] } {
  let a = Number.isFinite(lo) ? lo : 0;
  let b = Number.isFinite(hi) ? hi : 1;
  if (zero) a = Math.min(0, a);
  if (b < a) [a, b] = [b, a];
  if (b === a) {
    const pad = a === 0 ? 1 : Math.abs(a) * 0.1;
    b = a + pad;
    if (!zero) a = a - pad;
  }
  const step = niceStep((b - a) / Math.max(1, count - 1));
  const start = Math.floor(round6(a / step)) * step;
  const end = Math.ceil(round6(b / step)) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 1e-6; v += step) ticks.push(round6(v));
  return { lo: round6(start), hi: round6(end), ticks };
}

/**
 * A secondary axis whose `n` ticks sit on the primary axis' `n` grid rows: the smallest nice step that covers
 * [lo, hi] in n − 1 steps, from a floor on a whole step. The compare series is drawn against it, so its grid
 * labels on the right line up with the left axis.
 */
export function alignedScale(lo: number, hi: number, n: number): { lo: number; hi: number; ticks: number[] } {
  const k = Math.max(1, n - 1);
  let a = Number.isFinite(lo) ? lo : 0;
  let b = Number.isFinite(hi) ? hi : 1;
  if (b < a) [a, b] = [b, a];
  if (b === a) {
    a -= Math.abs(a) * 0.1 || 1;
    b += Math.abs(b) * 0.1 || 1;
  }
  let step = niceStep((b - a) / k);
  for (let guard = 0; guard < 20; guard++) {
    const floor = Math.floor(round6(a / step)) * step;
    if (floor + step * k >= b - 1e-9) {
      const ticks = Array.from({ length: k + 1 }, (_, i) => round6(floor + i * step));
      return { lo: ticks[0], hi: ticks[k], ticks };
    }
    step = niceStep(step * 1.0001);
  }
  const ticks = Array.from({ length: k + 1 }, (_, i) => round6(a + ((b - a) * i) / k));
  return { lo: a, hi: b, ticks };
}

/** Maps a value on [fromLo, fromHi] to the same relative height on [toLo, toHi] (a compare value onto the primary axis). */
export function mapAxis(v: number, fromLo: number, fromHi: number, toLo: number, toHi: number): number {
  "worklet";
  return fromHi === fromLo ? toLo : toLo + ((v - fromLo) / (fromHi - fromLo)) * (toHi - toLo);
}

// --- Range windows and statistics ---

export type ExplorerRange = "w" | "m" | "6m" | "1y" | "all";
export const EXPLORER_DAYS: Record<Exclude<ExplorerRange, "all">, number> = { w: 7, m: 30, "6m": 182, "1y": 365 };

/**
 * The window a range shows on a daily series of `total` days (x = day index 0…total − 1, each day a unit wide band
 * centred on its index): the last N days ending on day `end`, or everything. At least one day; never past the data.
 */
export function rangeWindow(range: ExplorerRange, end: number, total: number): { start: number; span: number } {
  const min = -0.5;
  const max = Math.max(0, total - 1) + 0.5;
  const last = Math.min(Math.max(0, end), Math.max(0, total - 1));
  if (range === "all" || total <= 0) return { start: min, span: max - min };
  const span = Math.min(EXPLORER_DAYS[range], max - min);
  return { start: clampStart(last + 0.5 - span, span, min, max), span };
}

export type WindowStats = { min: number | null; max: number | null; avg: number | null; minIndex: number; maxIndex: number; count: number; total: number | null };

/** Min, max, mean and sum of the values with x inside [from, to] (`xs` ascending; nulls skipped). */
export function windowStats(xs: readonly number[], ys: readonly (number | null)[], from: number, to: number): WindowStats {
  let min: number | null = null;
  let max: number | null = null;
  let sum = 0;
  let count = 0;
  let minIndex = -1;
  let maxIndex = -1;
  for (let i = 0; i < xs.length; i++) {
    const v = ys[i];
    if (v === null || xs[i] < from || xs[i] > to) continue;
    if (min === null || v < min) {
      min = v;
      minIndex = i;
    }
    if (max === null || v > max) {
      max = v;
      maxIndex = i;
    }
    sum += v;
    count++;
  }
  return { min, max, avg: count ? sum / count : null, minIndex, maxIndex, count, total: count ? sum : null };
}

// --- Calendar text without Intl (cheap enough to label every day of several years) ---

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday 0 (Sunday) – 6 of a YYYY-MM-DD day, in UTC so the runtime zone never shifts it. */
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** "Sep 28". */
export const monthDayText = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;

/** "Mon, Sep 28". */
export const shortDayText = (day: string) => `${WEEKDAYS[weekdayOf(day)]}, ${monthDayText(day)}`;

/** "Sep 28, 2026". */
export const fullDayText = (day: string) => `${monthDayText(day)}, ${day.slice(0, 4)}`;

/** "06:05" for minutes from local midnight (wrapping past either midnight). */
export function minuteText(m: number): string {
  const v = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  const mm = v % 60;
  return `${h < 10 ? "0" : ""}${h}:${mm < 10 ? "0" : ""}${mm}`;
}

// --- Tick levels: one list of ticks per granularity, the explorer picks the finest that fits ---

export type Tick = { x: number; text: string };
/** `step` is the typical distance between ticks in x units (for choosing a level by the zoom). */
export type TickLevel = { step: number; ticks: Tick[] };

/**
 * Tick levels for a daily series (x = index into `days`): every day ("Mon 5"), every Monday ("Oct 6"), every month
 * ("Oct", the year at January), every quarter and every year.
 */
export function dayTickLevels(days: readonly string[]): TickLevel[] {
  const daily: Tick[] = [];
  const weekly: Tick[] = [];
  const monthly: Tick[] = [];
  const quarterly: Tick[] = [];
  const yearly: Tick[] = [];
  days.forEach((d, i) => {
    const dom = Number(d.slice(8, 10));
    const month = Number(d.slice(5, 7));
    const wd = weekdayOf(d);
    daily.push({ x: i, text: `${WEEKDAYS[wd]} ${dom}` });
    if (wd === 1) weekly.push({ x: i, text: monthDayText(d) });
    if (dom === 1) {
      const text = month === 1 ? d.slice(0, 4) : MONTHS[month - 1];
      monthly.push({ x: i, text });
      if ((month - 1) % 3 === 0) quarterly.push({ x: i, text });
      if (month === 1) yearly.push({ x: i, text });
    }
  });
  return [
    { step: 1, ticks: daily },
    { step: 7, ticks: weekly },
    { step: 30.44, ticks: monthly },
    { step: 91.3, ticks: quarterly },
    { step: 365.25, ticks: yearly },
  ];
}

const MINUTE_STEPS = [5, 10, 15, 30, 60, 120, 180, 360, 720];

/** Tick levels for an intraday series (x = minutes from local midnight) across [from, to]: whole clock times. */
export function minuteTickLevels(from: number, to: number): TickLevel[] {
  return MINUTE_STEPS.map((step) => {
    const ticks: Tick[] = [];
    for (let m = Math.ceil(from / step) * step; m <= to; m += step) ticks.push({ x: m, text: minuteText(m) });
    return { step, ticks };
  });
}

/** The finest level whose ticks sit at least `minPx` apart when `span` x units fill `widthPx`; the coarsest otherwise. */
export function pickLevel(levels: readonly { step: number }[], span: number, widthPx: number, minPx: number): number {
  "worklet";
  if (!levels.length) return -1;
  const perUnit = span > 0 ? widthPx / span : 0;
  for (let i = 0; i < levels.length; i++) if (levels[i].step * perUnit >= minPx) return i;
  return levels.length - 1;
}

/** First index of ascending ticks with x ≥ `x` (binary search), for drawing only the visible ones. */
export function firstTickAtOrAfter(ticks: readonly { x: number }[], x: number): number {
  "worklet";
  let lo = 0;
  let hi = ticks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid].x < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * At most about `max` points of a series with gaps, for drawing (the readouts keep every point): consecutive points
 * are bucketed and each bucket keeps its lowest and highest point in time order, so peaks and dips survive. A bucket
 * holding a gap keeps all its points, so a gap is never drawn over.
 */
export function downsample<T>(items: readonly T[], value: (item: T) => number | null, max: number): T[] {
  if (items.length <= max || max < 4) return [...items];
  const size = Math.ceil(items.length / Math.floor(max / 2));
  const out: T[] = [];
  for (let i = 0; i < items.length; i += size) {
    const bucket = items.slice(i, i + size);
    if (bucket.some((b) => value(b) === null)) {
      out.push(...bucket);
      continue;
    }
    let lo = 0;
    let hi = 0;
    bucket.forEach((b, k) => {
      if (value(b)! < value(bucket[lo])!) lo = k;
      if (value(b)! > value(bucket[hi])!) hi = k;
    });
    if (lo === hi) out.push(bucket[lo]);
    else out.push(bucket[Math.min(lo, hi)], bucket[Math.max(lo, hi)]);
  }
  return out;
}

/**
 * The explorer's bars-to-line crossfade for a window `span` days wide: 1 (bars) up to `full` days, 0 (a line) from
 * `none` days, linear between, so zooming out melts the bars into the line instead of switching at a threshold.
 */
export function barsWeight(span: number, full = 55, none = 95): number {
  "worklet";
  if (span <= full) return 1;
  if (span >= none) return 0;
  return (none - span) / (none - full);
}

// --- Draw-in ---

/**
 * A staggered rise: item `i` of `n` grows over the middle part of the overall progress `p` (0-1), the first starting at
 * once and the last finishing at 1, each taking `share` of the time. Clamped to 0-1.
 */
export function staggered(p: number, i: number, n: number, share = 0.6): number {
  "worklet";
  if (p >= 1) return 1;
  if (n <= 1) return p <= 0 ? 0 : p;
  const lag = ((1 - share) * i) / (n - 1);
  const t = (p - lag) / share;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

// --- Time-axis labels ---

/** The smallest whole-hour step (1, 2, 3, 4, 6, 12 h) that puts ticks at least `minPx` apart when `spanMs` fills `widthPx`. */
export function hourStepFor(spanMs: number, widthPx: number, minPx: number): number {
  const perHour = spanMs > 0 ? widthPx / (spanMs / 3_600_000) : Infinity;
  for (const h of [1, 2, 3, 4, 6]) if (h * perHour >= minPx) return h;
  return 12;
}

/**
 * Which of the labels centred at `xs` (ascending, `widths` wide) to draw: left to right, each kept only when it stays
 * `gap` px clear of the last one kept and of every `blocked` stretch [from, to] (the labels pinned at an axis' ends).
 */
export function spacedLabels(xs: readonly number[], widths: readonly number[], blocked: readonly (readonly [number, number])[], gap: number): boolean[] {
  let edge = -Infinity;
  return xs.map((x, i) => {
    const a = x - widths[i] / 2;
    const b = x + widths[i] / 2;
    if (a < edge + gap) return false;
    if (blocked.some(([from, to]) => a < to + gap && b > from - gap)) return false;
    edge = b;
    return true;
  });
}
