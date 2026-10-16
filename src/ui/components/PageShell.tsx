// The tab-root page frame (PageShell) and what every page frame shares: the solid ground, the quiet scroll throttle,
// and the room kept clear of the tab bar at the foot of a page.
import * as React from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedRef, useScrollOffset } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassTarget } from "@/ui/glass";
import { useTheme } from "@/ui/ThemeProvider";
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher";
import { LargeTitle, TitleHeader, useBarInset } from "./DetailHeader";
import { HomeHeader, type HomeHeaderProps } from "./HomeHeader";
import type { SyncShellStatus } from "./SyncStatus";
import { SyncStatus } from "./SyncStatus";

/**
 * The page ground (spec §2.1): one solid colour behind the content, `background` (Healthspan: `groundHealthspan`). No
 * full-screen gradient: a flat fill costs nothing to draw or upload. Place it first inside a screen's root View.
 */
export function Ground({
  variant = "default",
}: {
  variant?: "default" | "healthspan";
}) {
  const { c } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: variant === "healthspan" ? c.groundHealthspan : c.background },
      ]}
    />
  );
}

/**
 * `scrollEventThrottle` for a scroll view whose position no JS reads. Android sends JS a scroll event on every frame of
 * a scroll unless the throttle is 17 ms or more: at 120 Hz that is 120 small JS tasks a second for nothing.
 */
export const QUIET_SCROLL = 200;

/**
 * The navigation bar (TabBar): a full-width Material 3 style bar, TAB_BAR_HEIGHT px tall over the bottom safe-area
 * inset, laid out in flow under the tab screens (they end at its top edge).
 */
export const TAB_BAR_HEIGHT = 62;

/**
 * Bottom padding for a scroll view, so its last content scrolls clear of what sits at the screen's foot: on a tab root
 * 32 px of air (the bar is in flow below the screen, so nothing covers the content); on a detail screen the system
 * navigation area plus room to finish the page (at least 96 px, the web's).
 */
export function useBottomClearance(kind: "tabs" | "detail"): number {
  const { bottom } = useSafeAreaInsets();
  // A tab page runs under the floating, frosted bar: its last card scrolls clear of the bar with 24 px of air.
  return kind === "tabs" ? bottom + TAB_BAR_HEIGHT + 24 : Math.max(96, bottom + 72);
}

/** The tab bar's footprint from the screen's bottom edge: its height plus the safe-area inset under it. */
export function useTabBarTop(): number {
  const { bottom } = useSafeAreaInsets();
  return bottom + TAB_BAR_HEIGHT;
}

export type PageShellProps = {
  /** The page's title, centred in the header (Home's is hidden behind its own header). */
  title: string;
  /** Under the title (Journal). Home's header always carries the date pill. */
  dateSwitcher?: DateSwitcherProps;
  /** Sync status in the title header's right slot. */
  sync?: { status: SyncShellStatus; now: number | null; onPress?: () => void };
  /** Right-aligned on the first row of content (never in the header). */
  actions?: React.ReactNode;
  layout?: "stack" | "home" | "grid-2";
  /** For `layout="home"`: the Home header's props. */
  home?: HomeHeaderProps;
  /** A banner above the content (ConnectionBanner). */
  banner?: React.ReactNode;
  /** Bottom padding under the content (default: clear of the tab bar, useBottomClearance("tabs")). */
  bottomInset?: number;
  onScroll?: React.ComponentProps<typeof ScrollView>["onScroll"];
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Tab roots: Home, Health, Journal, More (spec §4.5), as iOS large-title pages: the bar floats over the content (its
 * inline title and scroll edge follow the scroll offset on the UI thread) and the content opens with the large title,
 * the day under it. Home keeps its own header in flow.
 */
export function PageShell({
  title,
  dateSwitcher,
  sync,
  actions,
  layout = "stack",
  home,
  banner,
  bottomInset,
  onScroll,
  contentStyle,
  children,
}: PageShellProps) {
  const { c } = useTheme();
  const clearance = useBottomClearance("tabs");
  const items = React.Children.toArray(children);
  const homeLayout = layout === "home" && !!home;
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const y = useScrollOffset(scrollRef);
  const top = useBarInset();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* The root's own fill is the ground: no second full-screen layer. */}
      <View style={{ flex: 1 }}>
        {homeLayout && <HomeHeader {...home} />}
        {/* The page is the glass's backdrop: the floating bar's round buttons (its overlay) bend what scrolls under them. */}
        <GlassTarget style={{ flex: 1 }} overlay={homeLayout ? null : <TitleHeader title={title} right={sync && <SyncStatus status={sync.status} now={sync.now} onPress={sync.onPress} />} scrollY={y} />}>
          <Animated.ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={[
              {
                paddingHorizontal: 16,
                paddingTop: homeLayout ? 8 : top,
                paddingBottom: bottomInset ?? clearance,
              },
              contentStyle,
            ]}
            contentInsetAdjustmentBehavior="never"
          >
            {!homeLayout && (
              <LargeTitle title={title} y={y}>
                {dateSwitcher ? <DateSwitcher {...dateSwitcher} /> : null}
              </LargeTitle>
            )}
            {banner && (
              <View style={{ marginBottom: layout === "home" ? 32 : 16 }}>
                {banner}
              </View>
            )}
            {actions && (
              <View
                style={{
                  marginBottom: 16,
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                {actions}
              </View>
            )}
            {layout === "grid-2" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {items.map((it, i) => (
                  <View key={i} style={{ width: "48%", flexGrow: 1 }}>
                    {it}
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ gap: 32 }}>{items}</View>
            )}
          </Animated.ScrollView>
        </GlassTarget>
      </View>
    </View>
  );
}
