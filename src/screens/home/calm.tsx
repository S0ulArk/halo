// Today's top in the iOS look (the mockups' Today): the floating bar (a Liquid Glass streak capsule on the left, the
// sync status and the profile button on the right, the inline title fading in once the large title has folded under
// it), the date eyebrow over the large title with the day's steppers, and the hero: the day's three scores as Apple's
// triple Activity rings (Recovery outermost, Sleep, Strain of 21) with the three values beside them, each rolling into
// place as its ring sweeps in. Also the two week cards the Sleep and Health tabs show (Sleep's week of nights against
// the goal, Recovery with its vitals and its week), drawn as Apple Health cards with rounded bars.
//
// Every scroll-driven change (the title folding, the inline title, the bar's edge) is an animated style off the page's
// scroll offset on the UI thread; nothing here runs JS per frame.
import * as React from "react";
import { ActivityIndicator, Pressable, useWindowDimensions, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";
import { useRouter, type Href } from "expo-router";
import { ChevronDown, ChevronLeft, ChevronRight, HeartPulse, Moon } from "lucide-react-native";
import { BAND_WORD, recoveryBand } from "@/lib/bands";
import { DAY, dayLabel, formatDay, formatValue, MISSING } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import { alpha, mix } from "@/lib/utils";
import { getTrends, type HomeVM, type KeyStat } from "@/queries";
import { useApp, useQuery } from "@/state/app";
import { SyncStatus, Txt, type SyncShellStatus } from "@/ui";
import { useCalm } from "@/ui/calm";
import { CalendarSheet } from "@/ui/components/CalendarSheet";
import { CalmSurface, PillAction } from "@/ui/components/CalmSurface";
import { stepDay } from "@/ui/components/DateSwitcher";
import { BAR_ROW, BarEdge } from "@/ui/components/DetailHeader";
import { GlassButton, GlassCapsule } from "@/ui/components/GlassButton";
import { RING_LAND_MS, RING_STAGGER, RollingNumber, ScoreRings } from "@/ui/components/Halo";
import { StreakFlame, UserAvatar } from "@/ui/components/HomeHeader";
import { usePress, usePressStyle } from "@/ui/components/press";
import { font } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { useTheme } from "@/ui/ThemeProvider";
import { chartHref } from "@/screens/chart/href";
import { HomeCard, RowRule } from "./controls";
import { Grow } from "./miniCharts";
import { ACTIVITY_TAB, HEALTH_TAB, SLEEP_TAB } from "./tabs";

type Go = { at: (p: string) => string; go: (h: string) => void };

const PressableView = Animated.createAnimatedComponent(Pressable);

/** How far the page scrolls before the inline title has fully replaced the large one. */
export const TITLE_FOLD = 64;

/** "6h 11m", or null. */
const hm = (min: number | null | undefined) => {
  if (min == null || !Number.isFinite(min)) return null;
  const m = Math.round(min);
  return { h: Math.floor(m / 60), m: m % 60 };
};
const hmText = (min: number | null | undefined) => {
  const t = hm(min);
  return t ? `${t.h}h ${String(t.m).padStart(2, "0")}m` : null;
};

/** "6 hours 11 minutes", for a screen reader. */
const spokenHm = (min: number | null) => {
  const t = hm(min);
  return t ? `${t.h} hours ${t.m} minutes` : "no sleep recorded";
};

// ── The bar ──────────────────────────────────────────────────────────────────

/** The streak, a glass capsule: the flame, the count in bold figures and "day streak" in grey. */
function StreakCapsule({ days }: { days: number }) {
  const c = useCalm();
  return (
    <GlassCapsule accessibilityLabel={`${days}-day streak`} style={{ gap: 6, paddingLeft: 12, paddingRight: 14 }}>
      <StreakFlame u={0.62} />
      <Txt size={15} lineHeight={20} weight={600} numberOfLines={1} style={{ color: c.sub }}>
        <Txt size={15} lineHeight={20} weight={700} style={[font.numeric(700), { color: c.ink }]}>
          {String(days)}
        </Txt>
        {" day streak"}
      </Txt>
    </GlassCapsule>
  );
}

/**
 * Today's floating bar, iOS 26's: Liquid Glass chrome over the page (render it as the page GlassTarget's overlay so
 * the glass bends what scrolls under it), the streak capsule on the left, the sync status and the profile button on the
 * right, and the inline title, centred, fading in once the large title has folded under the bar.
 */
export function TodayBar({ y, title, streak, sync, onAvatar }: { y: SharedValue<number> | null; title: string; streak: { days: number } | null; sync: { status: SyncShellStatus; now: number | null; onPress?: () => void }; onAvatar: () => void }) {
  const c = useCalm();
  const insets = useSafeAreaInsets();
  const inline = useAnimatedStyle(() => {
    const p = y ? interpolate(y.value, [TITLE_FOLD - 20, TITLE_FOLD], [0, 1], Extrapolation.CLAMP) : 0;
    return { opacity: p, transform: [{ translateY: (1 - p) * 6 }] };
  });
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}>
      {/* Under the buttons, so their glass bends the page passing beneath, as the tab bar's does. */}
      <BarEdge y={y} ground={c.ground} />
      <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={[{ position: "absolute", left: 96, right: 96, top: insets.top, height: BAR_ROW, alignItems: "center", justifyContent: "center" }, inline]}>
        <Txt size={17} lineHeight={22} weight={600} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} align="center" style={{ color: c.ink }}>
          {title}
        </Txt>
      </Animated.View>
      {/* The bar's row takes the touches over its whole width, as iOS's bar does: what has scrolled under it can't be tapped. */}
      <View style={{ marginTop: insets.top, height: BAR_ROW, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 }}>
        {streak && streak.days > 0 ? <StreakCapsule days={streak.days} /> : null}
        <View style={{ flex: 1 }} />
        <SyncStatus status={sync.status} now={sync.now} onPress={sync.onPress} hideText />
        <GlassButton onPress={onAvatar} accessibilityLabel="Settings">
          <UserAvatar src={null} size={22} />
        </GlassButton>
      </View>
    </View>
  );
}

