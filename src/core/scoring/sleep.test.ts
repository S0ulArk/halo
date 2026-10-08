import { describe, expect, it } from "vitest";
import {
  creditedSleepMin,
  debtSeries,
  defaultSleepNeedHours,
  hypnogramMetrics,
  ledger,
  maxNeedHours,
  personalizedNeedHours,
  round1,
  sleepConsistency,
  sleepPerformance,
  sleepPerformanceParts,
  sleepPerformanceWeights,
} from "./sleep";

const EPS = 9;

describe("hypnogramMetrics", () => {
  it("AASM aggregates; an 'awake' segment counts as WASO", () => {
    const m = hypnogramMetrics({
      start: 0,
      end: 1200,
      stages: [
        { start: 900, end: 960, stage: "awake" },
        { start: 0, end: 60, stage: "wake" },
        { start: 60, end: 600, stage: "light" },
        { start: 600, end: 900, stage: "deep" },
        { start: 960, end: 1200, stage: "rem" },
      ],
    });
    expect(m).toMatchObject({ tibS: 1200, tstS: 1080, sptS: 1140, solS: 60, remLatencyS: 900, wasoS: 60, disturbances: 1 });
    expect(m.efficiency).toBeCloseTo(0.9, 12);
    expect([m.deepMin, m.remMin, m.lightMin]).toEqual([5, 4, 9]);
    expect(m.deepPct).toBeCloseTo((300 / 1080) * 100, 12);
    expect(m.lightPct).toBeCloseTo(50, 12);
  });

  it("a night with no sleep stages", () => {
    const m = hypnogramMetrics({ start: 0, end: 600, stages: [{ start: 0, end: 600, stage: "wake" }] });
    expect(m).toMatchObject({ tstS: 0, solS: 600, sptS: 0, remLatencyS: null, wasoS: 0, efficiency: 0, deepPct: 0 });
  });
});

describe("Sleep Performance: WHOOP's 2025 four parts", () => {
  const night = (over: Partial<Parameters<typeof sleepPerformance>[0]> = {}) => ({
    asleepMin: 480,
    needMin: 480,
    efficiency: 0.92,
    consistency: 80,
    stressPct: 10,
    ...over,
  });

  it("weighs hours vs needed 0.70, consistency, efficiency and sleep stress 0.10 each", () => {
    expect(sleepPerformanceWeights).toEqual({ hours: 0.7, consistency: 0.1, efficiency: 0.1, stress: 0.1 });
    expect(defaultSleepNeedHours).toBe(8);
  });

  it("8 h against an 8 h need, 92 % efficiency, consistency 80, sleep stress 10 % → 0.7·100 + 8 + 9.68 + 9 = 96.68", () => {
    expect(sleepPerformance(night())).toBeCloseTo(96.68, EPS);
  });

  it("6 h against 8 h is 75 % of the hours part", () => {
    expect(sleepPerformanceParts(night({ asleepMin: 360 })).hours).toBe(75);
    expect(sleepPerformance(night({ asleepMin: 360 }))).toBeCloseTo(0.7 * 75 + 8 + 9.68 + 9, EPS);
  });

  it("scores against the night's full need: a bigger need lowers it, oversleeping clamps at 100", () => {
    expect(sleepPerformance(night({ needMin: 540 }))!).toBeLessThan(sleepPerformance(night())!);
    expect(sleepPerformanceParts(night({ asleepMin: 600 })).hours).toBe(100);
    expect(sleepPerformanceParts(night({ efficiency: 0.97 })).efficiency).toBe(100);
  });

  it("without sleep stress (or consistency) the other weights renormalise", () => {
    const eff = (0.1 * 92) / 0.95;
    expect(sleepPerformance(night({ stressPct: null }))).toBeCloseTo((70 + 8 + eff) / 0.9, 2);
    expect(sleepPerformance(night({ stressPct: null, consistency: null }))).toBeCloseTo((70 + eff) / 0.8, 2);
  });

  it("is null without asleep time", () => {
    expect(sleepPerformance(night({ asleepMin: 0 }))).toBeNull();
  });
});

