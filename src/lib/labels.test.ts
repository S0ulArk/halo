import { describe, expect, it } from "vitest";
import { labelWidth, overlaps, placeDotLabels, type Box, type LabelDay, placeTarget } from "./labels";

// Home's Strain & Recovery geometry (StrainRecoveryChart): a 232 px figure, the plot from y 20 to 182, Strain on
// 0-21 and Recovery on 0-100 %, seven day columns between a 28 px left axis and a 44 px right one.
const FS = 12;
const PLOT_TOP = 20;
const PLOT_BOTTOM = 182;

function week(width: number, rec: (number | null)[], strain: (number | null)[], todayIndex = rec.length - 1) {
  const x0 = 28;
  const x1 = width - 44;
  const band = (x1 - x0) / rec.length;
  const yr = (v: number) => PLOT_BOTTOM - (v / 100) * (PLOT_BOTTOM - PLOT_TOP);
  const ys = (v: number) => PLOT_BOTTOM - (v / 21) * (PLOT_BOTTOM - PLOT_TOP);
  const days: LabelDay[] = rec.map((r, i) => ({
    x: x0 + (i + 0.5) * band,
    a: r === null ? null : { y: yr(r), text: `${Math.round(r)}%` },
    b: strain[i] === null ? null : { y: ys(strain[i]!), text: strain[i]!.toFixed(1) },
    today: i === todayIndex,
  }));
  return { days, opts: { fontSize: FS, top: 2, bottom: PLOT_BOTTOM + 2, left: 0, right: width } };
}

/** The label boxes as placed, to check them against each other. */
function boxes(days: LabelDay[], placed: ReturnType<typeof placeDotLabels>): Box[] {
  return days.flatMap((d, i) =>
    (["a", "b"] as const).flatMap((k) => {
      const cy = placed[i][k];
      const s = d[k];
      if (cy === null || !s) return [];
      const w = labelWidth(s.text, FS);
      return [{ x1: d.x - w / 2, y1: cy - FS / 2, x2: d.x + w / 2, y2: cy + FS / 2 }];
    }),
  );
}

// The demo week from the 363 dp screenshot: "48%" sat on "11.7", "49%" on "10.2", "18%" on "3.7".
const REC = [88, 75, 48, 70, 18, 90, 49];
const STRAIN = [5.6, 11.7, 5.6, 11.4, 3.7, 6.0, 10.2];

