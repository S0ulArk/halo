import { describe, expect, it } from "vitest";
import type { RrBeat } from "@/health/bleHr";
import { protocolById } from "./breath";
import { hrvBeforeAfter, rsaAmplitude, rrIn, spotHrv, SPOT_MIN_BEATS } from "./spotHrv";
import { addToLog, breathRecord, clockDuration, meanHr, parseBreath, parseLog, parseWorkout, pctChange, signedPct, type HrPoint } from "./sessions";

/** Beats from `t0` for `ms`, RR swinging ±`amp` ms around `mean` once every `cycle` ms (a paced breath). */
function beats(t0: number, ms: number, { mean = 1000, amp = 50, cycle = 10_909 } = {}): RrBeat[] {
  const out: RrBeat[] = [];
  let t = t0;
  while (t < t0 + ms) {
    const rr = Math.round(mean + amp * Math.sin((2 * Math.PI * (t - t0)) / cycle));
    t += rr;
    out.push({ t, rr });
  }
  return out;
}

describe("spotHrv (noop SpotHrvReading gates)", () => {
  it("reads a clean minute", () => {
    const r = spotHrv(beats(0, 60_000).map((b) => b.rr));
    expect(r.kind).toBe("reading");
    if (r.kind !== "reading") return;
    expect(r.rmssd).toBeGreaterThan(5);
    expect(r.rmssd).toBeLessThan(40);
    expect(r.hr).toBeCloseTo(60, 0);
    expect(r.beats).toBeGreaterThanOrEqual(55);
  });

  it("refuses too few clean beats", () => {
    expect(spotHrv([1000, 1010, 990, 1005])).toEqual({ kind: "insufficient", clean: 4, needed: SPOT_MIN_BEATS, input: 4 });
    expect(spotHrv([]).kind).toBe("insufficient");
  });

  it("refuses a minute that was mostly noise", () => {
    const clean = beats(0, 30_000).map((b) => b.rr);
    // Every beat followed by an impossible 150 ms one: half the minute thrown away.
    const noisy = clean.flatMap((rr) => [rr, 150]);
    expect(clean.length).toBeGreaterThanOrEqual(SPOT_MIN_BEATS);
    expect(spotHrv(noisy).kind).toBe("insufficient");
  });
});

describe("hrvBeforeAfter", () => {
  const start = 1_000_000;

  it("uses the minute before the tap, then the last minute", () => {
    const pre = beats(start - 60_000, 60_000, { amp: 20 }).map((b) => b.rr);
    const during = beats(start, 180_000, { amp: 60 });
    const r = hrvBeforeAfter(pre, during, start, start + 180_000);
    expect(r.before).not.toBeNull();
    expect(r.after).not.toBeNull();
    expect(r.after!).toBeGreaterThan(r.before!);
  });

  it("falls back to the first minute only when the session is long enough not to overlap", () => {
    const long = beats(start, 180_000);
    expect(hrvBeforeAfter([], long, start, start + 180_000).before).not.toBeNull();
    const short = beats(start, 60_000);
    const r = hrvBeforeAfter([], short, start, start + 60_000);
    expect(r.before).toBeNull();
    expect(r.after).not.toBeNull();
  });

  it("is null without RR (an HR-only band)", () => {
    expect(hrvBeforeAfter([], [], start, start + 300_000)).toEqual({ before: null, after: null });
  });

  it("windows by when each interval ended", () => {
    expect(rrIn([{ t: 5, rr: 900 }, { t: 10, rr: 950 }, { t: 15, rr: 1000 }], 5, 15)).toEqual([900, 950]);
  });
});

describe("rsaAmplitude (ResonanceEngine.scorePace)", () => {
  const start = 2_000_000;
  const cycle = 10_909;

  it("measures the heart-rate swing per paced breath", () => {
    const r = rsaAmplitude(beats(start, 300_000, { amp: 50, cycle }), start, start + 300_000, cycle);
    // RR 950–1050 ms is 57.1–63.2 bpm: a swing of about 6 bpm (beats sample the wave, so a little under).
    expect(r.rsa).not.toBeNull();
    expect(r.rsa!).toBeGreaterThan(4.5);
    expect(r.rsa!).toBeLessThan(6.5);
    expect(r.cycles).toBeGreaterThanOrEqual(20);
  });

  it("is larger for a bigger swing and flat for none", () => {
    const big = rsaAmplitude(beats(start, 180_000, { amp: 80, cycle }), start, start + 180_000, cycle).rsa!;
    const small = rsaAmplitude(beats(start, 180_000, { amp: 20, cycle }), start, start + 180_000, cycle).rsa!;
    expect(big).toBeGreaterThan(small);
    expect(rsaAmplitude(beats(start, 180_000, { amp: 0, cycle }), start, start + 180_000, cycle).rsa).toBe(0);
  });

  it("leaves a session with too few breaths or beats unscored", () => {
    expect(rsaAmplitude(beats(start, 25_000, { cycle }), start, start + 25_000, cycle).rsa).toBeNull();
    expect(rsaAmplitude([], start, start + 300_000, cycle)).toEqual({ rsa: null, cycles: 0, beats: 0 });
  });
});

