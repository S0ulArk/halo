// Fixtures mirror noop's LiveSessionEngineTest.kt (the same band vectors and guardian scenarios).
import { describe, expect, it } from "vitest";
import { band, guidance, LiveCoach, MIN_FLOOR_PCT_HRR, type CoachConfig, type CoachOutput } from "./coach";

const cfg = (recovery: number | null): CoachConfig => ({ restingHr: 55, maxHr: 190, recovery }); // reserve 135

/** A constant bpm at 1 Hz for `seconds` updates from `from`. */
const feed = (e: LiveCoach, bpm: number | null, from: number, seconds: number): CoachOutput[] => Array.from({ length: seconds }, (_, i) => e.update(from + i, bpm));

describe("band (golden vectors)", () => {
  it("scales the ceiling with Recovery", () => {
    const low = band(cfg(10));
    expect(low.ceilingPctHRR).toBeCloseTo(0.622, 3);
    expect(low.floorPctHRR).toBeCloseTo(0.472, 3);
    const mid = band(cfg(41));
    expect(mid.ceilingPctHRR).toBeCloseTo(0.6902, 3);
    expect(mid.floorPctHRR).toBeCloseTo(0.5402, 3);
    expect(mid.ceilingBpm).toBeCloseTo(148.18, 1);
    expect(mid.floorBpm).toBeCloseTo(127.93, 1);
    const high = band(cfg(90));
    expect(high.ceilingPctHRR).toBeCloseTo(0.798, 3);
    expect(high.floorPctHRR).toBeCloseTo(0.648, 3);
    expect(high.ceilingBpm).toBeGreaterThan(mid.ceilingBpm);
    expect(mid.ceilingBpm).toBeGreaterThan(low.ceilingBpm);
  });

  it("takes the midpoint without a Recovery and keeps the floor up at 0", () => {
    expect(band(cfg(null)).ceilingPctHRR).toBeCloseTo(0.71, 3);
    expect(band(cfg(null)).floorPctHRR).toBeCloseTo(0.56, 3);
    const zero = band(cfg(0));
    expect(zero.ceilingPctHRR).toBeCloseTo(0.6, 4);
    expect(zero.floorPctHRR).toBeCloseTo(0.45, 4);
    expect(zero.floorPctHRR).toBeGreaterThanOrEqual(MIN_FLOOR_PCT_HRR);
  });
});

describe("LiveCoach (guardian behaviour)", () => {
  it("never buzzes during the warm-up", () => {
    const warm = feed(new LiveCoach(cfg(null), 1000), 110, 1000, 60);
    expect(warm.every((o) => o.cue === null && o.status === "warmup")).toBe(true);
  });

  it("is silent while in the band, and counts the time", () => {
    const outs = feed(new LiveCoach(cfg(null), 0), 140, 0, 120);
    expect(outs.every((o) => o.cue === null)).toBe(true);
    expect(outs.slice(-30).every((o) => o.position === "inBand")).toBe(true);
    expect(outs.at(-1)!.inBandSeconds).toBeGreaterThan(100);
  });

  it("pushes once when too easy, then cools down", () => {
    const outs = feed(new LiveCoach(cfg(null), 1000), 110, 1000, 90);
    const cues = outs.flatMap((o, i) => (o.cue ? [[i, o.cue]] : []));
    expect(cues).toEqual([[60, "push"]]);
  });

  it("eases off after a sharp climb over the ceiling", () => {
    const e = new LiveCoach(cfg(null), 1000);
    feed(e, 140, 1000, 70);
    const hot = feed(e, 178, 1070, 60);
    expect(hot.some((o) => o.cue === "easeOff")).toBe(true);
    expect(hot.some((o) => o.cue === "push")).toBe(false);
  });

  it("stays quiet on a slow drift over the ceiling", () => {
    const e = new LiveCoach(cfg(null), 1000);
    feed(e, 140, 1000, 70);
    const outs = Array.from({ length: 120 }, (_, i) => e.update(1070 + i, 145 + Math.trunc(i * (25 / 120))));
    expect(outs.some((o) => o.cue === "easeOff")).toBe(false);
  });

  it("is silent coming back into the band", () => {
    const e = new LiveCoach(cfg(null), 1000);
    feed(e, 110, 1000, 90);
    const back = feed(e, 140, 1090, 40);
    expect(back.every((o) => o.cue === null)).toBe(true);
    expect(back.slice(-20).every((o) => o.position === "inBand")).toBe(true);
  });

  it("rejects an impossible sample", () => {
    const e = new LiveCoach(cfg(null), 0);
    feed(e, 140, 0, 20);
    const out = e.update(20, 250);
    expect(out.sampleArrived).toBe(false);
    expect(out.smoothedBpm).toBeCloseTo(140, 0);
  });

  it("goes stale and pauses coaching when the stream drops", () => {
    const e = new LiveCoach(cfg(null), 0);
    feed(e, 110, 0, 20);
    const out = e.update(40, null);
    expect(out).toMatchObject({ status: "stale", smoothedBpm: null, cue: null });
  });

  it("accepts a hard effort a little over an estimated max (Pulse's wider cut-off)", () => {
    const e = new LiveCoach(cfg(null), 0);
    feed(e, 185, 0, 10);
    expect(e.update(10, 200).sampleArrived).toBe(true);
  });
});

