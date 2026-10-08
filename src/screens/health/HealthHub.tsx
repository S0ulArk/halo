// Health hub `/health` (spec §7.6), ported from Pulse's src/app/(app)/health/page.tsx and its loading.tsx, in the Calm
// style: Halo Age leads as a pastel card with its Pace of Aging, then a two-column grid of family-tinted entry cards
// (Health Monitor, Stress, Fitness, Heart rate) and Trends, each with its icon, its key number and a short line, each
// opening its own screen.
import * as React from "react";
import { Pressable, View } from "react-native";
import { ChartLine, ChevronRight, Dumbbell, HeartPulse, ShieldCheck, Utensils, Waves, type LucideIcon } from "lucide-react-native";
import type { ChipTone } from "@/lib/bands";
import { formatValue, hmm, MISSING } from "@/lib/format";
import { getHealthHub, getHome, getHrvStatus, TREND_GROUPS, TREND_METRICS, type HealthHubVM } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { Skeleton, SkeletonText, TickScaleSkeleton, Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { TonePill } from "@/ui/components/Meter";
import { Caption, IconTile, Num, Sentence, Title, toneInk } from "@/screens/detail/calmKit";
import { categoryInk, categoryWord, ordinal } from "./format";
import { LastReading } from "./LastReading";
import { PaceScale, PulseAgeHero, PulseAgeHeroSkeleton } from "./PulseAge";
import { ErrorState, TabShell, usePush } from "./shells";
import { AvatarButton } from "@/ui/components/AvatarButton";
import { TileLabel, TileRow } from "@/ui/components/TileRow";
import { homeKey, useDashboardKeys } from "@/screens/home/dashboard";
import { RecoveryCard } from "@/screens/home/calm";
import { MyDashboard } from "@/screens/home/sections";
import { DashboardSkeleton } from "@/screens/home/skeleton";
import { chartHref } from "@/screens/chart/href";
import { HrvStatusCard } from "./HrvStatusCard";
import { nutritionOn } from "@/queries/food";
import { useJournalVersion } from "@/screens/journal/state";
import { CalmCard, MiniStat } from "@/screens/settings/calmKit";

const ACWR_WORD: Record<ChipTone, string> = { optimal: "Optimal", warning: "Pushing", alert: "High risk", neutral: "Detraining" };

/** "Slower vs. last week" / "Faster vs. last week" / "No change vs. last week" (spec §6), from the week-on-week pace change. */
function paceChip(delta: number | null) {
  if (delta === null) return null;
  if (Math.abs(delta) < 0.05) return { tone: "neutral" as const, dir: "flat" as const, text: "No change vs. last week" };
  return delta < 0 ? { tone: "optimal" as const, dir: "down" as const, text: "Slower vs. last week" } : { tone: "warning" as const, dir: "up" as const, text: "Faster vs. last week" };
}

// ── Pulse Age: the lead card ─────────────────────────────────────────────────

function PaceRow({ chip }: { chip: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Title size={15}>Pace of Aging</Title>
      {chip}
    </View>
  );
}

/** The hub's lead [latest-health-tab-1]: Pulse Age large beside the orb, then the Pace of Aging ruler with the week-on-week chip. */
function PulseAge({ m, onPress }: { m: HealthHubVM["healthspan"] | undefined; onPress: () => void }) {
  if (m === undefined)
    return (
      <PulseAgeHeroSkeleton>
        <View style={{ gap: 12 }}>
          <PaceRow chip={<Skeleton style={{ height: 24, width: 96 }} />} />
          <TickScaleSkeleton variant="marker" />
          <Sentence size={13}>Updated weekly</Sentence>
        </View>
      </PulseAgeHeroSkeleton>
    );
  const v = m.value;
  const chip = v ? paceChip(v.paceDelta) : null;
  return (
    <PulseAgeHero
      age={v?.pulseAge ?? null}
      deltaYears={v?.deltaYears ?? null}
      provisional={m.provisional}
      reason={v ? null : m.reason}
      onPress={onPress}
      spokenExtra={v ? `Pace of Aging ${v.pace == null ? "not yet" : `${formatValue("decimal1", v.pace)}x`}${chip ? `, ${chip.text}` : ""}` : null}
    >
      {v && (
        <View style={{ gap: 12 }}>
          <PaceRow
            chip={
              chip && (
                <TonePill tone={chip.tone} dir={chip.dir}>
                  {chip.text}
                </TonePill>
              )
            }
          />
          <PaceScale pace={{ value: v.pace, reason: v.pace == null ? "calibrating" : null, provisional: m.provisional }} />
          <Sentence size={13}>{v.pace == null ? "Updated weekly. Pace shows once 21 of the last 31 days have a Recovery score." : "Updated weekly"}</Sentence>
        </View>
      )}
    </PulseAgeHero>
  );
}

// ── The entry cards ──────────────────────────────────────────────────────────

/**
 * One entry card in the grid: the family's pastel, the icon tile with a chevron, the title (it wraps, never clips),
 * then the key number and its lines. The whole card is one tap target that reads out `label`.
 */
function Tile({ tint, icon, title, label, onPress, children }: { tint?: CalmTint; icon: LucideIcon; title: string; label: string; onPress: () => void; children: React.ReactNode }) {
  const c = useCalm();
  const ink = tint ? c.tintInk[tint] : c.teal;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flexGrow: 1, minWidth: 0, borderRadius: 32, borderWidth: 1, borderColor: tint ? c.tintEdge[tint] : c.edge, backgroundColor: tint ? c.tint[tint] : c.card, padding: 16, gap: 12, opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.985 : 1 }], ...(c.shadow ? { boxShadow: c.shadow } : null) })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <IconTile icon={icon} color={ink} bg={tint ? c.chip : c.tint.mint} size={40} />
        <ChevronRight size={18} color={c.label} strokeWidth={1.5} />
      </View>
      {/* In a TileRow every title takes the row's tallest, so the numbers under them line up across the pair. */}
      <TileLabel>
        <Title>{title}</Title>
      </TileLabel>
      <View style={{ gap: 8 }}>{children}</View>
    </Pressable>
  );
}

