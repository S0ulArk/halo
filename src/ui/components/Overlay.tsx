// A layer over the whole app, inside the app's own window: dialogs render here instead of in an RN <Modal>, which on
// Android opens a separate Dialog window (created on every open, its first frame waiting on it) and takes the
// keyboard's focus with it. The host sits at the root (app/_layout.tsx), above the navigator and the bottom sheets.
import * as React from "react";
import { BackHandler, StyleSheet, View, type ViewProps } from "react-native";
import Animated, { css } from "react-native-reanimated";
import { reduceMotionNow } from "@/ui/motion/system";
import { ThemeBridge, useTheme } from "@/ui/ThemeProvider";

type Layer = { key: number; node: React.ReactNode };
type Host = { set: (key: number, node: React.ReactNode) => void; remove: (key: number) => void };

const HostCtx = React.createContext<Host | null>(null);
let nextKey = 1;

/** Renders the app, then every open overlay above it in the order they opened. */
export function OverlayHost({ children }: { children: React.ReactNode }) {
  const [layers, setLayers] = React.useState<Layer[]>([]);
  const host = React.useMemo<Host>(
    () => ({
      set: (key, node) =>
        setLayers((ls) => {
          const i = ls.findIndex((l) => l.key === key);
          if (i < 0) return [...ls, { key, node }];
          const next = ls.slice();
          next[i] = { key, node };
          return next;
        }),
      remove: (key) => setLayers((ls) => ls.filter((l) => l.key !== key)),
    }),
    [],
  );
  return (
    <HostCtx.Provider value={host}>
      {children}
      {layers.map((l) => (
        <View key={l.key} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {l.node}
        </View>
      ))}
    </HostCtx.Provider>
  );
}

/**
 * Renders `children` in the root OverlayHost for as long as it is mounted, with the theme of where it is declared.
 * Outside a host (the kit preview, tests) it renders in place.
 */
export function Overlay({ children }: { children: React.ReactNode }) {
  const host = React.useContext(HostCtx);
  const theme = useTheme();
  const [key] = React.useState(() => nextKey++);
  const node = <ThemeBridge value={theme}>{children}</ThemeBridge>;
  React.useLayoutEffect(() => {
    host?.set(key, node);
  });
  React.useLayoutEffect(() => () => host?.remove(key), [host, key]);
  return host ? null : <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{children}</View>;
}

// --- What a screen reader may reach while a sheet or dialog covers the app ---

let covering = 0;
const coverSubs = new Set<() => void>();
const subscribeCover = (fn: () => void) => {
  coverSubs.add(fn);
  return () => {
    coverSubs.delete(fn);
  };
};
const coverCount = () => covering;

/**
 * While `active`, the app under the root layers (CoverableContent) is hidden from accessibility services, as an RN
 * <Modal>'s own window hid it: TalkBack stays inside the open sheet or dialog.
 */
export function useCoverLayer(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    covering++;
    coverSubs.forEach((fn) => fn());
    return () => {
      covering--;
      coverSubs.forEach((fn) => fn());
    };
  }, [active]);
}

/** The app's content (the navigator): hidden from accessibility services while a layer covers it. */
export function CoverableContent({ children, style }: { children: React.ReactNode; style?: ViewProps["style"] }) {
  const covered = React.useSyncExternalStore(subscribeCover, coverCount, coverCount) > 0;
  return (
    <View style={[{ flex: 1 }, style]} importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
      {children}
    </View>
  );
}

const FADE_IN = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

/**
 * A drop-in for RN's `<Modal visible transparent statusBarTranslucent>`: the same full-screen layer over everything,
 * in the app's own window (Overlay). Android's back calls `onRequestClose`; `fade` fades it in over 150 ms (a
 * Reanimated CSS animation). Mount it to show it, as a `visible` Modal.
 */
export function OverlayModal({ onRequestClose, fade = false, children }: { onRequestClose?: () => void; fade?: boolean; children: React.ReactNode }) {
  useCoverLayer(true);
  const latest = React.useRef(onRequestClose);
  React.useEffect(() => {
    latest.current = onRequestClose;
  });
  React.useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      latest.current?.();
      return true;
    });
    return () => sub.remove();
  }, []);
  const [style] = React.useState(() => (fade && !reduceMotionNow() ? { animationName: FADE_IN, animationDuration: 150, animationTimingFunction: "ease-out" as const } : null));
  return (
    <Overlay>
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, style]}>
        {children}
      </Animated.View>
    </Overlay>
  );
}
