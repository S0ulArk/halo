package app.halo.glass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * One piece of Liquid Glass: the content behind it (a HaloGlassTargetView's recording), bent by a lens, softened,
 * saturated and tinted, under a lit rim. Three tiers, chosen per draw, and never a crash:
 *
 *  - LENS (API 33+, a target, hardware drawing): the target's RenderNode drawn into a small RenderNode the size of
 *    this view plus a blur margin, with RenderEffect.createChainEffect(lens AGSL shader, blur). The shader draws the
 *    shape, tint and rim too, so nothing else is drawn.
 *  - BLUR (API 31–32, or the shader failed to compile): the same node with a blur and a saturation colour filter,
 *    clipped to the rounded rect, then the tint and a swept rim drawn over it.
 *  - SOLID (below 31, software drawing, no target, the target contains this view, or `backdrop` off): a translucent
 *    fill of the tint (made more opaque when it stands in for live glass, so text on it stays legible) and the rim.
 *
 * Cost. The UI thread records this view only when a prop or its size changes; per frame it does one pre-draw check
 * (two transformMatrixToGlobal walks and a 3×3 compare) and re-records the 4-op node only if the glass moved against
 * the target. The RenderThread replays the target's display list into the small layer (clipped to it, so only ops
 * under the glass draw) on every frame the screen draws, since HWUI damages a node drawn from two places fully, and
 * the GPU runs the blur and one shader pass over that layer: for a 62 dp tab bar about 1300×300 px, a fraction of a
 * millisecond. When nothing on screen changes no frame is drawn and the glass costs nothing.
 */
