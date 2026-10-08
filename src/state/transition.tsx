// The open transition of each stack screen, for useAfterTransition (src/ui/components/AfterTransition.tsx): the root
// Stack wraps every screen in <ScreenTransition> (its `screenLayout`), which flips once the native slide has landed.
import * as React from "react";
import { useNavigation } from "expo-router";
import { TransitionReadyContext } from "@/ui/components/AfterTransition";
import { perf } from "@/lib/perf";

/**
 * When a pushed screen counts as open even before the native stack reports the transition's end: the push
 * (`ios_from_right`, the platform's short animation time, 200 ms) has landed by now. Also the cap for a screen whose
 * transition never reports its end.
 */
export const TRANSITION_SETTLE_MS = 220;

type TransitionEvent = { data?: { closing?: boolean } };
type Listenable = {
  getState(): { type?: string; index?: number; routes?: { key: string }[] } | undefined;
  addListener(type: "transitionEnd", cb: (e: TransitionEvent) => void): () => void;
};

/**
 * Provides "the screen has finished opening". A screen pushed on top of a stack waits for the native stack's
 * `transitionEnd`, or TRANSITION_SETTLE_MS, whichever comes first; any other screen (the stack's first, a tab) waits
 * for its first frame to be drawn (two animation frames), so that frame is the light shell.
 */
export function ScreenTransition({ routeKey, children }: { routeKey: string; children: React.ReactNode }) {
  const navigation = useNavigation() as unknown as Listenable;
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let done = false;
    perf("screen-mounted", routeKey.split("-")[0]);
    const finish = () => {
      if (done) return;
      done = true;
      perf("screen-open", routeKey.split("-")[0]);
      setReady(true);
    };
    const state = navigation.getState();
    // On top of a stack, past its first screen: this screen is being pushed and the slide is running.
    const pushed = state?.type === "stack" && (state.index ?? 0) > 0 && state.routes?.[state.index ?? 0]?.key === routeKey;
    const cleanups: (() => void)[] = [];
    if (pushed) {
      cleanups.push(navigation.addListener("transitionEnd", (e) => !e?.data?.closing && finish()));
      const timer = setTimeout(finish, TRANSITION_SETTLE_MS);
      cleanups.push(() => clearTimeout(timer));
    } else {
      let raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(finish);
      });
      cleanups.push(() => cancelAnimationFrame(raf));
    }
    return () => {
      done = true;
      cleanups.forEach((f) => f());
    };
  }, [navigation, routeKey]);
  return <TransitionReadyContext.Provider value={ready}>{children}</TransitionReadyContext.Provider>;
}
