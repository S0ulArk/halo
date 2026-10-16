// Type faces, in the iOS look: Inter for every word and every number (numbers with tabular figures, so a changing value
// never shifts), tracked the way Apple tracks San Francisco: a hair tighter as the size grows (see `iosTracking`). Doto,
// a dot-matrix display face, stays for the few hero numbers of the Signal design. One Barlow and one Figtree weight stay
// loaded only because a chart sets them by family name (TickScale), until it moves to Inter.
import { useFonts } from "expo-font";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { Figtree_500Medium } from "@expo-google-fonts/figtree";
import { Barlow_700Bold } from "@expo-google-fonts/barlow";
import { Doto_800ExtraBold } from "@expo-google-fonts/doto";
import type { TextStyle } from "react-native";

export type SansWeight = 400 | 500 | 600 | 700 | 800;
export type NumericWeight = 500 | 600 | 700 | 800;

const INTER: Record<SansWeight, string> = {
  400: "Inter_400Regular",
  500: "Inter_500Medium",
  600: "Inter_600SemiBold",
  700: "Inter_700Bold",
  800: "Inter_800ExtraBold",
};

/** Loads every face the kit uses, as expo-font's `[loaded, error]` tuple. Render nothing (or the splash) until `loaded`. */
export function useAppFonts(): readonly [loaded: boolean, error: Error | null] {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Figtree_500Medium,
    Barlow_700Bold,
    Doto_800ExtraBold,
  });
  return [loaded, error ?? null] as const;
}

/** From this size up a headline figure is set extra bold, as iOS sets its big hero numbers. */
const HERO_MIN = 44;

/** `fontVariant: ["tabular-nums"]`: every changing number uses it. */
export const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

/**
 * Inter's tracking at `size` px, in em, tuned to San Francisco's: about 0 at 12, −0.3 px at 16, −0.5 px at 22 and
 * −0.9 px at 34 (the iOS large title). Inter's own dynamic-metrics curve, nudged a step tighter.
 */
export const iosTracking = (size: number): number => -0.0273 + 0.185 * Math.exp(-0.1745 * size);

export const font = {
  /** Inter at `weight` (default 400). The weight lives in the family name; RN does not synthesise it. */
  sans: (weight: SansWeight = 400): TextStyle => ({ fontFamily: INTER[weight] }),
  /** Inter at `weight` (default 700), with tabular figures. */
  numeric: (weight: NumericWeight = 700): TextStyle => ({ fontFamily: INTER[weight], ...TABULAR }),
  /** Doto, the dot-matrix display face: hero numbers only (the Signal look), never body text. */
  display: (): TextStyle => ({ fontFamily: "Doto_800ExtraBold", ...TABULAR }),
  /**
   * A number of `size` px in Inter (tabular) at `weight`, tracked like iOS; a hero figure (44 px and up) is set extra
   * bold, as Apple sets its big numbers. Carries its fontSize and letter spacing.
   */
  numberAt: (size: number, weight: NumericWeight = 700): TextStyle => ({
    fontFamily: INTER[size >= HERO_MIN ? 800 : weight],
    fontSize: size,
    letterSpacing: size * iosTracking(size),
    ...TABULAR,
  }),
  /** The family name alone, for react-native-svg `<Text fontFamily>`. */
  sansFamily: (weight: SansWeight = 400) => INTER[weight],
  numericFamily: (weight: NumericWeight = 700) => INTER[weight],
};
