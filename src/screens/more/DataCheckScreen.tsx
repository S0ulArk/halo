// Data check `/more/datacheck`: for each of the last 10 days, what the source holds per metric — Health Connect split by
// the app and device that wrote it, or the Google Health API by device with its daily roll-ups — next to what Pulse
// stored, so a number that differs from the Fitbit app can be traced. Read-only: it never changes data. The report can
// be shared as text, and it is also logged (one entry per day) so it can be read over adb while diagnosing.
import * as React from "react";
import { ActivityIndicator, Share, View } from "react-native";
import { ClipboardCheck, ClipboardList, Share2 } from "lucide-react-native";
import { googleToken } from "@/google/auth";
import { runGoogleDataCheck } from "@/google/dataCheck";
import { runDataCheck } from "@/health/dataCheck";
import { formatReport, type DayCheck, type SourceLine } from "@/health/dataCheckSummary";
import { formatDay, DAY } from "@/lib/format";
import { useApp } from "@/state/app";
import { DetailShell, Txt } from "@/ui";
import { useBack } from "../detail/nav";
import { Caption, CalmButton, CalmCard, Hairline, Num, Sentence, Surface, Title, useCalm } from "../settings/calmKit";

/** One metric's head: its name, and what Pulse stored as a number with its unit. */
function MetricHead({ label, pulse, unit }: { label: string; pulse: string; unit?: string }) {
  const c = useCalm();
  return (
    <View accessible accessibilityLabel={`${label}: Halo ${pulse}${unit ? ` ${unit}` : ""}`} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, flexShrink: 1 }}>
        {label}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, flexShrink: 1 }}>
        <Caption>Halo</Caption>
        <Num value={pulse} unit={unit} size={18} />
      </View>
    </View>
  );
}

/** What one app or device wrote: ★ (orange) when it is what your data-source setting keeps, its value, then the detail. */
function SourceRow({ s, unit, records = true }: { s: SourceLine; unit?: string; records?: boolean }) {
  const c = useCalm();
  const value = String(s.value);
  const detail = records ? `${s.records} rec · ${s.detail}` : s.detail;
  return (
    <View accessible accessibilityLabel={`${s.fitbit ? "Kept: " : ""}${s.source}: ${value}${unit ? ` ${unit}` : ""}, ${detail}`} style={{ flexDirection: "row", gap: 6 }}>
      <Txt size={14} lineHeight={20} weight={700} style={{ color: c.orange, width: 14 }}>
        {s.fitbit ? "★" : ""}
      </Txt>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <Txt size={14} lineHeight={19} weight={s.fitbit ? 600 : 400} style={{ color: s.fitbit ? c.ink : c.sub, flexShrink: 1 }}>
            {s.source}
          </Txt>
          <Num value={value} unit={unit} size={15} weight={600} color={s.fitbit ? c.ink : c.sub} />
        </View>
        <Txt size={12} lineHeight={16} style={{ color: c.faint }}>
          {detail}
        </Txt>
      </View>
    </View>
  );
}

function Nothing({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} style={{ color: c.faint, paddingLeft: 20 }}>
      {children}
    </Txt>
  );
}

export default function DataCheckScreen() {
  const app = useApp();
  const c = useCalm();
  const onBack = useBack("/more");
  const [state, setState] = React.useState<{ busy: boolean; days: DayCheck[] | null; text: string; error: string | null }>({ busy: false, days: null, text: "", error: null });
  const hc = app.source === "health_connect";
  const google = app.source === "google";
  const where = google ? "Google" : "Health Connect";

  const run = async () => {
    if (!app.store || state.busy) return;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      let errors: string[] = [];
      let r: { days: DayCheck[]; text: string };
      if (google) {
        const g = await runGoogleDataCheck(app.store, { timeZone: app.timeZone, days: 10, token: googleToken });
        errors = g.errors;
        r = g;
      } else r = await runDataCheck(app.store, { timeZone: app.timeZone, days: 10 });
      for (const d of r.days) console.log(`[datacheck] ${formatReport([d], "").split("\n").slice(2).join("\n")}`);
      // Metrics Google wouldn't serve are listed, not fatal: the rest of the check stands.
      const partial = errors.length ? `Not read: ${errors.join("; ")}` : null;
      setState({ busy: false, days: r.days, text: r.text, error: partial });
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <DetailShell
      title="Data check"
      onBack={onBack}
      primary={
        <View style={{ alignSelf: "center", width: "100%", maxWidth: 640, gap: 12 }}>
          <CalmCard icon={ClipboardCheck} iconTint="mint" title={`${google ? "Google Health API" : "Health Connect"} vs Halo`} gap={16}>
            <Sentence>
              {google
                ? "Compares the last 10 days: what the Google Health API returns for each metric (each device’s daily value, Google’s merged roll-up for totals) and each night, and what Halo stored. ★ marks what Halo uses. Nothing is changed."
                : hc
                  ? "Compares the last 10 days: every app and device that wrote each metric to Health Connect, and what Halo stored. ★ marks what your data-source setting keeps. Nothing is changed."
                  : "Connect Health Connect or a Google account to compare its data with Halo. Demo data has nothing to check."}
            </Sentence>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <CalmButton size="md" grow onPress={() => void run()} disabled={!(hc || google) || state.busy || !app.store}>
                {state.busy ? <ActivityIndicator size="small" color={c.card} /> : <ClipboardList size={20} color={c.card} strokeWidth={2} />}
                <Txt size={15} lineHeight={20} weight={600} style={{ color: c.card }}>
                  {state.busy ? "Checking…" : "Run check"}
                </Txt>
              </CalmButton>
              <CalmButton variant="secondary" on="card" size="md" grow icon={Share2} disabled={!state.text} onPress={() => void Share.share({ message: state.text, title: "Halo data check" })}>
                Share
              </CalmButton>
            </View>
            {!!state.error && (
              <Sentence color={c.tintInk.rose} accessibilityRole="alert">
                {state.error}
              </Sentence>
            )}
          </CalmCard>
          {state.days?.map((d) => (
            <Surface key={d.day} gap={14}>
              <Title header>{formatDay(d.day, DAY.full)}</Title>
              {d.metrics
                .filter((m) => m.sources.length || m.pulse != null)
                .map((m) => (
                  <View key={m.key} style={{ gap: 8 }}>
                    <MetricHead label={m.label} pulse={m.pulse == null ? "—" : String(m.pulse)} unit={m.unit || undefined} />
                    {m.sources.length ? m.sources.map((s) => <SourceRow key={s.source} s={s} unit={m.unit || undefined} />) : <Nothing>{`Nothing from ${where}`}</Nothing>}
                    <Hairline />
                  </View>
                ))}
              <View style={{ gap: 8 }}>
                {/* What Pulse stored is a sentence per session ("main 23:10–07:05 asleep 452 min"): it wraps under the name. */}
                <View accessible accessibilityLabel={`Sleep: Halo ${d.sleep.pulse.join(" | ") || "—"}`} style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
                      Sleep
                    </Txt>
                    <Caption>Halo</Caption>
                  </View>
                  <Txt size={14} lineHeight={19} weight={500} style={{ color: c.ink }}>
                    {d.sleep.pulse.join(" | ") || "—"}
                  </Txt>
                </View>
                {d.sleep.sources.length ? d.sleep.sources.map((s, i) => <SourceRow key={`${s.source}-${i}`} s={s} unit="h" records={false} />) : <Nothing>{`No sleep from ${where}`}</Nothing>}
              </View>
            </Surface>
          ))}
        </View>
      }
    />
  );
}
