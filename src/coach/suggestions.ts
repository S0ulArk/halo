// The starter questions on an empty chat, ported from Pulse's src/server/coach/suggestions.ts: today's signals (Recovery
// and why it is missing, HRV against the 30 days before today, last night's sleep, Strain against today's target).
import { suggestionsFor } from "@/core/algorithms/coachSuggestions";
import { addDays } from "@/lib/time";
import { loadDays, priorStats, todayOf, toStrain, type QueryCtx } from "@/queries/common";

export async function coachSuggestions(ctx: QueryCtx) {
  const today = todayOf(ctx);
  const rows = await loadDays(ctx, addDays(today, -30), today);
  const row = rows.get(today);
  const target = row?.strainTarget;
  return suggestionsFor({
    recovery: row?.recovery?.value ?? null,
    provisional: row?.recovery?.provisional ?? false,
    reason: row?.recovery?.reason === "band_not_worn" ? "awaiting_sleep_sync" : (row?.recovery?.reason ?? null),
    hrv: row?.metrics?.hrvMs ?? null,
    hrvBaseline: priorStats(rows, today, (r) => r.metrics?.hrvMs).mean,
    asleepMinutes: row?.sleep?.main?.asleepMin ?? null,
    strain: row?.s1?.effort == null ? null : toStrain(row.s1.effort),
    targetHigh: target?.reason === null ? target.high : null,
  });
}
