// Journal and Log writes, ported from Pulse's src/server/actions/{journal,log}.ts: the same validation (zod there, by
// hand here), the same messages, and results returned rather than thrown so a form can show them. Plain TypeScript
// over the Store (no React Native), so the tests run in node. The caller refreshes (rescoring) after a check-in.
import type { Profile } from "@/data/types";
import type { Store } from "@/data/store";
import { addDays, fromWall, localDay } from "@/lib/time";
import { addTag, getJournal, MAX_TAGS, reorderTags, setTagHidden, tagKey, tagRows } from "@/queries/journal";
import {
  CYCLE_SYMPTOMS,
  deleteEntry,
  FLOWS,
  isCycleKind,
  MEALS,
  MOODS,
  type NewEntry,
  OVULATION_RESULTS,
  saveEntries,
  SYMPTOMS,
  VALENCES,
  type Flow,
  type Meal,
  type Mood,
  type OvulationResult,
  type Symptom,
  type Valence,
} from "@/queries/log";
import type { QueryCtx } from "@/queries/ctx";
import type { FoodData, FoodVia } from "@/queries/food";
import type { JournalVM } from "@/queries/types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** What the actions need: the Store, the person's profile and zone. Today and now are read when the action runs. */
export type ActionCtx = { store: Store; profile: Profile; timeZone: string; nowS?: () => number };

const nowOf = (c: ActionCtx) => (c.nowS ? c.nowS() : Math.floor(Date.now() / 1000));
const todayOf = (c: ActionCtx) => localDay(nowOf(c), c.timeZone);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day "YYYY-MM-DD" (rejects 2026-02-31), as zod's `z.iso.date()`. */
export const isDay = (v: unknown): v is string => {
  if (typeof v !== "string" || !DAY.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
};

/** How far back a day may go (the web's MAX_PAST_DAYS): the sheet's day strip runs from that day to today. */
export const MAX_PAST_DAYS = 3650;
export const inDayRange = (v: string, today: string) => isDay(v) && v <= today && v >= addDays(today, -MAX_PAST_DAYS);

const fail = (error: string) => ({ ok: false as const, error });

// ── Journal ─────────────────────────────────────────────────────────────────

export type EntryInput = { day: string; tag: string; value: boolean | number | null };

/** Upserts (or, with value null, deletes) one (day, tag) for today or a past day. Repeating it changes nothing. */
export async function saveJournalEntry(c: ActionCtx, input: EntryInput): Promise<ActionResult> {
  const { day, tag, value } = input;
  if (!isDay(day)) return fail("Invalid ISO date");
  if (typeof tag !== "string" || tag.length < 1 || tag.length > 64) return fail("Invalid tag");
  // A yes/no behaviour, or a count (e.g. drinks); stored as an integer. null clears the answer: no row means "not
  // answered", which journal impact keeps apart from an answered "no" (0).
  if (value !== null && typeof value !== "boolean" && !(Number.isInteger(value) && value >= 0 && value <= 1000)) return fail("Invalid value");
  if (day > todayOf(c)) return fail("Can’t log a future day");
  const known = (await tagRows(c.store)).some((t) => t.tag === tag);
  if (!known) return fail(`Unknown tag: ${tag}`);
  if (value === null) await c.store.deleteJournal(day, tag);
  else await c.store.setJournal({ day, tag, value: Number(value) });
  // Stage 2 reads the journal (impact, Insights, Monitor context) but a check-in is no source change, so mark the day
  // dirty (stage 1 redoes only that day, to the same result) as the web does. The caller then runs the pipeline.
  await c.store.markIntradayDirty([day]);
  return { ok: true, data: undefined };
}

/** Read-only: the check-in sheet's behaviours and a day's answers. */
export async function loadCheckIn(ctx: QueryCtx, day: string): Promise<ActionResult<Pick<JournalVM, "tags" | "checkIn">>> {
  if (!isDay(day)) return fail("Invalid day");
  if (!inDayRange(day, ctx.today)) return fail("Invalid day");
  const { tags, checkIn } = await getJournal(day, ctx);
  return { ok: true, data: { tags, checkIn } };
}

/** Adds a custom tag; its key is the label as snake_case. Fails when that key already exists. */
export async function addCustomTag(c: ActionCtx, input: { label: string }): Promise<ActionResult<{ tag: string }>> {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (label.length < 1) return fail("Too small: expected string to have >=1 characters");
  if (label.length > 40) return fail("Too big: expected string to have <=40 characters");
  const tag = tagKey(label);
  if (!tag) return fail("Label needs a letter or digit");
  const added = await addTag(c.store, tag, label);
  if (added === "exists") return fail(`Tag already exists: ${tag}`);
  if (added === "full") return fail(`Too many behaviours: the limit is ${MAX_TAGS}`);
  return { ok: true, data: { tag } };
}

/** Hides a behaviour from the check-in sheet, or shows it again. Its past answers stay and still count in insights. */
export async function setBehaviourHidden(c: ActionCtx, input: { tag: string; hidden: boolean }): Promise<ActionResult> {
  if (typeof input.tag !== "string" || input.tag.length < 1 || input.tag.length > 64 || typeof input.hidden !== "boolean") return fail("Invalid input");
  if (!(await setTagHidden(c.store, input.tag, input.hidden))) return fail(`Unknown tag: ${input.tag}`);
  return { ok: true, data: undefined };
}

/** Sets the order of one check-in group's behaviours. */
export async function reorderBehaviours(c: ActionCtx, input: { tags: string[] }): Promise<ActionResult> {
  const { tags } = input;
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > 200 || tags.some((t) => typeof t !== "string" || t.length < 1 || t.length > 64)) return fail("Invalid input");
  if (!(await reorderTags(c.store, tags))) return fail("Unknown or repeated tag");
  return { ok: true, data: undefined };
}

