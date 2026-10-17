// Today's body (the web's PageShell `top`, `main`, `aside` and `bottom`), in the Apple Health look of the mockups: the
// three rings hero, the alerts and the coach's insight, then "Pinned" with its Health cards (the live heart rate first,
// then My Dashboard's metrics, "Edit" beside the title), the goals, the day's activities and the journal, and the
// week in review at the foot. Every card is the flat iOS card with Health's category head (controls.tsx); cards sit
// 12 px apart (CARD_GAP) and rise into place as Today opens (rise.tsx). Also the cards the other tabs reuse: the
// activities with their buttons and the Energy Bank (Activity), and My Dashboard (Health).
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { Activity, BatteryCharging, CalendarRange, Check, ChartNoAxesCombined, CircleAlert, Droplet, Dumbbell, Footprints, HeartPulse, Info, NotebookPen, Plus, Scale, Smile, Sparkles, Thermometer, TriangleAlert, Utensils, Waves, type LucideIcon } from "lucide-react-native";
import { clock, DAY, formatDay, formatValue } from "@/lib/format";
import { dayHref } from "@/lib/day";
import { alpha } from "@/lib/utils";
import { isDashboardKey, type EnergyBankVM, type HomeVM, type KeyStat } from "@/queries";
import { nutritionOn } from "@/queries/food";
import { useQuery } from "@/state/app";
import { useJournalVersion } from "@/screens/journal/state";
import { ActivityCard, EmptyState, EnergyBankChart, HomeInsight, InfoButton, MetricState, MetricTags, ReasonPlaceholder, SectionShell, SleepCard, StrainRecoveryChart, Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { Caption, Num } from "@/ui/components/calmKit";
import { PillAction } from "@/ui/components/CalmSurface";
import { CapsuleMeter } from "@/ui/components/CapsuleMeter";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { usePress, usePressStyle } from "@/ui/components/press";
import { font } from "@/ui/fonts";
import { openCheckIn } from "@/screens/journal/CheckInSheet";
import { chartHref } from "@/screens/chart/href";
import { LiveWorkoutButton } from "@/screens/workout/entries";
import { ActionPill, CardButton, DayBanner, FootRow, HomeCard, NumSpan, RowIcon, RowRule, Sentence, Stat, useInfo } from "./controls";
import { EditDashboard } from "./EditDashboard";
import { GoalsGlance } from "./GoalsCard";
import { HeartRateCard } from "./HeartRateCard";
import { ADD_ACTIVITY_INFO, ENERGY_INFO, NO_ACTIVITIES, NO_ACTIVITIES_TODAY, NO_BAND_INFO, STRAIN_RECOVERY_INFO } from "./info";
import { StatCard } from "./pinned";
import { pinnedData, pinnedKey } from "./pinnedData";
import { RiseEach } from "./rise";
import { SLEEP_TAB } from "./tabs";
import { TodayHero } from "./calm";
import { energySeries } from "./view";

const PressableView = Animated.createAnimatedComponent(Pressable);

export type SlotProps = {
  vm: HomeVM;
  timeZone: string;
  /** A route with the shown day carried along (the web's `at`). */
  at: (path: string) => string;
  /** Opens a route. */
  go: (href: string) => void;
};

/** Space between the cards of a section (the skeleton's too). */
export const CARD_GAP = 12;

/** A section's title over its cards, iOS's 22/28 bold, with its link ("Edit") on the right. */
export function SectionTitle({ title, action, style }: { title: string; action?: React.ReactNode; style?: object }) {
  const c = useCalm();
  return (
    <View accessibilityRole="header" style={[{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 4, marginTop: 14, minHeight: 30 }, style]}>
      <Txt size={22} lineHeight={28} weight={700} style={{ color: c.ink, flexShrink: 1 }}>
        {title}
      </Txt>
      {action}
    </View>
  );
}

/** The day's pinned metrics in order, keyed for the 7-day read. */
const pinnedKeys = (vm: HomeVM) => vm.keyStats.map((s) => s.key).filter(isDashboardKey);

// ── Today: the summary, every card leading to its tab ──────────────────────

/**
 * Today (the summary of the day, nothing deep): the rings hero, then only when they apply the no-band line, the vitals
 * alert, the coach's insights, the day's outlook and the phone's numbers; then Pinned (the live heart rate and My
 * Dashboard's metrics as Health cards), the goals at a glance (to the Activity tab), the day's activities so far and
 * the journal with its quick log. Sleep, Recovery and Strain in depth are the Sleep, Health and Activity tabs.
 */
export function TopSlot({ vm, timeZone, at, go }: SlotProps) {
  const keys = React.useMemo(() => pinnedKeys(vm), [vm]);
  const sig = keys.join(",");
  // The pinned cards' week and the night's hours: one light read, after the day's model.
  const extra = useQuery((ctx) => pinnedData(ctx, vm.day, keys), [vm.day, sig], pinnedKey(vm.day, keys));
  const data = extra.data?.day === vm.day ? extra.data : null;
  const open = React.useCallback((href: string) => go(at(href)), [go, at]);
  const openHr = React.useCallback(() => go("/health/heart-rate"), [go]);
  return (
    <View style={{ gap: CARD_GAP }}>
      {/* Each card rises into place, cascading as Today opens and once more as it scrolls into view (rise.tsx). */}
      <RiseEach>
        <TodayHero key="hero" vm={vm} at={at} go={go} asleepMin={data?.asleepMin ?? null} />
        {vm.phone && vm.dials.reason && <NoBandLine key="noband" reason={vm.dials.reason.reason} />}
        {vm.monitorAlert && <MonitorAlert key="monitor" alert={vm.monitorAlert} onOpen={() => go(at("/health/monitor"))} />}
        {vm.insights.length > 0 && (
          // Keyed by the set, so a refresh with fewer cards never leaves the carousel on an index past the end.
          <HomeInsight key={vm.insights.map((it) => it.key).join()} items={vm.insights} />
        )}
        {vm.outlook && <DayBanner key="outlook" outlook={vm.outlook} />}
        {vm.phone && <PhoneActivity key="phone" stats={vm.phone} day={vm.day} today={vm.today} open={open} />}
        <SectionTitle
          key="pinned"
          title="Pinned"
          action={<EditDashboard keys={keys} defaults={vm.dashboard.defaults} empty={vm.dashboard.empty} />}
        />
        <HeartRateCard key="hr" today={vm.isToday} onOpen={openHr} />
        {vm.keyStats.map((s, i) => (
          <StatCard key={`pin-${s.key}`} s={s} series={data?.series[s.key] ?? null} day={vm.day} today={vm.today} open={open} order={i + 1} />
        ))}
        <SectionTitle key="day" title="Your day" />
        <GoalsGlance key="goals" vm={vm} timeZone={timeZone} at={at} go={go} />
        <Activities key="activities" vm={vm} timeZone={timeZone} at={at} go={go} compact />
        <JournalWeek key="journal" vm={vm} timeZone={timeZone} at={at} go={go} />
      </RiseEach>
    </View>
  );
}

/** "No band data yet" with an info glyph: a tap opens why (§11 CD2). */
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
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4, opacity: pressed ? 0.5 : 1 })}
      >
        <ReasonPlaceholder reason={reason} size="sm" copy="No band data yet" />
        <Info size={15} color={c.teal} strokeWidth={2.2} />
      </Pressable>
      {info.dialog}
    </>
  );
}

