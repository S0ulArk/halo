// Settings › Data source for a Google account (the Google Health API), as an iOS settings page. With Google as the
// source: the account's feature header and its state, the account rows, what needs doing, the first import's progress,
// Sync now, each kind of data's state folded in a disclosure, and back to Health Connect / Disconnect in their own
// group. With another source: the Google account as the richer option, with Connect. A Connect or a sync that Google
// refuses says why; when Google says sign-in isn't set up for Halo, the Google Cloud steps (src/google/setup.ts).
import * as React from "react";
import { Share, View } from "react-native";
import { Check, CircleAlert, Cloud, Minus, Share2, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { HEALTH_SCOPES, SCOPE_LABEL } from "@/google/auth";
import { setupText, SETUP_STEPS } from "@/google/setup";
import { readSyncDoc, type SyncDoc } from "@/google/state";
import { groupStatus, importProgress, type GroupStatus } from "@/google/status";
import { ago } from "@/lib/format";
import { useApp, useSyncProgress } from "@/state/app";
import { Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { RiseEach } from "@/ui/motion/Rise";
import { GoogleSignInError, signInCodeOf, type GoogleSignInCode } from "../../../modules/pulse-google/errors";
import { useNow } from "../health/shells";
import { progressLabel } from "../home/status";
import { CalmButton, Hairline, useCalm } from "./calmKit";
import { ButtonRow, Disclosure, HeroCard, ICON_INSET, InfoRow, InsetGroup, NavRow, RowBox } from "./list";
import { Body, ButtonGrid, Callout, Cell, ConfirmDialog, ProgressBar } from "./parts";
import { SyncNowRow } from "./syncNow";
import { toast } from "./toast";

const PROBLEM_TITLE: Record<GoogleSignInCode, string> = {
  not_configured: "Google sign-in isn’t set up yet",
  cancelled: "Sign-in cancelled",
  no_play_services: "Google Play services needed",
  scope_not_granted: "Access not given",
  needs_sign_in: "Sign in to Google again",
  account_not_linked: "No Google Health profile",
  api_disabled: "Google Health API not enabled",
  network: "Couldn’t reach Google",
  no_activity: "Couldn’t sign in",
  unavailable: "Couldn’t sign in",
  failed: "Couldn’t sign in",
};

/** Codes a new Connect can fix (the rest need the phone, Google Cloud or the network first, but may be retried too). */
const RETRY_LABEL: Partial<Record<GoogleSignInCode, string>> = {
  not_configured: "Connect again",
  cancelled: "Try again",
  scope_not_granted: "Connect again",
  needs_sign_in: "Connect",
  account_not_linked: "Use another account",
  api_disabled: "Connect again",
  network: "Try again",
  failed: "Try again",
};

/**
 * A Google sign-in that failed, as a tinted notice: what went wrong in plain words and the way on. "Not set up" lists
 * the Google Cloud steps, selectable, with Share to send them to a computer.
 */
export function SignInProblem({ error, onRetry, busy }: { error: GoogleSignInError; onRetry?: () => void; busy?: boolean }) {
  const c = useCalm();
  const retry = onRetry && RETRY_LABEL[error.code];
  if (error.code === "not_configured") {
    return (
      <Callout tint="rose" icon={CircleAlert} title={PROBLEM_TITLE.not_configured} role="alert">
        <Body>Google found no Android OAuth client for Halo. In Google Cloud (on a computer), then connect again:</Body>
        <View style={{ gap: 8, marginTop: 6 }}>
          {SETUP_STEPS.map((s, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              <Txt size={15} lineHeight={20} style={[font.numeric(700), { color: c.tintInk.rose, width: 14 }]}>
                {String(i + 1)}
              </Txt>
              <Txt size={15} lineHeight={20} selectable style={{ color: c.ink, flex: 1 }}>
                {s}
              </Txt>
            </View>
          ))}
        </View>
        <ButtonGrid style={{ marginTop: 10 }}>
          <Cell>
            <CalmButton variant="secondary" size="md" icon={Share2} onPress={() => void Share.share({ message: setupText(), title: "Set up Google sign-in" })}>
              Share steps
            </CalmButton>
          </Cell>
          {retry ? (
            <Cell>
              <CalmButton size="md" onPress={onRetry} disabled={busy}>
                {retry}
              </CalmButton>
            </Cell>
          ) : null}
        </ButtonGrid>
      </Callout>
    );
  }
  const soft = error.code === "cancelled" || error.code === "network";
  return (
    <Callout tint={soft ? "sand" : "rose"} icon={soft ? TriangleAlert : CircleAlert} title={PROBLEM_TITLE[error.code]} role="alert">
      <Body>{error.message}</Body>
      {retry ? (
        <CalmButton variant="secondary" size="md" style={{ marginTop: 8, alignSelf: "flex-start" }} onPress={onRetry} disabled={busy}>
          {retry}
        </CalmButton>
      ) : null}
    </Callout>
  );
}

/** The Google sync's saved state (per data type), re-read after every run. */
function useSyncDoc(version: number): SyncDoc | null {
  const [doc, setDoc] = React.useState<SyncDoc | null>(null);
  React.useEffect(() => {
    let live = true;
    void readSyncDoc().then((d) => live && setDoc(d));
    return () => {
      live = false;
    };
  }, [version]);
  return doc;
}

/** Connect (or connect again) and keep the failure to show. */
function useConnect() {
  const app = useApp();
  const [error, setError] = React.useState<GoogleSignInError | null>(null);
  const [busy, setBusy] = React.useState(false);
  const connect = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const e = await app.connectGoogle();
      setError(e);
      if (!e) toast("Google account connected");
    } finally {
      setBusy(false);
    }
  }, [app]);
  return { error, busy, connect };
}

