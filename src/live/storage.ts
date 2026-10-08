// The Breathe and Live Workout logs in AsyncStorage: a small JSON list each, newest first (./sessions.ts keeps the
// shapes and the cap). Phone-local notes only; nothing here reaches the Store or Health Connect.
import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addToLog, parseBreath, parseLog, parseWorkout, type BreathRecord, type WorkoutRecord } from "./sessions";

const BREATH_KEY = "pulse.breathe.log";
const WORKOUT_KEY = "pulse.workout.log";
/** The screens' "Haptic cues" switches (on by default). */
export const BREATH_HAPTICS_KEY = "pulse.breathe.haptics";
export const COACH_HAPTICS_KEY = "pulse.workout.haptics";

type Log<T> = { key: string; parse: (x: Record<string, unknown>) => T | null };
const BREATH: Log<BreathRecord> = { key: BREATH_KEY, parse: parseBreath };
const WORKOUT: Log<WorkoutRecord> = { key: WORKOUT_KEY, parse: parseWorkout };

async function read<T>(log: Log<T>): Promise<T[]> {
  return parseLog(await AsyncStorage.getItem(log.key).catch(() => null), log.parse);
}

// Saves run one after another, so two quick saves never read the same old list.
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function save<T extends { at: number }>(log: Log<T>, rec: T): Promise<void> {
  const run = queue.then(async () => {
    const next = addToLog(await read(log), rec);
    await AsyncStorage.setItem(log.key, JSON.stringify(next)).catch(() => {});
    listeners.forEach((fn) => fn());
  });
  queue = run.catch(() => {});
  return run;
}

export const saveBreath = (r: BreathRecord) => save(BREATH, r);
export const saveWorkout = (r: WorkoutRecord) => save(WORKOUT, r);

/** A log, newest first, re-read after every save; empty until the first read lands. */
function useLog<T>(log: Log<T>): T[] {
  const [rows, setRows] = React.useState<T[]>([]);
  React.useEffect(() => {
    let live = true;
    const load = () => void read(log).then((r) => live && setRows(r));
    load();
    listeners.add(load);
    return () => {
      live = false;
      listeners.delete(load);
    };
  }, [log]);
  return rows;
}

export const useBreathLog = () => useLog(BREATH);
export const useWorkoutLog = () => useLog(WORKOUT);

/** An on/off setting kept under `key` (on until turned off), e.g. a screen's haptic cues. */
export function useStoredFlag(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = React.useState(true);
  React.useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(key)
      .catch(() => null)
      .then((v) => live && setOn(v !== "0"));
    return () => {
      live = false;
    };
  }, [key]);
  const set = React.useCallback(
    (v: boolean) => {
      setOn(v);
      void AsyncStorage.setItem(key, v ? "1" : "0").catch(() => {});
    },
    [key],
  );
  return [on, set];
}
