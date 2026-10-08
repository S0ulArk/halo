// Navigation and refresh hooks shared by the detail screens.
import * as React from "react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useDay } from "@/lib/day";
import { useApp } from "@/state/app";
import type { DateSwitcherProps } from "@/ui";
import type { Anchors } from "./DetailScreen";

/** Back: the previous screen when there is one, else `fallback` (the web's `backHref`; Home by default). */
export function useBack(fallback = "/") {
  const router = useRouter();
  return React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback as Href);
  }, [router, fallback]);
}

/** Pushes a route given as the web's href string ("/sleep?d=…#planner", "/activity/abc"). */
export function usePush() {
  const router = useRouter();
  return React.useCallback((href: string) => router.push(href as Href), [router]);
}

/**
 * The screen's day from `?d=` with the header DateSwitcher wired to it: a step sets `?d=` in place (today drops it), as
 * the web's switcher replaces the URL. `loading` shows the switcher's spinner while the new day's data loads.
 */
export function useDayNav() {
  const router = useRouter();
  const { sync } = useApp();
  const { d, today, isToday } = useDay();
  const onChange = React.useCallback((day: string) => router.setParams({ d: day === today ? undefined : day }), [router, today]);
  const switcher = React.useCallback(
    (loading = false): DateSwitcherProps => ({ mode: "day", placement: "header", date: d, today, firstDay: sync.firstDay, onChange, loading }),
    [d, today, sync.firstDay, onChange],
  );
  return { d, today, isToday, switcher };
}

/** Pull to refresh: re-imports and rescores; the spinner shows until the run ends. */
export function useRefresh() {
  const { refresh } = useApp();
  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  }, [refresh]);
  const retry = React.useCallback(() => void refresh(), [refresh]);
  return { refreshing, onRefresh, retry };
}

/**
 * Scrolls to the route's `#hash` once the content is on screen (the web's HashScroll, journey 4: `/sleep#planner`).
 * expo-router parses the hash into the `#` param.
 */
export function useHashScroll(anchors: Anchors, ready: boolean) {
  const params = useLocalSearchParams<{ "#"?: string }>();
  const router = useRouter();
  const hash = typeof params["#"] === "string" ? params["#"] : undefined;
  React.useEffect(() => {
    if (!ready || !hash) return;
    // After the push transition and the first layout pass, so the anchor has its final position. Then the anchor is
    // cleared: a tab stays mounted, so the next link to the same section must scroll again, and the tab bar's own
    // press (which keeps the params) must not.
    const t = setTimeout(() => {
      if (anchors.scrollTo(hash)) router.setParams({ "#": undefined } as never);
    }, 400);
    return () => clearTimeout(t);
  }, [ready, hash, anchors, router]);
}
