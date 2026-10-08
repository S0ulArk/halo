// Pulse's small native helper (android/…/PulseBtModule.kt): the Bluetooth LE devices paired with the phone, and opening
// another app. Both are safe to call anywhere: without the native module (tests, web) they return nothing.
import { requireOptionalNativeModule } from "expo-modules-core";

type Native = { bondedDevices(): { id: string; name: string | null }[]; openApp(pkg: string): boolean };
const native = requireOptionalNativeModule<Native>("PulseBt");

/** LE devices paired with this phone, as { id: Bluetooth address, name }. */
export function bondedDevices(): { id: string; name: string | null }[] {
  try {
    return native?.bondedDevices() ?? [];
  } catch {
    return [];
  }
}

/** Opens the app with this package; false when it isn't installed or can't open. */
export function openApp(pkg: string): boolean {
  try {
    return native?.openApp(pkg) ?? false;
  } catch {
    return false;
  }
}
