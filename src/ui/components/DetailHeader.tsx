// The page headers, iOS's. A page with a scroll offset gets the large-title pattern: a floating bar over the content
// (round 38 px Liquid Glass buttons, back on the left and actions on the right, nothing else at rest) and, first in the
// content, the 34 px bold large title with an optional caps eyebrow over it. As the page scrolls the large title shrinks
// a little and fades as it slides under the bar, the centred 17 px inline title fades in, and a soft scroll edge (the
// ground, solid under the status bar and fading out below the buttons) rises behind the bar so content softens as it
// passes under. Every frame of that runs on the UI thread, off the scroll offset (Reanimated); no JS runs per frame.
// A page without one keeps a plain bar in flow on the ground, its title centred.
import * as React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { useTheme } from "@/ui/ThemeProvider";
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher";
import { BackButton } from "./GlassButton";
import { InfoButton, type InfoContent } from "./InfoButton";
import { Txt } from "./Text";

/** The hairline under every header, in px. iOS headers have none: kept for API compatibility (layout offsets). */
export const HEADER_FADE = 1;

/** The header's bottom edge: iOS headers have no hairline, so this draws nothing; kept for API compatibility. */
export function HeaderFade(_props: { color: string; style?: StyleProp<ViewStyle> }) {
  return null;
}

/** The bar's row under the status bar: a 38 px round button with 7 px of air above and below. */
export const BAR_ROW = 52;
/** How far the page scrolls before the inline title has fully replaced the large one. */
const TITLE_SWAP = 48;

/** The top of a page's content under the floating bar: the status bar and the bar's row. */
export function useBarInset(): number {
  return useSafeAreaInsets().top + BAR_ROW;
}

/**
 * The plain bar frame: the ground from under the status bar to the bottom of its content, nothing scrolling under it
 * showing through, and no hairline. Place it above the ScrollView.
 */
export function HeaderFrame({ children, ground, style }: { children: React.ReactNode; ground?: "default" | "healthspan"; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const insets = useSafeAreaInsets();
  // Healthspan's ground is the same grouped ground; the prop stays for API compatibility.
  void ground;
  return (
    <View style={[{ zIndex: 20 }, style]}>
      <View style={{ backgroundColor: c.ground, paddingTop: insets.top }}>{children}</View>
    </View>
  );
}

/** A three-slot bar row: left, the centred title, right. The 38 px buttons sit with 7 px of air above and below, 16 px in. */
export function HeaderRow({ left, center, right, height = BAR_ROW, style }: { left?: React.ReactNode; center: React.ReactNode; right?: React.ReactNode; height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ minHeight: height, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 7 }, style]}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 8 }}>{left}</View>
      <View style={{ flexShrink: 1, alignItems: "center" }}>{center}</View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>{right}</View>
    </View>
  );
}

/** The bar's own title: Inter 600 17/22 in ink, centred, up to two lines (never cut short). */
function HeaderTitle({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={17} lineHeight={22} weight={600} numberOfLines={2} align="center" accessibilityRole="header" style={{ color: c.ink }}>
      {children}
    </Txt>
  );
}

/**
 * The floating bar over a scrolling page. At rest it is clear: only its buttons float over the ground. Scrolled, the
 * inline title fades in once the large title has gone under it, and the scroll edge rises behind it. Without a scroll
 * offset (`y` null) it stays at rest. Absolute: render it as the `overlay` of a GlassTarget around the ScrollView (so its
 * glass bends the page), the content starting `useBarInset()` down.
 */
export function NavBar({ y, title, left, right, ground }: { y: SharedValue<number> | null; title: string; left?: React.ReactNode; right?: React.ReactNode; ground?: string }) {
  const c = useCalm();
  const insets = useSafeAreaInsets();
  const fill = ground ?? c.ground;
  const height = insets.top + BAR_ROW;
  // The edge reaches 20 px past the bar so content fades out rather than being cut at its foot.
  const edgeH = height + 20;
  const edge = useAnimatedStyle(() => ({ opacity: y ? interpolate(y.value, [0, 12], [0, 1], Extrapolation.CLAMP) : 0 }));
  const inline = useAnimatedStyle(() => {
    const p = y ? interpolate(y.value, [TITLE_SWAP - 18, TITLE_SWAP], [0, 1], Extrapolation.CLAMP) : 0;
    return { opacity: p, transform: [{ translateY: (1 - p) * 6 }] };
  });
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, height: edgeH }, edge]}>
        <LinearGradient
          colors={[fill, alpha(fill, 0.94), alpha(fill, 0.6), alpha(fill, 0)]}
          locations={[0, insets.top / edgeH, (insets.top + BAR_ROW * 0.7) / edgeH, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View pointerEvents="box-none" style={{ paddingTop: insets.top }}>
        <HeaderRow
          left={left}
          center={
            <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={inline}>
              <Txt size={17} lineHeight={22} weight={600} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} align="center" style={{ color: c.ink }}>
                {title}
              </Txt>
            </Animated.View>
          }
          right={right}
        />
      </View>
    </View>
  );
}

/**
 * The large title, first in a page's content: an optional caps eyebrow (13 px semibold, grey) over the 34/41 bold title,
 * then an optional subtitle line and anything under it (a day switcher). An `icon` stands before the title. As the
 * page scrolls the title shrinks toward its left edge and fades, as it slides under the bar (UI thread).
 */
