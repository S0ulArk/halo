// Switches for measuring what Halo's drawing costs on a phone: the live Liquid Glass backdrop, the glass's soft
// shadows and the GPU layer a rising card takes while it moves. All on by default; the hidden route `/perf`
// (pulse://perf?glass=0&shadow=0&layer=0) turns them off for this run of the app, for a frame-time comparison over
// adb. Nothing is saved: a restart turns everything back on.
import * as React from "react";

export type PerfFlags = { liveGlass: boolean; glassShadow: boolean; riseLayer: boolean };

let flags: PerfFlags = { liveGlass: true, glassShadow: true, riseLayer: true };
let version = 0;
const listeners = new Set<() => void>();

export const perfFlags = (): PerfFlags => flags;

export function setPerfFlags(patch: Partial<PerfFlags>): void {
  flags = { ...flags, ...patch };
  version++;
  listeners.forEach((l) => l());
}

/** Changes whenever the flags change: the root keys the navigator on it, so every screen redraws with them. */
export function usePerfVersion(): number {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
}