// ── The large title ──────────────────────────────────────────────────────────

/**
 * A round step button beside the large title, iOS's tinted button: a light blue fill under a bold blue chevron, so it
 * reads as a control on the pastel wash (the old system-grey fill all but vanished there). Where the days stop it turns
 * the quiet grey with a grey chevron.
 */
function StepButton({ dir, disabled, onPress }: { dir: -1 | 1; disabled: boolean; onPress: () => void }) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const press = usePress(0.9);
  const pressed = usePressStyle(press, { rest: disabled ? 0.6 : 1, dim: 0.6 });
  const Icon = dir < 0 ? ChevronLeft : ChevronRight;
  return (
    <PressableView
      onPress={() => {
        haptic.select();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? "Previous day" : "Next day"}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={[{ width: 40, height: 40, borderRadius: 20, backgroundColor: disabled ? c.fill : alpha(c.teal, dark ? 0.26 : 0.15), alignItems: "center", justifyContent: "center" }, pressed]}
    >
      <Icon size={23} color={disabled ? c.tertiary : c.teal} strokeWidth={2.8} style={dir < 0 ? { marginLeft: -2 } : { marginRight: -2 }} />
    </PressableView>
  );
}

/**
 * The page's opening, iOS's large title: the day as a caps eyebrow ("FRIDAY, OCTOBER 17") over "Today" (or
 * "Yesterday", or the day) in 34 px bold, with the previous and next day beside it. A tap on the title opens the month
 * calendar. As the page scrolls the block shrinks toward its left edge and fades as it slides under the bar, where the
 * inline title takes over (UI thread).
 */
