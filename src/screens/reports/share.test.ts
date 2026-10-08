import { describe, expect, it } from "vitest";
import type { KeyStat } from "@/queries";
import type { ReportPageVM } from "@/queries/reports";
import { periodText, reportShareText, statLine } from "./share";

const ok = (value: number) => ({ value, reason: null, provisional: false });
const stat = (key: string, label: string, value: number | null, average: number | null, extra: Partial<KeyStat> = {}): KeyStat => ({
  key,
  label,
  metric: value === null ? { value: null, reason: "no_data", provisional: false } : ok(value),
  average,
  direction: "up",
  ...extra,
});

const VM: ReportPageVM = {
  period: "2026-W39",
  kind: "week",
  start: "2026-09-21",
  end: "2026-09-27",
  partial: false,
  prev: "2026-W38",
  next: "2026-W40",
  latestWeek: "2026-W39",
  latestMonth: "2026-09",
  dials: [],
  insight: null,
  bands: { value: null, reason: "no_data", provisional: false },
  averages: [
    stat("recovery", "Recovery", 64.4, 59.2, { unit: "%" }),
    stat("strain", "Day strain", 11.2, 12, { direction: "neutral" }),
    stat("sleepPerf", "Sleep performance", 82, 82, { unit: "%" }),
    stat("sleepHours", "Hours of sleep", 7.2, 7, { unit: "h" }),
    stat("consistency", "Sleep consistency", 78, 90, { unit: "%" }),
    stat("hrv", "Heart rate variability", 54, 50, { unit: "ms" }),
    stat("rhr", "Resting heart rate", null, 52, { unit: "bpm", direction: "down" }),
  ],
  trainingBalance: { value: null, reason: "no_data", provisional: false },
  topImpacts: [],
  bestWorst: null,
  performance: {
    focus: ["Your sleep consistency dropped 12 points; aim for the same bedtime ±30 min, weekends included."],
    improved: [{ key: "hrv", label: "Heart rate variability", text: "+4 ms", better: true }],
    declined: [{ key: "consistency", label: "Sleep consistency", text: "−12%", better: false }],
    sleep: [
      stat("slept", "Hours slept", 432, 457, { format: "duration", caption: "Need 7:50 a night" }),
      stat("nightsMet", "Nights at sleep need", 3, null, { unit: "of 7", format: "int", direction: "none" }),
      stat("consistency", "Sleep consistency", 78, 90, { unit: "%", format: "int" }),
    ],
    activity: [
      stat("zone13", "Moderate activity", 160, 140, { unit: "min", format: "grouped" }),
      stat("zone45", "Vigorous activity", 45, 45, { unit: "min", format: "grouped" }),
      stat("strength", "Strength sessions", 2, 1, { format: "int" }),
      stat("steps", "Daily steps", 8400, 7800, { format: "grouped" }),
    ],
  },
};

describe("reportShareText", () => {
  it("lays the report out as titled sections", () => {
    expect(reportShareText(VM)).toBe(
      [
        "Halo · Weekly performance assessment",
        "Sep 21 - Sep 27, 2026",
        "",
        "Averages vs last week",
        "• Recovery 64% (+5)",
        "• Day strain 11.2 (−0.8)",
        "• Sleep performance 82%",
        "• Heart rate variability 54 ms (+4)",
        "",
        "Sleep",
        "• Hours slept 7:12 a night (−0:25) · need 7:50 a night",
        "• Nights at sleep need 3 of 7",
        "• Sleep consistency 78% (−12)",
        "",
        "Activity",
        "• Moderate activity 160 min a week (+20)",
        "• Vigorous activity 45 min a week",
        "• Strength sessions 2 a week (+1)",
        "• Daily steps 8,400 a day (+600)",
        "",
        "Biggest changes",
        "↑ Heart rate variability +4 ms",
        "↓ Sleep consistency −12%",
        "",
        "Focus",
        "• Your sleep consistency dropped 12 points; aim for the same bedtime ±30 min, weekends included.",
      ].join("\n"),
    );
  });

  it("a month in progress, with no changes or focus, drops those sections", () => {
    const month: ReportPageVM = { ...VM, kind: "month", period: "2026-10", start: "2026-10-01", end: "2026-10-31", partial: true, performance: { ...VM.performance, improved: [], declined: [], focus: [] } };
    const text = reportShareText(month);
    expect(text.split("\n").slice(0, 2)).toEqual(["Halo · Monthly performance assessment", "October 2026 (so far)"]);
    expect(text).toContain("Averages vs last month");
    expect(text).not.toContain("Biggest changes");
    expect(text).not.toContain("Focus");
  });

  it("formats each stat in its own unit, hours scaled to h:mm", () => {
    expect(statLine(stat("sleepHours", "Hours of sleep", 7.5, 7))).toBe("Hours of sleep 7:30 (+0:30)");
    expect(statLine(stat("rhr", "Resting heart rate", 51.6, 53.2, { direction: "down" }))).toBe("Resting heart rate 52 bpm (−2)");
    expect(statLine(stat("steps", "Daily steps", 7000, 8200, { format: "grouped" }), " a day")).toBe("Daily steps 7,000 a day (−1,200)");
    expect(statLine(stat("hrv", "HRV", null, 50))).toBeNull();
    expect(periodText({ kind: "week", start: "2025-12-29", end: "2026-01-04" })).toBe("Dec 29 - Jan 4, 2026");
  });
});
