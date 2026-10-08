// Tonight's sleep need and the bedtimes that reach 100 %, 85 % and 70 % of it before the typical wake time. The need is
// Halo's implementation of WHOOP's published structure (patent US12318226B2, granted 2025-06-03; The Locker, "How much
// sleep do you need", 2026-02-12): baseline + a strain term + a capped debt term − today's naps. Bedtimes follow WHOOP's
// Sleep Planner (Peak 100 %, Perform 85 %, Get By 70 %), worked back through the person's efficiency and the time they
// usually take to fall asleep.

export const sleepPlannerConfig = {
  /**
   * The strain term, hours: maxHours / (1 + e^((mid − S) / width)) for Day Strain S on 0–21. Published in WHOOP's patent
   * (US12318226B2) as 1.7 / (1 + e^((17 − S) / 3.5)); the patent says minutes, but only hours give sensible values
   * (inferred, docs/research/whoop-garmin.md W-6): S = 11 → 16 min, 14 → 30, 18 → 58, 21 → 77.
   */
  strainTerm: { maxHours: 1.7, mid: 17, width: 3.5 },
  /**
   * The debt term: this share of the debt, at most debtCapMin. The patent says the debt term is capped without saying
   * where; 0.5 and 60 minutes are a guess (docs/research/whoop-garmin.md C5, 2026-10-09).
   */
  debtRepayShare: 0.5,
  debtCapMin: 60,
  /** Tonight's need stays in this range, hours (calibrated: Garmin's Sleep Coach floor of 6.5 h; WHOOP's needs above 10 h are rare). */
  needRangeHours: [6.5, 11] as readonly [number, number],
  /** Nights behind the typical wake time and efficiency (spec). */
  windowNights: 14,
  /** Efficiency when no night has one (*tunable*). */
  defaultEfficiency: 0.9,
  /** Shares of need to plan bedtimes for (spec). */
  shares: [1, 0.85, 0.7],
};

export interface WakeNight {
  /** yyyy-MM-dd of the wake day. */
  day: string;
  /** Local wake time, minutes after midnight. */
  wakeMin: number;
  /** Asleep / in bed, 0–1, or null. */
  efficiency: number | null;
  /** Minutes from getting into bed to the first sleep, or null (a night without stages). */
  latencyMin?: number | null;
  /** Minutes in bed, with latencyMin: the night's efficiency after it fell asleep is asleep / (in bed − latency). */
  inBedMin?: number | null;
}

export interface SleepPlannerInput {
  /** personalizedNeedHours for tonight. */
  baselineNeedHours: number;
  /** Today's Day Strain, 0–21, or null without one. */
  strain: number | null;
  /** ledger(...).magnitudeMin as of this morning. */
  debtMin: number;
  /** Minutes asleep in today's naps. */
  napMin: number;
  /** Recent main sleeps, oldest first; the last `windowNights` are used. */
  nights: WakeNight[];
  /** yyyy-MM-dd of tomorrow, the wake day being planned for. */
  wakeDay: string;
}

export interface BedtimePlan {
  /** 1, 0.85 or 0.7. */
  share: number;
  /** Minutes asleep the plan delivers. */
  sleepMin: number;
  /** Minutes in bed: the typical minutes to fall asleep, then sleepMin ÷ the efficiency after falling asleep. */
  inBedMin: number;
  /** Minutes from the wake day's local midnight; negative is the evening before (−90 is 22:30). */
  bedtimeMin: number;
}

export interface SleepPlan {
  needMin: number;
  parts: { baselineMin: number; strainMin: number; debtMin: number; napMin: number };
  /** Typical wake time for `wakeDay`, minutes after local midnight; null without nights. */
  wakeMin: number | null;
  weekend: boolean;
  efficiency: number;
  /** The typical minutes to fall asleep (median of the recent nights with stages), 0 without any. */
  latencyMin: number;
  /** 100 % first (earliest bedtime). Empty when wakeMin is null. */
  plans: BedtimePlan[];
}

/** The strain term in minutes for a Day Strain on 0–21 (WHOOP's patent sigmoid, sleepPlannerConfig.strainTerm). */
export function strainNeedMin(strain: number | null): number {
  if (strain == null) return 0;
  const t = sleepPlannerConfig.strainTerm;
  return (60 * t.maxHours) / (1 + Math.exp((t.mid - strain) / t.width));
}

/** The debt term in minutes: half the debt, at most an hour. */
export const debtNeedMin = (debtMin: number): number =>
  Math.min(Math.max(0, debtMin) * sleepPlannerConfig.debtRepayShare, sleepPlannerConfig.debtCapMin);

/** Saturday or Sunday. */
export const isWeekendDay = (day: string): boolean => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function sleepPlan(input: SleepPlannerInput): SleepPlan {
  const c = sleepPlannerConfig;
  const parts = {
    baselineMin: input.baselineNeedHours * 60,
    strainMin: strainNeedMin(input.strain),
    debtMin: debtNeedMin(input.debtMin),
    napMin: Math.max(0, input.napMin),
  };
  const [lo, hi] = c.needRangeHours;
  const needMin = Math.min(hi * 60, Math.max(lo * 60, parts.baselineMin + parts.strainMin + parts.debtMin - parts.napMin));

  const recent = input.nights.slice(-c.windowNights);
  const weekend = isWeekendDay(input.wakeDay);
  const sameKind = recent.filter((n) => isWeekendDay(n.day) === weekend);
  // No night of tomorrow's kind yet: fall back to every recent night.
  const wakeMin = median((sameKind.length ? sameKind : recent).map((n) => n.wakeMin));
  const efficiency = median(recent.flatMap((n) => (n.efficiency != null && n.efficiency > 0 ? [n.efficiency] : []))) ?? c.defaultEfficiency;
  const latencyMin = median(recent.flatMap((n) => (n.latencyMin != null && n.latencyMin >= 0 ? [n.latencyMin] : []))) ?? 0;
  // Time in bed = minutes to fall asleep + sleep ÷ the efficiency after falling asleep. A night's efficiency counts its
  // latency as time awake in bed, so with a typical latency the latency is taken out of it first (else it counts twice).
  const asleepEfficiency =
    latencyMin > 0
      ? (median(
          recent.flatMap((n) =>
            n.efficiency != null && n.efficiency > 0 && n.latencyMin != null && n.inBedMin != null && n.inBedMin > n.latencyMin
              ? [Math.min(1, (n.efficiency * n.inBedMin) / (n.inBedMin - n.latencyMin))]
              : [],
          ),
        ) ?? efficiency)
      : efficiency;

  const plans =
    wakeMin == null
      ? []
      : c.shares.map((share) => {
          const sleepMin = share * needMin;
          const inBedMin = latencyMin + sleepMin / asleepEfficiency;
          return { share, sleepMin, inBedMin, bedtimeMin: wakeMin - inBedMin };
        });
  return { needMin, parts, wakeMin, weekend, efficiency, latencyMin, plans };
}
