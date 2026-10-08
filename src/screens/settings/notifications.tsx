// Settings › Notifications & background (`/settings?s=notifications`): the phone's stand-in for the web's App ›
// Notifications (web push). Two cards. Background sync: the WorkManager task (src/background/task.ts), Health
// Connect's background read permission, and the task's last runs. Notifications: "Recovery ready", "Halo can't
// sync", the smart alerts (strain target, Health Monitor, weekly report; src/background/smart.ts), the daily check-in
// reminder with its time, the wind-down reminder with its lead, and a test. Turning any notification on asks for
// Android 13's POST_NOTIFICATIONS permission first.
import * as React from "react";
import { AppState, Linking, View } from "react-native";
import { Bell, BellRing, Moon, TriangleAlert } from "lucide-react-native";
import { applyBedtime } from "@/background/alerts";
import { DEEP_LINK, formatTime, parseTime, recoveryBody } from "@/background/decide";
import { readLog, type RunLogEntry } from "@/background/log";
import { askNotificationPermission, notificationPermission, sendNow, type NotificationPermission } from "@/background/notify";
import { BEDTIME_LEADS, DEFAULT_SETTINGS, readSettings, writeSettings, type BackgroundSettings } from "@/background/settings";
import type { BedtimeReminder } from "@/background/smart";
import { applyCheckIn } from "@/background/startup";
import { backgroundSyncAvailable, isBackgroundSyncRegistered, runBackgroundTask, syncRegistration } from "@/background/task";
import { askBackgroundPermission, permissionState } from "@/health/connect";
import { clock, DAY, formatDay } from "@/lib/format";
import { localDay } from "@/lib/time";
import { useApp } from "@/state/app";
import { Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { CalmButton, CalmInput, CalmSwitch, Group, Sentence, useCalm } from "./calmKit";
import { Body, ButtonGrid, Callout, Cell, Divided, Segmented } from "./parts";
import { toast } from "./toast";

/** A settings switch row: label, a caption under it, the switch on the right. */
function SwitchRow({ label, caption, value, onChange, disabled }: { label: string; caption?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useCalm();
  // The grouped rows' 40 px band: the switch and the label's first line centred on it, the caption hanging below, so
  // every switch sits on its label's line however the caption wraps.
  return (
    <View style={{ minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: (40 - 21) / 2 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
          {label}
        </Txt>
        {!!caption && <Sentence>{caption}</Sentence>}
      </View>
      <View style={{ marginTop: (40 - 32) / 2 }}>
        <CalmSwitch value={value} onChange={onChange} disabled={disabled} label={label} />
      </View>
    </View>
  );
}

/** Settings and the notification permission, loaded once and re-read when the app returns from system settings. */
function useNotificationSettings() {
  const [settings, setSettings] = React.useState<BackgroundSettings>(DEFAULT_SETTINGS);
  const [permission, setPermission] = React.useState<NotificationPermission | null>(null);
  const refresh = React.useCallback(
    () =>
      Promise.all([readSettings(), notificationPermission()]).then(([s, p]) => {
        setSettings(s);
        setPermission(p);
      }),
    [],
  );
  React.useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (s) => s === "active" && void refresh());
    return () => sub.remove();
  }, [refresh]);
  const update = React.useCallback(async (patch: Partial<BackgroundSettings>) => {
    const next = await writeSettings(patch);
    setSettings(next);
    return next;
  }, []);
  return { settings, permission, setPermission, update, refresh };
}

// ── Background sync ──────────────────────────────────────────────────────────

const RESULT_WORD: Record<RunLogEntry["result"], string> = { ok: "Synced", skipped: "Skipped", failed: "Failed" };

function LastRuns({ log, timeZone }: { log: RunLogEntry[]; timeZone: string }) {
  const c = useCalm();
  if (!log.length) return <Sentence>No background runs yet.</Sentence>;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>
      <Txt size={15} lineHeight={20} weight={600} accessibilityRole="header" style={{ color: c.ink, marginTop: 14, marginBottom: 4 }}>
        Last runs
      </Txt>
      <Divided>
        {log.slice(0, 6).map((e) => (
          <View key={e.at} style={{ minHeight: 48, justifyContent: "center", paddingVertical: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Txt size={15} lineHeight={20} style={[font.numeric(600), { color: c.ink, flexShrink: 1 }]}>
                {`${formatDay(localDay(e.at / 1000, timeZone), DAY.monthDay)}, ${clock(e.at, timeZone)}`}
              </Txt>
              <Txt size={13} lineHeight={18} weight={600} style={{ color: e.result === "failed" ? c.tintInk.rose : e.result === "ok" ? c.tintInk.mint : c.sub, fontVariant: ["tabular-nums"] }}>
                {`${RESULT_WORD[e.result]} · ${(e.ms / 1000).toFixed(1)} s`}
              </Txt>
            </View>
            {!!e.note && (
              <Txt size={13} lineHeight={18} style={{ color: c.sub, marginTop: 2 }}>
                {e.note}
              </Txt>
            )}
          </View>
        ))}
      </Divided>
    </View>
  );
}

function BackgroundSyncCard({ s }: { s: ReturnType<typeof useNotificationSettings> }) {
  const c = useCalm();
  const app = useApp();
  const hc = app.source === "health_connect";
  // A Google account needs no extra permission: the sync gets its token from Google Play services, closed or not.
  const google = app.source === "google";
  const [log, setLog] = React.useState<RunLogEntry[]>([]);
  const [registered, setRegistered] = React.useState<boolean | null>(null);
  const [available, setAvailable] = React.useState(true);
  const [background, setBackground] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(
    () =>
      Promise.all([readLog(), isBackgroundSyncRegistered(), backgroundSyncAvailable(), hc ? permissionState().catch(() => null) : null]).then(([l, r, a, p]) => {
        setLog(l);
        setRegistered(r);
        setAvailable(a);
        setBackground(p ? p.background : null);
      }),
    [hc],
  );
  React.useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (st) => st === "active" && void refresh());
    return () => sub.remove();
  }, [refresh]);

  const toggle = async (on: boolean) => {
    await s.update({ backgroundSync: on });
    await syncRegistration(on);
    await refresh();
    if (on && background === false) toast("Allow background access so Halo can read Health Connect while closed");
  };

  const allow = async () => {
    setBusy(true);
    try {
      const p = await askBackgroundPermission().catch(() => null);
      setBackground(p ? p.background : null);
      toast(p?.background ? "Background access allowed" : "Background access was not allowed");
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      await runBackgroundTask();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const accessLine = !hc ? null : background === null ? "Checking Health Connect…" : background ? "Background access allowed" : "Background access not allowed";

  return (
    <Group title="Background sync" padding={20} gap={12}>
      <SwitchRow
        label="Background sync"
        caption={hc ? "Imports Health Connect and rescores while Halo is closed" : google ? "Imports from your Google account and rescores while Halo is closed" : "Needs Health Connect or a Google account as the data source"}
        value={s.settings.backgroundSync}
        onChange={(v) => void toggle(v)}
        disabled={!hc && !google}
      />
      <Body>Android runs it roughly every 15–30 min when the phone allows. Battery Saver and app sleep settings can pause it; a run resumes when Halo is opened.</Body>
      {!available && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <TriangleAlert size={16} color={c.tintInk.sand} strokeWidth={2} style={{ marginTop: 2 }} />
          <Sentence color={c.tintInk.sand} weight={600} style={{ flex: 1 }}>
            Background tasks are restricted for Halo on this phone.
          </Sentence>
        </View>
      )}
      {hc && (
        <Callout tint={background === false ? "sand" : background ? "mint" : "sky"} title={accessLine ?? ""}>
          <Body>Health Connect only answers a closed app with this extra permission. Without it the task skips quietly and Halo syncs when opened.</Body>
          <ButtonGrid style={{ marginTop: 8 }}>
            <Cell wide>
              <CalmButton onPress={() => void allow()} disabled={busy || background === true}>
                {background ? "Allowed" : "Allow background access"}
              </CalmButton>
            </Cell>
          </ButtonGrid>
        </Callout>
      )}
      <Txt size={13} lineHeight={18} weight={600} style={{ color: registered ? c.tintInk.mint : c.sub }}>
        {registered === null ? " " : registered ? "Scheduled with Android" : "Not scheduled"}
      </Txt>
      <LastRuns log={log} timeZone={app.timeZone} />
      {__DEV__ && (
        <CalmButton variant="secondary" on="card" onPress={() => void runNow()} disabled={busy}>
          Run the task now (debug)
        </CalmButton>
      )}
    </Group>
  );
}

