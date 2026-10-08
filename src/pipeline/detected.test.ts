// Mobile: the pipeline's detected workouts (stage 1) and Activity Cost (stage 2), end to end on the in-memory Store.
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { seedDemo } from "@/data/seed";
import { emptyMetrics, type Exercise, type HrSample, type Profile, type StepsMinute } from "@/data/types";
import { addDays, localMidnight } from "@/lib/time";
import { getActivities } from "@/queries/activities";
import type { QueryCtx } from "@/queries/ctx";
import { runPipeline } from "@/pipeline";

const TZ = "UTC";
const TODAY = "2026-10-07";
const DAYS = 6;
const FIRST = addDays(TODAY, 1 - DAYS);
const PROFILE: Profile = { birthDate: "1990-06-01", sex: "male", maxHr: 185, heightCm: 180, timeZone: TZ };
const dayAt = (i: number) => addDays(FIRST, i);
/** The day whose 18:00 walk is recorded as a workout. */
const RECORDED = 2;

/** Minute HR: 62 asleep to 07:00, 75 awake, a 30-minute walk at 118 bpm from 18:00 (resting 60 + 30 is 90). */
const bpmAt = (m: number) => (m < 420 ? 62 : m >= 1080 && m < 1110 ? 118 : 75);
const stepsAt = (m: number) => (m >= 1080 && m < 1110 ? 112 : 0);

let store: MemoryStore;
const ctxFor = async (s: MemoryStore, today: string): Promise<QueryCtx> => ({ store: s, profile: PROFILE, timeZone: TZ, today, now: localMidnight(today, TZ) + 86_000, sync: await s.getSyncState() });

beforeAll(async () => {
  store = new MemoryStore();
  await store.setProfile(PROFILE);
  for (let i = 0; i < DAYS; i++) {
    const start = localMidnight(dayAt(i), TZ);
    const hr: HrSample[] = [];
    const steps: StepsMinute[] = [];
    for (let m = 0; m < 1440; m++) {
      for (let s = 0; s < 60; s += 15) hr.push({ ts: start + m * 60 + s, bpm: bpmAt(m) });
      if (stepsAt(m)) steps.push({ ts: start + m * 60, v: stepsAt(m) });
    }
    await store.putHr(hr);
    await store.putSteps(steps);
  }
  await store.upsertMetrics(Array.from({ length: DAYS }, (_, i) => ({ ...emptyMetrics(dayAt(i)), rhrBpm: 60 })));
  const walk = localMidnight(dayAt(RECORDED), TZ) + 1080 * 60;
  const recorded: Exercise = { id: "w1", day: dayAt(RECORDED), startTs: walk, endTs: walk + 1800, type: "WALKING", name: null, calories: null, distanceM: null };
  await store.upsertExercises([recorded]);
  await runPipeline(store, PROFILE, { today: TODAY });
}, 60_000);

describe("detected workouts", () => {
  it("stores the unrecorded walk on each day, labelled from its steps, and nothing where it was recorded", async () => {
    for (let i = 0; i < DAYS; i++) {
      const row = (await store.getScores(dayAt(i)))!;
      const start = localMidnight(dayAt(i), TZ) + 1080 * 60;
      if (i === RECORDED) expect(row.detected).toEqual([]);
      else expect(row.detected).toMatchObject([{ start, end: start + 1800 - 15, avgHr: 118, maxHr: 118, minutes: 29, kind: "walk", steps: 3360 }]);
    }
  });

  it("adds nothing to the day's Effort, which already counts the HR above the waking floor; recorded, it counts in full", async () => {
    const plain = (await store.getScores(dayAt(1)))!.strain!.effort!;
    const recorded = (await store.getScores(dayAt(RECORDED)))!.strain!.effort!;
    // The detected walk is ordinary heart rate to Day Strain: only what is above the person's still waking floor counts.
    // Inside a recorded workout nothing is subtracted (strain.ts), so the same walk counts for more.
    expect(plain).toBeGreaterThan(0);
    expect(recorded).toBeGreaterThan(plain);
    expect((await store.getScores(dayAt(3)))!.strain!.effort).toBe(plain);
  });

  it("shows on Activities beside the recorded workouts, a day with only those getting a group", async () => {
    const vm = await getActivities(30, await ctxFor(store, TODAY));
    expect(vm.groups.map((g) => [g.day, g.items.length, g.detected.length])).toEqual(
      Array.from({ length: DAYS }, (_, j) => {
        const i = DAYS - 1 - j;
        return [dayAt(i), i === RECORDED ? 1 : 0, i === RECORDED ? 0 : 1];
      }),
    );
    expect(vm.groups[0].detected[0]).toMatchObject({ kind: "walk", label: "Walking", avgHr: 118 });
  });

  it("an unchanged rerun redoes nothing", async () => {
    expect(await runPipeline(store, PROFILE, { today: TODAY })).toEqual({ days: DAYS, stage1Reran: 0 });
  });
});

describe("Activity Cost on the demo seed", () => {
  const DEMO_TZ = "Asia/Kolkata";
  const DEMO_TODAY = "2026-10-02";
  const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
  let demo: MemoryStore;
  let profile: Profile;
  beforeAll(async () => {
    demo = new MemoryStore();
    profile = await seedDemo(demo, { today: DEMO_TODAY, timeZone: DEMO_TZ, now: NOW });
    await runPipeline(demo, profile, { today: DEMO_TODAY });
  }, 120_000);

  it("stores one row per workout kind, measured kinds first, and the screens read it", async () => {
    const cost = (await demo.getActivityCost())!;
    expect(cost.baseline).not.toBeNull();
    const kinds = new Set((await demo.allExercises()).map((e) => e.type));
    expect(cost.items.length).toBe(kinds.size);
    const measured = cost.items.filter((i) => i.reason === null);
    expect(measured.length).toBeGreaterThan(0);
    expect(cost.items.slice(0, measured.length)).toEqual(measured);
    const vm = await getActivities(30, { store: demo, profile, timeZone: DEMO_TZ, today: DEMO_TODAY, now: NOW, sync: await demo.getSyncState() });
    expect(vm.cost?.items.map((i) => i.kind).sort()).toEqual(cost.items.map((i) => i.kind).sort());
  });

  it("is rewritten only when it changes", async () => {
    const before = await demo.getActivityCost();
    let writes = 0;
    const put = demo.putActivityCost.bind(demo);
    demo.putActivityCost = async (d) => {
      writes++;
      await put(d);
    };
    await runPipeline(demo, profile, { today: DEMO_TODAY });
    expect(writes).toBe(0);
    expect(await demo.getActivityCost()).toEqual(before);
  });
});