export function TodayTitle({ y, day, today, firstDay, loading, onChange }: { y: SharedValue<number> | null; day: string; today: string; firstDay?: string | null; loading?: boolean; onChange: (day: string) => void }) {
  const c = useCalm();
  const [calendar, setCalendar] = React.useState(false);
  const title = dayLabel(day, today);
  const fold = useAnimatedStyle(() => {
    const v = y ? y.value : 0;
    return {
      opacity: interpolate(v, [0, TITLE_FOLD - 10], [1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(v, [0, TITLE_FOLD], [1, 0.94], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={[{ transformOrigin: "left bottom", marginBottom: 4 }, fold]}>
      <Txt size={13} lineHeight={18} weight={600} style={{ color: c.sub, letterSpacing: 0.2 }}>
        {formatDay(day, DAY.long).toUpperCase()}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={() => setCalendar(true)}
          accessibilityRole="button"
          accessibilityLabel={`${title}. Open calendar`}
          accessibilityState={{ busy: !!loading }}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, opacity: pressed ? 0.6 : 1 })}
        >
          <Txt size={34} lineHeight={41} weight={700} accessibilityRole="header" style={{ color: c.ink, flexShrink: 1 }}>
            {title}
          </Txt>
          {loading ? <ActivityIndicator size="small" color={c.sub} /> : <ChevronDown size={20} color={c.tertiary} strokeWidth={2.6} style={{ marginTop: 6 }} />}
        </Pressable>
        <View style={{ flex: 1 }} />
        <StepButton dir={-1} disabled={!!firstDay && day <= firstDay} onPress={() => onChange(stepDay(day, -1, today, firstDay))} />
        <StepButton dir={1} disabled={day >= today} onPress={() => onChange(stepDay(day, 1, today, firstDay))} />
      </View>
      <CalendarSheet
        open={calendar}
        onClose={() => setCalendar(false)}
        selected={day}
        today={today}
        firstDay={firstDay}
        onSelect={(picked) => {
          setCalendar(false);
          if (picked !== day) onChange(stepDay(picked, 0, today, firstDay));
        }}
      />
    </Animated.View>
  );
}

// ── The hero: the three rings ────────────────────────────────────────────────

/** The rings start once the card has begun to rise; each value lands with its own ring. */
const RINGS_DELAY = 120;

/**
 * One score beside the rings: its name, then the number in its ring's colour (rolling into place as the ring sweeps
 * in) with its unit, and a grey word after it ("Ready", "7h 12m", "of 21"); it wraps under the number rather than
 * being cut. The line opens the score's tab.
 */
function ScoreLine({ label, value, unit, word, color, order, spoken, onPress }: { label: string; value: number | null; unit?: string; word?: string | null; color: string; order: number; spoken: string; onPress: () => void }) {
  const c = useCalm();
  const press = usePress(0.97);
  const pressed = usePressStyle(press, { dim: 0.6 });
  const text = value === null ? MISSING : label === "Strain" ? formatValue("decimal1", value) : formatValue("int", value);
  return (
    <PressableView onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={spoken} style={[{ alignSelf: "stretch" }, pressed]}>
      <Txt size={15} lineHeight={19} weight={600} style={{ color: c.ink }}>
        {label}
      </Txt>
      <View importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", columnGap: 5 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          {value === null ? (
            <Txt size={28} lineHeight={32} style={[font.numberAt(28), { color: c.faint }]}>
              {text}
            </Txt>
          ) : (
            <RollingNumber text={text} lineHeight={32} delay={RINGS_DELAY + order * RING_STAGGER} duration={RING_LAND_MS} style={[font.numberAt(28, 800), { color }]} />
          )}
          {unit && value !== null ? (
            <Txt size={15} lineHeight={20} weight={700} style={{ color, marginLeft: 1, marginBottom: 3 }}>
              {unit}
            </Txt>
          ) : null}
        </View>
        {word ? (
          <Txt size={14} lineHeight={20} weight={500} style={{ color: c.sub, marginBottom: 3 }}>
            {word}
          </Txt>
        ) : null}
      </View>
    </PressableView>
  );
}