// ── Notifications ────────────────────────────────────────────────────────────

/** HH:mm as text, applied on blur; a bad value shows a hint and keeps the last good one. */
function TimeField({ value, onCommit, disabled }: { value: string; onCommit: (v: string) => void; disabled?: boolean }) {
  const c = useCalm();
  const [draft, setDraft] = React.useState(value);
  const [bad, setBad] = React.useState(false);
  // A saved value arriving from storage replaces the draft (adjusted during render, as ConfirmDialog tracks `open`).
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    const t = parseTime(draft);
    if (!t) {
      setBad(true);
      return;
    }
    setBad(false);
    const v = formatTime(t);
    setDraft(v);
    if (v !== value) onCommit(v);
  };
  // SwitchRow's band: the field (48) and the label's first line centred on 40 px, the hint hanging below.
  return (
    <View style={{ minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: (40 - 21) / 2 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
          Reminder time
        </Txt>
        <Sentence color={bad ? c.tintInk.rose : undefined} accessibilityRole={bad ? "alert" : undefined}>
          {bad ? "Use HH:mm, like 21:00" : "24-hour clock"}
        </Sentence>
      </View>
      <CalmInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        editable={!disabled}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        accessibilityLabel="Reminder time"
        placeholder="21:00"
        invalid={bad}
        on="card"
        numeric
        style={{ width: 96, minHeight: 48, marginTop: (40 - 48) / 2, paddingHorizontal: 12, textAlign: "center" }}
      />
    </View>
  );
}

const LEAD_ITEMS = BEDTIME_LEADS.map((m) => ({ value: String(m), label: `${m} min` }));

/** The wind-down lead: how long before the planned bedtime the reminder comes. */
function LeadField({ value, onChange, disabled }: { value: number; onChange: (min: number) => void; disabled?: boolean }) {
  const c = useCalm();
  return (
    <View pointerEvents={disabled ? "none" : "auto"} style={{ paddingVertical: 14, gap: 10, opacity: disabled ? 0.5 : 1 }}>
      <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
        Remind me before bed
      </Txt>
      <Segmented accessibilityLabel="Remind me before bed" value={String(value)} onChange={(v) => onChange(Number(v))} items={LEAD_ITEMS} />
    </View>
  );
}

function NotificationsCard({ s }: { s: ReturnType<typeof useNotificationSettings> }) {
  const c = useCalm();
  const app = useApp();
  const denied = s.permission === "denied";
  // The wind-down reminder on the schedule, for its caption; re-planned on open as after a run.
  const [next, setNext] = React.useState<BedtimeReminder | null>(null);
  React.useEffect(() => {
    let live = true;
    void applyBedtime(app.store, app.timeZone).then((r) => live && setNext(r));
    return () => {
      live = false;
    };
  }, [app.store, app.timeZone]);

  /** Turning something on needs the permission; off never does. Returns whether the change may go ahead. */
  const allowed = async (on: boolean) => {
    if (!on || s.permission === "granted") return true;
    const p = await askNotificationPermission();
    s.setPermission(p);
    if (p !== "granted") toast("Notifications are blocked. Allow them for Halo in Android settings.");
    return p === "granted";
  };

  const set = async (key: "recoveryReady" | "cantSync" | "strainTarget" | "healthMonitor" | "weeklyReport", on: boolean) => {
    if (!(await allowed(on))) return;
    await s.update({ [key]: on });
  };
  const setCheckIn = async (on: boolean) => {
    if (!(await allowed(on))) return;
    await applyCheckIn(await s.update({ checkIn: on }));
  };
  const setTime = async (checkInTime: string) => {
    await applyCheckIn(await s.update({ checkInTime }));
  };
  const setWindDown = async (patch: Pick<Partial<BackgroundSettings>, "bedtime" | "bedtimeLeadMin">) => {
    if (patch.bedtime && !(await allowed(true))) return;
    await s.update(patch);
    setNext(await applyBedtime(app.store, app.timeZone));
  };
  const windDownCaption = next
    ? `Next at ${clock(next.at * 1000, app.timeZone)}, for bed by ${clock(next.bedtime * 1000, app.timeZone)}; opens the sleep planner`
    : "Before tonight’s planned bedtime, from the sleep planner";

  const test = async () => {
    if (!(await allowed(true))) return;
    const ok = await sendNow({ title: "Recovery ready", body: `${recoveryBody(78)} · a test from Halo`, url: DEEP_LINK.notifications });
    toast(ok ? "Test notification sent" : "Couldn’t show a notification");
  };

  return (
    <Group title="Notifications" padding={20} gap={8}>
      {denied && (
        <Callout tint="sand" icon={TriangleAlert} title="Blocked in Android settings" style={{ marginBottom: 4 }}>
          <Body>Allow notifications for Halo there, then come back.</Body>
          <ButtonGrid style={{ marginTop: 8 }}>
            <Cell wide>
              <CalmButton variant="secondary" on="ground" onPress={() => void Linking.openSettings()}>
                Open settings
              </CalmButton>
            </Cell>
          </ButtonGrid>
        </Callout>
      )}
      <Divided>
        <SwitchRow label="Recovery ready" caption="Once a day, when today’s Recovery is scored" value={s.settings.recoveryReady} onChange={(v) => void set("recoveryReady", v)} disabled={denied} />
        <SwitchRow label="Can’t sync" caption="Once a day, when Health Connect hasn’t synced for 36 hours" value={s.settings.cantSync} onChange={(v) => void set("cantSync", v)} disabled={denied} />
        <SwitchRow label="Strain target reached" caption="Once a day, when Day Strain reaches today’s target" value={s.settings.strainTarget} onChange={(v) => void set("strainTarget", v)} disabled={denied} />
        <SwitchRow
          label="Health Monitor"
          caption="When last night’s vitals leave your normal range or an illness signal appears; not again while it lasts"
          value={s.settings.healthMonitor}
          onChange={(v) => void set("healthMonitor", v)}
          disabled={denied}
        />
        <SwitchRow label="Weekly report" caption="Monday morning, when last week’s report is ready" value={s.settings.weeklyReport} onChange={(v) => void set("weeklyReport", v)} disabled={denied} />
        <SwitchRow label="Check-in reminder" caption="Every day; opens the Journal" value={s.settings.checkIn} onChange={(v) => void setCheckIn(v)} disabled={denied} />
        <TimeField value={s.settings.checkInTime} onCommit={(v) => void setTime(v)} disabled={denied || !s.settings.checkIn} />
        <SwitchRow label="Wind-down reminder" caption={windDownCaption} value={s.settings.bedtime} onChange={(v) => void setWindDown({ bedtime: v })} disabled={denied} />
        <LeadField value={s.settings.bedtimeLeadMin} onChange={(m) => void setWindDown({ bedtimeLeadMin: m })} disabled={denied || !s.settings.bedtime} />
      </Divided>
      <CalmButton variant="secondary" on="card" icon={BellRing} onPress={() => void test()} disabled={denied} style={{ marginTop: 8 }}>
        Test notification
      </CalmButton>
      <View style={{ marginTop: 8, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Moon size={14} color={c.faint} strokeWidth={2} style={{ marginTop: 3 }} />
        <Sentence size={13} style={{ flex: 1 }}>
          Alerts are checked after every sync, in the background or when Halo opens. Nothing leaves the phone.
        </Sentence>
      </View>
    </Group>
  );
}

/** The section: both cards. */
export function NotificationsSection() {
  const s = useNotificationSettings();
  return (
    <>
      <BackgroundSyncCard s={s} />
      <NotificationsCard s={s} />
    </>
  );
}

export const NOTIFICATIONS_ICON = Bell;
export default NotificationsSection;
