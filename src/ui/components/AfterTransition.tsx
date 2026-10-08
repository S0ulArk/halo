import * as React from "react";

/**
 * Whether the screen around a component has finished opening. The app wraps every stack screen in a provider that
 * flips it once the native push transition ends (src/state/transition.tsx); outside one (the kit preview, tests) it is
 * always true. One value per screen, so a chart that mounts after the transition never waits again.
 */
export const TransitionReadyContext = React.createContext(true);

/**
 * True once the screen's open transition has ended. Heavy work (SVG charts, below-the-fold sections, queries) waits
 * for it, so the slide runs over a light shell instead of stuttering under a big mount.
 */
export function useAfterTransition(): boolean {
  return React.useContext(TransitionReadyContext);
}

/** Renders `fallback` (default nothing) until the screen has finished opening, then `children`. */
export function AfterTransition({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <>{useAfterTransition() ? children : fallback}</>;
}
