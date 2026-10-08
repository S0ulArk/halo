// Health formatting helpers, ported from Pulse's src/app/(app)/health/format.ts. Tones are theme token names.
import { formatValue } from "@/lib/format";
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
