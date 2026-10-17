// Settings › Connect to Claude (`/settings?s=claude`): Halo's data in Claude through the person's own MCP connector
// (src/mcp), as an iOS settings page. Before setup: the feature header with what it does, what leaves the phone, then
// the two steps in one grouped list — make a Cloudflare token from the pre-filled link, paste it and Set up (each setup
// step named as it runs). After: when Halo last sent data and to which account, Send now, the link to paste into
// Claude with Copy and how to add it there, and Remove in red (deletes the Worker from Cloudflare).
import * as React from "react";
import { Linking, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Cable, Copy, ExternalLink, KeyRound, Send, ShieldAlert } from "lucide-react-native";
import { ago } from "@/lib/format";
import { TOKEN_URL } from "@/mcp/cloudflare";
import { connectorLink, connectorState, removeConnector, sendSnapshot, setUpConnector, subscribeConnector, type ConnectorState, type SetupStep } from "@/mcp/connector";
import { useQueryCtx } from "@/state/app";
import { Txt } from "@/ui";
import { RiseEach } from "@/ui/motion/Rise";
import { CalmButton, CalmField, CalmInput, useCalm } from "./calmKit";
import { ButtonRow, HeroCard, InfoRow, InsetGroup, RowBox, Step } from "./list";
import { Callout, ConfirmDialog } from "./parts";
import { toast } from "./toast";

const STEP_WORDS: Record<SetupStep, string> = {
  account: "Checking the token…",
  address: "Getting your workers.dev address…",
  storage: "Making storage for your data…",
  upload: "Uploading the connector…",
  enable: "Switching on its address…",
  send: "Sending your data…",
};

function useConnector() {
  const [state, setState] = React.useState<ConnectorState | null | undefined>(undefined);
  const [link, setLink] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    const read = () =>
      void Promise.all([connectorState(), connectorLink()]).then(([s, l]) => {
        if (!live) return;
        setState(s);
        setLink(l);
      });
    read();
    const off = subscribeConnector(read);
    return () => {
      live = false;
      off();
    };
  }, []);
  return { state, link };
}

function SetUp() {
  const c = useCalm();
  const ctx = useQueryCtx();
  const [token, setToken] = React.useState("");
  const [step, setStepState] = React.useState<SetupStep | null>(null);
  const stepRef = React.useRef<SetupStep | null>(null);
  const setStep = React.useCallback((s: SetupStep | null) => {
    stepRef.current = s;
    setStepState(s);
  }, []);
  const [error, setError] = React.useState<string | null>(null);
  const busy = step !== null;
  const run = async () => {
    if (!ctx || busy) return;
    if (token.trim().length < 20) return setError("Paste the whole token Cloudflare showed you.");
    setError(null);
    setStep("account");
    try {
      await setUpConnector(token, ctx, setStep);
      setToken("");
      toast("Connector ready");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // For diagnosis over adb: the step and Cloudflare's words, never the token.
      console.warn(`[connector] setup failed at ${stepRef.current ?? "?"}: ${message}`);
      setError(message);
    } finally {
      setStep(null);
    }
  };
  return (
    <RiseEach>
      <HeroCard
        icon={Cable}
        system="purple"
        title="Connect to Claude"
        body="Let Claude read your Halo data: Recovery, sleep, Strain, workouts, Halo Age, your journal and more. Halo sets up a small connector on your own free Cloudflare account and keeps it up to date after each sync. Then, in Claude, you can ask things like “Why was my recovery low this week?”"
      />
      <Callout tint="sand" icon={ShieldAlert} title="What leaves your phone">
        <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
          Your daily scores, sleep, workouts, journal and health readings go to your Cloudflare account, and to Claude (Anthropic) when you ask it about them. Anyone with your connector link can read them, so keep the link to
          yourself.
        </Txt>
      </Callout>
      <InsetGroup title="Set up">
        <RowBox style={{ paddingVertical: 16 }}>
          <Step n={1} title="Make a Cloudflare token" tint="lavender">
            <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
              Sign up free if you don’t have an account. The form opens filled in: scroll down, tap Continue to summary, then Create Token, and copy the token.
            </Txt>
            <CalmButton variant="secondary" size="md" icon={ExternalLink} onPress={() => void Linking.openURL(TOKEN_URL)} style={{ alignSelf: "flex-start", marginTop: 4 }}>
              Open Cloudflare
            </CalmButton>
          </Step>
        </RowBox>
        <RowBox style={{ paddingVertical: 16 }}>
          <Step n={2} title="Paste it here" tint="lavender">
            <CalmField label="Cloudflare token" error={error} help="Kept encrypted on this phone, so Halo can update or remove the connector later.">
              <CalmInput value={token} onChangeText={setToken} placeholder="Paste the token" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" importantForAutofill="no" editable={!busy} />
            </CalmField>
            <CalmButton variant="primary" size="md" icon={KeyRound} disabled={busy || !ctx} onPress={() => void run()} style={{ marginTop: 4 }}>
              {step ? STEP_WORDS[step] : "Set up"}
            </CalmButton>
          </Step>
        </RowBox>
      </InsetGroup>
    </RiseEach>
  );
}

