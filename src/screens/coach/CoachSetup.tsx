// The coach's setup, ported from Pulse's coach/CoachSetup.tsx, as iOS forms: the coach's feature header, what it sends
// where (one row per point, each with its coloured icon square) and the filled Allow (consent); then a provider (a
// checkmark list), a key and a model in grouped fields, saved only after one tiny test request works. On the phone the
// request goes straight from the device to the provider, and the key is kept in the Android Keystore-backed store.
import * as React from "react";
import { ActivityIndicator, Linking, Pressable, View, type TextInputProps } from "react-native";
import { BotMessageSquare, Eye, EyeOff, KeyRound, Lock, Receipt, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { PROVIDERS, providerOf } from "@/coach/providers";
import { testDeviceKey } from "@/coach/session";
import { saveProvider, setConsent } from "@/coach/storage";
import { Txt } from "@/ui";
import { RiseEach } from "@/ui/motion/Rise";
import type { SystemColor } from "@/ui/calm";
import { CalmButton, CalmInput, SectionFooter, useCalm } from "@/screens/settings/calmKit";
import { CheckRow, HeroCard, InsetGroup, RowBox, RowIcon } from "@/screens/settings/list";

export function ErrorLine({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} weight={500} accessibilityRole="alert" style={{ paddingHorizontal: 16, color: c.system.red }}>
      {children}
    </Txt>
  );
}

/**
 * A field in a grouped list: the small capital label over a card holding the input (a quiet grey field, a blue edge
 * while focused), the grey note under the card; a key gets show / hide.
 */
export function Field({ label, hint, password, style, ...props }: TextInputProps & { label: string; hint?: React.ReactNode; password?: boolean }) {
  const c = useCalm();
  const [shown, setShown] = React.useState(false);
  return (
    <InsetGroup title={label} footer={hint ? <SectionFooter>{hint}</SectionFooter> : undefined}>
      <RowBox>
        <View>
            <CalmInput accessibilityLabel={label} {...props} on="card" secureTextEntry={password && !shown} style={[{ lineHeight: 22, paddingRight: password ? 52 : 16 }, props.editable === false && { opacity: 0.7 }, style]} />
            {password && (
              <Pressable
                onPress={() => setShown((s) => !s)}
                accessibilityRole="button"
                accessibilityLabel={shown ? "Hide key" : "Show key"}
                accessibilityState={{ selected: shown }}
                style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 48, alignItems: "center", justifyContent: "center" }}
              >
                {shown ? <EyeOff size={20} color={c.sub} strokeWidth={1.9} /> : <Eye size={20} color={c.sub} strokeWidth={1.9} />}
              </Pressable>
            )}
        </View>
      </RowBox>
    </InsetGroup>
  );
}

/** One consent point: its coloured icon square and the whole sentence beside it. */
function Point({ icon, system, children }: { icon: LucideIcon; system: SystemColor; children: string }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
      <RowIcon icon={icon} system={system} />
      <Txt size={15} lineHeight={20} style={{ flex: 1, minWidth: 0, color: c.ink, marginTop: 4 }}>
        {children}
      </Txt>
    </View>
  );
}

const POINTS: { icon: LucideIcon; system: SystemColor; text: string }[] = [
  {
    icon: ShieldCheck,
    system: "green",
    text: "To answer, the coach sends your questions and the Halo numbers it looks up (scores, vitals, workouts, journal behaviours) to the AI provider you choose next, straight from this phone, with your own key. Your name and email are never sent.",
  },
  { icon: Receipt, system: "orange", text: "Your provider’s terms and pricing apply. Halo adds no cost." },
  { icon: Lock, system: "blue", text: "Chats are saved on this phone, visible only to you. Delete them any time." },
  { icon: TriangleAlert, system: "yellow", text: "Answers can be wrong, and they are not medical advice." },
];

