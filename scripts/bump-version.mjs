// Bumps the app's version before every APK build, so each installed build is distinguishable on the phone
// (Settings › Apps › Pulse, and More › About in Pulse). versionCode +1 and the patch number +1, in app.json and
// package.json. `--set <x.y.z> <code>` sets them instead.
import { readFileSync, writeFileSync } from "node:fs";

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const write = (f, v) => writeFileSync(f, JSON.stringify(v, null, 2) + "\n");

const app = read("app.json");
const pkg = read("package.json");
const args = process.argv.slice(2);
let version;
let code;
if (args[0] === "--set") {
  version = args[1];
  code = Number(args[2]);
} else {
  const [maj, min, patch] = app.expo.version.split(".").map(Number);
  version = `${maj}.${min}.${patch + 1}`;
  code = (app.expo.android.versionCode ?? 1) + 1;
}
if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isInteger(code) || code < 1) throw new Error(`bad version ${version} (${code})`);
app.expo.version = version;
app.expo.android.versionCode = code;
pkg.version = version;
write("app.json", app);
write("package.json", pkg);
console.log(`Pulse ${version} (build ${code})`);
