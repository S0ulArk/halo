// Gradle settings for fast local release builds on a big machine (survives `expo prebuild --clean`): a large heap,
// all cores, the build cache, and only the phone's ABI. Tuned for an Apple M4 Pro (12 cores, 24 GB).
const { withGradleProperties } = require("@expo/config-plugins");
const os = require("node:os");

const SETTINGS = {
  "org.gradle.jvmargs": "-Xmx8g -XX:MaxMetaspaceSize=1g -XX:+UseParallelGC -Dfile.encoding=UTF-8",
  "org.gradle.parallel": "true",
  "org.gradle.caching": "true",
  "org.gradle.daemon": "true",
  "org.gradle.workers.max": String(Math.max(2, os.cpus().length)),
  "kotlin.daemon.jvmargs": "-Xmx3g",
  // The user's phone is arm64; building three more ABIs quadrupled the native compile.
  reactNativeArchitectures: "arm64-v8a",
  // PNG crunching re-encodes every image on each release build for a few KB.
  "android.enablePngCrunchInReleaseBuilds": "false",
};

module.exports = function withFastGradle(config) {
  return withGradleProperties(config, (c) => {
    for (const [key, value] of Object.entries(SETTINGS)) {
      const i = c.modResults.findIndex((p) => p.type === "property" && p.key === key);
      if (i >= 0) c.modResults[i] = { type: "property", key, value };
      else c.modResults.push({ type: "property", key, value });
    }
    return c;
  });
};
