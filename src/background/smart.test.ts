// The smart alerts and the bedtime schedule (smart.ts) are pure: no expo module is imported here.
import { describe, expect, it } from "vitest";
import type { VitalKey, VitalStatus } from "@/core/algorithms/healthMonitor";
import type { IllnessResult } from "@/core/scoring/illness";
import { toStrainScale } from "@/core/scoring/strain";
import type { ScoreRow } from "@/data/store";
import { emptyScoreRow } from "@/pipeline/stage1";
import type { SleepPlannerRow, Stage1Day } from "@/pipeline/types";
import { DEEP_LINK, EMPTY_MARKERS, markSent } from "./decide";
import {
  decideSmart,
  leadOf,
  MONITOR_LOOKBACK_DAYS,
  monitorBefore,
  monitorCopy,
  monitorState,
  planBedtime,
  reportBody,
  reportLink,
  strainBody,
  strainOf,
  type BedtimeInput,
  type SmartInput,
  type WeekReport,
} from "./smart";

const TZ = "Europe/Amsterdam";
/** Wall time in Amsterdam (CEST, UTC+2, through Oct 24 2026) → unix seconds. */
const at = (day: string, hh: number, mm = 0) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), hh - 2, mm) / 1000;
/** 2026-10-07 is a Wednesday; its ISO week is 2026-W41, the Monday 2026-10-05. */
const TODAY = "2026-10-07";
const NOW = at(TODAY, 18, 0);

const OFF = { strainTarget: false, healthMonitor: false, weeklyReport: false };
const base: SmartInput = {
  now: NOW,
  timeZone: TZ,
  source: "health_connect",
  settings: OFF,
  strain: null,
  target: null,
  monitor: null,
  monitorBefore: null,
  reports: [],
  markers: EMPTY_MARKERS,
};

const VITALS: VitalKey[] = ["restingHr", "hrv", "resp", "spo2", "skinTempDev"];
/** A stored Health Monitor with the given vitals out of range and the illness result patched in. */
function hm(out: Partial<Record<VitalKey, VitalStatus>> = {}, illness: Partial<IllnessResult> = {}): ScoreRow["health_monitor"] {
  const vitals = VITALS.map((key) => ({ key, value: 1, range: { low: 0, high: 2 }, status: out[key] ?? ("in_range" as VitalStatus) }));
  return {
    reason: null,
    stale: [],
    vitals,
    inRange: vitals.filter((v) => v.status === "in_range").length,
    flagged: vitals.filter((v) => v.status === "high" || v.status === "low").length,
    illness: { score: 0, level: "quiet", firedSignals: [], suppressedBy: [], signalCount: 0, copy: "", baselineTrusted: true, ...illness },
  };
}
const row = (day: string, patch: Partial<ScoreRow> = {}): ScoreRow => ({ ...emptyScoreRow(day), ...patch });

