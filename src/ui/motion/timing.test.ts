import { describe, expect, it } from "vitest";
import { formatValue } from "@/lib/format";
import { burstCounter, COUNT, COUNTABLE, countUpAt, cubicBezier, EASE, ENTER, POP, staggerDelay, tween, waveStops } from "./timing";

describe("cubicBezier", () => {
  it("is exact at the ends and stays in range", () => {
    for (const ease of [EASE.outExpo, EASE.fill, EASE.standard]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      for (let t = 0; t <= 1; t += 0.01) {
        const v = ease(t);
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("is monotonic for the kit's curves", () => {
    for (const ease of [EASE.outExpo, EASE.fill, EASE.standard]) {
      let prev = 0;
      for (let t = 0; t <= 1.0001; t += 0.005) {
        const v = ease(t);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it("matches the identity curve and known points", () => {
    const lin = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    for (const t of [0.1, 0.25, 0.5, 0.9]) expect(lin(t)).toBeCloseTo(t, 5);
    // CSS `ease-out` (0, 0, 0.58, 1) is symmetric with `ease-in` (0.42, 0, 1, 1): out(t) = 1 − in(1 − t).
    const easeIn = cubicBezier(0.42, 0, 1, 1);
    for (const t of [0.2, 0.5, 0.8]) expect(EASE.fill(t)).toBeCloseTo(1 - easeIn(1 - t), 5);
    // Ease-out-expo is most of the way there by a third of the time.
    expect(EASE.outExpo(1 / 3)).toBeGreaterThan(0.8);
  });
});

describe("entrance cascade", () => {
  it("spaces items 40 ms apart and caps after six steps", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => staggerDelay(i))).toEqual([0, 40, 80, 120, 160, 200]);
    expect(staggerDelay(6)).toBe(200);
    expect(staggerDelay(60)).toBe(200);
    expect(staggerDelay(-1)).toBe(0);
    expect(staggerDelay(Number.NaN)).toBe(0);
    // The longest entrance a cascade can produce stays under half a second.
    expect(staggerDelay(99) + ENTER.duration).toBeLessThanOrEqual(420);
  });

  it("numbers a burst in order and restarts after a pause", () => {
    let t = 1000;
    const next = burstCounter(120, () => t);
    expect([next(), next(), next()]).toEqual([0, 1, 2]);
    t += 50;
    expect(next()).toBe(3);
    t += 121;
    expect(next()).toBe(0);
    t += 10;
    expect(next()).toBe(1);
  });
});

describe("count-up", () => {
  it("runs from start to target along the dials' curve", () => {
    expect(countUpAt(0, 85, 0)).toBe(0);
    expect(countUpAt(0, 85, COUNT.duration)).toBe(85);
    expect(countUpAt(0, 85, COUNT.duration * 2)).toBe(85);
    expect(countUpAt(0, 85, COUNT.duration / 2)).toBeCloseTo(85 * EASE.fill(0.5), 9);
    let prev = -1;
    for (let ms = 0; ms <= COUNT.duration; ms += 16) {
      const v = countUpAt(0, 85, ms);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("counts down and through zero, and lands exactly", () => {
    expect(countUpAt(56, 49, COUNT.duration / 2)).toBeLessThan(56);
    expect(countUpAt(56, 49, COUNT.duration / 2)).toBeGreaterThan(49);
    expect(tween(-0.4, 0.2, 1)).toBe(0.2);
    expect(tween(-0.4, 0.2, 0)).toBe(-0.4);
    expect(tween(0, 13406, 1.5)).toBe(13406);
  });

  it("shows a zero-duration count at once", () => {
    expect(countUpAt(0, 42, 0, 0)).toBe(42);
  });

  it("counts formats that read sensibly on the way", () => {
    expect(COUNTABLE.pace).toBe(false);
    expect(COUNTABLE.int && COUNTABLE.grouped && COUNTABLE.duration && COUNTABLE.signed1).toBe(true);
    // Intermediate frames format like the final value: h:mm for durations, grouping for big counts.
    expect(formatValue("duration", countUpAt(0, 406, COUNT.duration / 2))).toMatch(/^\d:\d\d$/);
    expect(formatValue("grouped", countUpAt(0, 13406, COUNT.duration / 2))).toMatch(/^\d{1,2},\d{3}$/);
  });
});

describe("waveStops", () => {
  it("is one smooth cycle lo → hi → lo", () => {
    const { inputRange, outputRange } = waveStops(1, 1.03);
    expect(inputRange[0]).toBe(0);
    expect(inputRange[inputRange.length - 1]).toBe(1);
    expect(outputRange[0]).toBeCloseTo(1, 12);
    expect(outputRange[outputRange.length - 1]).toBeCloseTo(1, 12);
    expect(outputRange[inputRange.indexOf(0.5)]).toBeCloseTo(1.03, 12);
    for (let i = 1; i < inputRange.length; i++) expect(inputRange[i]).toBeGreaterThan(inputRange[i - 1]);
    // Symmetric about the middle.
    for (let i = 0; i < outputRange.length; i++) expect(outputRange[i]).toBeCloseTo(outputRange[outputRange.length - 1 - i], 12);
  });

  it("can run high → low → high", () => {
    const { outputRange } = waveStops(1, 0.35);
    expect(outputRange[0]).toBeCloseTo(1, 12);
    expect(Math.min(...outputRange)).toBeCloseTo(0.35, 12);
  });
});

it("keeps every kit animation within 700 ms", () => {
  expect(COUNT.duration).toBeLessThanOrEqual(700);
  expect(POP.up + POP.down).toBeLessThanOrEqual(700);
  expect(ENTER.duration).toBeLessThanOrEqual(700);
});