const RICHER =
  "Reads your Fitbit data straight from Google, with what Health Connect leaves out: blood oxygen, Fitbit’s own heart-rate zones and Active Zone Minutes, your personal resting-HR and HRV ranges, skin-temperature variation, ECG and irregular-rhythm alerts. Halo talks only to Google.";

/** With Health Connect, demo data or no source: the Google account as the richer source, and Connect. */
export function GoogleConnectGroup() {
  const app = useApp();
  const { error, busy, connect } = useConnect();
  const [confirm, setConfirm] = React.useState(false);
  const syncing = app.status === "syncing";
  const replacing = app.source === "health_connect" ? "what Halo imported from Health Connect" : app.source === "demo" ? "the demo data" : null;
  return (
    <>
      <InsetGroup title="Google account" footer={RICHER}>
        <NavRow icon={Cloud} system="blue" label="Google account (Google Health API)" description="The richer source: adds blood oxygen and more" action />
        <ButtonRow label={busy ? "Connecting…" : "Connect Google account"} busy={busy} onPress={() => (replacing ? setConfirm(true) : void connect())} disabled={busy || syncing} />
      </InsetGroup>
      {error && <SignInProblem error={error} onRetry={() => void connect()} busy={busy} />}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Use your Google account?"
        description={`Halo signs in with Google, removes ${replacing ?? "nothing"} and imports your last 180 days from the Google Health API. Your profile, journal and logs stay. You can switch back in Settings.`}
        confirm="Continue"
        onConfirm={() => {
          setConfirm(false);
          void connect();
        }}
      />
    </>
  );
}