// ── Log ─────────────────────────────────────────────────────────────────────

/** One food: its name (blank: the meal's), portion, calories and grams; a nutrient not given is null (unknown). */
export type FoodItemInput = { name: string; portion?: string; kcal: number; protein: number | null; carbs: number | null; fat: number | null; fiber?: number | null };

export type LogInput =
  | { kind: "water"; ml: number; at?: string }
  | ({ kind: "food"; meal: Meal; via?: FoodVia; at?: string } & FoodItemInput)
  | { kind: "weight"; kg: number; fatPct: number | null; at?: string }
  | { kind: "spo2"; pct: number; at?: string }
  | { kind: "mood"; moods: Mood[]; valence: Valence | null; at?: string }
  | { kind: "symptoms"; symptoms: Symptom[]; at?: string }
  | { kind: "period"; start: string; end: string; flow: Flow | null }
  | { kind: "ovulation"; result: OvulationResult; at?: string };

const AT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
/** A local wall time `YYYY-MM-DDTHH:mm` that names a real minute. */
const validAt = (at: string) => {
  const m = AT.exec(at);
  return !!m && isDay(m[1]) && +m[2] < 24 && +m[3] < 60;
};
const keys = (list: readonly (readonly [string, ...unknown[]])[]) => new Set(list.map((x) => x[0]));
const MEAL_KEYS = keys(MEALS);
const MOOD_KEYS = keys(MOODS);
const VALENCE_KEYS = keys(VALENCES);
const SYMPTOM_KEYS = keys(SYMPTOMS);
const FLOW_KEYS = keys(FLOWS);
const RESULT_KEYS = keys(OVULATION_RESULTS);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const grams = (v: unknown) => v === null || (num(v) && v >= 0 && v <= 1000);
const ENUM = "Invalid option";
const VIA_KEYS = new Set<string>(["photo", "text", "manual"]);
/** Most foods one save takes (a photo estimate lists each food it sees). */
export const MAX_FOODS = 20;

/** The first problem with `v`, as the web's zod schema reports it; null when it's valid. */
function invalid(v: LogInput): string | null {
  if ("at" in v && v.at !== undefined && !validAt(v.at)) return "Choose a time";
  switch (v.kind) {
    case "water":
      if (!num(v.ml) || !Number.isInteger(v.ml)) return "Enter the amount in millilitres.";
      if (v.ml < 10) return "At least 10 ml";
      if (v.ml > 5000) return "At most 5,000 ml";
      return null;
    case "food":
      if (!MEAL_KEYS.has(v.meal) || (v.via !== undefined && !VIA_KEYS.has(v.via))) return ENUM;
      return invalidFood(v);
    case "weight":
      if (!num(v.kg) || v.kg < 20 || v.kg > 300) return "Between 20 and 300 kg";
      if (v.fatPct !== null && (!num(v.fatPct) || v.fatPct < 2 || v.fatPct > 75)) return "Between 2 and 75%";
      return null;
    case "spo2":
      return num(v.pct) && v.pct >= 70 && v.pct <= 100 ? null : "Between 70 and 100%";
    case "mood":
      if (!Array.isArray(v.moods) || v.moods.length < 1) return "Choose how you feel";
      if (v.moods.length > 5) return "Choose up to 5 feelings";
      if (!v.moods.every((m) => MOOD_KEYS.has(m)) || (v.valence !== null && !VALENCE_KEYS.has(v.valence))) return ENUM;
      return null;
    case "symptoms":
      if (!Array.isArray(v.symptoms) || v.symptoms.length < 1) return "Choose a symptom";
      if (v.symptoms.length > 10) return "Choose up to 10 symptoms";
      if (!v.symptoms.every((s) => SYMPTOM_KEYS.has(s))) return ENUM;
      return null;
    case "period":
      if (!isDay(v.start) || !isDay(v.end)) return "Choose the first and last day.";
      if (v.flow !== null && !FLOW_KEYS.has(v.flow)) return ENUM;
      return null;
    case "ovulation":
      return RESULT_KEYS.has(v.result) ? null : ENUM;
  }
}

