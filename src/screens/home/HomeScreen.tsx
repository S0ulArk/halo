// Home `/` (spec §7.1), ported from the web's src/app/(app)/(home)/page.tsx, as the mockups' iOS Today: the plain grouped
// ground like every other tab, the floating bar (a Liquid Glass streak
// capsule and the profile button over the page), the date eyebrow and the "Today" large title that folds into the bar
// as the page scrolls, then the rings hero, the coach, Pinned and the day's cards (sections.tsx).
//
// The page is the glass's backdrop: the scroll view and the bar's scroll edge sit inside one GlassTarget and
// the bar is its overlay, so the glass bends what is under it. The scroll offset lives on the UI thread (Reanimated):
// the large title's fold, the inline title, the scroll edge and the cards that rise as they scroll into view all read
// it there, and no JS runs while the page scrolls. Pull to refresh reads the live heart rate first, then syncs.
import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter, useScrollToTop, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleAlert } from "lucide-react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { RevealScroll, useRevealScroll } from "@/ui/motion/Rise";
import { dayLabel } from "@/lib/format";
import { dayHref, useDay } from "@/lib/day";
import { getHealthHub, getHome, getRecovery, getSleep, getStrain, getTrends } from "@/queries";
import { prefetchQuery, useApp, useQuery, useQueryCtx, useQueryStamp, useSyncProgress } from "@/state/app";
import { EmptyState, useTheme } from "@/ui";
import { useCalm } from "@/ui/calm";
import { BAR_ROW } from "@/ui/components/DetailHeader";
import { useBottomClearance } from "@/ui/components/PageShell";
import { GlassTarget } from "@/ui/glass";
import { homeKey, useDashboardKeys } from "./dashboard";
import { TopSlot, WeekInReview } from "./sections";
import { TodayBar, TodayTitle } from "./calm";
import { Rise } from "./rise";
import { HomeSkeleton } from "./skeleton";
import { progressLabel, useSyncShell, wearStreak } from "./status";
import { hasData } from "./view";

/** The scroll edge's steps under the bar: the wash at full strength to the bar's foot, then fading out over 18 dp. */
const EDGE_STEPS: [extra: number, opacity: number][] = [
  [0, 1],
  [6, 0.66],
  [12, 0.4],
  [18, 0.16],
];

/**
 * iOS 26's scroll edge for Today: once the page has moved, the ground colour rises under the bar, so the content softens
 * away as it passes under it rather than showing through the glass. Plain fills of the ground, each a few dp taller and
 * fainter, make the soft foot; it fades in with the first 14 dp of scroll (UI thread). Plain fills, not pictures: a
 * bitmap here was redrawn on every frame of a scroll.
 */
