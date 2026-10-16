// Health hub `/health` (spec §7.6), ported from Pulse's src/app/(app)/health/page.tsx and its loading.tsx, in Apple
// Health's Summary look: the large title, Halo Age's hero (the age in its gradient, the scale against your real age, the
// pace pills), today's Recovery, then one Summary card per area (the category's glyph and name in its colour, the time
// and a chevron, the value large with a line of context and a small chart): Health Monitor, Stress, HRV Status, Fitness,
// Heart Rate, Nutrition and Trends, each opening its own screen, then My Dashboard. The cards rise into place in turn
// as the tab opens; values roll, rings sweep and the small charts grow in once, all on the UI thread.
import * as React from "react";
import { View } from "react-native";
import { ChartLine, Dumbbell, HeartPulse, ShieldCheck, Utensils, Waves } from "lucide-react-native";
import type { ChipTone } from "@/lib/bands";
import { formatValue, hmm, MISSING } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { getHealthHub, getHome, getHrvStatus, TREND_GROUPS, TREND_METRICS, type HealthHubVM } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { Txt } from "@/ui";
import { useCalm, type CalmPalette } from "@/ui/calm";
import { ActivityRings } from "@/ui/components/Halo";
import { Grow, HealthCard } from "./kit";
import { toneInk } from "@/screens/detail/calmKit";
import { categoryInk, categoryWord, ordinal } from "./format";
import { LastReading } from "./LastReading";
import { HaloAgeHero, HaloAgeHeroSkeleton, type AgePill } from "./PulseAge";
import { ErrorState, TabShell, usePush } from "./shells";
import { AvatarButton } from "@/ui/components/AvatarButton";
import { homeKey, useDashboardKeys } from "@/screens/home/dashboard";
import { RecoveryCard } from "@/screens/home/calm";
import { MyDashboard } from "@/screens/home/sections";
import { DashboardSkeleton } from "@/screens/home/skeleton";
import { chartHref } from "@/screens/chart/href";
import { HrvStatusCard } from "./HrvStatusCard";
import { StressChart } from "./StressChart";
import { nutritionOn } from "@/queries/food";
import { useJournalVersion } from "@/screens/journal/state";

const ACWR_WORD: Record<ChipTone, string> = { optimal: "Optimal", warning: "Pushing", alert: "High risk", neutral: "Detraining" };

/** "Slower vs. last week" / "Faster vs. last week" / "No change vs. last week" (spec §6), from the week-on-week pace change. */
function paceChip(delta: number | null) {
  if (delta === null) return null;
  if (Math.abs(delta) < 0.05) return { tone: "neutral" as const, word: "No change", text: "No change vs. last week" };
  return delta < 0 ? { tone: "optimal" as const, word: "Slower", text: "Slower vs. last week" } : { tone: "warning" as const, word: "Faster", text: "Faster vs. last week" };
}

/** A pace's colour: under 1.0x (aging slower) green, over it orange, level in ink. */
const paceInk = (c: CalmPalette, pace: number) => (pace < 1 ? c.tintInk.mint : pace > 1 ? c.tintInk.peach : c.ink);

/** A note under the hero: 13/18 grey. */
function Note({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
      {children}
    </Txt>
  );
}

// ── Halo Age: the hero ───────────────────────────────────────────────────────

/** The tab's lead [latest-health-tab-1]: Halo Age in its gradient, the age scale, then Pace of Aging and its week-on-week change. */
function HaloAge({ m, onPress }: { m: HealthHubVM["healthspan"] | undefined; onPress: () => void }) {
  const c = useCalm();
  if (m === undefined)
    return (
      <HaloAgeHeroSkeleton head>
        <Note>Updated weekly</Note>
      </HaloAgeHeroSkeleton>
    );
  const v = m.value;
  const chip = v ? paceChip(v.paceDelta) : null;
  const pills: AgePill[] = v
    ? [
        {
          label: "Pace of aging",
          value: v.pace == null ? MISSING : `${formatValue("decimal1", v.pace)}×`,
          color: v.pace == null ? c.faint : paceInk(c, v.pace),
          spoken: v.pace == null ? "not yet" : `${formatValue("decimal1", v.pace)} x`,
        },
        ...(chip ? [{ label: "vs. last week", value: chip.word, color: toneInk(c, chip.tone), spoken: chip.text }] : []),
      ]
    : [];
  return (
    <HaloAgeHero
      age={v?.pulseAge ?? null}
      deltaYears={v?.deltaYears ?? null}
      provisional={m.provisional}
      reason={v ? null : m.reason}
      pills={pills}
      onPress={onPress}
      spokenExtra={v ? `Pace of Aging ${v.pace == null ? "not yet" : `${formatValue("decimal1", v.pace)}x`}${chip ? `, ${chip.text}` : ""}` : null}
    >
      {v && <Note>{v.pace == null ? "Updated weekly. Pace shows once 21 of the last 31 days have a Recovery score." : "Updated weekly"}</Note>}
    </HaloAgeHero>
  );
}

