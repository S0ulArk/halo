// The tab bar, floated over the tab pages so its Liquid Glass can refract them. Glass reads its backdrop from a
// GlassTarget (src/ui/glass.tsx) and must sit outside that target, so the bar can't be drawn by the tab navigator
// itself (it would be inside the target with the pages). Instead the navigator's `tabBar` is TabBarBridge, which
// draws nothing and hands its props (state, navigation, descriptors) to FloatingTabBar, drawn as the target's overlay
// in the tabs layout.
import * as React from "react";
import { TabBar, type NavTabBarProps } from "./TabBar";

type Listener = () => void;
let current: NavTabBarProps | null = null;
const listeners = new Set<Listener>();

function publish(props: NavTabBarProps) {
  current = props;
  listeners.forEach((l) => l());
}

/** The navigator's `tabBar`: passes the bar's props on and draws nothing in the navigator. */
export function TabBarBridge(props: NavTabBarProps) {
  // Before paint, so a tab press lights its tab in the same frame.
  React.useLayoutEffect(() => {
    publish(props);
  });
  // Gone with the tabs (onboarding, a reset): no stale bar on the way back.
  React.useEffect(
    () => () => {
      current = null;
      listeners.forEach((l) => l());
    },
    [],
  );
  return null;
}

function useBarProps(): NavTabBarProps | null {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

/** The bar itself, over the pages at the screen's foot. Render it as the pages' GlassTarget overlay, so its glass is live. */
export function FloatingTabBar({ onAction, actionLabel }: { onAction?: () => void; actionLabel?: string }) {
  const props = useBarProps();
  if (!props) return null;
  return <TabBar {...props} onAction={onAction} actionLabel={actionLabel} floating />;
}
