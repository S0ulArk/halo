// More `/more` (spec §7.14, U21), ported from the web's src/app/(app)/more/page.tsx: everything that isn't configuration,
// as groups of rows in one column, then About. The phone adds what the web's server does on its own: a Data group (Sync
// now with its progress and the last sync or error, switching between Health Connect and demo data) and Diagnostics
// (what Health Connect holds, the component kit, removing every row).
import * as React from "react";
import { useRouter, type Href } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import {
  Archive,
  Bell,
  Bluetooth,
  BookOpen,
  BotMessageSquare,
  CalendarDays,
  CalendarRange,
  ChartLine,
  Database,
  HeartPulse,
  ListChecks,
  Palette,
  Plug,
  RefreshCw,
  Sparkles,
  SwatchBook,
  Target,
  Trash2,
  UserRound,
  History,
  ClipboardCheck,
} from "lucide-react-native";
import { describeHealthConnect } from "@/health/sync";
import { localDay } from "@/lib/time";
import { ago, formatDay, rangeLabel } from "@/lib/format";
import { APP_VERSION, getMore, SCORING_VERSION } from "@/queries/settings";
import { useApp, useQuery, useSyncProgress } from "@/state/app";
import { useCalm } from "../settings/calmKit";
import { TabShell, useNow } from "../health/shells";
import { progressLabel } from "../home/status";
import { ConfirmDialog } from "../settings/parts";
import { About } from "./About";
import { SCORE_DOCS } from "./howItWorksContent";
import { LinkList, MORE_COLUMN, type LinkListRow } from "./LinkList";
import { LIVE_LINKS } from "@/screens/breathe/entries";

type Confirm = "demo" | "health" | "reset" | null;

