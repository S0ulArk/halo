// Home's slots (the web's PageShell `top`, `main`, `aside` and `bottom`), ported from src/app/(app)/(home)/page.tsx,
// in the Calm style of the top cards (calm.tsx): every card is a CalmSurface (white, or its family's pastel with a
// watermark) led by its icon tile, title and sentence; numbers are the numeric face in their family's ink with small
// grey units and caps labels under them; rows inside cards are flat. Cards sit 14 px apart (CARD_GAP), sections 32.
import * as React from "react";
import { Pressable, View } from "react-native";
import { Activity, BatteryCharging, CalendarRange, ChartNoAxesCombined, Check, ChevronRight, CircleAlert, Droplet, Dumbbell, Footprints, HeartPulse, Info, NotebookPen, Plus, Scale, Smile, Thermometer, TriangleAlert, Utensils, Waves, type LucideIcon } from "lucide-react-native";
import { deltaTone } from "@/lib/bands";
import { clock, DAY, formatDay, formatValue, MISSING, NBSP, rangeLabel, statSentence, type FormatKey } from "@/lib/format";
import { dayHref } from "@/lib/day";
import { reasonCopy } from "@/lib/reasons";
import { isDashboardKey, type EnergyBankVM, type HomeVM, type KeyStat } from "@/queries";
import { nutritionOn } from "@/queries/food";
import { useQuery } from "@/state/app";
import { useJournalVersion } from "@/screens/journal/state";
import {
  accentFamily,
  ActivityCard,
  EmptyState,
  EnergyBankChart,
  HomeInsight,
  InfoButton,
  MetricState,
  MetricTags,
  ReasonPlaceholder,
  SectionShell,
  SleepCard,
  StrainRecoveryChart,
  Txt,
} from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { RiseEach } from "@/ui/motion/Rise";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { Caption, familyTint, Num, onBand } from "@/ui/components/calmKit";
import { Card } from "@/ui/components/Card";
import { CalmSurface, PillAction } from "@/ui/components/CalmSurface";
import { Capsule, TonePill } from "@/ui/components/Meter";
import { TileLabel, TileRow } from "@/ui/components/TileRow";
import { ActionPill, CardButton, DayBanner, HeadTile, HomeCard, NumSpan, RowRule, Sentence, Stat, useInfo } from "./controls";
import { EditDashboard } from "./EditDashboard";
import { GoalsGlance } from "./GoalsCard";
import { SLEEP_TAB } from "./tabs";
import { CalmHero } from "./calm";
import { openCheckIn } from "@/screens/journal/CheckInSheet";
import { ADD_ACTIVITY_INFO, ENERGY_INFO, NO_ACTIVITIES, NO_ACTIVITIES_TODAY, NO_BAND_INFO, STRAIN_RECOVERY_INFO } from "./info";
import { energySeries, STAT_ICON, statProps } from "./view";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { chartHref } from "@/screens/chart/href";
import { LiveWorkoutButton } from "@/screens/workout/entries";

export type SlotProps = {
  vm: HomeVM;
  timeZone: string;
  /** A route with the shown day carried along (the web's `at`). */
  at: (path: string) => string;
  /** Opens a route. */
  go: (href: string) => void;
};

/** Space between the cards of a section (the skeleton's too); sections sit 32 apart (HomeScreen). */
export const CARD_GAP = 14;

// ── Today: the summary, every card leading to its tab ──────────────────────

/**
 * Today (the summary of the day, nothing deep): the scores beside the band, then only when they apply the no-band line,
 * the vitals alert, the coach's insights and the phone's numbers; then the day's outlook, the goals at a glance (to the
 * Activity tab), the day's activities so far and the journal with its quick log. Cards sit 14 px apart. Sleep,
 * Recovery and Strain in depth are the Sleep, Health and Activity tabs.
 */
