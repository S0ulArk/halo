import { describe, expect, it } from "vitest";
import { forCharge } from "./confidence";
import { baselineVerdict, chargeDrivers, displayRounded, skinTempVerdict, type ChargeDriverVerdict } from "./drivers";
import { logisticScore, recoveryFromStates } from "./recovery";
import type { BaselineState, BaselineStatus } from "./types";

const baseline = (mean: number, sigma: number, nValid = 14): BaselineState => ({
  baseline: mean,
  spread: sigma / 1.253,
  nValid,
  nightsSinceUpdate: 0,
  status: nValid >= 14 ? "trusted" : "provisional",
});
const row = (drivers: ReturnType<typeof chargeDrivers>, label: string) => drivers.find((d) => d.label === label)!;

/** An HRV baseline as Recovery folds it: ln of a ms centre, σ in ln units. */
const hrvLn = (ms: number, lnSigma: number, nValid = 14) => baseline(Math.log(ms), lnSigma, nValid);

describe("RecoveryDriversTest", () => {
  it("each row is the score minus the score with that input at its baseline, rounded half away from zero", () => {
    const hrvBaseline = hrvLn(50, 0.12);
    const rhrBaseline = baseline(55, 3);
    const roundAway = (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x)) || 0;
    for (let hrv = 30; hrv <= 80; hrv += 0.37) {
      for (const rhr of [50, 55, 61.3]) {
        const full = recoveryFromStates({ hrv, rhr, hrvBaseline, rhrBaseline })!;
        const neutral = recoveryFromStates({ hrv: 50, rhr, hrvBaseline, rhrBaseline })!;
        const r = row(chargeDrivers({ hrv, rhr, hrvBaseline, rhrBaseline }), "HEART_RATE_VARIABILITY");
        expect(r.deltaPoints).toBe(roundAway(full - neutral));
        expect(Object.is(r.deltaPoints, -0)).toBe(false);
      }
    }
  });

  it("shows the HRV baseline in ms: the ln baseline's geometric mean", () => {
    const d = chargeDrivers({ hrv: 62, rhr: 51, hrvBaseline: hrvLn(50, 0.12), rhrBaseline: baseline(55, 3) });
    expect(row(d, "HEART_RATE_VARIABILITY")).toMatchObject({ value: 62, unit: "MILLISECONDS", verdict: "ABOVE_BASELINE_SUPPORTING" });
    expect(row(d, "HEART_RATE_VARIABILITY").baseline).toBeCloseTo(50, 9);
  });

  it("verdicts match displayed precision and rounded points", () => {
    const cases: [number, number, number, number, ChargeDriverVerdict][] = [
      [51.3, 50.8, 1, 0, "SLIGHTLY_ABOVE_BASELINE_SUPPORTING"],
      [51.3, 50.8, -1, 0, "SLIGHTLY_ABOVE_BASELINE_LIMITING"],
      [50.8, 51.3, 1, 0, "SLIGHTLY_BELOW_BASELINE_SUPPORTING"],
      [50.8, 51.3, -1, 0, "SLIGHTLY_BELOW_BASELINE_LIMITING"],
      [17.0, 16.0, 0, 1, "ABOVE_BASELINE_TOO_SMALL"],
      [15.0, 16.0, 0, 1, "BELOW_BASELINE_TOO_SMALL"],
      [51.3, 50.8, 0, 0, "AT_BASELINE"],
    ];
    for (const [value, base, points, digits, expected] of cases) {
      expect(baselineVerdict(value, base, points, digits)).toBe(expected);
    }
  });

  it("skin-temp verdict uses the rounded point effect", () => {
    expect(skinTempVerdict(0.2, 0)).toBe("NEAR_BASELINE");
    expect(skinTempVerdict(0.2, -1)).toBe("WARMER_THAN_BASELINE_LIMITING");
    expect(skinTempVerdict(-0.2, -1)).toBe("COOLER_THAN_BASELINE_LIMITING");
  });

  it("an RHR row cannot say above when the displayed values match", () => {
    const d = chargeDrivers({ hrv: 50, rhr: 51.3, hrvBaseline: hrvLn(50, 0.12), rhrBaseline: baseline(50.8, 0.1) });
    const rhr = row(d, "RESTING_HEART_RATE");
    expect(Math.round(rhr.value)).toBe(51);
    expect(Math.round(rhr.baseline!)).toBe(51);
    expect(rhr.deltaPoints).toBeLessThan(0);
    expect(rhr.verdict).toBe("SLIGHTLY_ABOVE_BASELINE_LIMITING");
  });

  it("all terms present yield one row each, biggest mover first; respiratory rate only when it cost points", () => {
    const args = { hrv: 62, rhr: 51, hrvBaseline: hrvLn(50, 0.12), rhrBaseline: baseline(55, 3), respBaseline: baseline(16, 0.5), sleepPerf: 0.9 };
    const raised = chargeDrivers({ ...args, resp: 17.5 });
    expect(new Set(raised.map((r) => r.label))).toEqual(new Set(["HEART_RATE_VARIABILITY", "RESTING_HEART_RATE", "SLEEP_QUALITY", "RESPIRATORY_RATE"]));
    const mags = raised.map((r) => Math.abs(r.deltaPoints));
    expect(mags).toEqual([...mags].sort((a, b) => b - a));
    expect(row(raised, "RESPIRATORY_RATE")).toMatchObject({ value: 17.5, baseline: 16, unit: "BREATHS_PER_MINUTE", verdict: "ABOVE_BASELINE_LIMITING" });
    expect(row(raised, "RESPIRATORY_RATE").deltaPoints).toBeLessThan(0);
    // At or under baseline it changes nothing, so it has no row.
    for (const resp of [14, 16, 16.4]) expect(chargeDrivers({ ...args, resp }).map((r) => r.label)).not.toContain("RESPIRATORY_RATE");
  });

  it("a missing input yields no row, not a fake zero", () => {
    const labels = chargeDrivers({ hrv: 55, rhr: 55, hrvBaseline: hrvLn(50, 0.12), sleepPerf: 0.85 }).map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(["HEART_RATE_VARIABILITY", "SLEEP_QUALITY"]));
    expect(labels).not.toContain("RESTING_HEART_RATE");
    expect(labels).not.toContain("RESPIRATORY_RATE");
    expect(labels).not.toContain("SKIN_TEMPERATURE");
  });

  it("delta sign tracks direction", () => {
    const d = chargeDrivers({ hrv: 80, rhr: 70, hrvBaseline: hrvLn(50, 0.12), rhrBaseline: baseline(55, 3) });
    expect(row(d, "HEART_RATE_VARIABILITY")).toMatchObject({ verdict: "ABOVE_BASELINE_SUPPORTING" });
    expect(row(d, "HEART_RATE_VARIABILITY").deltaPoints).toBeGreaterThan(0);
    expect(row(d, "RESTING_HEART_RATE")).toMatchObject({ verdict: "ABOVE_BASELINE_LIMITING" });
    expect(row(d, "RESTING_HEART_RATE").deltaPoints).toBeLessThan(0);
  });

  it("skin temperature has no row: it isn't part of Recovery (Health Monitor shows it)", () => {
    const args = { hrv: 50, rhr: 55, hrvBaseline: hrvLn(50, 0.12), rhrBaseline: baseline(55, 3), skinTempDev: 0.4 } as Parameters<typeof chargeDrivers>[0];
    expect(chargeDrivers(args).map((r) => r.label)).not.toContain("SKIN_TEMPERATURE");
  });

  it("cold start yields no rows", () => {
    const cold: BaselineState = { baseline: Math.log(50), spread: 0.1, nValid: 2, nightsSinceUpdate: 0, status: "calibrating" };
    expect(chargeDrivers({ hrv: 60, rhr: 50, hrvBaseline: cold, sleepPerf: 0.9 })).toEqual([]);
    expect(forCharge(60, baseline(50, 6, 20))).toBe("solid");
  });

  it("displayRounded matches the Swift oracle exactly", () => {
    const cases: [number, number, number][] = [
      [0.0, 0, 0.0], [51.4, 0, 51.0], [51.5, 0, 52.0], [50.8, 0, 51.0], [-51.5, 0, -52.0],
      [0.0, 1, 0.0], [8.25, 1, 8.3], [15.25, 1, 15.3], [16.05, 1, 16.1], [15.0, 1, 15.0],
      [20.95, 1, 21.0], [-8.25, 1, -8.3], [-0.35, 1, -0.4],
    ];
    for (const [value, digits, expected] of cases) expect(displayRounded(value, digits)).toBe(expected);
  });
});

