// The motion kit: one-time entrances that cascade, count-ups, layout-aware slides and wipes, the tab pop, and the
// reduce-motion and foreground signals every animation follows. Everything that can runs on the UI thread
// (Reanimated: shared values, worklets and CSS animations); only the throttled count-ups run in JS.
export { EASE, ENTER, COUNT, POP, cubicBezier, staggerDelay, burstCounter, tween, countUpAt, waveStops, COUNTABLE, type EasingFn } from "./timing";
export { useReduceMotion, reduceMotionNow, useAppActive, onFrame } from "./system";
export { useEntrance, FadeIn, Stagger, EntranceScope, type EntranceOptions, type EntranceStyle, type FadeInProps } from "./Entrance";
export { useCountUp, useCountUpText, CountUpText, type CountUpTextProps } from "./CountUp";
export { useSlide, Reveal, type SlideOptions, type Slide } from "./Slide";
export { REASE, type ReaseKey } from "./easing";
export { usePop } from "./pop";
