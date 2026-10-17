// Settings' sections, ported from the web's SettingsView.tsx, SettingsClient.tsx and AppSettings.tsx, kept to what a
// phone with no server has, each laid out as an iOS settings page whose groups rise into place as it opens: Profile
// (the monogram, the details as label / value rows, Remove all data in red), Data source (Health Connect, a Google
// account through the Google Health API (google.tsx), or demo data: the source's feature header, what needs doing,
// Sync now, which apps' data to use, the permissions per data type, switching or disconnecting), Appearance (System,
// Light or Dark as three previews, iOS's picker) and Coach (the provider and the ways into the coach).
import * as React from "react";
import { AppState, Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { useRouter, type Href } from "expo-router";
import { Check, CircleAlert, HeartPulse, History, MessageCircle, Minus, Settings2, Sparkles, TriangleAlert } from "lucide-react-native";
import { providerLabel } from "@/coach/providers";
import { useChatCount, useCoachSetup } from "@/coach/session";
import { GOOGLE_SOURCE_ENABLED } from "@/google/flags";
import { askPermissions, openHealthConnectSettings, permissionState, READ_TYPES, type PermissionState, type ReadType } from "@/health/connect";
import { getSourcePolicy, setSourcePolicy, SOURCE_POLICIES, SOURCE_POLICY_LABELS, type SourcePolicy } from "@/health/sourcePolicy";
import { ago, DAY, formatDay } from "@/lib/format";
import { wholeYears } from "@/lib/time";
import { amount, cmToIn, heightText } from "@/lib/units";
import { getSettings } from "@/queries/settings";
import { useApp, useQuery, useSyncProgress } from "@/state/app";
import { useUnits } from "@/state/units";
import { Mark, SkeletonText, Txt, useTheme, type ColorToken, type ThemeChoice } from "@/ui";
import { usePress, usePressStyle } from "@/ui/components/press";
import { font } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { RiseEach } from "@/ui/motion/Rise";
import { useNow } from "../health/shells";
import { progressLabel } from "../home/status";
import { Hairline, useCalm } from "./calmKit";
import { ButtonRow, CheckRow, Disclosure, HeroCard, ICON_INSET, InfoRow, InsetGroup, NavRow, ProfileAvatar, RowBox } from "./list";
import { ConfirmDialog, ProgressBar, toneOf } from "./parts";
import { GoogleConnectGroup, GoogleSourceGroup } from "./google";
import { SyncNowRow } from "./syncNow";
import { toast } from "./toast";
import { describeZone } from "./zone";

// ── Profile ──────────────────────────────────────────────────────────────────

const PROFILE_ROWS = ["Birth date", "Age", "Sex", "Height", "Waist", "Max heart rate", "Time zone"];

type ProfileRow = { label: string; value: string; numeric?: boolean; unit?: string; detail?: string };

/** The profile: the monogram head, the details as rows (edited from the bar's Edit), and Remove all data last, in red. */
export function ProfileSection() {
  const c = useCalm();
  const app = useApp();
  const q = useQuery(getSettings);
  const p = q.data?.profile;
  const { units } = useUnits();
  const [confirm, setConfirm] = React.useState(false);
  // Numbers in tabular figures with their unit beside them; words stay words ("Not set", "Male"). Height and waist
  // follow Settings › Units: centimetres, or a height in feet and inches written out ("5 ft 9 in") and a waist in inches.
  const ftin = units.height === "ftin";
  const rows: ProfileRow[] | null = p
    ? [
        { label: "Birth date", value: formatDay(p.birthDate, DAY.full) },
        { label: "Age", value: String(p.age), numeric: true, unit: "years" },
        { label: "Sex", value: p.sex === "male" ? "Male" : "Female" },
        p.heightCm
          ? ftin
            ? { label: "Height", value: heightText(p.heightCm, units) }
            : { label: "Height", value: amount(p.heightCm, 1), numeric: true, unit: "cm" }
          : { label: "Height", value: "Not set" },
        p.waistCm ? { label: "Waist", value: amount(ftin ? cmToIn(p.waistCm) : p.waistCm, 1), numeric: true, unit: ftin ? "in" : "cm" } : { label: "Waist", value: "Not set" },
        { label: "Max heart rate", value: String(p.maxHr), numeric: true, unit: "bpm", detail: p.maxHrSource === "learned" ? "learned from workouts" : p.maxHrSource },
        { label: "Time zone", value: describeZone(p.timeZone) },
      ]
    : null;
  const age = app.profile ? wholeYears(app.profile.birthDate, app.today) : null;
  return (
    <>
      <RiseEach>
        <View accessible accessibilityLabel={age !== null ? `Your profile, ${age} years` : "Your profile"} style={{ alignItems: "center", gap: 4, paddingTop: 4 }}>
          <ProfileAvatar size={84} />
          <Txt size={22} lineHeight={28} weight={700} style={{ color: c.ink, marginTop: 8 }}>
            Your profile
          </Txt>
          <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
            Tap Edit to change any of it
          </Txt>
        </View>
        <InsetGroup title="Details" footer="Your days start at midnight in your time zone. Saving an edit recomputes your scores.">
          {rows
            ? rows.map((r) => <InfoRow key={r.label} label={r.label} value={r.value} numeric={r.numeric} unit={r.unit} detail={r.detail} />)
            : PROFILE_ROWS.map((k) => (
                <InfoRow key={k} label={k}>
                  <SkeletonText width={96} size={15} lineHeight={20} />
                </InfoRow>
              ))}
        </InsetGroup>
        <InsetGroup footer="Removes your profile and every row and score Halo stored on this phone. Health Connect keeps its own copy.">
          <ButtonRow label="Remove all data" danger center onPress={() => setConfirm(true)} />
        </InsetGroup>
      </RiseEach>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Remove all data?"
        description="Removes your profile and every row and score Halo stored on this phone. Health Connect keeps its own copy. This can’t be undone."
        confirm="Remove all data"
        pending="Removing…"
        danger
        onConfirm={async () => {
          // The root gate moves on to onboarding once the profile is gone.
          await app.reset();
          setConfirm(false);
        }}
      />
    </>
  );
}

// ── Data source ──────────────────────────────────────────────────────────────

/** Health Connect's record types as Settings lists them (the web's GROUPS labels). */
const TYPE_LABEL: Record<ReadType, string> = {
  SleepSession: "Sleep",
  HeartRate: "Heart rate",
  RestingHeartRate: "Resting heart rate",
  HeartRateVariabilityRmssd: "Heart rate variability",
  RespiratoryRate: "Respiratory rate",
  OxygenSaturation: "Blood oxygen",
  SkinTemperature: "Skin temperature",
  Steps: "Steps",
  Distance: "Distance",
  ExerciseSession: "Exercise",
  TotalCaloriesBurned: "Calories",
  ActiveCaloriesBurned: "Active calories",
  Vo2Max: "VO2 max",
  Weight: "Weight",
  BodyFat: "Body fat",
  FloorsClimbed: "Floors",
  ElevationGained: "Elevation gain",
  Hydration: "Water",
  Nutrition: "Food",
  BloodGlucose: "Blood glucose",
  BodyTemperature: "Body temperature",
  MenstruationPeriod: "Periods",
  MenstruationFlow: "Period flow",
  IntermenstrualBleeding: "Spotting",
  OvulationTest: "Ovulation tests",
};

/** What Health Connect has granted, re-read whenever the app comes back to the foreground (from its settings). */
function usePermissions(enabled: boolean) {
  const [state, setState] = React.useState<PermissionState | null>(null);
  const read = React.useCallback(() => permissionState().then(setState, () => setState(null)), []);
  React.useEffect(() => {
    if (!enabled) return;
    void read();
    const sub = AppState.addEventListener("change", (s) => s === "active" && void read());
    return () => sub.remove();
  }, [enabled, read]);
  return { state, read };
}

/** One data type's row: its name, whether it is allowed (amber when not), and a check or a dash. */
function TypeRow({ label, ok }: { label: string; ok: boolean }) {
  const c = useCalm();
  return (
    <View accessible accessibilityLabel={`${label}: ${ok ? "Allowed" : "Not allowed"}`} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
      <Txt size={16} lineHeight={21} style={{ flex: 1, minWidth: 0, color: c.ink }}>
        {label}
      </Txt>
      <Txt size={15} lineHeight={20} style={{ color: ok ? c.sub : c.tintInk.sand }}>
        {ok ? "Allowed" : "Not allowed"}
      </Txt>
      {ok ? <Check size={17} color={c.system.green} strokeWidth={2.6} /> : <Minus size={17} color={c.faint} strokeWidth={2.2} />}
    </View>
  );
}

/** Per record type, folded under one summary row; it opens itself when something is not allowed (the web's DataTypes). */
function DataTypes({ perms }: { perms: PermissionState }) {
  const c = useCalm();
  const missing = perms.missing.length + (perms.history ? 0 : 1);
  const rows: { key: string; label: string; ok: boolean }[] = [
    ...READ_TYPES.map((t) => ({ key: t, label: TYPE_LABEL[t], ok: perms.granted.includes(t) })),
    { key: "history", label: "Past data", ok: perms.history },
  ];
  const allowed = rows.length - missing;
  return (
    <Disclosure
      label="Data types"
      summary={missing ? `${missing} not allowed` : "All allowed"}
      summaryColor={missing ? c.tintInk.sand : undefined}
      defaultOpen={missing > 0}
      count={
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Txt size={17} lineHeight={22} style={[font.numeric(600), { color: c.ink }]}>
            {String(allowed)}
          </Txt>
          <Txt size={15} lineHeight={20} style={[font.numeric(500), { color: c.sub, marginLeft: 3 }]}>
            {`/ ${rows.length}`}
          </Txt>
        </View>
      }
    >
      {rows.map((r) => (
        <TypeRow key={r.key} label={r.label} ok={r.ok} />
      ))}
    </Disclosure>
  );
}

type SourceConfirm = "disconnect" | "demo" | "health" | null;

/**
 * Data source (spec §7.14): the source's feature header (its icon, name and state), what needs doing, Sync now, and
 * the per-type permissions folded underneath. A Google account as the source has its own page (google.tsx); with any
 * other source, the Google account follows as the richer option.
 */
export function DataSourceSection() {
  const app = useApp();
  if (app.source === "google") return <GoogleSourceGroup />;
  return (
    <>
      <HealthConnectSource />
      {GOOGLE_SOURCE_ENABLED && <GoogleConnectGroup />}
    </>
  );
}

/** The demo source's mark: the ring in white on its square. */
function WhiteMark({ size }: { size: number }) {
  return <Mark size={size} color="mono" mono="#ffffff" />;
}

/** A warning in a group: the coloured icon square, a title and its sentence (a row that does nothing on its own). */
function WarningRow({ title, body, red = false }: { title: string; body: string; red?: boolean }) {
  const c = useCalm();
  return <NavRow icon={red ? CircleAlert : TriangleAlert} system={red ? "red" : "yellow"} label={title} description={body} descriptionColor={c.sub} action />;
}

/** Health Connect, demo data or no source yet. */
function HealthConnectSource() {
  const c = useCalm();
  const app = useApp();
  const syncProgress = useSyncProgress();
  const now = useNow();
  const hc = app.source === "health_connect";
  const demo = app.source === "demo";
  const perms = usePermissions(hc);
  const [confirm, setConfirm] = React.useState<SourceConfirm>(null);
  const syncing = app.status === "syncing";
  const last = app.sync.lastSyncTs ? app.sync.lastSyncTs * 1000 : null;
  const failed = app.error ?? app.sync.lastError;
  const revoked = hc && !!perms.state && perms.state.granted.length === 0;
  const needsPermissions = hc && !!perms.state && !revoked && (perms.state.missing.length > 0 || !perms.state.history);
  const hcReady = app.availability === "available";

  const label = demo ? "Demo data" : hc ? "Health Connect" : "Not connected";
  const status: { line: string; tone?: ColorToken; body?: string } = demo
    ? { line: "180 days of generated data", body: "Every screen runs on realistic generated data. Connect Health Connect to score your own Fitbit data." }
    : !hc
      ? { line: "Not connected", body: "Connect Health Connect, where the Google Health app writes your Fitbit data. Halo only reads it; nothing leaves your phone." }
      : revoked
        ? { line: "Access revoked", tone: "recoveryRedText", body: "Health Connect access was removed. Sync is paused until you allow it again." }
        : app.availability === "update_required"
          ? { line: last ? `Synced ${ago(last, Math.max(now, last))}` : "Not synced yet", tone: "warning", body: "Health Connect needs an update. Update it from the Play Store, then sync again." }
          : app.availability === "unavailable"
            ? { line: "Not available", tone: "warning", body: "Health Connect is not available on this phone." }
            : { line: syncing ? "Syncing…" : last ? `Synced ${ago(last, Math.max(now, last))}` : "Not synced yet" };

  const allow = async () => {
    const p = await askPermissions().catch(() => null);
    await perms.read();
    if (p && p.granted.length) void app.refresh();
  };

  return (
    <>
      <RiseEach>
        <HeroCard
          icon={demo ? undefined : HeartPulse}
          iconNode={demo ? <WhiteMark size={40} /> : undefined}
          system={demo ? "indigo" : "pink"}
          title={label}
          status={status.line}
          statusColor={status.tone ? toneOf(c, status.tone) : undefined}
          body={status.body}
        />
        {(!!failed && !syncing) || (hc && app.syncWarnings.includes("no_fitbit_records") && !syncing) || needsPermissions ? (
          <InsetGroup title="Needs attention">
            {!!failed && !syncing && <WarningRow red title="Last run failed" body={failed} />}
            {hc && app.syncWarnings.includes("no_fitbit_records") && !syncing && <NoFitbitRecords />}
            {needsPermissions && <WarningRow title="Halo needs more permissions" body="Allow every data type, including past data, so Halo can read all of what your Fitbit writes. Sync keeps working until then." />}
            {needsPermissions && <ButtonRow label="Allow" onPress={() => void allow()} />}
            {needsPermissions && <ButtonRow label="Open Health Connect settings" onPress={() => openHealthConnectSettings()} />}
          </InsetGroup>
        ) : null}
        <InsetGroup title="Sync" footer={hc || demo ? `${status.line}. Halo also syncs on its own when it opens and, with background sync on, while it is closed.` : undefined}>
          {syncing && syncProgress ? (
            <RowBox gap={8}>
              <View accessibilityLiveRegion="polite">
                <Txt size={15} lineHeight={20} weight={500} style={{ color: c.ink, fontVariant: ["tabular-nums"] }}>
                  {`Importing… ${progressLabel(syncProgress)}`}
                </Txt>
              </View>
              <ProgressBar value={syncProgress.total > 0 ? syncProgress.done / syncProgress.total : 0} />
            </RowBox>
          ) : null}
          {hc ? revoked ? <ButtonRow label="Allow access" onPress={() => void allow()} /> : <SyncNowRow /> : demo ? <SyncNowRow /> : null}
          {hc && <ButtonRow label="Re-import all history" leading={<History size={19} strokeWidth={2.2} />} disabled={syncing} onPress={() => void app.reimport()} description="For data an app shared late" />}
          {!hc && <ButtonRow label="Connect Health Connect" onPress={() => setConfirm("health")} disabled={!hcReady || syncing} />}
        </InsetGroup>
        {hc && <SourcePolicyPicker />}
        {hc && perms.state && (
          <InsetGroup title="Permissions" footer="Health Connect decides what Halo may read. Change it there any time.">
            <DataTypes key={String(perms.state.missing.length)} perms={perms.state} />
          </InsetGroup>
        )}
        {hc && (
          <InsetGroup footer="Disconnecting removes your profile and everything Halo imported and scored on this phone. Health Connect keeps its own copy.">
            <ButtonRow label="Use demo data" onPress={() => setConfirm("demo")} disabled={syncing} />
            <ButtonRow label="Disconnect Health Connect" danger onPress={() => setConfirm("disconnect")} />
          </InsetGroup>
        )}
      </RiseEach>

      <ConfirmDialog
        open={confirm === "disconnect"}
        onClose={() => setConfirm(null)}
        title="Disconnect Health Connect?"
        description="Removes your profile and everything Halo imported and scored on this phone, and stops syncing. Health Connect keeps its own copy, and its permissions stay until you remove them there."
        confirm="Disconnect"
        pending="Disconnecting…"
        danger
        onConfirm={async () => {
          await app.reset();
          setConfirm(null);
          toast("Health Connect disconnected");
        }}
      />
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
    </>
  );
}

/** Which Health Connect records Halo uses: Fitbit only (default), Fitbit first, or every app, as iOS's checkmark list. A change re-imports. */
function SourcePolicyPicker() {
  const app = useApp();
  const [policy, setPolicy] = React.useState<SourcePolicy | null>(null);
  React.useEffect(() => {
    let live = true;
    void getSourcePolicy().then((p) => live && setPolicy(p));
    return () => {
      live = false;
    };
  }, []);
  const choose = async (p: SourcePolicy) => {
    if (p === policy) return;
    setPolicy(p);
    await setSourcePolicy(p);
    toast(`${SOURCE_POLICY_LABELS[p].label}: re-importing your history`);
    void app.reimport();
  };
  const syncing = app.status === "syncing";
  return (
    <InsetGroup title="Use data from" footer="Changing it re-imports your history from Health Connect.">
      {SOURCE_POLICIES.map((p) => (
        <CheckRow key={p} label={SOURCE_POLICY_LABELS[p].label} description={SOURCE_POLICY_LABELS[p].detail} selected={policy === p} disabled={syncing} onPress={() => void choose(p)} />
      ))}
    </InsetGroup>
  );
}

/** "Fitbit only" kept nothing: Google Health may label its records as the phone's, or isn't sharing yet. One tap to Fitbit first. */
function NoFitbitRecords() {
  const app = useApp();
  return (
    <View>
      <WarningRow
        title="Nothing from your Fitbit yet"
        body="With “Fitbit only”, Halo found no records from the Google Health app that weren’t measured by the phone. Either Google Health isn’t sharing with Health Connect yet, or it labels its records as the phone’s. “Fitbit first” uses the phone’s data on days the Fitbit has none."
      />
      <Hairline inset={ICON_INSET} />
      <ButtonRow
        label="Use Fitbit first"
        onPress={async () => {
          await setSourcePolicy("fitbit_first");
          toast("Fitbit first: re-importing your history");
          void app.reimport();
        }}
      />
    </View>
  );
}

// ── Appearance ───────────────────────────────────────────────────────────────

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** A phone in miniature in one scheme's colours: the ground, a title bar and three cards. */
function Miniature({ ground, card, ink }: { ground: string; card: string; ink: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: ground, padding: 7, gap: 5 }}>
      <View style={{ width: "55%", height: 6, borderRadius: 3, backgroundColor: ink, opacity: 0.85, marginBottom: 2 }} />
      <View style={{ height: 18, borderRadius: 5, backgroundColor: card }} />
      <View style={{ height: 12, borderRadius: 4, backgroundColor: card }} />
      <View style={{ height: 12, borderRadius: 4, backgroundColor: card }} />
    </View>
  );
}

