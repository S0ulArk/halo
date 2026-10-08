import * as React from "react";
import { normalizeReason, type Metric, type MetricTag, type ReasonCode } from "@/lib/reasons";
import { ReasonPlaceholder } from "./ReasonPlaceholder";

export type MetricMeta = { provisional: boolean; tags: MetricTag[]; nightsLeft?: number };

export type MetricStateProps<T> = {
  /** `undefined` while loading; `null` when the feature has no history. */
  metric: Metric<T> | null | undefined;
  /** The component's skeleton, in its final shape. */
  skeleton: React.ReactNode;
  /** Shown when `metric` is null or its value is an empty list. Defaults to the `no_data` copy. */
  empty?: React.ReactNode;
  reasonSize?: "sm" | "md" | "lg";
  renderReason?: (reason: ReasonCode, meta: MetricMeta) => React.ReactNode;
  children: (value: T, meta: MetricMeta) => React.ReactNode;
};

/** The only place that branches on data state (spec §4.8): loading, empty, reason, provisional, value. */
export function MetricState<T>({ metric, skeleton, empty, reasonSize = "md", renderReason, children }: MetricStateProps<T>) {
  if (metric === undefined) return <>{skeleton}</>;

  const isEmpty = metric === null || (Array.isArray(metric.value) && metric.value.length === 0);
  if (isEmpty) return <>{empty ?? <ReasonPlaceholder reason="no_data" size={reasonSize} />}</>;

  const meta: MetricMeta = { provisional: metric.provisional, tags: metric.tags ?? [], nightsLeft: metric.nightsLeft };
  const broken = typeof metric.value === "number" && !Number.isFinite(metric.value);

  if (metric.value === null || broken) {
    const reason = broken ? "no_data" : normalizeReason(metric.reason);
    return <>{renderReason ? renderReason(reason, meta) : <ReasonPlaceholder reason={reason} nightsLeft={metric.nightsLeft} size={reasonSize} />}</>;
  }
  return <>{children(metric.value, meta)}</>;
}
