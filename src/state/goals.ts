// Daily goals (Fitbit-style), kept on the phone (AsyncStorage "pulse.goals"): the targets, which goals are on, their
// limits, and the hook Home, Trends and Settings read them with. One module-level store, like My Dashboard's keys
// (src/screens/home/dashboard.ts), so every screen sees a save at once. The query that scores a day against them
// is src/queries/goals.ts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import { GOAL_KEYS, type GoalKey, type Goals, type GoalTargets } from "@/queries/goals";

export type { GoalKey, Goals, GoalTargets } from "@/queries/goals";
export { GOAL_KEYS } from "@/queries/goals";

export const GOALS_KEY = "pulse.goals";

export type TargetKey = keyof GoalTargets;
export const TARGET_KEYS: readonly TargetKey[] = ["steps", "distance", "floors", "azm", "azmWeek", "active_minutes", "active_calories", "water", "sleep"];

/**
 * Fitbit's defaults: 10,000 steps, 8 km, 10 floors, 22 Active Zone Minutes a day (150 a week), 30 active minutes and
 * 2,000 ml of water; active calories off (Fitbit sets a total-burn goal instead); sleep follows Pulse's own need.
 */
export const DEFAULT_GOALS: Goals = {
  targets: { steps: 10_000, distance: 8, floors: 10, azm: 22, azmWeek: 150, active_minutes: 30, active_calories: 500, water: 2000, sleep: null },
  enabled: { steps: true, distance: true, floors: true, azm: true, active_minutes: true, active_calories: false, water: true, sleep: true },
};

export type TargetLimit = {
  min: number;
  max: number;
  /** Decimal places the field keeps (0: whole numbers). */
  decimals: number;
  /** After the field: "steps a day", "km a day", "min a week". */
  unit: string;
  /** May be empty: sleep follows Pulse's need. */
  optional?: boolean;
};

export const TARGET_LIMITS: Record<TargetKey, TargetLimit> = {
  steps: { min: 1000, max: 50_000, decimals: 0, unit: "steps a day" },
  distance: { min: 1, max: 100, decimals: 1, unit: "km a day" },
  floors: { min: 1, max: 200, decimals: 0, unit: "floors a day" },
  azm: { min: 1, max: 600, decimals: 0, unit: "min a day" },
  azmWeek: { min: 10, max: 3000, decimals: 0, unit: "min a week" },
  active_minutes: { min: 5, max: 600, decimals: 0, unit: "min a day" },
  active_calories: { min: 50, max: 5000, decimals: 0, unit: "kcal a day" },
  water: { min: 250, max: 10_000, decimals: 0, unit: "ml a day" },
  sleep: { min: 4, max: 12, decimals: 1, unit: "hours a night", optional: true },
};

const fmt = (key: TargetKey, v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: TARGET_LIMITS[key].decimals }).format(v);

/** Null when `value` is allowed for `key`, else why not ("Between 1,000 and 50,000"). */
export function validateTarget(key: TargetKey, value: number | null): string | null {
  const l = TARGET_LIMITS[key];
  if (value === null) return l.optional ? null : "Enter a number";
  if (!Number.isFinite(value)) return "Enter a number";
  if (l.decimals === 0 && !Number.isInteger(value)) return "Whole numbers only";
  if (value < l.min || value > l.max) return `Between ${fmt(key, l.min)} and ${fmt(key, l.max)}`;
  return null;
}

/** A field's text → the target it means (blank: null) and the error to show, if any. */
export function parseTarget(key: TargetKey, text: string): { value: number | null; error: string | null } {
  const t = text.trim().replace(",", ".");
  const value = t === "" ? null : Number(t);
  const error = value !== null && Number.isNaN(value) ? "Enter a number" : validateTarget(key, value);
  return { value: error ? null : value, error };
}

/** The stored JSON → goals; anything missing or out of range falls back to the default. */
export function parseGoals(raw: string | null): Goals {
  let v: unknown = null;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  const o = v && typeof v === "object" ? (v as { targets?: Record<string, unknown>; enabled?: Record<string, unknown> }) : {};
  const targets = { ...DEFAULT_GOALS.targets };
  for (const k of TARGET_KEYS) {
    const t = o.targets?.[k];
    if (k === "sleep" && t === null) targets.sleep = null;
    else if (typeof t === "number" && validateTarget(k, t) === null) (targets as Record<TargetKey, number | null>)[k] = t;
  }
  const enabled = { ...DEFAULT_GOALS.enabled };
  for (const k of GOAL_KEYS) {
    const e = o.enabled?.[k];
    if (typeof e === "boolean") enabled[k] = e;
  }
  return { targets, enabled };
}

export const isDefaultGoals = (g: Goals) => JSON.stringify(g) === JSON.stringify(DEFAULT_GOALS);

/** `goals` with one target changed (an invalid value is ignored). */
export function withTarget(goals: Goals, key: TargetKey, value: number | null): Goals {
  if (validateTarget(key, value)) return goals;
  return { ...goals, targets: { ...goals.targets, [key]: value } };
}

/** `goals` with one goal switched on or off. */
export const withEnabled = (goals: Goals, key: GoalKey, on: boolean): Goals => ({ ...goals, enabled: { ...goals.enabled, [key]: on } });

/** The goal drawn on a metric's trend as a dashed line, or null when that metric has no goal switched on. */
export function trendGoal(goals: Goals, metricKey: string): number | null {
  const keys: GoalKey[] = ["steps", "distance", "floors", "azm", "active_minutes", "active_calories", "water"];
  const k = keys.find((x) => x === metricKey);
  return k && goals.enabled[k] ? goals.targets[k] : null;
}

// ── Persistence ─────────────────────────────────────────────────────────────

/** undefined until read; then what is stored (or the defaults). */
let saved: Goals | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Read once, as soon as the module loads.
const loaded: Promise<void> = AsyncStorage.getItem(GOALS_KEY)
  .then((raw) => {
    if (saved === undefined) saved = parseGoals(raw);
  })
  .catch(() => {
    if (saved === undefined) saved = DEFAULT_GOALS;
  })
  .finally(emit);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => saved;

/** Saves `next`; the defaults are stored as nothing. */
async function persist(next: Goals): Promise<void> {
  await loaded;
  if (isDefaultGoals(next)) await AsyncStorage.removeItem(GOALS_KEY);
  else await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(next));
  saved = next;
  emit();
}

/** Applies `fn` to the goals as stored now (so two quick edits never overwrite each other) and saves. */
export async function updateGoals(fn: (g: Goals) => Goals): Promise<void> {
  await loaded;
  await persist(fn(saved ?? DEFAULT_GOALS));
}

export const resetGoals = () => persist(DEFAULT_GOALS);

/** The goals (the defaults until read; `ready` says which), and the ways to change them. */
export function useGoals(): { goals: Goals; ready: boolean; update: (fn: (g: Goals) => Goals) => Promise<void>; reset: () => Promise<void> } {
  const g = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  return { goals: g ?? DEFAULT_GOALS, ready: g !== undefined, update: updateGoals, reset: resetGoals };
}
