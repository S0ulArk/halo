// Your data `/more/data` (U21), ported from the web's src/app/(app)/more/data/page.tsx: your daily scores and journal
// answers as CSV or JSON, with the web export's columns (src/queries/settings.ts). The web answers a download; the phone
// writes the file to its cache and opens the share sheet (save to Files or Drive, send it anywhere).
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { CalendarDays, Download, ListChecks } from "lucide-react-native";
import { DAY, formatDay, formatValue } from "@/lib/format";
import { exportFile, getYourData, type ExportFormat, type ExportKind } from "@/queries/settings";
import { useApp, useQuery, useQueryCtx } from "@/state/app";
import { DetailShell, Txt } from "@/ui";
import { useBack } from "../detail/nav";
import { CalmButton, CalmCard, Num, Sentence, useCalm } from "../settings/calmKit";
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

function DownloadButton({ label, busy, disabled, onPress }: { label: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  const c = useCalm();
  return (
    <CalmButton variant="secondary" on="card" size="md" grow onPress={onPress} disabled={disabled} accessibilityLabel={`Export ${label}`}>
      {busy ? <ActivityIndicator size="small" color={c.teal} /> : <Download size={20} color={c.teal} strokeWidth={2} />}
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal }}>
        {label}
      </Txt>
    </CalmButton>
  );
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
  const pair = (kind: ExportKind) => (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {(["csv", "json"] as const).map((f) => (
        <DownloadButton key={f} label={f.toUpperCase()} busy={busy === `${kind}-${f}`} disabled={!ctx || busy !== null} onPress={() => void run(kind, f)} />
      ))}
    </View>
  );
  /** The count beside a card's title: the number in the numeric face, its word small and grey. */
  const count = (n: number | undefined, word: string) => (n === undefined ? null : <Num value={formatValue("grouped", n)} unit={word} size={20} />);

  return (
    <DetailShell
      title="Your data"
      onBack={onBack}
      primary={
        <View style={{ alignSelf: "center", width: "100%", maxWidth: 640, gap: 12 }}>
          <CalmCard icon={CalendarDays} iconTint="sky" title="Daily scores" right={count(vm?.days, "days")} gap={16}>
            <Sentence>
              {`One row per day${since}: Recovery, Strain, sleep performance, hours and consistency, heart rate variability, resting heart rate, respiratory rate, stress and steps.`}
            </Sentence>
            {pair("daily")}
          </CalmCard>
          <CalmCard icon={ListChecks} iconTint="lavender" title="Journal" right={count(vm?.answers, "answers")} gap={16}>
            <Sentence>Every check-in answer, hidden behaviours included. The JSON also lists your behaviours.</Sentence>
            {pair("journal")}
          </CalmCard>
          <Sentence size={13} style={{ paddingHorizontal: 4, marginTop: 4 }}>
            Files are made on this phone and go only where you share them. No export includes your AI provider key.
          </Sentence>
        </View>
      }
    />
  );
}
