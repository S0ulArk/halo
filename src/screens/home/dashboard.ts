// My Dashboard's chosen metrics, kept on the phone (AsyncStorage "pulse.dashboard"; the web keeps them in its
// dashboard_metrics table). One module-level store so Home's query and the editor agree without threading props.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import { isDashboardKey, type DashboardKey } from "@/queries";

export const DASHBOARD_KEY = "pulse.dashboard";

/** undefined until read; null when nothing is chosen (Home shows the default list). */
let saved: DashboardKey[] | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const parse = (raw: string | null): DashboardKey[] | null => {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(v)) return null;
    const keys = v.filter((k): k is DashboardKey => typeof k === "string" && isDashboardKey(k));
    return keys.length ? keys : null;
  } catch {
    return null;
  }
};

// Read once, as soon as Home's module loads: it is back long before the store has opened and Home first queries.
const loaded: Promise<void> = AsyncStorage.getItem(DASHBOARD_KEY)
  .then((raw) => {
    if (saved === undefined) saved = parse(raw);
  })
  .catch(() => {
    if (saved === undefined) saved = null;
  })
  .finally(emit);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => saved;

/** The chosen keys (null: the default list; undefined: not read yet). */
export function useDashboardKeys(): DashboardKey[] | null | undefined {
  return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Saves the list. The default list is stored as nothing (the web stores no rows), so a later change of default (a band
 * synced for the first time) still reaches it.
 */
export async function saveDashboardKeys(keys: DashboardKey[], defaults: DashboardKey[]): Promise<void> {
  await loaded;
  const isDefault = keys.length === defaults.length && keys.every((k, i) => k === defaults[i]);
  if (isDefault) await AsyncStorage.removeItem(DASHBOARD_KEY);
  else await AsyncStorage.setItem(DASHBOARD_KEY, JSON.stringify(keys));
  saved = isDefault ? null : [...keys];
  emit();
}

/** The cache key of a day's Home view model (useQuery), shared by Today, Activity and Health. */
export const homeKey = (day: string, dashboard: readonly string[] | null | undefined) => `home:${day}:${dashboard ? dashboard.join(",") : "default"}`;