@SuppressLint("ViewConstructor")
class HaloGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private enum class Tier { LENS, BLUR, SOLID }

  // Props, applied together by applyProps() (OnViewDidUpdateProps).
  var targetId: Int? = null
    set(value) {
      if (field == value) return
      field = value
      target = null
      nextLookup = 0L
      misses = 0
    }
  var cornerRadiusDp = -1f
  var tintColor = Color.rgb(250, 250, 252)
  var frost = 0.5f
  var refraction = 1f
  var blurRadiusDp = 5f
  var saturation = 1.8f
  var dark = false
  var backdrop = true

  private val density = resources.displayMetrics.density
  private var target: HaloGlassTargetView? = null
  /** Earliest uptime for the next findView after a miss: a stale tag is looked up four times a second, not per frame. */
  private var nextLookup = 0L
  /** Misses since the tag last changed: a few delayed retries cover a target mounted a moment after the glass. */
  private var misses = 0
  private val retry = Runnable { if (isAttachedToWindow) invalidate() }
  private var drawnTier = Tier.SOLID
  private val live: LiveBackdrop? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) LiveBackdrop() else null

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val shape = RectF()
  /** The size and scheme the rim's sweep gradient was built for. */
  private var rimKey = 0L

  private val preDraw = ViewTreeObserver.OnPreDrawListener {
    onPreDraw()
    true
  }

  init {
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    setWillNotDraw(true)
  }

  fun applyProps() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) live?.invalidateEffect()
    rimKey = 0L
    invalidate()
  }

  // ---- Layout and lifecycle ----

  // The view has no React children; never let the LinearLayout under ExpoView lay anything out.
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) live?.invalidateEffect()
    rimKey = 0L
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (live != null) viewTreeObserver.addOnPreDrawListener(preDraw)
  }

  override fun onDetachedFromWindow() {
    if (live != null) viewTreeObserver.removeOnPreDrawListener(preDraw)
    removeCallbacks(retry)
    target = null
    nextLookup = 0L
    misses = 0
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) live?.release()
    super.onDetachedFromWindow()
  }

  // ---- The target ----

  /** The target view, if it exists, is attached, and doesn't contain this glass (which would draw itself forever). */
  private fun resolveTarget(): HaloGlassTargetView? {
    val id = targetId ?: return null
    target?.let { if (it.isAttachedToWindow) return it }
    target = null
    val now = SystemClock.uptimeMillis()
    if (now < nextLookup) return null
    val found = try {
      appContext.findView<View>(id) as? HaloGlassTargetView
    } catch (e: Throwable) {
      null
    }
    if (found == null || !found.isAttachedToWindow || isInside(found)) {
      nextLookup = now + LOOKUP_GAP_MS
      // Redraw to look again even if nothing else on screen moves; give up after a few seconds (a stale tag).
      if (misses++ < MAX_RETRIES) postDelayed(retry, LOOKUP_GAP_MS + 10L)
      return null
    }
    misses = 0
    target = found
    return found
  }

  private fun isInside(view: View): Boolean {
    var p = parent
    while (p != null) {
      if (p === view) return true
      p = p.parent
    }
    return false
  }

  private fun wantedTier(found: HaloGlassTargetView?): Tier = when {
    !backdrop || found == null || live == null || !isHardwareAccelerated -> Tier.SOLID
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !lensBroken -> Tier.LENS
    !blurBroken -> Tier.BLUR
    else -> Tier.SOLID
  }

  /** Every frame: follow the target appearing or going, and the glass moving over it (a slide, a press). */
  private fun onPreDraw() {
    if (!backdrop && drawnTier == Tier.SOLID) return
    val found = if (backdrop) resolveTarget() else null
    val wanted = wantedTier(found)
    if (wanted != drawnTier) {
      invalidate()
      return
    }
    if (found != null && wanted != Tier.SOLID && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) live?.follow(found)
  }

  // ---- Drawing ----

  override fun dispatchDraw(canvas: Canvas) {
    if (width > 0 && height > 0) {
      val found = if (backdrop) resolveTarget() else null
      val hardware = canvas.isHardwareAccelerated
      var tier = if (hardware) wantedTier(found) else Tier.SOLID
      if (tier != Tier.SOLID && found != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        tier = live?.draw(canvas, found, tier) ?: Tier.SOLID
      }
      when (tier) {
        Tier.LENS -> Unit
        Tier.BLUR -> drawTintAndRim(canvas, standIn = false)
        Tier.SOLID -> drawTintAndRim(canvas, standIn = backdrop)
      }
      // A software canvas (a screenshot) draws the stand-in without changing what the screen's display list holds.
      if (hardware) drawnTier = tier
    }
    super.dispatchDraw(canvas)
  }

  private fun radiusPx(): Float {
    val half = min(width, height) / 2f
    return if (cornerRadiusDp < 0f) half else min(cornerRadiusDp * density, half)
  }

  private fun blurPx(): Float = blurRadiusDp * density

  /** Top-left line, bottom-right line, inner glow, sheen. */
  private fun rimLevels(): FloatArray = if (dark) floatArrayOf(0.45f, 0.16f, 0.05f, 0.08f) else floatArrayOf(0.9f, 0.5f, 0.14f, 0.14f)

  /** The tint over the backdrop (BLUR) or on its own (SOLID), then the rim: a fine stroke swept bright to the top left. */
  private fun drawTintAndRim(canvas: Canvas, standIn: Boolean) {
    val r = radiusPx()
    val opacity = Color.alpha(tintColor) / 255f * frost
    val a = if (standIn) max(opacity, STAND_IN_OPACITY) else opacity
    shape.set(0f, 0f, width.toFloat(), height.toFloat())
    if (a > 0f) {
      fill.color = (tintColor and 0x00FFFFFF) or ((a * 255f).roundToInt().coerceIn(0, 255) shl 24)
      canvas.drawRoundRect(shape, r, r, fill)
    }
    val stroke = 1.2f * density
    val key = (width.toLong() shl 33) or (height.toLong() shl 2) or (if (dark) 1L else 2L)
    if (key != rimKey) {
      val levels = rimLevels()
      val lit = levels[0]
      val faint = levels[1]
      val mid = (lit + faint) * 0.6f
      // Angles from the centre, clockwise from 3 o'clock: right, bottom-right, bottom, bottom-left, left, top-left, top, top-right.
      val alphas = floatArrayOf(faint, faint, faint, mid, lit, lit, lit, mid, faint)
      val colors = IntArray(alphas.size) { Color.argb((alphas[it] * 255f).roundToInt(), 255, 255, 255) }
      val stops = floatArrayOf(0f, 0.125f, 0.25f, 0.375f, 0.5f, 0.625f, 0.75f, 0.875f, 1f)
      rimPaint.shader = SweepGradient(width / 2f, height / 2f, colors, stops)
      rimPaint.strokeWidth = stroke
      rimKey = key
    }
    shape.inset(stroke / 2f, stroke / 2f)
    val inner = max(0f, r - stroke / 2f)
    canvas.drawRoundRect(shape, inner, inner, rimPaint)
  }

  /** The window's own background (the page colour), drawn under the target's content where it is transparent. */
  private fun clearColor(): Int? = (rootView?.background as? ColorDrawable)?.color

  /**
   * The live backdrop (API 31+): a RenderNode positioned over this view with a margin for the blur, holding the
   * target's content mapped into this view's space, with the glass RenderEffect on it.
   */
  @RequiresApi(Build.VERSION_CODES.S)
  private inner class LiveBackdrop {
    private val node = RenderNode("HaloGlass")
    private val outline = Outline()
    private var builtFor: Tier? = null
    private var recordedFrom: HaloGlassTargetView? = null
    private var margin = 0
    private var shader: Any? = null
    private val selfToScreen = Matrix()
    private val screenToSelf = Matrix()
    private val targetToScreen = Matrix()
    /** Target content → this node's space, as last recorded, and a scratch copy to compare against. */
    private val mapping = Matrix()
    private val probe = Matrix()

    fun invalidateEffect() {
      builtFor = null
    }

    fun release() {
      node.discardDisplayList()
      builtFor = null
      recordedFrom = null
    }

    /** Draws the backdrop node; returns the tier actually drawn (LENS may fall to BLUR), or null to draw SOLID. */
    fun draw(canvas: Canvas, found: HaloGlassTargetView, wanted: Tier): Tier? {
      val tier = if (builtFor == wanted) wanted else build(wanted) ?: return null
      // A transform that can't be inverted (scaled to 0 mid-animation) shows nothing: keep the last recording.
      if (map(found, mapping)) record(found)
      // The node holds the glass at SCALE of its size; drawn scaled back up (its effect output is filtered bilinearly).
      canvas.save()
      canvas.translate(-margin.toFloat(), -margin.toFloat())
      canvas.scale(1f / SCALE, 1f / SCALE)
      canvas.drawRenderNode(node)
      canvas.restore()
      return tier
    }

    /** Per frame: re-record (4 ops, no invalidate) only if the glass moved against the target. */
    fun follow(found: HaloGlassTargetView) {
      if (builtFor == null) return
      if (!map(found, probe)) return
      if (found === recordedFrom && probe == mapping) return
      mapping.set(probe)
      record(found)
    }

    private fun build(wanted: Tier): Tier? {
      val blur = blurPx()
      // The blur reads about 3σ past the glass's edge; HWUI turns a radius r into σ = 0.577 r + 0.5.
      margin = if (blur > 0.5f) ceil(3f * (0.57735f * blur + 0.5f)).toInt() + 2 else 2
      node.setPosition(0, 0, ceil((width + 2 * margin) * SCALE).toInt(), ceil((height + 2 * margin) * SCALE).toInt())
      if (wanted == Tier.LENS && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !lensBroken) {
        try {
          node.setRenderEffect(lensEffect(blur))
          node.setClipToOutline(false)
          builtFor = Tier.LENS
          return Tier.LENS
        } catch (e: Throwable) {
          lensBroken = true
          Log.w(TAG, "Liquid Glass lens unavailable; using the blur", e)
        }
      }
      return try {
        node.setRenderEffect(blurEffect(blur))
        val r = radiusPx() * SCALE
        val m = (margin * SCALE).toInt()
        outline.setRoundRect(m, m, m + (width * SCALE).toInt(), m + (height * SCALE).toInt(), r)
        node.setOutline(outline)
        node.setClipToOutline(true)
        builtFor = Tier.BLUR
        Tier.BLUR
      } catch (e: Throwable) {
        blurBroken = true
        Log.w(TAG, "Liquid Glass blur unavailable; using the solid material", e)
        builtFor = null
        null
      }
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun lensEffect(blur: Float): RenderEffect {
      val s = shader as? RuntimeShader ?: RuntimeShader(LENS_AGSL).also { shader = it }
      // Everything in the node's space: the glass's own size times SCALE.
      val w = width * SCALE
      val h = height * SCALE
      val short = min(w, h)
      val rim = rimLevels()
      s.setFloatUniform("origin", margin * SCALE, margin * SCALE)
      s.setFloatUniform("size", w, h)
      s.setFloatUniform("radius", radiusPx() * SCALE)
      s.setFloatUniform("shift", refraction * 0.3f * short)
      s.setFloatUniform("band", max(1f, 0.4f * short))
      s.setFloatUniform("magnify", 0.04f * refraction)
      s.setFloatUniform("saturation", saturation)
      s.setFloatUniform("brightness", 1.04f)
      s.setFloatUniform("tint", Color.red(tintColor) / 255f, Color.green(tintColor) / 255f, Color.blue(tintColor) / 255f, Color.alpha(tintColor) / 255f * frost)
      s.setFloatUniform("rim", rim[0], rim[1], rim[2], rim[3])
      s.setFloatUniform("dp", density * SCALE)
      val lens = RenderEffect.createRuntimeShaderEffect(s, "content")
      val b = blur * SCALE
      return if (b > 0.5f) RenderEffect.createChainEffect(lens, RenderEffect.createBlurEffect(b, b, Shader.TileMode.CLAMP)) else lens
    }

    private fun blurEffect(blur: Float): RenderEffect {
      val colour = ColorMatrix().apply {
        setSaturation(saturation)
        postConcat(ColorMatrix().apply { setScale(1.04f, 1.04f, 1.04f, 1f) })
      }
      val filter = ColorMatrixColorFilter(colour)
      val b = blur * SCALE
      return if (b > 0.5f) {
        RenderEffect.createColorFilterEffect(filter, RenderEffect.createBlurEffect(b, b, Shader.TileMode.CLAMP))
      } else {
        RenderEffect.createColorFilterEffect(filter)
      }
    }

    /** Target content → this node: the target's screen transform, back through this view's, plus the margin. */
    private fun map(found: HaloGlassTargetView, out: Matrix): Boolean {
      selfToScreen.reset()
      transformMatrixToGlobal(selfToScreen)
      if (!selfToScreen.invert(screenToSelf)) return false
      targetToScreen.reset()
      found.transformMatrixToGlobal(targetToScreen)
      out.set(targetToScreen)
      out.postConcat(screenToSelf)
      out.postTranslate(margin.toFloat(), margin.toFloat())
      out.postScale(SCALE, SCALE)
      return true
    }

    private fun record(found: HaloGlassTargetView) {
      val content = found.content ?: return
      val c = node.beginRecording()
      try {
        clearColor()?.let { c.drawColor(it) }
        c.save()
        c.concat(mapping)
        c.drawRenderNode(content)
        c.restore()
      } finally {
        node.endRecording()
      }
      recordedFrom = found
    }
  }

  companion object {
    private const val TAG = "HaloGlass"
    /**
     * The glass renders at half resolution (a quarter of the pixels), as Haze and other fast Android glass do: the
     * backdrop is bent and softened anyway, so the difference doesn't show, while the replay, blur and lens cost a
     * quarter. Measured on a 120 Hz phone, full-resolution glass doubled the janky frames.
     */
    private const val SCALE = 0.5f
    /** The fill's least opacity when it stands in for live glass: enough that text on it never fights the page. */
    private const val STAND_IN_OPACITY = 0.88f
    private const val LOOKUP_GAP_MS = 250L
    private const val MAX_RETRIES = 12
    /** Process-wide: once the shader or the blur fails to build, no view tries again. */
    @Volatile private var lensBroken = false
    @Volatile private var blurBroken = false
  }
}
