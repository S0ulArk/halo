// Every beat the band sends while a Breathe or Live Workout session runs. LiveBleProvider only keeps 2 minutes and
// flushes 4 times a second, so the sessions listen to the controller's samples directly (the listener is cheap: an
// array push) and hand each one to `onSample` as it arrives.
import * as React from "react";
import { liveBle, type LiveSample } from "@/health/ble";
import { stampRr, type RrBeat } from "@/health/bleHr";
import type { HrPoint } from "./sessions";

export type Capture = { hr: HrPoint[]; beats: RrBeat[] };

/** While `active`, collects heart rate and RR intervals into the returned ref (reset each time it turns on). */
export function useCapture(active: boolean, onSample?: (s: LiveSample) => void): React.RefObject<Capture> {
  const ref = React.useRef<Capture>({ hr: [], beats: [] });
  const cb = React.useRef(onSample);
  React.useEffect(() => {
    cb.current = onSample;
  });
  React.useEffect(() => {
    if (!active) return;
    ref.current = { hr: [], beats: [] };
    return liveBle.onSample((s) => {
      const c = ref.current;
      if (s.bpm > 0) c.hr.push({ t: s.t, bpm: s.bpm });
      if (s.rrMs.length) c.beats.push(...stampRr(s.rrMs, s.t));
      cb.current?.(s);
    });
  }, [active]);
  return ref;
}
