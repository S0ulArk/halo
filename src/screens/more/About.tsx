// About (More), ported from the web's src/app/(app)/more/About.tsx: the version, the scoring version and, once Halo's
// GitHub repo exists, a "Report a bug" link to its issues, on one white Calm card. Licence and full credits stay in
// LICENSE and the README.
import * as React from "react";
import { Linking, View } from "react-native";
import { ArrowUpRight } from "lucide-react-native";
import { Txt } from "@/ui";
import { CalmButton, Group, InfoLine, Rows, Sentence, useCalm } from "../settings/calmKit";

/** Halo's GitHub repo, where "Report a bug" files an issue; null hides the button until the repo exists. */
export const REPO_URL: string | null = "https://github.com/S0ulArk/halo";

function LinkButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  const c = useCalm();
  return (
    <CalmButton variant="secondary" on="card" size="md" grow onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal }}>
        {label}
      </Txt>
      <ArrowUpRight size={16} color={c.teal} strokeWidth={2} />
    </CalmButton>
  );
}

export function About({ version, scoringVersion }: { version: string; scoringVersion: number }) {
  return (
    <Group title="About" gap={4}>
      <Sentence>Halo began as an Android port of Pulse by Aditya Jindal (github.com/adityaongit/pulse), and much of its scoring comes from noop by NoopApp (github.com/ryanbr/noop). Shared under the PolyForm Noncommercial licence. Halo is for personal use and is not a medical device.</Sentence>
      <Rows style={{ marginTop: 8 }}>
        <InfoLine label="Version" value={version} numeric />
        <InfoLine label="Scoring version" value={String(scoringVersion)} numeric />
      </Rows>
      {REPO_URL && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <LinkButton label="Report a bug" onPress={() => void Linking.openURL(`${REPO_URL}/issues/new`)} accessibilityLabel="Report a bug (opens GitHub in the browser)" />
        </View>
      )}
    </Group>
  );
}
