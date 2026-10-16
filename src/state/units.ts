// The person's measurement units (Settings › Units), kept on the phone (AsyncStorage "pulse.units") as the theme is: a
// per-device display choice, never a row. Metric until they choose. One module-level store, like the goals'
// (src/state/goals.ts), so every screen and every sheet (drawn at the root's portal host) sees a change at once, and
// code outside React (the coach's instructions) reads the same value with readUnits(). The Store and every score stay
// metric: only what is shown and what is typed in convert (src/lib/units.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import { METRIC, parseUnits, sameUnits, type Units } from "@/lib/units";

export type { Units } from "@/lib/units";

export const UNITS_KEY = "pulse.units";

/** undefined until read; then what is stored (or metric). */
let saved: Units | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Read once, as soon as the module loads (before the Store opens, so the first screen already has them).
const loaded: Promise<void> = AsyncStorage.getItem(UNITS_KEY)
  .then((raw) => {
    if (saved === undefined) saved = parseUnits(raw);
  })
  .catch(() => {
    if (saved === undefined) saved = METRIC;
  })
  .finally(emit);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => saved;

/** The units for code outside React (the coach's instructions at request time): what is stored, metric until set. */
export async function readUnits(): Promise<Units> {
  await loaded;
  return saved ?? METRIC;
}

/** The units as known right now, without waiting (metric before the stored choice is read). */
export const currentUnits = (): Units => saved ?? METRIC;

/** Saves `next` (metric is stored as nothing) and tells every reader. */
export async function setUnits(next: Units): Promise<void> {
  await loaded;
  if (saved && sameUnits(saved, next)) return;
  saved = { ...next };
  emit();
  if (sameUnits(next, METRIC)) await AsyncStorage.removeItem(UNITS_KEY).catch(() => {});
  else await AsyncStorage.setItem(UNITS_KEY, JSON.stringify(next)).catch(() => {});
}

/** One choice changed, the rest kept as stored now (two quick taps never undo each other). */
export async function updateUnits(patch: Partial<Units>): Promise<void> {
  await loaded;
  await setUnits({ ...(saved ?? METRIC), ...patch });
}

/** The person's units (metric until read; `ready` says which), and the way to change them. */
export function useUnits(): { units: Units; ready: boolean; update: (patch: Partial<Units>) => Promise<void>; set: (next: Units) => Promise<void> } {
  const u = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  return { units: u ?? METRIC, ready: u !== undefined, update: updateUnits, set: setUnits };
}
