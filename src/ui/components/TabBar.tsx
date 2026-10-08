import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { perf } from "@/lib/perf";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Flame, HeartPulse, House, Menu, Moon, Plus, Sparkles, type LucideIcon } from "lucide-react-native";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { reduceMotionNow } from "@/ui/motion/system";
import { HaloLine } from "./Halo";
import { Mark } from "./Mark";
import { useTheme } from "@/ui/ThemeProvider";
import { TAB_BAR_HEIGHT } from "./PageShell";
import { Txt } from "./Text";
import { usePress } from "./press";

export type TabItem = { key: string; label: string; icon: LucideIcon };
export const TABS: TabItem[] = [
  { key: "home", label: "Today", icon: House },
  { key: "sleep", label: "Sleep", icon: Moon },
  { key: "activity", label: "Activity", icon: Flame },
  { key: "health", label: "Health", icon: HeartPulse },
];

/**
 * The flat chrome surface (it was glass): the Calm card's white solid with `radius` corners. No outline, no shadow, no
 * elevation, no gradient. `solid` is kept for API compatibility.
 */
export function Glass({ radius, style, children }: { radius: number; solid?: boolean; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const c = useCalm();
  return <View style={[{ borderRadius: radius, backgroundColor: c.card }, style]}>{children}</View>;
}

/** The monogram: a 30 px disc in the action colour with the halo mark on it. */
export function Monogram() {
  const c = useCalm();
  return (
    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.teal, alignItems: "center", justifyContent: "center" }}>
      <Mark size={24} />
    </View>
  );
}

/** A standalone "Check in" / Coach button (the bar now carries the action as its fifth item): a flat white 62 px tile. */
export function CheckInAction({ onPress, label = "Check in" }: { onPress: () => void; label?: string }) {
  const c = useCalm();
  const { animatedStyle, onPressIn, onPressOut } = usePress();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} accessibilityRole="button" accessibilityLabel={label}>
      <Animated.View style={[{ width: 62, height: 62, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }, animatedStyle]}>
        <Monogram />
      </Animated.View>
    </Pressable>
  );
}

// --- The navigation bar ---

/** The icon's box (and the press ripple's width). */
const PILL_W = 64;
const PILL_H = 28;
/** Space above the icon; the label sits 2 px under it. 10 + 28 + 2 + 16 + 6 = TAB_BAR_HEIGHT. */
const PAD_TOP = 10;
/** The halo indicator over the active tab: a short luminous line that glides between tabs on a spring. */
const INDICATOR_W = 22;
const INDICATOR_H = 2.5;
const GLIDE = { damping: 20, stiffness: 260, mass: 0.7 } as const;

