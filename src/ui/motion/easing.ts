// The kit's curves for UI-thread animations (Reanimated `withTiming`, which needs worklet easings). Same curves as
// `EASE` in timing.ts, which stays for the JS-side count-ups and the tests.
import { Easing } from "react-native-reanimated";

export const REASE = {
  /** Entrances: ease-out-expo (the web's `cubic-bezier(0.16,1,0.3,1)`). */
  outExpo: Easing.bezier(0.16, 1, 0.3, 1),
  /** The dials' 700 ms fill sweep, and every count-up that runs beside it. */
  fill: Easing.bezier(0, 0, 0.58, 1),
  /** Press and small state changes (spec §2.7 ease-standard). */
  standard: Easing.bezier(0.2, 0, 0, 1),
  /** Leaving: ease-in (an overlay's close). */
  exit: Easing.bezier(0.4, 0, 1, 1),
  outCubic: Easing.out(Easing.cubic),
  inQuad: Easing.in(Easing.quad),
  linear: Easing.linear,
} as const;

export type ReaseKey = keyof typeof REASE;
