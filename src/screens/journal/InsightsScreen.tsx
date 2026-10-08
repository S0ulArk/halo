// Behaviour insights `/journal/insights?m=` (spec §7.12, journey 7), ported from the web's
// src/app/(app)/journal/insights/{page,Impacts,loading}.tsx: the heading and explainer over the Recovery / HRV / Sleep
// toggle, the impact list (a row opens its detail sheet), then "Keep logging to unlock" and the footnote.
import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { formatValue } from "@/lib/format";
import { getJournalInsights } from "@/queries/journal";
import type { ImpactMetricKey, JournalInsightsVM } from "@/queries/types";
import { useQuery } from "@/state/app";
import { BottomSheet, DriverList, DriverListSkeleton, Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { ActivityCostSection } from "@/screens/detail/ActivityCost";
import { DetailScreen, LoadError } from "@/screens/detail/DetailScreen";
import { useBack, useRefresh } from "@/screens/detail/nav";
import { CalmSegmented, Hairline, Num, Sentence, Surface, Title, useCalm } from "../settings/calmKit";
import { Progress } from "./controls";
import { openCheckIn, useJournalVersion } from "./state";

const METRICS: { key: ImpactMetricKey; label: string; word: string }[] = [
  { key: "recovery", label: "Recovery", word: "Recovery" },
  { key: "hrv", label: "HRV", word: "HRV" },
  { key: "sleep", label: "Sleep", word: "sleep performance" },
];
const WORD: Record<ImpactMetricKey, string> = { recovery: "Recovery", hrv: "HRV", sleep: "sleep performance" };
const TITLE: Record<ImpactMetricKey, string> = { recovery: "Recovery", hrv: "HRV", sleep: "Sleep" };
const FOOTER = "Effects are differences in averages, not proof of cause. Change one habit at a time to see what it really does.";
const parseMetric = (raw: string | string[] | undefined): ImpactMetricKey => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "hrv" || v === "sleep" ? v : "recovery";
};