/** A day with no band but phone data (spec §11 CD2): the phone's own numbers as Health cards against their 30-day averages. */
function PhoneActivity({ stats, day, today, open }: { stats: KeyStat[]; day: string; today: string; open: (href: string) => void }) {
  return (
    <View style={{ gap: CARD_GAP }}>
      <SectionTitle title="From your phone" action={<Caption>vs 30-day avg</Caption>} style={{ marginTop: 6 }} />
      {stats.map((s, i) => (
        <StatCard key={s.key} s={s} series={null} day={day} today={today} open={open} order={i} />
      ))}
    </View>
  );
}

/** Vitals outside the normal range: a card with the yellow wash (pink when they point to illness) and the way to Health Monitor. */
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
        gap={10}
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
 * The day's activities, sleeps and naps as rows in one card, with "See all ›" in its head; then (on the Activity tab)
 * the tinted buttons to add one or go live. `compact` (Today) keeps the rows and "See all" and leaves the buttons to the
 * Activity tab.
 */
export function Activities({ vm, timeZone, at, go, compact = false }: SlotProps & { compact?: boolean }) {
  const addInfo = useInfo(ADD_ACTIVITY_INFO);
  const items = vm.activities.items;
  return (
    <>
      <HomeCard icon={Activity} iconTint="peach" title={vm.activities.title} right={<ActionPill label="See all" accessibilityLabel="See all activities" onPress={() => go("/activities")} />} gap={8}>
        {items.length ? (
          <View>
            {items.map((it, i) => (
              <React.Fragment key={it.id}>
                {i > 0 && <RowRule inset={56} />}
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            {/* Halo imports workouts, so "+ Add activity" explains where they come from (§11 R2). */}
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

/** One quick-log button, half a row: a capsule in the quiet fill with the kind's glyph in its colour and its name (wrapping, never cut). */
function QuickLog({ label, icon: Icon, tint, onPress }: { label: string; icon: LucideIcon; tint: CalmTint; onPress: () => void }) {
  const c = useCalm();
  const press = usePress(0.95);
  const pressed = usePressStyle(press, { dim: 0.65 });
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Log ${label.toLowerCase()}`}
      style={[{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 22, backgroundColor: alpha(c.tintInk[tint], 0.12) }, pressed]}
    >
      <Icon size={18} color={c.tintInk[tint]} strokeWidth={2.2} />
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, flexShrink: 1 }}>
        {label}
      </Txt>
    </PressableView>
  );
}

/**
 * Today's food as an iOS row at the journal card's foot, "Today 1,450 kcal · 82 g protein ›", opening Nutrition. Read
 * on its own (the day's roll-up and the log) and again after every log write, so a meal just saved shows at once.
 */
function NutritionLine({ go }: { go: (href: string) => void }) {
  const version = useJournalVersion();
  const q = useQuery((ctx) => nutritionOn(ctx.store, ctx.today, ctx.timeZone), [version]);
  const t = q.data;
  const spoken = !t ? "Today’s food" : t.kcal === null ? "No food logged today" : `Today ${formatValue("grouped", t.kcal)} kcal${t.protein !== null ? `, ${Math.round(t.protein)} g protein` : ""}`;
  return (
    <FootRow icon={Utensils} tint="sand" title="Nutrition" onPress={() => go("/nutrition")} accessibilityLabel={`${spoken}. Open Nutrition`}>
      {t && t.kcal !== null ? (
        <Sentence size={14}>
          {"Today "}
          <NumSpan size={14}>{formatValue("grouped", t.kcal)}</NumSpan>
          {" kcal"}
          {t.protein !== null && (
            <>
              {" · "}
              <NumSpan size={14}>{String(Math.round(t.protein))}</NumSpan>
              {" g protein"}
            </>
          )}
        </Sentence>
      ) : (
        <Sentence size={14}>{t ? "No food logged today" : "Today’s food"}</Sentence>
      )}
    </FootRow>
  );
}

/** One day of the journal's week, Fitness's calendar: the weekday's letter over a circle, filled blue with a tick once checked in. */
function JournalDay({ day, done, current, today, onPress }: { day: string; done: boolean; current: boolean; today: string; onPress: () => void }) {
  const c = useCalm();
  const press = usePress(0.9);
  const pressed = usePressStyle(press, { dim: 0.6 });
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="link"
      accessibilityLabel={`${formatDay(day, DAY.long)}: ${done ? "checked in" : "no check-in"}`}
      accessibilityState={{ selected: current }}
      hitSlop={4}
      style={[{ flex: 1, alignItems: "center", gap: 6 }, pressed]}
    >
      <Txt size={12} lineHeight={15} weight={600} style={{ color: current ? c.ink : c.sub }}>
        {formatDay(day, { weekday: "narrow" })}
      </Txt>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: done ? c.teal : current ? "transparent" : c.fill,
          borderWidth: current && !done ? 2 : 0,
          borderColor: c.teal,
        }}
      >
        {done ? (
          <Check size={17} color="#ffffff" strokeWidth={3} />
        ) : (
          <Txt size={15} lineHeight={19} style={[font.numeric(600), { color: current || day === today ? c.teal : c.sub }]}>
            {formatDay(day, { day: "numeric" })}
          </Txt>
        )}
      </View>
    </PressableView>
  );
}

/**
 * "My journal" (Today): the week's check-ins as Fitness's day circles, the check-in button while the day isn't done,
 * the quick log (each opening the journal on its form), then iOS rows at its foot: today's food (to Nutrition), the
 * behaviour insights and the journal itself.
 */
export function JournalWeek({ vm, at, go }: SlotProps) {
  const done = vm.journalWeek.filter((w) => w.done).length;
  const checkedIn = vm.journalWeek.find((w) => w.day === vm.day)?.done ?? false;
  const rows: { kind: string; label: string; icon: LucideIcon; tint: CalmTint }[][] = [];
  for (let i = 0; i < QUICK_LOG.length; i += 2) rows.push(QUICK_LOG.slice(i, i + 2));
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
      footer={
        <>
          {vm.isToday && <NutritionLine go={go} />}
          <FootRow icon={Sparkles} tint="lavender" title="Behaviour insights" onPress={() => go("/journal/insights")} />
          <FootRow icon={NotebookPen} tint="sky" title="Open journal" onPress={() => go(at("/journal"))} />
        </>
      }
    >
      <View style={{ flexDirection: "row" }}>
        {vm.journalWeek.map((w) => (
          <JournalDay key={w.day} day={w.day} done={w.done} current={w.day === vm.day} today={vm.today} onPress={() => go(dayHref("/journal", w.day, vm.today))} />
        ))}
      </View>
      {!checkedIn && <CheckInButton label={vm.isToday ? "Check in now" : "Check in"} onPress={() => openCheckIn(vm.day)} />}
      {vm.isToday && (
        <View style={{ gap: 8 }}>
          <Caption>Quick log</Caption>
          {/* Two to a row: every name whole. */}
          {rows.map((row) => (
            <View key={row[0].kind} style={{ flexDirection: "row", gap: 8 }}>
              {row.map((q) => (
                <QuickLog key={q.kind} label={q.label} icon={q.icon} tint={q.tint} onPress={() => go(`/journal?log=${q.kind}`)} />
              ))}
            </View>
          ))}
        </View>
      )}
    </HomeCard>
  );
}

/** The journal card's "Check in now": iOS's filled capsule, full width, a tick of haptics left to the sheet's Done. */
function CheckInButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useCalm();
  const press = usePress();
  const pressed = usePressStyle(press, { dim: 0.8 });
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[{ minHeight: 48, borderRadius: 24, backgroundColor: c.teal, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 20 }, pressed]}
    >
      <NotebookPen size={18} color="#ffffff" strokeWidth={2.2} />
      <Txt size={17} lineHeight={22} weight={600} style={{ color: "#ffffff" }}>
        {label}
      </Txt>
    </PressableView>
  );
}

/** A drain's icon by its kind. */
const DRAIN_ICON: Record<EnergyBankVM["drains"][number]["kind"], LucideIcon> = { workout: Dumbbell, activity: Footprints, stress: Waves };

/** Energy's colour by Garmin's Body Battery bands (Energy Bank's info): high and medium green, low yellow, very low pink. */
const ENERGY_TINT: Record<EnergyBankVM["band"], CalmTint> = { high: "mint", medium: "mint", low: "sand", very_low: "rose" };
const ENERGY_WORD: Record<EnergyBankVM["band"], string> = { high: "high", medium: "medium", low: "low", very_low: "very low" };

export function EnergyCard({ vm, timeZone, go }: SlotProps) {
  const c = useCalm();
  const e = vm.energyBank;
  const eb = e.value;
  const openDay = () => go(chartHref({ metric: "energy", r: "day", d: vm.day === vm.today ? undefined : vm.day }));
  return (
    <HomeCard
      icon={BatteryCharging}
      iconTint="mint"
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
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Num value={formatValue("int", eb.current)} unit="%" size={40} color={ink} />
                    <Txt size={14} lineHeight={19} style={{ color: c.sub }}>{`${vm.isToday ? "Energy left now" : "Energy left"}, ${ENERGY_WORD[eb.band]}`}</Txt>
                  </View>
                  {meta.provisional && <MetricTags provisional />}
                </View>
                <View accessibilityRole="progressbar" accessibilityLabel={`Energy ${formatValue("int", eb.current)} percent`} accessibilityValue={{ min: 0, max: 100, now: Math.round(eb.current) }}>
                  <CapsuleMeter frac={eb.current / 100} color={ink} height={10} track={c.fill} grow />
                </View>
              </View>
              <EnergyBankChart data={{ value: energySeries(eb), reason: null, provisional: false }} timeZone={timeZone} onPress={openDay} />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Stat value={formatValue("signedInt", eb.charged)} label="Charged" color={c.tintInk.mint} />
                <Stat value={formatValue("signedInt", eb.drained)} label="Drained" color={c.tintInk.rose} />
              </View>
              {eb.drains.length > 0 && (
                <View>
                  <Caption style={{ marginBottom: 2 }}>Biggest drains</Caption>
                  {eb.drains.slice(0, 3).map((dr, i) => (
                    <React.Fragment key={`${dr.label}-${dr.start}`}>
                      {i > 0 && <RowRule inset={29 + 12} />}
                      <View
                        accessible
                        accessibilityLabel={`${dr.label} at ${clock(dr.start, timeZone)}, ${formatValue("signedInt", -Math.abs(dr.amount))}`}
                        style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}
                      >
                        <RowIcon icon={DRAIN_ICON[dr.kind]} tint="rose" />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
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

// ── Health: My Dashboard ─────────────────────────────────────────────────────

/** The Health tab's My Dashboard: the same Health cards as Today's Pinned, "Edit" on the right, then Strain & recovery. */
export function MyDashboard({ vm, at, go }: SlotProps) {
  const keys = React.useMemo(() => pinnedKeys(vm), [vm]);
  const sig = keys.join(",");
  const extra = useQuery((ctx) => pinnedData(ctx, vm.day, keys), [vm.day, sig], pinnedKey(vm.day, keys));
  const data = extra.data?.day === vm.day ? extra.data : null;
  const open = React.useCallback((href: string) => go(at(href)), [go, at]);
  const scored = vm.strainRecovery.filter((p) => p.strain !== null || p.recovery !== null).length;
  const openChart = () => go(chartHref({ metric: "strain", compare: "recovery", r: "w", d: vm.day === vm.today ? undefined : vm.day }));
  return (
    <SectionShell variant="section" title="My Dashboard" aside={<Caption>vs 30-day avg</Caption>} action={<EditDashboard keys={keys} defaults={vm.dashboard.defaults} empty={vm.dashboard.empty} />}>
      <View style={{ gap: CARD_GAP }}>
        {vm.keyStats.map((s, i) => (
          <StatCard key={s.key} s={s} series={data?.series[s.key] ?? null} day={vm.day} today={vm.today} open={open} order={i} />
        ))}
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

/** "Your week in review": a card with the indigo family's wash, the calendar and the week's dates, to the last complete week's report (spec §7.1 row 10). */
export function WeekInReview({ vm, go }: SlotProps) {
  const c = useCalm();
  const t = vm.weeklyTeaser;
  if (!t) return null;
  const range = `${formatDay(t.start, DAY.monthDay)} – ${formatDay(t.end, DAY.monthDay)}`;
  return (
    <HomeCard tint="lavender" icon={CalendarRange} title="Your week in review" onPress={() => go(`/reports/${t.period}`)} accessibilityLabel={`Your week in review, ${range}`} gap={6}>
      <Txt size={22} lineHeight={28} style={[font.numeric(700), { color: c.ink }]}>
        {range}
      </Txt>
    </HomeCard>
  );
}
