// The detail-screen frame for Recovery, Strain, Sleep, Activity and Activities. It is the kit's DetailShell layout,
// value for value, plus what DetailShell cannot take yet: a pull-to-refresh control and in-page anchors (the web's
// `#drivers` / `#planner`), which need the ScrollView's ref.
import * as React from "react";
import { useScrollToTop } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { CircleAlert } from "lucide-react-native";
import { DateSwitcher, DetailHeader, EmptyState, Ground, useTheme, type DetailShellProps } from "@/ui";
import { QUIET_SCROLL, useBottomClearance } from "@/ui/components/PageShell";
import { useAfterTransition } from "@/ui/components/AfterTransition";
import { HeroSlot, KEYBOARD_GAP } from "@/ui/components/DetailShell";
import Animated from "react-native-reanimated";
import { RevealScroll, Rise, useRevealScroll } from "@/ui/motion/Rise";

type ScrollRef = React.ComponentRef<typeof ScrollView>;
type ViewRef = React.ComponentRef<typeof View>;

export type Anchors = {
  scroll: React.RefObject<ScrollRef | null>;
  content: React.RefObject<ViewRef | null>;
  /** A callback ref that registers the view as the anchor `id`. */
  ref: (id: string) => (v: ViewRef | null) => void;
  /** Scrolls the anchor to the top of the content (the web's `scroll-mt`); false when it is not on screen yet. */
  scrollTo: (id: string, animated?: boolean) => boolean;
};

/** In-page anchors: wrap a section in `<View ref={anchors.ref("drivers")} collapsable={false}>`. */
export function useAnchors(): Anchors {
  const scroll = React.useRef<ScrollRef | null>(null);
  const content = React.useRef<ViewRef | null>(null);
  const targets = React.useRef(new Map<string, ViewRef>());
  const refs = React.useRef(new Map<string, (v: ViewRef | null) => void>());
  return React.useMemo(() => {
    const ref = (id: string) => {
      let r = refs.current.get(id);
      if (!r) {
        r = (v: ViewRef | null) => {
          if (v) targets.current.set(id, v);
          else targets.current.delete(id);
        };
        refs.current.set(id, r);
      }
      return r;
    };
    const scrollTo = (id: string, animated = true) => {
      const t = targets.current.get(id);
      const host = content.current;
      const s = scroll.current;
      if (!t || !host || !s) return false;
      t.measureLayout(host, (_x, y) => s.scrollTo({ y: Math.max(0, y - 8), animated }), () => {});
      return true;
    };
    return { scroll, content, ref, scrollTo };
  }, []);
}

/** A section the page can scroll to (`#id` links, a row's "see more"): `<Anchor anchors={anchors} id="zones">…</Anchor>`. */
export function Anchor({ anchors, id, children }: { anchors: Anchors; id: string; children: React.ReactNode }) {
  return (
    <View ref={anchors.ref(id)} collapsable={false}>
      {children}
    </View>
  );
}

export type DetailScreenProps = Omit<DetailShellProps, "contentStyle" | "secondary"> & {
  secondary?: (React.ReactNode | false | null | undefined)[];
  /** Pull to refresh. */
  refreshing?: boolean;
  onRefresh?: () => void;
  anchors?: Anchors;
  /** A screen with fields (Behaviours): a focused field scrolls clear of the keyboard, `keyboardOffset` under its caret. */
  keyboardAware?: boolean;
  keyboardOffset?: number;
};