/**
 * Today's hero, the mockup's: a card with the triple Activity rings on the left (Recovery outermost in its band's
 * colour, Sleep indigo, Strain orange as a share of 21), sweeping in on the ring spring 80 ms apart, and the three
 * values on the right, each opening its tab. Why a score is missing follows under them, then "See data" to Trends.
 */
export function TodayHero({ vm, at, go, asleepMin }: { vm: HomeVM; asleepMin: number | null } & Go) {
  const c = useCalm();
  const { width } = useWindowDimensions();
  const { dials } = vm;
  const recovery = dials.recovery.value;
  const sleep = dials.sleep.value;
  const strain = dials.strain.value;
  const band = recovery === null ? null : recoveryBand(recovery);
  const recoveryInk = band === "yellow" ? c.tintInk.sand : band === "red" ? c.tintInk.rose : c.tintInk.mint;
  // The rings take a little under half the card, never so small the three read as one.
  const size = Math.round(Math.max(116, Math.min(168, (width - 64) * 0.48)));
  const hours = hmText(asleepMin);
  return (
    <CalmSurface padding={16} gap={14}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <Pressable onPress={() => go("/trends")} accessibilityRole="button" accessibilityLabel="Open your data in Trends" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <ScoreRings recovery={recovery} sleep={sleep} strain={strain} size={size} delay={RINGS_DELAY} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
          <ScoreLine
            label="Recovery"
            value={recovery}
            unit="%"
            word={band ? BAND_WORD[band] : null}
            color={recoveryInk}
            order={0}
            spoken={recovery === null ? "Recovery, no score. Opens Health" : `Recovery ${formatValue("int", recovery)} percent, ${BAND_WORD[band!].toLowerCase()}. Opens Health`}
            onPress={() => go(HEALTH_TAB)}
          />
          <ScoreLine
            label="Sleep"
            value={sleep}
            unit="%"
            word={hours}
            color={c.tintInk.lavender}
            order={1}
            spoken={`${sleep === null ? "Sleep, no score" : `Sleep ${formatValue("int", sleep)} percent`}${hours ? `, ${spokenHm(asleepMin)} asleep` : ""}. Opens Sleep`}
            onPress={() => go(at(SLEEP_TAB))}
          />
          <ScoreLine
            label="Strain"
            value={strain}
            word={strain === null ? null : dials.soFar ? "of 21 so far" : "of 21"}
            color={c.tintInk.peach}
            order={2}
            spoken={strain === null ? "Strain, no score. Opens Activity" : `Strain ${formatValue("decimal1", strain)} of 21${dials.soFar ? " so far" : ""}. Opens Activity`}
            onPress={() => go(at(ACTIVITY_TAB))}
          />
        </View>
      </View>
      {/* Why a score is missing, as the dials' reason line said it ("Waiting for last night's sleep to sync"). */}
      {dials.reason && (
        <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
          {reasonCopy(dials.reason.reason, dials.reason.nightsLeft).long}
        </Txt>
      )}
      <View style={{ marginHorizontal: -16, marginBottom: -6 }}>
        <RowRule inset={16} />
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <PillAction label="See data" accessibilityLabel="See data: every metric in Trends" onPress={() => go("/trends")} />
        </View>
      </View>
    </CalmSurface>
  );
}

// ── Week cards: Sleep (the Sleep tab) and Recovery (the Health tab) ─────────

/** The right-hand axis's width: its labels ("8h", "100") sit in it, Apple Health's way. */
const AXIS_W = 30;
/** Recovery's grid lines, in percent. */
const GRID = [100, 66, 33];

/**
 * The week of nights as Apple Health's sleep bars: a rounded bar per night (the night shown in indigo, the others its
 * soft step, a night with no sleep a stub), a dashed line at the goal with its label on the right-hand axis, the
 * weekday letters under the bars. It grows up from the floor once.
 */
