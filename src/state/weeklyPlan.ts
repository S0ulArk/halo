// The Weekly Plan's targets (a phone addition), kept on the phone (AsyncStorage "pulse.weeklyPlan"): which weekly
// targets are on and their values, and the hook Home and Settings read them with. One module-level store, as the daily
// goals' (src/state/goals.ts), so a save shows everywhere at once. Defaults, limits and parsing are pure, in
// src/core/algorithms/weeklyPlan.ts; the query that scores a week is src/queries/weeklyPlan.ts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import { isDefaultPlan, parsePlan, PLAN_DEFAULTS, type PlanSettings } from "@/core/algorithms/weeklyPlan";

export const PLAN_KEY = "pulse.weeklyPlan";

/** undefined until read; then what is stored (or the defaults). */
let saved: PlanSettings | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Read once, as soon as the module loads.
const loaded: Promise<void> = AsyncStorage.getItem(PLAN_KEY)
  .then((raw) => {
    if (saved === undefined) saved = parsePlan(raw);
  })
  .catch(() => {
    if (saved === undefined) saved = PLAN_DEFAULTS;
  })
  .finally(emit);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => saved;

/** Saves `next`; the defaults are stored as nothing. */
async function persist(next: PlanSettings): Promise<void> {
  await loaded;
  if (isDefaultPlan(next)) await AsyncStorage.removeItem(PLAN_KEY);
  else await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(next));
  saved = next;
  emit();
}

/** Applies `fn` to the plan as stored now (so two quick edits never overwrite each other) and saves. */
export async function updatePlan(fn: (p: PlanSettings) => PlanSettings): Promise<void> {
  await loaded;
  await persist(fn(saved ?? PLAN_DEFAULTS));
}

export const resetPlan = () => persist(PLAN_DEFAULTS);

/** The plan (the defaults until read; `ready` says which), and the ways to change it. */
export function useWeeklyPlan(): { plan: PlanSettings; ready: boolean; update: (fn: (p: PlanSettings) => PlanSettings) => Promise<void>; reset: () => Promise<void> } {
  const p = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  return { plan: p ?? PLAN_DEFAULTS, ready: p !== undefined, update: updatePlan, reset: resetPlan };
}
