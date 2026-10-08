import { describe, expect, it } from "vitest";
import { foldHistory, recoveryHRVLnCfg } from "./baselines";
import {
  band,
  bandRedMax,
  gatedRecovery,
  hrvLnZ,
  lnHrv,
  logisticK,
  logisticZ0,
  minBaselineNights,
  parasympatheticSaturation,
  recovery,
  recoveryFromStates,
  respPenalty,
  respPenaltyFromZ,
  respPenaltyPerZ,
  satEnterZ,
  satMaxDampFraction,
  sleepPerfCenter,
  wHRV,
  wRHR,
  wSleep,
  watchRecovery,
  zScore,
} from "./recovery";
import type { BaselineState, BaselineStatus } from "./types";

/** A baseline with a given mean and Gaussian σ (spread is abs-dev units). */
const baseline = (mean: number, sigma: number, nValid = 14): BaselineState => ({
  baseline: mean,
  spread: sigma / 1.253,
  nValid,
  nightsSinceUpdate: 0,
  status: nValid >= 14 ? "trusted" : "provisional",
});
/** An HRV baseline as Recovery folds it: ln of a ms centre, σ in ln units. */
const hrvLn = (ms: number, lnSigma: number, nValid = 14) => baseline(Math.log(ms), lnSigma, nValid);

describe("Recovery on WHOOP's 2026 inputs", () => {
  it("weighs HRV 0.58, resting HR 0.22 and Sleep Performance 0.20; respiratory rate is a penalty only", () => {
    expect([wHRV, wRHR, wSleep]).toEqual([0.58, 0.22, 0.2]);
    expect([respPenaltyFromZ, respPenaltyPerZ]).toEqual([1.0, 0.15]);
  });

  it("scores HRV on a log scale: 60 ms against a 50 ms baseline is a smaller z than on the raw scale", () => {
    const lnZ = hrvLnZ(60, { mean: Math.log(50), spread: 0.15 / 1.253 });
    const rawZ = zScore(60, 50, (50 * 0.15) / 1.253); // the same relative spread in ms
    expect(lnZ).toBeCloseTo(Math.log(1.2) / 0.15, 9);
    expect(lnZ).toBeLessThan(rawZ);
    // A high outlier is compressed: doubling HRV is not twice the z of +50 %.
    const b = { mean: Math.log(50), spread: 0.15 / 1.253 };
    expect(hrvLnZ(100, b)).toBeLessThan(2 * hrvLnZ(75, b));
  });

  const hrvBase = { mean: Math.log(60), spread: 0.15 / 1.253 };
  const rhrBase = { mean: 55, spread: 4 };
  const respBase = { mean: 14.5, spread: 0.5 / 1.253 };
  const at = (resp: number | null, hrv = 60) =>
    recovery({ hrv, rhr: 55, resp, hrvBaseline: hrvBase, rhrBaseline: rhrBase, respBaseline: respBase, sleepPerf: sleepPerfCenter })!;

  it("a low respiratory rate never raises the score", () => {
    for (const r of [10, 12, 13.5, 14.5, 15]) expect(at(r)).toBeCloseTo(at(null), 12);
  });

  it("a raised one lowers it past 1 SD, more when the rest already points down", () => {
    expect(at(15.5)).toBeLessThan(at(null)); // z = 2
    expect(at(16)).toBeLessThan(at(15.5));
    expect(respPenalty(2, 0.5)).toBeCloseTo(0.15, 12);
    expect(respPenalty(2, -0.5)).toBeCloseTo(0.3, 12);
    expect(respPenalty(1, -0.5)).toBe(0);
    // Same raised rate, a low-HRV night: it costs more points.
    const drop = (hrv: number) => at(null, hrv) - at(15.5, hrv);
    expect(drop(40)).toBeGreaterThan(0);
    expect(drop(60)).toBeGreaterThan(0);
  });

  it("skin temperature has no effect: Recovery takes no skin-temperature input", () => {
    const args = { hrv: 60, rhr: 55, hrvBaseline: hrvBase, rhrBaseline: rhrBase, sleepPerf: 0.8 };
    const withSkin = { ...args, skinTempDev: 1.5 } as Parameters<typeof recovery>[0];
    expect(recovery(withSkin)).toBe(recovery(args));
  });
});

