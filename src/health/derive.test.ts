// The derived extras on hand-built minute arrays: no store, no Health Connect.
import { describe, expect, it } from "vitest";

import { deriveDayExtras, restingHrOn, type DeriveInput } from "./derive";

/**
 * A 60-minute "day" starting on a whole minute; max HR 200 and resting HR 60, so the reserve is 140 bpm: Fitbit's fat
 * burn zone (40 % of reserve) starts at 116 bpm and its cardio zone (60 %) at 144; a still minute is light from 30 % (102).
 */
const START = 1_700_000_040 - (1_700_000_040 % 60);
const N = 60;
const END = START + N * 60;
const MAX_HR = 200;
const REST = 60;

/** One sample at the start of each minute with a value (the minute's mean is that value); null leaves the minute without HR. */
const hrAt = (bpms: (number | null)[]) => bpms.flatMap((b, m) => (b == null ? [] : [{ ts: START + m * 60, bpm: b }]));
const stepsAt = (vs: number[]) => vs.flatMap((v, m) => (v ? [{ ts: START + m * 60, v }] : []));
const run = (o: Partial<DeriveInput>) =>
  Object.fromEntries(deriveDayExtras({ start: START, end: END, hr: [], steps: [], maxHr: MAX_HR, restingHr: REST, sleep: [], exercises: [], ...o }).map((v) => [v.key, v.value]));

describe("Active Zone Minutes and average heart rate", () => {
  it("gives 1 minute at 40–59 % of heart-rate reserve, 2 at 60 % and above, nothing below, and averages the samples", () => {
    const r = run({ hr: hrAt([115, 116, 143, 144, 180]) });
    expect(r.azm).toBe(0 + 1 + 1 + 2 + 2);
    expect(r.avg_hr).toBe(139.6);
    // The four minutes in the zones are active but too few for a bout, so they count as light, with the 115 bpm one.
    expect(r).toMatchObject({ active_minutes: 0, light_minutes: 5, sedentary_minutes: 0 });
  });

  it("sets the zones on the reserve above the day's resting HR, not on a share of max HR", () => {
    // An unfit 27-year-old: max 189 (Tanaka), resting 78. 100 and 118 bpm without steps are 20 and 36 % of the reserve:
    // below Fitbit's fat burn zone, so no zone minutes and no active minutes (on 50 % of max HR it earned 60 of each);
    // 100 bpm is under the light floor too.
    const walk = hrAt([...Array(30).fill(100), ...Array(30).fill(118)]);
    expect(run({ hr: walk, maxHr: 189, restingHr: 78 })).toMatchObject({ azm: 0, active_minutes: 0, light_minutes: 30, sedentary_minutes: 30 });
    // The same heart rate on a lower resting HR is a bigger share of the reserve: 118 bpm is 45 % of 189 − 60, so its
    // 30 minutes are a fat burn bout (100 bpm, 31 %, stays light).
    expect(run({ hr: walk, maxHr: 189, restingHr: 60 })).toMatchObject({ azm: 30, active_minutes: 30, light_minutes: 30 });
    // 125 bpm is 42 % of the reserve at resting 78: a 60-minute bout of fat burn.
    expect(run({ hr: hrAt(Array(60).fill(125)), maxHr: 189, restingHr: 78 })).toMatchObject({ azm: 60, active_minutes: 60 });
  });

  it("averages only the samples inside the day", () => {
    const r = run({ hr: [{ ts: START - 1, bpm: 200 }, { ts: START, bpm: 120 }, { ts: END, bpm: 200 }] });
    expect(r).toMatchObject({ avg_hr: 120, azm: 1 });
  });

  it("rounds the average to 1 dp", () => {
    expect(run({ hr: hrAt([61, 62, 64]) }).avg_hr).toBe(62.3);
  });
});

