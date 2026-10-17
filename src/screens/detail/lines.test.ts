// The detail screens' pure helpers (lines.ts): Strain's band words, the target line, a night's dates and the cut of a
// daily series to the day a screen shows.
import { describe, expect, it } from "vitest";
import { nightDates, seriesPoints, strainWord, targetLine } from "./lines";

describe("strainWord", () => {
  it("names the four bands at their edges, after rounding to the tenth shown", () => {
    expect(strainWord(0)).toBe("Light");
    expect(strainWord(9.94)).toBe("Light");
    expect(strainWord(9.96)).toBe("Moderate");
    expect(strainWord(14)).toBe("Strenuous");
    expect(strainWord(18)).toBe("All out");
    expect(strainWord(21)).toBe("All out");
  });
});

describe("targetLine", () => {
  const t = { low: 12, high: 15 };
  it("says nothing without a strain or a target", () => {
    expect(targetLine(null, t)).toBeNull();
    expect(targetLine(10, null)).toBeNull();
  });
  it("says how far below the target the day is", () => {
    expect(targetLine(8.5, t)).toBe("3.5 below today’s Strain Target of 12.0 – 15.0.");
  });
  it("says inside at both edges and past above it", () => {
    expect(targetLine(12, t)).toBe("Inside today’s Strain Target.");
    expect(targetLine(15, t)).toBe("Inside today’s Strain Target.");
    expect(targetLine(15.1, t)).toBe("Past today’s Strain Target: prioritise sleep tonight.");
  });
});

describe("nightDates", () => {
  const at = (iso: string) => Date.parse(iso);
  it("joins a night across midnight in one month", () => {
    expect(nightDates(at("2026-10-16T23:24:00Z"), at("2026-10-17T06:40:00Z"), "UTC")).toBe("Oct 16–17");
  });
  it("gives one date for a night that starts after midnight", () => {
    expect(nightDates(at("2026-10-17T00:30:00Z"), at("2026-10-17T07:00:00Z"), "UTC")).toBe("Oct 17");
  });
  it("spells out both months across a month's end", () => {
    expect(nightDates(at("2026-09-30T23:00:00Z"), at("2026-10-01T06:00:00Z"), "UTC")).toBe("Sep 30 – Oct 1");
  });
  it("reads the dates in the person's zone", () => {
    expect(nightDates(at("2026-10-16T22:00:00Z"), at("2026-10-17T05:00:00Z"), "Asia/Kolkata")).toBe("Oct 17");
  });
});

describe("seriesPoints", () => {
  const days = ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"];
  const s = { days, values: [1, null, 3, 4], provisional: [false, false, true, false] };
  it("ends on the day shown, keeping each value with its day", () => {
    expect(seriesPoints(s, "2026-10-16")).toEqual([
      { date: "2026-10-14", value: 1, provisional: false },
      { date: "2026-10-15", value: null, provisional: false },
      { date: "2026-10-16", value: 3, provisional: true },
    ]);
  });
  it("takes the whole series when the day is its last or later", () => {
    expect(seriesPoints(s, "2026-10-20").map((p) => p.date)).toEqual(days);
  });
  it("keeps the last 365 days at most", () => {
    const long = Array.from({ length: 400 }, (_, i) => `d${String(i).padStart(3, "0")}`);
    const out = seriesPoints({ days: long, values: long.map((_, i) => i), provisional: long.map(() => false) }, "d399");
    expect(out).toHaveLength(365);
    expect(out[0]).toEqual({ date: "d035", value: 35, provisional: false });
    expect(out[364].value).toBe(399);
  });
});
