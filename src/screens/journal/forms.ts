// The check-in and log sheets' form logic, ported from the web's CheckIn.tsx and Log.tsx. Plain TypeScript (no React
// Native) so the tests run in node.
import { DAY, formatDay } from "@/lib/format";
import { wall } from "@/lib/time";
import type { LogKind, Meal } from "@/queries/log";
import type { FoodItemInput, LogInput } from "./actions";

export type Values = Record<string, number | undefined>;

/**
 * The answers Save writes: each tag whose value differs from the saved one, as yes/no, or null where a
 * saved answer was cleared (it is deleted, so it reads as "not answered", not "no").
 */
export function changedEntries(values: Values, saved: Record<string, number>): [string, boolean | null][] {
  return Object.entries(values)
    .filter(([t, v]) => v !== saved[t])
    .map(([t, v]) => [t, v === undefined ? null : v > 0]);
}

/** The wall clock now in `timeZone`, as `YYYY-MM-DD HH:mm` (the web's datetime-local value, with a space). */
export const wallNow = (timeZone: string, nowS = Math.floor(Date.now() / 1000)) => {
  const w = wall(nowS, timeZone);
  return `${w.day} ${w.time.slice(0, 5)}`;
};

/** "2:05 PM": en-US's numeric hour and 2-digit minute, by hand (Hermes' 12-hour Intl output varies by device). */
const clock12 = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
};

/** "Today, 2:05 PM" or "Mon, Sep 28, 2:05 PM". */
export const when = (ts: number, today: string, timeZone: string) => {
  const w = wall(ts, timeZone);
  const time = clock12(w.time);
  if (w.day === today) return `Today, ${time}`;
  return `${formatDay(w.day, DAY.short)}, ${time}`;
};

const NUM = /^\d+([.,]\d+)?$/;
/** A typed number: null when blank, NaN when not a number. */
export const num = (s: string) => (s.trim() === "" ? null : NUM.test(s.trim()) ? Number(s.trim().replace(",", ".")) : NaN);

export type Form = Record<string, string | string[]>;
export const EMPTY: Record<LogKind, Form> = {
  water: { ml: "" },
  food: { name: "", meal: "", kcal: "", protein: "", carbs: "", fat: "" },
  weight: { kg: "", fat: "" },
  spo2: { pct: "" },
  mood: { valence: "", moods: [] },
  symptoms: { symptoms: [] },
  period: { start: "", end: "", flow: "" },
  ovulation: { result: "" },
};

/** The time field's text as the action's `at` ("2026-10-02 08:00" → "2026-10-02T08:00"). */
export const atOf = (s: string) => s.trim().replace(/\s+/, "T");

/** One food's fields as typed (the food sheet's form, and each food of an estimate under review). */
export type FoodForm = { name: string; portion: string; kcal: string; protein: string; carbs: string; fat: string; fiber: string };
export const EMPTY_FOOD: FoodForm = { name: "", portion: "", kcal: "", protein: "", carbs: "", fat: "", fiber: "" };

/** One food's fields as the action's item (portion and fiber only when given), or the first problem to show. */
export function foodItemOf(f: FoodForm): FoodItemInput | string {
  const kcal = num(f.kcal);
  if (kcal == null || Number.isNaN(kcal) || !Number.isInteger(kcal)) return "Enter calories as a whole number.";
  const [protein, carbs, fat, fiber] = [f.protein, f.carbs, f.fat, f.fiber].map(num);
  if ([protein, carbs, fat, fiber].some((g) => Number.isNaN(g))) return "Macros are grams, as numbers.";
  const portion = f.portion.trim();
  return { name: f.name, ...(portion && { portion }), kcal, protein, carbs, fat, ...(fiber !== null && { fiber }) };
}

/** A food's numbers as its fields show them: an estimate to review, an entry to edit. Unknown grams stay blank. */
export function foodFormOf(v: { name: string | null; portion?: string | null; kcal: number; protein: number | null; carbs: number | null; fat: number | null; fiber?: number | null }): FoodForm {
  const g = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  return { name: v.name ?? "", portion: v.portion ?? "", kcal: String(v.kcal), protein: g(v.protein), carbs: g(v.carbs), fat: g(v.fat), fiber: g(v.fiber) };
}

/** The meal a time of day suggests ("HH:mm"): breakfast before 11, lunch before 4 pm, a snack before 6, dinner before 11 pm. */
export function mealAt(hhmm: string): Meal {
  const h = Number(hhmm.slice(0, 2));
  if (!(h >= 4) || h >= 23) return "SNACK";
  if (h < 11) return "BREAKFAST";
  if (h < 16) return "LUNCH";
  if (h < 18) return "SNACK";
  return "DINNER";
}

/** The form's values as the action's input, or the first problem to show. */
export function toInput(kind: LogKind, f: Form, time: string): LogInput | string {
  const s = (k: string) => f[k] as string;
  const a = (k: string) => f[k] as string[];
  const at = atOf(time);
  switch (kind) {
    case "water": {
      const ml = num(s("ml"));
      return ml && Number.isInteger(ml) ? { kind, ml, at } : "Enter the amount in millilitres.";
    }
    case "food": {
      if (!s("meal")) return "Choose a meal.";
      const item = foodItemOf({ ...EMPTY_FOOD, ...(f as Partial<FoodForm>) });
      return typeof item === "string" ? item : { kind, meal: s("meal") as never, ...item, at };
    }
    case "weight": {
      const kg = num(s("kg"));
      const fatPct = num(s("fat"));
      if (kg == null || Number.isNaN(kg)) return "Enter your weight in kilograms.";
      if (Number.isNaN(fatPct)) return "Body fat is a percentage, as a number.";
      return { kind, kg, fatPct, at };
    }
    case "spo2": {
      const pct = num(s("pct"));
      return pct == null || Number.isNaN(pct) ? "Enter blood oxygen as a percentage, e.g. 95." : { kind, pct, at };
    }
    case "mood":
      return a("moods").length ? { kind, moods: a("moods") as never, valence: (s("valence") || null) as never, at } : "Choose how you feel.";
    case "symptoms":
      return a("symptoms").length ? { kind, symptoms: a("symptoms") as never, at } : "Choose a symptom.";
    case "period":
      if (!s("start").trim() || !s("end").trim()) return "Choose the first and last day.";
      return { kind, start: s("start").trim(), end: s("end").trim(), flow: (s("flow") || null) as never };
    case "ovulation":
      return s("result") ? { kind, result: s("result") as never, at } : "Choose the result.";
  }
}
