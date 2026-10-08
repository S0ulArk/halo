// Food logged in Pulse counts in calories eaten, protein, carbs and fat beside Fitbit's synced totals, and a meal logged
// in both apps counts once: the sums, the matching rules, the day loader every metric reads, and the Nutrition screen.
import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryStore } from "@/data/memory";
import type { LoggedEntryRow, Store } from "@/data/store";
import { emptyMetrics, type Profile } from "@/data/types";
import { addDays } from "@/lib/time";
import { NO_CUSTOM } from "@/nutrition/targets";
import { loadDays } from "./common";
import type { QueryCtx } from "./ctx";
import { dayTotals, duplicates, foodEntry, mealOverlaps, nameWords, nutritionOn, pulseFoodByDay, sameFood, similarNames, sumFood, type FoodData } from "./food";
import { getLog } from "./log";
import { getMetricDetail } from "./metric";
import { averagesOf, getNutrition } from "./nutrition";
import { getTrends } from "./trends";

const TZ = "Asia/Kolkata";
const TODAY = "2026-10-02";
const NOW = Date.parse(`${TODAY}T20:00:00+05:30`) / 1000;
const PROFILE: Profile = { birthDate: "1990-01-01", sex: "male", maxHr: 183, heightCm: 178, timeZone: TZ };

let store: Store;
let ctx: QueryCtx;
beforeEach(() => {
  store = openMemoryStore();
  ctx = { store, profile: PROFILE, timeZone: TZ, today: TODAY, now: NOW, sync: { lastSyncTs: null, firstDay: null, lastError: null } };
});

