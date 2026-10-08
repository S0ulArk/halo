// The sync + scoring run as one function with no React in it, so the background task (task.ts) and the app
// (src/state/app.tsx's run()) do the same thing: take the run lock (lock.ts), import from the source (Health Connect,
// or the Google Health API with a silent Google sign-in), score, then send the alerts that are due (alerts.ts). Within
// one JavaScript runtime a second call joins the first; across runtimes the lock keeps the two apart.
import { AppState } from "react-native";
import { openStore } from "@/data/db";
import type { Store } from "@/data/store";
import type { Profile } from "@/data/types";
import { googleToken } from "@/google/auth";
import { syncGoogle } from "@/google/sync";
import { syncHealthConnect } from "@/health/sync";
import { localDay } from "@/lib/time";
import { runPipeline } from "@/pipeline";
import { timed } from "@/lib/perf";
import { setForeground } from "@/lib/yield";
import { notifyAfterRun } from "./alerts";
import { releaseLock, takeLock, waitForLock, type RunOwner } from "./lock";

export type Source = "health_connect" | "google" | "demo";

export type RunSyncOptions = {
  timeZone: string;
  owner: RunOwner;
  onProgress?: (step: string, done: number, total: number) => void;
  /** Wait for the other owner's run to end instead of skipping (the app does; the task's window is short). */
  waitIfLocked?: boolean;
};

export type RunSyncResult = {
  ran: boolean;
  /** Why it did not run. */
  skipped?: string;
  /** Sync hints (permission_missing:<Type>, …), never errors. */
  warnings: string[];
};

/** How long the app waits for a background run before giving up and using what is on disk. */
export const WAIT_FOR_TASK_MS = 10 * 60_000;

let inflight: Promise<RunSyncResult> | null = null;
/** True while a run is in flight in this runtime. */
export const isRunning = () => inflight !== null;

let watching = false;
/** The app's UI is up (AppProvider called markUiRuntime): this runtime has a screen, it is not a headless task. */
let ui = false;
/**
 * Marks this runtime as the app's (not the background task's). Right after launch AppState is still "unknown", which
 * counted as background, so the launch sync, the one that matters most, ran unsliced (blocks of 200-250 ms on the
 * phone, 2026-10-09). With a UI, an unknown state is the foreground.
 */
export function markUiRuntime() {
  ui = true;
  if (watching && AppState.currentState !== "background" && AppState.currentState !== "inactive") setForeground(true);
}
const onScreen = (s: string) => s === "active" || (ui && s !== "background" && s !== "inactive");
/**
 * The sync and the pipeline slice their long loops while the app is on screen (src/lib/yield.ts) and run straight
 * through otherwise: Android stops JS timers in the background and a headless task never starts them, so a yield there
 * would never return. AppState tells which, in the app and in the task alike.
 */
function watchForeground() {
  if (watching) return;
  watching = true;
  setForeground(onScreen(AppState.currentState));
  AppState.addEventListener("change", (next) => setForeground(onScreen(next)));
}

/** Serialised: a second call while one runs returns the same promise. Throws what the sync or pipeline threw. */
export function runSync(store: Store, profile: Profile, source: Source, opts: RunSyncOptions): Promise<RunSyncResult> {
  watchForeground();
  if (inflight) return inflight;
  const job = run(store, profile, source, opts).finally(() => {
    inflight = null;
  });
  inflight = job;
  return job;
}

async function run(store: Store, profile: Profile, source: Source, opts: RunSyncOptions): Promise<RunSyncResult> {
  let lock = await takeLock(opts.owner);
  if (!lock.taken && opts.waitIfLocked && (await waitForLock(opts.owner, WAIT_FOR_TASK_MS))) lock = await takeLock(opts.owner);
  if (!lock.taken) return { ran: false, skipped: `${lock.holder === "app" ? "the app" : "the background task"} is syncing`, warnings: [] };
  const warnings: string[] = [];
  try {
    if (source === "health_connect") {
      const r = await timed(`sync-health-connect (${opts.owner})`, () => syncHealthConnect(store, { timeZone: opts.timeZone, onProgress: opts.onProgress }));
      warnings.push(...(r.warnings ?? []));
    } else if (source === "google") {
      const r = await syncGoogle(store, { timeZone: opts.timeZone, token: googleToken, onProgress: opts.onProgress });
      warnings.push(...r.warnings);
    }
    await timed(`pipeline (${opts.owner})`, () => runPipeline(store, profile, { today: localDay(Date.now() / 1000, opts.timeZone), onProgress: opts.onProgress }));
    return { ran: true, warnings };
  } finally {
    await releaseLock(opts.owner);
    await notifyAfterRun(store, opts.timeZone);
  }
}

// ── The Store for a run outside the app ───────────────────────────────────

let appStore: Store | null = null;
/** The app registers its open Store so a task that fires in the same runtime reuses the connection. */
export function registerAppStore(store: Store | null): void {
  appStore = store;
}

let ownStore: Promise<Store> | null = null;
/** The app's Store when it is up in this runtime, else one opened once for the task (a headless launch has no app). */
export function backgroundStore(): Promise<Store> {
  if (appStore) return Promise.resolve(appStore);
  ownStore ??= openStore();
  return ownStore;
}
