// The background task's last runs (when, what came of it, how long), for Settings › Notifications & background.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const LOG_KEY = "pulse.background.log";
export const LOG_KEEP = 20;

export type RunResult = "ok" | "skipped" | "failed";
export type RunLogEntry = {
  /** Epoch ms the run started. */
  at: number;
  result: RunResult;
  /** Duration in ms. */
  ms: number;
  /** Why it was skipped, the failure, or a sync warning. */
  note?: string;
};

export async function readLog(): Promise<RunLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as RunLogEntry[]) : [];
  } catch {
    return [];
  }
}

/** Prepends `entry`; the newest `LOG_KEEP` stay. Never throws: a log must not fail the run. */
export async function appendLog(entry: RunLogEntry): Promise<void> {
  try {
    const log = [entry, ...(await readLog())].slice(0, LOG_KEEP);
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // ignored
  }
}

export async function clearLog(): Promise<void> {
  await AsyncStorage.removeItem(LOG_KEY).catch(() => {});
}
