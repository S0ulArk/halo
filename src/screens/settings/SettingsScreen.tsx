// Settings `/settings?s=` (spec §7.14, journeys 9 and 10), ported from the web's settings/page.tsx and SettingsLayout:
// one section at a time, as the web shows it below 1280 px, where each section is its own row on More ("Account &
// settings") and opens at `?s=`. With none, the first section.
//
// Kept from the web: Profile (with its Edit sheet), Data source (status, permissions, Sync now, disconnect), App ›
// Appearance (System / Light / Dark) and Coach. Dropped, as a phone with no server or account has nothing behind them:
// the Account card (name, email, photo upload and crop, change password, sign out, admin panel, delete account), Google
// OAuth (connect, reconnect, switch account, the OAuth result toast), App › Install, and the coach's server-side
// provider/key settings (the coach screen owns its own setup). App › Notifications (web push) becomes Notifications &
// background (notifications.tsx): local notifications and the Health Connect background sync.
import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { DetailShell, useAfterTransition } from "@/ui";
import { useBack } from "../detail/nav";
import { GoalsSection } from "./goals";
import { LiveHrSection } from "./liveHr";
import { NotificationsSection } from "./notifications";
import { WeeklyPlanSection } from "./weeklyPlan";
import { AppSection, CoachSection, DataSourceSection, ProfileSection } from "./sections";

export type SectionId = "profile" | "source" | "goals" | "notifications" | "live" | "app" | "coach";
const IDS: SectionId[] = ["profile", "source", "goals", "notifications", "live", "app", "coach"];
/** The web's ids and older names: ?s=account, ?s=sync, ?s=appearance. */
const ALIAS: Record<string, SectionId> = { account: "profile", sync: "source", appearance: "app" };

export const resolveSection = (raw: string | string[] | undefined): SectionId => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const id = (v && (ALIAS[v] ?? v)) as SectionId;
  return IDS.includes(id) ? id : "profile";
};

export default function SettingsScreen() {
  const { s } = useLocalSearchParams<{ s?: string }>();
  const onBack = useBack("/more");
  const section = resolveSection(s);
  // The push runs over the bare header: a section (Goals has eight switches and fields, each a native text field)
  // mounts once the screen has opened. Each section is the Calm grouped list: a small capital header over white cards.
  const opened = useAfterTransition();
  const node = !opened ? null : section === "source" ? (
    <DataSourceSection />
  ) : section === "goals" ? (
    <>
      <GoalsSection />
      <WeeklyPlanSection />
    </>
  ) : section === "notifications" ? (
    <NotificationsSection />
  ) : section === "live" ? (
    <LiveHrSection />
  ) : section === "app" ? (
    <AppSection />
  ) : section === "coach" ? (
    <CoachSection />
  ) : (
    <ProfileSection />
  );
  return <DetailShell title="Settings" onBack={onBack} primary={<View style={{ alignSelf: "center", width: "100%", maxWidth: 640, gap: 24 }}>{node}</View>} />;
}