function SleepWeek({ week, goalMin }: { week: { day: string; value: number | null }[]; goalMin: number }) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const H = 120;
  const ink = c.tintInk.lavender;
  const soft = mix(ink, c.card, dark ? 0.42 : 0.3);
  const max = Math.max(goalMin * 1.15, ...week.map((p) => p.value ?? 0));
  const yOf = (min: number) => H - (min / max) * H;
  const goalY = yOf(goalMin);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: H }}>
        {/* The goal: a dashed line across the bars, its hours on the axis. */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: AXIS_W, top: goalY - 1, height: 2 }}>
          <Svg width="100%" height={2}>
            <Line x1="0" y1="1" x2="100%" y2="1" stroke={mix(ink, c.card, 0.6)} strokeWidth={1.5} strokeDasharray={[4, 3]} strokeLinecap="round" />
          </Svg>
        </View>
        <Txt size={11} lineHeight={14} weight={600} style={[font.numeric(600), { position: "absolute", right: 0, width: AXIS_W - 4, top: goalY - 7, color: ink, textAlign: "right" }]}>
          {`${Math.round(goalMin / 60)}h`}
        </Txt>
        <Grow mode="rise" height={H} style={{ position: "absolute", left: 0, right: AXIS_W, top: 0 }}>
          <View style={{ height: H, flexDirection: "row", alignItems: "flex-end" }}>
            {week.map((p, i) => {
              const last = i === week.length - 1;
              const v = p.value;
              return (
                <View key={p.day} style={{ flex: 1, alignItems: "center" }}>
                  <View style={{ width: 16, height: v == null || v <= 0 ? 3 : Math.max(16, H - yOf(v)), borderRadius: 8, backgroundColor: v == null || v <= 0 ? c.fill : last ? ink : soft }} />
                </View>
              );
            })}
          </View>
        </Grow>
      </View>
      <View style={{ flexDirection: "row", paddingRight: AXIS_W }}>
        {week.map((p, i) => (
          <Txt key={p.day} size={11} lineHeight={14} weight={600} align="center" style={{ flex: 1, color: i === week.length - 1 ? c.ink : c.sub }}>
            {formatDay(p.day, { weekday: "narrow" })}
          </Txt>
        ))}
      </View>
    </View>
  );
}

/**
 * The Sleep tab's week: the last seven nights' hours asleep (ending on the night shown) as rounded bars against your
 * sleep need, and that night's hours as the headline. The card opens the nights' hours in the chart explorer.
 */
export function SleepWeekCard({ day, goalMin }: { day: string; goalMin: number }) {
  const c = useCalm();
  const router = useRouter();
  const { today } = useApp();
  const openHours = () => router.push(chartHref({ metric: "hours", r: "w", d: day === today ? undefined : day }) as Href);
  const trend = useQuery((ctx) => getTrends("hours", ctx), [], "trends:hours");
  const pts = trend.data?.points.value ?? [];
  const end = pts.findIndex((p) => p.day === day);
  const nights = (end >= 0 ? pts.slice(Math.max(0, end - 6), end + 1) : pts.slice(-7)).slice(-7);
  const asleep = end >= 0 ? (pts[end].value ?? null) : null;
  const short = asleep !== null && asleep < goalMin - 30;
  const subtitle = asleep === null ? "No sleep recorded for this night" : short ? "Short of your sleep need" : "You met your sleep need";
  const t = hm(asleep);
  return (
    <HomeCard icon={Moon} iconTint="lavender" title="This week" onPress={openHours} accessibilityLabel={`This week. This night: ${spokenHm(asleep)}. ${subtitle}. Opens your hours of sleep`} gap={12}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          {t ? (
            <>
              <Txt size={32} lineHeight={38} style={[font.numberAt(32), { color: c.ink }]}>
                {String(t.h)}
              </Txt>
              <Txt size={16} lineHeight={20} weight={600} style={{ color: c.sub }}>
                hr
              </Txt>
              <Txt size={32} lineHeight={38} style={[font.numberAt(32), { color: c.ink, marginLeft: 4 }]}>
                {String(t.m)}
              </Txt>
              <Txt size={16} lineHeight={20} weight={600} style={{ color: c.sub }}>
                min
              </Txt>
            </>
          ) : (
            <Txt size={32} lineHeight={38} style={[font.numberAt(32), { color: c.faint }]}>
              {MISSING}
            </Txt>
          )}
        </View>
        <Txt size={15} lineHeight={20} weight={short ? 600 : 400} style={{ color: short ? c.tintInk.rose : c.sub }}>
          {subtitle}
        </Txt>
      </View>
      {nights.length ? <SleepWeek week={nights} goalMin={goalMin} /> : <View style={{ height: 140, borderRadius: 14, backgroundColor: c.fill }} />}
    </HomeCard>
  );
}

