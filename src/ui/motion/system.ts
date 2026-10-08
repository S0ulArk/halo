// The system signals every animation in the kit follows, each read once for the whole app (Android's "Remove
// animations" setting, whether the app is in the foreground), and one shared frame loop for JS-driven tweens.
import * as React from "react";
import { AccessibilityInfo, AppState } from "react-native";

function signal<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v: T) => {
      if (v === value) return;
      value = v;
      subs.forEach((fn) => fn());
    },
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

// Asked as soon as the kit loads, so the answer is in before the first screen's cards mount. Both listeners live as
// long as the app.
const reduceMotion = signal(false);
AccessibilityInfo.isReduceMotionEnabled().then(reduceMotion.set, () => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", reduceMotion.set);

const appActive = signal(AppState.currentState !== "background" && AppState.currentState !== "inactive");
AppState.addEventListener("change", (s) => appActive.set(s === "active"));

/** True when the user asked the system to remove animations: the kit then shows every end state at once. */
export function useReduceMotion(): boolean {
  return React.useSyncExternalStore(reduceMotion.subscribe, reduceMotion.get, reduceMotion.get);
}

/** The same setting read once, for one-shot animations (an entrance, a count-up) that need no re-render on change. */
export const reduceMotionNow = (): boolean => reduceMotion.get();

/** False while the app is in the background: ambient loops stop there. */
export function useAppActive(): boolean {
  return React.useSyncExternalStore(appActive.subscribe, appActive.get, appActive.get);
}

// --- One frame loop for every JS-driven tween ---

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
type Tick = (t: number) => boolean;
const ticks = new Set<Tick>();
let raf: number | null = null;

function frame() {
  raf = null;
  const t = now();
  // setState calls made here are batched into one render per frame however many count-ups are running.
  ticks.forEach((fn) => {
    if (!fn(t)) ticks.delete(fn);
  });
  if (ticks.size) raf = requestAnimationFrame(frame);
}

/**
 * Calls `fn` with a timestamp (ms) on every frame until it returns false or the returned function is called. All
 * callers share one `requestAnimationFrame` loop.
 */
export function onFrame(fn: Tick): () => void {
  ticks.add(fn);
  if (raf === null) raf = requestAnimationFrame(frame);
  return () => {
    ticks.delete(fn);
  };
}