describe("strain target reached", () => {
  const on = { ...base, settings: { ...OFF, strainTarget: true }, target: { low: 11, high: 14.5 } };

  it("goes once Day Strain reaches the low end, inside the range, opening Strain", () => {
    const [a] = decideSmart({ ...on, strain: 11 });
    expect(a).toMatchObject({ kind: "strain_target", title: "Strain target reached", url: DEEP_LINK.strain, day: TODAY, mark: { strainTargetDay: TODAY } });
    expect(a.body).toBe("Day Strain 11.0 is inside today’s target of 11.0 - 14.5.");
  });

  it("says so when the first look already finds it past the range", () => {
    expect(decideSmart({ ...on, strain: 15.24 })[0].body).toBe("Day Strain 15.2 is past today’s target of 11.0 - 14.5. Prioritise sleep tonight to recover.");
    expect(strainBody(14.5, { low: 11, high: 14.5 })).toContain("inside");
  });

  it("is quiet below the target, without a target, and on a day without strain", () => {
    expect(decideSmart({ ...on, strain: 10.99 })).toEqual([]);
    expect(decideSmart({ ...on, strain: 12, target: null })).toEqual([]);
    expect(decideSmart({ ...on, strain: null })).toEqual([]);
  });

  it("goes at most once a local day", () => {
    expect(decideSmart({ ...on, strain: 12, markers: { ...EMPTY_MARKERS, strainTargetDay: TODAY } })).toEqual([]);
    expect(decideSmart({ ...on, strain: 12, markers: { ...EMPTY_MARKERS, strainTargetDay: "2026-10-06" } })).toHaveLength(1);
    const sent = decideSmart({ ...on, strain: 12 });
    expect(decideSmart({ ...on, strain: 13, markers: markSent(EMPTY_MARKERS, sent) })).toEqual([]);
  });

  it("respects the setting and never notifies for demo data", () => {
    expect(decideSmart({ ...on, strain: 12, settings: OFF })).toEqual([]);
    expect(decideSmart({ ...on, strain: 12, source: "demo" })).toEqual([]);
    expect(decideSmart({ ...on, strain: 12, source: null })).toEqual([]);
  });

  it("reads strain and target off today's row, on the 0–21 scale", () => {
    const target = { reason: null, low: 10, high: 14, base: 12, band: "green", coldStart: false, acwrRule: null } as const;
    expect(strainOf(row(TODAY, { strain: { effort: 60 } as Stage1Day, strain_target: target }))).toEqual({ strain: toStrainScale(60), target: { low: 10, high: 14 } });
    expect(strainOf(row(TODAY, { strain_target: { reason: "calibrating" } }))).toEqual({ strain: null, target: null });
    expect(strainOf(null)).toEqual({ strain: null, target: null });
  });
});

