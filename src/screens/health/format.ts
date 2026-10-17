// Health formatting helpers, ported from Pulse's src/app/(app)/health/format.ts (tones are theme token names), and the
// Halo Age screen's small pure sums: the age scale's span and the week-on-week change.
import { formatValue } from "@/lib/format";
import { addDays } from "@/lib/time";
import type { CalmPalette } from "@/ui/calm";
import type { ColorToken } from "@/ui/theme";

/**
 * 78 → "78th", 22 → "22nd", 11 → "11th". English rules by hand: Hermes has no Intl.PluralRules (the web uses it),
 * so constructing one at module load crashes the app on Android.
 */
export const ordinal = (n: number) => {
  const r = Math.round(n);
  const tens = Math.abs(r) % 100;
  const ones = Math.abs(r) % 10;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
  return `${r}${suffix}`;
};

/** "2.3 years younger" / "1.0 years older" / "Same as your age" (spec §6), with its tone token. */
export function ageDelta(delta: number): { text: string; tone: ColorToken } {
  const v = formatValue("decimal1", Math.abs(delta));
  if (v === "0.0") return { text: "Same as your age", tone: "foregroundSecondary" };
  return delta < 0 ? { text: `${v} years younger`, tone: "optimal" } : { text: `${v} years older`, tone: "warning" };
}

/** The age scale's span: whole fives around both ages, with a few years of air either side, at least ten years wide. */
export function ageSpan(a: number, b: number): [number, number] {
  const lo = Math.floor((Math.min(a, b) - 4) / 5) * 5;
  const hi = Math.ceil((Math.max(a, b) + 4) / 5) * 5;
  return [lo, Math.max(hi, lo + 10)];
}

/**
 * The Halo Age a week before the shown one: the latest reading in the weekly `history` before `asOf`, if it falls within
 * the 7 days before it (an older one is not "last week"); null otherwise.
 */
export function weekBefore(history: readonly { day: string; value: number | null }[], asOf: string): number | null {
  const floor = addDays(asOf, -7);
  for (let i = history.length - 1; i >= 0; i--) {
    const p = history[i];
    if (p.day >= asOf || p.value === null) continue;
    return p.day >= floor ? p.value : null;
  }
  return null;
}

/** "excellent" (the core's key) → "Excellent". */
export const categoryWord = (c: string) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();

/** VO2 max category word colour (spec §7.6). */
export function categoryTone(c: string): ColorToken {
  const k = c.toLowerCase();
  return k === "excellent" || k === "superior" ? "optimal" : k === "good" ? "foreground" : "warning";
}

/** The VO2 max category word's Calm ink: excellent and superior in mint, good in ink, the rest in sand. */
export function categoryInk(c: CalmPalette, category: string): string {
  const t = categoryTone(category);
  return t === "optimal" ? c.tintInk.mint : t === "warning" ? c.tintInk.sand : c.ink;
}
