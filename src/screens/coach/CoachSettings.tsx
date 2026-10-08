// Coach settings `/coach/settings`, ported from Pulse's coach/CoachSettings.tsx (Settings › Coach on the web): the
// provider and model, the key as ••••last4 only with Remove, the person's notes for the coach, and the controls to
// change the provider, delete every chat or turn the coach off. The web's morning-brief notification is not ported.
import * as React from "react";
import { Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { MAX_NOTES } from "@/coach/instructions";
import { providerLabel, providerOf } from "@/coach/providers";
import { useCoachSetup } from "@/coach/session";
import { deleteAllChats, removeProvider, setConsent, setInstructions, type CoachSetup } from "@/coach/storage";
import { useBack } from "@/screens/detail/nav";
import { BottomSheet, DetailShell, Skeleton, Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { CalmButton, CalmInput, Hairline, SectionLabel, Sentence, Surface, useCalm } from "@/screens/settings/calmKit";
import { toast } from "./ChatList";
import { ProviderForm } from "./CoachSetup";
import { ConfirmDialog } from "./ConfirmDialog";

/** A label / value row of the card, 52 px tall; hairlines between rows. */
function Row({ label, first, children }: { label: string; first?: boolean; children?: React.ReactNode }) {
  const c = useCalm();
  return (
    <>
      {!first && <Hairline />}
      <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10 }}>
        <Txt size={15} lineHeight={20} weight={500} style={{ color: c.ink, flexShrink: 0 }}>
          {label}
        </Txt>
        {children}
      </View>
    </>
  );
}

/** "Coach" over its white card, as Settings' groups read. */
function Section({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <SectionLabel>Coach</SectionLabel>
      <Surface>{children}</Surface>
    </View>
  );
}

function Settings({ setup }: { setup: CoachSetup }) {
  const c = useCalm();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | "chats" | "off">(null);
  const [notes, setNotes] = React.useState(setup.instructions ?? "");
  const act = async (p: () => Promise<void>, ok: string, done?: () => void) => {
    setPending(true);
    try {
      await p();
      done?.();
      toast(ok);
    } catch {
      toast("Couldn’t save that on this phone. Try again.");
    } finally {
      setPending(false);
    }
  };
  if (!setup.consent)
    return (
      <Section>
        <Row label="Off" first>
          <CalmButton size="md" onPress={() => router.replace("/coach" as Href)}>
            Set up
          </CalmButton>
        </Row>
      </Section>
    );
  return (
    <Section>
      <View>
        <Row label="Provider" first>
          <Txt size={15} lineHeight={20} align="right" style={{ flexShrink: 1, color: c.sub }}>
            {setup.provider ? (providerOf(setup.provider)?.label ?? providerLabel(setup.provider)) : "Not set"}
          </Txt>
        </Row>
        {setup.model && (
          <Row label="Model">
            <Txt size={15} lineHeight={20} align="right" style={{ flexShrink: 1, color: c.sub }}>
              {setup.model}
            </Txt>
          </Row>
        )}
        {setup.last4 && (
          <Row label="API key">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Txt size={16} lineHeight={20} style={[font.numeric(600), { color: c.ink }]}>
                {`••••${setup.last4}`}
              </Txt>
              <Pressable disabled={pending} onPress={() => void act(removeProvider, "Key removed.")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Remove key">
                <Txt size={14} lineHeight={18} weight={600} style={{ color: c.tintInk.rose }}>
                  Remove
                </Txt>
              </Pressable>
            </View>
          </Row>
        )}
        <Hairline />
        <View style={{ paddingTop: 12, paddingBottom: 4, gap: 8 }}>
          <Txt size={15} lineHeight={20} weight={500} nativeID="coach-notes" style={{ color: c.ink }}>
            About you
          </Txt>
          <CalmInput
            value={notes}
            onChangeText={setNotes}
            onBlur={() => notes.trim() !== (setup.instructions ?? "") && void act(() => setInstructions(notes), "Saved.")}
            maxLength={MAX_NOTES}
            multiline
            autoCorrect
            accessibilityLabelledBy="coach-notes"
            placeholder="Short and direct. I lift four days a week and I'm training for a half marathon."
            on="card"
            style={{ minHeight: 96, fontSize: 15, lineHeight: 22 }}
          />
          <Sentence size={13}>How you’d like the coach to talk and what it should know. It never changes the coach’s safety rules.</Sentence>
        </View>
      </View>
      {/* Change the provider full width; clear the chats or turn the coach off side by side. */}
      <View style={{ marginTop: 16, gap: 8 }}>
        <CalmButton variant="secondary" on="card" onPress={() => setOpen(true)} disabled={pending}>
          {setup.provider ? "Change provider" : "Add key"}
        </CalmButton>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <CalmButton variant="secondary" on="card" grow disabled={pending} onPress={() => setConfirm("chats")}>
            Delete chats
          </CalmButton>
          <CalmButton variant="secondary" on="card" grow disabled={pending} onPress={() => setConfirm("off")}>
            Turn off
          </CalmButton>
        </View>
      </View>
      <Sentence size={13} style={{ marginTop: 12 }}>
        Your key is stored encrypted on this phone and never shown again. It is sent only to your provider.
      </Sentence>
      {/* A focused key or model field keeps "Test and save" (under the field's hint) in view over the keyboard. */}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="AI provider" size="tall" keyboardGap={112}>
        <ProviderForm
          current={setup}
          onSaved={() => {
            setOpen(false);
            toast("Provider saved.");
          }}
        />
      </BottomSheet>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "chats" ? "Delete every coach chat?" : "Turn the coach off?"}
        description={confirm === "chats" ? "All your saved chats are removed from this phone. This can’t be undone." : "The coach stops until you set it up again. Your key and chats stay; delete them here first if you want them gone."}
        confirm={confirm === "chats" ? "Delete chats" : "Turn off"}
        danger={confirm === "chats"}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          void (confirm === "chats" ? act(deleteAllChats, "Every chat deleted.", () => setConfirm(null)) : act(() => setConsent(false), "Coach turned off.", () => setConfirm(null)))
        }
      />
    </Section>
  );
}

export default function CoachSettingsScreen() {
  const onBack = useBack("/coach");
  const setup = useCoachSetup();
  return <DetailShell title="Coach settings" onBack={onBack} primary={setup ? <Settings key={setup.consent ? "on" : "off"} setup={setup} /> : <Skeleton radius={28} style={{ height: 240 }} />} />;
}
