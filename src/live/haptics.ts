// The felt cues of Breathe and Live Workout (expo-haptics; Android's vibrator under the app's VIBRATE permission).
// Breathe keeps noop's language (src/live/breath.ts): one light pulse on an inhale, two heavier ones on an exhale.
// Live Workout: a light tap to push, two firm ones to ease off, a success buzz on reaching the target's low end and
// a warning one past its top. Every call is fire-and-forget: a phone without a vibrator just stays quiet.
import * as Haptics from "expo-haptics";

/** Gap between the pulses of a two-pulse cue. */
const PULSE_GAP_MS = 140;

function pulses(n: number, style: Haptics.ImpactFeedbackStyle) {
  for (let i = 0; i < n; i++) setTimeout(() => void Haptics.impactAsync(style).catch(() => {}), i * PULSE_GAP_MS);
}

/** A breath cue of `loops` pulses (0 for a hold: nothing). */
export function breathCue(loops: number) {
  if (loops <= 0) return;
  pulses(loops, loops > 1 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}

export type CoachCue = "push" | "easeOff" | "low" | "high";

export function coachCue(cue: CoachCue) {
  switch (cue) {
    case "push":
      return pulses(1, Haptics.ImpactFeedbackStyle.Light);
    case "easeOff":
      return pulses(2, Haptics.ImpactFeedbackStyle.Heavy);
    case "low":
      return void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    case "high":
      return void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
}

/** The end of a breathing session. */
export const sessionDone = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
