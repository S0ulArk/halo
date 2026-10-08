// Asks Android for the display's highest refresh rate while Pulse is on screen. Without this, ColorOS/OxygenOS (and
// other skins with per-app refresh control) keep third-party apps at 60 Hz even on a 120/165 Hz panel, so every
// scroll and animation looked like 60 Hz or less. The system still caps the request at the user's own setting
// (e.g. "High" = 120 Hz), and it only applies to Pulse's window. Survives `expo prebuild --clean`.
const { withMainActivity } = require("@expo/config-plugins");

const MARKER = "// pulse:high-refresh-rate";

const KOTLIN = `
    ${MARKER}
    try {
      @Suppress("DEPRECATION")
      val d = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) display else windowManager.defaultDisplay
      if (d != null) {
        val current = d.mode
        val best = d.supportedModes
          .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
          .maxByOrNull { it.refreshRate }
        if (best != null) {
          val lp = window.attributes
          lp.preferredDisplayModeId = best.modeId
          lp.preferredRefreshRate = best.refreshRate
          window.attributes = lp
        }
      }
      // Android 15+: don't let adaptive refresh save power by dropping Pulse's frame rate while content animates.
      if (Build.VERSION.SDK_INT >= 35) window.setFrameRatePowerSavingsBalanced(false)
    } catch (_: Throwable) {
      // Best effort: a skin that refuses the request keeps its default rate.
    }
`;

module.exports = function withHighRefreshRate(config) {
  return withMainActivity(config, (c) => {
    let src = c.modResults.contents;
    if (c.modResults.language !== "kt") {
      console.warn("[withHighRefreshRate] MainActivity is not Kotlin; skipped");
      return c;
    }
    if (!src.includes(MARKER)) {
      const anchor = "super.onCreate(null)";
      if (!src.includes(anchor)) throw new Error("[withHighRefreshRate] MainActivity.onCreate has no super.onCreate(null)");
      src = src.replace(anchor, `${anchor}\n${KOTLIN}`);
    }
    c.modResults.contents = src;
    return c;
  });
};
