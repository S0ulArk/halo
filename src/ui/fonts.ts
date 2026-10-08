// Type faces (spec §3): Figtree for text, Barlow for numerals (always with tabular figures where a number changes), and
// Doto, a dot-matrix display face, for the hero numbers of the Signal design.
import { useFonts } from "expo-font";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
} from "@expo-google-fonts/figtree";
import { Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from "@expo-google-fonts/barlow";
import { Doto_800ExtraBold } from "@expo-google-fonts/doto";
import type { TextStyle } from "react-native";

export type SansWeight = 400 | 500 | 600 | 700 | 800;
export type NumericWeight = 500 | 600 | 700;

const SANS: Record<SansWeight, string> = {
  400: "Figtree_400Regular",
  500: "Figtree_500Medium",
  600: "Figtree_600SemiBold",
  700: "Figtree_700Bold",
  800: "Figtree_800ExtraBold",
};
const NUMERIC: Record<NumericWeight, string> = {
  500: "Barlow_500Medium",
  600: "Barlow_600SemiBold",
  700: "Barlow_700Bold",
};

/** Loads every face the kit uses, as expo-font's `[loaded, error]` tuple. Render nothing (or the splash) until `loaded`. */
export function useAppFonts(): readonly [loaded: boolean, error: Error | null] {
  const [loaded, error] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    Doto_800ExtraBold,
  });
  return [loaded, error ?? null] as const;
}

/** From this size up a number is a headline figure, set a step lighter (numberAt). */
export const DISPLAY_MIN = 28;

/** `fontVariant: ["tabular-nums"]`: every changing number uses it (spec §3.3). */
export const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

export const font = {
  /** Figtree at `weight` (default 400). The weight lives in the family name; RN does not synthesise it. */
  sans: (weight: SansWeight = 400): TextStyle => ({ fontFamily: SANS[weight] }),
  /** Barlow at `weight` (default 700), with tabular figures. */
  numeric: (weight: NumericWeight = 700): TextStyle => ({ fontFamily: NUMERIC[weight], ...TABULAR }),
  /** Doto, the dot-matrix display face: hero numbers only (the Signal look), never body text. */
  display: (): TextStyle => ({ fontFamily: "Doto_800ExtraBold", ...TABULAR }),
  /**
   * A number of `size` px in Barlow (tabular): a large number (DISPLAY_MIN and up) a step lighter at `weight` − 100, so
   * a headline figure reads clean and modern rather than heavy; a small one at `weight`. Carries its fontSize.
   */
  numberAt: (size: number, weight: NumericWeight = 600): TextStyle => ({
    fontFamily: NUMERIC[size >= DISPLAY_MIN ? (Math.max(500, weight - 100) as NumericWeight) : weight],
    fontSize: size,
    ...TABULAR,
  }),
  /** The family name alone, for react-native-svg `<Text fontFamily>`. */
  sansFamily: (weight: SansWeight = 400) => SANS[weight],
  numericFamily: (weight: NumericWeight = 700) => NUMERIC[weight],
};
