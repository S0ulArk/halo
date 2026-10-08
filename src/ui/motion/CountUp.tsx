import * as React from "react";
import { formatValue, type FormatKey } from "@/lib/format";
import { useAfterTransition } from "@/ui/components/AfterTransition";
import { onFrame, reduceMotionNow } from "./system";
import { COUNT, COUNTABLE, countUpAt, EASE, type EasingFn } from "./timing";

type TweenOpts = { duration?: number; easing?: EasingFn; from?: number };

/**
 * A count-up re-renders its text at most once per STEP ms (20 times a second), not on every frame: a screen opens with
 * a dozen or more counting at once, and at 120 Hz a render each per frame kept the JS thread busy for the whole
 * count. The digits change too fast to read either way; the final value always lands exactly.
 */
export const STEP = 50;
/** Count-ups are spread over PHASES offsets inside each step, so the ones that start together update on different frames. */
const PHASES = 3;
let started = 0;

/**
 * A number that counts to `value` from what is on screen when the value changes, and straight to it under reduce
 * motion. On mount it shows `value` at once ("calm data": nothing animates while a screen opens; `from` is kept for
 * API compatibility). Only a new value starts a count; re-renders do not. `map` turns the running number into what is
 * rendered, so a host that renders a string (see `useCountUpText`) re-renders only when the string changes. Every
 * update lands on a frame of the shared loop, none during render or synchronously in an effect.
 */
function useTween<T>(value: number | null, map: (v: number) => T, { duration = COUNT.duration, easing = EASE.fill }: TweenOpts): T | null {
  const [initial] = React.useState(() => value);
  const [out, setOut] = React.useState<T | null>(() => (initial === null ? null : map(initial)));
  // The number on screen as of the last update; written by frame callbacks only.
  const shown = React.useRef<number | null>(initial);
  const latest = React.useRef({ map, easing });
  React.useEffect(() => {
    latest.current = { map, easing };
  });
  const [phase] = React.useState(() => ((started++ % PHASES) * STEP) / PHASES);
  // On a screen being pushed, the count waits for the slide to land: no re-render competes with it.
  const opened = useAfterTransition();
  React.useEffect(() => {
    if (!opened) return;
    const start = shown.current;
    // Already showing it (the first value, shown at mount): no frame loop at all.
    if (start === value) return;
    let t0: number | null = null;
    let slot = 0;
    // A new value or unmount stops this count; the next one starts from what is shown.
    return onFrame((t) => {
      t0 ??= t;
      const instant = value === null || start === null || duration <= 0 || reduceMotionNow();
      const v = instant ? value : countUpAt(start, value, t - t0, duration, latest.current.easing);
      const done = v === value;
      // Between steps nothing renders; the last frame always does.
      const now = Math.floor((t - t0 + phase) / STEP);
      if (!done && now === slot) return true;
      slot = now;
      shown.current = v;
      setOut(v === null ? null : latest.current.map(v));
      return !done;
    });
  }, [value, duration, phase, opened]);
  // A missing value shows at once; a value arriving where there was none shows at once until the frame catches up.
  return value === null ? null : (out ?? map(value));
}

const identity = (v: number) => v;

/** `value`, counting over `duration` ms (700) from the shown number when it changes; shown at once on mount. */
export function useCountUp(value: number | null, duration: number = COUNT.duration, easing: EasingFn = EASE.fill): number | null {
  return useTween(value, identity, { duration, easing });
}

/** `useCountUp` already formatted ("13,406", "6:46"); "--" for null. Formats that cannot count show at once. */
export function useCountUpText(value: number | null, format: FormatKey, opts: TweenOpts = {}): string {
  const duration = COUNTABLE[format] ? (opts.duration ?? COUNT.duration) : 0;
  return useTween(value, (v) => formatValue(format, v), { ...opts, duration }) ?? formatValue(format, null);
}

export type CountUpTextProps = { value: number | null; format: FormatKey; duration?: number; easing?: EasingFn; from?: number };

/**
 * The counting text alone, for use inside a `Txt` or `Text` (it renders a bare string, so it must have a text
 * parent). Being its own component, each update re-renders this leaf only, never the row or dial around it.
 */
export function CountUpText({ value, format, duration, easing, from }: CountUpTextProps) {
  return <>{useCountUpText(value, format, { duration, easing, from })}</>;
}