/** Detail screens (spec §4.6): one dial, one number, then everything that explains it. */
export function DetailScreen({
  title,
  subtitle,
  info,
  onBack,
  lead,
  dateSwitcher,
  dismiss,
  align,
  titleIcon,
  action,
  ground,
  hero,
  heroGlow,
  summary,
  notch,
  insight,
  primary,
  secondary,
  footer,
  banner,
  bottomInset,
  refreshing,
  onRefresh,
  anchors,
  keyboardAware,
  keyboardOffset = KEYBOARD_GAP,
}: DetailScreenProps) {
  const { c } = useTheme();
  const side = summary ?? (hero ? insight : null);
  const inHeader = dateSwitcher?.placement === "header";
  const rest = (secondary ?? []).filter(Boolean);
  // The slide runs over the hero and its summary alone; everything under them mounts once the screen has opened.
  const opened = useAfterTransition();
  const below = opened || !hero;
  const clearance = useBottomClearance("detail");
  // As a tab root (Sleep, Activity), tapping its tab again scrolls back to the top; on a pushed screen this does nothing.
  const ownScroll = React.useRef<ScrollRef | null>(null);
  const scrollRef = anchors?.scroll ?? ownScroll;
  useScrollToTop(scrollRef as React.RefObject<ScrollView>);
  // Keyboard-aware only where there are fields: the score screens keep a plain (Reanimated) ScrollView, whose offset
  // on the UI thread lets sections below the fold rise as they scroll into view (motion/Rise).
  const Scroll = (keyboardAware ? KeyboardAwareScrollView : Animated.ScrollView) as unknown as typeof ScrollView;
  const { setRef: setScrollRef, y: scrollY } = useRevealScroll(scrollRef, !keyboardAware);
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Ground variant={ground} />
      <DetailHeader
        title={title}
        subtitle={subtitle}
        info={info}
        onBack={onBack}
        lead={lead}
        dismiss={dismiss}
        align={align}
        titleIcon={titleIcon}
        action={action}
        ground={ground}
        dateTitle={inHeader ? dateSwitcher : undefined}
      />
      <Scroll
        ref={setScrollRef}
        scrollEventThrottle={QUIET_SCROLL}
        {...(keyboardAware ? { bottomOffset: keyboardOffset, keyboardShouldPersistTaps: "handled" as const } : null)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset ?? clearance }}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.foregroundSecondary} colors={[c.foreground]} progressBackgroundColor={c.card} />
          ) : undefined
        }
      >
        <RevealScroll.Provider value={scrollY}>
          <View ref={anchors?.content} collapsable={false}>
            {banner && <View style={{ marginBottom: 16 }}>{banner}</View>}
            {dateSwitcher && !inHeader && (
              <View style={{ marginBottom: 16, alignItems: "center" }}>
                {/* Bare chevrons and the day, no pill: "‹ Mon, Sep 14 ›" (spec §11 F15). */}
                <DateSwitcher {...dateSwitcher} placement="header" />
              </View>
            )}
            {/* Calm: one column of cards 14 px apart, the hero a pastel card of its own (no glow behind it). */}
            <View style={{ gap: 14 }}>
              {/* Each block rises into place as the screen opens (a tab) or once its push has landed, cascading, and the
                  ones below the fold as they scroll in. A block mounting mid-push slides in with the screen instead. */}
              {(hero || side) && (
                <View style={{ gap: 14 }}>
                  {hero && (
                    <Rise index={0}>
                      <HeroSlot hero={hero} glow={heroGlow ?? null} />
                    </Rise>
                  )}
                  {side && (
                    <Rise index={1}>
                      {/* Calm: no notch; the hero is a card of its own. */}
                      {side}
                    </Rise>
                  )}
                </View>
              )}
              {below && (summary || !hero) && insight && <Rise index={2}>{insight}</Rise>}
              {below && primary && <Rise index={2}>{primary}</Rise>}
              {opened && rest.length > 0 && (
                <View style={{ gap: 14 }}>
                  {rest.map((s, i) => (
                    <Rise key={i} index={3 + i}>
                      {s}
                    </Rise>
                  ))}
                </View>
              )}
              {opened && footer && <Rise index={3 + rest.length}>{footer}</Rise>}
            </View>
          </View>
        </RevealScroll.Provider>
      </Scroll>
    </View>
  );
}

/** The web's error view (src/app/(app)/error.tsx): the shell stays, the screen offers a retry. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ paddingTop: 64 }}>
      <EmptyState icon={CircleAlert} body="Couldn’t load this screen." action={{ label: "Try again", onPress: onRetry }} />
    </View>
  );
}
