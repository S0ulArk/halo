// Cooperative time slicing for the long runs (the Health Connect import and the pipeline). React Native handles taps,
// scrolling and rendering on the same JS thread, and awaiting a promise that is already resolved (a MemoryStore call, an
// async function with nothing to wait for) is a microtask, which never lets them in: a loop over 180 days ran as one
// block of hundreds of milliseconds. Awaiting `slice()` inside such a loop gives the thread back once ~12 ms passed since
// the last time, and costs one clock read otherwise. Android fires JS timers on the next frame, so each yield waits up
// to a frame: a run on screen takes longer in wall time, in exchange for never holding the thread past a frame or so.
//
// Only while the app is in the foreground: Android stops JS timers while the app is in the background (and a headless
// launch never starts them), so a yield there would not come back, and there is nothing on screen to keep smooth. The
// app reports its state through setForeground (runSync.ts wires AppState); until it does, slice() never yields, which is
// also what the tests see.

/** Longest stretch between yields: under a 60 Hz frame, leaving room for the frame's own work. */
export const SLICE_MS = 12;

let foreground = false;
let lastYield = 0;
/** Resolvers of the yields in flight, so leaving the foreground can release them. */
const pending = new Set<() => void>();

/** Whether the app is on screen. Leaving it releases a yield waiting on a timer that would now not fire. */
export function setForeground(next: boolean): void {
  foreground = next;
  if (next) return;
  for (const release of [...pending]) release();
}

/** A macrotask break (setTimeout 0), so pending touches and frames run before the loop goes on. */
function yieldNow(): Promise<void> {
  return new Promise((resolve) => {
    const release = () => {
      if (!pending.delete(release)) return;
      lastYield = Date.now();
      resolve();
    };
    pending.add(release);
    setTimeout(release, 0);
  });
}

/** Await inside a long loop: yields when the slice is used up and the app is on screen, else returns at once. */
export function slice(): Promise<void> | undefined {
  if (!foreground || Date.now() - lastYield < SLICE_MS) return undefined;
  return yieldNow();
}

/**
 * A computation that pauses at each `yield` (the importer's record loops in src/health/import.ts, journal impact's
 * bootstraps): pure code that can be run to the end at once with finish(), or sliced by an async caller with sliced().
 */
export type Steps<T> = Generator<void, T, void>;

/** Items a record loop handles between pauses: well under a slice even for the heavier records (an Intl call each). */
export const PAUSE_EVERY = 128;

/** Runs steps to the end at once. */
export function finish<T>(steps: Steps<T>): T {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Runs steps to the end, giving the thread back between pauses when the slice is used up. */
export async function sliced<T>(steps: Steps<T>): Promise<T> {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await slice();
  }
}