export function TopSlot({ vm, timeZone, at, go }: SlotProps) {
  return (
    <View style={{ gap: CARD_GAP }}>
      {/* Each card rises into place, cascading as Today opens and once more as it scrolls into view (motion/Rise). */}
      <RiseEach>
        <CalmHero key="hero" vm={vm} at={at} go={go} />
        {vm.phone && vm.dials.reason && <NoBandLine key="noband" reason={vm.dials.reason.reason} />}
        {vm.monitorAlert && <MonitorAlert key="monitor" alert={vm.monitorAlert} onOpen={() => go(at("/health/monitor"))} />}
        {vm.insights.length > 0 && (
          // Keyed by the set, so a refresh with fewer cards never leaves the carousel on an index past the end.
          <HomeInsight key={vm.insights.map((it) => it.key).join()} items={vm.insights} />
        )}
        {vm.phone && <PhoneActivity key="phone" stats={vm.phone} open={(href) => go(at(href))} />}
        {vm.outlook && <DayBanner key="outlook" outlook={vm.outlook} />}
        <GoalsGlance key="goals" vm={vm} timeZone={timeZone} at={at} go={go} />
        <Activities key="activities" vm={vm} timeZone={timeZone} at={at} go={go} compact />
        <JournalWeek key="journal" vm={vm} timeZone={timeZone} at={at} go={go} />
      </RiseEach>
    </View>
  );
}

/** "No band data yet" with an info icon: a tap opens why (§11 CD2). */
function NoBandLine({ reason }: { reason: string }) {
  const c = useCalm();
  const info = useInfo(NO_BAND_INFO);
  return (
    <>
      <Pressable
        onPress={info.show}
        accessibilityRole="button"
        accessibilityLabel="No band data yet. About this"
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
      >
        <ReasonPlaceholder reason={reason} size="sm" copy="No band data yet" />
        <Info size={14} color={c.faint} strokeWidth={2} />
      </Pressable>
      {info.dialog}
    </>
  );
}

/** A day with no band but phone data (spec §11 CD2): the phone's own numbers as a bento grid against their 30-day averages. */
function PhoneActivity({ stats, open }: { stats: KeyStat[]; open: (href: string) => void }) {
  return (
    <SectionShell variant="section" title="From your phone" aside={<Caption>vs 30-day avg</Caption>}>
      <StatGrid stats={stats} open={open} />
    </SectionShell>
  );
}

/** Vitals outside the normal range: a sand card (a rose one when they point to illness) with the way to Health Monitor. */
function MonitorAlert({ alert, onOpen }: { alert: NonNullable<HomeVM["monitorAlert"]>; onOpen: () => void }) {
  const illness = alert.kind === "illness";
  const names = alert.names.length > 1 ? `${alert.names.slice(0, -1).join(", ")} and ${alert.names.at(-1)}` : (alert.names[0] ?? "Some vitals");
  return (
    <View accessibilityRole="alert">
      <HomeCard
        tint={illness ? "rose" : "sand"}
        icon={illness ? CircleAlert : TriangleAlert}
        title={illness ? "Your body may be fighting something" : `${alert.count} vitals outside your normal range`}
        subtitle={
          illness
            ? "Several vitals moved away from your normal range together, a pattern that often comes before feeling unwell. Consider an easier day."
            : `${names} are outside your usual range. This can be an early sign of illness or heavy strain.`
        }
        gap={14}
      >
        <View style={{ alignSelf: "flex-start" }}>
          <PillAction label="View Health Monitor" onPress={onOpen} />
        </View>
      </HomeCard>
    </View>
  );
}

// ── The day's cards: activities (Today and Activity), the journal (Today), the Energy Bank (Activity) ──

/**
 * The day's activities, sleeps and naps as flat rows in one white card, then (on the Activity tab) the calm pill buttons
 * to add one or go live. `compact` (Today) keeps the rows and "See all" and leaves the buttons to the Activity tab.
 */
