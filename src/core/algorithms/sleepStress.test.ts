import { describe, expect, it } from "vitest";
import { sleepStress, sleepStressConfig } from "./sleepStress";

const REST = 55;
const MAX = 185; // reserve 130: lift max(6, 10.4) = 10.4 bpm
/** A night of `n` asleep minutes at 52 bpm, with `f` overriding minutes. */
const night = (n: number, f: (m: number) => number | null = () => 52) => Array.from({ length: n }, (_, m) => f(m));
const asleep = (n: number) => Array(n).fill(true);

describe("Sleep Stress (heart-rate proxy)", () => {
  it("is 0 on a calm night", () => {
    expect(sleepStress(night(420), asleep(420), REST, MAX)).toEqual({ pct: 0, stressedMin: 0, minutes: 420 });
  });

  it("counts stretches of 3+ minutes at the night's calm level + max(6 bpm, 8 % of the reserve)", () => {
    expect(sleepStressConfig).toMatchObject({ calmPercentile: 0.2, minLiftBpm: 6, liftHrr: 0.08, minRunMin: 3 });
    // 30 minutes at 65 bpm (13 above calm): stressed; 2 minutes at 70: too short.
    const hr = night(400, (m) => (m >= 100 && m < 130 ? 65 : m >= 200 && m < 202 ? 70 : 52));
    expect(sleepStress(hr, asleep(400), REST, MAX)).toEqual({ pct: 7.5, stressedMin: 30, minutes: 400 });
  });

  it("a lift under the threshold doesn't count; the 6 bpm floor applies with a small reserve", () => {
    const hr = night(400, (m) => (m >= 100 && m < 160 ? 61 : 52)); // +9 < 10.4
    expect(sleepStress(hr, asleep(400), REST, MAX)!.pct).toBe(0);
    expect(sleepStress(hr, asleep(400), REST, REST + 40)!.pct).toBe(15); // threshold 52 + 6
  });

  it("bridges sparse readings a few minutes apart, but not a long gap", () => {
    // Readings every 5 minutes, raised for an hour: still one stretch.
    const hr = night(480, (m) => (m % 5 ? null : m >= 120 && m < 180 ? 66 : 52));
    const r = sleepStress(hr, asleep(480), REST, MAX)!;
    expect(r.minutes).toBe(96);
    expect(r.stressedMin).toBe(12);
  });

  it("reads asleep minutes only, and needs an hour of them with heart rate", () => {
    const hr = night(400, (m) => (m < 60 ? 80 : 52));
    const awakeFirst = asleep(400).map((_, m) => m >= 60);
    expect(sleepStress(hr, awakeFirst, REST, MAX)!.pct).toBe(0);
    expect(sleepStress(night(59), asleep(59), REST, MAX)).toBeNull();
  });
});