describe("RestNeedTest", () => {
  it("a chronic under-sleeper stays at the floor", () => {
    expect(personalizedNeedHours(Array(14).fill(5.5), 30)).toBeGreaterThanOrEqual(7);
  });
  it("a normal sleeper reflects unrestricted nights", () => {
    const need = personalizedNeedHours([7.2, 7.8, 8.1, 7.5, 8.4, 7.9, 8.0, 7.6, 8.2, 7.7], 35);
    expect(need).toBeGreaterThanOrEqual(7.8);
    expect(need).toBeLessThanOrEqual(9.5);
  });
  it("cold start returns the population default", () => {
    expect(personalizedNeedHours([7, 8, 6.5], 30)).toBeCloseTo(defaultSleepNeedHours, 3);
  });
  it("caps a long sleeper; minors get a higher floor; null age uses the adult floor", () => {
    expect(personalizedNeedHours(Array(10).fill(11), 40)).toBeLessThanOrEqual(9.5);
    expect(personalizedNeedHours(Array(10).fill(6), 15)).toBeGreaterThanOrEqual(8);
    expect(personalizedNeedHours(Array(10).fill(5), null)).toBeGreaterThanOrEqual(7);
  });
  it("zero and negative nights are ignored", () => {
    expect(personalizedNeedHours([0, -1, 7.5, 8, 7.8, 8.2, 7.6, 8.1, 7.9, 8.3, 0], 30)).toBeGreaterThanOrEqual(7.5);
  });
});

describe("plan scenarios: need", () => {
  it("under 7 nights is 8 h; the clamp holds at 8–9.5 h", () => {
    expect(personalizedNeedHours([9.5, 9.5, 9.5, 9.5, 9.5, 9.5], 30)).toBe(8);
    expect(personalizedNeedHours(Array(7).fill(6), 30)).toBe(8);
    expect(personalizedNeedHours(Array(7).fill(12), 30)).toBe(maxNeedHours);
    // 75th percentile of 7..13 (step 1) is 11.5 → capped
    expect(personalizedNeedHours([7, 8, 9, 10, 11, 12, 13], 30)).toBe(9.5);
    // 75th percentile of 8.0..8.6 (step 0.1) is 8.45
    expect(personalizedNeedHours([8.0, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6], 30)).toBeCloseTo(8.45, 12);
  });
});

