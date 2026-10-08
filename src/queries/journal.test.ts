// The Journal view models over the Store: the strip, check-in, history, teaser and Behaviour insights.
import { beforeEach, describe, expect, it } from "vitest";
import type { Effect, TagImpact } from "@/core/algorithms/journalImpact";
import { openMemoryStore } from "@/data/memory";
import type { Store } from "@/data/store";
import { addDays } from "@/lib/time";
import { emptyScoreRow } from "@/pipeline/stage1";
import type { QueryCtx } from "./ctx";
import { ensureDefaultTags, getJournal, getJournalInsights } from "./journal";

const TODAY = "2026-10-03";
let store: Store;
const ctx = (): QueryCtx => ({
  store,
  profile: { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null, timeZone: "UTC" },
  timeZone: "UTC",
  today: TODAY,
  now: Date.parse(`${TODAY}T12:00:00Z`) / 1000,
  sync: { lastSyncTs: null, firstDay: "2026-06-01", lastError: null },
});

const none: Effect = { nYes: 2, nNo: 1, delta: null, ciLow: null, ciHigh: null, label: "not_enough_data" };
const fx = (delta: number, label: Effect["label"], n = [6, 8]): Effect => ({ nYes: n[0], nNo: n[1], delta, ciLow: delta - 4, ciHigh: delta + 4, label });
const impact = (tag: string, effects: Partial<TagImpact["effects"]>): TagImpact => ({
  tag,
  status: "ok",
  nYes: 6,
  nNo: 8,
  effects: { recovery: none, hrvZ: none, sleepPerf: none, ...effects },
});
const putImpact = async (day: string, impacts: TagImpact[]) => store.putScores({ ...emptyScoreRow(day), journal_impact: { key: "k", impacts } });

beforeEach(async () => {
  store = openMemoryStore();
  await ensureDefaultTags(store);
});

describe("getJournal", () => {
  it("builds the 30-day strip, the day's check-in and the history, newest first", async () => {
    await store.setJournal({ day: TODAY, tag: "alcohol", value: 1 });
    await store.setJournal({ day: TODAY, tag: "sauna", value: 0 });
    await store.setJournal({ day: "2026-10-01", tag: "meditation", value: 0 });
    await store.setJournal({ day: "2026-08-01", tag: "travel", value: 1 }); // outside the 30 days
    const vm = await getJournal(TODAY, ctx());
    expect(vm.strip).toHaveLength(30);
    expect(vm.strip[0].day).toBe(addDays(TODAY, -29));
    expect(vm.strip.filter((s) => s.done).map((s) => s.day)).toEqual(["2026-10-01", TODAY]);
    expect(vm.checkIn).toEqual({ done: true, entries: { alcohol: 1, sauna: 0 }, yes: [{ tag: "alcohol", label: "Alcohol" }] });
    expect(vm.history).toEqual([
      { day: TODAY, yes: ["Alcohol"] },
      { day: "2026-10-01", yes: [] },
    ]);
    expect(vm.teaser).toEqual({ ready: false, text: "Insights appear after 5 days with and 5 without a behaviour." });
  });

  it("reaches back to an older day, and leaves hidden behaviours off the sheet but on History", async () => {
    await store.setJournal({ day: "2026-08-01", tag: "travel", value: 1 });
    await store.updateJournalTags([{ tag: "travel", hidden: true }]);
    const vm = await getJournal("2026-08-01", ctx());
    expect(vm.strip[0]).toEqual({ day: "2026-08-01", done: true });
    expect(vm.tags.some((t) => t.tag === "travel")).toBe(false);
    expect(vm.checkIn.yes).toEqual([{ tag: "travel", label: "Travel" }]);
    expect(vm.tags.find((t) => t.tag === "alcohol")?.group).toBe("evening");
  });

  it("teases the strongest clear Recovery effect from the newest stored impact", async () => {
    await putImpact("2026-09-20", [impact("sauna", { recovery: fx(9, "positive") })]);
    await putImpact("2026-10-02", [impact("meditation", { recovery: fx(2, "no_clear_effect") }), impact("alcohol", { recovery: fx(-11.6, "negative") })]);
    expect((await getJournal(TODAY, ctx())).teaser).toEqual({ ready: true, text: "Your strongest effect so far: alcohol lowers next-day Recovery by 12%." });
  });

  it("finds an impact stored more than two weeks ago", async () => {
    await putImpact("2026-09-01", [impact("sauna", { recovery: fx(9, "positive") })]);
    expect((await getJournal(TODAY, ctx())).teaser.ready).toBe(true);
  });
});

describe("getJournalInsights", () => {
  it("splits clear effects (largest first) from behaviours that need more days, with the arms' averages", async () => {
    const asOf = "2026-10-02";
    await putImpact(asOf, [
      impact("alcohol", { recovery: fx(-12, "negative"), hrvZ: fx(-0.4, "negative") }),
      impact("sauna", { recovery: fx(15, "positive") }),
      impact("meditation", { recovery: fx(1, "no_clear_effect") }),
      impact("travel", {}),
    ]);
    // Alcohol on Sep 30 (Recovery 40 the next day), none on Sep 28 (Recovery 80 the next day).
    await store.setJournal({ day: "2026-09-30", tag: "alcohol", value: 1 });
    await store.setJournal({ day: "2026-09-28", tag: "alcohol", value: 0 });
    const rec = (day: string, value: number) => store.putScores({ ...emptyScoreRow(day), recovery: { value, hrvZ: null } as never });
    await rec("2026-10-01", 40);
    await rec("2026-09-29", 80);
    const vm = await getJournalInsights("recovery", ctx());
    expect(vm.unit).toBe("%");
    expect(vm.items.map((i) => [i.key, i.effect])).toEqual([
      ["sauna", "positive"],
      ["alcohol", "negative"],
      ["meditation", "none"],
    ]);
    expect(vm.items[1]).toMatchObject({ label: "Alcohol", delta: -12, yes: 6, no: 8, ci: [-16, -8], avgWith: 40, avgWithout: 80 });
    expect(vm.needsMore).toEqual([{ key: "travel", label: "Travel", yes: 2, no: 1 }]);
    const hrv = await getJournalInsights("hrv", ctx());
    expect(hrv.unit).toBe("SD");
    expect(hrv.items.map((i) => i.key)).toEqual(["alcohol"]);
  });

  it("is empty before any impact is stored", async () => {
    expect(await getJournalInsights("sleep", ctx())).toEqual({ metric: "sleep", unit: "%", items: [], needsMore: [] });
  });
});