/** A tile's loading lines: a bar for the number and its label. */
function TileSkeleton({ label }: { label: string }) {
  return (
    <View style={{ gap: 4 }}>
      <SkeletonText role="valueXl" size={30} lineHeight={34} chars={4} />
      <Caption>{label}</Caption>
      <SkeletonText role="caption" width="80%" />
    </View>
  );
}

/** Health Monitor: how many of last night's vitals sat in range, then which were out and which had no reading, by name. */
function MonitorTile({ m, onPress }: { m: HealthHubVM["monitor"] | undefined; onPress: () => void }) {
  const c = useCalm();
  const ink = c.tintInk.sand;
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
    <Tile tint="sand" icon={ShieldCheck} title="Health Monitor" label={label} onPress={onPress}>
      {!m ? (
        <TileSkeleton label="Within range" />
      ) : !v ? (
        <>
          <View>
            <Num value={MISSING} size={30} color={c.faint} />
            <Caption style={{ marginTop: 4 }}>Within range</Caption>
          </View>
          <Sentence size={13}>No readings from last night</Sentence>
        </>
      ) : (
        <>
          <View>
            <Num value={`${v.inRange}/${v.total}`} size={30} color={ink} />
            <Caption style={{ marginTop: 4 }}>Within range</Caption>
          </View>
          {all && <Sentence size={13}>All vitals in your range</Sentence>}
          {out.length > 0 && <Sentence size={13} color={ink}>{`Out of range: ${out.join(", ")}`}</Sentence>}
          {none.length > 0 && <Sentence size={13}>{`No reading: ${none.join(", ")}`}</Sentence>}
        </>
      )}
    </Tile>
  );
}

/**
 * Today's high-stress time against a typical one of this weekday: two labelled bars on one scale, so the comparison reads
 * at a glance (the day's full line lives on the Stress screen, a tap away).
 */
