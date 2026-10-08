#!/bin/bash
# Fast release build: regenerates the native project only when its inputs changed (native deps, app.json minus the
# version, config plugins), otherwise builds incrementally with the warm Gradle daemon and build cache.
#   scripts/build-apk.sh            build the current version
#   scripts/build-apk.sh --bump     bump patch + versionCode first (scripts/bump-version.mjs)
# Output: android/app/build/outputs/apk/release/app-release.apk, copied to ~/Documents/Pulse.apk.
set -euo pipefail
cd "$(dirname "$0")/.."
start=$(date +%s)

[ "${1:-}" = "--bump" ] && node scripts/bump-version.mjs

# Fingerprint of everything that shapes android/ (the version is patched in below, so it doesn't count).
hash=$(node -e '
  const fs = require("fs"), crypto = require("crypto");
  const app = JSON.parse(fs.readFileSync("app.json"));
  delete app.expo.version; delete app.expo.android.versionCode;
  const pkg = JSON.parse(fs.readFileSync("package.json"));
  const plugins = fs.readdirSync("plugins").sort().map((f) => fs.readFileSync("plugins/" + f, "utf8"));
  const lock = fs.existsSync("package-lock.json") ? fs.readFileSync("package-lock.json", "utf8") : "";
  // Local native modules (modules/*): every file, so a change to one is never built against a stale project.
  // Gradle output (android/build, .gradle, .cxx) is skipped: it changes on every build and is not an input.
  const skip = new Set(["build", ".gradle", ".cxx"]);
  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => !(e.isDirectory() && skip.has(e.name))).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => (e.isDirectory() ? walk(d + "/" + e.name) : [d + "/" + e.name + ":" + fs.readFileSync(d + "/" + e.name, "utf8")])) : []);
  const local = walk("modules");
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify([app, pkg.dependencies, pkg.devDependencies, pkg.expo, plugins, lock, local]));
  console.log(h.digest("hex").slice(0, 16));
')

if [ ! -f android/.native-hash ] || [ "$(cat android/.native-hash)" != "$hash" ]; then
  echo "native inputs changed: regenerating android/"
  CI=1 npx expo prebuild --platform android --clean
  sed -i '' 's/^networkTimeout=10000$/networkTimeout=180000/' android/gradle/wrapper/gradle-wrapper.properties
  echo "$hash" > android/.native-hash
else
  # Same native project: just carry the version over.
  version=$(node -p 'require("./app.json").expo.version')
  code=$(node -p 'require("./app.json").expo.android.versionCode')
  sed -i '' -E "s/versionCode [0-9]+/versionCode $code/; s/versionName \"[^\"]*\"/versionName \"$version\"/" android/app/build.gradle
fi

cd android
JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true" ./gradlew assembleRelease -q 2>&1 \
  | grep -vE '^\s*$|^warning:|^Note:|^w: |^Picked up|Expo Max Sdk|maxSdkVersion|-------|sourcemap|bundle output|asset files|NODE_ENV|Metro|Bundled|BLUETOOTH|SDK processing|combine-js-to-schema' || true
cd ..
apk=android/app/build/outputs/apk/release/app-release.apk
[ -f "$apk" ] || { echo "build failed: no APK"; exit 1; }
cp "$apk" ~/Documents/Pulse.apk
echo "built $(node -p 'require("./app.json").expo.version') (build $(node -p 'require("./app.json").expo.android.versionCode')) in $(( $(date +%s) - start ))s → ~/Documents/Pulse.apk"
