import { describe, expect, it } from "vitest";
import { banisterRate, effortOfTrimp, strain as strainOf, toStrainScale } from "@/core/scoring/strain";
import { effortToTrimp, LiveStrain, strainOfTrimp, targetCrossing, trimpForStrain } from "./liveStrain";
import { workoutSetup } from "./workoutSetup";
import type { DayRow } from "@/queries/common";

const REST = 60;
const MAX = 190; // reserve 130: zone edges 112 / 138 / 151 / 164 / 177
/** Banister TRIMP a minute at `bpm`. */
const rateAt = (bpm: number) => banisterRate((bpm - REST) / (MAX - REST));

/** Feeds `bpm` once a second for `seconds`, from `t0` (ms); returns the next free time. */
function feed(s: LiveStrain, bpm: number, t0: number, seconds: number): number {
  for (let i = 0; i < seconds; i++) s.add(t0 + i * 1000, bpm);
  return t0 + seconds * 1000;
}

describe("effort ↔ TRIMP", () => {
  it("inverts the stored log map: effort → TRIMP → effort is the identity", () => {
    for (const trimp of [0.5, 12, 150, 600]) {
      const effort = effortOfTrimp(trimp);
      expect(effortOfTrimp(effortToTrimp(effort))).toBe(effort);
      // Within the stored Effort's 2 dp.
      expect(Math.abs(effortToTrimp(effort) - trimp) / trimp).toBeLessThan(2e-3);
    }
    expect(effortToTrimp(null)).toBe(0);
    expect(effortToTrimp(0)).toBe(0);
    expect(strainOfTrimp(trimpForStrain(12))).toBeCloseTo(12, 1);
  });
});

describe("LiveStrain", () => {
  it("matches the app's Strain on the same readings", () => {
    // 20 minutes at 1 Hz: 5 in Zone 1, 10 in Zone 3, 5 in Zone 5.
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, baseEffort: null });
    let t = feed(s, 130, 0, 300);
    t = feed(s, 155, t, 600);
    feed(s, 180, t, 300);
    const hr = Array.from({ length: 1200 }, (_, i) => ({ ts: i, bpm: i < 300 ? 130 : i < 900 ? 155 : 180 }));
    // The stored math credits the last reading with the gap before it; live waits for the next. One second apart.
    expect(s.sessionStrain).toBeCloseTo(toStrainScale(strainOf(hr, MAX, REST)!), 1);
    expect(s.trimp).toBeCloseTo((300 * rateAt(130) + 600 * rateAt(155) + 299 * rateAt(180)) / 60, 6);
    expect(s.zoneSeconds.map(Math.round)).toEqual([0, 300, 0, 600, 0, 299]);
    expect(s.avgHr).toBe(155);
    expect(s.maxBpm).toBe(180);
  });

  it("weights by the profile's sex, as the stored Strain does", () => {
    const m = new LiveStrain({ restingHr: REST, maxHr: MAX, baseEffort: null });
    const f = new LiveStrain({ restingHr: REST, maxHr: MAX, baseEffort: null, sex: "female" });
    feed(m, 155, 0, 600);
    feed(f, 155, 0, 600);
    expect(f.trimp).toBeCloseTo((599 * banisterRate((155 - REST) / (MAX - REST), "female")) / 60, 6);
    expect(f.trimp).not.toBeCloseTo(m.trimp, 3);
  });

  it("carries on from the day's stored Effort", () => {
    const base = effortOfTrimp(200); // a day already at about 15
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, baseEffort: base });
    expect(s.dayStartStrain).toBeCloseTo(toStrainScale(base), 2);
    feed(s, 160, 0, 1201);
    expect(s.dayStrain).toBeCloseTo(strainOfTrimp(200 + 20 * rateAt(160)), 2);
    expect(s.dayStrain).toBeGreaterThan(s.dayStartStrain);
    // A day already loaded moves less for the same workout than a fresh one.
    const fresh = new LiveStrain({ restingHr: REST, maxHr: MAX, baseEffort: null });
    feed(fresh, 160, 0, 1201);
    expect(s.dayStrain - s.dayStartStrain).toBeLessThan(fresh.dayStrain);
  });

  it("credits at most 2 minutes across a gap", () => {
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, baseEffort: null });
    s.add(0, 170);
    s.add(10 * 60_000, 170);
    expect(s.trimp).toBeCloseTo(rateAt(170) * 2, 6);
  });

  it("rejects impossible readings and jumps", () => {
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, baseEffort: null });
    expect(s.add(0, 20)).toBe(false);
    expect(s.add(0, 100)).toBe(true);
    expect(s.add(1000, 160)).toBe(false); // +60 in a second
    expect(s.add(1000, 100)).toBe(true);
    expect(s.add(1000, 101)).toBe(false); // not after the last
    expect(s.add(30_000, 160)).toBe(true); // a big change is fine once enough time has passed
  });

  it("knows the zone and estimates minutes to a target from the recent rate", () => {
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, baseEffort: null });
    expect(s.zoneOf(111)).toBe(0);
    expect(s.zoneOf(112)).toBe(1); // Zone 1 from 40 % of the reserve
    expect(s.zoneOf(140)).toBe(2);
    expect(s.zoneOf(190)).toBe(5);
    expect(s.minutesTo(5, 0)).toBeNull();
    const t = feed(s, 155, 0, 240);
    expect(s.rate(t)).toBeCloseTo(rateAt(155), 6);
    const m = s.minutesTo(8, t)!;
    expect(m).toBeCloseTo((trimpForStrain(8) - s.trimp) / rateAt(155), 6);
    expect(s.minutesTo(0.5, t)).toBe(0);
    // Barely above resting the target is out of reach at this effort.
    const t2 = feed(s, 70, t, 400);
    expect(s.minutesTo(15, t2)).toBeNull();
  });
});

