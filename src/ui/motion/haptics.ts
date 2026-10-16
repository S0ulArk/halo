// The kit's light touches (expo-haptics), so every control answers the finger the same way: a tick when a selection
// changes, a toggle's click, a soft tap for a confirmation. On Android they go through the view's own haptic feedback
// (`performAndroidHapticsAsync`), which follows the person's touch-feedback setting and needs no vibrate permission; a
// constant the phone's Android does not have falls back to the clock tick every version has. Fire and forget: a phone
// without haptics stays silent.
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const A = Haptics.AndroidHaptics;

function android(type: Haptics.AndroidHaptics) {
  Haptics.performAndroidHapticsAsync(type).catch(() => Haptics.performAndroidHapticsAsync(A.Clock_Tick).catch(() => {}));
}

export const haptic = {
  /** A selection changed: a segmented control's thumb, a picker's value. */
  select() {
    if (Platform.OS === "android") android(A.Segment_Tick);
    else Haptics.selectionAsync().catch(() => {});
  },
  /** A switch turned on or off. */
  toggle(on: boolean) {
    if (Platform.OS === "android") android(on ? A.Toggle_On : A.Toggle_Off);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Something was confirmed: a sheet's Done, a saved form. */
  confirm() {
    if (Platform.OS === "android") android(A.Confirm);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
