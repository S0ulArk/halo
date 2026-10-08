// Screen chrome for the Health screens: the kit's PageShell and DetailShell layouts with pull-to-refresh, the back
// and day-switch behaviour, the header's sync status, and the error state. The kit shells own their ScrollView and
// take no RefreshControl, so these compose the same kit pieces (Ground, TitleHeader, DetailHeader, DateSwitcher).
import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter, type Href, useScrollToTop } from "expo-router";
import { CloudOff } from "lucide-react-native";
import { useApp } from "@/state/app";
import {
  BottomSheet,
  Button,
  DateSwitcher,
  DetailHeader,
  EmptyState,
  Ground,
  SyncStatus,
  syncView,
  TitleHeader,
  Txt,
  useTheme,
  type DateSwitcherProps,
  type InfoContent,
  type SyncShellStatus,
} from "@/ui";
import { useAfterTransition } from "@/ui/components/AfterTransition";
import { QUIET_SCROLL, useBottomClearance } from "@/ui/components/PageShell";
import Animated from "react-native-reanimated";
import { RevealScroll, Rise, RiseEach, useRevealScroll } from "@/ui/motion/Rise";

/** Wall-clock ms, ticking every 30 s (the web's useNow), for "2 minutes ago" and the sync age. */
export function useNow(every = 30_000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

/** Pull-to-refresh: re-imports and rescores (useApp().refresh), spinning until the run ends. */
function usePullRefresh() {
  const app = useApp();
  const { c } = useTheme();
  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await app.refresh();
    } finally {
      setRefreshing(false);
    }
  };
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.foregroundSecondary} colors={[c.primary]} progressBackgroundColor={c.card} />;
}

/** Back to wherever the screen was opened from; a deep link with no history lands on Home. */
export function useBack() {
  const router = useRouter();
  return React.useCallback(() => (router.canGoBack() ? router.back() : router.replace("/" as Href)), [router]);
}

/** Pushes a route built at run time (dayHref, metricHref): typed routes only know literal paths. */
export function usePush() {
  const router = useRouter();
  return React.useCallback((href: string) => router.push(href as Href), [router]);
}

/** The bare day row under the header: steps `?d=`, today clears it. */
export function useDaySwitcher(d: string, today: string): DateSwitcherProps {
  const router = useRouter();
  const { sync } = useApp();
  return { mode: "day", date: d, today, firstDay: sync.firstDay, onChange: (day) => router.setParams({ d: day === today ? undefined : day }) };
}

/** The header's sync status (the web's ShellStatus): it opens a sheet with the last sync and Sync now. */
function HeaderSync() {
  const app = useApp();
  const now = useNow();
  const [open, setOpen] = React.useState(false);
  const status: SyncShellStatus = {
    mode: app.source === "demo" ? "demo" : "google",
    sync: { state: app.status === "syncing" ? "syncing" : app.error ? "error" : "ok", lastSuccessAt: app.sync.lastSyncTs ? app.sync.lastSyncTs * 1000 : null },
    timeZone: app.timeZone,
  };
  const view = syncView(status, now);
  return (
    <>
      <SyncStatus status={status} now={now} onPress={() => setOpen(true)} />
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={app.source === "demo" ? "Demo data" : app.source === "google" ? "Google Health" : "Health Connect"}
        footer={
          <Button size="sheet" disabled={view.syncing} onPress={() => void app.refresh()}>
            {view.syncing ? "Syncing…" : "Sync now"}
          </Button>
        }
      >
        <View style={{ gap: 8 }}>
          <Txt role="body">{view.line}</Txt>
          {app.error && <Txt role="caption">{app.error}</Txt>}
        </View>
      </BottomSheet>
    </>
  );
}