describe("targetCrossing", () => {
  it("fires once into the range and once past it", () => {
    const tg: [number, number] = [10, 14];
    expect(targetCrossing(9.9, 10, tg)).toBe("low");
    expect(targetCrossing(10, 10.5, tg)).toBeNull();
    expect(targetCrossing(13.9, 14.1, tg)).toBe("high");
    expect(targetCrossing(9, 15, tg)).toBe("high");
    expect(targetCrossing(9, 15, null)).toBeNull();
  });
});

describe("workoutSetup", () => {
  type Row = Pick<DayRow, "s1" | "strainTarget" | "recovery">;
  const s1 = (restingHr: number, effort: number | null, hrCount = 500) => ({ restingHr, maxHr: 185, effort, hrCount }) as unknown as DayRow["s1"];

  it("reads today's resting and max HR, Effort, target and Recovery", () => {
    const rows = new Map<string, Row>([
      [
        "2026-10-07",
        {
          s1: s1(52, 40),
          strainTarget: { reason: null, low: 10, high: 14, base: 12, band: "green", coldStart: false, acwrRule: null },
          recovery: { value: 71 } as DayRow["recovery"],
        },
      ],
    ]);
    expect(workoutSetup(rows, "2026-10-07", 190)).toEqual({ restingHr: 52, maxHr: 185, baseEffort: 40, target: [10, 14], recovery: 71, synced: true, sex: "male" });
  });

  it("falls back to the week's resting HR and the profile's max before today has a row", () => {
    const rows = new Map<string, Row>([["2026-10-05", { s1: s1(55, 30), strainTarget: null, recovery: null }]]);
    expect(workoutSetup(rows, "2026-10-07", 190)).toEqual({ restingHr: 55, maxHr: 190, baseEffort: null, target: null, recovery: null, synced: false, sex: "male" });
    expect(workoutSetup(new Map(), "2026-10-07", 190).restingHr).toBe(60);
  });

  it("has no target while the target is missing a reason's worth of data", () => {
    const rows = new Map<string, Row>([["2026-10-07", { s1: s1(52, null, 0), strainTarget: { reason: "calibrating" }, recovery: null }]]);
    expect(workoutSetup(rows, "2026-10-07", 190)).toMatchObject({ target: null, baseEffort: null, synced: false });
  });
});
