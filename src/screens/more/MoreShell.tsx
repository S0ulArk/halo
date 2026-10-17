// More's page frame, iOS Settings': the floating bar (the glass back button, the sync status on the right, the inline
// title fading in as the page scrolls) over a scroll view that opens with the 34 px large title, with pull to refresh
// and a tap on the tab scrolling back to the top. It is the Health tabs' frame (shells.tsx) with what a page with a
// search field needs: a tap on a result while the keyboard is up lands on the result, and a drag closes the keyboard.
// The page's blocks rise into place in a short cascade as it opens (motion/Rise), on the UI thread.
import * as React from "react";
import { RefreshControl, View, type ScrollView } from "react-native";
import Animated from "react-native-reanimated";
import { useScrollToTop } from "expo-router";
import { useApp } from "@/state/app";
import { BottomSheet, Button, SyncStatus, syncView, TitleHeader, Txt, useTheme, type SyncShellStatus } from "@/ui";
import { LargeTitle, useBarInset } from "@/ui/components/DetailHeader";
import { useBottomClearance } from "@/ui/components/PageShell";
import { GlassTarget } from "@/ui/glass";
import { RiseEach, useRevealScroll } from "@/ui/motion/Rise";
import { useNow } from "../health/shells";

/** The bar's sync status (the band with how fresh the data is): it opens a sheet with the last sync and Sync now. */
function SyncButton() {
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

/** Pull to refresh: re-imports and rescores (useApp().refresh), its spinner under the bar until the run ends. */
function usePullRefresh() {
  const top = useBarInset();
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
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={top} tintColor={c.foregroundSecondary} colors={[c.primary]} progressBackgroundColor={c.card} />;
}

/** The page: `head` (the search field) right under the large title, then each child a block that rises into place. */
export function MoreShell({ title, onBack, head, children }: { title: string; onBack: () => void; head?: React.ReactNode; children: React.ReactNode }) {
  const { c } = useTheme();
  const refreshControl = usePullRefresh();
  const clearance = useBottomClearance("tabs");
  const top = useBarInset();
  const scrollRef = React.useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  // The offset lives on the UI thread, for the bar's inline title and scroll edge; no JS runs on scroll.
  const { setRef, y } = useRevealScroll(scrollRef);
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <GlassTarget style={{ flex: 1 }} overlay={<TitleHeader title={title} onBack={onBack} right={<SyncButton />} scrollY={y} />}>
        <Animated.ScrollView
          ref={setRef}
          refreshControl={refreshControl}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: top, paddingBottom: clearance }}
          contentInsetAdjustmentBehavior="never"
        >
          <LargeTitle title={title} y={y} />
          {head ? <View style={{ marginTop: -4, marginBottom: 20 }}>{head}</View> : null}
          <View style={{ alignSelf: "center", width: "100%", maxWidth: 640, gap: 24 }}>
            <RiseEach>{children}</RiseEach>
          </View>
        </Animated.ScrollView>
      </GlassTarget>
    </View>
  );
}
