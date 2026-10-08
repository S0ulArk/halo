// Band and tone logic for data colour (spec §2.3, §5.0), ported from the web app. Colour is a data channel:
// every helper returns a meaning first and a theme TOKEN NAME second; `useTheme().c[token]` resolves it.
import { acwrBand, type AcwrBand } from "@/core/scoring/readiness";
import type { ColorToken } from "@/ui/theme";

/** Data tokens. `fill` paints shapes; `text` paints type (red text uses the lifted --recovery-red-text). */
export const DATA_COLORS = {
  "recovery-green": { fill: "recoveryGreen", text: "recoveryGreen" },
  "recovery-yellow": { fill: "recoveryYellow", text: "recoveryYellow" },
  "recovery-red": { fill: "recoveryRed", text: "recoveryRedText" },
  strain: { fill: "strain", text: "strainText" },
  sleep: { fill: "sleep", text: "sleep" },
  optimal: { fill: "optimal", text: "optimal" },
  warning: { fill: "warning", text: "warning" },
  "stress-low": { fill: "stressLow", text: "stressLow" },
  "stress-medium": { fill: "stressMedium", text: "stressMedium" },
  "stress-high": { fill: "stressHigh", text: "stressHigh" },
  "stage-awake": { fill: "stageAwake", text: "stageAwake" },
  "stage-rem": { fill: "stageRem", text: "stageRem" },
  "stage-light": { fill: "stageLight", text: "stageLight" },
  "stage-deep": { fill: "stageDeep", text: "stageDeep" },
  "energy-active": { fill: "energyActive", text: "energyActive" },
  "energy-resting": { fill: "energyResting", text: "energyResting" },
  "chart-5": { fill: "chart5", text: "chart5" },
  muted: { fill: "mutedForeground", text: "mutedForeground" },
} as const satisfies Record<string, { fill: ColorToken; text: ColorToken }>;
export type DataColor = keyof typeof DATA_COLORS;

// --- Recovery (and Energy Bank, which bands exactly like Recovery) ---

export type RecoveryBand = "green" | "yellow" | "red";

/** ≥ 67 green, 34-66 yellow, below 34 red. 66.9 is yellow, 33.9 is red. */
export function recoveryBand(value: number): RecoveryBand {
  if (value >= 67) return "green";
  if (value >= 34) return "yellow";
  return "red";
}

/** What a recovery band means, in words (Pulse's own: WHOOP names its bands by colour). */
export const BAND_WORD: Record<RecoveryBand, string> = { green: "Ready", yellow: "Steady", red: "Recover" };
export const BAND_COLOR: Record<RecoveryBand, DataColor> = {
  green: "recovery-green",
  yellow: "recovery-yellow",
  red: "recovery-red",
};
export const recoveryColor = (value: number): DataColor => BAND_COLOR[recoveryBand(value)];

/** Dial fill: Recovery by band; Strain and Sleep have one hue each, whatever the value. */
export function dialColor(variant: "recovery" | "strain" | "sleep", value: number): DataColor {
  if (variant === "recovery") return recoveryColor(value);
  return variant;
}

// --- Stress 0-3 ---

export type StressLevel = "low" | "medium" | "high";
export function stressLevel(value: number): StressLevel {
  if (value >= 2) return "high";
  if (value >= 1) return "medium";
  return "low";
}
export const STRESS_WORD: Record<StressLevel, string> = { low: "Low", medium: "Medium", high: "High" };
export const STRESS_COLOR: Record<StressLevel, DataColor> = {
  low: "stress-low",
  medium: "stress-medium",
  high: "stress-high",
};

// --- Direction-aware deltas (KeyStatRow, ContributorRow, TrendChart) ---

/** Which way is good. `neutral` still shows the arrow direction, never a good/bad tone. */
export type GoodDirection = "up" | "down" | "neutral" | "toward_zero";
export type Tone = "good" | "bad" | "neutral";
export type DeltaDir = "up" | "down" | "flat";

/** Good directions per metric (spec §5.0). */
export const GOOD_DIRECTION = {
  hrv: "up",
  resting_hr: "down",
  respiratory_rate: "neutral",
  sleep_performance: "up",
  hours: "up",
  consistency: "up",
  efficiency: "up",
  calories: "neutral",
  steps: "up",
  spo2: "up",
  skin_temp: "toward_zero",
  strain: "neutral",
  vo2max: "up",
  stress: "down",
  energy: "up",
} as const satisfies Record<string, GoodDirection>;

/**
 * Tone of `value` against `average`. Inside ±1 σ is neutral (dir "flat"); outside, the metric's good
 * direction decides. Without `sd` the band is zero: any difference gets a direction and a tone.
 */
export function deltaTone(direction: GoodDirection, value: number, average: number, sd = 0): { dir: DeltaDir; tone: Tone } {
  const diff = value - average;
  if (Math.abs(diff) <= Math.abs(sd)) return { dir: "flat", tone: "neutral" };
  const dir: DeltaDir = diff > 0 ? "up" : "down";
  if (direction === "neutral") return { dir, tone: "neutral" };
  if (direction === "toward_zero") return { dir, tone: Math.abs(value) < Math.abs(average) ? "good" : "bad" };
  return { dir, tone: (direction === "up") === (dir === "up") ? "good" : "bad" };
}

/** Text token of a tone: good optimal, bad warning, neutral secondary (DeltaMark, diff text). */
export const TONE_TEXT: Record<Tone, ColorToken> = { good: "optimal", bad: "warning", neutral: "foregroundSecondary" };

// --- Status chips (spec §5.0) ---

export type ChipTone = "optimal" | "warning" | "alert" | "neutral";
/** Chip paint: `bg` at `bgAlpha`, text in `text` (the web's `bg-optimal/15 text-optimal` and friends). */
export const CHIP_TONE: Record<ChipTone, { bg: ColorToken; bgAlpha: number; text: ColorToken }> = {
  optimal: { bg: "optimal", bgAlpha: 0.15, text: "optimal" },
  warning: { bg: "warning", bgAlpha: 0.15, text: "warning" },
  alert: { bg: "recoveryRed", bgAlpha: 0.15, text: "recoveryRedText" },
  neutral: { bg: "secondary", bgAlpha: 1, text: "foregroundSecondary" },
};

const ACWR_TONE: Record<AcwrBand, ChipTone> = { LOAD_RAMPING_DOWN: "neutral", LOAD_SWEET_SPOT: "optimal", LOAD_BUILDING_FAST: "warning", LOAD_SPIKING: "alert" };

/** Training load (ACWR) chip tone from the shared `acwrBand`: below 0.8 neutral, [0.8, 1.3) optimal, [1.3, 1.5) warning, then alert. */
export const acwrTone = (acwr: number): ChipTone => ACWR_TONE[acwrBand(acwr)];
