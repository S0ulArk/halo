// Settings › Data source for a Google account (the Google Health API). With Google as the source: the account, the last
// sync, the first import's progress, each kind of data's state, and Sync now / Disconnect / back to Health Connect.
// With another source: the Google account as the richer option, with Connect. A Connect or a sync that Google refuses
// says why; when Google says sign-in isn't set up for Pulse, the Google Cloud steps (src/google/setup.ts).
import * as React from "react";
import { Pressable, Share, View } from "react-native";
import { Check, ChevronDown, CircleAlert, Cloud, Minus, Share2, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { HEALTH_SCOPES, SCOPE_LABEL } from "@/google/auth";
import { setupText, SETUP_STEPS } from "@/google/setup";
import { readSyncDoc, type SyncDoc } from "@/google/state";
import { groupStatus, importProgress, type GroupStatus } from "@/google/status";
import { ago } from "@/lib/format";
import { useApp, useSyncProgress } from "@/state/app";
import { Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { GoogleSignInError, signInCodeOf, type GoogleSignInCode } from "../../../modules/pulse-google/errors";
import { useNow } from "../health/shells";
import { progressLabel } from "../home/status";
import { CalmButton, Group, Sentence, Title, useCalm, type CalmTint } from "./calmKit";
import { Body, ButtonGrid, Callout, Cell, ConfirmDialog, Divided, OutlineButton, ProgressBar, Row, Tile } from "./parts";
import { SyncNowButton } from "./syncNow";
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
 * A Google sign-in that failed: what went wrong in plain words and the way on. "Not set up" lists the Google Cloud
 * steps, selectable, with Share to send them to a computer.
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
              <Txt size={15} lineHeight={19} style={[font.numeric(700), { color: c.tintInk.rose, width: 14 }]}>
                {String(i + 1)}
              </Txt>
              <Txt size={14} lineHeight={19} selectable style={{ color: c.ink, flex: 1 }}>
                {s}
              </Txt>
            </View>
          ))}
        </View>
        <ButtonGrid style={{ marginTop: 10 }}>
          <Cell>
            <CalmButton variant="secondary" on="ground" icon={Share2} onPress={() => void Share.share({ message: setupText(), title: "Set up Google sign-in" })}>
              Share steps
            </CalmButton>
          </Cell>
          {retry ? (
            <Cell>
              <CalmButton onPress={onRetry} disabled={busy}>
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
        <CalmButton variant="secondary" on="ground" style={{ marginTop: 8 }} onPress={onRetry} disabled={busy}>
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

function SourceHead({ title, line, tone }: { title: string; line: string; tone?: string }) {
  const c = useCalm();
  return (
    <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Tile tint="sky">
        <Cloud size={22} color={c.tintInk.sky} strokeWidth={1.75} />
      </Tile>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Title>{title}</Title>
        <Sentence color={tone} weight={tone ? 600 : 400}>
          {line}
        </Sentence>
      </View>
    </View>
  );
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
    <Group title="Google account" gap={14}>
      <SourceHead title="Google account (Google Health API)" line="The richer source: adds blood oxygen and more" />
      <Body>{RICHER}</Body>
      {error && <SignInProblem error={error} onRetry={() => void connect()} busy={busy} />}
      <CalmButton onPress={() => (replacing ? setConfirm(true) : void connect())} disabled={busy || syncing}>
        {busy ? "Connecting…" : "Connect Google account"}
      </CalmButton>
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
    </Group>
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

  return (
    <Group title="Data source" gap={14}>
      <SourceHead title="Google account" line={line} tone={problem && !syncing ? c.tintInk.rose : undefined} />
      <Divided>
        <Row label="Account" value={email ?? "Signed in"} />
        <Row label="Reads" value="Google Health API" />
      </Divided>
      {problem && !syncing ? (
        <SignInProblem error={problem} onRetry={() => void connect()} busy={busy} />
      ) : !!failed && !syncing ? (
        <Sentence color={c.tintInk.rose} accessibilityRole="alert">
          {`Last run failed: ${failed}`}
        </Sentence>
      ) : null}
      {app.syncWarnings.includes("no_paired_device") && !syncing && (
        <Callout tint="sand" icon={TriangleAlert} title="No Fitbit on this account" role="alert">
          <Body>{`Google Health has no device paired with ${email ?? "this account"}, so there is nothing to import. Pair your Fitbit in the Google Health app, or connect the account it uses.`}</Body>
        </Callout>
      )}
      {missing.length > 0 && (
        <Callout tint="sand" icon={TriangleAlert} title="Some data isn’t allowed">
          <Body>{`Google didn’t give Halo access to ${missing.map((s) => SCOPE_LABEL[s] ?? s).join(", ")}. Connect again and tick those boxes to add them.`}</Body>
          <CalmButton variant="secondary" on="ground" style={{ marginTop: 8 }} onPress={() => void connect()} disabled={busy || syncing}>
            Connect again
          </CalmButton>
        </Callout>
      )}
      {syncing && syncProgress ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <Txt size={15} lineHeight={20} weight={500} style={{ color: c.ink, fontVariant: ["tabular-nums"] }}>
            {`Importing… ${progressLabel(syncProgress)}`}
          </Txt>
          <ProgressBar value={syncProgress.total > 0 ? syncProgress.done / syncProgress.total : 0} />
        </View>
      ) : firstImport ? (
        <Sentence>{`First import: ${firstImport.done} of ${firstImport.total} days so far. The next sync carries on where it stopped.`}</Sentence>
      ) : null}
      <ButtonGrid style={{ marginTop: 2 }}>
        <Cell>
          <SyncNowButton />
        </Cell>
        <Cell>
          <OutlineButton danger onPress={() => setConfirm("disconnect")} disabled={syncing}>
            Disconnect
          </OutlineButton>
        </Cell>
        <Cell wide>
          <CalmButton variant="secondary" on="card" onPress={() => setConfirm("health")} disabled={syncing || app.availability !== "available"}>
            Use Health Connect instead
          </CalmButton>
        </Cell>
      </ButtonGrid>
      {doc && <GoogleDataTypes rows={groupStatus(doc, now)} now={now} />}

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
    </Group>
  );
}

const STATUS_WORD: Record<GroupStatus["status"], string> = { ok: "Synced", stale: "Behind", never: "Not yet", error: "Failed" };

/** Each kind of data, folded under one summary line; it opens itself when one failed (as Health Connect's types). */
function GoogleDataTypes({ rows, now }: { rows: GroupStatus[]; now: number }) {
  const c = useCalm();
  const failing = rows.filter((r) => r.status === "error").length;
  const [open, setOpen] = React.useState(failing > 0);
  const synced = rows.filter((r) => r.status === "ok" || r.status === "stale").length;
  const tone = (r: GroupStatus): { color: string; icon: LucideIcon } =>
    r.status === "error" ? { color: c.tintInk.sand, icon: TriangleAlert } : r.status === "never" ? { color: c.faint, icon: Minus } : { color: c.tintInk.mint, icon: Check };
  const tints: CalmTint = failing ? "sand" : "mint";
  return (
    <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.line }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Data types, ${failing ? `${failing} failed` : `${synced} of ${rows.length} synced`}`}
        style={({ pressed }) => ({ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
            Data types
          </Txt>
          <Sentence color={failing ? c.tintInk[tints] : c.sub} weight={failing ? 600 : 400}>
            {failing ? `${failing} failed` : "From the Google Health API"}
          </Sentence>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Txt size={18} lineHeight={22} style={[font.numeric(700), { color: c.ink }]}>
            {String(synced)}
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
          {rows.map((r) => {
            const t = tone(r);
            const Icon = t.icon;
            const word = r.error ?? (r.lastSuccessAt && r.status !== "never" ? `${STATUS_WORD[r.status]} ${ago(r.lastSuccessAt, Math.max(now, r.lastSuccessAt))}` : STATUS_WORD[r.status]);
            return (
              <View key={r.key} accessible accessibilityLabel={`${r.label}: ${word}`} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
                <Txt size={15} lineHeight={20} style={{ flex: 1, minWidth: 0, color: c.ink }}>
                  {r.label}
                </Txt>
                <Txt size={13} lineHeight={18} weight={500} align="right" style={{ color: r.status === "error" ? c.tintInk.sand : c.sub, flexShrink: 1, maxWidth: "45%" }}>
                  {word}
                </Txt>
                <Icon size={16} color={t.color} strokeWidth={2.25} />
              </View>
            );
          })}
        </Divided>
      )}
    </View>
  );
}