export function LargeTitle({ title, eyebrow, subtitle, icon, y, children, style }: { title: string; eyebrow?: string; subtitle?: string; icon?: React.ReactNode; y: SharedValue<number> | null; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const fade = useAnimatedStyle(() => {
    const v = y ? y.value : 0;
    return {
      opacity: interpolate(v, [0, TITLE_SWAP - 8], [1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(v, [0, TITLE_SWAP], [1, 0.94], Extrapolation.CLAMP) }],
    };
  });
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <Animated.View style={[{ transformOrigin: "left bottom" }, fade]}>
        {eyebrow ? (
          <Txt size={13} lineHeight={18} weight={600} style={{ color: c.sub, letterSpacing: 0.2 }}>
            {eyebrow.toUpperCase()}
          </Txt>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {icon ? <View style={{ height: 41, justifyContent: "center" }}>{icon}</View> : null}
          <Txt size={34} lineHeight={41} weight={700} accessibilityRole="header" style={{ color: c.ink, flexShrink: 1 }}>
            {title}
          </Txt>
        </View>
      </Animated.View>
      {subtitle ? (
        <Txt size={15} lineHeight={20} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
          {subtitle}
        </Txt>
      ) : null}
      {children ? <View style={{ marginTop: 10, alignItems: "flex-start" }}>{children}</View> : null}
    </View>
  );
}

export type DetailHeaderProps = {
  title: string;
  subtitle?: string;
  info?: InfoContent;
  /** Back (or close). A tab root has none: it passes `lead` (the avatar) instead. */
  onBack?: () => void;
  /** In place of the back button: the avatar on a tab root (Sleep, Activity). */
  lead?: React.ReactNode;
  /** Recovery, Strain, Sleep: the day with its chevrons. In a large-title page it sits under the large title. */
  dateTitle?: DateSwitcherProps;
  /** `close`: an X instead of the back chevron, for modal-style screens (Settings). */
  dismiss?: "back" | "close";
  /** `start`: an optional 24 px icon before the title, the subtitle under it (Activity). */
  align?: "center" | "start";
  titleIcon?: React.ReactNode;
  /** The bar's right side in place of the info button. */
  action?: React.ReactNode;
  ground?: "default" | "healthspan";
  /**
   * The page's scroll offset (Reanimated): the header floats over the page and its large title is in the content
   * (`DetailLargeTitle`). Absent: a plain bar in flow above the page, its title centred.
   */
  scrollY?: SharedValue<number> | null;
};

/** The bar's buttons for a detail page: back (or the tab root's lead) on the left, the action or info on the right. */
function barSides({ title, info, onBack, lead, dismiss, action }: DetailHeaderProps) {
  const left = lead ?? <BackButton onPress={onBack} dismiss={dismiss} />;
  const right = action ?? (info ? <InfoButton info={info} label={title} variant="header" /> : null);
  return { left, right };
}

/** The plain bar row of a detail page: back, the centred title (or the day), info. */
export function DetailHeaderRow(props: DetailHeaderProps) {
  const c = useCalm();
  const { left, right } = barSides(props);
  const { title, subtitle, dateTitle } = props;
  return (
    <HeaderRow
      left={left}
      center={
        <View style={{ alignItems: "center" }}>
          {dateTitle ? (
            <DateSwitcher {...dateTitle} placement="header" />
          ) : (
            <>
              <HeaderTitle>{title}</HeaderTitle>
              {subtitle ? (
                <Txt size={13} lineHeight={18} numberOfLines={2} align="center" style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
                  {subtitle}
                </Txt>
              ) : null}
            </>
          )}
        </View>
      }
      right={right}
    />
  );
}

/**
 * A detail page's header. With `scrollY`: the floating iOS bar (glass back and info, the inline title fading in as the
 * page scrolls); the page puts `DetailLargeTitle` first in its content. Without: a plain bar in flow on the ground.
 */
export function DetailHeader(props: DetailHeaderProps) {
  const { c } = useTheme();
  const { left, right } = barSides(props);
  if (props.scrollY !== undefined) return <NavBar y={props.scrollY} title={props.title} left={left} right={right} ground={props.ground === "healthspan" ? c.groundHealthspan : undefined} />;
  return (
    <HeaderFrame ground={props.ground}>
      <DetailHeaderRow {...props} />
    </HeaderFrame>
  );
}

/** A detail page's large title, from the header's props: the title (with its icon), the subtitle, and the day under them. */
export function DetailLargeTitle({ title, subtitle, titleIcon, dateTitle, eyebrow, y }: Pick<DetailHeaderProps, "title" | "subtitle" | "titleIcon" | "dateTitle"> & { eyebrow?: string; y: SharedValue<number> | null }) {
  return (
    <LargeTitle title={title} eyebrow={eyebrow} subtitle={subtitle} icon={titleIcon} y={y}>
      {dateTitle ? <DateSwitcher {...dateTitle} /> : null}
    </LargeTitle>
  );
}

/**
 * Health, Journal and More (the other tab roots): the avatar (or back) on the left, the right slot (SyncStatus). With
 * `scrollY` the bar floats and the page shows `LargeTitle` (with the day under it); without, a plain bar with the title
 * centred and the day pill under it.
 */
export function TitleHeader({ title, right, dateSwitcher, onBack, lead, scrollY }: { title: string; right?: React.ReactNode; dateSwitcher?: DateSwitcherProps; onBack?: () => void; lead?: React.ReactNode; scrollY?: SharedValue<number> | null }) {
  // A page reached from elsewhere (the journal, More) gets the way back; a tab root gets the avatar (`lead`).
  const left = onBack ? <BackButton onPress={onBack} /> : lead;
  if (scrollY !== undefined) return <NavBar y={scrollY} title={title} left={left} right={right} />;
  return (
    <HeaderFrame>
      <HeaderRow left={left} center={<HeaderTitle>{title}</HeaderTitle>} right={right} />
      {dateSwitcher && (
        <View style={{ alignItems: "center", paddingBottom: 8 }}>
          <DateSwitcher {...dateSwitcher} />
        </View>
      )}
    </HeaderFrame>
  );
}
