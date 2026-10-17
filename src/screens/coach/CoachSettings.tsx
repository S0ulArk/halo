// Coach settings `/coach/settings`, ported from Pulse's coach/CoachSettings.tsx (Settings › Coach on the web), as an
// iOS settings page: the provider, model and key (as ••••last4 only, with a red Remove key), the person's notes for
// the coach, then Change provider and the two red actions (delete every chat, turn the coach off), each confirmed by
// an alert. With the coach off: its feature header and Set up. The groups rise into place as the page opens.
import * as React from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { BotMessageSquare } from "lucide-react-native";
import { MAX_NOTES } from "@/coach/instructions";
import { providerLabel, providerOf } from "@/coach/providers";
import { useCoachSetup } from "@/coach/session";
import { deleteAllChats, removeProvider, setConsent, setInstructions, type CoachSetup } from "@/coach/storage";
import { useBack } from "@/screens/detail/nav";
import { BottomSheet, DetailShell, Skeleton } from "@/ui";
import { RiseEach } from "@/ui/motion/Rise";
import { CalmButton, CalmInput } from "@/screens/settings/calmKit";
import { ButtonRow, HeroCard, InfoRow, InsetGroup, RowBox } from "@/screens/settings/list";
import { toast } from "./ChatList";
import { ProviderForm } from "./CoachSetup";
import { ConfirmDialog } from "./ConfirmDialog";

function Settings({ setup }: { setup: CoachSetup }) {
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
      <View style={{ gap: 24 }}>
        <RiseEach>
          <HeroCard icon={BotMessageSquare} system="indigo" title="Coach" status="Off" body="Set the coach up to ask about your scores, your training and your sleep, with your own AI provider." />
          <CalmButton onPress={() => router.replace("/coach" as Href)}>Set up</CalmButton>
        </RiseEach>
      </View>
    );
  return (
    <View style={{ gap: 24 }}>
      <RiseEach>
        <InsetGroup title="Coach">
          <InfoRow label="Provider" value={setup.provider ? (providerOf(setup.provider)?.label ?? providerLabel(setup.provider)) : "Not set"} />
          {setup.model ? <InfoRow label="Model" value={setup.model} /> : null}
          {setup.last4 ? <InfoRow label="API key" value={`••••${setup.last4}`} numeric /> : null}
          {setup.last4 ? <ButtonRow label="Remove key" danger disabled={pending} onPress={() => void act(removeProvider, "Key removed.")} /> : null}
        </InsetGroup>
        <InsetGroup title="About you" footer="How you’d like the coach to talk and what it should know. It never changes the coach’s safety rules.">
          <RowBox>
            <CalmInput
                value={notes}
                onChangeText={setNotes}
                onBlur={() => notes.trim() !== (setup.instructions ?? "") && void act(() => setInstructions(notes), "Saved.")}
                maxLength={MAX_NOTES}
                multiline
                autoCorrect
                accessibilityLabel="About you"
                placeholder="Short and direct. I lift four days a week and I'm training for a half marathon."
                on="card"
                style={{ minHeight: 96, fontSize: 16, lineHeight: 22 }}
              />
          </RowBox>
        </InsetGroup>
        <InsetGroup footer="Your key is stored encrypted on this phone and never shown again. It is sent only to your provider.">
          <ButtonRow label={setup.provider ? "Change provider" : "Add key"} onPress={() => setOpen(true)} disabled={pending} />
          <ButtonRow label="Delete all chats" danger disabled={pending} onPress={() => setConfirm("chats")} />
          <ButtonRow label="Turn off coach" danger disabled={pending} onPress={() => setConfirm("off")} />
        </InsetGroup>
      </RiseEach>
      {/* A focused key or model field keeps "Test and save" (under the field's note) in view over the keyboard. */}
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
    </View>
  );
}

export default function CoachSettingsScreen() {
  const onBack = useBack("/coach");
  const setup = useCoachSetup();
  return <DetailShell title="Coach settings" onBack={onBack} primary={setup ? <Settings key={setup.consent ? "on" : "off"} setup={setup} /> : <Skeleton radius={16} style={{ height: 240 }} />} />;
}