export function Activities({ vm, timeZone, at, go, compact = false }: SlotProps & { compact?: boolean }) {
  const addInfo = useInfo(ADD_ACTIVITY_INFO);
  const items = vm.activities.items;
  return (
    <>
      <HomeCard icon={Activity} iconTint="peach" title={vm.activities.title} right={<ActionPill label="See all" onPress={() => go("/activities")} />} gap={14}>
        {items.length ? (
          <View>
            {items.map((it, i) => (
              <React.Fragment key={it.id}>
                {i > 0 && <RowRule />}
                {it.kind === "activity" ? (
                  <ActivityCard
                    name={it.name}
                    kind={it.activityKind}
                    strain={it.strain}
                    start={it.start}
                    end={it.end}
                    distanceKm={it.distanceKm}
                    paceS={it.paceS}
                    onPress={() => go(`/activity/${encodeURIComponent(it.id)}`)}
                    timeZone={timeZone}
                  />
                ) : (
                  <SleepCard kind={it.kind} minutes={it.minutes} start={it.start} end={it.end} onPress={() => go(at(SLEEP_TAB))} timeZone={timeZone} />
                )}
              </React.Fragment>
            ))}
          </View>
        ) : (
          <EmptyState body={vm.isToday ? NO_ACTIVITIES_TODAY : NO_ACTIVITIES} style={{ paddingVertical: 12 }} />
        )}
        {vm.isToday && !compact && (
          // Side by side when they fit, one under the other when they don't: the labels are never cut.
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {/* Pulse imports workouts, so "+ Add activity" explains where they come from (§11 R2). */}
            <View style={{ flexGrow: 1 }}>
              <CardButton icon={Plus} label="Add activity" onPress={addInfo.show} />
            </View>
            {/* Strain Coach on the band's live heart rate (/workout-live). */}
            <View style={{ flexGrow: 1 }}>
              <LiveWorkoutButton go={go} />
            </View>
          </View>
        )}
      </HomeCard>
      {addInfo.dialog}
    </>
  );
}

/** Today's quick log, each opening the journal straight on its form (`/journal?log=`). Cycle logs stay in the journal. */
const QUICK_LOG: { kind: string; label: string; icon: LucideIcon; tint: CalmTint }[] = [
  { kind: "water", label: "Water", icon: Droplet, tint: "sky" },
  { kind: "food", label: "Food", icon: Utensils, tint: "sand" },
  { kind: "weight", label: "Weight", icon: Scale, tint: "sand" },
  { kind: "spo2", label: "Blood oxygen", icon: HeartPulse, tint: "rose" },
  { kind: "mood", label: "Mood", icon: Smile, tint: "lavender" },
  { kind: "symptoms", label: "Symptoms", icon: Thermometer, tint: "peach" },
];

