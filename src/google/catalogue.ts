// Google Health API v4 data types Pulse reads: the web app's src/server/sources/google/catalogue.ts (from Hælan's
// catalogue and probe findings), unchanged but for the generic `vo2-max`, which only the web's probe lists.
//
// One type wears three casings: kebab in the URL path (the key here), snake in the filter
// (`daily_resting_heart_rate.date`), camel in the response body (`dailyRestingHeartRate`).

/** The filterable member differs per type, and Google does not document it. A wrong member is a 400. */
export type FilterMember =
  | "date" // civil date in TZ
  | "sample_time.physical_time"
  | "interval.start_time"
  | "interval.end_time"
  | "interval.civil_start_time"; // civil datetime in TZ, no offset

export type DataType = {
  /** Member that `:list` filters on; null when the type answers only rollups. */
  member: FilterMember | null;
  /** Longest window one request may cover, in local days (list window or dailyRollUp range). */
  maxDays: number;
  /** `pageSize` sent on `:list`. The API may cap a page lower (Hælan saw 5,000 for heart-rate). */
  pageSize: number;
  /** Answers `:dailyRollUp` (POST, civil range, no pagination). */
  dailyRollUp: boolean;
};

const PAGE = 10_000;
const daily = { member: "date", maxDays: 90, pageSize: PAGE, dailyRollUp: false } as const;
const sample = { member: "sample_time.physical_time", maxDays: 90, pageSize: PAGE, dailyRollUp: false } as const;
const rollup = { member: null, maxDays: 14, pageSize: PAGE, dailyRollUp: true } as const;

export const DATA_TYPES = {
  // list for the nightly value; dailyRollUp for Google's personal range (restingHeartRatePersonalRange,
  // heartRateVariabilityPersonalRange), which the dailyRollUp reference returns "by default" for these types.
  "daily-heart-rate-variability": { ...daily, dailyRollUp: true },
  "daily-resting-heart-rate": { ...daily, dailyRollUp: true },
  // The day's Karvonen zone bounds (LIGHT, MODERATE, VIGOROUS, PEAK).
  "daily-heart-rate-zones": daily,
  "daily-respiratory-rate": daily,
  "daily-sleep-temperature-derivations": daily,
  "daily-oxygen-saturation": daily,
  "daily-vo2-max": daily,
  "run-vo2-max": sample,
  weight: sample,
  "body-fat": sample,
  // A night is windowed by when it ends: a window on bed time drops the night that crosses it.
  sleep: { member: "interval.end_time", maxDays: 90, pageSize: 25, dailyRollUp: false },
  exercise: { member: "interval.civil_start_time", maxDays: 90, pageSize: 25, dailyRollUp: false },
  // list for the band's samples; dailyRollUp for the all-source daily average (an extra metric).
  "heart-rate": { ...sample, maxDays: 14, dailyRollUp: true },
  // dailyRollUp gives Google's merged, worn-only daily total; list gives per-minute counts for movement gating.
  steps: { member: "interval.start_time", maxDays: 14, pageSize: PAGE, dailyRollUp: true },
  "total-calories": { member: null, maxDays: 14, pageSize: PAGE, dailyRollUp: true },
  // All-day time per zone (Pulse Age's activity terms).
  "time-in-heart-rate-zone": rollup,
  // Shown as extra metrics (src/queries/_lib.ts EXTRA_METRICS): daily roll-ups only, value paths from the RollupValue docs.
  distance: rollup,
  floors: rollup,
  altitude: rollup,
  "active-zone-minutes": rollup,
  "active-minutes": rollup,
  "active-energy-burned": rollup,
  "sedentary-period": rollup,
  "hydration-log": rollup,
  "nutrition-log": rollup,
  "blood-glucose": rollup,
  "core-body-temperature": rollup,
  "swim-lengths-data": rollup,
  // Heart-rhythm records and height: rare points, listed by time.
  // ECG filters on start time with `>=` only (buildFilter), so one window covers the whole range.
  electrocardiogram: { member: "interval.start_time", maxDays: 3650, pageSize: 25, dailyRollUp: false },
  // Sessions other than sleep and ECG filter on civil start time.
  "irregular-rhythm-notification": { member: "interval.civil_start_time", maxDays: 90, pageSize: 25, dailyRollUp: false },
  height: sample,
} as const satisfies Record<string, DataType>;

export type DataTypeId = keyof typeof DATA_TYPES;

export const DATA_TYPE_IDS = Object.keys(DATA_TYPES) as DataTypeId[];
