// Your data's exports and Settings' profile, on the in-memory Store.
import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { emptyMetrics, type Profile } from "@/data/types";
import type { QueryCtx } from "./ctx";
import { dailyTable, exportFile, getMore, getSettings, getYourData, journalTable, toCsv } from "./settings";
import { TREND_METRICS } from "./trends";

const PROFILE: Profile = { birthDate: "1990-06-15", sex: "female", maxHr: null, heightCm: 168, timeZone: "Asia/Kolkata" };
const ctxOf = (store: MemoryStore, profile = PROFILE): QueryCtx => ({
  store,
  profile,
  timeZone: profile.timeZone,
  today: "2026-10-07",
  now: Date.parse("2026-10-07T12:00:00Z") / 1000,
  sync: { lastSyncTs: null, firstDay: null, lastError: null },
});

describe("toCsv", () => {
  it("quotes, escapes and defuses formulas like the web export", () => {
    const csv = toCsv({ columns: ["day", "label", "n"], rows: [["2026-10-01", 'say "hi", ok', 1], ["2026-10-02", "=SUM(A1)", null]] });
    expect(csv).toBe('day,label,n\r\n2026-10-01,"say ""hi"", ok",1\r\n2026-10-02,\'=SUM(A1),\r\n');
  });
});

describe("exports", () => {
  it("daily: the web's columns, one row per day from the first day, partial-today metrics blank", async () => {
    const store = new MemoryStore();
    await store.setSyncState({ firstDay: "2026-10-05" });
    await store.upsertMetrics([{ ...emptyMetrics("2026-10-07"), steps: 4321, hrvMs: 55.44 }]);
    const t = await dailyTable({ ...ctxOf(store), sync: await store.getSyncState() });
    expect(t.columns).toEqual(["day", ...TREND_METRICS.map((m) => m.column)]);
    expect(t.rows.map((r) => r[0])).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    const today = Object.fromEntries(t.columns.map((c, i) => [c, t.rows[2][i]]));
    expect(today.hrv_ms).toBe(55.4);
    expect(today.steps).toBeNull();
  });

  it("journal: labels from the behaviour list, sorted by day then tag", async () => {
    const store = new MemoryStore();
    await store.setJournal({ day: "2026-10-02", tag: "sauna", value: 1 });
    await store.setJournal({ day: "2026-10-01", tag: "cold_plunge", value: 0 });
    await store.setJournal({ day: "2026-10-01", tag: "alcohol", value: 2 });
    const t = await journalTable(ctxOf(store));
    expect(t.rows).toEqual([
      ["2026-10-01", "alcohol", "Alcohol", 2],
      ["2026-10-01", "cold_plunge", "cold_plunge", 0],
      ["2026-10-02", "sauna", "Sauna", 1],
    ]);
    const json = JSON.parse((await exportFile(ctxOf(store), "journal", "json")).body);
    expect(json.entries[0]).toEqual({ day: "2026-10-01", behaviour: "alcohol", label: "Alcohol", answer: 2 });
    expect(json.behaviours).toHaveLength(9);
    expect(json.behaviours[0]).toEqual({ tag: "alcohol", label: "Alcohol", custom: false, hidden: false });
    const f = await exportFile(ctxOf(store), "daily", "csv");
    expect(f.name).toBe("halo-daily-2026-10-07.csv");
    expect(f.mimeType).toBe("text/csv");
  });
});

describe("settings and more", () => {
  it("profile: age on today, Tanaka max HR when none is set", async () => {
    const vm = await getSettings(ctxOf(new MemoryStore()));
    expect(vm.profile).toMatchObject({ age: 36, maxHr: 183, maxHrSource: "estimated", heightCm: 168, timeZone: "Asia/Kolkata" });
    const own = await getSettings(ctxOf(new MemoryStore(), { ...PROFILE, maxHr: 191 }));
    expect(own.profile).toMatchObject({ maxHr: 191, maxHrSource: "set" });
  });

  it("more and your data count what is stored", async () => {
    const store = new MemoryStore();
    await store.setJournal({ day: "2026-10-01", tag: "alcohol", value: 1 });
    const more = await getMore(ctxOf(store), "demo");
    expect(more).toMatchObject({ reportCount: 0, behaviours: { shown: 9, total: 9 }, mode: "demo" });
    expect(await getYourData(ctxOf(store))).toMatchObject({ first: null, days: 0, answers: 1 });
  });
});
