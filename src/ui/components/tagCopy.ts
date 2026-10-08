// Tag copy for the metric tags (the web keeps this beside reasons.ts; the mobile reasons.ts carries only the codes).
export type { MetricTag } from "@/lib/reasons";

export const TAG_COPY = {
  provisional: { label: "Provisional", long: "Provisional: fewer than 14 nights of baseline" },
  stale_baseline: { label: "Baseline stale", long: "Baseline stale: no recent nights to refresh it" },
  updated: { label: "Updated", long: "Updated since first shown" },
} as const;
