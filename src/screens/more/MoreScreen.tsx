// More `/more` (spec §7.14, U21), ported from the web's src/app/(app)/more/page.tsx and laid out as iOS Settings: the
// large title, a search field that finds any row (by its name, its sentence or words like "theme" or "bluetooth"), the
// profile card with its gradient monogram, then inset grouped lists with coloured icon squares: the settings (data
// source, goals, units, appearance; notifications and live heart rate; the coach and Connect to Claude, each with its
// current value), then Data (Sync now with its progress and the last sync or error, re-importing, switching between
// Health Connect and demo data), reports and trends, the live sessions, the journal, help and export, Diagnostics (what
// Health Connect holds, the data check, the component kit, removing every row) and About. Switching sources and removing
// data confirm with iOS alerts.
import * as React from "react";
import { useRouter, type Href } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import {
  Archive,
  Bell,
  Bluetooth,
  BookOpen,
  Cable,
  CalendarDays,
  CalendarRange,
  ChartLine,
  ClipboardCheck,
  Database,
  Download,
  HeartPulse,
  History,
  ListChecks,
  Palette,
  Plug,
  RefreshCw,
  Ruler,
  Sparkles,
  SwatchBook,
  Target,
  Trash2,
  UserRound,
} from "lucide-react-native";
import { providerLabel } from "@/coach/providers";
import { useCoachSetup } from "@/coach/session";
import { describeHealthConnect } from "@/health/sync";
import { ago, formatDay, rangeLabel } from "@/lib/format";
import { localDay, wholeYears } from "@/lib/time";
import { presetOf } from "@/lib/units";
import { connectorState, subscribeConnector } from "@/mcp/connector";
import { APP_VERSION, getMore, SCORING_VERSION } from "@/queries/settings";
import { useApp, useQuery, useSyncProgress } from "@/state/app";
import { useLiveBleControl } from "@/state/liveBle";
import { useUnits } from "@/state/units";
import { Txt, useTheme } from "@/ui";
import { LIVE_LINKS } from "@/screens/breathe/entries";
import { useNow } from "../health/shells";
import { progressLabel } from "../home/status";
import { useCalm } from "../settings/calmKit";
import { ProfileCard, SearchField } from "../settings/list";
import { ConfirmDialog } from "../settings/parts";
import { About } from "./About";
import { SCORE_DOCS } from "./howItWorksContent";
import { LinkList, type LinkListRow } from "./LinkList";
import { MoreShell } from "./MoreShell";

type Confirm = "demo" | "health" | "reset" | null;

/** A titled (or untitled) group of rows, as the page and the search both read them. */
type Group = { key: string; title?: string; footer?: string; rows: LinkListRow[] };

/** Whether the Connect to Claude connector is set up, kept current as it changes. */
function useConnectorOn(): boolean | null {
  const [on, setOn] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let live = true;
    const read = () => void connectorState().then((s) => live && setOn(!!s));
    read();
    const off = subscribeConnector(read);
    return () => {
      live = false;
      off();
    };
  }, []);
  return on;
}

/** The live heart rate link in a word, from the controller alone (not the beats, so More never re-renders per beat). */
function useLiveWord(): string {
  const live = useLiveBleControl();
  if (live.status === "live") return "Live";
  if (live.status === "connecting" || live.status === "lost") return "Connecting…";
  if (live.status === "scanning") return "Searching…";
  return live.remembered ? "Off" : "Not set up";
}

/** The rows whose words hold every word of `query` (in the row's name, sentence, value, group or keywords). */
function search(groups: Group[], query: string): LinkListRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return groups.flatMap((g) =>
    g.rows.filter((r) => {
      const hay = [r.label, r.description, r.aside, r.keywords, g.title].filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    }),
  );
}

