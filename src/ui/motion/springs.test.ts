import { describe, expect, it } from "vitest";
import { iosSpring, SPRING } from "./springs";

// The step response of a damped spring of mass 1 from 0 to 1, integrated in 1 ms steps: where it is at each time.
function simulate(cfg: { stiffness: number; damping: number; mass: number }, ms: number): number[] {
  let x = 0;
  let v = 0;
  const out: number[] = [];
  const dt = 0.001;
  for (let i = 0; i < ms; i++) {
    const a = (-cfg.stiffness * (x - 1) - cfg.damping * v) / cfg.mass;
    v += a * dt;
    x += v * dt;
    out.push(x);
  }
  return out;
}

describe("iosSpring", () => {
  it("converts SwiftUI's response and damping fraction to a physical spring", () => {
    const s = iosSpring(0.5, 1);
    expect(s.mass).toBe(1);
    expect(s.stiffness).toBeCloseTo((2 * Math.PI / 0.5) ** 2, 9);
    // Critical damping: c = 2√(k m).
    expect(s.damping).toBeCloseTo(2 * Math.sqrt(s.stiffness), 9);
  });

  it("never overshoots when critically damped, and overshoots a little under it", () => {
    expect(Math.max(...simulate(SPRING.pressIn, 1000))).toBeLessThanOrEqual(1 + 1e-6);
    const peak = Math.max(...simulate(SPRING.release, 1000));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.05);
  });

  it("keeps the kit's springs in iOS's range: damping 0.7 to 1, settled within about half a second", () => {
    for (const s of Object.values(SPRING)) {
      const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
      expect(zeta).toBeGreaterThanOrEqual(0.7);
      expect(zeta).toBeLessThanOrEqual(1);
      const path = simulate(s, 700);
      // Within 2 % of the target from 550 ms on.
      expect(path.slice(550).every((x) => Math.abs(x - 1) < 0.02)).toBe(true);
    }
  });
});
