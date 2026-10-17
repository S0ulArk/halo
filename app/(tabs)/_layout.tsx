// The tab roots: Today, Sleep, Activity and Health. The journal and More are tab screens kept off the bar (the journal
// opens from Today and the check-in; More from the avatar on every tab). The tab bar itself is Halo's (src/ui), not
// the navigator's default: a floating Liquid Glass capsule of the four tabs and a round glass action button beside it,
// both refracting the pages that scroll under them. The action opens the coach once a provider key is saved (the web
// shows the coach there to people with coach access), else the one check-in sheet, mounted here for every screen (the
// web mounts it in the app layout).
import * as React from "react";
import { Tabs, useRouter, type Href } from "expo-router";
import { useHasCoachKey } from "@/coach/session";
import { CheckInSheetHost, useCheckInAction } from "@/screens/journal/CheckInSheet";
import { GlassTarget } from "@/ui/glass";
import { TabBarFade } from "@/ui/components/TabBar";
import { FloatingTabBar, TabBarBridge } from "@/ui/components/TabBarHost";

export default function TabsLayout() {
  const router = useRouter();
  const checkIn = useCheckInAction();
  const coach = useHasCoachKey();
  const action = coach ? { onAction: () => router.push("/coach" as Href), actionLabel: "Open Coach" } : checkIn;
  return (
    <>
      {/* The pages are the glass's backdrop; the bar floats over them at the foot as the target's overlay. */}
      <GlassTarget style={{ flex: 1 }} overlay={<FloatingTabBar {...action} />}>
        {/* freezeOnBlur: a tab out of view stops re-rendering on app-state ticks (the live heart rate, sync progress). */}
        <Tabs
          // A short cross-fade between tabs (native driver), so a switch reads as a move rather than a cut.
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" }, freezeOnBlur: true, animation: "fade" }}
          // Back returns to the tab you came from (the journal and More go back to where they were opened).
          backBehavior="history"
          tabBar={(props) => <TabBarBridge {...props} />}
        >
          <Tabs.Screen name="index" options={{ title: "Today" }} />
          <Tabs.Screen name="tab-sleep" options={{ title: "Sleep" }} />
          <Tabs.Screen name="tab-activity" options={{ title: "Activity" }} />
          <Tabs.Screen name="health" options={{ title: "Health" }} />
          {/* Off the bar: the journal (from Today's journal card and the check-in) and More (the avatar on every tab). */}
          <Tabs.Screen name="journal" options={{ title: "Journal", href: null }} />
          <Tabs.Screen name="more" options={{ title: "More", href: null }} />
        </Tabs>
        {/* The page fades into the ground toward the bar; inside the target, so the glass bends the faded page. */}
        <TabBarFade />
      </GlassTarget>
      <CheckInSheetHost />
    </>
  );
}
