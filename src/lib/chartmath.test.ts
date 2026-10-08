import { describe, expect, it } from "vitest";
import {
  alignedScale,
  barsWeight,
  bandIndexAt,
  bandIndexClamped,
  clampStart,
  dataMatrix,
  dataXAt,
  dayTickLevels,
  downsample,
  firstTickAtOrAfter,
  fullDayText,
  hourStepFor,
  mapAxis,
  minuteText,
  minuteTickLevels,
  monthDayText,
  nearestIndex,
  nearestValued,
  niceScale,
  niceStep,
  pickLevel,
  rangeWindow,
  screenXOf,
  shortDayText,
  spacedLabels,
  staggered,
  windowStats,
  zoomViewport,
} from "./chartmath";

describe("hit-testing", () => {
  it("finds the band under a finger and rejects the margins", () => {
    expect(bandIndexAt(10, 10, 80, 7)).toBe(0);
    expect(bandIndexAt(79.9, 10, 80, 7)).toBe(6);
    expect(bandIndexAt(9, 10, 80, 7)).toBe(-1);
    expect(bandIndexAt(80, 10, 80, 7)).toBe(-1);
    expect(bandIndexAt(40, 10, 10, 7)).toBe(-1);
  });

  it("clamps a finger past either end to the end bands", () => {
    expect(bandIndexClamped(-50, 10, 80, 7)).toBe(0);
    expect(bandIndexClamped(500, 10, 80, 7)).toBe(6);
    expect(bandIndexClamped(45, 10, 80, 7)).toBe(3);
  });

  it("finds the nearest x by binary search", () => {
    const xs = [0, 10, 20, 30, 40];
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 14)).toBe(1);
    expect(nearestIndex(xs, 16)).toBe(2);
    expect(nearestIndex(xs, 99)).toBe(4);
    expect(nearestIndex([], 3)).toBe(-1);
  });

  it("skips gaps to the nearest point with a value, within a limit", () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const ys = [10, null, null, null, 50, null];
    expect(nearestValued(xs, ys, 2.4)).toBe(4);
    expect(nearestValued(xs, ys, 1.4)).toBe(0);
    expect(nearestValued(xs, ys, 5)).toBe(4);
    expect(nearestValued(xs, ys, 2, 1)).toBe(-1);
    expect(nearestValued([0, 1], [null, null], 0)).toBe(-1);
  });
});

describe("viewport", () => {
  it("keeps the window inside the data", () => {
    expect(clampStart(-5, 10, 0, 100)).toBe(0);
    expect(clampStart(95, 10, 0, 100)).toBe(90);
    expect(clampStart(40, 10, 0, 100)).toBe(40);
    expect(clampStart(40, 200, 0, 100)).toBe(0);
  });

  it("zooms about the focal point", () => {
    const z = zoomViewport(0, 100, 50, 2, 0, 100, 5);
    expect(z.span).toBe(50);
    expect(z.start).toBe(25);
    // The focal point keeps its relative place on screen.
    const w = zoomViewport(0, 100, 20, 4, 0, 100, 5);
    expect((20 - w.start) / w.span).toBeCloseTo(0.2);
  });

  it("caps zoom at the minimum span and the full extent", () => {
    expect(zoomViewport(0, 10, 5, 100, 0, 100, 7).span).toBe(7);
    const out = zoomViewport(40, 20, 50, 0.01, 0, 100, 7);
    expect(out).toEqual({ start: 0, span: 100 });
  });

  it("maps between data and screen x both ways", () => {
    const px = screenXOf(30, 10, 40, 20, 200);
    expect(px).toBe(120);
    expect(dataXAt(px, 10, 40, 20, 200)).toBe(30);
  });

  it("builds a data-to-screen matrix", () => {
    const m = dataMatrix(10, 40, 20, 200, 0, 100, 10, 210);
    const apply = (x: number, y: number) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
    expect(apply(10, 0)).toEqual([20, 210]);
    expect(apply(50, 100)).toEqual([220, 10]);
    expect(apply(30, 50)).toEqual([120, 110]);
  });
});

