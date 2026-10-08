import { describe, expect, it } from "vitest";
import { blobRadius, lowestEdge, ORB, particleLayer, swirlVelocity } from "./orb";

const M = ORB.motion;
const STEPS = 128;
const TAU = Math.PI * 2;

/** The settled outline the 2D orb drew, in px, for a seed and size. */
function outline(seed: number, size: number) {
  const R = (size / 2) * ORB.shape.radius;
  const small = size < 160;
  return Array.from({ length: STEPS + 1 }, (_, i) => R * blobRadius((i / STEPS) * TAU, 10, seed, small, 1));
}

/** The outline's radius at any angle, interpolated between table samples (finer than the drawing's own lookup). */
function radiusAt(rTab: number[], a: number) {
  const x = ((((a % TAU) + TAU) % TAU) / TAU) * STEPS;
  const i = Math.floor(x);
  const f = x - i;
  return rTab[i] * (1 - f) + rTab[Math.min(STEPS, i + 1)] * f;
}

describe("orb motion clock", () => {
  it("restarts seamlessly: every wave period divides the loop and every drift is whole turns", () => {
    for (const period of [M.breath, M.twinkle, M.twinkleInner, M.sway, M.shimmer]) expect(Number.isInteger(M.loop / period)).toBe(true);
    for (const turns of [M.turnsA, M.turnsB, M.turnsShimmer]) expect(Number.isInteger(turns)).toBe(true);
  });

  it("drifts the two inner layers opposite ways at different, gentle speeds", () => {
    const degPerSec = (turns: number) => (turns * 360) / M.loop;
    expect(Math.sign(M.turnsA)).toBe(-Math.sign(M.turnsB));
    expect(Math.abs(degPerSec(M.turnsA))).not.toBe(Math.abs(degPerSec(M.turnsB)));
    for (const t of [M.turnsA, M.turnsB, M.turnsShimmer]) expect(Math.abs(degPerSec(t))).toBeLessThanOrEqual(3);
  });
});

describe("swirlVelocity", () => {
  it("ramps up with the hold and then matches the loop's steady speed", () => {
    expect(swirlVelocity(0)).toBe(0);
    expect(swirlVelocity(-5)).toBe(0);
    expect(swirlVelocity(M.swirl.ramp / 2)).toBeCloseTo(swirlVelocity(M.swirl.ramp) / 2, 12);
    // The ramp ends at exactly the loop's speed, so the hand-over is smooth.
    expect(swirlVelocity(M.swirl.ramp)).toBeCloseTo(1 / M.swirl.period, 12);
    expect(swirlVelocity(10_000)).toBeCloseTo(1 / M.swirl.period, 12);
  });

  it("coasts about a tenth of a turn after a long hold", () => {
    const distance = swirlVelocity(10_000) / (1 - M.swirl.deceleration);
    expect(distance).toBeGreaterThan(0.05);
    expect(distance).toBeLessThan(0.2);
  });
});

describe("particleLayer", () => {
  it("only lets particles turn as far as the outline allows", () => {
    const sway = (M.swayDeg * Math.PI) / 180;
    // Every seed AgeOrb can use, at the hero, hub and header sizes.
    for (const size of [300, 200, 108]) {
      for (let seed = 3; seed < 92; seed++) {
        const rTab = outline(seed, size);
        const minEdge = Math.min(...rTab);
        for (let j = 0; j < 48; j++) {
          const a = (j / 48) * TAU;
          for (const depth of [0.3, 0.6, 0.8, 0.9, 0.97]) {
            const dist = radiusAt(rTab, a) * depth;
            const r = 1.5;
            const layer = particleLayer(rTab, STEPS, minEdge, a, dist, r, sway);
            if (layer === "free") {
              // Any rotation keeps it inside.
              for (let k = 0; k < 72; k++) expect(dist + r).toBeLessThanOrEqual(radiusAt(rTab, a + (k / 72) * TAU) + 1e-6);
            } else if (layer === "sway") {
              for (const f of [-1, -0.5, 0, 0.5, 1]) expect(dist + r).toBeLessThanOrEqual(radiusAt(rTab, a + f * sway) + 0.5);
            }
          }
        }
      }
    }
  });

  it("frees the inner field and keeps the rim in place", () => {
    const rTab = outline(15, 300);
    const minEdge = Math.min(...rTab);
    const a = 1.1;
    expect(particleLayer(rTab, STEPS, minEdge, a, minEdge * 0.5, 1, 0.03)).toBe("free");
    expect(particleLayer(rTab, STEPS, minEdge, a, radiusAt(rTab, a) + 2, 1, 0.03)).toBe("fixed");
  });

  it("reads the lowest edge around an angle", () => {
    const rTab = Array.from({ length: STEPS + 1 }, (_, i) => (i === 10 ? 50 : 100));
    const at = (i: number) => (i / STEPS) * TAU;
    expect(lowestEdge(rTab, STEPS, at(11), TAU / STEPS)).toBe(50);
    expect(lowestEdge(rTab, STEPS, at(20), TAU / STEPS)).toBe(100);
  });
});
