// Signs release builds with the keystore named in ~/.pulse-mobile (or the PULSE_KEYSTORE_* env vars), so the same
// key signs every APK and the phone accepts updates in place. Survives `expo prebuild --clean`. The passwords are never
// in the repo: they come from the env vars or from ~/.pulse-mobile/keystore.properties (storePassword=…, keyAlias=…,
// keyPassword=…), which stays on the build machine.
const { withAppBuildGradle } = require("@expo/config-plugins");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const DEFAULT_STORE = path.join(os.homedir(), ".pulse-mobile", "release.keystore");
const PROPERTIES = path.join(os.homedir(), ".pulse-mobile", "keystore.properties");

/** key=value lines of the local properties file; empty when there is none. */
function localProperties() {
  if (!fs.existsSync(PROPERTIES)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(PROPERTIES, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    const storeFile = process.env.PULSE_KEYSTORE_FILE || DEFAULT_STORE;
    if (!fs.existsSync(storeFile)) {
      console.warn(`[withReleaseSigning] no keystore at ${storeFile}; release builds stay debug-signed`);
      return c;
    }
    const props = localProperties();
    const storePassword = process.env.PULSE_KEYSTORE_PASSWORD || props.storePassword;
    if (!storePassword) {
      console.warn(`[withReleaseSigning] no keystore password (PULSE_KEYSTORE_PASSWORD or ${PROPERTIES}); release builds stay debug-signed`);
      return c;
    }
    const keyAlias = process.env.PULSE_KEY_ALIAS || props.keyAlias || "pulse";
    const keyPassword = process.env.PULSE_KEY_PASSWORD || props.keyPassword || storePassword;
    let g = c.modResults.contents;
    if (!g.includes("signingConfigs.release")) {
      g = g.replace(
        /signingConfigs \{\n\s*debug \{/,
        `signingConfigs {\n        release {\n            storeFile file('${storeFile}')\n            storePassword '${storePassword}'\n            keyAlias '${keyAlias}'\n            keyPassword '${keyPassword}'\n        }\n        debug {`,
      );
      // Only the release *build type* (inside buildTypes), not the signing config of the same name inserted above.
      const at = g.indexOf("buildTypes {");
      const rel = at < 0 ? -1 : g.indexOf("release {", at);
      if (rel < 0) throw new Error("[withReleaseSigning] no buildTypes.release block in app/build.gradle");
      g = g.slice(0, rel) + g.slice(rel).replace("signingConfig signingConfigs.debug", "signingConfig signingConfigs.release");
    }
    c.modResults.contents = g;
    return c;
  });
};
