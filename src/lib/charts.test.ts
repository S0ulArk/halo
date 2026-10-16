// The Activity rings' geometry (two gradient halves standing in for a sweep gradient), their colour sampling, and the
// heart-rate range buckets the day chart draws as capsules.
import { describe, expect, it } from "vitest";
import { bucketMinutes, clockArcPath, clockPoint, colorAt, rangeBuckets, ringHalves, ringShades } from "./charts";

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe("ring geometry", () => {
  it("measures angles clockwise from 12 o'clock", () => {
    const top = clockPoint(50, 50, 40, 0);
    const right = clockPoint(50, 50, 40, 90);
    const bottom = clockPoint(50, 50, 40, 180);
    expect(close(top.x, 50) && close(top.y, 10)).toBe(true);
    expect(close(right.x, 90) && close(right.y, 50)).toBe(true);
    expect(close(bottom.x, 50) && close(bottom.y, 90)).toBe(true);
  });

  it("splits a full ring into two equal halves that meet at 6 o'clock", () => {
    const [a, b] = ringHalves(50, 50, 40, 0, 360);
    expect(close(a.length, Math.PI * 40)).toBe(true);
    expect(close(b.length, Math.PI * 40)).toBe(true);
    expect(close(a.from.y, 10) && close(a.to.y, 90)).toBe(true);
    expect(close(b.from.y, 90) && close(b.to.y, 10)).toBe(true);
  });

  it("places each half's stops in order along its chord, coloured by their share of the sweep", () => {
    for (const [start, sweep] of [
      [0, 360],
      [235, 250],
      [10, 90],
    ]) {
      for (const h of ringHalves(60, 60, 50, start, sweep, 7)) {
        const offsets = h.stops.map((s) => s.offset);
        expect(offsets[0]).toBeCloseTo(0, 6);
        expect(offsets[offsets.length - 1]).toBeCloseTo(1, 6);
        offsets.slice(1).forEach((o, i) => expect(o).toBeGreaterThanOrEqual(offsets[i]));
      }
      const [a, b] = ringHalves(60, 60, 50, start, sweep, 7);
      expect(a.stops[0].t).toBe(0);
      expect(a.stops[a.stops.length - 1].t).toBeCloseTo(0.5, 6);
      expect(b.stops[0].t).toBeCloseTo(0.5, 6);
      expect(b.stops[b.stops.length - 1].t).toBeCloseTo(1, 6);
    }
  });

  it("draws a stretch of the track clockwise, the large arc flag set past half a turn", () => {
    expect(clockArcPath(50, 50, 40, 0, 90)).toBe("M50.000 10.000A40 40 0 0 1 90.000 50.000");
    expect(clockArcPath(50, 50, 40, 235, 485)).toContain("A40 40 0 1 1");
    expect(clockArcPath(50, 50, 40, 30, 30)).toBe("");
  });

  it("draws nothing measurable for an empty sweep", () => {
    const [a, b] = ringHalves(50, 50, 40, 0, 0);
    expect(a.length).toBe(0);
    expect(b.length).toBe(0);
    expect(a.d).not.toContain("NaN");
  });
});

describe("ring colours", () => {
  it("blends between evenly spaced colours", () => {
    expect(colorAt(["#000000", "#ffffff"], 0)).toBe("rgb(0,0,0)");
    expect(colorAt(["#000000", "#ffffff"], 1)).toBe("rgb(255,255,255)");
    expect(colorAt(["#000000", "#ffffff"], 0.5)).toBe("rgb(128,128,128)");
    expect(colorAt(["#ff0000", "#00ff00", "#0000ff"], 0.5)).toBe("rgb(0,255,0)");
    expect(colorAt(["#123456"], 0.7)).toBe("#123456");
  });

  it("shades a colour darker at the start and lighter at the end, the colour itself in the middle", () => {
    const [start, mid, end] = ringShades("#34c759");
    const lum = (c: string) => c.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0);
    expect(mid).toBe("#34c759");
    expect(lum(start)).toBeLessThan(0x34 + 0xc7 + 0x59);
    expect(lum(end)).toBeGreaterThan(0x34 + 0xc7 + 0x59);
  });
});

describe("heart-rate range buckets", () => {
  const MIN = 60_000;
  const pts = [60, 62, null, 70, 90, 88, null, null, 55].map((v, i) => ({ t: i * MIN, v }));

  it("keeps each bucket's low and high and skips gaps", () => {
    const b = rangeBuckets(pts, 3 * MIN);
    expect(b).toEqual([
      { start: 0, end: 3 * MIN, min: 60, max: 62, count: 2 },
      { start: 3 * MIN, end: 6 * MIN, min: 70, max: 90, count: 3 },
      { start: 6 * MIN, end: 9 * MIN, min: 55, max: 55, count: 1 },
    ]);
  });

  it("leaves an empty stretch out rather than bridging it", () => {
    const b = rangeBuckets(pts, MIN);
    expect(b.map((x) => x.start / MIN)).toEqual([0, 1, 3, 4, 5, 8]);
  });

  it("picks the finest bucket that keeps the capsules apart", () => {
    const day = 24 * 60 * MIN;
    expect(bucketMinutes(day, 300, 5)).toBe(30);
    expect(bucketMinutes(day, 1440, 5)).toBe(5);
    expect(bucketMinutes(day, 40, 5)).toBe(120);
  });
});