/** Google as the source: the account and its state, the per-type status, Sync now, Disconnect, back to Health Connect. */
export function GoogleSourceGroup() {
  const c = useCalm();
  const app = useApp();
  const syncProgress = useSyncProgress();
  const now = useNow();
  const doc = useSyncDoc(app.dataVersion);
  const { error, busy, connect } = useConnect();
  const [confirm, setConfirm] = React.useState<"disconnect" | "health" | null>(null);
  const syncing = app.status === "syncing";
  const last = app.sync.lastSyncTs ? app.sync.lastSyncTs * 1000 : null;
  const failed = app.error ?? app.sync.lastError;
  // A sync stopped by Google sign-in keeps its message in the sync state: shown with the way to fix it.
  const code = signInCodeOf(failed);
  const problem = error ?? (code ? new GoogleSignInError(code) : null);
  const email = app.google?.email ?? null;
  const missing = app.google ? HEALTH_SCOPES.filter((s) => !app.google!.scopes.includes(s)) : [];
  const firstImport = doc ? importProgress(doc) : null;
  const line = syncing ? "Syncing…" : problem && !error ? "Sign-in needed" : last ? `Synced ${ago(last, Math.max(now, last))}` : "Not synced yet";
  const noDevice = app.syncWarnings.includes("no_paired_device") && !syncing;

  return (
    <>
      <RiseEach>
        <HeroCard icon={Cloud} system="blue" title="Google account" status={line} statusColor={problem && !syncing ? c.system.red : undefined} body="Halo reads your Fitbit data from the Google Health API." />
        <InsetGroup title="Account">
          <InfoRow label="Account" value={email ?? "Signed in"} />
          <InfoRow label="Reads" value="Google Health API" />
        </InsetGroup>
        {problem && !syncing ? <SignInProblem error={problem} onRetry={() => void connect()} busy={busy} /> : null}
        {(!!failed && !syncing && !problem) || noDevice || missing.length > 0 ? (
          <InsetGroup title="Needs attention">
            {!!failed && !syncing && !problem && <NavRow icon={CircleAlert} system="red" label="Last run failed" description={failed} action />}
            {noDevice && (
              <NavRow
                icon={TriangleAlert}
                system="yellow"
                label="No Fitbit on this account"
                description={`Google Health has no device paired with ${email ?? "this account"}, so there is nothing to import. Pair your Fitbit in the Google Health app, or connect the account it uses.`}
                action
              />
            )}
            {missing.length > 0 && (
              <View>
                <NavRow
                  icon={TriangleAlert}
                  system="yellow"
                  label="Some data isn’t allowed"
                  description={`Google didn’t give Halo access to ${missing.map((s) => SCOPE_LABEL[s] ?? s).join(", ")}. Connect again and tick those boxes to add them.`}
                  action
                />
                <Hairline inset={ICON_INSET} />
                <ButtonRow label="Connect again" onPress={() => void connect()} disabled={busy || syncing} />
              </View>
            )}
          </InsetGroup>
        ) : null}
        <InsetGroup title="Sync" footer={firstImport && !syncing ? `First import: ${firstImport.done} of ${firstImport.total} days so far. The next sync carries on where it stopped.` : undefined}>
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
          <SyncNowRow />
        </InsetGroup>
        {doc && (
          <InsetGroup title="Data">
            <GoogleDataTypes rows={groupStatus(doc, now)} now={now} />
          </InsetGroup>
        )}
        <InsetGroup footer="Disconnecting revokes Halo’s access to your Google account; what it imported stays on this phone until you remove it.">
          <ButtonRow label="Use Health Connect instead" onPress={() => setConfirm("health")} disabled={syncing || app.availability !== "available"} />
          <ButtonRow label="Disconnect Google account" danger onPress={() => setConfirm("disconnect")} disabled={syncing} />
        </InsetGroup>
      </RiseEach>

      <ConfirmDialog
        open={confirm === "disconnect"}
        onClose={() => setConfirm(null)}
        title="Disconnect your Google account?"
        description="Halo revokes its access to your Google account and stops syncing. What it imported stays on this phone (Remove all data, under Profile, deletes it). Then choose where your data comes from."
        confirm="Disconnect"
        pending="Disconnecting…"
        danger
        onConfirm={async () => {
          const r = await app.disconnectGoogle();
          setConfirm(null);
          toast(r.revoked ? "Google account disconnected" : "Disconnected on this phone. Also remove Halo under Google Account › Security › Third-party access");
        }}
      />
      <ConfirmDialog
        open={confirm === "health"}
        onClose={() => setConfirm(null)}
        title="Use Health Connect instead?"
        description="Halo removes what it imported from Google, asks for Health Connect permissions and imports your last 180 days from there. Your Google account stays connected until you disconnect it."
        confirm="Continue"
        onConfirm={() => {
          setConfirm(null);
          void app.connectHealth();
        }}
      />
    </>
  );
}

const STATUS_WORD: Record<GroupStatus["status"], string> = { ok: "Synced", stale: "Behind", never: "Not yet", error: "Failed" };

/** Each kind of data, folded under one summary row; it opens itself when one failed (as Health Connect's types). */
function GoogleDataTypes({ rows, now }: { rows: GroupStatus[]; now: number }) {
  const c = useCalm();
  const failing = rows.filter((r) => r.status === "error").length;
  const synced = rows.filter((r) => r.status === "ok" || r.status === "stale").length;
  const tone = (r: GroupStatus): { color: string; icon: LucideIcon } =>
    r.status === "error" ? { color: c.tintInk.sand, icon: TriangleAlert } : r.status === "never" ? { color: c.faint, icon: Minus } : { color: c.system.green, icon: Check };
  return (
    <Disclosure
      label="Data types"
      summary={failing ? `${failing} failed` : "From the Google Health API"}
      summaryColor={failing ? c.tintInk.sand : undefined}
      defaultOpen={failing > 0}
      count={
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Txt size={17} lineHeight={22} style={[font.numeric(600), { color: c.ink }]}>
            {String(synced)}
          </Txt>
          <Txt size={15} lineHeight={20} style={[font.numeric(500), { color: c.sub, marginLeft: 3 }]}>
            {`/ ${rows.length}`}
          </Txt>
        </View>
      }
    >
      {rows.map((r) => {
        const t = tone(r);
        const Icon = t.icon;
        const word = r.error ?? (r.lastSuccessAt && r.status !== "never" ? `${STATUS_WORD[r.status]} ${ago(r.lastSuccessAt, Math.max(now, r.lastSuccessAt))}` : STATUS_WORD[r.status]);
        return (
          <View key={r.key} accessible accessibilityLabel={`${r.label}: ${word}`} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Txt size={16} lineHeight={21} style={{ flex: 1, minWidth: 0, color: c.ink }}>
              {r.label}
            </Txt>
            <Txt size={15} lineHeight={20} align="right" style={{ color: r.status === "error" ? c.tintInk.sand : c.sub, flexShrink: 1, maxWidth: "50%" }}>
              {word}
            </Txt>
            <Icon size={17} color={t.color} strokeWidth={2.4} />
          </View>
        );
      })}
    </Disclosure>
  );
}
