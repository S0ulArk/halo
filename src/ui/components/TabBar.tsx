// The phone's navigation bar, in the iOS 26 pattern: a floating Liquid Glass capsule holding the four tabs (icon over
// a small label), and the action on its own round glass button beside it. The selected tab sits in a lighter glass
// drop that slides between tabs on a spring and stretches as it goes (Reanimated, UI thread). Both pieces refract the
// pages scrolling under them when the bar is a GlassTarget's overlay (the tabs layout); elsewhere (the kit preview)
// they draw glass's stand-in.
import * as React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { perf } from "@/lib/perf";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createLucideIcon, HeartPlus, LayoutGrid, Menu, Moon, Plus, Sparkles, type LucideIcon } from "lucide-react-native";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { LiquidGlass } from "@/ui/glass";
import { reduceMotionNow } from "@/ui/motion/system";
import { Mark } from "./Mark";
import { ScrollEdgeFade } from "./ScrollEdgeFade";
import { useTheme } from "@/ui/ThemeProvider";
import { TAB_BAR_HEIGHT } from "./PageShell";
import { Txt } from "./Text";
import { usePress } from "./press";

/** A running figure, SF Symbols' "figure.run" drawn on lucide's 24 grid (lucide has no runner). */
const FigureRun = createLucideIcon("figure-run", [
  ["circle", { cx: "15", cy: "4.5", r: "1.6", key: "head" }],
  ["path", { d: "M5 20.5l4-1.5 2-4 3 2.5v4M8.5 11l2.5-3.5 4 1 2 3.5h3M11 7.5l-1 6.5", key: "body" }],
]);

export type TabItem = { key: string; label: string; icon: LucideIcon };
export const TABS: TabItem[] = [
  { key: "home", label: "Today", icon: LayoutGrid },
  { key: "sleep", label: "Sleep", icon: Moon },
  { key: "activity", label: "Activity", icon: FigureRun },
  { key: "health", label: "Health", icon: HeartPlus },
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

/** A standalone "Check in" / Coach button (the bar carries the action on its own round button): a flat white 62 px tile. */
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

/** iOS system blue: the selected tab and the action's glyph. */
const BLUE = { light: "#007AFF", dark: "#0A84FF" } as const;
/** The capsule's and the round button's height (the same 62 dp PageShell's clearance reserves). */
const BAR_H = TAB_BAR_HEIGHT;
/** From the screen's sides, between the capsule and the button, and above the system navigation area. */
const SIDE = 16;
const GAP = 12;
const LIFT = 6;
/** The capsule's inner padding at its round ends, and the drop's inset from its slot. */
const PAD = 5;
const DROP_H = BAR_H - 10;
const DROP_INSET = 2;
/** The drop's glide between tabs (a touch of overshoot) and its stretch settling with a small wobble. */
const GLIDE = { damping: 19, stiffness: 230, mass: 0.8 } as const;
const WOBBLE = { damping: 7, stiffness: 240, mass: 0.6 } as const;
/** The round button swells under the finger and bounces back. */
const SWELL = { damping: 14, stiffness: 420, mass: 0.6 } as const;
const SETTLE = { damping: 9, stiffness: 260, mass: 0.6 } as const;

/**
 * The selected tab's glass drop: one view moved between slots by a spring on the UI thread (transform only),
 * stretched along the move and settling with a wobble. Tint and rim only (glass on glass), no second live backdrop.
 */
function Drop({ slot, slotW, dark }: { slot: number; slotW: number; dark: boolean }) {
  const x = useSharedValue(slot * slotW);
  const stretch = useSharedValue(1);
  const last = React.useRef({ slot, slotW });
  React.useEffect(() => {
    const prev = last.current;
    last.current = { slot, slotW };
    const to = slot * slotW;
    // A new layout (first measure, rotation) jumps; a new tab glides.
    if (prev.slotW !== slotW || prev.slot === slot || reduceMotionNow()) {
      x.set(to);
      stretch.set(1);
      return;
    }
    x.set(withSpring(to, GLIDE));
    const peak = 1 + Math.min(0.1 + 0.05 * Math.abs(slot - prev.slot), 0.26);
    stretch.set(withSequence(withTiming(peak, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(1, WOBBLE)));
  }, [slot, slotW, x, stretch]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scaleX: stretch.value }, { scaleY: 1 - (stretch.value - 1) * 0.35 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: PAD + DROP_INSET, top: (BAR_H - DROP_H) / 2, width: slotW - DROP_INSET * 2, height: DROP_H }, style]}>
      <LiquidGlass
        backdrop={false}
        style={StyleSheet.absoluteFill}
        cornerRadius={DROP_H / 2}
        tint="#ffffff"
        frost={dark ? 0.14 : 0.72}
        shadow={dark ? "0 3px 10px rgba(0,0,0,0.35)" : "0 3px 10px rgba(0,0,0,0.10)"}
      />
    </Animated.View>
  );
}