export default function MoreScreen() {
  const router = useRouter();
  const app = useApp();
  const syncProgress = useSyncProgress();
  const c = useCalm();
  const now = useNow();
  const demo = app.source === "demo";
  const q = useQuery((ctx) => getMore(ctx, demo ? "demo" : "google"), [demo]);
  const vm = q.data;
  const [confirm, setConfirm] = React.useState<Confirm>(null);
  const [diag, setDiag] = React.useState<string | null>(null);

  const syncing = app.status === "syncing";
  const failed = app.error ?? app.sync.lastError;
  const sourceLabel = demo ? "Demo data" : app.source === "health_connect" ? "Health Connect" : app.source === "google" ? "Google account" : "No data source";
  const last = app.sync.lastSyncTs ? app.sync.lastSyncTs * 1000 : null;

  const runDiag = async () => {
    setDiag("Reading Health Connect…");
    try {
      const rows = await describeHealthConnect(7);
      setDiag(
        rows.length
          ? rows
              .map((r) => {
                const latest = r.latest ? `, latest ${localDay(Date.parse(r.latest) / 1000, app.timeZone)}` : "";
                return `${r.type}: ${r.count}${latest}${r.origins.length ? ` (${r.origins.join(", ")})` : ""}${r.error ? ` – ${r.error}` : ""}`;
              })
              .join("\n")
          : "No records in the last 7 days.",
      );
    } catch (e) {
      setDiag(e instanceof Error ? e.message : String(e));
    }
  };

  const data: LinkListRow[] = [
    {
      label: syncing ? "Syncing…" : "Sync now",
      iconNode: syncing ? <ActivityIndicator size="small" color={c.tintInk.sky} /> : undefined,
      icon: RefreshCw,
      tint: "sky",
      description: syncing
        ? syncProgress
          ? progressLabel(syncProgress)
          : `Reading ${sourceLabel}`
        : failed
          ? `Last run failed: ${failed}`
          : `${sourceLabel} · ${last ? `synced ${ago(last, Math.max(now, last))}` : "not synced yet"}`,
      descriptionColor: !syncing && failed ? c.tintInk.rose : undefined,
      onPress: syncing ? undefined : () => void app.refresh(),
      disabled: syncing,
      action: true,
    },
    ...(app.source === "health_connect" || app.source === "google"
      ? [
          {
            label: "Re-import all history",
            icon: History,
            tint: "sky" as const,
            description: app.source === "google" ? "Reads the last 180 days from Google again" : "Reads the last 180 days from Health Connect again, for data an app shared late",
            onPress: syncing ? undefined : () => void app.reimport(),
            disabled: syncing,
            action: true,
          },
        ]
      : []),
    demo
      ? { label: "Connect Health Connect", icon: HeartPulse, tint: "rose", description: "Switch from demo data to your Fitbit", onPress: () => setConfirm("health"), disabled: syncing }
      : { label: "Use demo data", icon: Sparkles, tint: "lavender", description: "Generated data for a demo person", onPress: () => setConfirm("demo"), disabled: syncing },
  ];
  // Each part of Settings is a row here, as the web's More below 1280 px ("Account & settings").
  const settings: LinkListRow[] = [
    { icon: UserRound, tint: "sand", label: "Profile", href: "/settings?s=profile" },
    { icon: Plug, tint: "sky", label: "Data source", href: "/settings?s=source" },
    { icon: Target, tint: "peach", label: "Goals", href: "/settings?s=goals" },
    { icon: Bell, tint: "sand", label: "Notifications & background", href: "/settings?s=notifications" },
    { icon: Bluetooth, tint: "rose", label: "Live heart rate", href: "/settings?s=live" },
    { icon: Palette, tint: "lavender", label: "App", href: "/settings?s=app" },
    { icon: BotMessageSquare, tint: "mint", label: "Coach", href: "/settings?s=coach" },
  ];
  const reports: LinkListRow[] = [
    ...(vm?.latestWeek ? [{ icon: CalendarRange, tint: "sky" as const, label: "Weekly report", aside: rangeLabel(vm.latestWeek.start, vm.latestWeek.end), href: `/reports/${vm.latestWeek.period}` }] : []),
    ...(vm?.latestMonth ? [{ icon: CalendarDays, tint: "sky" as const, label: "Monthly report", aside: formatDay(vm.latestMonth.start, { month: "long" }), href: `/reports/${vm.latestMonth.period}` }] : []),
    { icon: Archive, tint: "sky", label: "All reports", aside: vm?.reportCount ? String(vm.reportCount) : undefined, href: "/reports" },
  ];
  const diagnostics: LinkListRow[] = [
    { icon: Database, tint: "sky", label: "Health Connect records (7 days)", description: diag ?? "Counts per record type and which app wrote them", onPress: () => void runDiag(), action: true },
    { icon: ClipboardCheck, tint: "mint", label: "Data check", description: `${app.source === "google" ? "Google Health API" : "Health Connect"} vs Halo, day by day and source by source`, href: "/more/datacheck" },
    { icon: SwatchBook, tint: "lavender", label: "Component kit", description: "Every UI piece with sample data", href: "/kit" },
    { icon: Trash2, label: "Remove all data", danger: true, onPress: () => setConfirm("reset"), action: true },
  ];

  return (
    // Off the tab bar (the avatar on every tab opens it): back to where it was opened from, or Today.
    <TabShell title="More" onBack={() => (router.canGoBack() ? router.back() : router.navigate("/" as Href))}>
      <View style={MORE_COLUMN}>
        <LinkList title="Data" rows={data} />
        <LinkList title="Account & settings" rows={settings} />
        <LinkList title="Reports" rows={reports} />
        <LinkList title="Trends" rows={[{ icon: ChartLine, tint: "mint", label: "Trends", aside: "Up to 1 year", href: "/trends" }]} />
        <LinkList title="Live" rows={LIVE_LINKS.map((r) => ({ tint: r.href === "/breathe" ? ("lavender" as const) : ("peach" as const), ...r }))} />
        <LinkList title="Journal" rows={[{ icon: ListChecks, tint: "lavender", label: "Behaviours", aside: vm ? `${vm.behaviours.shown} of ${vm.behaviours.total} shown` : undefined, href: "/more/behaviours" }]} />
        <LinkList title="Help" rows={[{ icon: BookOpen, tint: "sky", label: "How Halo works", aside: `${SCORE_DOCS.length} scores`, href: "/more/how-it-works" }]} />
        <LinkList title="Your data" rows={[{ icon: Database, tint: "sand", label: "Export", aside: "CSV, JSON", href: "/more/data" }]} />
        <LinkList title="Diagnostics" rows={diagnostics} />
        <About version={vm?.version ?? APP_VERSION} scoringVersion={vm?.scoringVersion ?? SCORING_VERSION} />
      </View>

      <ConfirmDialog
        open={confirm === "demo"}
        onClose={() => setConfirm(null)}
        title="Use demo data?"
        description="Halo removes what it imported from Health Connect and fills every screen with 180 days of generated data. Your profile is kept for when you switch back."
        confirm="Use demo data"
        onConfirm={() => {
          setConfirm(null);
          void app.useDemo();
        }}
      />
      <ConfirmDialog
        open={confirm === "health"}
        onClose={() => setConfirm(null)}
        title="Connect Health Connect?"
        description="Halo removes the demo data, asks for Health Connect permissions and imports your last 180 days."
        confirm="Continue"
        onConfirm={() => {
          setConfirm(null);
          void app.connectHealth();
        }}
      />
      <ConfirmDialog
        open={confirm === "reset"}
        onClose={() => setConfirm(null)}
        title="Remove all data?"
        description="Removes your profile and every row and score Halo stored on this phone. Health Connect keeps its own copy. This can’t be undone."
        confirm="Remove all data"
        pending="Removing…"
        danger
        onConfirm={async () => {
          // The root gate moves on to onboarding once the profile is gone.
          await app.reset();
          setConfirm(null);
        }}
      />
    </TabShell>
  );
}
