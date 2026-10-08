// What Live Workout starts from: today's stored scores as the pipeline left them (src/pipeline), read once when the
// workout starts so a sync during it can't count the same minutes twice.
import { defaultRestingHR } from "@/core/scoring/strain";
import { addDays } from "@/lib/time";
import type { DayRow } from "@/queries/common";

export type WorkoutSetup = {
  restingHr: number;
  maxHr: number;
  /** Today's Effort (0–100) so far; null before any is stored. */
  baseEffort: number | null;
  /** Today's Strain Target on 0–21, when there is one. */
  target: [number, number] | null;
  /** Today's Recovery (0–100), which gates the coach's heart-rate band. */
  recovery: number | null;
  /** Today has heart rate from Health Connect (else the workout starts the day's Strain from 0). */
  synced: boolean;
  /** The profile's sex: Banister's weighting in Live Strain differs by it (strain.ts). */
  sex: string;
};

/**
 * Today's resting and max heart rate as stage 1 used them for the day's Strain (so the live zones match Home's);
 * before today has a row, the newest resting HR of the week before and the profile's max. `rows` are by day.
 */
export function workoutSetup(
  rows: ReadonlyMap<string, Pick<DayRow, "s1" | "strainTarget" | "recovery">>,
  today: string,
  fallbackMaxHr: number,
  sex = "male",
): WorkoutSetup {
  const row = rows.get(today);
  const s1 = row?.s1 ?? null;
  let restingHr = s1?.restingHr ?? null;
  for (let k = 1; restingHr === null && k <= 7; k++) restingHr = rows.get(addDays(today, -k))?.s1?.restingHr ?? null;
  const t = row?.strainTarget;
  return {
    restingHr: restingHr ?? defaultRestingHR,
    maxHr: s1?.maxHr ?? fallbackMaxHr,
    baseEffort: s1 && s1.hrCount > 0 ? s1.effort : null,
    target: t && t.reason === null ? [t.low, t.high] : null,
    recovery: row?.recovery?.value ?? null,
    synced: !!s1 && s1.hrCount > 0,
    sex,
  };
}
