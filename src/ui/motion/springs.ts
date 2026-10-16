// The kit's springs, in Apple's terms: a spring is a `response` (seconds, the period of the undamped oscillation, so how
// quickly it gets there) and a `dampingFraction` (1 never overshoots; 0.8 to 0.9 lands with the faint settle iOS has).
// They convert to Reanimated's physical spring config (`withSpring(to, SPRING.snappy)`), so every spring in the app
// moves like a SwiftUI `.spring(response:dampingFraction:)`. Pure maths, no React Native imports, so vitest runs it.

/** A Reanimated `withSpring` config: a mass on a spring with a damper. */
export type SpringConfig = { mass: number; stiffness: number; damping: number; overshootClamping?: boolean };

/**
 * SwiftUI's spring (`response` in seconds, `dampingFraction` 0 to 1) as a physical spring of mass 1: the stiffness that
 * gives the response's period, k = (2π / response)², and the damping that gives the fraction, c = 4π ζ / response.
 */
export function iosSpring(response: number, dampingFraction: number): SpringConfig {
  const w = (2 * Math.PI) / response;
  return { mass: 1, stiffness: w * w, damping: 2 * dampingFraction * w };
}

export const SPRING = {
  /** A finger landing: the press settles in at once, with no overshoot (0.18 s, critically damped). */
  pressIn: iosSpring(0.18, 1),
  /** Letting go: back to rest with the faintest overshoot (0.4 s, 0.72). */
  release: iosSpring(0.4, 0.72),
  /** A control changing state (a switch's knob, a segmented control's thumb): quick and firm (0.35 s, 0.86). */
  snappy: iosSpring(0.35, 0.86),
  /** A larger move (a header settling, a card resizing): unhurried, no visible bounce (0.5 s, 0.9). */
  smooth: iosSpring(0.5, 0.9),
} as const;