describe("RecoveryRequiredHrvBaselineTest", () => {
  const rhrB = { mean: 55, spread: 3 / 1.253 };
  const respB = { mean: 14.5, spread: 1 / 1.253 };
  const effortB = { mean: 40, spread: 15 / 1.253 };
  const base = { hrv: 50, rhr: 60, hrvBaseline: null };

  it("refuses to score without the HRV baseline, whatever else is present", () => {
    expect(recovery({ ...base, sleepPerf: 0.85 })).toBeNull();
    expect(recovery({ ...base, rhrBaseline: rhrB })).toBeNull();
    expect(recovery({ ...base, resp: 14, respBaseline: respB })).toBeNull();
    expect(recovery({ ...base, recoveryIndexSlope: -1 })).toBeNull();
    expect(recovery({ ...base, effortBaseline: effortB, priorDayEffort: 80 })).toBeNull();
    expect(
      recovery({ ...base, resp: 14, rhrBaseline: rhrB, respBaseline: respB, sleepPerf: 0.85, recoveryIndexSlope: -1, effortBaseline: effortB, priorDayEffort: 80 }),
    ).toBeNull();
  });

  it("preserves cold start and the Swift-oracle score (HRV at its baseline, a typical night: 57.93)", () => {
    const hrvB = { mean: Math.log(50), spread: 0.12 / 1.253 };
    expect(recovery({ hrv: 50, rhr: 60, hrvBaseline: hrvB, sleepPerf: 0.85, hrvBaselineUsable: false })).toBeNull();
    expect(recovery({ hrv: 50, rhr: 60, hrvBaseline: hrvB, sleepPerf: 0.85 })).toBeCloseTo(57.932425214874954, 12);
  });
});

describe("RecoverySaturationGuardTest", () => {
  const undamped = (hrv: number, rhr: number, hrvB: BaselineState, rhrB: BaselineState) => {
    const z = (wHRV * hrvLnZ(hrv, { mean: hrvB.baseline, spread: hrvB.spread }) + wRHR * zScore(rhrB.baseline, rhr, rhrB.spread)) / (wHRV + wRHR);
    return 100 / (1 + Math.exp(-logisticK * (z - logisticZ0)));
  };
  const hrvB = hrvLn(50, 0.125);
  const rhrB = baseline(55, 5.0);
  const score = (hrv: number, rhr: number) => recoveryFromStates({ hrv, rhr, hrvBaseline: hrvB, rhrBaseline: rhrB })!;

  it("fires on the saturation signature and would ease but never remove the penalty", () => {
    const s = parasympatheticSaturation(-1.5, 1.5);
    expect(s.active).toBe(true);
    expect(s.easedHrvZ).toBeGreaterThan(-1.5);
    expect(s.easedHrvZ).toBeLessThan(0);
    expect(s.dampFraction).toBeGreaterThan(0);
    expect(s.dampFraction).toBeLessThanOrEqual(satMaxDampFraction);
  });

  it("is silent on real fatigue, non-low HRV, no RHR signal, and marginal divergence", () => {
    expect(parasympatheticSaturation(-1.5, -1.5)).toEqual({ easedHrvZ: -1.5, active: false, dampFraction: 0 });
    expect(parasympatheticSaturation(1.5, 1.5).active).toBe(false);
    expect(parasympatheticSaturation(0, 1.5).active).toBe(false);
    expect(parasympatheticSaturation(-1.5, null)).toEqual({ easedHrvZ: -1.5, active: false, dampFraction: 0 });
    const below = satEnterZ - 0.05;
    expect(parasympatheticSaturation(-below, below)).toEqual({ easedHrvZ: -below, active: false, dampFraction: 0 });
  });

  it("damping is monotonic in corroboration and capped by the weaker arm", () => {
    const weak = parasympatheticSaturation(-0.8, 0.8).dampFraction;
    const strong = parasympatheticSaturation(-1.4, 1.4).dampFraction;
    expect(strong).toBeGreaterThan(weak);
    expect(parasympatheticSaturation(-3, 3).dampFraction).toBeCloseTo(satMaxDampFraction, 12);
    expect(parasympatheticSaturation(-3, 0.8).dampFraction).toBeLessThan(parasympatheticSaturation(-3, 3).dampFraction);
  });

  it("a firing night still scores the raw composite and stays red", () => {
    const sat = parasympatheticSaturation(hrvLnZ(41, { mean: hrvB.baseline, spread: hrvB.spread }), zScore(rhrB.baseline, 48, rhrB.spread));
    expect(sat.active).toBe(true);
    expect(sat.dampFraction).toBeGreaterThan(0.4);
    expect(score(41, 48)).toBeCloseTo(undamped(41, 48, hrvB, rhrB), 9);
    expect(score(41, 48)).toBeLessThan(bandRedMax);
  });

  it("fatigue and good nights are unchanged too", () => {
    expect(score(41, 62)).toBeLessThan(bandRedMax);
    expect(score(41, 62)).toBeCloseTo(undamped(41, 62, hrvB, rhrB), 9);
    expect(score(62, 49)).toBeCloseTo(undamped(62, 49, hrvB, rhrB), 9);
  });
});

