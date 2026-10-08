// The day a screen shows: `?d=YYYY-MM-DD` like the web app's dayHref, defaulting to today.
import { useLocalSearchParams } from "expo-router";
import { useApp } from "@/state/app";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function useDay(): { d: string; today: string; isToday: boolean } {
  const { today } = useApp();
  const params = useLocalSearchParams<{ d?: string }>();
  const raw = typeof params.d === "string" ? params.d : undefined;
  const d = raw && DAY.test(raw) && raw <= today ? raw : today;
  return { d, today, isToday: d === today };
}

/** A route with the day carried along; today needs no param (the web's dayHref). */
export function dayHref(path: string, d: string, today: string): string {
  if (d === today) return path;
  const [p, hash] = path.split("#");
  return `${p}${p.includes("?") ? "&" : "?"}d=${d}${hash ? `#${hash}` : ""}`;
}