describe("axes", () => {
  it("picks 1-2-2.5-5 steps", () => {
    expect(niceStep(0.9)).toBe(1);
    expect(niceStep(1.3)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(1300)).toBe(2000);
  });

  it("rounds a domain out to whole steps", () => {
    const s = niceScale(43, 87, 4);
    expect(s.lo).toBeLessThanOrEqual(43);
    expect(s.hi).toBeGreaterThanOrEqual(87);
    expect(s.ticks[0]).toBe(s.lo);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.hi);
    const steps = s.ticks.slice(1).map((t, i) => t - s.ticks[i]);
    expect(new Set(steps.map((d) => d.toFixed(6))).size).toBe(1);
  });

  it("keeps zero for bar data and survives a flat or empty series", () => {
    expect(niceScale(3000, 12000, 4, true).lo).toBe(0);
    const flat = niceScale(50, 50);
    expect(flat.hi).toBeGreaterThan(flat.lo);
    const none = niceScale(NaN, NaN);
    expect(none.ticks.length).toBeGreaterThan(1);
  });

  it("aligns a compare axis on the primary grid rows", () => {
    for (const [lo, hi, n] of [
      [31, 97, 3],
      [0.4, 2.7, 4],
      [3200, 18450, 5],
      [-1.2, 0.8, 4],
      [55, 55, 3],
    ] as const) {
      const a = alignedScale(lo, hi, n);
      expect(a.ticks.length).toBe(n);
      expect(a.lo).toBeLessThanOrEqual(lo);
      expect(a.hi).toBeGreaterThanOrEqual(hi);
      const step = a.ticks[1] - a.ticks[0];
      a.ticks.forEach((t, i) => expect(t).toBeCloseTo(a.lo + i * step, 6));
      // The step is a nice number.
      expect(niceStep(step)).toBeCloseTo(step, 9);
    }
  });

  it("maps a compare value to the same relative height", () => {
    expect(mapAxis(50, 0, 100, 0, 21)).toBeCloseTo(10.5);
    expect(mapAxis(5, 5, 5, 0, 21)).toBe(0);
  });
});

describe("range windows", () => {
  it("shows the last N days ending on the chosen day", () => {
    expect(rangeWindow("w", 99, 100)).toEqual({ start: 92.5, span: 7 });
    expect(rangeWindow("m", 99, 100)).toEqual({ start: 69.5, span: 30 });
    expect(rangeWindow("w", 50, 100)).toEqual({ start: 43.5, span: 7 });
  });

  it("never runs past the data and shows everything for All", () => {
    expect(rangeWindow("1y", 99, 100)).toEqual({ start: -0.5, span: 100 });
    expect(rangeWindow("all", 10, 100)).toEqual({ start: -0.5, span: 100 });
    expect(rangeWindow("w", 2, 100)).toEqual({ start: -0.5, span: 7 });
    expect(rangeWindow("w", 500, 100).start).toBe(92.5);
  });

  it("summarises the values inside a window", () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [5, null, 9, 1, 7];
    const s = windowStats(xs, ys, 0.5, 4);
    expect(s).toMatchObject({ min: 1, max: 9, count: 3, minIndex: 3, maxIndex: 2, total: 17 });
    expect(s.avg).toBeCloseTo(17 / 3);
    expect(windowStats(xs, ys, 10, 20)).toMatchObject({ min: null, max: null, avg: null, count: 0, total: null });
  });
});