describe("breathRecord", () => {
  const p = protocolById("resonance")!;
  const start = 3_000_000;
  const hr: HrPoint[] = Array.from({ length: 180 }, (_, i) => ({ t: start + i * 1000, bpm: i < 30 ? 72 : i > 150 ? 64 : 68 }));

  it("sums up HR start and end, and HRV when RR came", () => {
    const r = breathRecord({ protocol: p, start, end: start + 180_000, plannedMs: 174_544, hr, beats: beats(start, 180_000), preRr: [] });
    expect(r).toMatchObject({ at: start, protocol: "resonance", ms: 180_000, completed: true, hrStart: 72, hrEnd: 64 });
    expect(r.hrvBefore).not.toBeNull();
    expect(r.hrvAfter).not.toBeNull();
    expect(r.rsa).not.toBeNull();
  });

  it("works on HR alone and marks an early stop", () => {
    const r = breathRecord({ protocol: p, start, end: start + 40_000, plannedMs: 174_544, hr, beats: [], preRr: [] });
    expect(r).toMatchObject({ completed: false, hrStart: 72, hrvBefore: null, hrvAfter: null, rsa: null });
  });

  it("is all nulls without a band", () => {
    const r = breathRecord({ protocol: p, start, end: start + 60_000, plannedMs: 60_000, hr: [], beats: [], preRr: [] });
    expect(r).toMatchObject({ hrStart: null, hrEnd: null, hrvBefore: null, hrvAfter: null, rsa: null, completed: true });
  });
});

describe("helpers", () => {
  it("meanHr skips zeros and empty windows", () => {
    expect(meanHr([{ t: 0, bpm: 60 }, { t: 1, bpm: 0 }, { t: 2, bpm: 70 }], 0, 3)).toBe(65);
    expect(meanHr([], 0, 10)).toBeNull();
  });

  it("formats changes and durations", () => {
    expect(pctChange(40, 50)).toBe(25);
    expect(pctChange(null, 50)).toBeNull();
    expect(signedPct(25)).toBe("+25%");
    expect(signedPct(-8)).toBe("−8%");
    expect(signedPct(0)).toBe("±0%");
    expect(clockDuration(65_400)).toBe("1:05");
    expect(clockDuration(3_725_000)).toBe("1:02:05");
  });

  it("keeps the log newest first, unique and capped", () => {
    const log = [{ at: 3 }, { at: 1 }];
    expect(addToLog(log, { at: 2 })).toEqual([{ at: 3 }, { at: 2 }, { at: 1 }]);
    expect(addToLog(log, { at: 3 })).toHaveLength(2);
    expect(addToLog(log, { at: 4 }, 2)).toEqual([{ at: 4 }, { at: 3 }]);
  });

  it("reads a stored log back, dropping what doesn't parse", () => {
    const json = JSON.stringify([
      { at: 1, ms: 60_000, protocol: "box", plannedMs: 64_000, completed: true, hrStart: 70, hrEnd: 65, hrvBefore: null, hrvAfter: 40, rsa: null },
      { at: "x" },
      null,
    ]);
    expect(parseLog(json, parseBreath)).toEqual([
      { at: 1, ms: 60_000, protocol: "box", plannedMs: 64_000, completed: true, hrStart: 70, hrEnd: 65, hrvBefore: null, hrvAfter: 40, rsa: null },
    ]);
    expect(parseLog("{oops", parseBreath)).toEqual([]);
    expect(parseLog(null, parseWorkout)).toEqual([]);
    expect(parseWorkout({ at: 1, ms: 2, strain: 3, zoneSeconds: [1, 2], target: [10, 14] })).toMatchObject({ zoneSeconds: [0, 0, 0, 0, 0, 0], target: [10, 14], dayEnd: 3 });
  });
});
