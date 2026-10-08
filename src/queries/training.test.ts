// The Garmin-style training cards' view models over the 180-day demo seed: Training Readiness, Recovery Time and Training
// Status (Activity tab), each workout's Training Effect (Activity screen) and HRV Status (Health tab).
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { seedDemo } from "@/data/seed";
import type { Profile } from "@/data/types";
import { addDays } from "@/lib/time";
import { runPipeline } from "@/pipeline";
import { getActivity } from "./activity";
import type { QueryCtx } from "./ctx";
import { FACTOR_LABEL, getHrvStatus, getTraining, readinessVM, statusVM } from "./training";

const TZ = "Asia/Kolkata";
const TODAY = "2026-10-02";
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
const PROFILE: Profile = { birthDate: "1990-01-01", sex: "male", maxHr: 183, heightCm: 178, timeZone: TZ };
let store: MemoryStore;
let ctx: QueryCtx;

beforeAll(async () => {
  store = new MemoryStore();
  await seedDemo(store, { today: TODAY, timeZone: TZ, now: NOW });
  await runPipeline(store, PROFILE, { today: TODAY });
  ctx = { store, profile: PROFILE, timeZone: TZ, today: TODAY, now: NOW, sync: { lastSyncTs: NOW, firstDay: addDays(TODAY, -179), lastError: null } };
}, 120_000);

describe("getTraining", () => {
  it("gives today's Training Readiness 1–100 with its band, every factor and this morning's score", async () => {
    const vm = await getTraining(TODAY, ctx);
    const r = vm.readiness.value!;
    expect(r.score).toBeGreaterThanOrEqual(1);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(["Prime", "High", "Moderate", "Low", "Poor"]).toContain(r.band);
    expect(r.factors.map((f) => f.label)).toEqual(Object.values(FACTOR_LABEL));
    expect(r.atWake).toBeTypeOf("number");
    expect(r.line.length).toBeGreaterThan(10);
  });

  it("counts Recovery Time down from this morning's and says when it ends", async () => {
    const vm = await getTraining(TODAY, ctx);
    const rt = vm.recoveryTime.value!;
    expect(rt.hours).toBeLessThanOrEqual(rt.atWake);
    if (rt.hours > 0) expect(rt.readyAt).toBeGreaterThan(NOW * 1000);
    // A hard day adds recovery time by its end.
    const hard = await getTraining("2026-10-01", ctx);
    expect(hard.recoveryTime.value!.hours).toBeGreaterThan(hard.recoveryTime.value!.atWake);
  });

  it("names a Training Status with its line, load ratio and HRV Status", async () => {
    const s = (await getTraining(TODAY, ctx)).status.value!;
    expect(["Productive", "Maintaining", "Recovery", "Peaking", "Unproductive", "Overreaching", "Strained", "Detraining"]).toContain(s.status);
    expect(s.loadRatio).toBeTypeOf("number");
    expect(s.hrv).toBe("Balanced");
  });

  it("calibrates in the first weeks and reads a missing day as missing", async () => {
    const early = await getTraining(addDays(TODAY, -175), ctx);
    expect(early.status.value).toBeNull();
    expect(early.status.reason).toBe("calibrating");
    expect(readinessVM(null, false).value).toBeNull();
    expect(statusVM(null, null, null, true).value).toBeNull();
  });
});

describe("Training Effect on the Activity screen", () => {
  it("shows each workout's aerobic effect 0–5 with its label, benefit and the recovery time it added", async () => {
    const ex = (await store.allExercises()).filter((e) => e.day >= addDays(TODAY, -6));
    expect(ex.length).toBeGreaterThan(0);
    for (const e of ex) {
      const vm = (await getActivity(e.id, ctx))!;
      const te = vm.trainingEffect!;
      expect(te.te).toBeGreaterThanOrEqual(0);
      expect(te.te).toBeLessThanOrEqual(5);
      expect(["No benefit", "Minor", "Maintaining", "Improving", "Highly improving", "Overreaching"]).toContain(te.label);
      expect(["Recovery", "Base", "Tempo", "Threshold", "VO2 max"]).toContain(te.benefit);
      expect(te.recoveryHours).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("getHrvStatus", () => {
  it("reads the 7-day average against the usual band, with 28 nights to draw", async () => {
    const m = await getHrvStatus(TODAY, ctx);
    const v = m.value!;
    expect(["Balanced", "Unbalanced", "Low"]).toContain(v.status);
    expect(v.band.low).toBeLessThan(v.band.high);
    expect(v.lowLine).toBeLessThan(v.band.low);
    expect(v.nights).toHaveLength(28);
  });

  it("builds its baseline for 21 nights first, saying how many are left", async () => {
    const m = await getHrvStatus(addDays(TODAY, -170), ctx);
    expect(m.value).toBeNull();
    expect(m.reason).toBe("calibrating");
    expect(m.nightsLeft).toBeGreaterThan(0);
  });
});
