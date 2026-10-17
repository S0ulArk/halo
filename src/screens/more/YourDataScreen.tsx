// Your data `/more/data` (U21), ported from the web's src/app/(app)/more/data/page.tsx: your daily scores and journal
// answers as CSV or JSON, with the web export's columns (src/queries/settings.ts). Laid out as an iOS settings page:
// one inset grouped list per export (how much there is, then "Export as CSV" and "Export as JSON" rows, what it holds
// as the footer) and the privacy note last. The web answers a download; the phone writes the file to its cache and opens
// the share sheet (save to Files or Drive, send it anywhere).
import * as React from "react";
import { View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { CalendarDays, Download, ListChecks } from "lucide-react-native";
import { DAY, formatDay, formatValue } from "@/lib/format";
import { exportFile, getYourData, type ExportFormat, type ExportKind } from "@/queries/settings";
import { useApp, useQuery, useQueryCtx } from "@/state/app";
import { DetailShell } from "@/ui";
import { RiseEach } from "@/ui/motion/Rise";
import { useBack } from "../detail/nav";
import { SectionFooter } from "../settings/calmKit";
import { ButtonRow, InfoRow, InsetGroup } from "../settings/list";
import { toast } from "../settings/toast";

const UTI: Record<ExportFormat, string> = { csv: "public.comma-separated-values-text", json: "public.json" };

/** Writes one export to the cache and shares it. */
async function shareExport(file: { name: string; mimeType: string; body: string }, format: ExportFormat) {
  const out = new File(Paths.cache, file.name);
  if (out.exists) out.delete();
  out.create();
  out.write(file.body);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn’t available on this phone.");
  await Sharing.shareAsync(out.uri, { mimeType: file.mimeType, UTI: UTI[format], dialogTitle: file.name });
}

export default function YourDataScreen() {
  const app = useApp();
  const ctx = useQueryCtx();
  const onBack = useBack("/more");
  const q = useQuery((x) => getYourData(x, app.source === "demo" ? "demo" : "google"), [app.source]);
  const vm = q.data;
  const [busy, setBusy] = React.useState<string | null>(null);
  const since = vm?.first ? ` since ${formatDay(vm.first, DAY.full)}` : "";

  const run = async (kind: ExportKind, format: ExportFormat) => {
    if (!ctx || busy) return;
    setBusy(`${kind}-${format}`);
    try {
      await shareExport(await exportFile(ctx, kind, format), format);
    } catch (e) {
      toast(e instanceof Error && e.message ? `Couldn’t export. ${e.message}` : "Couldn’t export. Try again.");
    } finally {
      setBusy(null);
    }
  };
  /** The two export rows of a group: CSV and JSON, each with a spinner while it is being made. */
  const rows = (kind: ExportKind, what: string) =>
    (["csv", "json"] as const).map((f) => (
      <ButtonRow
        key={f}
        label={`Export as ${f.toUpperCase()}`}
        leading={<Download size={20} strokeWidth={2} />}
        busy={busy === `${kind}-${f}`}
        disabled={!ctx || busy !== null}
        onPress={() => void run(kind, f)}
        accessibilityLabel={`Export ${what} as ${f.toUpperCase()}`}
      />
    ));

  return (
    <DetailShell
      title="Your data"
      onBack={onBack}
      primary={
        <View style={{ alignSelf: "center", width: "100%", maxWidth: 640, gap: 24 }}>
          <RiseEach>
            <InsetGroup
              title="Daily scores"
              footer={`One row per day${since}: Recovery, Strain, sleep performance, hours and consistency, heart rate variability, resting heart rate, respiratory rate, stress and steps.`}
            >
              <InfoRow icon={CalendarDays} system="blue" label="Days" value={vm ? formatValue("grouped", vm.days) : "…"} numeric={!!vm} />
              {rows("daily", "daily scores")}
            </InsetGroup>
            <InsetGroup title="Journal" footer="Every check-in answer, hidden behaviours included. The JSON also lists your behaviours.">
              <InfoRow icon={ListChecks} system="indigo" label="Answers" value={vm ? formatValue("grouped", vm.answers) : "…"} numeric={!!vm} />
              {rows("journal", "journal answers")}
            </InsetGroup>
            <SectionFooter>Files are made on this phone and go only where you share them. No export includes your AI provider key.</SectionFooter>
          </RiseEach>
        </View>
      }
    />
  );
}
