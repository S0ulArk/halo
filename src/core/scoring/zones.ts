// Display heart-rate zones and time-in-zone: five zones on heart-rate reserve (Karvonen), the same 50/60/70/80/90%
// edges as Strain's Edwards zones (strain.ts) and as WHOOP. A zone's lower bound in bpm is
// resting + share × (max − resting). Time-in-zone ports noop's HrZones.kt.
import type { HrSample } from "./types";

export const ZONE_NAMES = ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5"] as const;

export interface HrZone {
  /** 1..5. */
  number: number;
  /** Inclusive, bpm. */
  lower: number;
  /** Exclusive except for the top zone. */
  upper: number;
}

export interface HrZoneSet {
  zones: HrZone[];
  maxHR: number;
  restingHR: number;
}

export interface TimeInZone {
  /** Seconds per zone (seconds[0] is Zone 1). */
  seconds: number[];
  /** Below Zone 1 (under 40 % of reserve): WHOOP's "Zone 0". */
  belowZone1: number;
}

/**
 * Lower edges as a share of heart-rate reserve (published, WHOOP 2024-11-21): Zone 1 40–60 %, Zone 2 60–70, Zone 3
 * 70–80, Zone 4 80–90, Zone 5 90–100. Zone 1's 40 % is also ACSM's moderate floor (src/pipeline/intensity.ts).
 */
export const zoneEdges = [0.4, 0.6, 0.7, 0.8, 0.9];

/** Five zones from resting and max heart rate. A reserve under 1 bpm (bad profile data) is treated as 1. */
export function zones(restingHR: number, maxHR: number): HrZoneSet {
  const reserve = Math.max(1, maxHR - restingHR);
  const lower = zoneEdges.map((e) => restingHR + e * reserve);
  return {
    zones: lower.map((l, i) => ({ number: i + 1, lower: l, upper: i < lower.length - 1 ? lower[i + 1] : Math.max(maxHR, l) })),
    maxHR,
    restingHR,
  };
}

/** Zone 1..5 for a bpm, or 0 below zone 1. The top zone is open-ended. */
export function zoneNumber(set: HrZoneSet, bpm: number): number {
  for (let i = set.zones.length - 1; i >= 0; i--) if (bpm >= set.zones[i].lower) return set.zones[i].number;
  return 0;
}

/**
 * Seconds per zone. Each sample holds until the next, capped at the median interval; the last sample gets
 * the median interval.
 */
export function timeInZone(hr: HrSample[], zoneSet: HrZoneSet): TimeInZone {
  const sorted = [...hr].sort((a, b) => a.ts - b.ts);
  const seconds = zoneSet.zones.map(() => 0);
  let below = 0.0;
  if (sorted.length === 0) return { seconds, belowZone1: 0.0 };
  const tail = medianInterval(sorted);
  for (let i = 0; i < sorted.length; i++) {
    let dur = tail;
    if (i < sorted.length - 1) {
      const gap = sorted[i + 1].ts - sorted[i].ts;
      dur = gap > 0 ? Math.min(gap, tail) : tail;
    }
    const z = zoneNumber(zoneSet, sorted[i].bpm);
    if (z >= 1) seconds[z - 1] += dur;
    else below += dur;
  }
  return { seconds, belowZone1: below };
}

/** Median gap among plausible (0, 300 s) gaps; 1 s when there are none. */
export function medianInterval(sorted: HrSample[]): number {
  if (sorted.length < 2) return 1.0;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i].ts - sorted[i - 1].ts;
    if (g > 0 && g < 300) gaps.push(g);
  }
  if (gaps.length === 0) return 1.0;
  gaps.sort((a, b) => a - b);
  return Math.max(gaps[Math.floor(gaps.length / 2)], 1.0);
}

export const totalSeconds = (t: TimeInZone): number => t.seconds.reduce((a, b) => a + b, 0) + t.belowZone1;

export const secondsInZone = (t: TimeInZone, zone: number): number => (zone < 1 || zone > t.seconds.length ? 0.0 : t.seconds[zone - 1]);
