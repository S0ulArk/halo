// Settings `/settings?s=` (spec §7.14, journeys 9 and 10), ported from the web's settings/page.tsx and SettingsLayout:
// one section at a time, as the web shows it below 1280 px, where each section is its own row on More and opens at
// `?s=`. With none, the first section. Each section is an iOS settings page: its own large title (Profile, Data source,
// Goals…), inset grouped lists with headers and footers explaining the options, and its groups rising into place in a
// short cascade once the page has opened.
//
// Kept from the web: Profile (with its Edit sheet, opened from the bar's Edit), Data source (status, permissions, Sync
// now, disconnect), App › Appearance (System / Light / Dark) and Coach. Added on the phone: Goals and the Weekly plan,
// Notifications & background (local notifications and the Health Connect background sync, the stand-in for the web's
// web push), Live heart rate, Units, and Connect to Claude (claude.tsx), the person's own MCP connector. Dropped, as a
// phone with no server or account has nothing behind them: the Account card (name, email, photo upload and crop,
// change password, sign out, admin panel, delete account), Google OAuth (connect, reconnect, switch account, the OAuth
// result toast), App › Install, and the coach's server-side provider/key settings (the coach screen owns its own setup).
import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useApp } from "@/state/app";
import { DetailShell, useAfterTransition } from "@/ui";
import { useBack } from "../detail/nav";
import { ClaudeSection } from "./claude";
import { GoalsSection } from "./goals";
import { LiveHrSection } from "./liveHr";
import { NotificationsSection } from "./notifications";
import { EditProfileButton } from "./ProfileSheet";
import { AppSection, CoachSection, DataSourceSection, ProfileSection } from "./sections";
import { UnitsSection } from "./units";
import { WeeklyPlanSection } from "./weeklyPlan";

export type SectionId = "profile" | "source" | "goals" | "notifications" | "live" | "app" | "units" | "coach" | "claude";
const IDS: SectionId[] = ["profile", "source", "goals", "notifications", "live", "app", "units", "coach", "claude"];
/** The web's ids and older names: ?s=account, ?s=sync, ?s=appearance. */
const ALIAS: Record<string, SectionId> = { account: "profile", sync: "source", appearance: "app" };

/** Each section's page title, as More's row names it. */
const TITLE: Record<SectionId, string> = {
  profile: "Profile",
  source: "Data source",
  goals: "Goals",
  notifications: "Notifications",
  live: "Live heart rate",
  app: "Appearance",
  units: "Units",
  coach: "Coach",
  claude: "Connect to Claude",
};

export const resolveSection = (raw: string | string[] | undefined): SectionId => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const id = (v && (ALIAS[v] ?? v)) as SectionId;
  return IDS.includes(id) ? id : "profile";
};

/** The section's groups (each section rises its own groups into place, one block of the cascade per group). */
function Section({ id }: { id: SectionId }) {
  switch (id) {
    case "source":
      return <DataSourceSection />;
    case "goals":
      return (
        <>
          <GoalsSection />
          <WeeklyPlanSection />
        </>
      );
    case "notifications":
      return <NotificationsSection />;
    case "live":
      return <LiveHrSection />;
    case "app":
      return <AppSection />;
    case "units":
      return <UnitsSection />;
    case "coach":
      return <CoachSection />;
    case "claude":
      return <ClaudeSection />;
    default:
      return <ProfileSection />;
  }
}

export default function SettingsScreen() {
  const { s } = useLocalSearchParams<{ s?: string }>();
  const app = useApp();
  const onBack = useBack("/more");
  const section = resolveSection(s);
  // The push runs over the bare header: a section (Goals has eight switches and fields, each a native text field)
  // mounts once the screen has opened, then its groups rise into place.
  const opened = useAfterTransition();
  return (
    <DetailShell
      title={TITLE[section]}
      onBack={onBack}
      action={section === "profile" && app.profile ? <EditProfileButton profile={app.profile} /> : undefined}
      primary={
        <View style={{ alignSelf: "center", width: "100%", maxWidth: 640, gap: 28 }}>{opened ? <Section id={section} /> : null}</View>
      }
    />
  );
}
