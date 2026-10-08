// Home `/` (spec §7.1), ported from the web's src/app/(app)/(home)/page.tsx with its HomeHeader shell.
//
// The shell is the kit's PageShell layout="home" rebuilt in place, for two things PageShell does not take: a
// RefreshControl (pull to refresh) and a header that floats over the content. The web's header grows its ring row
// over the page rather than pushing it, so here the header sits over the ScrollView and the content starts 24 px
// below it; the ring row then shows once the dial labels have passed under the top row.
import * as React from "react";
import { Image, RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import { useRouter, useScrollToTop, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleAlert } from "lucide-react-native";
import Animated from "react-native-reanimated";
import { RevealScroll, Rise, useRevealScroll } from "@/ui/motion/Rise";
import { dayHref, useDay } from "@/lib/day";
import { getHealthHub, getHome, getRecovery, getSleep, getStrain, getTrends } from "@/queries";
import { prefetchQuery, useApp, useQuery, useQueryCtx, useQueryStamp, useSyncProgress } from "@/state/app";
import { EmptyState, useTheme } from "@/ui";
import { useCalm } from "@/ui/calm";
import { BandInView } from "@/ui/components/BandHero";
import { QUIET_SCROLL, useBottomClearance } from "@/ui/components/PageShell";
import { homeKey, useDashboardKeys } from "./dashboard";
import { TopSlot, WeekInReview } from "./sections";
import { CalmTopBar } from "./calm";
import { HomeSkeleton } from "./skeleton";
import { progressLabel, useSyncShell, wearStreak } from "./status";
import { hasData } from "./view";


// Soft washes of the family pastels at the top of the page, fading into the ground.
const BG_LIGHT = require("../../../assets/bg/halo-light.webp");
const BG_DARK = require("../../../assets/bg/calm-dark.webp");

export default function HomeScreen() {
  const app = useApp();
  const syncProgress = useSyncProgress();
  const router = useRouter();
  const { c, scheme } = useTheme();
  const calm = useCalm();
  const { height } = useWindowDimensions();
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
  // The scroll offset on the UI thread, for the cards that rise as they scroll into view (motion/Rise).
  const { setRef: setScrollRef, y: scrollY } = useRevealScroll(scrollRef);
  // The band photo's motion pauses once it has scrolled up out of sight (its tile ends ~330 px down the page).
  const [bandInView, setBandInView] = React.useState(true);
  const bandShown = React.useRef(true);
  const onScroll = React.useCallback((y: number) => {
    const v = y < 360;
    if (v === bandShown.current) return;
    bandShown.current = v;
    setBandInView(v);
  }, []);

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

  const setDay = (day: string) => router.setParams({ d: day === today ? undefined : day });
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

  // Built only when the day's data changes: the ring row's toggle on scroll re-renders this screen, not the page.
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
      {/* The page's picture: soft washes of the metric pastels at the top, fading into the ground. Fixed behind the scroll. */}
      <Image source={scheme === "dark" ? BG_DARK : BG_LIGHT} resizeMode="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(height, 780) }} fadeDuration={0} />
      <Animated.ScrollView
        ref={setScrollRef}
        scrollEventThrottle={QUIET_SCROLL}
        onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={insets.top} tintColor={c.foregroundSecondary} colors={[c.foreground]} progressBackgroundColor={c.card} />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: clearance }}
      >
        <View style={{ gap: 22 }}>
          <CalmTopBar
            dateSwitcher={{ mode: "day", date: d, today, firstDay: app.sync.firstDay, onChange: setDay, loading: dayLoading }}
            sync={{ status: shell.status, now: shell.now, onPress: refresh }}
            // Hidden on past days: the streak runs to today.
            streak={isToday ? (streak.data ?? null) : null}
            onAvatar={() => router.navigate("/more")}
          />
          <BandInView.Provider value={bandInView}>
            <RevealScroll.Provider value={scrollY}>
              <View style={{ gap: 32, opacity: dayLoading ? 0.6 : 1 }}>{content}</View>
            </RevealScroll.Provider>
          </BandInView.Provider>
        </View>
      </Animated.ScrollView>
      {/* The status bar's strip: the same picture as the page behind, clipped to the bar, so the top edge is seamless (no
          flat band over the washes) while scrolled content still passes under it, never under the clock's text. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, overflow: "hidden", backgroundColor: calm.ground }}>
        <Image source={scheme === "dark" ? BG_DARK : BG_LIGHT} resizeMode="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(height, 780) }} fadeDuration={0} />
      </View>
    </View>
  );
}
