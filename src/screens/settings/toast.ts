// The web's sonner toasts ("Profile saved", "Dashboard saved") as Android's own toast; other platforms log.
import { Platform, ToastAndroid } from "react-native";

export function toast(message: string) {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
  else console.log("[toast]", message);
}