/** What the coach sends where, and Allow (spec §7.21 consent). */
export function Consent() {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <View style={{ gap: 24 }}>
      <RiseEach>
        <HeroCard icon={BotMessageSquare} system="indigo" title="Coach" body="Ask about your scores, your training and your sleep. Before you start, here is what the coach does with your data." />
        <InsetGroup title="Before you start" inset="icon">
          {POINTS.map((p) => (
            <Point key={p.text} icon={p.icon} system={p.system}>
              {p.text}
            </Point>
          ))}
        </InsetGroup>
        <View style={{ gap: 12 }}>
          {error && <ErrorLine>{error}</ErrorLine>}
          <CalmButton
            disabled={pending}
            onPress={() => {
              setPending(true);
              setConsent(true)
                .catch(() => setError("Couldn’t save that. Try again."))
                .finally(() => setPending(false));
            }}
          >
            Allow
          </CalmButton>
        </View>
      </RiseEach>
    </View>
  );
}

/** Pick a provider, paste a key, pick a model; saved only after a test call works. Sits on the ground or a sheet. */
export function ProviderForm({ current, onSaved }: { current: { provider: string | null; model: string | null }; onSaved?: () => void }) {
  const c = useCalm();
  const [id, setId] = React.useState(providerOf(current.provider)?.id ?? PROVIDERS[0].id);
  const p = providerOf(id)!;
  const [model, setModel] = React.useState(current.provider === id && current.model ? current.model : p.model);
  const [apiKey, setApiKey] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pick = (v: (typeof PROVIDERS)[number]["id"]) => {
    setId(v);
    setModel(providerOf(v)!.model);
    setApiKey("");
    setError(null);
  };
  const submit = async () => {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const r = await testDeviceKey({ provider: id, model, apiKey });
      if (!r.ok) return setError(r.error);
      await saveProvider(id, model.trim(), apiKey.trim());
      setApiKey("");
      onSaved?.();
    } catch {
      setError("Couldn’t save the key on this phone. Try again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <View style={{ gap: 24 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Provider">
        <InsetGroup title="Provider">
          {PROVIDERS.map((x) => (
            <CheckRow key={x.id} label={x.label} selected={x.id === id} onPress={() => pick(x.id)} />
          ))}
        </InsetGroup>
      </View>
      <Field
        key={id}
        label="API key"
        password
        value={apiKey}
        onChangeText={setApiKey}
        placeholder={`Paste your ${p.label} key`}
        autoComplete="off"
        autoCorrect={false}
        autoCapitalize="none"
        importantForAutofill="no"
        maxLength={500}
        hint={
          <>
            {"Stored encrypted on this phone and never shown again. "}
            <Txt size={13} lineHeight={18} weight={600} style={{ color: c.teal }} onPress={() => void Linking.openURL(p.keyUrl).catch(() => {})} accessibilityRole="link">
              {`Get a ${p.label} key`}
            </Txt>
          </>
        }
      />
      <Field label="Model" value={model} onChangeText={setModel} maxLength={120} autoCapitalize="none" autoCorrect={false} spellCheck={false} hint="Any model your provider offers." />
      <View style={{ gap: 8 }}>
        {error && <ErrorLine>{error}</ErrorLine>}
        <CalmButton disabled={pending} onPress={() => void submit()}>
          {pending ? (
            <>
              <ActivityIndicator size="small" color="#ffffff" />
              <Txt size={17} lineHeight={22} weight={600} style={{ color: "#ffffff" }}>
                Testing…
              </Txt>
            </>
          ) : (
            "Test and save"
          )}
        </CalmButton>
        <SectionFooter>Halo checks the key with one tiny request before saving it.</SectionFooter>
      </View>
    </View>
  );
}

/** The page under Consent: the feature header with what a provider means here, then the form. */
export function ConnectProvider({ current }: { current: { provider: string | null; model: string | null } }) {
  return (
    <View style={{ gap: 24 }}>
      <HeroCard icon={KeyRound} system="indigo" title="Connect your AI provider" body="The coach runs on your own account with a provider, so you pay them directly for what you use." />
      <ProviderForm current={current} />
    </View>
  );
}