/** Recovery's card while today's data loads: its soft green face at its size, so nothing moves when it arrives. */
function RecoveryCardSkeleton() {
  const c = useCalm();
  return <View importantForAccessibility="no-hide-descendants" style={{ height: 292, borderRadius: 20, backgroundColor: c.tint.mint }} />;
}

// ── The Summary cards ────────────────────────────────────────────────────────

/** Last night's five vitals as a row of status dots: green in range, orange out of it, grey without a reading. */
function VitalDots({ vitals }: { vitals: { key: string; status: string }[] }) {
  const c = useCalm();
  return (
    <Grow style={{ height: 40, justifyContent: "flex-end" }}>
      <View importantForAccessibility="no-hide-descendants" style={{ height: 40, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        {vitals.map((x) => {
          const color = x.status === "in_range" ? c.system.green : x.status === "no_data" ? alpha(c.ink, 0.15) : c.system.orange;
          return <View key={x.key} style={{ width: 10, height: x.status === "no_data" ? 10 : 22, borderRadius: 5, backgroundColor: color }} />;
        })}
      </View>
    </Grow>
  );
}

/** Health Monitor: how many of last night's vitals sat in range, then which were out and which had no reading, by name. */
function MonitorCard({ m, onPress }: { m: HealthHubVM["monitor"] | undefined; onPress: () => void }) {
  const c = useCalm();
  const v = m?.value ?? null;
  const out = v ? v.vitals.filter((x) => x.status !== "in_range" && x.status !== "no_data").map((x) => x.short) : [];
  const none = v ? v.vitals.filter((x) => x.status === "no_data").map((x) => x.short) : [];
  const all = !!v && v.inRange === v.total;
  const label = !m
    ? "Health Monitor"
    : !v
      ? "Health Monitor: no readings from last night"
      : `Health Monitor: ${v.inRange} of ${v.total} within range${out.length ? `, out of range: ${out.join(", ")}` : ""}${none.length ? `, no reading: ${none.join(", ")}` : ""}`;
  return (
    <HealthCard
      tint="sand"
      icon={ShieldCheck}
      title="Health Monitor"
      when="Last night"
      loading={!m}
      value={m ? (v ? `${v.inRange}/${v.total}` : null) : undefined}
      unit="within range"
      context={
        !m ? undefined : !v ? (
          "No readings from last night"
        ) : (
          <View style={{ gap: 1 }}>
            {all && (
              <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
                All vitals in your range
              </Txt>
            )}
            {out.length > 0 && (
              <Txt size={15} lineHeight={20} weight={600} style={{ color: c.tintInk.peach }}>
                {`Out of range: ${out.join(", ")}`}
              </Txt>
            )}
            {none.length > 0 && (
              <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
                {`No reading: ${none.join(", ")}`}
              </Txt>
            )}
          </View>
        )
      }
      chart={v ? <VitalDots vitals={v.vitals} /> : undefined}
      onPress={onPress}
      accessibilityLabel={label}
    />
  );
}

/**
 * Today's high-stress time against a typical one of this weekday: two labelled capsule bars on one scale, so the
 * comparison reads at a glance (the day's full line lives on the Stress screen, a tap away).
 */
function StressVsTypical({ today, typical, weekday }: { today: number; typical: number | null; weekday: string }) {
  const c = useCalm();
  const max = Math.max(today, typical ?? 0, 1);
  const row = (label: string, min: number, color: string) => (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <Txt size={12} lineHeight={16} weight={600} style={{ color: c.sub, letterSpacing: 0.4, flexShrink: 1 }}>
          {label}
        </Txt>
        <Txt size={13} lineHeight={16} weight={700} style={{ color, fontVariant: ["tabular-nums"] }}>
          {hmm(min)}
        </Txt>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.fill, overflow: "hidden" }}>
        <Grow mode="wipe" style={{ height: 6 }}>
          <View style={{ width: `${Math.max(4, Math.round((min / max) * 100))}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
        </Grow>
      </View>
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      {row("TODAY", today, c.tintInk.lavender)}
      {typical !== null && row(`TYPICAL ${weekday.toUpperCase()}`, typical, c.faint)}
    </View>
  );
}

/** Stress: today's time at high stress, the day's line beside it, then the same weekday's typical time. */
function StressCard({ m, timeZone, onPress }: { m: HealthHubVM["stress"] | undefined; timeZone: string; onPress: () => void }) {
  const c = useCalm();
  const v = m?.value ?? null;
  const typical = v?.typicalHighMin ?? null;
  const dir = !v || typical === null ? null : v.highMin < typical - 1 ? "down" : v.highMin > typical + 1 ? "up" : "flat";
  const vsLine = !v || !dir ? null : dir === "down" ? `Less than a typical ${v.weekday}` : dir === "up" ? `More than a typical ${v.weekday}` : `About a typical ${v.weekday}`;
  const vsInk = dir === "down" ? c.tintInk.mint : dir === "up" ? c.tintInk.peach : c.sub;
  const label = !m ? "Stress" : !v ? "Stress: no still minutes yet today" : `Stress: ${hmm(v.highMin)} hours of high stress today${vsLine ? `. ${vsLine}` : ""}`;
  const spark = React.useMemo(() => (v && v.spark.length ? { value: { points: v.spark.map((p) => ({ t: p.t, value: p.v })) }, reason: null, provisional: false } : null), [v]);
  return (
    <HealthCard
      tint="lavender"
      icon={Waves}
      title="Stress"
      when="Today"
      loading={!m}
      value={m ? (v ? hmm(v.highMin) : null) : undefined}
      unit="hrs"
      context={!m ? undefined : !v ? "No still minutes yet today" : "High stress today"}
      chart={spark ? <View style={{ width: 112 }}><StressChart variant="spark" data={spark} timeZone={timeZone} /></View> : undefined}
      onPress={onPress}
      accessibilityLabel={label}
    >
      {v && (
        <View style={{ gap: 10 }}>
          {vsLine && (
            <Txt size={15} lineHeight={20} weight={600} style={{ color: vsInk }}>
              {vsLine}
            </Txt>
          )}
          <StressVsTypical today={v.highMin} typical={typical} weekday={v.weekday} />
        </View>
      )}
    </HealthCard>
  );
}

/** Fitness: VO2 max with its category and percentile (a ring that sweeps to it), then the training load ratio and its word. */
function FitnessCard({ m, onPress }: { m: HealthHubVM["fitness"] | undefined; onPress: () => void }) {
  const c = useCalm();
  const v = m?.value ?? null;
  const label = !m
    ? "Fitness"
    : !v
      ? "Fitness: no VO2 max yet"
      : `Fitness: VO2 max ${formatValue("decimal1", v.vo2max)}, ${categoryWord(v.category)}, ${ordinal(v.percentile)} percentile for your age${v.acwr !== null && v.acwrTone ? `. Training load ${formatValue("decimal2", v.acwr)}, ${ACWR_WORD[v.acwrTone]}` : ""}`;
  return (
    <HealthCard
      tint="sky"
      icon={Dumbbell}
      title="Fitness"
      loading={!m}
      value={m ? (v ? formatValue("decimal1", v.vo2max) : null) : undefined}
      unit="ml/kg/min"
      context={
        !m ? undefined : !v ? (
          "No VO2 max yet. Fitbit estimates it from runs and resting heart rate."
        ) : (
          <View>
            <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
              {"VO2 max · "}
              <Txt size={15} lineHeight={20} weight={600} style={{ color: categoryInk(c, v.category) }}>
                {categoryWord(v.category)}
              </Txt>
            </Txt>
            <Txt size={15} lineHeight={20} style={{ color: c.sub }}>{`${ordinal(v.percentile)} percentile for your age`}</Txt>
          </View>
        )
      }
      chart={v ? <ActivityRings size={48} rings={[{ progress: v.percentile / 100, color: c.system.blue }]} delay={160} /> : undefined}
      onPress={onPress}
      accessibilityLabel={label}
    >
      {v && v.acwr !== null && v.acwrTone && (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: c.line }}>
          <Txt size={15} lineHeight={20} style={{ color: c.ink, flexShrink: 1 }}>
            Training load
          </Txt>
          <Txt size={15} lineHeight={20} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
            <Txt size={17} lineHeight={22} weight={700} style={{ color: c.ink }}>
              {formatValue("decimal2", v.acwr)}
            </Txt>
            {"  "}
            <Txt size={15} lineHeight={20} weight={600} style={{ color: toneInk(c, v.acwrTone) }}>
              {ACWR_WORD[v.acwrTone]}
            </Txt>
          </Txt>
        </View>
      )}
    </HealthCard>
  );
}

/** Heart rate: the newest band reading and how long ago it landed (the dot pings while it is fresh). */
function HeartCard({ hr, loading, onPress }: { hr: HealthHubVM["heartRate"]; loading: boolean; onPress: () => void }) {
  const label = loading ? "Heart rate" : hr ? `Heart rate: latest ${hr.bpm} beats per minute` : "Heart rate: no readings yet";
  return (
    <HealthCard
      tint="rose"
      icon={HeartPulse}
      title="Heart Rate"
      when={hr ? <LastReading t={hr.t} /> : undefined}
      loading={loading}
      value={loading ? undefined : hr ? String(hr.bpm) : null}
      unit="bpm"
      context={loading ? undefined : hr ? "Latest" : "No heart-rate readings yet. They show here once your band syncs."}
      onPress={onPress}
      accessibilityLabel={label}
    />
  );
}

/** Today's macros as one capsule split by grams (protein, carbs, fat), named under it with their grams. */
function Macros({ protein, carbs, fat }: { protein: number | null; carbs: number | null; fat: number | null }) {
  const c = useCalm();
  const parts = [
    { label: "Protein", g: protein, color: c.tintInk.sky },
    { label: "Carbs", g: carbs, color: c.tintInk.peach },
    { label: "Fat", g: fat, color: c.system.yellow },
  ];
  const total = parts.reduce((a, p) => a + (p.g ?? 0), 0);
  const n = (v: number | null) => (v === null ? MISSING : formatValue("grouped", Math.round(v)));
  return (
    <View style={{ gap: 8 }}>
      <View importantForAccessibility="no-hide-descendants" style={{ height: 8, borderRadius: 4, backgroundColor: c.fill, overflow: "hidden" }}>
        {total > 0 && (
          <Grow mode="wipe" style={{ height: 8 }}>
            <View style={{ height: 8, flexDirection: "row", gap: 2 }}>
              {parts.map((p) => ((p.g ?? 0) > 0 ? <View key={p.label} style={{ flexGrow: p.g ?? 0, backgroundColor: p.color, borderRadius: 4 }} /> : null))}
            </View>
          </Grow>
        )}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
        {parts.map((p) => (
          <View key={p.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
            <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
              {`${p.label} `}
              <Txt size={13} lineHeight={18} weight={700} style={{ color: c.ink, fontVariant: ["tabular-nums"] }}>
                {n(p.g)}
              </Txt>
              {p.g === null ? "" : " g"}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Today's food at a glance: calories and the three macros (the source's roll-up plus food logged in Halo), opening
 * Nutrition for the targets, averages and the food list. Read again after every log write, so a meal just saved shows.
 */
function NutritionCard({ onPress }: { onPress: () => void }) {
  const version = useJournalVersion();
  const q = useQuery((ctx) => nutritionOn(ctx.store, ctx.today, ctx.timeZone), [version]);
  const t = q.data;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? MISSING : formatValue("grouped", Math.round(v)));
  const label = !t || t.kcal === null ? "Nutrition: no food logged today. Open Nutrition" : `Nutrition today: ${n(t.kcal)} kcal, ${n(t.protein)} g protein, ${n(t.carbs)} g carbs, ${n(t.fat)} g fat. Open Nutrition`;
  return (
    <HealthCard
      tint="peach"
      icon={Utensils}
      title="Nutrition"
      when="Today"
      loading={!t}
      value={t ? (t.kcal === null ? null : n(t.kcal)) : undefined}
      unit="kcal"
      context={t ? (t.kcal === null ? "No food logged today" : "Today so far") : undefined}
      onPress={onPress}
      accessibilityLabel={label}
    >
      {t && t.kcal !== null && <Macros protein={t.protein} carbs={t.carbs} fat={t.fat} />}
    </HealthCard>
  );
}

/** Trends: every daily metric over up to a year, against the period before. */
function TrendsCard({ onPress }: { onPress: () => void }) {
  const n = TREND_METRICS.length;
  return (
    <HealthCard
      tint="sky"
      icon={ChartLine}
      title="Trends"
      value={String(n)}
      unit="metrics"
      context={`In ${TREND_GROUPS.length} groups. Any daily metric over up to a year, against the period before.`}
      onPress={onPress}
      accessibilityLabel={`Trends: ${n} metrics in ${TREND_GROUPS.length} groups, each over up to a year`}
    />
  );
}

export default function HealthHub() {
  const c = useCalm();
  const { data: vm, error } = useQuery((ctx) => getHealthHub(ctx), [], "healthhub");
  const push = usePush();
  const { today, timeZone } = useApp();
  // Recovery and My Dashboard are Home's cards, on today's Home data (the dashboard's saved metrics too).
  const dashboard = useDashboardKeys();
  const homeQ = useQuery((ctx) => getHome(today, ctx, { dashboardKeys: dashboard ?? undefined }), [today, dashboard], homeKey(today, dashboard));
  const home = homeQ.data && homeQ.data.day === today ? homeQ.data : undefined;
  const slot = home ? { vm: home, timeZone, at: (path: string) => path, go: push } : null;
  // HRV Status (version 19): long-term autonomic health, with its own small query.
  const hrvQ = useQuery((ctx) => getHrvStatus(today, ctx), [today], `hrvstatus:${today}`);
  const failed = !!error && !vm;

  return (
    <TabShell title="Health" lead={<AvatarButton />} gap={12}>
      {failed && <ErrorState error={error} />}
      {/* Halo Age first, then Recovery: the body's readiness today, with HRV, resting HR, breathing and the week. */}
      {!failed && <HaloAge m={vm?.healthspan} onPress={() => push("/health/healthspan")} />}
      {!failed && (slot ? <RecoveryCard {...slot} /> : homeQ.error ? null : <RecoveryCardSkeleton />)}
      {!failed && <MonitorCard m={vm?.monitor} onPress={() => push("/health/monitor")} />}
      {!failed && <StressCard m={vm?.stress} timeZone={timeZone} onPress={() => push("/health/stress")} />}
      {!failed && <HrvStatusCard m={hrvQ.data} onOpen={() => push(chartHref({ metric: "hrv", r: "m" }))} />}
      {!failed && <FitnessCard m={vm?.fitness} onPress={() => push("/health/fitness")} />}
      {!failed && <HeartCard hr={vm?.heartRate ?? null} loading={!vm} onPress={() => push("/health/heart-rate")} />}
      {!failed && <NutritionCard onPress={() => push("/nutrition")} />}
      {!failed && <TrendsCard onPress={() => push("/trends")} />}
      {/* Your own metrics against their 30-day averages, and Strain & recovery. */}
      <View style={{ marginTop: 20 }}>{slot ? <MyDashboard {...slot} /> : !homeQ.error && <DashboardSkeleton stats={dashboard ?? undefined} />}</View>
      <Txt size={13} lineHeight={18} align="center" style={{ color: c.sub, marginTop: 8 }}>
        Estimates for personal insight, not medical advice.
      </Txt>
    </TabShell>
  );
}