function TabButton({ icon: Icon, label, selected, color, onPress }: { icon: LucideIcon; label: string; selected: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{ flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" }}
    >
      <Icon size={23} color={color} strokeWidth={1.9} />
      <Txt size={11} lineHeight={14} weight={selected ? 600 : 500} numberOfLines={1} style={{ color, marginTop: 3, letterSpacing: -0.1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** The glass capsule: the four tabs, the drop under the selected one. */
function TabCapsule({ tabs, current, onPress, dark }: { tabs: TabItem[]; current: number; onPress: (i: number) => void; dark: boolean }) {
  const calm = useCalm();
  const [width, setWidth] = React.useState(0);
  const slotW = width > 0 && tabs.length > 0 ? (width - PAD * 2) / tabs.length : 0;
  const blue = BLUE[dark ? "dark" : "light"];
  const idle = alpha(calm.ink, dark ? 0.82 : 0.74);
  return (
    <LiquidGlass style={{ flex: 1, height: BAR_H }} cornerRadius={BAR_H / 2}>
      <View accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flex: 1, flexDirection: "row", paddingHorizontal: PAD }}>
        {slotW > 0 && current >= 0 && <Drop slot={current} slotW={slotW} dark={dark} />}
        {tabs.map((t, i) => (
          <TabButton key={t.key} icon={t.icon} label={t.label} selected={i === current} color={i === current ? blue : idle} onPress={() => onPress(i)} />
        ))}
      </View>
    </LiquidGlass>
  );
}

/** The action on its own round glass button: a blue glyph that swells under the finger and bounces back. */
function ActionButton({ icon: Icon, accessibilityLabel, onPress, dark }: { icon: LucideIcon; accessibilityLabel: string; onPress: () => void; dark: boolean }) {
  const scale = useSharedValue(1);
  const lit = useSharedValue(0);
  const body = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glow = useAnimatedStyle(() => ({ opacity: lit.value }));
  const still = reduceMotionNow();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        if (!still) scale.set(withSpring(1.07, SWELL));
        lit.set(withTiming(1, { duration: 120 }));
      }}
      onPressOut={() => {
        if (!still) scale.set(withSpring(1, SETTLE));
        lit.set(withTiming(0, { duration: 260 }));
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <Animated.View style={[{ width: BAR_H, height: BAR_H }, body]}>
        <LiquidGlass style={StyleSheet.absoluteFill} cornerRadius={BAR_H / 2}>
          {/* Lit from inside while pressed. */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: BAR_H / 2, backgroundColor: dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.45)" }, glow]} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <Icon size={Icon === Plus ? 28 : 25} color={BLUE[dark ? "dark" : "light"]} strokeWidth={Icon === Plus ? 2.4 : 2} />
          </View>
        </LiquidGlass>
      </Animated.View>
    </Pressable>
  );
}

export type TabBarOwnProps = {
  /** Index of the current tab; −1 for none. */
  current: number;
  onChange: (index: number, tab: TabItem) => void;
  tabs?: TabItem[];
  /** The action, shown on the round button beside the tabs (omit to hide it). */
  onAction?: () => void;
  /** The action's accessible name; a coach action ("Open Coach") shows the sparkle, else the plus. */
  actionLabel?: string;
  /** Absolute at the bottom of its parent (default), or in flow. */
  floating?: boolean;
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

/** The action's accessible name (when none is given) and glyph: the sparkle for the coach, else the plus. */
function actionItem(label: string | undefined): { label: string; icon: LucideIcon } {
  if (label && /coach/i.test(label)) return { label: "Coach", icon: Sparkles };
  return { label: "Check in", icon: Plus };
}

const haptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

/** The scroll edge under the bar: the page fades into the ground toward the foot (see ScrollEdgeFade). */
export function TabBarFade() {
  const insets = useSafeAreaInsets();
  return <ScrollEdgeFade height={insets.bottom + LIFT + BAR_H + 44} />;
}

/**
 * Phone navigation bar: a glass capsule of four tabs and a round glass action button, floating 16 dp from the sides
 * just above the system navigation area, the pages scrolling under both. The selected tab is iOS blue in a lighter
 * glass drop; a press gives a light haptic.
 */
export function TabBar(props: TabBarProps) {
  const { onAction, actionLabel, floating = true } = props;
  const insets = useSafeAreaInsets();
  const dark = useTheme().scheme === "dark";
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
  return (
    <View
      // Touches between and around the two pieces reach the page under them.
      pointerEvents="box-none"
      style={[
        floating ? { position: "absolute", left: 0, right: 0, bottom: 0 } : null,
        { flexDirection: "row", alignItems: "center", gap: GAP, paddingHorizontal: SIDE, paddingBottom: insets.bottom + LIFT },
      ]}
    >
      <TabCapsule tabs={tabs} current={current} onPress={press} dark={dark} />
      {action && onAction && (
        <ActionButton
          icon={action.icon}
          accessibilityLabel={actionLabel ?? action.label}
          dark={dark}
          onPress={() => {
            haptic();
            onAction();
          }}
        />
      )}
    </View>
  );
}