describe("RecoveryRhrBaselineUsableTest", () => {
  const state = (mean: number, sigma: number, status: BaselineStatus, nValid: number): BaselineState => ({
    baseline: mean,
    spread: sigma / 1.253,
    nValid,
    nightsSinceUpdate: status === "stale" ? 20 : 0,
    status,
  });
  const hrvBase = state(Math.log(55), 0.2, "trusted", 20);
  const score = (rhrBaseline: BaselineState | null) =>
    recoveryFromStates({ hrv: 55, rhr: 62, hrvBaseline: hrvBase, rhrBaseline, sleepPerf: 0.85 })!;

  it("synthetic and stale RHR baselines score like an absent one; a usable one contributes", () => {
    expect(score(state(75, 6, "calibrating", 0))).toBeCloseTo(score(null), 12);
    expect(score(state(52, 3, "stale", 20))).toBeCloseTo(score(null), 12);
    expect(Math.abs(score(state(52, 3, "provisional", 5)) - score(null))).toBeGreaterThan(1e-9);
  });
});

describe("RecoveryIndexActivityBalanceTest", () => {
  const args = { hrv: 50, rhr: 55, hrvBaseline: hrvLn(50, 0.12), rhrBaseline: baseline(55, 3), sleepPerf: sleepPerfCenter };

  it("omitted optional terms equal explicit nulls", () => {
    const a = { hrv: 55, rhr: 52, resp: 14, hrvBaseline: hrvLn(50, 0.12), rhrBaseline: baseline(55, 3), respBaseline: baseline(14.5, 1), sleepPerf: 0.9 };
    expect(recoveryFromStates({ ...a, recoveryIndexSlope: null, effortBaseline: null, priorDayEffort: null })).toBe(
      recoveryFromStates(a),
    );
  });

  it("a steeper overnight decline raises Charge more than flat or rising", () => {
    const s = (recoveryIndexSlope: number) => recoveryFromStates({ ...args, recoveryIndexSlope })!;
    expect(s(-4)).toBeGreaterThan(s(-1));
    expect(s(-1)).toBeGreaterThan(s(0));
    expect(s(0)).toBeGreaterThan(s(2));
  });

  it("activity balance: harder yesterday lowers Charge, and needs both value and baseline", () => {
    const s = (priorDayEffort: number | null, effortBaseline: BaselineState | null = baseline(40, 15)) =>
      recoveryFromStates({ hrv: 58, rhr: 50, hrvBaseline: hrvLn(50, 0.12), rhrBaseline: baseline(55, 3), sleepPerf: 0.92, effortBaseline, priorDayEffort })!;
    expect(s(40)).toBeLessThan(s(null));
    expect(s(10)).toBeGreaterThan(s(40));
    expect(s(40)).toBeGreaterThan(s(65));
    expect(s(65)).toBeGreaterThan(s(90));
    const t = (priorDayEffort: number | null, effortBaseline: BaselineState | null) =>
      recoveryFromStates({ ...args, effortBaseline, priorDayEffort })!;
    expect(t(80, null)).toBeCloseTo(t(null, null), 9);
    expect(t(null, baseline(40, 15))).toBeCloseTo(t(null, null), 9);
    expect(t(80, baseline(40, 15))).not.toBeCloseTo(t(null, null), 9);
  });
});

