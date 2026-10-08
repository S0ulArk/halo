// Food logged in Pulse's Journal and food read from Health Connect (logged in Fitbit): what a day adds up to, and which
// of Pulse's entries repeat a meal Fitbit already counts. Pure over logged rows (plus one Store read in nutritionOn), so
// the day loader (common.ts), the Nutrition screen (nutrition.ts), the Log and the tests share one rule.
//
// Counting: the source's daily roll-up (`daily_values` calories_in / protein / carbs / fat, the sync's sum of Health
// Connect's nutrition records, Fitbit's included) already holds every Fitbit entry, so only Pulse's own entries are
// added to it, the way water is. Pulse never writes to Health Connect, so its entries can't be in the roll-up; the one
// way a meal counts twice is the person logging it in both apps. A Pulse entry that matches a Fitbit entry of the same
// day (same meal, and the same food by name, or the same calories within the hour and a half) is that meal logged
// twice: Fitbit's stays counted, Pulse's is left out of every total and shown as such.
import type { DailyValue } from "@/data/types";
import type { EntrySource, LoggedEntryRow, Store } from "@/data/store";
import { localMidnight } from "@/lib/time";
import type { ExtraKey } from "./_lib";
import type { Meal } from "./log";

/** How a Pulse entry was made: estimated from a photo or a description, or typed in. */
export type FoodVia = "photo" | "text" | "manual";

/**
 * A food log entry's data (LogData["nutrition-log"]). Entries read from Health Connect carry the first six fields;
 * Pulse's may add the portion, fiber and how they were made. A nutrient left out is null: unknown, never zero.
 */
export type FoodData = {
  name: string | null;
  meal: Meal | "UNKNOWN";
  kcal: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  portion?: string | null;
  fiber?: number | null;
  via?: FoodVia;
  /** The person said this isn't the Fitbit entry it matched ("Count it too"): always counted, never paired. */
  separate?: true;
};

/** A food log row, its data checked. */
export type FoodEntry = { id: string; ts: number; day: string; source: EntrySource; data: FoodData };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const grams = (v: unknown) => (finite(v) && v >= 0 ? v : null);
const MEAL_KEYS = new Set(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]);
const VIAS = new Set(["photo", "text", "manual"]);

/** A logged row as a food entry, or null when it is another type (or food data too broken to count). */
export function foodEntry(r: LoggedEntryRow): FoodEntry | null {
  if (r.type !== "nutrition-log") return null;
  const d = r.data as Partial<Record<keyof FoodData, unknown>> | null;
  if (!d || typeof d !== "object" || !finite(d.kcal) || d.kcal < 0) return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const data: FoodData = {
    name: text(d.name),
    meal: typeof d.meal === "string" && MEAL_KEYS.has(d.meal) ? (d.meal as Meal) : "UNKNOWN",
    kcal: d.kcal,
    protein: grams(d.protein),
    carbs: grams(d.carbs),
    fat: grams(d.fat),
  };
  const portion = text(d.portion);
  const fiber = grams(d.fiber);
  if (portion) data.portion = portion;
  if (fiber !== null) data.fiber = fiber;
  if (typeof d.via === "string" && VIAS.has(d.via)) data.via = d.via as FoodVia;
  if (d.separate === true) data.separate = true;
  return { id: r.id, ts: r.ts, day: r.day, source: r.source, data };
}

// ── Sums ────────────────────────────────────────────────────────────────────

export const NUTRIENTS = ["kcal", "protein", "carbs", "fat", "fiber"] as const;
export type Nutrient = (typeof NUTRIENTS)[number];
/** A sum per nutrient; null where no entry gave that nutrient (unknown, not zero). */
export type Totals = Record<Nutrient, number | null>;

export const EMPTY_TOTALS: Totals = { kcal: null, protein: null, carbs: null, fat: null, fiber: null };

/** kcal to the whole number, grams to one decimal, as the importer rounds them. */
export const roundNutrient = (k: Nutrient, v: number) => (k === "kcal" ? Math.round(v) : Math.round(v * 10) / 10);

/** What the entries add up to. */
export function sumFood(entries: FoodEntry[]): Totals {
  const t: Totals = { ...EMPTY_TOTALS };
  for (const e of entries) {
    for (const k of NUTRIENTS) {
      const v = e.data[k];
      if (finite(v)) t[k] = (t[k] ?? 0) + v;
    }
  }
  for (const k of NUTRIENTS) if (t[k] !== null) t[k] = roundNutrient(k, t[k]);
  return t;
}