function ScrollEdge({ y }: { y: SharedValue<number> | null }) {
  const c = useCalm();
  const insets = useSafeAreaInsets();
  const bar = insets.top + BAR_ROW;
  const shown = useAnimatedStyle(() => ({ opacity: y ? interpolate(y.value, [0, 14], [0, 1], Extrapolation.CLAMP) : 0 }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, height: bar + EDGE_STEPS[EDGE_STEPS.length - 1][0] }, shown]}>
      {EDGE_STEPS.map(([extra, opacity]) => (
        <View key={extra} style={{ position: "absolute", top: 0, left: 0, right: 0, height: bar + extra, opacity, backgroundColor: c.ground }} />
      ))}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const app = useApp();
  const syncProgress = useSyncProgress();
  const router = useRouter();
  const { c } = useTheme();
  const calm = useCalm();
  const insets = useSafeAreaInsets();
  const clearance = useBottomClearance("tabs");
  const { d, today, isToday } = useDay();
  // My Dashboard's saved metrics (null: the default list); the editor's save refetches Home.
  const dashboard = useDashboardKeys();
  const home = useQuery((ctx) => getHome(d, ctx, { dashboardKeys: dashboard ?? undefined }), [d, dashboard], homeKey(d, dashboard));
  const streak = useQuery(wearStreak);
  const shell = useSyncShell();
  const [refreshing, setRefreshing] = React.useState(false);
  // Tapping Today in the bar while already on it scrolls back to the top.
  const scrollRef = React.useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  // The scroll offset on the UI thread: the title's fold, the bar, and the cards that rise as they scroll into view.
  const { setRef: setScrollRef, y: scrollY } = useRevealScroll(scrollRef);
  const top = insets.top + BAR_ROW;

  const vm = home.data;

  // Once Today has its numbers, the other tabs' models are worked out in the background, one at a time with a breath
  // between, so Sleep, Activity, Health and Recovery open with their numbers ready (the cache's, src/state/app.tsx).
  const qctx = useQueryCtx();
  const stamp = useQueryStamp();
  const warmFor = vm?.isToday ? vm.day : null;
  React.useEffect(() => {
    if (!qctx || !warmFor) return;
    const day = warmFor;
    const jobs: [string, () => Promise<unknown>][] = [
      [`strain:${day}`, () => getStrain(day, qctx)],
      [`sleep:${day}`, () => getSleep(day, qctx)],
      ["healthhub", () => getHealthHub(qctx)],
      [`recovery:${day}`, () => getRecovery(day, qctx)],
      ["trends:hours", () => getTrends("hours", qctx)],
    ];
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = true;
    const next = () => {
      const job = jobs[i++];
      if (!job || !live) return;
      void prefetchQuery(job[0], stamp, job[1]).then(() => {
        if (live) timer = setTimeout(next, 250);
      });
    };
    timer = setTimeout(next, 1200);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [qctx, stamp, warmFor]);
  // While another day loads, the last one stays on screen, dimmed, and its links keep its own day.
  const dayLoading = home.loading && !!vm && vm.day !== d;
  const shown = vm?.day ?? d;
  const at = React.useCallback((path: string) => dayHref(path, shown, today), [shown, today]);
  const go = React.useCallback((href: string) => router.push(href as Href), [router]);

  const setDay = React.useCallback((day: string) => router.setParams({ d: day === today ? undefined : day }), [router, today]);
  const refresh = () => void app.refresh();
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // The live heart rate first: it lands within a second, while the full import and rescoring take longer.
      void app.refreshLiveHr();
      await app.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  // The first import: nothing stored for today yet, so the skeleton stands in and says what the sync is doing. A
  // past day with no data keeps its honest reasons while a background refresh runs.
  const importing = app.status === "syncing" && (!vm || (vm.isToday && !hasData(vm)));
  const progress = importing ? (syncProgress ? progressLabel(syncProgress) : "Syncing…") : null;

  // Built only when the day's data changes: the bar's ticks re-render this screen, not the page.
  const error = !vm ? home.error : null;
  const timeZone = app.timeZone;
  const retry = app.refresh;
  const content = React.useMemo(() => {
    if (error) return <EmptyState icon={CircleAlert} body={`Home couldn’t load. ${error.message}`} action={{ label: "Retry", onPress: () => void retry() }} />;
    if (!vm || importing) return <HomeSkeleton progress={progress} go={go} />;
    const slot = { vm, timeZone, at, go };
    return (
      <>
        {/* Today: the summary. Sleep, Activity and Health hold each in full; every card here leads to its tab. */}
        <TopSlot {...slot} />
        <Rise index={9}>
          <WeekInReview {...slot} />
        </Rise>
      </>
    );
  }, [error, vm, importing, progress, go, timeZone, at, retry]);

  return (
    <View style={{ flex: 1, backgroundColor: calm.ground }}>
      <GlassTarget
        style={{ flex: 1 }}
        overlay={
          <TodayBar
            y={scrollY}
            title={dayLabel(d, today)}
            // Hidden on past days: the streak runs to today.
            streak={isToday ? (streak.data ?? null) : null}
            sync={{ status: shell.status, now: shell.now, onPress: refresh }}
            onAvatar={() => router.navigate("/more")}
          />
        }
      >
        <Animated.ScrollView
          ref={setScrollRef}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={top} tintColor={c.foregroundSecondary} colors={[calm.teal]} progressBackgroundColor={calm.card} />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: top, paddingBottom: clearance }}
        >
          <TodayTitle y={scrollY} day={d} today={today} firstDay={app.sync.firstDay} loading={dayLoading} onChange={setDay} />
          <RevealScroll.Provider value={scrollY}>
            <View style={{ gap: 12, marginTop: 10, opacity: dayLoading ? 0.6 : 1 }}>{content}</View>
          </RevealScroll.Provider>
        </Animated.ScrollView>
        <ScrollEdge y={scrollY} />
      </GlassTarget>
    </View>
  );
}