describe("active and light minutes", () => {
  it("counts active minutes only in bouts of 10 or more; a shorter bout is light", () => {
    const bpms: (number | null)[] = [...Array(12).fill(120), null, ...Array(9).fill(120)];
    const r = run({ hr: hrAt(bpms) });
    expect(r).toMatchObject({ active_minutes: 12, light_minutes: 9, azm: 21 });
  });

  it("makes a minute active with 60 steps or more, light with 1–59, from steps alone (no band)", () => {
    const steps = [...Array(10).fill(70), 0, 30, 59, 60, 0];
    const r = run({ steps: stepsAt(steps) });
    // Ten minutes of 70 steps are a bout; the lone 60-step minute is too short a bout and counts as light.
    expect(r).toEqual({ active_minutes: 10, light_minutes: 3 });
  });

  it("joins steps and heart rate into one bout", () => {
    // 5 minutes brisk steps without HR, then 5 minutes at 43 % of the reserve without steps: one 10-minute bout.
    const r = run({ hr: hrAt([null, null, null, null, null, 120, 120, 120, 120, 120]), steps: stepsAt([80, 80, 80, 80, 80]) });
    expect(r).toMatchObject({ active_minutes: 10, light_minutes: 0 });
  });
});

describe("light and sedentary minutes", () => {
  it("light is 1–59 steps or HR at 30–39 % of the reserve; sedentary needs heart rate under 30 % and no steps", () => {
    const r = run({ hr: hrAt([60, 101, 102, null, null]), steps: stepsAt([30, 0, 0, 10, 0]) });
    // 30 steps → light; 101 bpm (29.3 %), no steps → sedentary; 102 bpm (30 %) → light; 10 steps, no HR → light; nothing → nothing.
    expect(r).toMatchObject({ light_minutes: 3, sedentary_minutes: 1, active_minutes: 0, azm: 0 });
  });

  it("puts the light floor on the reserve above the day's resting HR, not on 40 % of max HR", () => {
    // Sitting at 80 bpm with a resting HR of 78 (max 189) is 2 % of the reserve: sedentary. On 40 % of max HR (75.6 bpm)
    // every such minute was light, so an unfit person was almost never sedentary.
    expect(run({ hr: hrAt(Array(60).fill(80)), maxHr: 189, restingHr: 78 })).toMatchObject({ sedentary_minutes: 60, light_minutes: 0 });
    // Light from 78 + 0.3 × 111 = 111.3 bpm.
    expect(run({ hr: hrAt([111, 112]), maxHr: 189, restingHr: 78 })).toMatchObject({ sedentary_minutes: 1, light_minutes: 1 });
  });

  it("never counts a minute inside a sleep session or a workout as sedentary, nor a minute without heart rate", () => {
    const hr = hrAt(Array(N).fill(60)); // at resting HR all hour, no steps
    const all = run({ hr });
    expect(all.sedentary_minutes).toBe(60);
    const r = run({
      hr,
      // Minutes 0–19 (the sleep ends half a minute into minute 19, which still touches it) and 50–59.
      sleep: [{ startTs: START - 600, endTs: START + 20 * 60 - 30 }],
      exercises: [{ startTs: START + 50 * 60, endTs: END + 600 }],
    });
    expect(r.sedentary_minutes).toBe(30);
    expect(run({ hr: hrAt(Array(30).fill(60)) }).sedentary_minutes).toBe(30);
  });
});

describe("what a day gets", () => {
  it("writes the three heart-rate values only with heart rate, and nothing for a day with neither", () => {
    expect(Object.keys(run({ steps: stepsAt([5]) }))).toEqual(["active_minutes", "light_minutes"]);
    expect(Object.keys(run({ hr: hrAt([70]) }))).toEqual(["active_minutes", "light_minutes", "azm", "sedentary_minutes", "avg_hr"]);
    expect(run({})).toEqual({});
    // Steps outside the day don't make it a day with steps.
    expect(run({ steps: [{ ts: END, v: 40 }] })).toEqual({});
  });
});

describe("restingHrOn", () => {
  const readings = [["2026-09-01", 70], ["2026-10-01", 76], ["2026-10-03", 74]] as const;
  it("takes the day's own reading, else the newest of the 30 days before, else 60 bpm", () => {
    expect(restingHrOn("2026-10-03", readings)).toBe(74);
    expect(restingHrOn("2026-10-02", readings)).toBe(76);
    expect(restingHrOn("2026-10-31", readings)).toBe(74);
    expect(restingHrOn("2026-09-15", readings)).toBe(70);
    expect(restingHrOn("2026-11-03", readings)).toBe(60); // 31 days after the last reading
    expect(restingHrOn("2026-08-31", readings)).toBe(60); // nothing before
    expect(restingHrOn("2026-10-02", [])).toBe(60);
    expect(restingHrOn("2026-10-03", [...readings, ["2026-10-03", 72]])).toBe(72); // the later reading of a day wins
  });
});