describe("guidance", () => {
  const b = band(cfg(60));
  const coach = (position: CoachOutput["position"], status: CoachOutput["status"] = "active") => ({ status, position, band: b });
  const target: [number, number] = [10, 14];

  it("eases off past the target whatever the heart rate", () => {
    expect(guidance({ strain: 14.2, target, coach: coach("below"), minutesToLow: null })).toMatchObject({ tone: "ease", title: "Ease off" });
    expect(guidance({ strain: 15, target, coach: coach("inBand", "stale"), minutesToLow: null }).tone).toBe("ease");
  });

  it("waits while warming up or stale", () => {
    expect(guidance({ strain: 3, target, coach: coach("below", "warmup"), minutesToLow: 20 })).toMatchObject({ tone: "wait", title: "Warming up" });
    expect(guidance({ strain: 3, target, coach: coach("below", "stale"), minutesToLow: 20 }).title).toBe("Waiting for heart rate");
  });

  it("holds or eases inside the range", () => {
    expect(guidance({ strain: 11, target, coach: coach("inBand"), minutesToLow: 0 })).toMatchObject({ tone: "steady", title: "In your target range" });
    expect(guidance({ strain: 11, target, coach: coach("above"), minutesToLow: 0 })).toMatchObject({ tone: "ease", title: "In range: ease off" });
  });

  it("pushes below the range and the band, says how long at this effort otherwise", () => {
    const push = guidance({ strain: 6.4, target, coach: coach("below"), minutesToLow: null });
    expect(push).toMatchObject({ tone: "push", title: "Push" });
    expect(push.body).toContain(`above ${Math.round(b.floorBpm)} bpm`);
    expect(push.body).toContain("3.6 below");
    const on = guidance({ strain: 6.4, target, coach: coach("inBand"), minutesToLow: 18.4 });
    expect(on).toMatchObject({ tone: "steady", title: "On track" });
    expect(on.body).toContain("about 18 minutes at this effort reaches 10.0");
    expect(guidance({ strain: 6.4, target, coach: coach("above"), minutesToLow: 1 }).body).toContain("about a minute");
  });

  it("uses the band alone without a target", () => {
    expect(guidance({ strain: 6, target: null, coach: coach("below"), minutesToLow: null }).body).not.toContain("target");
    expect(guidance({ strain: 25, target: null, coach: coach("inBand"), minutesToLow: null }).title).toBe("On track");
  });
});