describe("RecoverySaturationGuardTest: drivers", () => {
  it("the HRV verdict names saturation but the penalty stays full", () => {
    const hrvBaseline = hrvLn(50, 0.125);
    const rhrBaseline = baseline(55, 5.0);
    const sat = row(chargeDrivers({ hrv: 41, rhr: 48, hrvBaseline, rhrBaseline }), "HEART_RATE_VARIABILITY");
    expect(sat.verdict).toBe("HRV_SATURATION_LIMITING");
    expect(sat.deltaPoints).toBeLessThan(0);
    const fat = row(chargeDrivers({ hrv: 41, rhr: 62, hrvBaseline, rhrBaseline }), "HEART_RATE_VARIABILITY");
    expect(fat.verdict).toBe("BELOW_BASELINE_LIMITING");
    expect(fat.deltaPoints).toBeLessThan(0);
  });
});

describe("RecoveryRhrBaselineUsableTest: drivers", () => {
  const state = (mean: number, sigma: number, status: BaselineStatus, nValid: number): BaselineState => ({
    baseline: mean,
    spread: sigma / 1.253,
    nValid,
    nightsSinceUpdate: status === "stale" ? 20 : 0,
    status,
  });
  const rows = (rhrBaseline: BaselineState | null) =>
    chargeDrivers({ hrv: 55, rhr: 62, hrvBaseline: state(Math.log(55), 0.2, "trusted", 20), rhrBaseline, sleepPerf: 0.85 });

  it("an unusable RHR baseline produces no row, identical to none", () => {
    const synthetic = state(75, 6, "calibrating", 0);
    expect(rows(synthetic).map((r) => r.label)).not.toContain("RESTING_HEART_RATE");
    expect(rows(synthetic).map((r) => r.label)).toContain("HEART_RATE_VARIABILITY");
    expect(rows(state(52, 3, "provisional", 5)).map((r) => r.label)).toContain("RESTING_HEART_RATE");
    expect(rows(synthetic)).toEqual(rows(null));
    expect(rows(state(52, 3, "stale", 20))).toEqual(rows(null));
  });
});

describe("plan scenarios", () => {
  it("driver deltas sum to score − neutral within rounding near baseline", () => {
    const args = {
      hrv: 52,
      rhr: 54,
      resp: 15.3,
      hrvBaseline: hrvLn(50, 0.12),
      rhrBaseline: baseline(55, 3),
      respBaseline: baseline(15.5, 1),
      sleepPerf: 0.9,
    };
    const d = chargeDrivers(args);
    const sum = d.reduce((s, r) => s + r.deltaPoints, 0);
    const total = recoveryFromStates(args)! - logisticScore(0);
    // Each row is rounded to an integer (±0.5); the logistic is not additive, so this holds only near baseline.
    expect(Math.abs(sum - total)).toBeLessThanOrEqual(0.5 * d.length);
  });
});
