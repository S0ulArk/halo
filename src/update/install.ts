// Installing an update: the release's APK downloaded into the app's cache, then handed to Android's package installer
// through expo-file-system's FileProvider (a content:// URI with read access granted). Android asks the person to
// confirm, and the first time to allow installs from Halo (REQUEST_INSTALL_PACKAGES, "Install unknown apps"). It
// installs over the current app only when the APK is signed with the same key, so a tampered file can't replace Halo;
// data is kept. Without an APK asset the release page opens in the browser instead.
import { Linking } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import type { Release } from "./check";

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_MIME = "application/vnd.android.package-archive";

/** Downloads (reporting 0..1, or null while the size is unknown) and opens the installer. Throws on failure. */
export async function installRelease(r: Release, onProgress?: (fraction: number | null) => void): Promise<void> {
  if (!r.apkUrl) {
    await Linking.openURL(r.pageUrl);
    return;
  }
  // One folder for downloaded updates, emptied first so old APKs don't pile up in the cache.
  const dir = new Directory(Paths.cache, "updates");
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const dest = new File(dir, `Halo-${r.version}.apk`);
  const task = File.createDownloadTask(r.apkUrl, dest, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes > 0 ? totalBytes : r.apkBytes;
      onProgress?.(total ? Math.min(1, bytesWritten / total) : null);
    },
  });
  const file = await task.downloadAsync();
  if (!file) throw new Error("The download stopped");
  if (r.apkBytes && file.size !== r.apkBytes) throw new Error("The download was incomplete");
  const uri = await getContentUriAsync(file.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", { data: uri, type: APK_MIME, flags: FLAG_GRANT_READ_URI_PERMISSION });
}

/** "38 MB" */
export const megabytes = (bytes: number | null) => (bytes ? `${Math.max(1, Math.round(bytes / 1e6))} MB` : null);