describe("WatchRecoveryTest", () => {
  const hist = Array<number>(14).fill(45);
  const rhrHist = Array<number>(14).fill(52);

  it("at baseline gives mid recovery, solid", () => {
    const out = watchRecovery(45, 52, hist, rhrHist);
    expect(out.recovery).toBeGreaterThanOrEqual(40);
    expect(out.recovery).toBeLessThanOrEqual(60);
    expect(out.confidence).toBe("solid");
  });
  it("high HRV with low RHR is high; low HRV with high RHR is low", () => {
    expect(watchRecovery(70, 46, hist, rhrHist).recovery).toBeGreaterThan(65);
    expect(watchRecovery(22, 62, hist, rhrHist).recovery).toBeLessThan(40);
  });
  it("insufficient history or missing HRV calibrates", () => {
    expect(watchRecovery(45, 52, [45, 46], [52, 51])).toEqual({ recovery: null, confidence: "calibrating" });
    expect(watchRecovery(null, 52, hist, hist)).toEqual({ recovery: null, confidence: "calibrating" });
  });
  it("the week gate counts accepted nights, not raw entries", () => {
    expect(watchRecovery(45, null, [45, 46, 47, 48, -1, 0, 999], []).recovery).toBeNull();
    expect(watchRecovery(45, null, [45, 46, 47, -1, 0, 999, 1000], []).recovery).toBeNull();
    expect(watchRecovery(45, null, [45, 46, 47, 48, 45, 46], []).recovery).toBeNull();
    const ok = watchRecovery(45, null, [45, 46, 47, 48, 45, 46, 47, -1, 999], []);
    expect(ok.recovery).not.toBeNull();
    expect(ok.confidence).not.toBe("calibrating");
  });
  it("an empty or junk RHR history scores like missing RHR (Swift oracle)", () => {
    const h7 = Array<number>(7).fill(45);
    const withRhr = watchRecovery(45, 52, h7, []).recovery!;
    expect(withRhr).toBeCloseTo(watchRecovery(45, null, h7, []).recovery!, 12);
    expect(withRhr).toBeCloseTo(57.932425214874954, 12);
    const junk = Array<number>(7).fill(300);
    expect(watchRecovery(45, 52, h7, junk).recovery!).toBeCloseTo(watchRecovery(45, null, h7, junk).recovery!, 12);
  });
  it("a usable RHR history still contributes", () => {
    const h7 = Array<number>(7).fill(45);
    const rhr4 = Array<number>(4).fill(52);
    expect(watchRecovery(45, 62, h7, rhr4).recovery!).toBeLessThan(watchRecovery(45, null, h7, rhr4).recovery! - 1);
  });
});

describe("plan scenarios", () => {
  it("band boundaries", () => {
    expect(band(66.9)).toBe("yellow");
    expect(band(67)).toBe("green");
    expect(band(33.9)).toBe("red");
    expect(band(34)).toBe("yellow");
  });

  it("an unusable or missing HRV baseline returns null", () => {
    const cold = foldHistory([50, 50, 50].map(lnHrv), recoveryHRVLnCfg);
    expect(recoveryFromStates({ hrv: 50, rhr: 55, hrvBaseline: cold })).toBeNull();
    expect(recovery({ hrv: 50, rhr: 55, hrvBaseline: null })).toBeNull();
  });

  it("fewer than 7 accepted prior nights is null with calibrating; 7 scores", () => {
    expect(minBaselineNights).toBe(7);
    const six = foldHistory(Array(6).fill(Math.log(50)), recoveryHRVLnCfg);
    expect(gatedRecovery({ hrv: 50, rhr: null, hrvBaseline: six })).toEqual({ recovery: null, confidence: "calibrating" });
    const seven = foldHistory(Array(7).fill(Math.log(50)), recoveryHRVLnCfg);
    expect(gatedRecovery({ hrv: 50, rhr: null, hrvBaseline: seven })).toMatchObject({ confidence: "building" });
    expect(gatedRecovery({ hrv: null, rhr: 55, hrvBaseline: seven })).toEqual({ recovery: null, confidence: "calibrating" });
  });

  it("gatedRecovery uses every supplied term", () => {
    const hrvBaseline = hrvLn(50, 0.12);
    const terms = { hrv: 58, rhr: 53, resp: 17, rhrBaseline: baseline(55, 3), respBaseline: baseline(15.5, 1), sleepPerf: 0.8 };
    expect(gatedRecovery({ ...terms, hrvBaseline }).recovery).toBe(recoveryFromStates({ ...terms, hrvBaseline }));
    expect(gatedRecovery({ ...terms, hrvBaseline }).confidence).toBe("solid");
    expect(gatedRecovery({ ...terms, hrvBaseline }).recovery!).toBeLessThan(gatedRecovery({ ...terms, resp: 15, hrvBaseline }).recovery!);
  });
});