/** One quick-log button: its icon on its pastel, the name under it (wrapping, never cut). */
function QuickLog({ label, icon: Icon, tint, onPress }: { label: string; icon: LucideIcon; tint: CalmTint; onPress: () => void }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Log ${label.toLowerCase()}`}
      style={({ pressed }) => ({ width: "33.33%", alignItems: "center", gap: 6, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.tint[tint], alignItems: "center", justifyContent: "center" }}>
        <Icon size={20} color={c.tintInk[tint]} strokeWidth={2} />
      </View>
      <Txt size={12} lineHeight={15} weight={600} align="center" style={{ color: c.ink }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * Today's food in one line, "Today 1,450 kcal · 82 g protein ›", opening Nutrition. Read on its own (the day's roll-up
 * and the log) and again after every log write, so a meal just saved shows at once.
 */
function NutritionLine({ go }: { go: (href: string) => void }) {
  const c = useCalm();
  const version = useJournalVersion();
  const q = useQuery((ctx) => nutritionOn(ctx.store, ctx.today, ctx.timeZone), [version]);
  const t = q.data;
  const spoken = !t ? "Today’s food" : t.kcal === null ? "No food logged today" : `Today ${formatValue("grouped", t.kcal)} kcal${t.protein !== null ? `, ${Math.round(t.protein)} g protein` : ""}`;
  return (
    <Pressable
      onPress={() => go("/nutrition")}
      accessibilityRole="link"
      accessibilityLabel={`${spoken}. Open Nutrition`}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.tint.sand, alignItems: "center", justifyContent: "center" }}>
        <Utensils size={16} color={c.tintInk.sand} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {t && t.kcal !== null ? (
          <Sentence>
            {"Today "}
            <NumSpan>{formatValue("grouped", t.kcal)}</NumSpan>
            {" kcal"}
            {t.protein !== null && (
              <>
                {" · "}
                <NumSpan>{String(Math.round(t.protein))}</NumSpan>
                {" g protein"}
              </>
            )}
          </Sentence>
        ) : (
          <Sentence>{t ? "No food logged today" : "Today’s food"}</Sentence>
        )}
      </View>
      <ChevronRight size={18} color={c.label} strokeWidth={1.5} />
    </Pressable>
  );
}

/**
 * "My journal" (Today): the week's check-ins as round pills (done teal with a check, the shown day outlined), a quick
 * log (each opening the journal on its form) with today's food under it (to Nutrition), then the ways in: today's
 * check-in while it isn't done, the behaviour insights and the journal itself.
 */
export function JournalWeek({ vm, at, go }: SlotProps) {
  const c = useCalm();
  const done = vm.journalWeek.filter((w) => w.done).length;
  const checkedIn = vm.journalWeek.find((w) => w.day === vm.day)?.done ?? false;
  return (
    <HomeCard
      icon={NotebookPen}
      iconTint="lavender"
      title="My journal"
      subtitle={
        <Sentence>
          <NumSpan>{String(done)}</NumSpan>
          {` of ${vm.journalWeek.length} days checked in`}
        </Sentence>
      }
    >
      <View style={{ flexDirection: "row" }}>
        {vm.journalWeek.map((w) => {
          const current = w.day === vm.day;
          return (
            <Pressable
              key={w.day}
              onPress={() => go(dayHref("/journal", w.day, vm.today))}
              accessibilityRole="link"
              accessibilityLabel={`${formatDay(w.day, DAY.long)}: ${w.done ? "checked in" : "no check-in"}`}
              accessibilityState={{ selected: current }}
              hitSlop={4}
              style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 8, opacity: pressed ? 0.6 : 1 })}
            >
              <Txt size={11} lineHeight={15} weight={700} style={{ color: current ? c.ink : c.faint, letterSpacing: 0.6 }}>
                {formatDay(w.day, { weekday: "short" }).toUpperCase()}
              </Txt>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: w.done ? c.teal : current ? "transparent" : c.ground,
                  borderWidth: current ? 2 : 0,
                  borderColor: w.done ? c.ink : c.teal,
                }}
              >
                {w.done ? (
                  <Check size={18} color={c.card} strokeWidth={3} />
                ) : (
                  <Txt size={14} lineHeight={18} style={[font.numeric(600), { color: current ? c.teal : c.sub }]}>
                    {formatDay(w.day, { day: "numeric" })}
                  </Txt>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      {vm.isToday && (
        <View style={{ gap: 10 }}>
          <Caption>Quick log</Caption>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 12 }}>
            {QUICK_LOG.map((q) => (
              <QuickLog key={q.kind} label={q.label} icon={q.icon} tint={q.tint} onPress={() => go(`/journal?log=${q.kind}`)} />
            ))}
          </View>
          <NutritionLine go={go} />
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {!checkedIn && <ActionPill label={vm.isToday ? "Check in now" : "Check in"} onPress={() => openCheckIn(vm.day)} />}
        <ActionPill label="Behaviour insights" onPress={() => go("/journal/insights")} />
        <ActionPill label="Open journal" onPress={() => go(at("/journal"))} />
      </View>
    </HomeCard>
  );
}

/** A drain's icon by its kind. */
const DRAIN_ICON: Record<EnergyBankVM["drains"][number]["kind"], LucideIcon> = { workout: Dumbbell, activity: Footprints, stress: Waves };

/** Energy's pastel by Garmin's Body Battery bands (Energy Bank's info): high and medium mint, low sand, very low rose. */
const ENERGY_TINT: Record<EnergyBankVM["band"], CalmTint> = { high: "mint", medium: "mint", low: "sand", very_low: "rose" };
const ENERGY_WORD: Record<EnergyBankVM["band"], string> = { high: "high", medium: "medium", low: "low", very_low: "very low" };

export function EnergyCard({ vm, timeZone, go }: SlotProps) {
  const c = useCalm();
  const e = vm.energyBank;
  const eb = e.value;
  const openDay = () => go(chartHref({ metric: "energy", r: "day", d: vm.day === vm.today ? undefined : vm.day }));
  return (
    <HomeCard
      tint="mint"
      icon={BatteryCharging}
      title="Energy Bank"
      subtitle={
        eb ? (
          <Sentence>
            {"Started at "}
            <NumSpan>{`${formatValue("int", eb.startLevel)}%`}</NumSpan>
            {" at "}
            <NumSpan>{clock(eb.startAt, timeZone)}</NumSpan>
          </Sentence>
        ) : undefined
      }
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {eb && <ExpandButton onPress={openDay} />}
          <InfoButton info={ENERGY_INFO} label="Energy Bank" variant="card" />
        </View>
      }
    >
      <MetricState metric={e} skeleton={null} renderReason={(r, meta) => <ReasonPlaceholder reason={r} nightsLeft={meta.nightsLeft} size="md" />}>
        {(eb, meta) => {
          const ink = c.tintInk[ENERGY_TINT[eb.band]];
          return (
            <>
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Num value={formatValue("int", eb.current)} unit="%" size={44} color={ink} />
                    <Caption style={{ marginTop: 2 }}>{`${vm.isToday ? "Energy left now" : "Energy left"}, ${ENERGY_WORD[eb.band]}`}</Caption>
                  </View>
                  {meta.provisional && <MetricTags provisional />}
                </View>
                <View accessibilityRole="progressbar" accessibilityLabel={`Energy ${formatValue("int", eb.current)} percent`} accessibilityValue={{ min: 0, max: 100, now: Math.round(eb.current) }}>
                  <Capsule value={eb.current / 100} color={ink} height={10} style={{ backgroundColor: c.chip }} />
                </View>
              </View>
              {/* The chart on a white well, the surface it is drawn for. */}
              <View style={{ borderRadius: 20, backgroundColor: c.card, paddingHorizontal: 10, paddingVertical: 12 }}>
                <EnergyBankChart data={{ value: energySeries(eb), reason: null, provisional: false }} timeZone={timeZone} onPress={openDay} />
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Stat value={formatValue("signedInt", eb.charged)} label="Charged" color={c.tintInk.mint} />
                <Stat value={formatValue("signedInt", eb.drained)} label="Drained" color={c.tintInk.rose} />
              </View>
              {eb.drains.length > 0 && (
                <View>
                  <Caption style={{ marginBottom: 4 }}>Biggest drains</Caption>
                  {eb.drains.slice(0, 3).map((dr, i) => (
                    <React.Fragment key={`${dr.label}-${dr.start}`}>
                      {i > 0 && <RowRule inset={48} color={c.tintEdge.mint} />}
                      {/* The tile on the name and its time (20 + 18), the number on the name's line, whatever wraps. */}
                      <View
                        accessible
                        accessibilityLabel={`${dr.label} at ${clock(dr.start, timeZone)}, ${formatValue("signedInt", -Math.abs(dr.amount))}`}
                        style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8 }}
                      >
                        <View style={{ marginTop: onBand(20 + 18, 36) }}>
                          <HeadTile icon={DRAIN_ICON[dr.kind]} color={c.tintInk.rose} bg={c.chip} size={36} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
                            {dr.label}
                          </Txt>
                          <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
                            {"at "}
                            <NumSpan size={13} color={c.sub}>
                              {clock(dr.start, timeZone)}
                            </NumSpan>
                          </Txt>
                        </View>
                        <Num value={formatValue("signedInt", -Math.abs(dr.amount))} size={20} color={c.tintInk.rose} />
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              )}
            </>
          );
        }}
      </MetricState>
    </HomeCard>
  );
}

// ── Aside: My Dashboard ──────────────────────────────────────────────────────

const unitText = (unit?: string) => (unit ? (unit === "%" ? "%" : `${NBSP}${unit}`) : "");
/** |n| in the stat's format, without the sign a signed format adds. */
const absText = (format: FormatKey, n: number) => formatValue(format, Math.abs(n)).replace(/^[+−-]/, "");
/** A label this long spans the grid's row, so it stays on two lines at most. */
const WIDE_LABEL = 18;

/**
 * One metric as a small white bento card: its family's icon tile and name, the value big in the family's ink with its
 * unit small and grey, then the difference from the 30-day average as a pastel pill with the average under it. A wide
 * card (a full row) puts the comparison on the right of the value. Two across, the cards of a row share one height and
 * their numbers one line (TileRow).
 */
function DashTile({ s, open, wide }: { s: KeyStat; open: (href: string) => void; wide: boolean }) {
  const c = useCalm();
  const p = statProps(s, c.sub, open);
  const family = accentFamily(s.key) ?? accentFamily(s.label);
  const v = s.metric.value;
  const value = v !== null && Number.isFinite(v) ? v : null;
  const tint = familyTint(family, value);
  const reason = value === null ? reasonCopy(s.metric.reason, s.metric.nightsLeft).short : null;
  const avg = p.average ?? null;
  const t = value !== null && avg !== null && p.direction !== "none" ? deltaTone(p.direction, value, avg, p.sd) : null;
  const diff = value !== null && avg !== null ? value - avg : null;
  const diffText = diff === null || absText(p.format, diff) === absText(p.format, 0) ? null : `${diff > 0 ? "+" : "−"}${absText(p.format, diff)}`;
  const valueText = value === null ? MISSING : formatValue(p.format, value);
  const avgText = avg !== null ? formatValue(p.format, avg) : null;
  const sentence = reason ? `${s.label}: ${reason}` : statSentence({ label: s.label, valueText, unit: p.unit, averageText: avgText ?? undefined, dir: t?.dir, tone: t?.tone });
  const tags = !!s.metric.provisional || !!s.metric.tags?.length;

  const pill =
    value === null || diff === null ? null : !diffText ? (
      <TonePill tone="neutral" dir="flat">
        No change
      </TonePill>
    ) : t?.dir === "flat" ? (
      // Inside ±1 σ the reading is "in line": a dot, and the sign spelled out since no arrow carries it.
      <TonePill tone="neutral" dir="flat">{`${diffText}${unitText(p.unit)}`}</TonePill>
    ) : (
      <TonePill tone={t?.tone ?? "neutral"} dir={diff > 0 ? "up" : "down"}>{`${absText(p.format, diff)}${unitText(p.unit)}`}</TonePill>
    );
  const average =
    value !== null && avgText !== null ? (
      <Txt size={12} lineHeight={16} weight={500} style={{ color: c.faint }}>
        {"30-day avg "}
        <Txt size={12} lineHeight={16} style={[font.numeric(600), { color: c.sub }]}>{`${avgText}${unitText(p.unit)}`}</Txt>
      </Txt>
    ) : null;
  const Icon = statIconOf(s.key);
  const label = (
    <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, flexShrink: 1 }}>
      {s.label}
    </Txt>
  );
  // Two across, the name takes its row's tallest name's height (TileLabel), so both numbers start on one line.
  const head = (
    <View style={{ flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", gap: wide ? 12 : 10 }}>
      <HeadTile icon={Icon} color={tint ? c.tintInk[tint] : c.sub} bg={tint ? c.tint[tint] : c.ground} size={36} />
      {wide ? label : <TileLabel>{label}</TileLabel>}
    </View>
  );
  const number = <Num value={valueText} unit={value === null ? undefined : p.unit} size={wide ? 30 : 28} color={value === null ? c.faint : tint ? c.tintInk[tint] : c.ink} />;
  return (
    <Card padding={16} onPress={p.onPress} accessibilityLabel={sentence} style={{ flex: 1 }}>
      <View style={{ flex: 1, gap: 12 }}>
        {head}
        {wide ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              {number}
              {reason && <Sentence size={13}>{reason}</Sentence>}
              {tags && <MetricTags provisional={s.metric.provisional} tags={s.metric.tags} align="flex-start" />}
            </View>
            {(pill || average) && (
              <View style={{ alignItems: "flex-end", gap: 6, flexShrink: 1 }}>
                {pill}
                {average}
              </View>
            )}
          </View>
        ) : (
          <View style={{ gap: 6, alignItems: "flex-start" }}>
            {number}
            {reason && <Sentence size={13}>{reason}</Sentence>}
            {tags && <MetricTags provisional={s.metric.provisional} tags={s.metric.tags} align="flex-start" />}
            {pill}
            {average}
          </View>
        )}
      </View>
    </Card>
  );
}

const statIconOf = (key: string): LucideIcon => STAT_ICON[key] ?? Activity;

/**
 * The bento grid's rows, in the stats' order: two to a row, while a long label, or a tile left without a partner,
 * spans its row. Shared with the skeleton, so nothing moves when the numbers arrive.
 */
export function bentoRows<T>(items: T[], label: (it: T) => string): T[][] {
  const rows: T[][] = [];
  let pending: T | null = null;
  for (const it of items) {
    if (label(it).length > WIDE_LABEL) {
      if (pending !== null) rows.push([pending]);
      pending = null;
      rows.push([it]);
    } else if (pending !== null) {
      rows.push([pending, it]);
      pending = null;
    } else pending = it;
  }
  if (pending !== null) rows.push([pending]);
  return rows;
}

/** The stats as a two-column bento grid of small white cards. */
function StatGrid({ stats, open }: { stats: KeyStat[]; open: (href: string) => void }) {
  return (
    <View style={{ gap: 12 }}>
      {bentoRows(stats, (s) => s.label).map((row) => (
        <TileRow key={row[0].key} gap={12}>
          {row.map((s) => (
            <DashTile key={s.key} s={s} open={open} wide={row.length === 1} />
          ))}
        </TileRow>
      ))}
    </View>
  );
}

export function MyDashboard({ vm, at, go }: SlotProps) {
  const scored = vm.strainRecovery.filter((p) => p.strain !== null || p.recovery !== null).length;
  const openChart = () => go(chartHref({ metric: "strain", compare: "recovery", r: "w", d: vm.day === vm.today ? undefined : vm.day }));
  return (
    <SectionShell
      variant="section"
      title="My Dashboard"
      aside={<Caption>vs 30-day avg</Caption>}
      action={<EditDashboard keys={vm.keyStats.map((s) => s.key).filter(isDashboardKey)} defaults={vm.dashboard.defaults} empty={vm.dashboard.empty} />}
    >
      <View style={{ gap: CARD_GAP }}>
        <StatGrid stats={vm.keyStats} open={(href) => go(at(href))} />
        {/* Hidden with fewer than two scored days: one point is not a trend (spec §7.1 row 9). */}
        {scored >= 2 && (
          <HomeCard
            icon={ChartNoAxesCombined}
            iconTint="peach"
            title="Strain & recovery"
            subtitle="Your last 7 days side by side"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ExpandButton onPress={openChart} />
                <InfoButton info={STRAIN_RECOVERY_INFO} label="Strain & recovery" variant="card" />
              </View>
            }
          >
            <StrainRecoveryChart points={vm.strainRecovery} today={vm.day} onPress={openChart} />
          </HomeCard>
        )}
      </View>
    </SectionShell>
  );
}

// ── Bottom: the weekly-report teaser ─────────────────────────────────────────

/** "Your week in review": a navy banner (no gradient of its own) to the last complete week's report (spec §7.1 row 10). */
export function WeekInReview({ vm, go }: SlotProps) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const t = vm.weeklyTeaser;
  if (!t) return null;
  const range = rangeLabel(t.start, t.end);
  const open = () => go(`/reports/${t.period}`);
  // The navy is deep in the light scheme and pale in the dark one: the words take the opposite end.
  const onNavy = dark ? c.ground : "#ffffff";
  return (
    <CalmBanner onPress={open} label={`Your week in review, ${range}`} bg={c.navy}>
      <View pointerEvents="none" style={{ position: "absolute", right: -38, bottom: -38, opacity: 0.12, transform: [{ rotate: "-12deg" }] }}>
        <CalendarRange size={132} color={onNavy} strokeWidth={1.25} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <HeadTile icon={CalendarRange} color={onNavy} bg={`${onNavy}26`} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={17} lineHeight={22} weight={600} style={{ color: onNavy }}>
            Your week in review
          </Txt>
          <Txt size={14} lineHeight={19} style={[font.numeric(600), { color: onNavy, opacity: 0.75 }]}>
            {range}
          </Txt>
        </View>
        <PillAction label="Open" onPress={open} />
      </View>
    </CalmBanner>
  );
}

/** A CalmSurface in a solid accent (the soft depth and lit edge kept), for the week's banner. */
function CalmBanner({ onPress, label, bg, children }: { onPress: () => void; label: string; bg: string; children: React.ReactNode }) {
  return (
    <CalmSurface onPress={onPress} accessibilityLabel={label} padding={20} style={{ backgroundColor: bg, borderColor: bg }}>
      {children}
    </CalmSurface>
  );
}