describe("SleepDebtTest", () => {
  it("on target nets to zero", () => {
    const l = ledger([["2026-06-01", 480], ["2026-06-02", 480], ["2026-06-03", 480]], 8);
    expect(l).toMatchObject({ nightCount: 3, isDebt: false, needMin: 480 });
    expect(l.balanceMin).toBeCloseTo(0, EPS);
  });

  it("debt carries at 55% and a surplus does not bank", () => {
    const l = ledger([["2026-06-01", 360], ["2026-06-02", 540], ["2026-06-03", 420]], 8);
    expect(l.balanceMin).toBeCloseTo(-33, EPS);
    expect(l.isDebt).toBe(true);
    expect(l.magnitudeMin).toBeCloseTo(33, EPS);
    expect(l.nights.map((n) => n.deltaMin)).toEqual([-120, 60, -60]);
  });

  it("skips no-data nights", () => {
    const l = ledger([["2026-06-01", 480], ["2026-06-02", null], ["2026-06-03", 0], ["2026-06-04", 420]], 8);
    expect(l.nightCount).toBe(2);
    expect(l.balanceMin).toBeCloseTo(-33, EPS);
    expect(l.nights.map((n) => n.day)).toEqual(["2026-06-01", "2026-06-04"]);
  });

  it("the window cap keeps the most recent 14", () => {
    const series = Array.from({ length: 16 }, (_, i) => [`2026-06-${String(i + 1).padStart(2, "0")}`, 420] as [string, number]);
    const l = ledger(series, 8, 14);
    expect(l.nightCount).toBe(14);
    expect(l.balanceMin).toBeCloseTo(-73.3, EPS);
    expect(l.nights[0].day).toBe("2026-06-03");
    expect(l.nights.at(-1)!.day).toBe("2026-06-16");
  });

  it("empty ledger and default 8 h need", () => {
    expect(ledger([])).toMatchObject({ nightCount: 0, nights: [] });
    expect(ledger([]).balanceMin).toBeCloseTo(0, EPS);
    expect(ledger([["2026-06-01", null]]).nightCount).toBe(0);
    const l = ledger([["2026-06-01", 420]]);
    expect(l.needMin).toBe(defaultSleepNeedHours * 60);
    expect(l.balanceMin).toBeCloseTo(-33, EPS);
  });

  it("nap minutes add repayment credit", () => {
    const credited = creditedSleepMin(392, 48)!;
    expect(credited).toBe(440);
    expect(ledger([["2026-06-01", credited]], 8).balanceMin).toBeCloseTo(-22, EPS);
    expect(creditedSleepMin(null, 48)).toBeNull();
    expect(creditedSleepMin(0, 48)).toBeNull();
    expect(creditedSleepMin(392, -10)).toBe(392);
  });

  it("debt under ten minutes clears; exactly ten remains", () => {
    expect(ledger([["2026-06-01", 480 - 9.9 / 0.55]], 8).balanceMin).toBeCloseTo(0, EPS);
    expect(ledger([["2026-06-01", 480 - 10 / 0.55]], 8).balanceMin).toBeCloseTo(-10, EPS);
  });

  it("meeting need including the current debt clears it", () => {
    const l = ledger([["2026-06-01", 360], ["2026-06-02", 546]], 8);
    expect(l.balanceMin).toBeCloseTo(0, EPS);
    expect(l.isDebt).toBe(false);
  });

  it("imported debt is verbatim but does not seed the local fallback", () => {
    const values = debtSeries([["2026-06-01", 420], ["2026-06-02", 480]], 8, new Map([["2026-06-01", 61.25]]));
    expect(values[0][1]).toBe(61.25);
    expect(round1(values[1][1])).toBeCloseTo(18.2, EPS);
  });

  it("debtSeries rounds like the ledger", () => {
    const series: [string, number][] = [["2026-06-01", 420], ["2026-06-02", 410]];
    expect(debtSeries(series, 8).at(-1)![1]).toBeCloseTo(56.7, EPS);
    expect(debtSeries(series, 8).at(-1)![1]).toBe(ledger(series, 8).magnitudeMin);
  });

  it("an imported-only gap does not consume one of the 14 usable nights", () => {
    const usable = Array.from({ length: 14 }, (_, i) => [`2026-06-${String(i + 1).padStart(2, "0")}`, 420] as [string, number | null]);
    const series = [...usable.slice(0, 13), ["2026-06-14-imported-only", null] as [string, number | null], ...usable.slice(13)];
    const values = debtSeries(series, 8, new Map([["2026-06-14-imported-only", 91.25]]));
    expect(values).toHaveLength(15);
    expect(values[13][1]).toBe(91.25);
    expect(values.at(-1)![1]).toBeCloseTo(ledger(usable, 8, 14).magnitudeMin, EPS);
  });

  it("debtSeries recomputes each day from its trailing usable window", () => {
    const series = Array.from({ length: 16 }, (_, i) => [`2026-06-${String(i + 1).padStart(2, "0")}`, 391 + i] as [string, number]);
    const values = debtSeries(series, 8, new Map(), 14);
    expect(values).toHaveLength(16);
    values.forEach(([day, debt], i) => {
      expect(day).toBe(series[i][0]);
      expect(debt).toBeCloseTo(ledger(series.slice(0, i + 1), 8, 14).magnitudeMin, EPS);
    });
  });

  it("round1 rounds half-ties away from zero", () => {
    expect(round1(-0.05)).toBeCloseTo(-0.1, EPS);
    expect(round1(0.05)).toBeCloseTo(0.1, EPS);
    expect(round1(-0.04)).toBeCloseTo(0, EPS);
    expect(round1(-0.25)).toBeCloseTo(-0.3, EPS);
  });
});

describe("sleepConsistency (1 − CV)", () => {
  it("is 1 − population CV of nightly hours, clamped, null under 3 nights", () => {
    const sd = Math.sqrt(2 / 3);
    expect(sleepConsistency([7, 8, 9])).toBeCloseTo(1 - sd / 8, 12);
    expect(sleepConsistency([8, 8, 8])).toBe(1);
    expect(sleepConsistency([8, 0, 8])).toBeNull();
    expect(sleepConsistency([1, 1, 20])).toBe(0);
  });
});