function NavItem({
  icon: Icon,
  label,
  active,
  onPress,
  role,
  accessibilityLabel,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onPress: () => void;
  role: "tab" | "button";
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const calm = useCalm();
  // The active tab in ink under the gliding halo line; the rest a fine grey outline.
  const color = active ? calm.ink : calm.faint;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === "tab" ? { selected: active } : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      android_ripple={{ color: alpha(c.foreground, 0.08), borderless: true, radius: PILL_W / 2 }}
      style={{ flex: 1, minWidth: 0, alignItems: "center", paddingTop: PAD_TOP }}
    >
      <View style={{ width: PILL_W, height: PILL_H, alignItems: "center", justifyContent: "center" }}>
        <Icon size={23} color={color} strokeWidth={active ? 1.75 : 1.4} />
      </View>
      <Txt size={12} lineHeight={16} weight={active ? 600 : 500} numberOfLines={1} style={{ color, marginTop: 2, letterSpacing: 0.2 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** The action's circle. */
const ACTION = 52;

/** The bar's centre action: a solid circle in the action colour raised half out of the bar, its label under it. */
function CenterAction({ icon: Icon, label, accessibilityLabel, onPress }: { icon: LucideIcon; label: string; accessibilityLabel: string; onPress: () => void }) {
  const calm = useCalm();
  const { animatedStyle, onPressIn, onPressOut } = usePress(0.92);
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
      <Animated.View style={[{ marginTop: -20, width: ACTION, height: ACTION, borderRadius: ACTION / 2, backgroundColor: calm.teal, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: calm.card, boxShadow: `0 6px 16px ${calm.teal}40` }, animatedStyle]}>
        <Icon size={22} color={calm.card} strokeWidth={2} />
      </Animated.View>
      {/* On the tabs' label line: the circle ends 32 px down the bar, their labels start at 40 (PAD_TOP + PILL_H + 2). */}
      <Txt size={12} lineHeight={16} weight={600} numberOfLines={1} style={{ color: calm.teal, marginTop: PAD_TOP + PILL_H + 2 - (ACTION - 20), letterSpacing: 0.2 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * The active tab's halo line: one view slid between the slots by a spring on the UI thread (transform only). `slot`
 * counts the action's place too, so the line sits over the tab's own column.
 */
function Indicator({ slot, slots }: { slot: number; slots: number }) {
  const rowW = useSharedValue(0);
  const at = useSharedValue(slot);
  const shown = slot >= 0;
  React.useEffect(() => {
    if (slot < 0) return;
    at.set(reduceMotionNow() ? slot : withSpring(slot, GLIDE));
  }, [slot, at]);
  const style = useAnimatedStyle(() => {
    const w = (rowW.value - 12) / slots;
    return { opacity: rowW.value > 0 && shown ? 1 : 0, transform: [{ translateX: 6 + (at.value + 0.5) * w - INDICATOR_W / 2 }] };
  });
  return (
    <View pointerEvents="none" onLayout={(e) => rowW.set(e.nativeEvent.layout.width)} style={{ position: "absolute", top: 0, left: 0, right: 0, height: INDICATOR_H + 4 }}>
      <Animated.View style={[{ position: "absolute", top: 3, left: 0, width: INDICATOR_W }, style]}>
        <HaloLine width={INDICATOR_W} height={INDICATOR_H} />
      </Animated.View>
    </View>
  );
}

export type TabBarOwnProps = {
  /** Index of the current tab; −1 for none. */
  current: number;
  onChange: (index: number, tab: TabItem) => void;
  tabs?: TabItem[];
  /** The action, shown as the bar's last item (omit to hide it). */
  onAction?: () => void;
  /** The action's accessible name; its visible label is "Coach" for a coach action, else "Check in". */
  actionLabel?: string;
  /** Absolute at the bottom of its parent (default), or in flow. */
  floating?: boolean;
  /** With `floating`: the BlurTargetView of the pages under the bar, which the bar blurs (frosted glass). */
  blurTarget?: React.RefObject<View | null>;
};

/**
 * The navigator's tab-bar props (expo-router `<Tabs tabBar={(p) => <TabBar {...p} />}>`), typed structurally so
 * the kit never imports react-navigation. Routes map onto TABS by name ("index" is Home); others fall back to
 * the descriptor's title and the Menu icon.
 */
export type NavTabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    navigate: (name: string) => void;
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
  };
  descriptors: Record<string, { options: { title?: string; href?: unknown; tabBarItemStyle?: unknown } }>;
};

export type TabBarProps =
  | (TabBarOwnProps & Partial<Record<keyof NavTabBarProps, undefined>>)
  | (NavTabBarProps & Partial<Omit<TabBarOwnProps, "current" | "onChange">>);

const ROUTE_TAB: Record<string, string> = { index: "home", home: "home", "tab-sleep": "sleep", "tab-activity": "activity", health: "health", journal: "journal", more: "more" };
/** A screen kept off the bar lights the tab it belongs to: the journal is Today's (its card lives there). */
const HOST_TAB: Record<string, string> = { journal: "index" };

/** The action item's visible label and icon, from its accessible name. */
function actionItem(label: string | undefined): { label: string; icon: LucideIcon } {
  if (label && /coach/i.test(label)) return { label: "Coach", icon: Sparkles };
  return { label: "Check in", icon: Plus };
}

const haptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

/**
 * Phone navigation bar: full width and flush to the bottom edge, frosted over the pages (or a solid card face), a
 * faint hairline along its rounded top and the safe-area inset under it. Four destinations around the action ("Coach"
 * or "Check in"), a solid circle raised in the middle. The active tab is in ink under a short halo line that
 * glides between tabs on a spring (one transform, UI thread); the rest are fine grey outlines.
 */
export function TabBar(props: TabBarProps) {
  const calmBar = useCalm();
  const { onAction, actionLabel, floating = true, blurTarget } = props;
  const insets = useSafeAreaInsets();
  // Driven by the navigator: its routes become the tabs (hidden `href: null` routes are left out).
  const nav = "state" in props && props.state ? (props as NavTabBarProps) : null;
  const own = nav ? null : (props as TabBarOwnProps);
  // expo-router turns `href: null` into a hidden item style before the bar sees it, so both mean "not on the bar".
  const hidden = (o: { href?: unknown; tabBarItemStyle?: unknown } | undefined) =>
    o?.href === null || (!!o?.tabBarItemStyle && typeof o.tabBarItemStyle === "object" && (o.tabBarItemStyle as { display?: string }).display === "none");
  const routes = nav ? nav.state.routes.filter((r) => !hidden(nav.descriptors[r.key]?.options)) : [];
  const tabs: TabItem[] = nav
    ? routes.map((r) => TABS.find((t) => t.key === ROUTE_TAB[r.name]) ?? { key: r.name, label: nav.descriptors[r.key]?.options.title ?? r.name, icon: Menu })
    : (own?.tabs ?? TABS);
  const active = nav?.state.routes[nav.state.index];
  const host = active ? HOST_TAB[active.name] : undefined;
  const current = nav ? routes.findIndex((r) => (host ? r.name === host : r.key === active?.key)) : (own?.current ?? -1);
  const press = (i: number) => {
    perf("tab-press", nav ? routes[i]?.name : i);
    haptic();
    if (nav) {
      const route = routes[i];
      const e = nav.navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!e.defaultPrevented && i !== current) nav.navigation.navigate(route.name);
      return;
    }
    own?.onChange(i, tabs[i]);
  };
  const action = onAction ? actionItem(actionLabel) : null;
  const dark = useTheme().scheme === "dark";
  const half = Math.ceil(tabs.length / 2);
  const item = (t: TabItem, i: number) => <NavItem key={t.key} icon={t.icon} label={t.label} active={i === current} onPress={() => press(i)} role="tab" />;
  return (
    <View
      style={[
        floating ? { position: "absolute", left: 0, right: 0, bottom: 0 } : null,
        {
          // A white sheet with rounded top corners, lifted off the page by a soft upward shadow (an edge in the dark).
          // Floating over the pages it is frosted glass: what scrolls under it, blurred, through a light tint.
          backgroundColor: blurTarget ? "transparent" : calmBar.card,
          paddingBottom: insets.bottom,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTopWidth: 1,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: calmBar.hairline,
          ...(dark ? null : { boxShadow: "0 -8px 28px rgba(48,38,22,0.07)" }),
        },
      ]}
    >
      {blurTarget && (
        // Only the glass is clipped to the rounded top: the raised centre button still rises above the bar.
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" }}>
          <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={dark ? 40 : 50} tint={dark ? "dark" : "light"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha(calmBar.card, dark ? 0.62 : 0.66) }} />
        </View>
      )}
      <View accessibilityRole="tablist" style={{ height: TAB_BAR_HEIGHT, flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 6 }}>
        <Indicator slot={current < 0 ? -1 : action && current >= half ? current + 1 : current} slots={tabs.length + (action ? 1 : 0)} />
        {tabs.slice(0, half).map((t, i) => item(t, i))}
        {/* The action in the middle: a raised teal circle (Check in, or the coach), above the bar's edge. */}
        {action && onAction && (
          <CenterAction
            icon={action.icon}
            label={action.label}
            accessibilityLabel={actionLabel ?? action.label}
            onPress={() => {
              haptic();
              onAction();
            }}
          />
        )}
        {tabs.slice(half).map((t, i) => item(t, i + half))}
      </View>
    </View>
  );
}