export default function MoreScreen() {
  const router = useRouter();
  const app = useApp();
  const syncProgress = useSyncProgress();
  const c = useCalm();
  const { choice } = useTheme();
  const now = useNow();
  const demo = app.source === "demo";
  const q = useQuery((ctx) => getMore(ctx, demo ? "demo" : "google"), [demo]);
  const vm = q.data;
  const [confirm, setConfirm] = React.useState<Confirm>(null);
  const [diag, setDiag] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const coach = useCoachSetup();
  const claudeOn = useConnectorOn();
  const liveWord = useLiveWord();
  // Settings › Units' row says which units are on: a preset by name, else "Custom".
  const { units } = useUnits();
  const preset = presetOf(units);
  const unitsAside = preset === "metric" ? "Metric" : preset === "imperial" ? "Imperial (US)" : "Custom";

  const syncing = app.status === "syncing";
  const failed = app.error ?? app.sync.lastError;
  const sourceLabel = demo ? "Demo data" : app.source === "health_connect" ? "Health Connect" : app.source === "google" ? "Google account" : "No data source";
  const last = app.sync.lastSyncTs ? app.sync.lastSyncTs * 1000 : null;
  const p = app.profile;
  const age = p ? wholeYears(p.birthDate, app.today) : null;
  const profileLine = p ? `${age} years · ${p.sex === "male" ? "Male" : "Female"} · Body measurements and heart rate` : "Birth date, sex, body measurements and heart rate";

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

  const groups: Group[] = [
    {
      key: "settings",
      rows: [
        { icon: UserRound, system: "gray", label: "Profile", description: profileLine, href: "/settings?s=profile", keywords: "age birth date birthday sex height waist max heart rate time zone edit" },
        { icon: Plug, system: "green", label: "Data source", aside: sourceLabel, href: "/settings?s=source", keywords: "health connect google fitbit sync permissions disconnect" },
        { icon: Target, system: "orange", label: "Goals", href: "/settings?s=goals", keywords: "steps distance floors water sleep active zone minutes weekly plan targets rings" },
        { icon: Ruler, system: "gray", label: "Units", aside: unitsAside, href: "/settings?s=units", keywords: "metric imperial kilograms pounds kg lb centimetres feet inches miles kilometres celsius fahrenheit millilitres fluid ounces" },
        { icon: Palette, system: "indigo", label: "Appearance", aside: choice === "system" ? "System" : choice === "light" ? "Light" : "Dark", href: "/settings?s=app", keywords: "theme dark light mode app display" },
      ],
    },
    {
      key: "alerts",
      rows: [
        { icon: Bell, system: "red", label: "Notifications & background", href: "/settings?s=notifications", keywords: "recovery ready alerts reminder check-in wind-down bedtime background sync updates test" },
        { icon: Bluetooth, system: "blue", label: "Live heart rate", aside: liveWord, href: "/settings?s=live", keywords: "bluetooth band fitbit air ble hrv connect" },
      ],
    },
    {
      key: "ai",
      rows: [
        { icon: Sparkles, system: "teal", label: "Coach", aside: coach === undefined ? undefined : coach.consent && coach.provider ? providerLabel(coach.provider) : "Off", href: "/settings?s=coach", keywords: "ai chat assistant gemini openai anthropic key provider" },
        { icon: Cable, system: "purple", label: "Connect to Claude", aside: claudeOn === null ? undefined : claudeOn ? "On" : "Off", href: "/settings?s=claude", keywords: "mcp connector cloudflare anthropic" },
      ],
    },
    {
      key: "data",
      title: "Data",
      rows: [
        {
          label: syncing ? "Syncing…" : "Sync now",
          iconNode: syncing ? <ActivityIndicator size="small" color="#ffffff" /> : undefined,
          icon: RefreshCw,
          system: "blue",
          description: syncing
            ? syncProgress
              ? progressLabel(syncProgress)
              : `Reading ${sourceLabel}`
            : failed
              ? `Last run failed: ${failed}`
              : `${sourceLabel} · ${last ? `synced ${ago(last, Math.max(now, last))}` : "not synced yet"}`,
          descriptionColor: !syncing && failed ? c.system.red : undefined,
          onPress: syncing ? undefined : () => void app.refresh(),
          disabled: syncing,
          action: true,
          keywords: "refresh import",
        },
        ...(app.source === "health_connect" || app.source === "google"
          ? [
              {
                label: "Re-import all history",
                icon: History,
                system: "indigo" as const,
                description: app.source === "google" ? "Reads the last 180 days from Google again" : "Reads the last 180 days from Health Connect again, for data an app shared late",
                onPress: syncing ? undefined : () => void app.reimport(),
                disabled: syncing,
                action: true,
              },
            ]
          : []),
        demo
          ? { label: "Connect Health Connect", icon: HeartPulse, system: "pink" as const, description: "Switch from demo data to your Fitbit", onPress: () => setConfirm("health"), disabled: syncing, action: true }
          : { label: "Use demo data", icon: Sparkles, system: "purple" as const, description: "Generated data for a demo person", onPress: () => setConfirm("demo"), disabled: syncing, action: true },
      ],
    },
    {
      key: "reports",
      title: "Reports and trends",
      rows: [
        ...(vm?.latestWeek ? [{ icon: CalendarRange, system: "blue" as const, label: "Weekly report", aside: rangeLabel(vm.latestWeek.start, vm.latestWeek.end), href: `/reports/${vm.latestWeek.period}` }] : []),
        ...(vm?.latestMonth ? [{ icon: CalendarDays, system: "indigo" as const, label: "Monthly report", aside: formatDay(vm.latestMonth.start, { month: "long" }), href: `/reports/${vm.latestMonth.period}` }] : []),
        { icon: Archive, system: "gray", label: "All reports", aside: vm?.reportCount ? String(vm.reportCount) : undefined, href: "/reports" },
        { icon: ChartLine, system: "green", label: "Trends", aside: "Up to 1 year", href: "/trends", keywords: "charts history" },
      ],
    },
    {
      key: "live",
      title: "Live",
      rows: LIVE_LINKS.map((r) => ({ ...r, system: r.href === "/breathe" ? ("cyan" as const) : ("orange" as const) })),
    },
    {
      key: "journal",
      title: "Journal",
      rows: [{ icon: ListChecks, system: "indigo", label: "Behaviours", aside: vm ? `${vm.behaviours.shown} of ${vm.behaviours.total} shown` : undefined, href: "/more/behaviours", keywords: "check-in tags habits" }],
    },
    {
      key: "help",
      title: "Help and your data",
      rows: [
        { icon: BookOpen, system: "orange", label: "How Halo works", aside: `${SCORE_DOCS.length} scores`, href: "/more/how-it-works", keywords: "explainer scores help recovery strain sleep" },
        { icon: Download, system: "teal", label: "Export your data", aside: "CSV, JSON", href: "/more/data", keywords: "your data download share backup" },
      ],
    },
    {
      key: "diagnostics",
      title: "Diagnostics",
      rows: [
        { icon: Database, system: "gray", label: "Health Connect records (7 days)", description: diag ?? "Counts per record type and which app wrote them", onPress: () => void runDiag(), action: true },
        { icon: ClipboardCheck, system: "green", label: "Data check", description: `${app.source === "google" ? "Google Health API" : "Health Connect"} vs Halo, day by day and source by source`, href: "/more/datacheck" },
        { icon: SwatchBook, system: "purple", label: "Component kit", description: "Every UI piece with sample data", href: "/kit" },
        { icon: Trash2, label: "Remove all data", danger: true, onPress: () => setConfirm("reset"), action: true, keywords: "reset delete erase" },
      ],
    },
  ];

  const searching = query.trim().length > 0;
  const hits = searching ? search(groups, query.trim()) : [];
  // The profile is the card at the top; its row only shows in search results.
  const page = groups.map((g) => (g.key === "settings" ? { ...g, rows: g.rows.slice(1) } : g));

  return (
    <>
      {/* Off the tab bar (the avatar on every tab opens it): back to where it was opened from, or Today. */}
      <MoreShell title="More" onBack={() => (router.canGoBack() ? router.back() : router.navigate("/" as Href))} head={<SearchField value={query} onChangeText={setQuery} />}>
        {searching ? (
          hits.length ? (
            <LinkList key="results" rows={hits} />
          ) : (
            <View key="none" style={{ alignItems: "center", paddingTop: 48, paddingHorizontal: 24, gap: 6 }}>
              <Txt size={20} lineHeight={25} weight={700} align="center" style={{ color: c.ink }}>
                {`No results for “${query.trim()}”`}
              </Txt>
              <Txt size={15} lineHeight={20} align="center" style={{ color: c.sub }}>
                Check the spelling or try a new search.
              </Txt>
            </View>
          )
        ) : (
          [
            <ProfileCard key="profile" title="Your profile" subtitle={profileLine} onPress={() => router.push("/settings?s=profile" as Href)} />,
            ...page.map((g) => <LinkList key={g.key} title={g.title} rows={g.rows} footer={g.footer} />),
            <About key="about" version={vm?.version ?? APP_VERSION} scoringVersion={vm?.scoringVersion ?? SCORING_VERSION} />,
          ]
        )}
      </MoreShell>

      {/* The confirmations render in the overlay layer, outside the page's column. */}
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
    </>
  );
}
