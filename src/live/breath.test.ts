import { describe, expect, it } from "vitest";
import {
  breathsPerMinute,
  cycleMs,
  DURATIONS,
  levelAt,
  pacedStages,
  phaseAt,
  planSession,
  protocolById,
  PROTOCOLS,
  scheduleCues,
  secondsLeft,
  stageLabel,
  type BreathStage,
} from "./breath";

const offsets = (stages: BreathStage[], ms: number) => scheduleCues(stages, ms).map((c) => [c.offsetMs, c.phase, c.loops]);

describe("pacedStages (noop BreathPacer golden vectors)", () => {
  it("A: 6 br/min, 0.4 inhale, 2 cycles", () => {
    const s = pacedStages(6, 0.4);
    expect(s.map((x) => x.ms)).toEqual([4000, 6000]);
    expect(offsets(s, 2 * cycleMs(s))).toEqual([
      [0, "inhale", 1],
      [4000, "exhale", 2],
      [10000, "inhale", 1],
      [14000, "exhale", 2],
    ]);
  });

  it("B: 5.5 br/min, default inhale, 3 cycles", () => {
    const s = pacedStages(5.5);
    expect(cycleMs(s)).toBe(10909);
    expect(scheduleCues(s, 3 * cycleMs(s)).map((c) => c.offsetMs)).toEqual([0, 4364, 10909, 15273, 21818, 26182]);
  });

  it("clamps the pace and the split instead of trapping", () => {
    // 0.5 br/min clamps to 3 (20 s); a fraction of −1 clamps to 0.1.
    expect(pacedStages(0.5, -1).map((x) => x.ms)).toEqual([2000, 18000]);
    // 99 br/min clamps to 12 (5 s); 5 clamps to 0.9.
    expect(pacedStages(99, 5).map((x) => x.ms)).toEqual([4500, 500]);
  });

  it("inhale cues are one pulse, exhale two, holds none", () => {
    for (const p of PROTOCOLS)
      for (const c of scheduleCues(p.stages, 60_000)) expect(c.loops).toBe(c.phase === "inhale" ? 1 : c.phase === "exhale" ? 2 : 0);
  });
});

describe("catalog", () => {
  it("has the four protocols with their timings", () => {
    expect(PROTOCOLS.map((p) => p.id)).toEqual(["resonance", "box", "478", "sigh"]);
    expect(breathsPerMinute(protocolById("resonance")!.stages)).toBeCloseTo(5.5, 2);
    expect(protocolById("box")!.stages.map((s) => s.ms)).toEqual([4000, 4000, 4000, 4000]);
    expect(protocolById("478")!.stages.map((s) => [s.phase, s.ms])).toEqual([
      ["inhale", 4000],
      ["hold", 7000],
      ["exhale", 8000],
    ]);
    const sigh = protocolById("sigh")!.stages;
    expect(sigh.map((s) => s.phase)).toEqual(["inhale", "inhale", "exhale"]);
    expect(stageLabel(sigh[1])).toBe("Top up");
    expect(stageLabel(protocolById("box")!.stages[1])).toBe("Hold");
  });

  it("resonance splits the breath evenly", () => {
    const [i, e] = protocolById("resonance")!.stages;
    expect(Math.abs(i.ms - e.ms)).toBeLessThanOrEqual(1);
  });
});

describe("planSession", () => {
  it("rounds to whole breaths, at least one", () => {
    const box = protocolById("box")!.stages;
    expect(planSession(box, 1)).toEqual({ cycles: 4, durationMs: 64_000 });
    expect(planSession(protocolById("478")!.stages, 1)).toEqual({ cycles: 3, durationMs: 57_000 });
    expect(planSession(protocolById("sigh")!.stages, 5)).toEqual({ cycles: 30, durationMs: 300_000 });
    expect(planSession(box, 0)).toEqual({ cycles: 1, durationMs: 16_000 });
    expect(DURATIONS).toEqual([1, 3, 5]);
  });

  it("schedules exactly the planned breaths", () => {
    const p = protocolById("478")!;
    const plan = planSession(p.stages, 3);
    const cues = scheduleCues(p.stages, plan.durationMs);
    expect(cues).toHaveLength(plan.cycles * 3);
    expect(cues.at(-1)).toMatchObject({ phase: "exhale", offsetMs: plan.durationMs - 8000 });
  });

  it("cuts a session that ends mid-breath (BreathProtocolPlayer)", () => {
    expect(scheduleCues(protocolById("478")!.stages, 12_000).map((c) => c.offsetMs)).toEqual([0, 4000, 11000]);
    expect(scheduleCues(protocolById("box")!.stages, 0)).toEqual([]);
  });
});

describe("phaseAt", () => {
  const box = protocolById("box")!.stages;

  it("finds the stage and its bounds", () => {
    expect(phaseAt(box, 0)).toEqual({ stage: 0, cycle: 0, start: 0, end: 4000 });
    expect(phaseAt(box, 4000)).toEqual({ stage: 1, cycle: 0, start: 4000, end: 8000 });
    expect(phaseAt(box, 15_999)).toEqual({ stage: 3, cycle: 0, start: 12_000, end: 16_000 });
    expect(phaseAt(box, 16_000)).toEqual({ stage: 0, cycle: 1, start: 16_000, end: 20_000 });
    expect(phaseAt(box, -50).stage).toBe(0);
  });

  it("counts the seconds left down to 1", () => {
    expect(secondsLeft(phaseAt(box, 0), 0)).toBe(4);
    expect(secondsLeft(phaseAt(box, 3100), 3100)).toBe(1);
    expect(secondsLeft(phaseAt(box, 3999), 3999)).toBe(1);
  });
});

describe("levelAt", () => {
  const box = protocolById("box")!.stages;
  const ms = box.map((s) => s.ms);
  const lv = box.map((s) => s.level);

  it("fills on the inhale, holds, empties on the exhale", () => {
    expect(levelAt(ms, lv, 0, false)).toBeCloseTo(0);
    expect(levelAt(ms, lv, 2000, false)).toBeCloseTo(0.5);
    expect(levelAt(ms, lv, 4000, false)).toBeCloseTo(1);
    expect(levelAt(ms, lv, 6000, false)).toBeCloseTo(1);
    expect(levelAt(ms, lv, 10_000, false)).toBeCloseTo(0.5);
    expect(levelAt(ms, lv, 14_000, false)).toBeCloseTo(0);
    // The next breath picks up where the last ended.
    expect(levelAt(ms, lv, 18_000, false)).toBeCloseTo(0.5);
  });

  it("eases (slow at the turns) and steps under reduce motion", () => {
    expect(levelAt(ms, lv, 400, false)).toBeLessThan(0.1);
    expect(levelAt(ms, lv, 400, true)).toBe(1);
    expect(levelAt(ms, lv, 8100, true)).toBe(0);
  });

  it("is continuous across the sigh's two inhales", () => {
    const sigh = protocolById("sigh")!.stages;
    const m = sigh.map((s) => s.ms);
    const l = sigh.map((s) => s.level);
    expect(levelAt(m, l, 2999, false)).toBeCloseTo(0.78, 2);
    expect(levelAt(m, l, 3000, false)).toBeCloseTo(0.78, 5);
    expect(levelAt(m, l, 4000, false)).toBeCloseTo(1, 5);
  });
});
