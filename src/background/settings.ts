// What the person chose on Settings › Notifications & background, kept in AsyncStorage like the theme (device
// settings, not rows). Everything is off until they turn it on: nothing runs or notifies unasked.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SETTINGS_KEY = "pulse.background.settings";

export type BackgroundSettings = {
  /** WorkManager wakes Pulse every 15-30 min to import Health Connect and rescore. */
  backgroundSync: boolean;
  /** "Recovery ready", once a day, when today's Recovery first appears. */
  recoveryReady: boolean;
  /** "Halo can't sync", once a day, when the last Health Connect sync is older than 36 h. */
  cantSync: boolean;
  /** A daily "Check in" reminder at `checkInTime`, opening the Journal. */
  checkIn: boolean;
  /** 24-hour "HH:mm". */
  checkInTime: string;
  /** "Wind down", scheduled `bedtimeLeadMin` before tonight's bedtime from the sleep planner, re-planned after every run. */
  bedtime: boolean;
  bedtimeLeadMin: number;
  /** "Strain target reached", once a day, when Day Strain reaches the low end of today's target. */
  strainTarget: boolean;
  /** Health Monitor, when last night's vitals go from in range to out of range or the illness signal rises. */
  healthMonitor: boolean;
  /** "Weekly report ready", Monday morning once last week's report is complete. */
  weeklyReport: boolean;
};

/** The wind-down lead times Settings offers, in minutes. */
export const BEDTIME_LEADS = [15, 30, 45, 60] as const;

export const DEFAULT_SETTINGS: BackgroundSettings = {
  backgroundSync: false,
  recoveryReady: false,
  cantSync: false,
  checkIn: false,
  checkInTime: "21:00",
  bedtime: false,
  bedtimeLeadMin: 30,
  strainTarget: false,
  healthMonitor: false,
  weeklyReport: false,
};

export async function readSettings(): Promise<BackgroundSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<BackgroundSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Merges `patch` over what is saved and returns the result. */
export async function writeSettings(patch: Partial<BackgroundSettings>): Promise<BackgroundSettings> {
  const next = { ...(await readSettings()), ...patch };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
