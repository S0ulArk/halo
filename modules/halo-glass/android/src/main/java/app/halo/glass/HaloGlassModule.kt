package app.halo.glass

import android.os.Build
import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Halo's Liquid Glass: two views. HaloGlassTargetView wraps the content that glass floats over (the tab pages) and
 * records it once per redraw; HaloGlassView draws that recording through an AGSL lens (API 33+), a plain blur (API
 * 31–32) or a translucent fill (older, or no target), with a lit rim. The JS side is src/ui/glass.tsx.
 *
 * It also asks for the display's high refresh rate while Halo draws. Phones such as ColorOS ones keep 120 Hz only
 * while a finger moves and drop animations that play on their own (a ring sweeping in, a sheet settling) to 60 Hz.
 * Android 15+ lets a view vote for the high frame-rate category; the vote counts only on frames where the window
 * draws, so a still screen can still idle down and save battery, like ProMotion.
 */
class HaloGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HaloGlass")

    OnActivityEntersForeground {
      val activity = appContext.currentActivity ?: return@OnActivityEntersForeground
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
        activity.runOnUiThread {
          activity.window?.decorView?.setRequestedFrameRate(View.REQUESTED_FRAME_RATE_CATEGORY_HIGH)
        }
      }
    }

    View(HaloGlassTargetView::class) {
      Name("HaloGlassTargetView")
    }

    View(HaloGlassView::class) {
      Name("HaloGlassView")

      // The react tag of the HaloGlassTargetView to refract; null draws the fallback material.
      Prop("targetId") { view: HaloGlassView, id: Int? -> view.targetId = id }
      // Corner radius in dp; negative for a capsule (half the short side).
      Prop("cornerRadius") { view: HaloGlassView, dp: Float -> view.cornerRadiusDp = dp }
      // The tint as an ARGB int (processColor), and how much of it lies over the backdrop (0–1).
      Prop("tintColor") { view: HaloGlassView, color: Int -> view.tintColor = color }
      Prop("frost") { view: HaloGlassView, frost: Float -> view.frost = frost.coerceIn(0f, 1f) }
      // The lens strength (0–1) and the blur under it (RenderEffect radius, dp).
      Prop("refraction") { view: HaloGlassView, refraction: Float -> view.refraction = refraction.coerceIn(0f, 1f) }
      Prop("blurRadius") { view: HaloGlassView, dp: Float -> view.blurRadiusDp = dp.coerceIn(0f, 40f) }
      Prop("saturation") { view: HaloGlassView, saturation: Float -> view.saturation = saturation.coerceIn(0f, 3f) }
      // A dark rim (fainter highlights) for the dark scheme.
      Prop("dark") { view: HaloGlassView, dark: Boolean -> view.dark = dark }
      // False draws the material without the live backdrop (tint and rim only): glass on glass, like a selection.
      Prop("backdrop") { view: HaloGlassView, backdrop: Boolean -> view.backdrop = backdrop }

      OnViewDidUpdateProps { view: HaloGlassView -> view.applyProps() }
    }
  }
}
