package app.pulse.bt

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Two things react-native-ble-plx can't do: list the Bluetooth LE devices already paired with the phone (a Fitbit
 * Air paired to Google Health keeps its link and may not advertise, so a scan never sees it), and open another app
 * by its package (Google Health, where Share heart rate lives).
 */
class PulseBtModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PulseBt")

    Function("bondedDevices") { bonded() }

    Function("openApp") { pkg: String -> open(pkg) }
  }

  /** Paired LE (or dual-mode) devices as { id: address, name }. Empty without Bluetooth or the Nearby devices permission. */
  @SuppressLint("MissingPermission")
  private fun bonded(): List<Map<String, String?>> {
    val ctx = appContext.reactContext ?: return emptyList()
    val adapter = (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter ?: return emptyList()
    return try {
      adapter.bondedDevices.orEmpty()
        .filter { it.type == BluetoothDevice.DEVICE_TYPE_LE || it.type == BluetoothDevice.DEVICE_TYPE_DUAL }
        .map { mapOf("id" to it.address, "name" to it.name) }
    } catch (e: SecurityException) {
      emptyList()
    }
  }

  private fun open(pkg: String): Boolean {
    val ctx = appContext.reactContext ?: return false
    val intent = ctx.packageManager.getLaunchIntentForPackage(pkg) ?: return false
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      ctx.startActivity(intent)
      true
    } catch (e: Exception) {
      false
    }
  }
}
