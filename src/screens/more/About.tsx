// About (More), ported from the web's src/app/(app)/more/About.tsx and laid out as iOS lays out an app's About: the app
// icon with its name and version on the ground, then one inset grouped list (the version, the scoring version, updates
// with "Check for updates" or "Update to x.y.z" once GitHub has a newer release (src/update), "Report a bug" (a new
// issue on Halo's GitHub) and "Contact me" (the developer's Reddit)), and the credits as the list's footer. Licence and
// full credits stay in LICENSE and the README.
import * as React from "react";
import { Linking, View } from "react-native";
import { Bug, Download, MessageCircle, RefreshCw } from "lucide-react-native";
import { downloadingLabel, useUpdate } from "@/update/useUpdate";
import { Mark, Txt } from "@/ui";
import { Hairline, useCalm } from "../settings/calmKit";
import { ButtonRow, InfoRow, InsetGroup, NavRow } from "../settings/list";

/** Where "Contact me" goes: the developer's Reddit profile (messages there). */
export const CONTACT_URL = "https://www.reddit.com/user/S0ulArkk/";

/** Halo's GitHub repo, where "Report a bug" files an issue; null hides the row until the repo exists. */
export const REPO_URL: string | null = "https://github.com/S0ulArk/halo";

/** The app's head: the mark on an app-icon squircle, the name, and the version under it. */
function AppHead({ version }: { version: string }) {
  const c = useCalm();
  return (
    <View accessible accessibilityLabel={`Halo, version ${version}`} style={{ alignItems: "center", gap: 4, paddingTop: 8 }}>
      <View style={{ width: 72, height: 72, borderRadius: 17, backgroundColor: c.card, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
        <Mark size={52} />
      </View>
      <Txt size={22} lineHeight={28} weight={700} style={{ color: c.ink }}>
        Halo
      </Txt>
      <Txt size={15} lineHeight={20} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
        {`Version ${version}`}
      </Txt>
    </View>
  );
}

/** The updates row and its action under it (one block of the list): "Up to date" and Check for updates, or the newer version and Update. */
function Updates() {
  const c = useCalm();
  const { status, checking, check, progress, install } = useUpdate();
  const r = status?.available ?? null;
  return (
    <View>
      <InfoRow label="Updates" value={r ? `${r.version} available` : status?.checkedAt ? "Up to date" : "Not checked yet"} valueColor={r ? c.teal : undefined} />
      <Hairline inset={16} />
      {r ? (
        <ButtonRow
          label={progress != null ? downloadingLabel(progress) : r.apkUrl ? `Update to ${r.version}` : "Open the release on GitHub"}
          leading={<Download size={20} strokeWidth={2} />}
          busy={progress != null}
          disabled={progress != null}
          onPress={() => void install(r)}
        />
      ) : (
        <ButtonRow label={checking ? "Checking…" : "Check for updates"} leading={<RefreshCw size={19} strokeWidth={2} />} busy={checking} disabled={checking} onPress={() => void check()} />
      )}
    </View>
  );
}

export function About({ version, scoringVersion }: { version: string; scoringVersion: number }) {
  return (
    <View style={{ gap: 20 }}>
      <AppHead version={version} />
      <InsetGroup
        title="About"
        footer="Halo began as an Android port of Pulse by Aditya Jindal (github.com/adityaongit/pulse), and much of its scoring comes from noop by NoopApp (github.com/ryanbr/noop). Shared under the PolyForm Noncommercial licence. Halo is for personal use and is not a medical device."
      >
        <InfoRow label="Version" value={version} numeric />
        <InfoRow label="Scoring version" value={String(scoringVersion)} numeric />
        <Updates />
        {REPO_URL && (
          <NavRow icon={Bug} system="red" label="Report a bug" description="Opens a new issue on GitHub" external onPress={() => void Linking.openURL(`${REPO_URL}/issues/new`)} accessibilityLabel="Report a bug (opens GitHub in the browser)" />
        )}
        <NavRow icon={MessageCircle} system="orange" label="Contact me" description="Send the developer a message on Reddit" external onPress={() => void Linking.openURL(CONTACT_URL)} accessibilityLabel="Contact the developer (opens Reddit in the browser)" />
      </InsetGroup>
    </View>
  );
}
