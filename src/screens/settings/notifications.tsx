// Settings › Notifications & background (`/settings?s=notifications`): the phone's stand-in for the web's App ›
// Notifications (web push), as an iOS settings page. Notifications: "Recovery ready", "Halo can't sync", the smart
// alerts (strain target, Health Monitor, weekly report; src/background/smart.ts) as switch rows with coloured icon
// squares; the reminders (the daily check-in with its time, the wind-down reminder with its lead); app updates
// (src/update); and a test. Background sync: the WorkManager task (src/background/task.ts), Health Connect's background
// read permission, and the task's last runs. Turning any notification on asks for Android 13's POST_NOTIFICATIONS
// permission first. The groups rise into place as the page opens.
import * as React from "react";
import { AppState, Linking, View } from "react-native";
import { Bell, BellRing, CalendarRange, CloudOff, Download, Flame, Moon, NotebookPen, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react-native";
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
import { RiseEach } from "@/ui/motion/Rise";
import { CalmInput, useCalm } from "./calmKit";
import { ButtonRow, InfoRow, InsetGroup, NavRow, ROW_ICON, RowBox, SwitchRow } from "./list";
import { Segmented } from "./parts";
import { toast } from "./toast";

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

/** One background run: when, how it ended and how long it took, its note under it. */
function RunRow({ e, timeZone }: { e: RunLogEntry; timeZone: string }) {
  const c = useCalm();
  return (
    <View style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Txt size={16} lineHeight={21} style={[font.numeric(500), { color: c.ink, flexShrink: 1 }]}>
          {`${formatDay(localDay(e.at / 1000, timeZone), DAY.monthDay)}, ${clock(e.at, timeZone)}`}
        </Txt>
        <Txt size={15} lineHeight={20} weight={500} style={{ color: e.result === "failed" ? c.system.red : e.result === "ok" ? c.system.green : c.sub, fontVariant: ["tabular-nums"] }}>
          {`${RESULT_WORD[e.result]} · ${(e.ms / 1000).toFixed(1)} s`}
        </Txt>
      </View>
      {!!e.note && (
        <Txt size={13} lineHeight={18} style={{ color: c.sub, marginTop: 2 }}>
          {e.note}
        </Txt>
      )}
    </View>
  );
}

function BackgroundSync({ s, start }: { s: ReturnType<typeof useNotificationSettings>; start: number }) {
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
    // The task also checks for updates: it stays scheduled while "App updates" is on.
    await syncRegistration(on || s.settings.updates);
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

  const scheduled = registered === null ? "…" : registered && s.settings.backgroundSync ? "Scheduled with Android" : "Not scheduled";

  return (
    <RiseEach start={start}>
      <InsetGroup title="Background sync" footer="Android runs it roughly every 15–30 min when the phone allows. Battery Saver and app sleep settings can pause it; a run resumes when Halo is opened.">
        <SwitchRow
          icon={RefreshCw}
          system="blue"
          label="Background sync"
          description={hc ? "Imports Health Connect and rescores while Halo is closed" : google ? "Imports from your Google account and rescores while Halo is closed" : "Needs Health Connect or a Google account as the data source"}
          value={s.settings.backgroundSync}
          onChange={(v) => void toggle(v)}
          disabled={!hc && !google}
        />
        <InfoRow label="Schedule" value={scheduled} valueColor={registered && s.settings.backgroundSync ? c.system.green : undefined} />
        {!available && <NavRow icon={TriangleAlert} system="yellow" label="Restricted on this phone" description="Background tasks are restricted for Halo on this phone." action />}
        {__DEV__ && <ButtonRow label="Run the task now (debug)" onPress={() => void runNow()} disabled={busy} />}
      </InsetGroup>
      {hc && (
        <InsetGroup title="Health Connect" footer="Health Connect only answers a closed app with this extra permission. Without it the task skips quietly and Halo syncs when opened.">
          <InfoRow
            label="Background access"
            value={background === null ? "Checking…" : background ? "Allowed" : "Not allowed"}
            valueColor={background === false ? c.tintInk.sand : background ? c.system.green : undefined}
          />
          {background !== true && <ButtonRow label="Allow background access" busy={busy} onPress={() => void allow()} disabled={busy} />}
        </InsetGroup>
      )}
      <InsetGroup title="Last runs">
        {log.length ? (
          log.slice(0, 6).map((e) => <RunRow key={e.at} e={e} timeZone={app.timeZone} />)
        ) : (
          <RowBox>
            <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
              No background runs yet.
            </Txt>
          </RowBox>
        )}
      </InsetGroup>
    </RiseEach>
  );
}

// ── Notifications ────────────────────────────────────────────────────────────

/** HH:mm as text, applied on blur; a bad value shows a hint and keeps the last good one. A row with the field on the right. */
function TimeRow({ value, onCommit, disabled }: { value: string; onCommit: (v: string) => void; disabled?: boolean }) {
  const c = useCalm();
  const [draft, setDraft] = React.useState(value);
  const [bad, setBad] = React.useState(false);
  // A saved value arriving from storage replaces the draft (adjusted during render, as the dialogs track `open`).
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
  return (
    <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8, paddingLeft: 16 + ROW_ICON + 12, opacity: disabled ? 0.45 : 1 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
          Reminder time
        </Txt>
        <Txt size={13} lineHeight={18} accessibilityRole={bad ? "alert" : undefined} style={{ color: bad ? c.system.red : c.sub }}>
          {bad ? "Use HH:mm, like 21:00" : "24-hour clock"}
        </Txt>
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
        style={{ width: 88, minHeight: 40, borderRadius: 10, paddingHorizontal: 10, textAlign: "center" }}
      />
    </View>
  );
}

const LEAD_ITEMS = BEDTIME_LEADS.map((m) => ({ value: String(m), label: `${m} min` }));

/** The wind-down lead: how long before the planned bedtime the reminder comes, as a segmented control under its name. */
function LeadRow({ value, onChange, disabled }: { value: number; onChange: (min: number) => void; disabled?: boolean }) {
  const c = useCalm();
  return (
    <View pointerEvents={disabled ? "none" : "auto"} style={{ paddingHorizontal: 16, paddingLeft: 16 + ROW_ICON + 12, paddingVertical: 12, gap: 10, opacity: disabled ? 0.45 : 1 }}>
      <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
        Remind me before bed
      </Txt>
      <Segmented accessibilityLabel="Remind me before bed" value={String(value)} onChange={(v) => onChange(Number(v))} items={LEAD_ITEMS} />
    </View>
  );
}

function Notifications({ s }: { s: ReturnType<typeof useNotificationSettings> }) {
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
  // On without the permission still works: the update then shows inside Halo only.
  const setUpdates = async (on: boolean) => {
    if (on && s.permission !== "granted" && !denied) s.setPermission(await askNotificationPermission());
    const next = await s.update({ updates: on });
    await syncRegistration(next.backgroundSync || next.updates);
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
    <RiseEach>
      {denied && (
        <InsetGroup title="Notifications are off">
          <NavRow icon={TriangleAlert} system="yellow" label="Blocked in Android settings" description="Allow notifications for Halo there, then come back." action />
          <ButtonRow label="Open settings" onPress={() => void Linking.openSettings()} />
        </InsetGroup>
      )}
      <InsetGroup title="Alerts">
        <SwitchRow icon={Bell} system="red" label="Recovery ready" description="Once a day, when today’s Recovery is scored" value={s.settings.recoveryReady} onChange={(v) => void set("recoveryReady", v)} disabled={denied} />
        <SwitchRow icon={CloudOff} system="gray" label="Can’t sync" description="Once a day, when Health Connect hasn’t synced for 36 hours" value={s.settings.cantSync} onChange={(v) => void set("cantSync", v)} disabled={denied} />
        <SwitchRow icon={Flame} system="orange" label="Strain target reached" description="Once a day, when Day Strain reaches today’s target" value={s.settings.strainTarget} onChange={(v) => void set("strainTarget", v)} disabled={denied} />
        <SwitchRow
          icon={ShieldCheck}
          system="pink"
          label="Health Monitor"
          description="When last night’s vitals leave your normal range or an illness signal appears; not again while it lasts"
          value={s.settings.healthMonitor}
          onChange={(v) => void set("healthMonitor", v)}
          disabled={denied}
        />
        <SwitchRow icon={CalendarRange} system="blue" label="Weekly report" description="Monday morning, when last week’s report is ready" value={s.settings.weeklyReport} onChange={(v) => void set("weeklyReport", v)} disabled={denied} />
      </InsetGroup>
      <InsetGroup title="Reminders" inset="icon">
        <SwitchRow icon={NotebookPen} system="indigo" label="Check-in reminder" description="Every day; opens the Journal" value={s.settings.checkIn} onChange={(v) => void setCheckIn(v)} disabled={denied} />
        <TimeRow value={s.settings.checkInTime} onCommit={(v) => void setTime(v)} disabled={denied || !s.settings.checkIn} />
        <SwitchRow icon={Moon} system="indigo" label="Wind-down reminder" description={windDownCaption} value={s.settings.bedtime} onChange={(v) => void setWindDown({ bedtime: v })} disabled={denied} />
        <LeadRow value={s.settings.bedtimeLeadMin} onChange={(m) => void setWindDown({ bedtimeLeadMin: m })} disabled={denied || !s.settings.bedtime} />
      </InsetGroup>
      <InsetGroup title="Updates">
        <SwitchRow
          icon={Download}
          system="teal"
          label="App updates"
          description="When a new version of Halo is out; Halo asks GitHub each time it opens and in the background, sending no health data"
          value={s.settings.updates}
          onChange={(v) => void setUpdates(v)}
        />
      </InsetGroup>
      <InsetGroup footer="Alerts are checked after every sync, in the background or when Halo opens. Nothing leaves the phone except the update check’s request to GitHub.">
        <ButtonRow label="Send a test notification" leading={<BellRing size={19} strokeWidth={2.2} />} onPress={() => void test()} disabled={denied} />
      </InsetGroup>
    </RiseEach>
  );
}

/** The section: the notifications, then the background sync. */
export function NotificationsSection() {
  const s = useNotificationSettings();
  return (
    <>
      <Notifications s={s} />
      <BackgroundSync s={s} start={5} />
    </>
  );
}