describe("Health Monitor raised", () => {
  const on = { ...base, settings: { ...OFF, healthMonitor: true } };
  const rhr = { level: "flagged" as const, names: ["Resting heart rate"] };
  const ill = { level: "illness" as const, names: ["Resting heart rate", "Heart rate variability"] };

  it("goes when last night leaves the normal range after a clear night, opening Health Monitor", () => {
    const [a] = decideSmart({ ...on, monitor: rhr, monitorBefore: "clear" });
    expect(a).toMatchObject({
      kind: "health_monitor",
      title: "1 vital outside your normal range",
      body: "Resting heart rate is outside your usual range. This can be an early sign of illness or heavy strain.",
      url: DEEP_LINK.monitor,
      mark: { monitorDay: TODAY, monitorLevel: "flagged" },
    });
  });

  it("names several vitals the way Home's card does, and words the illness signal", () => {
    const three = monitorCopy({ level: "flagged", names: ["Resting heart rate", "Heart rate variability", "Skin temperature"] });
    expect(three.title).toBe("3 vitals outside your normal range");
    expect(three.body).toBe("Resting heart rate, Heart rate variability and Skin temperature are outside your usual range. This can be an early sign of illness or heavy strain.");
    expect(decideSmart({ ...on, monitor: ill, monitorBefore: "clear" })[0].title).toBe("Your body may be fighting something");
  });

  it("only on a rise: never repeated while it stays raised, nor when it eases", () => {
    expect(decideSmart({ ...on, monitor: rhr, monitorBefore: "flagged" })).toEqual([]);
    expect(decideSmart({ ...on, monitor: ill, monitorBefore: "illness" })).toEqual([]);
    expect(decideSmart({ ...on, monitor: rhr, monitorBefore: "illness" })).toEqual([]);
    expect(decideSmart({ ...on, monitor: { level: "clear", names: [] }, monitorBefore: "illness" })).toEqual([]);
    expect(decideSmart({ ...on, monitor: ill, monitorBefore: "flagged" })).toHaveLength(1);
  });

  it("never from an unknown night before, nor before last night's vitals are in", () => {
    expect(decideSmart({ ...on, monitor: ill, monitorBefore: null })).toEqual([]);
    expect(decideSmart({ ...on, monitor: null, monitorBefore: "clear" })).toEqual([]);
  });

  it("once a day, except that the illness signal joining that day's vitals still goes", () => {
    const flaggedToday = { ...EMPTY_MARKERS, monitorDay: TODAY, monitorLevel: "flagged" as const };
    expect(decideSmart({ ...on, monitor: rhr, monitorBefore: "clear", markers: flaggedToday })).toEqual([]);
    expect(decideSmart({ ...on, monitor: ill, monitorBefore: "clear", markers: flaggedToday })).toHaveLength(1);
    expect(decideSmart({ ...on, monitor: ill, monitorBefore: "clear", markers: { ...flaggedToday, monitorLevel: "illness" } })).toEqual([]);
    expect(decideSmart({ ...on, monitor: rhr, monitorBefore: "clear", markers: { ...flaggedToday, monitorDay: "2026-10-05" } })).toHaveLength(1);
  });

  it("respects the setting", () => {
    expect(decideSmart({ ...on, settings: OFF, monitor: ill, monitorBefore: "clear" })).toEqual([]);
  });

  it("reads a night as Home does: the illness flag first, then vitals out of range", () => {
    expect(monitorState(hm())).toEqual({ level: "clear", names: [] });
    expect(monitorState(hm({ restingHr: "high", hrv: "low" }))).toEqual({ level: "flagged", names: ["Resting heart rate", "Heart rate variability"] });
    expect(monitorState(hm({ restingHr: "high" }, { level: "raised", score: 60, signalCount: 2 }))?.level).toBe("illness");
    // A logged illness counts once the signal agrees with it (two signals, score 50+).
    expect(monitorState(hm({}, { level: "alreadyUnwell", score: 55, signalCount: 2 }))?.level).toBe("illness");
    expect(monitorState(hm({}, { level: "alreadyUnwell", score: 30, signalCount: 1 }))?.level).toBe("clear");
    expect(monitorState({ reason: "band_not_worn" })).toBeNull();
    expect(monitorState(null)).toBeNull();
  });

  it("rises from the newest earlier night with a result, skipping nights off the band, within the lookback", () => {
    const rows = [
      row("2026-10-04", { health_monitor: hm({ hrv: "low" }) }),
      row("2026-10-05", { health_monitor: hm() }),
      row("2026-10-06", { health_monitor: { reason: "band_not_worn" } }),
      row(TODAY, { health_monitor: hm({ hrv: "low" }) }),
    ];
    expect(monitorBefore(rows, TODAY)).toBe("clear");
    expect(monitorBefore(rows.slice(0, 1).concat(rows.slice(2)), TODAY)).toBe("flagged");
    expect(monitorBefore([rows[2], rows[3]], TODAY)).toBeNull();
    const old = row("2026-09-29", { health_monitor: hm() });
    expect(MONITOR_LOOKBACK_DAYS).toBe(7);
    expect(monitorBefore([old], TODAY)).toBeNull();
    expect(monitorBefore([row("2026-09-30", { health_monitor: hm() })], TODAY)).toBe("clear");
  });
});