/** One choice of the picker: the preview, its name, and the round check under it (filled blue when chosen). */
function ThemeTile({ value, label, selected, onPress }: { value: ThemeChoice; label: string; selected: boolean; onPress: () => void }) {
  const c = useCalm();
  const press = usePress(0.95);
  const pressed = usePressStyle(press, { dim: 0.85 });
  const light = { ground: "#f2f2f7", card: "#ffffff", ink: "#000000" };
  const dark = { ground: "#000000", card: "#2c2c2e", ink: "#ffffff" };
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={label} style={{ flex: 1 }}>
      <Animated.View style={[{ alignItems: "center", gap: 8 }, pressed]}>
        <View style={{ width: "100%", maxWidth: 96, aspectRatio: 0.62, borderRadius: 14, overflow: "hidden", flexDirection: "row", borderWidth: 2, borderColor: selected ? c.teal : c.line }}>
          {value === "dark" ? <Miniature {...dark} /> : <Miniature {...light} />}
          {/* System: the light screen's right half in the dark scheme. */}
          {value === "system" ? (
            <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "50%", overflow: "hidden" }}>
              <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "200%" }}>
                <Miniature {...dark} />
              </View>
            </View>
          ) : null}
        </View>
        <Txt size={15} lineHeight={20} weight={selected ? 600 : 400} style={{ color: c.ink }}>
          {label}
        </Txt>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: selected ? 0 : 1.5, borderColor: c.tertiary, backgroundColor: selected ? c.teal : "transparent", alignItems: "center", justifyContent: "center" }}>
          {selected ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Appearance: system, light or dark, as iOS's three previews. Kept per device (ThemeProvider stores it). */
export function AppSection() {
  const { choice, setChoice } = useTheme();
  return (
    <RiseEach>
      <InsetGroup title="Appearance" footer="System follows this device’s light or dark setting.">
        <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 }}>
          {THEMES.map((t) => (
            <ThemeTile
              key={t.value}
              value={t.value}
              label={t.label}
              selected={choice === t.value}
              onPress={() => {
                if (choice !== t.value) haptic.select();
                setChoice(t.value);
              }}
            />
          ))}
        </View>
      </InsetGroup>
    </RiseEach>
  );
}

// ── Coach ────────────────────────────────────────────────────────────────────

/** Settings › Coach: the coach keeps its own setup (provider, key, chats); this shows the provider and opens it. */
export function CoachSection() {
  const router = useRouter();
  const setup = useCoachSetup();
  const chats = useChatCount();
  const on = !!setup?.consent && !!setup.provider;
  return (
    <RiseEach>
      <HeroCard icon={Sparkles} system="teal" title="Coach" body="Ask about your scores, your training and your sleep. The coach looks up your own Halo numbers before it answers." />
      <InsetGroup footer="The coach’s provider, key and chats are set up in the coach itself.">
        <InfoRow label="Provider" value={setup === undefined ? "…" : on ? providerLabel(setup.provider) : "Not set up"} />
        <NavRow icon={MessageCircle} system="teal" label="Open coach" onPress={() => router.push("/coach" as Href)} />
        <NavRow icon={History} system="indigo" label="Chats" value={chats === undefined ? undefined : String(chats)} onPress={() => router.push("/coach/chats" as Href)} />
        <NavRow icon={Settings2} system="gray" label="Coach settings" onPress={() => router.push("/coach/settings" as Href)} />
      </InsetGroup>
    </RiseEach>
  );
}
