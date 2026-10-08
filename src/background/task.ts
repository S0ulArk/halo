// The background task: expo-background-task on expo-task-manager (WorkManager on Android, 15 min at best). Defined
// at module scope, as TaskManager requires: index.ts imports this file, so a headless launch (WorkManager waking Pulse
// with no UI) finds the task before anything renders. The task opens the store, checks the setting, the source and
// its access (Health Connect's background read permission, or a connected Google account, whose token the sync gets
// silently), runs the shared runSync, and logs the outcome (log.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { googleConnection } from "@/google/auth";
import { permissionState } from "@/health/connect";
import { notifyAfterRun } from "./alerts";
import { taskSkipReason, type AlertSource } from "./decide";
import { appendLog } from "./log";
import { installNotificationHandler } from "./notify";
import { backgroundStore, runSync } from "./runSync";
import { readSettings } from "./settings";

export const TASK_NAME = "pulse.background.sync";
/** WorkManager's floor. Android stretches it to 15-30 min and skips while Doze or Battery Saver say so. */
export const MIN_INTERVAL_MIN = 15;
const SOURCE_KEY = "pulse.source";

/** The task body, exported for the debug "Run now" button. */
export async function runBackgroundTask(): Promise<BackgroundTask.BackgroundTaskResult> {
  const t0 = Date.now();
  try {
    const settings = await readSettings();
    const store = await backgroundStore();
    const [profile, rawSource] = await Promise.all([store.getProfile(), AsyncStorage.getItem(SOURCE_KEY).catch(() => null)]);
    const source: AlertSource = rawSource === "health_connect" || rawSource === "google" || rawSource === "demo" ? rawSource : null;
    const perms = source === "health_connect" ? await permissionState().catch(() => null) : null;
    const access = source === "google" ? !!(await googleConnection().catch(() => null)) : !!perms?.background;
    const skip = taskSkipReason({ enabled: settings.backgroundSync, hasProfile: !!profile, source, background: access });
    if (skip || !profile || (source !== "health_connect" && source !== "google")) {
      // Nothing imported, but a stale sync is exactly when "Halo can't sync" is due.
      if (profile) await notifyAfterRun(store, profile.timeZone);
      await appendLog({ at: t0, result: "skipped", ms: Date.now() - t0, note: skip ?? "no profile yet" });
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    const r = await runSync(store, profile, source, { timeZone: profile.timeZone, owner: "task" });
    await appendLog({
      at: t0,
      result: r.ran ? "ok" : "skipped",
      ms: Date.now() - t0,
      note: r.ran ? (r.warnings.length ? r.warnings.join("; ") : undefined) : r.skipped,
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[background]", message);
    await appendLog({ at: t0, result: "failed", ms: Date.now() - t0, note: message });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

TaskManager.defineTask(TASK_NAME, runBackgroundTask);
// Also global: a notification arriving while Pulse is open must still show.
installNotificationHandler();

export function isBackgroundSyncRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(TASK_NAME).catch(() => false);
}

/** False when the system refuses background tasks for this app. */
export async function backgroundSyncAvailable(): Promise<boolean> {
  const status = await BackgroundTask.getStatusAsync().catch(() => BackgroundTask.BackgroundTaskStatus.Restricted);
  return status === BackgroundTask.BackgroundTaskStatus.Available;
}

/** Registers or unregisters the task to match `enabled`. Never throws. */
export async function syncRegistration(enabled: boolean): Promise<void> {
  try {
    const registered = await isBackgroundSyncRegistered();
    if (enabled && !registered) await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: MIN_INTERVAL_MIN });
    else if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(TASK_NAME);
  } catch (e) {
    console.warn("[background] register", e instanceof Error ? e.message : String(e));
  }
}

/** Debug builds only: asks WorkManager to run the task now (a no-op in release). */
export function triggerForTesting(): Promise<boolean> {
  return BackgroundTask.triggerTaskWorkerForTestingAsync().catch(() => false);
}