function Ready({ state, link }: { state: ConnectorState; link: string | null }) {
  const c = useCalm();
  const ctx = useQueryCtx();
  const [sending, setSending] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  // "Last sent … ago" moves on while the screen stays open.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const sendNow = async () => {
    if (!ctx) return;
    setSending(true);
    try {
      const r = await sendSnapshot(ctx, { force: true, retries: 2 });
      toast(r.ok ? "Sent to your connector" : `Couldn’t send: ${r.error}`);
    } finally {
      setSending(false);
    }
  };
  const copy = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    toast("Link copied");
  };
  return (
    <>
      <RiseEach>
        <HeroCard icon={Cable} system="purple" title="Connect to Claude" status={state.lastError ? "Last send failed" : "Connected"} statusColor={state.lastError ? c.system.red : c.system.green} body="Halo keeps your connector up to date after each sync." />
        <InsetGroup title="Connector" footer={state.lastError ?? undefined}>
          <InfoRow label="Last sent" value={state.lastSentAt ? ago(state.lastSentAt, now) : "Not yet"} valueColor={state.lastError ? c.system.red : undefined} />
          <InfoRow label="Cloudflare account" value={state.accountName} />
          <ButtonRow label={sending ? "Sending…" : "Send now"} leading={<Send size={19} strokeWidth={2.2} />} busy={sending} disabled={sending || !ctx} onPress={() => void sendNow()} />
        </InsetGroup>
        <InsetGroup title="Add it to Claude" footer="Then ask Claude, for example: “Use Halo. How did I sleep this week, and what should I change?”">
          <RowBox gap={12} style={{ paddingVertical: 14 }}>
            <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
              On claude.ai (a browser on this phone works) or in the Claude desktop app: Customize › Connectors › Add custom connector. Paste this link; if it asks how people sign in, choose No sign-in. Then Add. It also
              shows up in the Claude phone app. The free plan allows one custom connector.
            </Txt>
            <View style={{ borderRadius: 12, backgroundColor: c.fill, padding: 12 }}>
              <Txt size={13} lineHeight={18} selectable style={{ color: c.ink, fontFamily: "monospace" }}>
                {link ?? "…"}
              </Txt>
            </View>
            <CalmButton variant="primary" size="md" icon={Copy} disabled={!link} onPress={() => void copy()}>
              Copy link
            </CalmButton>
          </RowBox>
        </InsetGroup>
        <InsetGroup footer="Deletes the connector and the data it holds from your Cloudflare account. The link stops working.">
          <ButtonRow label="Remove connector" danger center onPress={() => setConfirm(true)} />
        </InsetGroup>
      </RiseEach>
      <ConfirmDialog
        open={confirm}
        onClose={() => {
          setConfirm(false);
          setRemoveError(null);
        }}
        title="Remove the connector?"
        description="Halo deletes the connector and its copy of your data from your Cloudflare account. Claude can no longer read it."
        confirm={removeError ? "Forget it on this phone only" : "Remove"}
        pending="Removing…"
        danger
        error={removeError}
        onConfirm={async () => {
          try {
            await removeConnector({ localOnly: !!removeError });
            setConfirm(false);
            setRemoveError(null);
            toast("Connector removed");
          } catch (e) {
            setRemoveError(`${e instanceof Error ? e.message : String(e)} You can delete “halo-connector” in the Cloudflare dashboard instead.`);
          }
        }}
      />
    </>
  );
}

export function ClaudeSection() {
  const { state, link } = useConnector();
  if (state === undefined) return null;
  return state ? <Ready state={state} link={link} /> : <SetUp />;
}
