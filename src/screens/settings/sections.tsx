// Settings' sections, ported from the web's SettingsView.tsx, SettingsClient.tsx and AppSettings.tsx, kept to what a
// phone with no server has: Profile (the web's Account section without the account), Data source (Health Connect, a
// Google account through the Google Health API (google.tsx), or demo data; permissions, sync), App (appearance) and
// Coach (a way into the coach).
import * as React from "react";
import { AppState, Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { BotMessageSquare, Check, ChevronDown, HeartPulse, Minus, Monitor, Moon, Sun, TriangleAlert } from "lucide-react-native";
import { GOOGLE_SOURCE_ENABLED } from "@/google/flags";
import { askPermissions, openHealthConnectSettings, permissionState, READ_TYPES, type PermissionState, type ReadType } from "@/health/connect";
import { getSourcePolicy, setSourcePolicy, SOURCE_POLICIES, SOURCE_POLICY_LABELS, type SourcePolicy } from "@/health/sourcePolicy";
import { ago, DAY, formatDay } from "@/lib/format";
import { getSettings } from "@/queries/settings";
import { useApp, useQuery, useSyncProgress } from "@/state/app";
import { Mark, SkeletonText, Txt, useTheme, type ColorToken, type ThemeChoice } from "@/ui";
import { font } from "@/ui/fonts";
import { useNow } from "../health/shells";
import { progressLabel } from "../home/status";
import { CalmButton, Group, Sentence, Title, useCalm } from "./calmKit";
import { Body, ButtonGrid, Callout, Cell, ConfirmDialog, Divided, OutlineButton, ProgressBar, Row, Segmented, Tile, toneOf } from "./parts";
import { GoogleConnectGroup, GoogleSourceGroup } from "./google";
import { EditProfileButton } from "./ProfileSheet";
import { SyncNowButton } from "./syncNow";
import { toast } from "./toast";
import { describeZone } from "./zone";

// ── Profile ──────────────────────────────────────────────────────────────────

const PROFILE_ROWS = ["Birth date", "Age", "Sex", "Height", "Waist", "Max heart rate", "Time zone"];

type ProfileRow = { label: string; value: string; numeric?: boolean; unit?: string; detail?: string };

/** The profile as rows, its Edit sheet, and (last and quiet, as the web's Delete account) Remove all data. */
export function ProfileSection() {
  const app = useApp();
  const q = useQuery(getSettings);
  const p = q.data?.profile;
  // Numbers in the numeric face with their unit small beside them; words stay words ("Not set", "Male").
  const rows: ProfileRow[] | null = p
    ? [
        { label: "Birth date", value: formatDay(p.birthDate, DAY.full) },
        { label: "Age", value: String(p.age), numeric: true, unit: "years" },
        { label: "Sex", value: p.sex === "male" ? "Male" : "Female" },
        p.heightCm ? { label: "Height", value: String(p.heightCm), numeric: true, unit: "cm" } : { label: "Height", value: "Not set" },
        p.waistCm ? { label: "Waist", value: String(p.waistCm), numeric: true, unit: "cm" } : { label: "Waist", value: "Not set" },
        { label: "Max heart rate", value: String(p.maxHr), numeric: true, unit: "bpm", detail: p.maxHrSource === "learned" ? "learned from workouts" : p.maxHrSource },
        { label: "Time zone", value: describeZone(p.timeZone) },
      ]
    : null;
  return (
    <>
      <Group title="Profile" right={app.profile ? <EditProfileButton profile={app.profile} /> : undefined} padding={20} gap={8}>
        <Divided>
          {rows
            ? rows.map((r) => <Row key={r.label} label={r.label} value={r.value} numeric={r.numeric} unit={r.unit} detail={r.detail} />)
            : PROFILE_ROWS.map((k) => (
                <Row key={k} label={k}>
                  <SkeletonText width={96} size={15} lineHeight={20} />
                </Row>
              ))}
        </Divided>
        <Sentence>Your days start at midnight in your time zone. Saving an edit recomputes your scores.</Sentence>
      </Group>
      <RemoveAllData />
    </>
  );
}

/** The one irreversible action, below everything: a rose pill (the web's Delete account). */
function RemoveAllData() {
  const app = useApp();
  const [open, setOpen] = React.useState(false);
  return (
    <View style={{ alignItems: "center", paddingTop: 16, paddingBottom: 8 }}>
      <CalmButton variant="danger" size="md" onPress={() => setOpen(true)}>
        Remove all data
      </CalmButton>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Remove all data?"
        description="Removes your profile and every row and score Halo stored on this phone. Health Connect keeps its own copy. This can’t be undone."
        confirm="Remove all data"
        pending="Removing…"
        danger
        onConfirm={async () => {
          // The root gate moves on to onboarding once the profile is gone.
          await app.reset();
          setOpen(false);
        }}
      />
    </View>
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

function StatusIcon({ ok }: { ok: boolean }) {
  const c = useCalm();
  return ok ? <Check size={16} color={c.tintInk.mint} strokeWidth={2.5} /> : <Minus size={16} color={c.faint} strokeWidth={2} />;
}

/** Per record type, folded under one summary line; it opens itself when something is not allowed (the web's DataTypes). */
function DataTypes({ perms }: { perms: PermissionState }) {
  const c = useCalm();
  const missing = perms.missing.length + (perms.history ? 0 : 1);
  const [open, setOpen] = React.useState(missing > 0);
  const rows: { key: string; label: string; ok: boolean }[] = [
    ...READ_TYPES.map((t) => ({ key: t, label: TYPE_LABEL[t], ok: perms.granted.includes(t) })),
    { key: "history", label: "Past data", ok: perms.history },
  ];
  const allowed = rows.length - missing;
  return (
    <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.line }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Data types, ${missing ? `${missing} not allowed` : "All allowed"}`}
        style={({ pressed }) => ({ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
            Data types
          </Txt>
          <Sentence color={missing ? c.tintInk.sand : c.sub} weight={missing ? 600 : 400}>
            {missing ? `${missing} not allowed` : "All allowed"}
          </Sentence>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Txt size={18} lineHeight={22} style={[font.numeric(700), { color: c.ink }]}>
            {String(allowed)}
          </Txt>
          <Txt size={13} lineHeight={18} weight={500} style={{ color: c.sub, marginLeft: 4 }}>
            {`/ ${rows.length}`}
          </Txt>
        </View>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <ChevronDown size={18} color={c.label} strokeWidth={1.5} />
        </View>
      </Pressable>
      {open && (
        <Divided top>
          {rows.map((r) => (
            <View key={r.key} accessible accessibilityLabel={`${r.label}: ${r.ok ? "Allowed" : "Not allowed"}`} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
              <Txt size={15} lineHeight={20} style={{ flex: 1, minWidth: 0, color: c.ink }}>
                {r.label}
              </Txt>
              <Txt size={13} lineHeight={18} weight={500} style={{ color: r.ok ? c.sub : c.tintInk.sand }}>
                {r.ok ? "Allowed" : "Not allowed"}
              </Txt>
              <StatusIcon ok={r.ok} />
            </View>
          ))}
        </Divided>
      )}
    </View>
  );
}

type SourceConfirm = "disconnect" | "demo" | "health" | null;

/**
 * Data source (spec §7.14): the source as one row (logo, name, last sync), its status only when something needs doing,
 * Sync now, and the per-type permissions folded underneath. A Google account as the source has its own card
 * (google.tsx); with any other source, the Google account follows as the richer option.
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
    <Group title="Data source" gap={14}>
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Tile tint={demo ? "mint" : "rose"}>{demo ? <Mark size={20} /> : <HeartPulse size={22} color={c.tintInk.rose} strokeWidth={1.75} />}</Tile>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Title>{label}</Title>
          <Sentence color={status.tone ? toneOf(c, status.tone) : undefined} weight={status.tone ? 600 : 400}>
            {status.line}
          </Sentence>
        </View>
      </View>
      {!!status.body && <Body>{status.body}</Body>}
      {!!failed && !syncing && (
        <Sentence color={c.tintInk.rose} accessibilityRole="alert">
          {`Last run failed: ${failed}`}
        </Sentence>
      )}
      {hc && app.syncWarnings.includes("no_fitbit_records") && !syncing && <NoFitbitRecords />}
      {needsPermissions && (
        <Callout tint="sand" icon={TriangleAlert} title="Halo needs more permissions">
          <Body>Allow every data type, including past data, so Halo can read all of what your Fitbit writes. Sync keeps working until then.</Body>
          <ButtonGrid style={{ marginTop: 8 }}>
            <Cell>
              <CalmButton onPress={() => void allow()}>Allow</CalmButton>
            </Cell>
            <Cell>
              <CalmButton variant="secondary" on="ground" onPress={() => openHealthConnectSettings()}>
                Open settings
              </CalmButton>
            </Cell>
          </ButtonGrid>
        </Callout>
      )}
      {syncing && syncProgress && (
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <Txt size={15} lineHeight={20} weight={500} style={{ color: c.ink, fontVariant: ["tabular-nums"] }}>
            {`Importing… ${progressLabel(syncProgress)}`}
          </Txt>
          <ProgressBar value={syncProgress.total > 0 ? syncProgress.done / syncProgress.total : 0} />
        </View>
      )}
      <ButtonGrid style={{ marginTop: 2 }}>
        {hc ? (
          <>
            <Cell>
              {revoked ? <CalmButton onPress={() => void allow()}>Allow access</CalmButton> : <SyncNowButton />}
            </Cell>
            <Cell>
              <OutlineButton danger onPress={() => setConfirm("disconnect")}>
                Disconnect
              </OutlineButton>
            </Cell>
            <Cell wide>
              <CalmButton variant="secondary" on="card" onPress={() => setConfirm("demo")} disabled={syncing}>
                Use demo data
              </CalmButton>
            </Cell>
          </>
        ) : (
          <>
            {demo && (
              <Cell wide>
                <SyncNowButton />
              </Cell>
            )}
            <Cell wide>
              <CalmButton onPress={() => setConfirm("health")} disabled={!hcReady || syncing}>
                Connect Health Connect
              </CalmButton>
            </Cell>
          </>
        )}
      </ButtonGrid>
      {hc && <SourcePolicyPicker />}
      {hc && perms.state && <DataTypes key={String(perms.state.missing.length)} perms={perms.state} />}

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
    </Group>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

const THEMES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const satisfies readonly { value: ThemeChoice; label: string; icon: unknown }[];

/** Appearance: system, light or dark. Kept per device (ThemeProvider stores it). */
export function AppSection() {
  const { choice, setChoice } = useTheme();
  return (
    <Group title="Appearance" gap={12}>
      <Segmented accessibilityLabel="Theme" value={choice} onChange={setChoice} items={THEMES} />
      <Sentence>System follows this device’s light or dark setting.</Sentence>
    </Group>
  );
}

// ── Coach ────────────────────────────────────────────────────────────────────

/** Settings › Coach: the coach keeps its own setup (provider, key, chats); this opens it. */
export function CoachSection() {
  const c = useCalm();
  const router = useRouter();
  return (
    <Group title="Coach" gap={16}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <Tile tint="lavender">
          <BotMessageSquare size={22} color={c.tintInk.lavender} strokeWidth={1.75} />
        </Tile>
        <Body style={{ flex: 1, minWidth: 0 }}>Ask about your scores, your training and your sleep. The coach’s provider, key and chats are set up in the coach itself.</Body>
      </View>
      <CalmButton onPress={() => router.push("/coach" as Href)}>Open coach</CalmButton>
    </Group>
  );
}

/** Which Health Connect records Pulse uses: Fitbit only (default), Fitbit first, or every app. A change re-imports. */
function SourcePolicyPicker() {
  const c = useCalm();
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
    <View style={{ marginTop: 6, gap: 8 }}>
      <Txt size={14} lineHeight={19} weight={600} style={{ color: c.ink, paddingHorizontal: 4 }}>
        Use data from
      </Txt>
      <View accessibilityRole="radiogroup" accessibilityLabel="Use data from" style={{ borderRadius: 20, backgroundColor: c.ground, overflow: "hidden" }}>
        {SOURCE_POLICIES.map((p, i) => {
          const on = policy === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: syncing }}
              accessibilityLabel={`${SOURCE_POLICY_LABELS[p].label}. ${SOURCE_POLICY_LABELS[p].detail}`}
              disabled={syncing}
              onPress={() => void choose(p)}
              style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, opacity: syncing ? 0.5 : pressed ? 0.7 : 1 })}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.teal : c.faint, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.teal }} />}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
                  {SOURCE_POLICY_LABELS[p].label}
                </Txt>
                <Sentence>{SOURCE_POLICY_LABELS[p].detail}</Sentence>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** "Fitbit only" kept nothing: Google Health may label its records as the phone's, or isn't sharing yet. One tap to Fitbit first. */
function NoFitbitRecords() {
  const app = useApp();
  return (
    <Callout tint="sand" icon={TriangleAlert} title="Nothing from your Fitbit yet" role="alert">
      <Body>
        With “Fitbit only”, Halo found no records from the Google Health app that weren’t measured by the phone. Either Google Health isn’t sharing with Health Connect yet, or it labels its records as the phone’s. “Fitbit first” uses the phone’s data on days the Fitbit has none.
      </Body>
      <CalmButton
        variant="secondary"
        on="ground"
        style={{ marginTop: 8 }}
        onPress={async () => {
          await setSourcePolicy("fitbit_first");
          toast("Fitbit first: re-importing your history");
          void app.reimport();
        }}
      >
        Use Fitbit first
      </CalmButton>
    </Callout>
  );
}