describe("labels and ticks", () => {
  it("formats days without Intl", () => {
    expect(monthDayText("2026-09-28")).toBe("Sep 28");
    expect(shortDayText("2026-09-28")).toBe("Mon, Sep 28");
    expect(fullDayText("2026-01-05")).toBe("Jan 5, 2026");
    expect(minuteText(0)).toBe("00:00");
    expect(minuteText(605)).toBe("10:05");
    expect(minuteText(-90)).toBe("22:30");
    expect(minuteText(1440 + 61)).toBe("01:01");
  });

  it("builds day, week, month, quarter and year levels", () => {
    const days: string[] = [];
    for (let t = Date.UTC(2025, 11, 20); t <= Date.UTC(2026, 3, 5); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
    const [daily, weekly, monthly, quarterly, yearly] = dayTickLevels(days);
    expect(daily.ticks).toHaveLength(days.length);
    expect(weekly.ticks.every((k) => new Date(`${days[k.x]}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect(monthly.ticks.map((k) => k.text)).toEqual(["2026", "Feb", "Mar", "Apr"]);
    expect(quarterly.ticks.map((k) => k.text)).toEqual(["2026", "Apr"]);
    expect(yearly.ticks.map((k) => k.text)).toEqual(["2026"]);
  });

  it("builds clock levels across midnight", () => {
    const levels = minuteTickLevels(-120, 480);
    const hourly = levels.find((l) => l.step === 60)!;
    expect(hourly.ticks[0]).toEqual({ x: -120, text: "22:00" });
    expect(hourly.ticks.at(-1)).toEqual({ x: 480, text: "08:00" });
  });

  it("picks the finest level that leaves room between labels", () => {
    const levels = [{ step: 1 }, { step: 7 }, { step: 30 }];
    expect(pickLevel(levels, 7, 330, 44)).toBe(0);
    expect(pickLevel(levels, 30, 330, 44)).toBe(1);
    expect(pickLevel(levels, 365, 330, 44)).toBe(2);
    expect(pickLevel([], 7, 330, 44)).toBe(-1);
  });

  it("finds the first visible tick", () => {
    const ticks = [{ x: 0 }, { x: 5 }, { x: 10 }];
    expect(firstTickAtOrAfter(ticks, -1)).toBe(0);
    expect(firstTickAtOrAfter(ticks, 5)).toBe(1);
    expect(firstTickAtOrAfter(ticks, 6)).toBe(2);
    expect(firstTickAtOrAfter(ticks, 11)).toBe(3);
  });
});

describe("downsample", () => {
  it("keeps each bucket's low and high, in order, and every gap", () => {
    const pts = Array.from({ length: 1440 }, (_, i) => ({ t: i, v: i === 700 ? 190 : i === 900 ? 40 : i >= 100 && i < 103 ? null : 60 + (i % 7) }));
    const out = downsample(pts, (p) => p.v, 600);
    expect(out.length).toBeLessThanOrEqual(620);
    expect(out.some((p) => p.v === 190)).toBe(true);
    expect(out.some((p) => p.v === 40)).toBe(true);
    expect(out.filter((p) => p.v === null)).toHaveLength(3);
    for (let i = 1; i < out.length; i++) expect(out[i].t).toBeGreaterThan(out[i - 1].t);
    expect(downsample(pts.slice(0, 10), (p) => p.v, 600)).toHaveLength(10);
  });
});

describe("bars and line crossfade", () => {
  it("melts bars into a line as the window widens", () => {
    expect(barsWeight(7)).toBe(1);
    expect(barsWeight(55)).toBe(1);
    expect(barsWeight(75)).toBeCloseTo(0.5);
    expect(barsWeight(95)).toBe(0);
    expect(barsWeight(365)).toBe(0);
  });
});

describe("draw-in", () => {
  it("staggers items across the progress", () => {
    expect(staggered(0, 0, 7)).toBe(0);
    expect(staggered(1, 6, 7)).toBe(1);
    expect(staggered(0.5, 0, 7)).toBeGreaterThan(staggered(0.5, 6, 7));
    expect(staggered(0.3, 6, 7)).toBe(0);
    expect(staggered(0.5, 0, 1)).toBe(0.5);
  });
});

describe("time-axis labels", () => {
  it("steps whole hours so ticks keep their distance", () => {
    const H = 3_600_000;
    // An eight-hour night across 227 px: 28 px an hour, so every second hour clears 44 px.
    expect(hourStepFor(8 * H, 227, 44)).toBe(2);
    expect(hourStepFor(8 * H, 600, 44)).toBe(1);
    expect(hourStepFor(24 * H, 260, 44)).toBe(6);
    expect(hourStepFor(24 * H, 60, 44)).toBe(12);
  });

  it("keeps labels clear of each other and of the pinned end labels", () => {
    // Ends pinned at [0, 30] and [200, 230]; ticks every 40 px, 30 px wide, 8 px apart at least.
    expect(spacedLabels([20, 60, 100, 140, 180, 220], [30, 30, 30, 30, 30, 30], [[0, 30], [200, 230]], 8)).toEqual([false, true, true, true, false, false]);
    // Crowded ticks: every other one.
    expect(spacedLabels([0, 20, 40, 60], [30, 30, 30, 30], [], 4)).toEqual([true, false, true, false]);
  });
});
