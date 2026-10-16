package app.halo.glass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderNode
import android.os.Build
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * The backdrop glass refracts: a container that records its children's drawing into a RenderNode, draws that node
 * itself, and lets every HaloGlassView pointed at it draw the same node again through its own effect. This is the
 * capture the Dimezis BlurView library (expo-blur's BlurTargetView) uses: no bitmap, no copy, no second traversal on
 * the UI thread. The recording only references the children's own display lists, so a scroll under the glass
 * re-records nothing here; the RenderThread replays the latest content into each glass's small layer.
 *
 * A glass must not sit inside the target it reads (it would draw itself): HaloGlassView checks and falls back.
 */
@SuppressLint("ViewConstructor")
class HaloGlassTargetView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  /** The children's drawing. API 31+ only, where glass can blur it; older phones draw straight to the screen. */
  internal val content: RenderNode? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) RenderNode("HaloGlassTarget") else null

  override fun dispatchDraw(canvas: Canvas) {
    val node = content
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || node == null || !canvas.isHardwareAccelerated || width <= 0 || height <= 0) {
      super.dispatchDraw(canvas)
      return
    }
    node.setPosition(0, 0, width, height)
    val recording = node.beginRecording(width, height)
    try {
      super.dispatchDraw(recording)
    } finally {
      node.endRecording()
    }
    canvas.drawRenderNode(node)
  }

  // React Native lays the children out (Yoga); the LinearLayout under ExpoView must never move them.
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    // The view's own display list goes on detach; ours follows, and is recorded again when it next draws.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) content?.discardDisplayList()
  }
}
