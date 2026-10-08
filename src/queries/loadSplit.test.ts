// An activity's Strain split into heart-rate and muscular load (WHOOP 2026), as the Activity screen shows it.
import { describe, expect, it } from "vitest";
import { loadSplit } from "./activity";

describe("loadSplit", () => {
  it("gives whole-percent shares of the session's TRIMP that sum to 100", () => {
    expect(loadSplit(41, 36)).toEqual({ cardioPct: 53, muscularPct: 47 });
    for (const [c, m] of [[1, 2], [10, 0.4], [99.5, 0.5], [0.01, 50]]) {
      const s = loadSplit(c, m)!;
      expect(s.cardioPct + s.muscularPct).toBe(100);
    }
  });

  it("is null for a session without muscular load or without heart rate", () => {
    expect(loadSplit(80, 0)).toBeNull();
    expect(loadSplit(null, 30)).toBeNull();
  });
});
