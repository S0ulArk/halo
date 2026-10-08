// The nutrition targets: protein at 1.6 g per kg of the latest weight (a healthy weight for the height, else 100 g,
// without one), calories at the average burn (2,000 without it), fat and carbs from those, and the person's own numbers.
import { describe, expect, it } from "vitest";
import { calorieTarget, DEFAULT_KCAL, DEFAULT_PROTEIN_G, NO_CUSTOM, parseCustomTargets, parseTarget, progressOf, proteinTarget, resolveTargets, validateTarget } from "./targets";

describe("protein target", () => {
  it("is 1.6 g per kg of the latest weight", () => {
    expect(proteinTarget(72.4, 178)).toEqual({ value: 116, custom: false, basis: "1.6 g per kg at 72.4 kg" });
    expect(proteinTarget(90, null).value).toBe(144);
  });

  it("falls back to a healthy weight for the height, then to 100 g", () => {
    const h = proteinTarget(null, 165);
    expect(h.value).toBe(Math.round(22 * 1.65 ** 2 * 1.6)); // 59.9 kg → 96 g
    expect(h.basis).toContain("165 cm (60 kg)");
    expect(proteinTarget(null, null)).toMatchObject({ value: DEFAULT_PROTEIN_G, custom: false });
    // An implausible reading is no weight.
    expect(proteinTarget(4, null).value).toBe(DEFAULT_PROTEIN_G);
  });
});

describe("calorie target", () => {
  it("is the average burn of the last 14 days, to the nearest 50", () => {
    expect(calorieTarget([2310, 2420, null, 2390])).toMatchObject({ value: 2350, custom: false });
    // Only the last 14 days count; nearly empty days (band off) are left out.
    expect(calorieTarget([...Array(10).fill(4000), ...Array(14).fill(2000), 300]).value).toBe(2000);
  });

  it("needs three days, else uses 2,000", () => {
    expect(calorieTarget([2500, 2600]).value).toBe(DEFAULT_KCAL);
    expect(calorieTarget([]).value).toBe(DEFAULT_KCAL);
  });
});

describe("all targets", () => {
  it("sets fat at 30 % of the calories and carbs from what is left", () => {
    const t = resolveTargets(NO_CUSTOM, { weightKg: 70, heightCm: 175, burned: Array(14).fill(2200) });
    expect(t.kcal.value).toBe(2200);
    expect(t.protein.value).toBe(112);
    expect(t.fat.value).toBe(73);
    expect(t.carbs.value).toBe(Math.round((2200 - 112 * 4 - 73 * 9) / 4));
  });

  it("takes the person's own numbers, and the rest follows them", () => {
    const t = resolveTargets({ kcal: 1800, protein: 150, carbs: null, fat: 50 }, { weightKg: 70, heightCm: null, burned: [] });
    expect(t.kcal).toEqual({ value: 1800, custom: true, basis: "Your target" });
    expect(t.protein.value).toBe(150);
    expect(t.fat.value).toBe(50);
    expect(t.carbs).toMatchObject({ value: Math.round((1800 - 600 - 450) / 4), custom: false });
    // Never a negative carb target.
    expect(resolveTargets({ kcal: 1000, protein: 300, carbs: null, fat: null }, { weightKg: null, heightCm: null, burned: [] }).carbs.value).toBe(0);
  });

  it("measures progress up to full", () => {
    expect(progressOf(58, 116)).toBe(0.5);
    expect(progressOf(200, 116)).toBe(1);
    expect(progressOf(null, 116)).toBeNull();
    expect(progressOf(10, 0)).toBeNull();
  });
});

describe("the person's own targets", () => {
  it("reads a field: blank is Pulse's suggestion, else a whole number in range", () => {
    expect(parseTarget("protein", " ")).toEqual({ value: null, error: null });
    expect(parseTarget("kcal", "2,300")).toEqual({ value: 2300, error: null });
    expect(parseTarget("protein", "120.5")).toEqual({ value: null, error: "Whole numbers only" });
    expect(parseTarget("protein", "lots")).toEqual({ value: null, error: "Enter a number" });
    expect(parseTarget("kcal", "300")).toEqual({ value: null, error: "Between 800 and 8,000 kcal" });
    expect(validateTarget("fat", null)).toBeNull();
  });

  it("reads what was stored tolerantly", () => {
    expect(parseCustomTargets(null)).toEqual(NO_CUSTOM);
    expect(parseCustomTargets("{broken")).toEqual(NO_CUSTOM);
    expect(parseCustomTargets(JSON.stringify({ protein: 140, kcal: 50, fat: "60", carbs: 210 }))).toEqual({ kcal: null, protein: 140, carbs: 210, fat: null });
  });
});