describe("weekly report ready", () => {
  const W40: WeekReport = {
    period: "2026-W40",
    start: "2026-09-28",
    end: "2026-10-04",
    partial: false,
    days: 7,
    averages: { recovery: 63.6, strain: 11.24, sleepPerf: 80, sleepHours: 7.2, hrv: 52, rhr: 55 },
  };
  const MONDAY = "2026-10-05";
  const on = { ...base, now: at(MONDAY, 8), settings: { ...OFF, weeklyReport: true }, reports: [W40] };

  it("goes Monday morning for the week that just ended, opening its report", () => {
    const [a] = decideSmart(on);
    expect(a).toMatchObject({ kind: "weekly_report", title: "Weekly report ready", url: "pulse://reports/2026-W40", day: MONDAY, mark: { reportPeriod: "2026-W40" } });
    expect(a.body).toBe("Sep 28 - Oct 4: Recovery averaged 64%, Day Strain 11.2.");
    expect(reportLink("2026-W40")).toBe("pulse://reports/2026-W40");
  });

  it("waits for 07:00 on Monday, catches up on Tuesday, and lets the week go after that", () => {
    expect(decideSmart({ ...on, now: at(MONDAY, 6, 59) })).toEqual([]);
    expect(decideSmart({ ...on, now: at(MONDAY, 7) })).toHaveLength(1);
    expect(decideSmart({ ...on, now: at("2026-10-06", 0, 30) })).toHaveLength(1);
    expect(decideSmart({ ...on, now: at(TODAY, 9) })).toEqual([]);
    expect(decideSmart({ ...on, now: at("2026-10-11", 9) })).toEqual([]);
  });

  it("once per week", () => {
    expect(decideSmart({ ...on, markers: { ...EMPTY_MARKERS, reportPeriod: "2026-W40" } })).toEqual([]);
    expect(decideSmart({ ...on, markers: { ...EMPTY_MARKERS, reportPeriod: "2026-W39" } })).toHaveLength(1);
  });

  it("needs a complete report with some data", () => {
    expect(decideSmart({ ...on, reports: [] })).toEqual([]);
    expect(decideSmart({ ...on, reports: [{ ...W40, partial: true }] })).toEqual([]);
    expect(decideSmart({ ...on, reports: [{ ...W40, days: 0 }] })).toEqual([]);
    const empty = { recovery: null, strain: null, sleepPerf: null, sleepHours: null, hrv: null, rhr: null };
    expect(decideSmart({ ...on, reports: [{ ...W40, averages: empty }] })).toEqual([]);
    // Only last week's report counts, not an older one.
    expect(decideSmart({ ...on, reports: [{ ...W40, period: "2026-W39" }] })).toEqual([]);
  });

  it("names the ISO week across the new year (2026 has a week 53)", () => {
    const w53 = { ...W40, period: "2026-W53", start: "2026-12-28", end: "2027-01-03" };
    const [a] = decideSmart({ ...on, now: Date.UTC(2027, 0, 4, 8) / 1000, reports: [w53] });
    expect(a.url).toBe("pulse://reports/2026-W53");
  });

  it("words only what the week has", () => {
    expect(reportBody({ ...W40, averages: { ...W40.averages, strain: null } })).toBe("Sep 28 - Oct 4: Recovery averaged 64%.");
    expect(reportBody({ ...W40, averages: { ...W40.averages, recovery: null, strain: null } })).toBe("Your week of Sep 28 - Oct 4 is in.");
  });
});

