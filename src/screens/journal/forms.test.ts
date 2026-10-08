// Ported from Pulse's src/app/(app)/journal/CheckIn.test.tsx (changedEntries) plus the Log sheet's form parsing.
import { describe, expect, it } from "vitest";
import { changedEntries, EMPTY, EMPTY_FOOD, foodFormOf, foodItemOf, mealAt, toInput, wallNow, when } from "./forms";

const TZ = "Asia/Kolkata";
const T = Date.parse("2026-10-02T06:05:00Z") / 1000; // Fri Oct 2, 11:35 local

describe("changedEntries", () => {
  it("sends changed answers, and null for a cleared saved answer", () => {
    expect(changedEntries({ alcohol: undefined, sauna: 0, travel: 1, illness: 1 }, { alcohol: 1, sauna: 1, illness: 1 })).toEqual([
      ["alcohol", null],
      ["sauna", false],
      ["travel", true],
    ]);
  });

  it("an unsaved pick cleared again sends nothing", () => {
    expect(changedEntries({ alcohol: undefined }, {})).toEqual([]);
  });
});

describe("toInput", () => {
  it("reads the time field and the amounts", () => {
    expect(toInput("water", { ml: "330" }, "2026-10-02 08:00")).toEqual({ kind: "water", ml: 330, at: "2026-10-02T08:00" });
    expect(toInput("water", { ml: "33.5" }, "2026-10-02 08:00")).toBe("Enter the amount in millilitres.");
    expect(toInput("weight", { kg: "72,4", fat: "" }, "2026-10-02 08:00")).toEqual({ kind: "weight", kg: 72.4, fatPct: null, at: "2026-10-02T08:00" });
    expect(toInput("weight", { kg: "72", fat: "lots" }, "2026-10-02 08:00")).toBe("Body fat is a percentage, as a number.");
  });

  it("asks for the meal, whole calories and numeric macros", () => {
    const food = { ...EMPTY.food, kcal: "600" };
    expect(toInput("food", food, "")).toBe("Choose a meal.");
    expect(toInput("food", { ...food, meal: "LUNCH", kcal: "600.5" }, "")).toBe("Enter calories as a whole number.");
    expect(toInput("food", { ...food, meal: "LUNCH", protein: "x" }, "")).toBe("Macros are grams, as numbers.");
    expect(toInput("food", { ...food, meal: "LUNCH", protein: "20" }, "2026-10-02 12:00")).toEqual({
      kind: "food",
      name: "",
      meal: "LUNCH",
      kcal: 600,
      protein: 20,
      carbs: null,
      fat: null,
      at: "2026-10-02T12:00",
    });
  });

  it("needs a choice on the chip sheets", () => {
    expect(toInput("mood", EMPTY.mood, "")).toBe("Choose how you feel.");
    expect(toInput("mood", { valence: "", moods: ["CALM"] }, "2026-10-02 08:00")).toEqual({ kind: "mood", moods: ["CALM"], valence: null, at: "2026-10-02T08:00" });
    expect(toInput("symptoms", EMPTY.symptoms, "")).toBe("Choose a symptom.");
    expect(toInput("period", { start: "2026-10-01", end: "", flow: "" }, "")).toBe("Choose the first and last day.");
    expect(toInput("ovulation", EMPTY.ovulation, "")).toBe("Choose the result.");
  });
});

describe("wallNow and when", () => {
  it("reads the wall clock in the person's zone", () => {
    expect(wallNow(TZ, T)).toBe("2026-10-02 11:35");
  });

  it("labels today's entries by time and others by day", () => {
    expect(when(T, "2026-10-02", TZ)).toBe("Today, 11:35 AM");
    expect(when(T + 3 * 3600, "2026-10-03", TZ)).toBe("Fri, Oct 2, 2:35 PM");
    expect(when(Date.parse("2026-10-01T18:40:00Z") / 1000, "2026-10-03", TZ)).toBe("Fri, Oct 2, 12:10 AM");
  });
});

describe("the food sheet's fields", () => {
  it("reads one food: whole calories, grams as numbers, portion and fiber only when given", () => {
    expect(foodItemOf({ ...EMPTY_FOOD, name: "Dal", kcal: "230" })).toEqual({ name: "Dal", kcal: 230, protein: null, carbs: null, fat: null });
    expect(foodItemOf({ ...EMPTY_FOOD, name: "Dal", portion: " 1 bowl ", kcal: "230", protein: "12,5", fiber: "8" })).toEqual({
      name: "Dal",
      portion: "1 bowl",
      kcal: 230,
      protein: 12.5,
      carbs: null,
      fat: null,
      fiber: 8,
    });
    expect(foodItemOf({ ...EMPTY_FOOD, kcal: "" })).toBe("Enter calories as a whole number.");
    expect(foodItemOf({ ...EMPTY_FOOD, kcal: "200", fiber: "some" })).toBe("Macros are grams, as numbers.");
  });

  it("shows an estimate or an entry in the fields, unknown grams blank", () => {
    const form = foodFormOf({ name: "Toast", portion: "1 slice", kcal: 80, protein: 4, carbs: 13.8, fat: null, fiber: 1.9 });
    expect(form).toEqual({ name: "Toast", portion: "1 slice", kcal: "80", protein: "4", carbs: "13.8", fat: "", fiber: "1.9" });
    expect(foodItemOf(form)).toEqual({ name: "Toast", portion: "1 slice", kcal: 80, protein: 4, carbs: 13.8, fat: null, fiber: 1.9 });
  });

  it("suggests the meal by the time of day", () => {
    expect(["06:30", "11:15", "16:45", "19:30", "23:40", "02:00"].map(mealAt)).toEqual(["BREAKFAST", "LUNCH", "SNACK", "DINNER", "SNACK", "SNACK"]);
  });

  it("the Log's food form still works through the same reader", () => {
    expect(toInput("food", { ...EMPTY.food, meal: "DINNER", kcal: "500", fiber: "4" }, "2026-10-02 20:00")).toEqual({
      kind: "food",
      name: "",
      meal: "DINNER",
      kcal: 500,
      protein: null,
      carbs: null,
      fat: null,
      fiber: 4,
      at: "2026-10-02T20:00",
    });
  });
});
