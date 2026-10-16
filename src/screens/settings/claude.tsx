// Settings › Connect to Claude (`/settings?s=claude`): Halo's data in Claude through the person's own MCP connector
// (src/mcp). Before setup: what it does and what leaves the phone, then two steps — make a Cloudflare token from the
// pre-filled link, paste it and Set up (each setup step named as it runs). After: the link to paste into Claude with
// Copy, how to add it there, when Halo last sent data, Send now, and Remove (deletes the Worker from Cloudflare).
import * as React from "react";
import { Linking, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy, ExternalLink, KeyRound, Send, ShieldAlert, Trash2 } from "lucide-react-native";
import { ago } from "@/lib/format";
import { TOKEN_URL } from "@/mcp/cloudflare";
import { connectorLink, connectorState, removeConnector, sendSnapshot, setUpConnector, subscribeConnector, type ConnectorState, type SetupStep } from "@/mcp/connector";
import { useQueryCtx } from "@/state/app";
import { Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { CalmButton, CalmField, CalmInput, Group, InfoLine, Rows, Sentence, useCalm } from "./calmKit";
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

/** A numbered step: the number in a teal circle, the title, then what to do. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.tint.mint, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        <Txt size={14} lineHeight={18} style={[font.numeric(700), { color: c.tintInk.mint }]}>
          {String(n)}
        </Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
          {title}
        </Txt>
        {children}
      </View>
    </View>
  );
}

function SetUp() {
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
    <>
      <Group title="Connect to Claude" gap={12}>
        <Sentence>
          Let Claude read your Halo data: Recovery, sleep, Strain, workouts, Halo Age, your journal and more. Halo sets up a small connector on your own free Cloudflare account and keeps it up to date after each sync.
          Then, in Claude, you can ask things like “Why was my recovery low this week?”
        </Sentence>
        <Callout tint="sand" icon={ShieldAlert} title="What leaves your phone">
          <Sentence>
            Your daily scores, sleep, workouts, journal and health readings go to your Cloudflare account, and to Claude (Anthropic) when you ask it about them. Anyone with your connector link can read them, so keep the
            link to yourself.
          </Sentence>
        </Callout>
      </Group>
      <Group title="Set up" gap={20}>
        <Step n={1} title="Make a Cloudflare token">
          <Sentence>Sign up free if you don’t have an account. The form opens filled in: scroll down, tap Continue to summary, then Create Token, and copy the token.</Sentence>
          <CalmButton variant="secondary" on="card" size="md" icon={ExternalLink} onPress={() => void Linking.openURL(TOKEN_URL)}>
            Open Cloudflare
          </CalmButton>
        </Step>
        <Step n={2} title="Paste it here">
          <CalmField label="Cloudflare token" error={error} help="Kept encrypted on this phone, so Halo can update or remove the connector later.">
            <CalmInput value={token} onChangeText={setToken} placeholder="Paste the token" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" importantForAutofill="no" editable={!busy} />
          </CalmField>
          <CalmButton variant="primary" on="card" icon={KeyRound} disabled={busy || !ctx} onPress={() => void run()}>
            {step ? STEP_WORDS[step] : "Set up"}
          </CalmButton>
        </Step>
      </Group>
    </>
  );
}

function Ready({ state, link }: { state: ConnectorState; link: string | null }) {
  const c = useCalm();
  const ctx = useQueryCtx();
  const [sending, setSending] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | "remove" | "forget">(null);
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
      <Group title="Connect to Claude" gap={12}>
        <Rows>
          <InfoLine label="Last sent" value={state.lastSentAt ? ago(state.lastSentAt, now) : "Not yet"} valueColor={state.lastError ? c.tintInk.rose : undefined} />
          <InfoLine label="Cloudflare account" value={state.accountName} />
        </Rows>
        {state.lastError ? <Sentence color={c.tintInk.rose}>{state.lastError}</Sentence> : null}
        <CalmButton variant="secondary" on="card" size="md" icon={Send} disabled={sending || !ctx} onPress={() => void sendNow()}>
          {sending ? "Sending…" : "Send now"}
        </CalmButton>
      </Group>
      <Group title="Add it to Claude" gap={12}>
        <Sentence>
          On claude.ai (a browser on this phone works) or in the Claude desktop app: Customize › Connectors › Add custom connector. Paste this link; if it asks how people sign in, choose No sign-in. Then Add. It also
          shows up in the Claude phone app. The free plan allows one custom connector.
        </Sentence>
        <View style={{ borderRadius: 16, backgroundColor: c.ground, padding: 14 }}>
          <Txt size={13} lineHeight={18} selectable style={{ color: c.ink, fontFamily: "monospace" }}>
            {link ?? "…"}
          </Txt>
        </View>
        <CalmButton variant="primary" on="card" icon={Copy} disabled={!link} onPress={() => void copy()}>
          Copy link
        </CalmButton>
        <Sentence>Then ask Claude, for example: “Use Halo. How did I sleep this week, and what should I change?”</Sentence>
      </Group>
      <Group gap={8}>
        <CalmButton variant="danger" on="card" size="md" icon={Trash2} onPress={() => setConfirm("remove")}>
          Remove connector
        </CalmButton>
        <Sentence size={13}>Deletes the connector and the data it holds from your Cloudflare account. The link stops working.</Sentence>
      </Group>
      <ConfirmDialog
        open={confirm === "remove"}
        onClose={() => {
          setConfirm(null);
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
            setConfirm(null);
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