describe("placeDotLabels", () => {
  it.each([330, 345, 363, 375, 390, 412, 420])("never overlaps two labels at %i px", (screen) => {
    // The chart's width inside a card: the screen less 2 × 16 page gutter and 2 × 16 card padding.
    const { days, opts } = week(screen - 64, REC, STRAIN);
    const placed = placeDotLabels(days, opts);
    const bs = boxes(days, placed);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlaps(bs[i], bs[j])).toBe(false);
    for (const b of bs) {
      expect(b.y1).toBeGreaterThanOrEqual(opts.top);
      expect(b.y2).toBeLessThanOrEqual(opts.bottom);
      expect(b.x1).toBeGreaterThanOrEqual(opts.left);
      expect(b.x2).toBeLessThanOrEqual(opts.right);
    }
  });

  it("always keeps today's labels, on opposite sides of their dots", () => {
    const { days, opts } = week(299, REC, STRAIN);
    const placed = placeDotLabels(days, opts);
    const t = days.length - 1;
    expect(placed[t].a).not.toBeNull();
    expect(placed[t].b).not.toBeNull();
    // Recovery 49 % (y 102.6) sits above Strain 10.2 (y 103.3): its label above, Strain's below.
    expect(placed[t].a!).toBeLessThan(days[t].a!.y);
    expect(placed[t].b!).toBeGreaterThan(days[t].b!.y);
  });

  it("keeps the extremes before ordinary days", () => {
    const { days, opts } = week(266, REC, STRAIN);
    const placed = placeDotLabels(days, opts);
    // Recovery's high (90 % on day 5) and low (18 % on day 4); Strain's high (11.7 on day 1) and low (3.7 on day 4).
    expect(placed[5].a).not.toBeNull();
    expect(placed[4].a).not.toBeNull();
    expect(placed[1].b).not.toBeNull();
    expect(placed[4].b).not.toBeNull();
  });

  it("drops a label rather than overlap, and keeps everything when there is room", () => {
    const crowded = week(220, [50, 52, 51, 50, 52, 51, 50], [10.5, 10.9, 10.7, 10.5, 10.9, 10.7, 10.5]);
    const tight = placeDotLabels(crowded.days, crowded.opts);
    const shown = tight.flatMap((p) => [p.a, p.b]).filter((v) => v !== null).length;
    expect(shown).toBeLessThan(14);
    expect(tight[6].a).not.toBeNull();
    expect(tight[6].b).not.toBeNull();

    const roomy = week(900, [20, 80, 20, 80, 20, 80, 20], [18, 2, 18, 2, 18, 2, 18]);
    const all = placeDotLabels(roomy.days, roomy.opts);
    expect(all.every((p) => p.a !== null && p.b !== null)).toBe(true);
  });

  it("labels a lone dot above it, and stays inside the plot near the floor", () => {
    const { days, opts } = week(299, [null, 2, null, null, null, null, 60], [null, null, 0.4, null, null, null, null]);
    const placed = placeDotLabels(days, opts);
    expect(placed[1].a!).toBeLessThan(days[1].a!.y);
    expect(placed[2].b!).toBeLessThan(days[2].b!.y);
    expect(placed[0]).toEqual({ a: null, b: null });
  });

  it("clears obstacles such as axis ticks", () => {
    const { days, opts } = week(299, [60, null, null, null, null, null, null], [null, null, null, null, null, null, null], 6);
    const dot = days[0].a!;
    const free = placeDotLabels(days, opts)[0].a!;
    const wall: Box = { x1: 0, y1: free - 8, x2: days[0].x + 40, y2: free + 8 };
    const moved = placeDotLabels(days, { ...opts, obstacles: [wall] })[0].a;
    // Its first side is blocked, so it flips under the dot.
    expect(moved).not.toBeNull();
    expect(moved!).toBeGreaterThan(dot.y);
  });
});

describe("placeTarget (Healthspan rows' \"Target X\")", () => {
  const right = (r: { left: number }, label: number) => r.left + label;
  it("centres under the marker when there is room", () => {
    const r = placeTarget(300, 70, 12, 24, 0.5);
    expect(r).toEqual({ left: 115, hideLo: false, hideHi: false });
  });
  it("slides away from the end label it would overlap (Sleep consistency: target 86 of 0-100)", () => {
    const r = placeTarget(300, 70, 12, 24, 0.86);
    expect(right(r, 70)).toBeLessThanOrEqual(300 - 24 - 8);
    expect(r.hideHi).toBe(false);
    const l = placeTarget(300, 70, 12, 24, 0.05);
    expect(l.left).toBeGreaterThanOrEqual(12 + 8);
  });
  it("hides the end label on the target's side when there is no room between them", () => {
    const r = placeTarget(120, 70, 30, 30, 0.9);
    expect(r.hideHi).toBe(true);
    expect(r.left).toBeGreaterThanOrEqual(30 + 8);
    expect(right(r, 70)).toBeLessThanOrEqual(120);
  });
  it("never overlaps across widths 240-420 for any target position", () => {
    for (let w = 240; w <= 420; w += 10)
      for (let t = 0; t <= 1; t += 0.05) {
        const r = placeTarget(w, 72, 20, 28, t);
        if (!r.hideLo) expect(r.left).toBeGreaterThanOrEqual(20 + 8 - 1e-9);
        if (!r.hideHi) expect(r.left + 72).toBeLessThanOrEqual(w - 28 - 8 + 1e-9);
      }
  });
});