const at = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00+05:30`) / 1000;
const row = (source: LoggedEntryRow["source"]) => (id: string, day: string, hhmm: string, data: Partial<FoodData>): LoggedEntryRow => ({
  id,
  type: "nutrition-log",
  ts: at(day, hhmm),
  day,
  data: { name: null, meal: "LUNCH", kcal: 0, protein: null, carbs: null, fat: null, ...data },
  createdAt: at(day, hhmm),
  source,
});
const pulse = row("pulse");
const fitbit = row("health_connect");
const entry = (r: LoggedEntryRow) => foodEntry(r)!;
/** What the Health Connect sync writes for a day of Fitbit food: the roll-up and the entries behind it. */
async function syncFitbit(day: string, rows: LoggedEntryRow[]) {
  const t = sumFood(rows.map(entry));
  await store.upsertDailyValues([
    { day, key: "calories_in", value: t.kcal ?? 0 },
    ...(t.protein !== null ? [{ day, key: "protein", value: t.protein }] : []),
    ...(t.carbs !== null ? [{ day, key: "carbs", value: t.carbs }] : []),
    ...(t.fat !== null ? [{ day, key: "fat", value: t.fat }] : []),
  ]);
  await store.replaceExternalEntries({ from: day, to: day }, rows);
}

describe("sums", () => {
  it("adds each nutrient; one no entry gave stays unknown, never zero", () => {
    const t = sumFood([pulse("a", TODAY, "08:00", { kcal: 300, protein: 20 }), pulse("b", TODAY, "13:00", { kcal: 200, protein: 10.25, fat: 5, fiber: 3 })].map(entry));
    expect(t).toEqual({ kcal: 500, protein: 30.3, carbs: null, fat: 5, fiber: 3 });
    expect(sumFood([])).toEqual({ kcal: null, protein: null, carbs: null, fat: null, fiber: null });
  });

  it("reads stored food tolerantly: other types and broken data are not food", () => {
    expect(foodEntry({ ...pulse("a", TODAY, "08:00", {}), type: "hydration-log" })).toBeNull();
    expect(foodEntry({ ...pulse("a", TODAY, "08:00", {}), data: { kcal: "lots" } })).toBeNull();
    expect(foodEntry(pulse("a", TODAY, "08:00", { kcal: 120, protein: -3, name: "  ", portion: " 1 cup ", via: "photo" }))?.data).toEqual({
      name: null,
      meal: "LUNCH",
      kcal: 120,
      protein: null,
      carbs: null,
      fat: null,
      portion: "1 cup",
      via: "photo",
    });
  });
});

describe("one food, two names", () => {
  it("reads the words that name the food", () => {
    expect([...nameWords("2 large eggs (100 g), scrambled")]).toEqual(["eggs", "scrambled"]);
  });

  it("matches a name inside another, plurals, and word order", () => {
    expect(similarNames("Scrambled eggs", "Egg")).toBe(true);
    expect(similarNames("Dal tadka", "Tadka dal (1 bowl)")).toBe(true);
    expect(similarNames("Masala dosa", "Dosa, masala")).toBe(true);
    expect(similarNames("Mixed berries", "Berry")).toBe(true);
    expect(similarNames("Tomatoes", "Tomato soup")).toBe(true);
  });

  it("keeps different foods apart", () => {
    expect(similarNames("Chicken biryani", "Chicken curry")).toBe(false);
    expect(similarNames("Apple", "Banana")).toBe(false);
    expect(similarNames(null, "Banana")).toBe(false);
    expect(similarNames("1 bowl", "2 cups")).toBe(false);
  });
});

describe("a meal logged in both apps", () => {
  it("is the same food when the meal agrees and the name does, whatever the calories", () => {
    const p = entry(pulse("p", TODAY, "13:10", { name: "Grilled chicken salad", kcal: 550 }));
    expect(sameFood(p, entry(fitbit("f", TODAY, "12:00", { name: "Chicken salad", kcal: 600 })))).toBe(true);
    // Another meal, another day: another food.
    expect(sameFood(p, entry(fitbit("f", TODAY, "12:00", { name: "Chicken salad", meal: "DINNER", kcal: 600 })))).toBe(false);
    expect(sameFood(p, entry(fitbit("f", "2026-10-01", "12:00", { name: "Chicken salad", kcal: 600 })))).toBe(false);
  });

  it("is the same food by calories only within the hour and a half, within 5 %", () => {
    const p = entry(pulse("p", TODAY, "13:10", { kcal: 702 }));
    expect(sameFood(p, entry(fitbit("f", TODAY, "12:45", { name: "Rajma chawal", kcal: 700 })))).toBe(true);
    expect(sameFood(p, entry(fitbit("f", TODAY, "11:00", { name: "Rajma chawal", kcal: 700 })))).toBe(false);
    expect(sameFood(p, entry(fitbit("f", TODAY, "12:45", { name: "Rajma chawal", kcal: 600 })))).toBe(false);
  });

  it("with no meal from Fitbit, it must be within three hours", () => {
    const p = entry(pulse("p", TODAY, "08:00", { name: "Eggs", meal: "BREAKFAST", kcal: 150 }));
    expect(sameFood(p, entry(fitbit("f", TODAY, "09:30", { name: "Boiled eggs", meal: "UNKNOWN", kcal: 140 })))).toBe(true);
    expect(sameFood(p, entry(fitbit("f", TODAY, "20:00", { name: "Boiled eggs", meal: "UNKNOWN", kcal: 140 })))).toBe(false);
  });

  it("pairs each Fitbit entry with one Pulse entry at most, the nearest", () => {
    const es = [
      fitbit("f", TODAY, "16:30", { name: "Banana", meal: "SNACK", kcal: 105 }),
      pulse("p1", TODAY, "10:00", { name: "Banana", meal: "SNACK", kcal: 105 }),
      pulse("p2", TODAY, "16:00", { name: "Bananas", meal: "SNACK", kcal: 105 }),
    ].map(entry);
    expect([...duplicates(es)]).toEqual([["p2", "f"]]);
  });

  it("never pairs a Pulse entry the person marked as its own food, and asks nothing about it", async () => {
    const es = [
      fitbit("f", TODAY, "13:00", { name: "Paneer butter masala", kcal: 450 }),
      pulse("p", TODAY, "13:05", { name: "Paneer", kcal: 300, separate: true }),
    ].map(entry);
    expect(duplicates(es).size).toBe(0);
    expect(mealOverlaps(es, new Map())).toEqual([]);
    // Without the mark the two read as one food, logged twice.
    expect([...duplicates(es.map((e) => ({ ...e, data: { ...e.data, separate: undefined } })))]).toEqual([["p", "f"]]);
    await syncFitbit(TODAY, [fitbit("f", TODAY, "13:00", { name: "Paneer butter masala", kcal: 450 })]);
    await store.addLoggedEntries([pulse("p", TODAY, "13:05", { name: "Paneer", kcal: 300, separate: true })]);
    expect(await nutritionOn(store, TODAY, TZ)).toMatchObject({ kcal: 750 });
  });

  it("flags a meal both apps logged under names that don't match", () => {
    const es = [
      fitbit("f1", TODAY, "12:30", { name: "Chicken roll", kcal: 420 }),
      pulse("p1", TODAY, "13:00", { name: "Paneer wrap", kcal: 380 }),
      fitbit("f2", TODAY, "08:00", { name: "Oats", meal: "BREAKFAST", kcal: 300 }),
      pulse("p2", TODAY, "08:10", { name: "Oatmeal with oats", meal: "BREAKFAST", kcal: 320 }),
    ].map(entry);
    const dup = duplicates(es);
    expect([...dup]).toEqual([["p2", "f2"]]);
    expect(mealOverlaps(es, dup)).toEqual(["LUNCH"]);
  });
});

describe("Pulse's food in the day's totals", () => {
  const D = "2026-10-01";

  it("adds to Fitbit's synced totals, a repeated meal once", async () => {
    await syncFitbit(D, [fitbit("hc-1", D, "12:30", { name: "Chicken salad", kcal: 600, protein: 30, carbs: 20, fat: 35 })]);
    await store.addLoggedEntries([
      pulse("p-1", D, "13:00", { name: "Grilled chicken salad", kcal: 550, protein: 35, carbs: 18, fat: 30 }),
      pulse("p-2", D, "08:00", { name: "Oats", meal: "BREAKFAST", kcal: 300, protein: 10.5, carbs: 54, fat: 6, fiber: 8 }),
    ]);
    const rows = await loadDays(ctx, D, TODAY);
    expect(rows.get(D)!.extra).toMatchObject({ calories_in: 900, protein: 40.5, carbs: 74, fat: 41 });
    expect(await nutritionOn(store, D, TZ)).toEqual({ kcal: 900, protein: 40.5, carbs: 74, fat: 41, fiber: 8 });
  });

  it("makes a day of its own where only Pulse logged, leaving out nutrients nobody gave", async () => {
    await store.addLoggedEntries([pulse("p-1", D, "20:00", { name: "Pizza", meal: "DINNER", kcal: 800, fat: 32 })]);
    const extra = (await loadDays(ctx, D, D)).get(D)!.extra;
    expect(extra).toEqual({ calories_in: 800, fat: 32 });
    expect(extra.protein).toBeUndefined();
  });

  it("leaves Fitbit's own entries to the roll-up (never added twice) and other days alone", async () => {
    await syncFitbit(D, [fitbit("hc-1", D, "12:30", { name: "Thali", kcal: 900, protein: 25 })]);
    await store.addLoggedEntries([pulse("p-1", addDays(D, -1), "12:00", { name: "Thali", kcal: 850, protein: 22 })]);
    const rows = await loadDays(ctx, addDays(D, -1), D);
    expect(rows.get(D)!.extra).toMatchObject({ calories_in: 900, protein: 25 });
    expect(rows.get(addDays(D, -1))!.extra).toMatchObject({ calories_in: 850, protein: 22 });
    expect(pulseFoodByDay(await store.loggedEntries(0, 1000), D, D).size).toBe(0);
  });

  it("feeds the metric screens, Trends and the Log's food total", async () => {
    await syncFitbit(TODAY, [fitbit("hc-1", TODAY, "08:30", { name: "Poha", meal: "BREAKFAST", kcal: 350, protein: 7 })]);
    await store.addLoggedEntries([pulse("p-1", TODAY, "13:00", { name: "Egg curry", kcal: 420, protein: 21, carbs: 12, fat: 28 })]);
    const protein = await getMetricDetail("protein", TODAY, ctx);
    expect(protein.value).toMatchObject({ value: 28 });
    const listed = protein.sections.find((s) => s.kind === "entries");
    expect(listed && "items" in listed ? listed.items.map((i) => i.title) : []).toEqual(["Poha", "Egg curry"]);
    const kcal = await getTrends("calories_in", ctx);
    expect(kcal.points.value?.at(-1)).toMatchObject({ day: TODAY, value: 770, provisional: true });
    expect((await getLog(ctx)).foodToday).toEqual({ kcal: 770, protein: 28 });
  });

  it("counts a day as dayTotals does from rows alone", () => {
    const rows = [fitbit("hc-1", D, "12:30", { name: "Rice", kcal: 200, carbs: 45 }), pulse("p-1", D, "12:40", { name: "Fried rice", kcal: 260, carbs: 50 })];
    expect(dayTotals([{ day: D, key: "calories_in", value: 200 }, { day: D, key: "carbs", value: 45 }], rows, D)).toEqual({ kcal: 200, protein: null, carbs: 45, fat: null, fiber: null });
  });
});

describe("Nutrition overview", () => {
  it("averages the days with food logged before today", () => {
    const day = (kcal?: number, protein?: number) => ({ extra: { ...(kcal !== undefined && { calories_in: kcal }), ...(protein !== undefined && { protein }) } }) as never;
    expect(averagesOf([day(2000, 80), day(), day(1600), undefined, day(1801, 100)], 5)).toEqual({ kcal: 1800, protein: 90, carbs: null, fat: null, days: 3, span: 5 });
  });

  it("puts today's totals against the targets, with the averages, the chart and today's food by meal", async () => {
    // Fourteen days of burn (2,400 a day), a weight logged in Pulse, a week of food (2,000 kcal and 100 g protein a day).
    await store.upsertMetrics(Array.from({ length: 14 }, (_, k) => ({ ...emptyMetrics(addDays(TODAY, -1 - k)), calories: 2400 })));
    await store.addLoggedEntries([{ id: "w-1", type: "weight", ts: at("2026-09-20", "07:00"), day: "2026-09-20", data: { kg: 80 }, createdAt: 0, source: "pulse" }]);
    for (let k = 1; k <= 7; k++) {
      const d = addDays(TODAY, -k);
      await store.addLoggedEntries([pulse(`p-${k}`, d, "13:00", { name: "Meal", kcal: 2000, protein: 100, carbs: 250, fat: 60 })]);
    }
    // Today: Fitbit's breakfast, Pulse's repeat of it, Pulse's lunch from a photo.
    await syncFitbit(TODAY, [fitbit("hc-b", TODAY, "08:00", { name: "Idli sambar", meal: "BREAKFAST", kcal: 320, protein: 11 })]);
    await store.addLoggedEntries([
      pulse("t-1", TODAY, "08:05", { name: "Idli with sambar", meal: "BREAKFAST", kcal: 300, protein: 10 }),
      pulse("t-2", TODAY, "13:00", { name: "Paneer tikka", portion: "6 pieces (180 g)", kcal: 480, protein: 32, carbs: 12, fat: 33, fiber: 3, via: "photo" }),
    ]);

    const vm = await getNutrition(ctx, NO_CUSTOM);
    expect(vm.totals).toEqual({ kcal: 800, protein: 43, carbs: 12, fat: 33, fiber: 3 });
    expect(vm.targets.protein).toMatchObject({ value: 128, custom: false });
    expect(vm.targets.kcal).toMatchObject({ value: 2400, custom: false });
    expect(vm.targets.fat.value).toBe(80);
    expect(vm.targets.carbs.value).toBe(292);
    expect(vm.week).toEqual({ kcal: 2000, protein: 100, carbs: 250, fat: 60, days: 7, span: 7 });
    expect(vm.month).toMatchObject({ kcal: 2000, days: 7, span: 30 });
    expect(vm.history).toHaveLength(30);
    expect(vm.history.at(-1)).toEqual({ day: TODAY, kcal: 800, protein: 43, provisional: true });
    expect(vm.history.at(-2)).toEqual({ day: addDays(TODAY, -1), kcal: 2000, protein: 100 });
    expect(vm.meals.map((m) => [m.label, m.kcal, m.items.map((i) => [i.title, i.source, i.duplicateOf])])).toEqual([
      ["Breakfast", 320, [["Idli sambar", "health_connect", null], ["Idli with sambar", "pulse", "hc-b"]]],
      ["Lunch", 480, [["Paneer tikka", "pulse", null]]],
    ]);
    expect(vm.meals[1].items[0]).toMatchObject({ portion: "6 pieces (180 g)", fiber: 3, via: "photo" });
    expect(vm.unlisted).toBeNull();
    expect(vm.pulseToday).toBe(2);

    const own = await getNutrition(ctx, { kcal: 2200, protein: 150, carbs: null, fat: null });
    expect(own.targets.protein).toEqual({ value: 150, custom: true, basis: "Your target" });
    expect(own.targets.carbs.value).toBe(Math.round((2200 - 150 * 4 - 73 * 9) / 4));
  });

  it("shows what a Google account's totals hold beyond the listed entries", async () => {
    await store.upsertDailyValues([
      { day: TODAY, key: "calories_in", value: 650 },
      { day: TODAY, key: "protein", value: 30 },
    ]);
    await store.addLoggedEntries([pulse("t-1", TODAY, "13:00", { name: "Soup", kcal: 150, protein: 6 })]);
    const vm = await getNutrition(ctx, NO_CUSTOM);
    expect(vm.totals).toMatchObject({ kcal: 800, protein: 36 });
    expect(vm.unlisted).toEqual({ kcal: 650, protein: 30, carbs: null, fat: null, fiber: null });
  });

  it("is empty but sound before anything is logged", async () => {
    const vm = await getNutrition(ctx, NO_CUSTOM);
    expect(vm.totals).toEqual({ kcal: null, protein: null, carbs: null, fat: null, fiber: null });
    expect(vm.meals).toEqual([]);
    expect(vm.week).toMatchObject({ kcal: null, days: 0 });
    expect(vm.targets.kcal.value).toBe(2000);
    // No weight: a healthy weight for the profile's 178 cm.
    expect(vm.targets.protein.value).toBe(Math.round(22 * 1.78 ** 2 * 1.6));
  });
});