// ── One meal, logged twice ──────────────────────────────────────────────────

/** Words that say nothing about which food it is: amounts, units, sizes and fillers. */
const NOISE = new Set([
  "a", "an", "and", "the", "with", "of", "in", "on", "or", "plus", "some", "w", "x",
  "g", "gm", "gms", "gram", "grams", "kg", "ml", "l", "oz", "cup", "cups", "tbsp", "tsp", "slice", "slices", "piece", "pieces", "pc", "pcs",
  "bowl", "bowls", "plate", "plates", "glass", "glasses", "serving", "servings", "portion", "small", "medium", "large", "half",
]);

/** A food name as the words that name the food: lower case, without amounts, units or fillers. */
export function nameWords(name: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!name) return out;
  for (const w of name.toLowerCase().split(/[\s,.;:!?()[\]{}"'’`/\\&+*|•·–—-]+/)) {
    if (!w || NOISE.has(w) || /^\d+([.,]\d+)?[a-z]{0,4}$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

/** One word, singular or plural: "egg" and "eggs", "tomato" and "tomatoes", "berry" and "berries". */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return l === `${s}s` || l === `${s}es` || (s.endsWith("y") && l === `${s.slice(0, -1)}ies`);
}

/** Two names for one food: one's words hold the other's ("Eggs" and "Scrambled eggs"), or half their words are shared. */
export function similarNames(a: string | null | undefined, b: string | null | undefined): boolean {
  const A = [...nameWords(a)];
  const B = [...nameWords(b)];
  if (!A.length || !B.length) return false;
  const shared = A.filter((w) => B.some((v) => sameWord(w, v))).length;
  if (!shared) return false;
  return shared === Math.min(A.length, B.length) || shared / (A.length + B.length - shared) >= 0.5;
}

/** A Fitbit entry with no meal can be the same food as a Pulse one logged this close to it. */
export const NEAR_S = 3 * 3600;
/** Same calories (within 5 %, or 10 kcal) count as the same food only this close in time. */
export const CLOSE_S = 90 * 60;
const sameKcal = (a: number, b: number) => Math.abs(a - b) <= Math.max(10, 0.05 * Math.max(a, b));

/**
 * Whether Pulse's entry `p` and Fitbit's `f` are one food logged in both apps: the same day, the same meal (or Fitbit
 * didn't name one and they are within NEAR_S), and the same food by name, or the same calories within CLOSE_S.
 */
export function sameFood(p: FoodEntry, f: FoodEntry): boolean {
  if (p.day !== f.day || p.data.separate) return false;
  const named = p.data.meal !== "UNKNOWN" && f.data.meal !== "UNKNOWN";
  if (named && p.data.meal !== f.data.meal) return false;
  const gap = Math.abs(p.ts - f.ts);
  if (!named && gap > NEAR_S) return false;
  if (similarNames(p.data.name, f.data.name)) return true;
  return gap <= CLOSE_S && sameKcal(p.data.kcal, f.data.kcal);
}

/**
 * Pulse's entries that repeat a Fitbit entry, as Pulse id → Fitbit id. Each Fitbit entry stands for one Pulse entry at
 * most (two bananas logged in Pulse against one in Fitbit leave one counted): the closest pairs are made first, a
 * name match before a calorie match, then the nearest in time.
 */
export function duplicates(entries: FoodEntry[]): Map<string, string> {
  const out = new Map<string, string>();
  const fitbit = entries.filter((e) => e.source !== "pulse");
  if (!fitbit.length) return out;
  const pairs: { p: string; f: string; score: number }[] = [];
  for (const p of entries) {
    if (p.source !== "pulse") continue;
    for (const f of fitbit) {
      if (sameFood(p, f)) pairs.push({ p: p.id, f: f.id, score: (similarNames(p.data.name, f.data.name) ? 0 : 1e9) + Math.abs(p.ts - f.ts) });
    }
  }
  pairs.sort((a, b) => a.score - b.score || a.p.localeCompare(b.p) || a.f.localeCompare(b.f));
  const taken = new Set<string>();
  for (const { p, f } of pairs) {
    if (out.has(p) || taken.has(f)) continue;
    out.set(p, f);
    taken.add(f);
  }
  return out;
}

/**
 * Named meals of one day with entries from both Pulse and Fitbit that didn't match each other: maybe one meal logged
 * twice under different names. Pulse can't tell, so the Nutrition screen asks.
 */
export function mealOverlaps(entries: FoodEntry[], dup: Map<string, string>): Meal[] {
  const matched = new Set([...dup.keys(), ...dup.values()]);
  const out: Meal[] = [];
  for (const meal of ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const) {
    // A Pulse entry the person marked as its own food has been answered for.
    const left = entries.filter((e) => e.data.meal === meal && !matched.has(e.id) && !e.data.separate);
    if (left.some((e) => e.source === "pulse") && left.some((e) => e.source !== "pulse")) out.push(meal);
  }
  return out;
}

// ── What Pulse adds to a day ────────────────────────────────────────────────

/** The extra-metric keys food feeds, and the nutrient behind each. */
export const FOOD_KEYS = [
  ["calories_in", "kcal"],
  ["protein", "protein"],
  ["carbs", "carbs"],
  ["fat", "fat"],
] as const satisfies readonly (readonly [ExtraKey, Nutrient])[];
export type FoodKey = (typeof FOOD_KEYS)[number][0];
export type FoodExtras = Partial<Record<FoodKey, number>>;

/** Each day's food entries, in [from, to]. */
function byDay(rows: LoggedEntryRow[], from: string, to: string): Map<string, FoodEntry[]> {
  const out = new Map<string, FoodEntry[]>();
  for (const r of rows) {
    if (r.day < from || r.day > to) continue;
    const e = foodEntry(r);
    if (!e) continue;
    const list = out.get(e.day);
    if (list) list.push(e);
    else out.set(e.day, [e]);
  }
  return out;
}

/** Pulse's entries of one day that count (those repeating no Fitbit entry), and the repeats found. */
export function countedPulse(entries: FoodEntry[]): { counted: FoodEntry[]; dup: Map<string, string> } {
  const dup = duplicates(entries);
  return { counted: entries.filter((e) => e.source === "pulse" && !dup.has(e.id)), dup };
}

/** Sums as extra-metric values; a nutrient no entry gave is absent. */
function extrasOf(t: Totals): FoodExtras {
  const x: FoodExtras = {};
  for (const [key, n] of FOOD_KEYS) {
    const v = t[n];
    if (v !== null) x[key] = v;
  }
  return x;
}

/**
 * Per day in [from, to]: what Pulse's own food adds to the source's daily totals, Fitbit's repeats left out. A
 * nutrient none of the counted entries gave is absent (the day's protein stays the source's, or no data).
 */
export function pulseFoodByDay(rows: LoggedEntryRow[], from: string, to: string): Map<string, FoodExtras> {
  const out = new Map<string, FoodExtras>();
  for (const [day, entries] of byDay(rows, from, to)) {
    const { counted } = countedPulse(entries);
    if (counted.length) out.set(day, extrasOf(sumFood(counted)));
  }
  return out;
}

/** `synced` (a day's extra metrics) with Pulse's `add` on top, rounded as the importer rounds. */
export function withFood<T extends Partial<Record<ExtraKey, number>>>(synced: T, add: FoodExtras | undefined): T {
  if (!add) return synced;
  const out: Partial<Record<ExtraKey, number>> = { ...synced };
  for (const [key, n] of FOOD_KEYS) {
    const v = add[key];
    if (v !== undefined) out[key] = roundNutrient(n, (out[key] ?? 0) + v);
  }
  return out as T;
}

/**
 * The nutrients of `day`: the source's roll-up plus Pulse's own entries (Fitbit's repeats left out), as loadDays counts
 * them. Fiber is Pulse's alone: the roll-up has none.
 */
export function dayTotals(values: DailyValue[], rows: LoggedEntryRow[], day: string): Totals {
  const synced: Partial<Record<ExtraKey, number>> = {};
  for (const v of values) if (v.day === day) synced[v.key as ExtraKey] = v.value;
  const pulse = sumFood(countedPulse(byDay(rows, day, day).get(day) ?? []).counted);
  const all = withFood(synced, extrasOf(pulse));
  const pick = (k: FoodKey) => (finite(all[k]) ? all[k] : null);
  return { kcal: pick("calories_in"), protein: pick("protein"), carbs: pick("carbs"), fat: pick("fat"), fiber: pulse.fiber };
}

/** Today's (or any day's) nutrients from the Store: one roll-up read and that day's log. */
export async function nutritionOn(store: Store, day: string, tz: string): Promise<Totals> {
  const [values, rows] = await Promise.all([store.dailyValues({ from: day, to: day }), store.loggedEntries(localMidnight(day, tz), 10_000)]);
  return dayTotals(values, rows, day);
}
