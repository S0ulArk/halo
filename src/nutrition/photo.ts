// A meal photo for the estimate: taken with the camera or chosen from the gallery (expo-image-picker), scaled down to
// 1024 px on its long side and re-encoded as a JPEG (expo-image-manipulator), then handed over as base64 for the one
// request to the person's AI provider. Nothing is kept: the picker's copy and the scaled file in the app's cache are
// deleted as soon as the base64 is read (the gallery's own photo is never touched), and the camera's shot is never
// saved to the gallery. Not loaded by tests (native modules).
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export type MealPhoto = { base64: string; mediaType: "image/jpeg" };

/** A photo, or why there is none: cancelled, the camera permission refused (and whether Android may ask again), or failed. */
export type PhotoResult = { ok: true; photo: MealPhoto } | { ok: false; reason: "cancelled" } | { ok: false; reason: "denied"; canAskAgain: boolean } | { ok: false; reason: "failed" };

/** The long side the photo is scaled to: enough to tell a dal from a curry, small enough to send in a second or two. */
export const MAX_SIDE = 1024;
const QUALITY = 0.7;

/** Deletes a file Pulse made in its own cache; anything else (a gallery photo, a content:// uri) is left alone. */
function discard(uri: string | null | undefined) {
  if (!uri || !uri.startsWith(Paths.cache.uri)) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone: the cache is the system's to clear in the end anyway.
  }
}

/** The picked image scaled to MAX_SIDE and encoded as JPEG base64; every file on the way is deleted. */
async function prepare(asset: ImagePicker.ImagePickerAsset): Promise<MealPhoto> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  let saved: string | null = null;
  try {
    const long = Math.max(asset.width, asset.height);
    if (long > MAX_SIDE) ctx.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    const image = await ctx.renderAsync();
    try {
      const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY, base64: true });
      saved = out.uri;
      if (!out.base64) throw new Error("no image data");
      return { base64: out.base64, mediaType: "image/jpeg" };
    } finally {
      image.release();
    }
  } finally {
    ctx.release();
    discard(saved);
    discard(asset.uri);
  }
}

async function finish(run: () => Promise<ImagePicker.ImagePickerResult>): Promise<PhotoResult> {
  try {
    const r = await run();
    const asset = r.canceled ? null : r.assets?.[0];
    if (!asset) return { ok: false, reason: "cancelled" };
    return { ok: true, photo: await prepare(asset) };
  } catch (e) {
    console.warn(`[nutrition] photo failed: ${e instanceof Error ? e.name : "error"}`);
    return { ok: false, reason: "failed" };
  }
}

const OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false, base64: false, allowsEditing: false };

/** The camera (asking for its permission first, as Android requires). */
export async function takeMealPhoto(): Promise<PhotoResult> {
  try {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return { ok: false, reason: "denied", canAskAgain: p.canAskAgain };
  } catch {
    return { ok: false, reason: "failed" };
  }
  return finish(() => ImagePicker.launchCameraAsync(OPTIONS));
}

/** The system photo picker (Android's own: no storage permission needed). */
export function chooseMealPhoto(): Promise<PhotoResult> {
  return finish(() => ImagePicker.launchImageLibraryAsync(OPTIONS));
}