/** A tab root (the kit's PageShell, stack layout) with the sync status and pull-to-refresh. */
/** A tab root's page: its title, the avatar on the left (to More) or, for a page off the bar, the way back. */
export function TabShell({ title, lead, onBack, children }: { title: string; lead?: React.ReactNode; onBack?: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  const refreshControl = usePullRefresh();
  const clearance = useBottomClearance("tabs");
  // Tapping the tab again while on it scrolls back to the top.
  const scrollRef = React.useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  // Sections rise into place as the tab opens and as they scroll into view (motion/Rise).
  const { setRef, y: revealY } = useRevealScroll(scrollRef);
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Ground />
      <TitleHeader title={title} lead={lead} onBack={onBack} right={<HeaderSync />} />
      <Animated.ScrollView ref={setRef} refreshControl={refreshControl} scrollEventThrottle={QUIET_SCROLL} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: clearance }} contentInsetAdjustmentBehavior="never">
        <RevealScroll.Provider value={revealY}>
          <View style={{ gap: 32 }}>
            <RiseEach>{children}</RiseEach>
          </View>
        </RevealScroll.Provider>
      </Animated.ScrollView>
    </View>
  );
}

export type DetailScreenProps = {
  title: string;
  info?: InfoContent;
  /** The bare day row under the header (Monitor, Stress, metric detail). */
  dateSwitcher?: DateSwitcherProps;
  hero?: React.ReactNode;
  summary?: React.ReactNode;
  insight?: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode[];
  footer?: React.ReactNode;
};

/** A detail route (the kit's DetailShell: hero, summary or insight, primary, secondary, footer) with pull-to-refresh. */
export function DetailScreen({ title, info, dateSwitcher, hero, summary, insight, primary, secondary, footer }: DetailScreenProps) {
  const { c } = useTheme();
  const onBack = useBack();
  const refreshControl = usePullRefresh();
  const side = summary || (hero ? insight : null);
  // The slide runs over the hero and its summary alone; everything under them mounts once the screen has opened.
  const opened = useAfterTransition();
  const below = opened || !hero;
  const clearance = useBottomClearance("detail");
  const { setRef, y: revealY } = useRevealScroll();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Ground />
      <DetailHeader title={title} info={info} onBack={onBack} />
      <Animated.ScrollView ref={setRef} refreshControl={refreshControl} scrollEventThrottle={QUIET_SCROLL} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: clearance }} contentInsetAdjustmentBehavior="never">
        <RevealScroll.Provider value={revealY}>
          {dateSwitcher && (
            // Bare chevrons and the day, no pill: "‹ Mon, Sep 14 ›" (spec §11 F15).
            <View style={{ marginBottom: 16, alignItems: "center" }}>
              <DateSwitcher {...dateSwitcher} placement="header" />
            </View>
          )}
          {/* One column of cards 14 px apart, the hero a card the width of the column; each block rises into place (a block
              mounting mid-push slides in with the screen instead). */}
          <View style={{ gap: 14 }}>
            {(hero || side) && (
              <View style={{ gap: 14 }}>
                {hero && <Rise index={0}>{hero}</Rise>}
                {side && <Rise index={1}>{side}</Rise>}
              </View>
            )}
            {below && (summary || !hero) && insight && <Rise index={2}>{insight}</Rise>}
            {below && primary && <Rise index={2}>{primary}</Rise>}
            {opened && secondary && secondary.length > 0 && (
              <View style={{ gap: 14 }}>
                {secondary.map((s, i) => (
                  <Rise key={i} index={3 + i}>
                    {s}
                  </Rise>
                ))}
              </View>
            )}
            {opened && footer && <Rise index={3 + (secondary?.length ?? 0)}>{footer}</Rise>}
          </View>
        </RevealScroll.Provider>
      </Animated.ScrollView>
    </View>
  );
}

/** A query that failed: what happened and a retry (a fresh sync and scoring run re-runs every screen query). */
export function ErrorState({ error }: { error: Error }) {
  const app = useApp();
  return (
    <View style={{ gap: 4 }}>
      <EmptyState icon={CloudOff} body="This screen could not load." action={{ label: "Retry", onPress: () => void app.refresh() }} />
      <Txt role="caption" align="center">
        {error.message}
      </Txt>
    </View>
  );
}
