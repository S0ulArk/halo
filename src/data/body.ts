// Weight, body fat and blood oxygen logged in Pulse (Journal › Log) count like readings from Health Connect: they're
// written only to Pulse's own log (Pulse never writes to Health Connect), so every reader of daily metrics overlays
// them here. On a day with a logged value the latest logged one wins: it is the newest thing the person told Pulse.
// Blood oxygen is typed in from the Fitbit app because the Google Health app doesn't share it with Health Connect.
import type { Store } from "./store";
import { emptyMetrics, type Metrics } from "./types";

const ALL = Number.MAX_SAFE_INTEGER;

/** `store.allMetrics()` with logged weight, body fat and blood oxygen applied; sorted by day like the store's own list. */
export async function metricsWithLoggedBody(store: Store): Promise<Metrics[]> {
  const [metrics, logged] = await Promise.all([store.allMetrics(), store.loggedEntries(0, ALL)]);
  const latest = new Map<string, { kg?: { v: number; ts: number }; pct?: { v: number; ts: number }; spo2?: { v: number; ts: number } }>();
  for (const e of logged) {
    const data = e.data as { kg?: unknown; pct?: unknown } | null;
    const day = latest.get(e.day) ?? {};
    if (e.type === "weight" && typeof data?.kg === "number" && (!day.kg || e.ts > day.kg.ts)) day.kg = { v: data.kg, ts: e.ts };
    else if (e.type === "body-fat" && typeof data?.pct === "number" && (!day.pct || e.ts > day.pct.ts)) day.pct = { v: data.pct, ts: e.ts };
    else if (e.type === "oxygen-saturation" && typeof data?.pct === "number" && (!day.spo2 || e.ts > day.spo2.ts)) day.spo2 = { v: data.pct, ts: e.ts };
    else continue;
    latest.set(e.day, day);
  }
  if (!latest.size) return metrics;

  const byDay = new Map(metrics.map((m) => [m.day, m]));
  for (const [day, l] of latest) {
    const m = byDay.get(day) ?? emptyMetrics(day);
    byDay.set(day, { ...m, weightKg: l.kg?.v ?? m.weightKg, bodyFatPct: l.pct?.v ?? m.bodyFatPct, spo2Pct: l.spo2?.v ?? m.spo2Pct });
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}