function StressVsTypical({ today, typical, weekday }: { today: number; typical: number | null; weekday: string }) {
  const c = useCalm();
  const max = Math.max(today, typical ?? 0, 1);
  const row = (label: string, min: number, color: string) => (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <Txt size={11} lineHeight={14} weight={600} style={{ color: c.sub, letterSpacing: 1.4, flexShrink: 1 }}>
          {label}
        </Txt>
        <Txt size={13} lineHeight={16} style={[font.numeric(700), { color }]}>
          {hmm(min)}
        </Txt>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.chip, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(4, Math.round((min / max) * 100))}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
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

/** Stress: today's time at high stress against the same weekday, as numbers and two bars. */
function StressTile({ m, onPress }: { m: HealthHubVM["stress"] | undefined; onPress: () => void }) {
  const c = useCalm();
  const v = m?.value ?? null;
  const typical = v?.typicalHighMin ?? null;
  const dir = !v || typical === null ? null : v.highMin < typical - 1 ? "down" : v.highMin > typical + 1 ? "up" : "flat";
  const vsLine = !v || !dir ? null : dir === "down" ? `Less than a typical ${v.weekday}` : dir === "up" ? `More than a typical ${v.weekday}` : `About a typical ${v.weekday}`;
  const vsInk = dir === "down" ? c.tintInk.mint : dir === "up" ? c.tintInk.sand : undefined;
  const label = !m ? "Stress" : !v ? "Stress: no still minutes yet today" : `Stress: ${hmm(v.highMin)} hours of high stress today${vsLine ? `. ${vsLine}` : ""}`;
  return (
    <Tile tint="lavender" icon={Waves} title="Stress" label={label} onPress={onPress}>
      {!m ? (
        <>
          <TileSkeleton label="High stress today" />
          <View style={{ gap: 8 }}>
            <Skeleton radius={3} style={{ height: 6 }} />
            <Skeleton radius={3} style={{ height: 6, width: "70%" }} />
          </View>
        </>
      ) : !v ? (
        <>
          <View>
            <Num value={MISSING} size={30} color={c.faint} />
            <Caption style={{ marginTop: 4 }}>High stress today</Caption>
          </View>
          <Sentence size={13}>No still minutes yet today</Sentence>
        </>
      ) : (
        <>
          <View>
            <Num value={hmm(v.highMin)} unit="hrs" size={30} color={c.tintInk.lavender} />
            <Caption style={{ marginTop: 4 }}>High stress today</Caption>
          </View>
          {vsLine && (
            <Sentence size={13} color={vsInk}>
              {vsLine}
            </Sentence>
          )}
          <StressVsTypical today={v.highMin} typical={typical} weekday={v.weekday} />
        </>
      )}
    </Tile>
  );
}

/** Fitness: VO2 max with its category and percentile, then the training load ratio and its word. */
function FitnessTile({ m, onPress }: { m: HealthHubVM["fitness"] | undefined; onPress: () => void }) {
  const c = useCalm();
  const v = m?.value ?? null;
  const label = !m
    ? "Fitness"
    : !v
      ? "Fitness: no VO2 max yet"
      : `Fitness: VO2 max ${formatValue("decimal1", v.vo2max)}, ${categoryWord(v.category)}, ${ordinal(v.percentile)} percentile for your age${v.acwr !== null && v.acwrTone ? `. Training load ${formatValue("decimal2", v.acwr)}, ${ACWR_WORD[v.acwrTone]}` : ""}`;
  return (
    <Tile tint="sky" icon={Dumbbell} title="Fitness" label={label} onPress={onPress}>
      {!m ? (
        <TileSkeleton label="VO2 max" />
      ) : !v ? (
        <>
          <View>
            <Num value={MISSING} size={30} color={c.faint} />
            <Caption style={{ marginTop: 4 }}>VO2 max</Caption>
          </View>
          <Sentence size={13}>No VO2 max yet. Fitbit estimates it from runs and resting heart rate.</Sentence>
        </>
      ) : (
        <>
          <View>
            <Num value={formatValue("decimal1", v.vo2max)} unit="ml/kg/min" size={30} color={c.tintInk.sky} />
            <Caption style={{ marginTop: 4 }}>VO2 max</Caption>
          </View>
          <Sentence size={13} color={categoryInk(c, v.category)}>
            {categoryWord(v.category)}
          </Sentence>
          <Sentence size={13}>{`${ordinal(v.percentile)} percentile for your age`}</Sentence>
          {v.acwr !== null && v.acwrTone && (
            <View style={{ marginTop: 4 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8 }}>
                <Num value={formatValue("decimal2", v.acwr)} size={20} />
                <Sentence size={13} color={toneInk(c, v.acwrTone)}>
                  {ACWR_WORD[v.acwrTone]}
                </Sentence>
              </View>
              <Caption style={{ marginTop: 4 }}>Training load</Caption>
            </View>
          )}
        </>
      )}
    </Tile>
  );
}

/** Heart rate: the newest band reading and how long ago it landed. */
function HeartTile({ hr, loading, onPress }: { hr: HealthHubVM["heartRate"]; loading: boolean; onPress: () => void }) {
  const c = useCalm();
  const label = loading ? "Heart rate" : hr ? `Heart rate: latest ${hr.bpm} beats per minute` : "Heart rate: no readings yet";
  return (
    <Tile tint="rose" icon={HeartPulse} title="Heart rate" label={label} onPress={onPress}>
      {loading ? (
        <TileSkeleton label="Latest" />
      ) : !hr ? (
        <>
          <View>
            <Num value={MISSING} size={30} color={c.faint} />
            <Caption style={{ marginTop: 4 }}>Latest</Caption>
          </View>
          <Sentence size={13}>No heart-rate readings yet. They show here once your band syncs.</Sentence>
        </>
      ) : (
        <>
          <View>
            <Num value={String(hr.bpm)} unit="bpm" size={30} color={c.tintInk.rose} />
            <Caption style={{ marginTop: 4 }}>Latest</Caption>
          </View>
          <LastReading t={hr.t} />
        </>
      )}
    </Tile>
  );
}

/** Trends: every daily metric over up to a year. A white card the width of the grid. */
function TrendsCard({ onPress }: { onPress: () => void }) {
  const c = useCalm();
  const n = TREND_METRICS.length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Trends: ${n} metrics in ${TREND_GROUPS.length} groups, each over up to a year`}
      style={({ pressed }) => ({ borderRadius: 32, borderWidth: 1, borderColor: c.edge, backgroundColor: c.card, ...(c.shadow ? { boxShadow: c.shadow } : null), padding: 16, gap: 12, opacity: pressed ? 0.92 : 1 })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <IconTile icon={ChartLine} color={c.teal} bg={c.tint.mint} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Title>Trends</Title>
          <Sentence size={13}>Any daily metric over up to a year, against the period before</Sentence>
        </View>
        <ChevronRight size={18} color={c.label} strokeWidth={1.5} />
      </View>
      <View>
        <Num value={String(n)} unit="metrics" size={30} color={c.teal} />
        <Caption style={{ marginTop: 4 }}>{`In ${TREND_GROUPS.length} groups`}</Caption>
      </View>
    </Pressable>
  );
}

/** Health hub `/health` (spec §7.6): today's values; each card opens its detail screen. */
/** Recovery's card while today's data loads: its mint surface at its size, so nothing moves when it arrives. */
function RecoveryCardSkeleton() {
  const c = useCalm();
  return <View importantForAccessibility="no-hide-descendants" style={{ height: 292, borderRadius: 32, borderWidth: 1, borderColor: c.tintEdge.mint, backgroundColor: c.tint.mint }} />;
}

/**
 * Today's food at a glance: calories and the three macros (the source's roll-up plus food logged in Halo), opening
 * Nutrition for the targets, averages and the food list. Read again after every log write, so a meal just saved shows.
 */
function NutritionCard({ onPress }: { onPress: () => void }) {
  const c = useCalm();
  const version = useJournalVersion();
  const q = useQuery((ctx) => nutritionOn(ctx.store, ctx.today, ctx.timeZone), [version]);
  const t = q.data;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? MISSING : formatValue("grouped", Math.round(v)));
  const label = !t || t.kcal === null ? "Nutrition: no food logged today. Open Nutrition" : `Nutrition today: ${n(t.kcal)} kcal, ${n(t.protein)} g protein, ${n(t.carbs)} g carbs, ${n(t.fat)} g fat. Open Nutrition`;
  return (
    <CalmCard tint="sand" icon={Utensils} title="Nutrition" subtitle={t && t.kcal === null ? "No food logged today" : "Today so far"} onPress={onPress} accessibilityLabel={label} gap={14}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <MiniStat value={n(t?.kcal)} unit="kcal" label="Calories" color={c.tintInk.sand} />
        <MiniStat value={n(t?.protein)} unit="g" label="Protein" />
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <MiniStat value={n(t?.carbs)} unit="g" label="Carbs" />
        <MiniStat value={n(t?.fat)} unit="g" label="Fat" />
      </View>
    </CalmCard>
  );
}

export default function HealthHub() {
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

  return (
    <TabShell title="Health" lead={<AvatarButton />}>
      {error && !vm ? (
        <ErrorState error={error} />
      ) : (
        // Two columns at most on a phone, so every word on a tile fits.
        <View style={{ gap: 12 }}>
          {/* Pulse Age first (the orb), then Recovery: the body's readiness today, with HRV, resting HR, breathing and the week. */}
          <PulseAge m={vm?.healthspan} onPress={() => push("/health/healthspan")} />
          {slot ? <RecoveryCard {...slot} /> : homeQ.error ? null : <RecoveryCardSkeleton />}
          <TileRow>
            <MonitorTile m={vm?.monitor} onPress={() => push("/health/monitor")} />
            <StressTile m={vm?.stress} onPress={() => push("/health/stress")} />
          </TileRow>
          <TileRow>
            <FitnessTile m={vm?.fitness} onPress={() => push("/health/fitness")} />
            <HeartTile hr={vm?.heartRate ?? null} loading={!vm} onPress={() => push("/health/heart-rate")} />
          </TileRow>
          <HrvStatusCard m={hrvQ.data} onOpen={() => push(chartHref({ metric: "hrv", r: "m" }))} />
          <NutritionCard onPress={() => push("/nutrition")} />
          <TrendsCard onPress={() => push("/trends")} />
        </View>
      )}
      {/* Your own metrics against their 30-day averages, and Strain & recovery. */}
      {slot ? <MyDashboard {...slot} /> : !homeQ.error && <DashboardSkeleton stats={dashboard ?? undefined} />}
      <Sentence size={13} align="center">
        Estimates for personal insight, not medical advice.
      </Sentence>
    </TabShell>
  );
}