describe("planBedtime", () => {
  /** Today's row plans tomorrow's wake at 07:00 and a 100 % bedtime of 22:45 tonight (−75 min from the wake day's midnight). */
  const plan = (bedtimeMin: number, wakeDay = "2026-10-08"): Extract<SleepPlannerRow, { reason: null }> => ({
    reason: null,
    wakeDay,
    nights: 14,
    needMin: 480,
    parts: { baselineMin: 480, strainMin: 0, debtMin: 0, napMin: 0 },
    wakeMin: 420,
    weekend: false,
    efficiency: 0.9,
    latencyMin: 0,
    plans: [
      { share: 1, sleepMin: 480, inBedMin: 533, bedtimeMin },
      { share: 0.85, sleepMin: 408, inBedMin: 453, bedtimeMin: bedtimeMin + 80 },
      { share: 0.7, sleepMin: 336, inBedMin: 373, bedtimeMin: bedtimeMin + 160 },
    ],
  });
  const input: BedtimeInput = {
    now: at(TODAY, 20),
    timeZone: TZ,
    source: "health_connect",
    enabled: true,
    leadMin: 30,
    plans: [
      { day: "2026-10-06", planner: plan(-90, TODAY) },
      { day: TODAY, planner: plan(-75) },
    ],
    markers: { bedtimeDay: null, bedtimeAt: null },
  };

  it("schedules the reminder the lead before tonight's 100 % bedtime, opening the planner", () => {
    const a = planBedtime(input);
    expect(a.action).toBe("schedule");
    if (a.action !== "schedule") return;
    expect(a.reminder).toEqual({
      title: "Wind down",
      body: "Bed by 22:45 to meet tonight’s sleep need.",
      url: DEEP_LINK.planner,
      day: TODAY,
      at: at(TODAY, 22, 15),
      bedtime: at(TODAY, 22, 45),
    });
    expect(a.mark).toEqual({ bedtimeDay: TODAY, bedtimeAt: at(TODAY, 22, 15) });
  });

  it("takes the lead from the settings, and rounds the bedtime to the clock minute", () => {
    const a = planBedtime({ ...input, leadMin: 60, plans: [{ day: TODAY, planner: plan(-75.4) }] });
    expect(a.action === "schedule" && a.reminder.at).toBe(at(TODAY, 21, 45));
    expect(leadOf(45)).toBe(45);
    expect(leadOf(-5)).toBe(0);
    expect(leadOf(500)).toBe(120);
    expect(leadOf(Number.NaN)).toBe(30);
  });

  it("covers a bedtime after midnight from yesterday's plan, the earliest still ahead first", () => {
    const now = at("2026-10-08", 0, 5);
    const a = planBedtime({
      ...input,
      now,
      leadMin: 15,
      plans: [
        { day: TODAY, planner: plan(30) },
        { day: "2026-10-08", planner: plan(-75, "2026-10-09") },
      ],
    });
    expect(a.action === "schedule" && a.reminder).toMatchObject({ day: TODAY, at: at("2026-10-08", 0, 15), body: "Bed by 00:30 to meet tonight’s sleep need." });
  });

  it("does not plan a day again once its reminder went out, however the bedtime moves", () => {
    const fired = { bedtimeDay: TODAY, bedtimeAt: at(TODAY, 22, 15) };
    const a = planBedtime({ ...input, now: at(TODAY, 22, 20), plans: [{ day: TODAY, planner: plan(-30) }], markers: fired });
    // Nothing else ahead: keep the schedule alone, in case Android is still delivering it.
    expect(a).toEqual({ action: "keep", mark: {} });
  });

  it("cancels once tonight's reminder time has passed with nothing on the schedule", () => {
    expect(planBedtime({ ...input, now: at(TODAY, 22, 20) })).toEqual({ action: "cancel", mark: {} });
  });

  it("re-plans a pending reminder when the bedtime moves, and cancels it (clearing its marker) when the plan goes", () => {
    const pending = { bedtimeDay: TODAY, bedtimeAt: at(TODAY, 22, 15) };
    const moved = planBedtime({ ...input, plans: [{ day: TODAY, planner: plan(-45) }], markers: pending });
    expect(moved.action === "schedule" && moved.reminder.at).toBe(at(TODAY, 22, 45));
    const clear = { action: "cancel", mark: { bedtimeDay: null, bedtimeAt: null } };
    expect(planBedtime({ ...input, plans: [{ day: TODAY, planner: { reason: "calibrating", nightsLeft: 3, needMin: 480 } }], markers: pending })).toEqual(clear);
    expect(planBedtime({ ...input, enabled: false, markers: pending })).toEqual(clear);
  });

  it("is quiet for demo data, with the setting off, and without a plan", () => {
    expect(planBedtime({ ...input, source: "demo" }).action).toBe("cancel");
    expect(planBedtime({ ...input, source: null }).action).toBe("cancel");
    expect(planBedtime({ ...input, enabled: false }).action).toBe("cancel");
    expect(planBedtime({ ...input, plans: [] }).action).toBe("cancel");
    expect(planBedtime({ ...input, plans: [{ day: TODAY, planner: null }] }).action).toBe("cancel");
    expect(planBedtime({ ...input, plans: [{ day: TODAY, planner: { ...plan(-75), wakeMin: null, plans: [] } }] }).action).toBe("cancel");
  });
});
