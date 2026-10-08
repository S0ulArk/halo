// The coach's setup, ported from Pulse's coach/CoachSetup.tsx: what the coach sends where, and Allow (consent); then
// a provider, a key and a model, saved only after one tiny test request works. On the phone the request goes straight
// from the device to the provider, and the key is kept in the Android Keystore-backed secure store.
import * as React from "react";
import { ActivityIndicator, Linking, Pressable, View, type TextInputProps } from "react-native";
import { Eye, EyeOff, ShieldCheck } from "lucide-react-native";
import { PROVIDERS, providerOf } from "@/coach/providers";
import { testDeviceKey } from "@/coach/session";
import { saveProvider, setConsent } from "@/coach/storage";
import { Txt } from "@/ui";
import { CalmButton, CalmChip, CalmInput, IconTile, Surface, useCalm } from "@/screens/settings/calmKit";

/** A sentence in the setup: 15/22 grey. */
function Body({ children, style }: { children: React.ReactNode; style?: object }) {
  const c = useCalm();
  return (
    <Txt size={15} lineHeight={22} style={[{ color: c.sub }, style]}>
      {children}
    </Txt>
  );
}

/** The setup's page heading: 22/28 semibold ink. */
function Heading({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={22} lineHeight={28} weight={600} accessibilityRole="header" style={{ color: c.ink }}>
      {children}
    </Txt>
  );
}

export function ErrorLine({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} weight={500} accessibilityRole="alert" style={{ paddingHorizontal: 4, color: c.tintInk.rose }}>
      {children}
    </Txt>
  );
}

/**
 * A labelled field on a white card or sheet: the label above, a 52 px grey Calm input (teal edge while focused), a
 * hint under it; passwords get show / hide.
 */
export function Field({ label, hint, password, style, ...props }: TextInputProps & { label: string; hint?: React.ReactNode; password?: boolean }) {
  const c = useCalm();
  const [shown, setShown] = React.useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Txt size={14} lineHeight={19} weight={600} style={{ paddingHorizontal: 4, color: c.ink }}>
        {label}
      </Txt>
      <View>
        <CalmInput {...props} on="card" secureTextEntry={password && !shown} style={[{ lineHeight: 22, paddingRight: password ? 52 : 16 }, props.editable === false && { opacity: 0.7 }, style]} />
        {password && (
          <Pressable onPress={() => setShown((s) => !s)} accessibilityRole="button" accessibilityLabel={shown ? "Hide key" : "Show key"} accessibilityState={{ selected: shown }} style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 48, alignItems: "center", justifyContent: "center" }}>
            {shown ? <EyeOff size={20} color={c.sub} strokeWidth={1.75} /> : <Eye size={20} color={c.sub} strokeWidth={1.75} />}
          </Pressable>
        )}
      </View>
      {hint ? (
        <Txt size={13} lineHeight={18} style={{ paddingHorizontal: 4, color: c.sub }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

/** What the coach sends where, and Allow (spec §7.21 consent). */
export function Consent() {
  const c = useCalm();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const items = [
    "To answer, the coach sends your questions and the Halo numbers it looks up (scores, vitals, workouts, journal behaviours) to the AI provider you choose next, straight from this phone, with your own key. Your name and email are never sent.",
    "Your provider’s terms and pricing apply. Halo adds no cost.",
    "Chats are saved on this phone, visible only to you. Delete them any time.",
    "Answers can be wrong, and they are not medical advice.",
  ];
  return (
    <View style={{ gap: 16 }}>
      <Heading>Before you start</Heading>
      <Surface gap={14}>
        <IconTile icon={ShieldCheck} tint="mint" />
        {items.map((t) => (
          <View key={t} style={{ flexDirection: "row" }}>
            <Txt size={15} lineHeight={22} style={{ width: 20, color: c.teal }}>
              •
            </Txt>
            <Txt size={15} lineHeight={22} style={{ flex: 1, color: c.ink }}>
              {t}
            </Txt>
          </View>
        ))}
      </Surface>
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
  );
}

/** Pick a provider, paste a key, pick a model; saved only after a test call works. Sits on a white card or sheet. */
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
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Txt size={14} lineHeight={19} weight={600} style={{ paddingHorizontal: 4, color: c.ink }} nativeID="provider-label">
          Provider
        </Txt>
        <View accessibilityRole="radiogroup" accessibilityLabelledBy="provider-label" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PROVIDERS.map((x) => (
            <CalmChip key={x.id} label={x.label} selected={x.id === id} onPress={() => pick(x.id)} role="radio" on="card" />
          ))}
        </View>
      </View>
      <Field
        key={id}
        label="API key"
        password
        value={apiKey}
        onChangeText={setApiKey}
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
      {error && <ErrorLine>{error}</ErrorLine>}
      <CalmButton disabled={pending} onPress={() => void submit()}>
        {pending ? (
          <>
            <ActivityIndicator size="small" color={c.card} />
            <Txt size={15} lineHeight={20} weight={600} style={{ color: c.card }}>
              Testing…
            </Txt>
          </>
        ) : (
          "Test and save"
        )}
      </CalmButton>
      <Body>Halo checks the key with one tiny request before saving it.</Body>
    </View>
  );
}

/** The page under Consent: the heading, then the form on a white card. */
export function ConnectProvider({ current }: { current: { provider: string | null; model: string | null } }) {
  return (
    <View style={{ gap: 16 }}>
      <Heading>Connect your AI provider</Heading>
      <Body>The coach runs on your own account with a provider, so you pay them directly for what you use.</Body>
      <Surface>
        <ProviderForm current={current} />
      </Surface>
    </View>
  );
}
