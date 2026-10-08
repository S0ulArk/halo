// Links into the chart explorer `/chart?metric=&r=&d=&compare=`, and the hook the chart cards use to open it.
import * as React from "react";
import { useRouter, type Href } from "expo-router";

export type ChartRange = "w" | "m" | "6m" | "1y" | "all" | "day";
export type ChartLink = {
  /** A key of CHART_METRICS (src/queries/chart.ts): a Trends metric, a metric screen's key, or a card's own. */
  metric: string;
  /** The range on show (`day`: that day's intraday view). */
  r?: ChartRange;
  /** The day: a day view's date, or the day a daily window ends on. */
  d?: string;
  /** A second metric on its own axis. */
  compare?: string;
};

export function chartHref({ metric, r, d, compare }: ChartLink): string {
  const q = [`metric=${encodeURIComponent(metric)}`];
  if (r) q.push(`r=${r}`);
  if (d) q.push(`d=${d}`);
  if (compare) q.push(`compare=${encodeURIComponent(compare)}`);
  return `/chart?${q.join("&")}`;
}

/** Opens the explorer: `open({ metric: "hrv", r: "m" })`. */
export function useOpenChart() {
  const router = useRouter();
  return React.useCallback((link: ChartLink) => router.push(chartHref(link) as Href), [router]);
}
