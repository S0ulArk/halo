// The person's own nutrition targets (Nutrition › Targets), kept on the phone (AsyncStorage "pulse.nutrition.targets"):
// a number per target they set, null where Pulse's suggestion applies (src/nutrition/targets.ts). One module-level
// store like the goals (src/state/goals.ts), so every screen sees a save at once.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import { NO_CUSTOM, parseCustomTargets, TARGET_KEYS, type CustomTargets } from "@/nutrition/targets";

export const NUTRITION_TARGETS_KEY = "pulse.nutrition.targets";

/** undefined until read; then what is stored (or none set). */
let saved: CustomTargets | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const loaded: Promise<void> = AsyncStorage.getItem(NUTRITION_TARGETS_KEY)
  .then((raw) => {
    if (saved === undefined) saved = parseCustomTargets(raw);
  })
  .catch(() => {
    if (saved === undefined) saved = NO_CUSTOM;
  })
  .finally(emit);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => saved;

/** Saves the targets; none set is stored as nothing. */
export async function saveNutritionTargets(next: CustomTargets): Promise<void> {
  await loaded;
  if (TARGET_KEYS.every((k) => next[k] === null)) await AsyncStorage.removeItem(NUTRITION_TARGETS_KEY);
  else await AsyncStorage.setItem(NUTRITION_TARGETS_KEY, JSON.stringify(next));
  saved = next;
  emit();
}

/** The person's targets (none set until read; `ready` says which) and the way to change them. */
export function useNutritionTargets(): { custom: CustomTargets; ready: boolean; save: (next: CustomTargets) => Promise<void> } {
  const t = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  return { custom: t ?? NO_CUSTOM, ready: t !== undefined, save: saveNutritionTargets };
}