/** The first problem with one food, as the web's rules phrase them (portion and fiber are the phone's additions). */
export function invalidFood(v: FoodItemInput): string | null {
  if (typeof v.name !== "string" || v.name.trim().length > 80) return "Use 80 characters or fewer.";
  if (v.portion !== undefined && (typeof v.portion !== "string" || v.portion.trim().length > 60)) return "Keep the portion to 60 characters or fewer.";
  if (!num(v.kcal) || !Number.isInteger(v.kcal) || v.kcal < 0) return "Enter calories as a whole number.";
  if (v.kcal > 10_000) return "At most 10,000 kcal";
  if (![v.protein, v.carbs, v.fat, v.fiber ?? null].every(grams)) return "Macros are grams, between 0 and 1,000.";
  return null;
}

/** A food's stored data: a blank name is null, and the portion, fiber and how it was made only when given. */
function foodData(v: FoodItemInput, meal: Meal, via: FoodVia | undefined): FoodData {
  const portion = v.portion?.trim();
  return {
    name: v.name.trim() || null,
    meal,
    kcal: v.kcal,
    protein: v.protein,
    carbs: v.carbs,
    fat: v.fat,
    ...(portion ? { portion } : null),
    ...(v.fiber != null ? { fiber: v.fiber } : null),
    ...(via ? { via } : null),
  };
}

/** `at` as a moment for a log entry, or why it can't be one (not a time, in the future, over a year back). */
function momentOf(c: ActionCtx, at: string | undefined): { ok: true; ts: number } | { ok: false; error: string } {
  if (at !== undefined && !validAt(at)) return fail("Choose a time");
  const now = nowOf(c);
  const ts = at ? fromWall(at, c.timeZone) : now;
  if (ts > now + 60) return fail("Can’t log the future");
  if (ts < now - 366 * 86_400) return fail("Can’t log more than a year back");
  return { ok: true, ts };
}

/**
 * Logs one meal's foods at once (a photo or description estimate lists each food it sees; one typed food is a list of
 * one): every food is checked before any is saved, and all share the meal and the time.
 */
export async function logFoods(c: ActionCtx, input: { meal: Meal; via: FoodVia; at?: string; items: FoodItemInput[] }): Promise<ActionResult<{ count: number }>> {
  if (!MEAL_KEYS.has(input.meal) || !VIA_KEYS.has(input.via)) return fail(ENUM);
  if (!Array.isArray(input.items) || input.items.length < 1) return fail("Add a food to save.");
  if (input.items.length > MAX_FOODS) return fail(`Save up to ${MAX_FOODS} foods at a time.`);
  for (const item of input.items) {
    const problem = invalidFood(item);
    if (problem) return fail(input.items.length > 1 && item.name.trim() ? `${item.name.trim()}: ${problem}` : problem);
  }
  const when = momentOf(c, input.at);
  if (!when.ok) return when;
  const entries: NewEntry[] = input.items.map((item) => ({ type: "nutrition-log", ts: when.ts, data: foodData(item, input.meal, input.via) }));
  await saveEntries(c.store, entries, { tz: c.timeZone, now: nowOf(c) });
  return { ok: true, data: { count: entries.length } };
}

/**
 * Changes a food logged in Pulse, in place (same id): its name, portion, numbers, meal and time. `ts` is the entry's
 * time as listed (it is found from there). Food read from Health Connect (logged in Fitbit) is changed in Fitbit only.
 */