/** A small number with its caps label; with `onPress`, a button to that number's own history. */
function MiniStat({ value, unit, label, color, onPress }: { value: string; unit?: string; label: string; color?: string; onPress?: () => void }) {
  const c = useCalm();
  const press = usePress(0.95);
  const pressed = usePressStyle(press, { dim: 0.55 });
  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Txt size={22} lineHeight={26} style={[font.numberAt(22), { color: color ?? c.ink }]}>
          {value}
        </Txt>
        {unit ? (
          <Txt size={13} lineHeight={17} weight={600} style={{ color: c.sub, marginLeft: 3 }}>
            {unit}
          </Txt>
        ) : null}
      </View>
      <Txt size={13} lineHeight={17} style={{ color: c.sub, marginTop: 1 }}>
        {label}
      </Txt>
    </>
  );
  if (!onPress) return <View style={{ flex: 1, minWidth: 0 }}>{body}</View>;
  return (
    <PressableView onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ""}. Opens its history`} hitSlop={6} style={[{ flex: 1, minWidth: 0 }, pressed]}>
      {body}
    </PressableView>
  );
}

const statText = (s: KeyStat | undefined, fmt: "int" | "decimal1" = "int") => (s?.metric.value == null ? MISSING : formatValue(fmt, s.metric.value));

/**
 * The last seven mornings' Recovery as Apple Health bars: each day's score over its rounded bar in its band's colour
 * (green ready, yellow steady, red low), the shown day solid and the rest their soft step, the weekday under it, and
 * dashed grid lines at 33 and 66 with the axis on the right. Grows up from the floor once.
 */
function RecoveryWeek({ week, shown }: { week: { day: string; recovery: number | null }[]; shown: string }) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const H = 76;
  const ink = (v: number | null) => {
    if (v === null) return c.faint;
    const band = recoveryBand(v);
    return band === "green" ? c.tintInk.mint : band === "yellow" ? c.tintInk.sand : c.tintInk.rose;
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", paddingRight: AXIS_W }}>
        {week.map((p) => (
          <Txt key={p.day} size={12} lineHeight={15} align="center" style={[font.numeric(700), { flex: 1, color: p.recovery === null ? c.faint : ink(p.recovery) }]}>
            {p.recovery === null ? MISSING : formatValue("int", p.recovery)}
          </Txt>
        ))}
      </View>
      <View style={{ height: H }}>
        {/* The faint dashed grid at 33, 66 and 100, Apple Health's, its values on the right-hand axis. */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: AXIS_W, top: 0, height: H }}>
          <Svg width="100%" height={H}>
            {GRID.map((g) => (
              <Line key={g} x1="0" y1={Math.max(0.5, H - (g / 100) * H)} x2="100%" y2={Math.max(0.5, H - (g / 100) * H)} stroke={c.line} strokeWidth={1} strokeDasharray={[2.5, 3]} />
            ))}
          </Svg>
        </View>
        {GRID.map((g) => (
          <Txt key={g} size={10} lineHeight={12} style={[font.numeric(500), { position: "absolute", right: 0, width: AXIS_W - 4, top: H - (g / 100) * H - 6, color: c.sub, textAlign: "right" }]}>
            {String(g)}
          </Txt>
        ))}
        <Grow mode="rise" height={H} style={{ position: "absolute", left: 0, right: AXIS_W, top: 0 }}>
          <View style={{ height: H, flexDirection: "row", alignItems: "flex-end" }}>
            {week.map((p) => {
              const v = p.recovery;
              const here = p.day === shown;
              const color = ink(v);
              return (
                <View key={p.day} style={{ flex: 1, alignItems: "center" }}>
                  <View style={{ width: 16, height: v === null ? 3 : Math.max(16, (v / 100) * H), borderRadius: 8, backgroundColor: v === null ? c.fill : here ? color : mix(color, c.card, dark ? 0.45 : 0.34) }} />
                </View>
              );
            })}
          </View>
        </Grow>
      </View>
      <View style={{ flexDirection: "row", paddingRight: AXIS_W }}>
        {week.map((p) => (
          <Txt key={p.day} size={11} lineHeight={14} weight={p.day === shown ? 700 : 600} align="center" style={{ flex: 1, color: p.day === shown ? c.ink : c.sub }}>
            {formatDay(p.day, { weekday: "narrow" })}
          </Txt>
        ))}
      </View>
    </View>
  );
}

/**
 * The Health tab's Recovery: the score in its band's colour with what it means today and "Details ›" to Recovery, then
 * HRV, resting heart rate and breathing (each to its history), then the last seven mornings as bars.
 */
export function RecoveryCard({ vm, at, go }: { vm: HomeVM } & Go) {
  const c = useCalm();
  const r = vm.dials.recovery;
  const band = r.value === null ? null : recoveryBand(r.value);
  const bandInk = band === "green" ? c.tintInk.mint : band === "yellow" ? c.tintInk.sand : c.tintInk.rose;
  const subtitle = r.value === null ? reasonCopy(r.reason, r.nightsLeft).short : band === "green" ? "Ready to perform" : band === "yellow" ? "Take it steady today" : "Prioritise recovery today";
  const { hrv, rhr, resp } = vm.cardStats;
  return (
    <HomeCard icon={HeartPulse} iconTint="mint" title="Recovery" right={<PillAction label="Details" accessibilityLabel="Recovery details" onPress={() => go(at("/recovery"))} />} gap={16}>
      <View accessible accessibilityLabel={`Recovery: ${r.value === null ? "no score" : `${formatValue("int", r.value)} percent`}. ${subtitle}`} style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Txt size={34} lineHeight={40} style={[font.numberAt(34), { color: band ? bandInk : c.faint }]}>
            {r.value === null ? MISSING : formatValue("int", r.value)}
          </Txt>
          {r.value !== null && (
            <Txt size={17} lineHeight={22} weight={700} style={{ color: bandInk, marginLeft: 1 }}>
              %
            </Txt>
          )}
        </View>
        <Txt size={15} lineHeight={20} weight={band ? 600 : 400} style={{ color: band ? bandInk : c.sub }}>
          {subtitle}
        </Txt>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {/* Each number opens its own history in the chart explorer. */}
        <MiniStat value={statText(hrv)} unit="ms" label="HRV" onPress={() => go(chartHref({ metric: "hrv", r: "m" }))} />
        <MiniStat value={statText(rhr)} unit="bpm" label="Resting HR" onPress={() => go(chartHref({ metric: "rhr", r: "m" }))} />
        <MiniStat value={statText(resp, "decimal1")} unit="rpm" label="Breathing" onPress={() => go(chartHref({ metric: "resp", r: "m" }))} />
      </View>
      <RecoveryWeek week={vm.strainRecovery.slice(-7)} shown={vm.day} />
    </HomeCard>
  );
}
