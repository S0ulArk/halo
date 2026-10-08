// Metric families and their accent colours, in one place. A family colours a metric's icon and small marks (an
// accent bar, an icon's tinted backdrop, a hairline); text always stays on the foreground colours. Rows and cards
// find their family from the metric key or, when a screen passes none, from the label they show, so screens need
// no changes to pick the colours up.
import * as React from "react";
import { DATA_COLORS, dialColor, STRESS_COLOR, stressLevel } from "@/lib/bands";
import type { ColorToken, Scheme, Tokens } from "@/ui/theme";

export type AccentFamily = "sleep" | "recovery" | "strain" | "heart" | "activity" | "body" | "stress";

/** Each family's colour token. Recovery and stress follow their bands when a value is given (`accentToken`). */
export const ACCENT_TOKEN: Record<AccentFamily, ColorToken> = {
  sleep: "sleep",
  recovery: "recoveryGreen",
  strain: "strain",
  heart: "heart",
  activity: "primaryInk",
  body: "body",
  stress: "stressMedium",
};

/** Metric key → family: the query layer's KeyStat, dashboard, vital and contributor keys. */
export const METRIC_FAMILY: Record<string, AccentFamily> = {
  // Sleep
  sleep: "sleep",
  sleepPerformance: "sleep",
  hours: "sleep",
  sleepHours: "sleep",
  consistency: "sleep",
  sri: "sleep",
  efficiency: "sleep",
  restorative: "sleep",
  timeInBed: "sleep",
  wakeEvents: "sleep",
  debt: "sleep",
  awake: "sleep",
  rem: "sleep",
  light: "sleep",
  deep: "sleep",
  // Recovery
  recovery: "recovery",
  // Strain and fitness
  strain: "strain",
  target: "strain",
  zones13: "strain",
  zones45: "strain",
  zone13: "strain",
  zone45: "strain",
  strength: "strain",
  vo2max: "strain",
  pace: "strain",
  // Heart and vitals
  hrv: "heart",
  rhr: "heart",
  restingHr: "heart",
  resp: "heart",
  spo2: "heart",
  skin: "heart",
  skinTemp: "heart",
  skinTempDev: "heart",
  avg_hr: "heart",
  glucose: "heart",
  core_temp: "heart",
  // Activity
  steps: "activity",
  calories: "activity",
  distance: "activity",
  floors: "activity",
  elevation: "activity",
  active_minutes: "activity",
  light_minutes: "activity",
  azm: "activity",
  active_calories: "activity",
  sedentary_minutes: "activity",
  swim_strokes: "activity",
  // Body and nutrition
  weight: "body",
  body_fat: "body",
  leanMass: "body",
  fatMass: "body",
  water: "body",
  calories_in: "body",
  protein: "body",
  carbs: "body",
  fat: "body",
  // Stress
  stress: "stress",
};

/**
 * The labels screens show for those metrics (matched without case), so a row that only knows its label still finds
 * its family. Labels that could mean anything ("Total", "Highest") are deliberately absent: they stay uncoloured.
 */
const LABEL_KEY: Record<string, string> = {
  // The scores themselves
  sleep: "sleep",
  recovery: "recovery",
  strain: "strain",
  stress: "stress",
  // Sleep screen and Healthspan
  "sleep performance": "sleep",
  "hours vs. needed": "hours",
  "hours of sleep": "sleepHours",
  "sleep consistency": "consistency",
  "sleep efficiency": "efficiency",
  "restorative sleep": "restorative",
  "time in bed": "timeInBed",
  "wake events": "wakeEvents",
  "sleep debt": "debt",
  "avg sleep": "sleep",
  // Recovery
  "avg recovery": "recovery",
  // Strain screen, Healthspan, Fitness
  "strain target": "target",
  "avg strain": "strain",
  "heart rate zones 1-3": "zones13",
  "heart rate zones 4-5": "zones45",
  "strength activity time": "strength",
  "vo2 max": "vo2max",
  // Vitals (Home dashboard, Health Monitor tiles, Recovery contributors)
  "heart rate variability": "hrv",
  hrv: "hrv",
  "resting heart rate": "rhr",
  rhr: "rhr",
  "respiratory rate": "resp",
  "blood oxygen": "spo2",
  "skin temperature": "skin",
  "skin temp (from baseline)": "skinTempDev",
  "average heart rate": "avg_hr",
  "blood glucose": "glucose",
  "core temperature": "core_temp",
  // Activity
  steps: "steps",
  "daily steps": "steps",
  calories: "calories",
  distance: "distance",
  floors: "floors",
  "elevation gain": "elevation",
  "active minutes": "active_minutes",
  "light activity": "light_minutes",
  "active zone minutes": "azm",
  "active calories": "active_calories",
  "sedentary time": "sedentary_minutes",
  "swim strokes": "swim_strokes",
  // Body and nutrition
  weight: "weight",
  "body fat": "body_fat",
  "lean body mass": "leanMass",
  "body fat mass": "fatMass",
  water: "water",
  "calories eaten": "calories_in",
  protein: "protein",
  carbohydrates: "carbs",
  fat: "fat",
};

/** A metric key's family, or a shown label's ("Resting heart rate" → heart). Null when neither is known. */
export function accentFamily(keyOrLabel: string | null | undefined): AccentFamily | null {
  if (!keyOrLabel) return null;
  const direct = METRIC_FAMILY[keyOrLabel];
  if (direct) return direct;
  const key = LABEL_KEY[keyOrLabel.trim().toLowerCase()];
  return key ? (METRIC_FAMILY[key] ?? null) : null;
}

/**
 * A family's colour token. Recovery takes its band's colour and stress its level's when the value is a score of
 * theirs (0-100 and 0-3); without a value they fall back to the family colour.
 */
export function accentToken(family: AccentFamily, value?: number | null): ColorToken {
  const known = value !== null && value !== undefined && Number.isFinite(value);
  if (family === "recovery" && known && value >= 0 && value <= 100) return DATA_COLORS[dialColor("recovery", value)].fill;
  if (family === "stress" && known && value >= 0 && value <= 3) return DATA_COLORS[STRESS_COLOR[stressLevel(value)]].fill;
  return ACCENT_TOKEN[family];
}

/** A family's colour in the active theme. */
export const accentColor = (c: Tokens, family: AccentFamily, value?: number | null): string => c[accentToken(family, value)];

/**
 * The tinted disc behind an accented icon: the accent at this opacity (lighter on the light theme's white cards). Dark
 * runs a little stronger, since a tint over a near-black card falls toward black.
 */
export const ACCENT_BACKDROP: Record<Scheme, number> = { dark: 0.16, light: 0.1 };

// A screen's own family (Sleep, Recovery, Strain…), for the few marks that take the page's colour rather than a
// metric's: the insight card's hairline. Nothing sets it by default, so those marks keep their neutral look.
const ScreenAccent = React.createContext<AccentFamily | null>(null);

/** Gives everything under it the screen's family (`<AccentScope family="sleep">`). */
export function AccentScope({ family, children }: { family: AccentFamily | null; children: React.ReactNode }) {
  return React.createElement(ScreenAccent.Provider, { value: family }, children);
}

/** The family an enclosing `AccentScope` set, or null. */
export const useScreenAccent = (): AccentFamily | null => React.useContext(ScreenAccent);