export async function updateFoodEntry(c: ActionCtx, input: { id: string; ts: number; meal: Meal; at?: string; item: FoodItemInput }): Promise<ActionResult> {
  if (!MEAL_KEYS.has(input.meal)) return fail(ENUM);
  const problem = invalidFood(input.item);
  if (problem) return fail(problem);
  const when = momentOf(c, input.at);
  if (!when.ok) return when;
  const row = (await c.store.loggedEntries(Math.min(input.ts, when.ts) - 1, 5000)).find((r) => r.id === input.id);
  if (!row || row.type !== "nutrition-log") return fail("This food is no longer in your log.");
  if (row.source !== "pulse") return fail("Food logged in Fitbit is changed in Fitbit.");
  const before = row.data as Partial<FoodData> | null;
  const via = before && typeof before.via === "string" && VIA_KEYS.has(before.via) ? before.via : undefined;
  const data = foodData(input.item, input.meal, via);
  if (before?.separate === true) data.separate = true;
  await c.store.addLoggedEntries([{ ...row, ts: when.ts, day: localDay(when.ts, c.timeZone), data }]);
  return { ok: true, data: undefined };
}

/**
 * "Count it too": a Pulse food that Pulse took for a repeat of a Fitbit entry is a food of its own after all, so it
 * counts beside Fitbit's (`separate`). `separate: false` lets Pulse match it again.
 */
export async function setFoodSeparate(c: ActionCtx, input: { id: string; ts: number; separate: boolean }): Promise<ActionResult> {
  const row = (await c.store.loggedEntries(input.ts - 1, 5000)).find((r) => r.id === input.id);
  if (!row || row.type !== "nutrition-log") return fail("This food is no longer in your log.");
  if (row.source !== "pulse") return fail("Food logged in Fitbit is changed in Fitbit.");
  const { separate: _old, ...data } = (row.data ?? {}) as FoodData;
  await c.store.addLoggedEntries([{ ...row, data: input.separate ? { ...data, separate: true } : data }]);
  return { ok: true, data: undefined };
}

/** Logs water, food, weight (and body fat), blood oxygen, mood, symptoms, or (female profiles) a period or ovulation test. */
export async function logEntry(c: ActionCtx, input: LogInput): Promise<ActionResult<{ demo: boolean }>> {
  const problem = invalid(input);
  if (problem) return fail(problem);
  const v = input;
  const tz = c.timeZone;
  const female = c.profile.sex === "female";
  // Cycle tracking never exists on a male profile, whatever a request says.
  if (!female && (isCycleKind(v.kind) || (v.kind === "symptoms" && v.symptoms.some((s) => CYCLE_SYMPTOMS.has(s))))) {
    return fail("Not available for this profile");
  }

  const now = nowOf(c);
  const today = localDay(now, tz);
  const ts = "at" in v && v.at ? fromWall(v.at, tz) : now;
  if (ts > now + 60) return fail("Can’t log the future");
  if (ts < now - 366 * 86_400) return fail("Can’t log more than a year back");

  let entries: NewEntry[];
  switch (v.kind) {
    case "water":
      entries = [{ type: "hydration-log", ts, data: { ml: v.ml } }];
      break;
    case "food":
      entries = [{ type: "nutrition-log", ts, data: foodData(v, v.meal, v.via) }];
      break;
    case "weight":
      entries = [
        { type: "weight", ts, data: { kg: Math.round(v.kg * 10) / 10 } },
        ...(v.fatPct != null ? [{ type: "body-fat" as const, ts, data: { pct: Math.round(v.fatPct * 10) / 10 } }] : []),
      ];
      break;
    case "spo2":
      entries = [{ type: "oxygen-saturation", ts, data: { pct: Math.round(v.pct * 10) / 10 } }];
      break;
    case "mood":
      entries = [{ type: "moods", ts, data: { moods: v.moods, valence: v.valence } }];
      break;
    case "symptoms":
      entries = [{ type: "symptoms", ts, data: { symptoms: v.symptoms } }];
      break;
    case "period": {
      if (v.end < v.start) return fail("The last day is before the first");
      if (v.end > today) return fail("Can’t log a future day");
      if (v.start < addDays(today, -366)) return fail("Can’t log more than a year back");
      if (v.end > addDays(v.start, 14)) return fail("A period is 15 days at most");
      entries = [{ type: "menstrual-period", ts: fromWall(`${v.start}T00:00`, tz), data: { start: v.start, end: v.end, flow: v.flow } }];
      break;
    }
    case "ovulation":
      entries = [{ type: "ovulation-test", ts, data: { result: v.result } }];
      break;
  }

  // mobile: no Google writer and no write permission to ask for; every entry stays in Pulse, as in the web's demo mode.
  await saveEntries(c.store, entries, { tz, now });
  return { ok: true, data: { demo: true } };
}

/** Deletes a logged entry. */
export async function deleteLogEntry(c: ActionCtx, input: { id: string }): Promise<ActionResult> {
  if (typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) return fail("Invalid UUID");
  await deleteEntry(c.store, input.id);
  return { ok: true, data: undefined };
}