export default function InsightsScreen() {
  const router = useRouter();
  const onBack = useBack("/journal");
  const { refreshing, onRefresh, retry } = useRefresh();
  const params = useLocalSearchParams<{ m?: string }>();
  const metric = parseMetric(params.m);
  const version = useJournalVersion();
  const q = useQuery((ctx) => getJournalInsights(metric, ctx), [metric, version]);
  // The last metric's list stays in useQuery while the next loads: show the skeleton instead.
  const vm = q.data?.metric === metric ? q.data : undefined;
  const setMetric = (m: ImpactMetricKey) => router.setParams({ m: m === "recovery" ? undefined : m });

  const common = { title: "Behaviour insights", onBack, refreshing, onRefresh } as const;
  if (q.error && !vm) return <DetailScreen {...common} primary={<LoadError onRetry={retry} />} />;

  return (
    <DetailScreen
      {...common}
      hero={
        // Top-aligned and full width, as the web's hero column on a phone.
        <View style={{ alignSelf: "stretch", gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Title size={22} header>{`${TITLE[metric]} impact analysis`}</Title>
            <Sentence>{`How each behaviour changed your next-day ${WORD[metric]} over the last 90 days. Tap a behaviour for details.`}</Sentence>
            <Sentence size={13} style={{ marginTop: 2 }}>
              Updated daily
            </Sentence>
          </View>
          {/* Recovery / HRV / Sleep, kept in `?m=` (spec §7.12). */}
          <CalmSegmented value={metric} onChange={setMetric} on="ground" items={METRICS.map((m) => ({ value: m.key, label: m.label }))} accessibilityLabel="Outcome" />
        </View>
      }
      summary={vm ? <ImpactList vm={vm} /> : <DriverListSkeleton rows={6} unit={metric === "hrv" ? "SD" : "%"} />}
      footer={
        <View style={{ gap: 28 }}>
          {vm && vm.needsMore.length > 0 && <Unlock needsMore={vm.needsMore} word={WORD[metric]} />}
          {/* Mobile: workouts are behaviours too; what each kind costs next-day Recovery. */}
          {metric === "recovery" && <ActivityCostSection />}
          <Sentence size={13} style={{ paddingHorizontal: 4 }}>
            {FOOTER}
          </Sentence>
        </View>
      }
    />
  );
}

/** The impact list; a row opens its detail sheet. */
function ImpactList({ vm }: { vm: JournalInsightsVM }) {
  const c = useCalm();
  const [open, setOpen] = React.useState<string | null>(null);
  const [last, setLast] = React.useState<JournalInsightsVM["items"][number] | null>(null);
  const current = vm.items.find((i) => i.key === open);
  // The sheet keeps its content while it slides out.
  const item = current ?? last;
  const sd = vm.unit === "SD";
  const fx = (v: number, signed = true) => (sd ? `${formatValue(signed ? "signed1" : "decimal1", v)} SD` : `${formatValue(signed ? "signedInt" : "int", v)}%`);
  const avg = (v: number | null) => (v === null ? "--" : sd ? `${formatValue("signed1", v)} SD` : `${formatValue("int", v)}%`);
  const tone = item?.effect === "positive" ? c.tintInk.mint : item?.effect === "negative" ? c.tintInk.sand : c.ink;
  const word = METRICS.find((m) => m.key === vm.metric)!.word;

  return (
    <>
      <DriverList
        variant="impact"
        unit={vm.unit}
        data={{ value: vm.items, reason: null, provisional: false }}
        selectedKey={current?.key}
        onSelect={(k) => {
          setOpen(k);
          setLast(vm.items.find((i) => i.key === k) ?? null);
        }}
        outcome={word}
        onCheckIn={() => openCheckIn()}
      />
      <BottomSheet open={!!current} onClose={() => setOpen(null)} title={item?.label ?? "Behaviour"}>
        {item && (
          <View style={{ gap: 18 }}>
            {/* The effect as the headline number, its unit small beside it, the outcome under it. */}
            <View accessible accessibilityLabel={`${fx(item.delta)} next-day ${word}`} style={{ gap: 4 }}>
              <Num value={sd ? formatValue("signed1", item.delta) : formatValue("signedInt", item.delta)} unit={sd ? "SD" : "%"} size={40} color={tone} />
              <Txt size={11} lineHeight={15} weight={600} style={{ color: c.faint, letterSpacing: 1.4 }}>
                {`NEXT-DAY ${word.toUpperCase()}`}
              </Txt>
            </View>
            <View style={{ borderRadius: 22, backgroundColor: c.ground, paddingHorizontal: 16, paddingVertical: 4 }}>
              {(
                [
                  ["Days with", String(item.yes ?? "--")],
                  ["Days without", String(item.no ?? "--")],
                  ["90% confidence", item.ci ? `${fx(item.ci[0], false)} to ${fx(item.ci[1], false)}` : "--"],
                  ["Average with", avg(item.avgWith)],
                  ["Average without", avg(item.avgWithout)],
                ] as const
              ).map(([k, v], i) => (
                <React.Fragment key={k}>
                  {i > 0 && <Hairline />}
                  {/* The name and the number share their first line, whichever wraps. */}
                  <View style={{ minHeight: 48, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingVertical: (48 - 22) / 2 }}>
                    <Txt size={15} lineHeight={20} weight={500} style={{ color: c.ink, flexShrink: 1, marginTop: 1 }}>
                      {k}
                    </Txt>
                    <Txt size={17} lineHeight={22} align="right" style={[font.numeric(700), { color: c.ink, flexShrink: 1 }]}>
                      {v}
                    </Txt>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <Sentence size={13}>{FOOTER}</Sentence>
          </View>
        )}
      </BottomSheet>
    </>
  );
}

/** The reference app's "Keep logging to unlock" group: one white card per behaviour with its progress to ten days. */
function Unlock({ needsMore, word }: { needsMore: JournalInsightsVM["needsMore"]; word: string }) {
  const c = useCalm();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <Title header>Keep logging to unlock</Title>
        <Sentence>{`Log a behaviour as Yes on at least 5 days and No on at least 5 to see how it changes your next-day ${word}.`}</Sentence>
      </View>
      <View style={{ gap: 10 }}>
        {needsMore.map((n) => {
          const have = Math.min(5, n.yes) + Math.min(5, n.no);
          return (
            <Surface key={n.key} padding={18}>
              <View style={{ gap: 10 }} accessibilityLabel={`${n.label}: ${have} of 10 days logged`}>
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink, flexShrink: 1 }}>
                    {n.label}
                  </Txt>
                  <Num value={String(have)} unit="/ 10" size={20} />
                </View>
                <Progress value={(have / 10) * 100} />
                <Txt size={13} lineHeight={18} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
                  {`${Math.min(5, n.yes)} of 5 days with, ${Math.min(5, n.no)} of 5 without`}
                </Txt>
              </View>
            </Surface>
          );
        })}
      </View>
    </View>
  );
}
