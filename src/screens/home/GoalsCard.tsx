// The Activity tab's "Today’s goals" (a phone-only addition, Fitbit-style; Today shows them at a glance, GoalsGlance), Calm: a white card with "3 of 7 done" as a
// pill beside its title, then a two-column grid of pastel tiles, one per goal switched on in Settings › Goals (the
// goal's icon tile, its name, value over target with the value in the family's ink, an 8 px capsule; a check badge
// once it is met), then the week's Active Zone Minutes as seven rounded columns. The head and body open a sheet with
// every goal's full row (value, target, progress, the last 7 days, streak) and a way to Settings › Goals. Two rows sit
// at the card's foot, each its own tap target: Activity (the day's steps and calories burned beside their 30-day
// averages; opens Strain) and the Weekly plan (WeeklyPlanCard.tsx; opens its sheet). A goal first met while Home is
// open gets a toast.
import * as React from "react";
import { Pressable, View } from "react-native";
import { Activity, Check, Moon, Target } from "lucide-react-native";
import { dayLabel, formatValue, MISSING, NBSP } from "@/lib/format";
import { getGoalsDay, GOAL_KEYS, GOAL_META, type GoalKey, type GoalRow, type GoalsDayVM, type GoalsWeek } from "@/queries/goals";
import { useQuery } from "@/state/app";
import { useGoals, type Goals } from "@/state/goals";
import { accentFamily, BottomSheet, Button, SheetSection, SkeletonText, Txt } from "@/ui";
import { HaloRing } from "@/ui/components/Halo";
import { useCalm, type CalmTint } from "@/ui/calm";
import { familyTint, onBand } from "@/ui/components/calmKit";
import { Capsule } from "@/ui/components/Meter";
import { TileLabel } from "@/ui/components/TileRow";
import { font } from "@/ui/fonts";
import { toast } from "../settings/toast";
import { CardButton, CheckBadge, FootRow, HeadTile, HomeCard, LINE_BAND, LINE_INSET, LINE_TILE, NumSpan, ProgressPill, RowRule, TwoUp, WeekColumns, type WeekColumn } from "./controls";
import type { SlotProps } from "./sections";
import { STAT_ICON } from "./view";
import { WeeklyPlanRow } from "./WeeklyPlanCard";
import { ACTIVITY_TAB, SLEEP_TAB } from "./tabs";

/** A goal's pastel: its metric family's (activity sky, sleep lavender, water the body's sand). */
const goalTint = (key: GoalKey): CalmTint => familyTint(accentFamily(key) ?? "activity") ?? "sky";
const goalIcon = (key: GoalKey) => (key === "sleep" ? Moon : STAT_ICON[key]) ?? Target;

const GOALS_HREF = "/settings?s=goals";

const unitOf = (g: { unit?: string }) => (g.unit ? `${NBSP}${g.unit}` : "");
const valueText = (g: Pick<GoalRow, "format" | "value">) => (g.value === null ? MISSING : formatValue(g.format, g.value));
const targetText = (g: Pick<GoalRow, "format" | "target" | "unit">) => `${formatValue(g.format, g.target)}${unitOf(g)}`;

/** Goals met for the first time while the app is open, so a refresh that passes the target toasts once. */
const celebrated = new Set<string>();

function useCelebrate(data: GoalsDayVM | undefined) {
  const prev = React.useRef<{ day: string; done: Partial<Record<GoalKey, boolean>> } | null>(null);
  React.useEffect(() => {
    if (!data) return;
    const done: Partial<Record<GoalKey, boolean>> = {};
    for (const g of data.goals) done[g.key] = g.done;
    const p = prev.current;
    // Only a goal seen open earlier counts: the first load of an already-met goal is not news.
    if (p && p.day === data.day && data.isToday)
      for (const g of data.goals) {
        const id = `${data.day}:${g.key}`;
        if (g.done && p.done[g.key] === false && !celebrated.has(id)) {
          celebrated.add(id);
          toast(`${g.goalName} reached 🎉`);
        }
      }
    prev.current = { day: data.day, done };
  }, [data]);
}

export function GoalsCard({ vm, at, go }: SlotProps) {
  const { goals, ready } = useGoals();
  // Until the phone's goals are read the defaults would score the day wrongly (and could toast): wait for them.
  const q = useQuery((ctx) => (ready ? getGoalsDay(vm.day, ctx, goals) : Promise.resolve(null)), [vm.day, goals, ready], ready ? `goals:${vm.day}:${JSON.stringify(goals)}` : undefined);
  const data = q.data && q.data.day === vm.day ? q.data : undefined;
  const [open, setOpen] = React.useState(false);
  useCelebrate(data);

  const keys = GOAL_KEYS.filter((k) => goals.enabled[k]);
  const title = vm.isToday ? "Today’s goals" : "Goals";
  const footer = (
    <>
      <ActivityRow vm={vm} />
      <WeeklyPlanRow vm={vm} go={go} />
    </>
  );
  if (ready && keys.length === 0)
    return (
      <HomeCard icon={Target} title={title} subtitle="No goals switched on." gap={16} footer={footer}>
        <CardButton icon={Target} label="Set goals" onPress={() => go(GOALS_HREF)} style={{ alignSelf: "flex-start" }} />
      </HomeCard>
    );

  const left = data ? data.goals.length - data.done : 0;
  const subtitle = data ? (left === 0 ? "Every goal reached" : `${left} to go${vm.isToday ? " today" : ""} · tap for streaks`) : undefined;
  return (
    <>
      <HomeCard
        icon={Target}
        title={title}
        subtitle={subtitle}
        right={data && <ProgressPill done={data.done} total={data.goals.length} word="done" />}
        onPress={() => setOpen(true)}
        accessibilityLabel={data ? `${title}: ${data.done} of ${data.goals.length} done. Opens every goal with its streak` : title}
        footer={footer}
      >
        {data ? <Tiles goals={data.goals} /> : <TilesSkeleton keys={keys} />}
        {data?.week && <WeekStrip week={data.week} dayTarget={goals.targets.azm} />}
      </HomeCard>
      <GoalsSheet
        open={open}
        onClose={() => setOpen(false)}
        data={data}
        goals={goals}
        day={vm.day}
        today={vm.today}
        onEdit={() => {
          setOpen(false);
          go(GOALS_HREF);
        }}
      />
    </>
  );
}

/**
 * Today's goals at a glance (the Today tab): one ring per goal switched on, filling toward its target in the goal's
 * pastel (a check once met), its value under it and its short name. The card opens the Activity tab, where each goal
 * is in full with its week, the day's activity and the weekly plan.
 */
export function GoalsGlance({ vm, at, go }: SlotProps) {
  const { goals, ready } = useGoals();
  const q = useQuery((ctx) => (ready ? getGoalsDay(vm.day, ctx, goals) : Promise.resolve(null)), [vm.day, goals, ready], ready ? `goals:${vm.day}:${JSON.stringify(goals)}` : undefined);
  const data = q.data && q.data.day === vm.day ? q.data : undefined;
  useCelebrate(data);
  const keys = GOAL_KEYS.filter((k) => goals.enabled[k]);
  const title = vm.isToday ? "Today’s goals" : "Goals";
  // The card leads to every goal in full (the Activity tab's goals); each ring to its own detail (ringHref).
  const open = () => go(at(`${ACTIVITY_TAB}#goals`));
  if (ready && keys.length === 0)
    return (
      <HomeCard icon={Target} title={title} subtitle="No goals switched on." gap={16}>
        <CardButton icon={Target} label="Set goals" onPress={() => go(GOALS_HREF)} style={{ alignSelf: "flex-start" }} />
      </HomeCard>
    );
  return (
    <HomeCard
      icon={Target}
      title={title}
      subtitle={data ? (data.done === data.goals.length ? "Every goal reached" : "Tap for every goal in full") : undefined}
      right={data && <ProgressPill done={data.done} total={data.goals.length} word="done" />}
      onPress={open}
      accessibilityLabel={data ? `${title}: ${data.done} of ${data.goals.length} done. Opens Activity` : title}
      gap={18}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 16 }}>
        {data ? data.goals.map((g, i) => <GoalRing key={g.key} g={g} day={data.day} order={i} onPress={() => go(at(ringHref(g.key)))} />) : keys.map((k) => <GoalRingSkeleton key={k} />)}
      </View>
    </HomeCard>
  );
}

const RING = 56;
const RING_W = 5;

/**
 * Where a goal's ring leads: its own detail. Zone minutes to the Activity tab's "Time in zones", sleep to the Sleep tab,
 * the rest to their metric's page (steps, distance, floors, active minutes and calories, water).
 */
const ringHref = (key: GoalKey) => (key === "azm" ? `${ACTIVITY_TAB}#zones` : key === "sleep" ? SLEEP_TAB : GOAL_META[key].href);

/**
 * One goal as a ring: the track in its pastel, the progress drawing on in its ink (staggered by `order`, on the UI
 * thread), its icon (a check once met) in the middle. A goal met pulses once a day: a ring that swells and fades.
 */
function GoalRing({ g, day, order, onPress }: { g: GoalRow; day: string; order: number; onPress: () => void }) {
  const c = useCalm();
  const tint = goalTint(g.key);
  const ink = c.tintInk[tint];
  const p = Math.max(0, Math.min(1, g.progress));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${g.label}: ${valueText(g)}${unitOf(g)} of ${targetText(g)}${g.done ? ", done" : ""}. Opens ${g.label}`}
      style={({ pressed }) => ({ width: "25%", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}
    >
      <HaloRing size={RING} stroke={RING_W} progress={p} track={c.tint[tint]} color={ink} colors={c.vivid[tint]} delay={order * 90} celebrateKey={g.done ? `${day}:${g.key}` : null}>
        {g.done ? <Check size={20} color={ink} strokeWidth={2.5} /> : React.createElement(goalIcon(g.key), { size: 20, color: ink, strokeWidth: 1.75 })}
      </HaloRing>
      <Txt size={14} lineHeight={17} style={[font.numeric(600), { color: g.value === null ? c.faint : c.ink }]}>
        {valueText(g)}
      </Txt>
      <Txt size={11} lineHeight={14} weight={600} align="center" style={{ color: c.sub, letterSpacing: 1 }}>
        {g.short.toUpperCase()}
      </Txt>
    </Pressable>
  );
}

function GoalRingSkeleton() {
  const c = useCalm();
  return (
    <View style={{ width: "25%", alignItems: "center", gap: 6 }}>
      <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: RING_W, borderColor: c.chip }} />
      <SkeletonText size={14} lineHeight={17} width={40} />
      <SkeletonText size={11} lineHeight={14} width={36} />
    </View>
  );
}

/**
 * The day's activity as a row at the goals' foot: steps and calories burned, each with its 30-day average beside it
 * (Home's own numbers, whatever My Dashboard shows). It lives on the Activity tab, whose page breaks the calories down
 * further down, so the row itself is information, not a link.
 */
function ActivityRow({ vm }: Pick<SlotProps, "vm">) {
  const c = useCalm();
  const { steps, calories } = vm.cardStats;
  const n = (v: number | null | undefined) => formatValue("grouped", v);
  const line = (value: string, unit: string, avg: string) => (
    <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
      <NumSpan>{value}</NumSpan>
      {`${NBSP}${unit}`}
      <Txt size={13} lineHeight={19} style={{ color: c.faint }}>
        {" · avg "}
      </Txt>
      <NumSpan size={13} color={c.sub}>
        {avg}
      </NumSpan>
    </Txt>
  );
  const s = n(steps.metric.value);
  const k = n(calories.metric.value);
  const sAvg = n(steps.average);
  const kAvg = n(calories.average);
  return (
    <FootRow
      icon={Activity}
      tint="sky"
      title="Activity"
      accessibilityLabel={`Activity${vm.isToday ? " so far today" : ""}: ${s} steps, ${k} kilocalories burned. 30-day average ${sAvg} steps, ${kAvg} kilocalories`}
    >
      {line(s, "steps", sAvg)}
      {line(k, "kcal", kAvg)}
    </FootRow>
  );
}

function Tiles({ goals }: { goals: GoalRow[] }) {
  return <TwoUp items={goals} keyOf={(g) => g.key} render={(g) => <GoalTile g={g} />} />;
}

function TilesSkeleton({ keys }: { keys: GoalKey[] }) {
  const c = useCalm();
  return (
    <TwoUp
      items={keys}
      keyOf={(k) => k}
      render={(k) => {
        const tint = goalTint(k);
        return (
          <View style={{ flex: 1, borderRadius: 20, backgroundColor: c.tint[tint], padding: 14, gap: 10 }}>
            <HeadTile icon={goalIcon(k)} color={c.tintInk[tint]} bg={c.chip} size={36} />
            <TileLabel>
              <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
                {GOAL_META[k].short}
              </Txt>
            </TileLabel>
            <SkeletonText role="value" size={22} lineHeight={26} chars={7} />
            <Capsule value={null} color="transparent" height={8} style={{ marginTop: "auto", backgroundColor: c.chip }} />
          </View>
        );
      }}
    />
  );
}

/** "444 / 10,000 steps": the value in the numeric face in the family's ink, the target small and grey. Wraps, never cut. */
function ValueOverTarget({ value, target, color, size = 22 }: { value: string; target: string; color: string; size?: number }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={size + 4} style={[font.numberAt(size), { color }]}>
      {value}
      <Txt size={13} lineHeight={size + 4} weight={500} style={{ color: c.sub }}>
        {` / ${target}`}
      </Txt>
    </Txt>
  );
}

/**
 * One goal: its icon tile (a check badge once met, else the percent), the name, value over target, an 8 px capsule.
 * The names of a row share one height (TileLabel), so the two values start on one line; the capsules sit at the foot.
 */
function GoalTile({ g }: { g: GoalRow }) {
  const c = useCalm();
  const tint = goalTint(g.key);
  const ink = c.tintInk[tint];
  const pct = g.value === null ? null : Math.round(g.progress * 100);
  const value = valueText(g);
  const target = targetText(g);
  return (
    <View
      accessible
      accessibilityLabel={`${g.label}: ${value} of ${target}${g.done ? ", reached" : g.partial ? ", so far today" : ""}`}
      style={{ flex: 1, borderRadius: 20, backgroundColor: c.tint[tint], padding: 14, gap: 10 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <HeadTile icon={goalIcon(g.key)} color={ink} bg={c.chip} size={36} />
        {g.done ? (
          <CheckBadge />
        ) : (
          pct !== null && (
            <Txt size={13} lineHeight={16} style={[font.numeric(600), { color: c.sub }]}>
              {`${pct}%`}
            </Txt>
          )
        )}
      </View>
      <TileLabel>
        <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
          {g.short}
        </Txt>
      </TileLabel>
      <ValueOverTarget value={value} target={target} color={ink} />
      <Capsule value={g.done ? 1 : g.value === null ? null : g.progress} color={ink} height={8} style={{ marginTop: "auto", backgroundColor: c.chip }} />
    </View>
  );
}

/** The week's Active Zone Minutes: "96 / 150 min" and a rounded column per day, Monday to Sunday, full on days at the daily goal. */
function WeekStrip({ week, dayTarget }: { week: GoalsWeek; dayTarget: number }) {
  const c = useCalm();
  const tint = goalTint("azm");
  const max = Math.max(dayTarget, 1, ...week.days.map((d) => d.value ?? 0));
  const cols: WeekColumn[] = week.days.map((d) => ({ day: d.day, frac: d.value === null ? null : Math.min(1, d.value / max), met: d.value !== null && d.value >= dayTarget, value: d.value === null ? null : String(Math.round(d.value)) }));
  const total = Math.round(week.total);
  return (
    <View style={{ gap: 14, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.line }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
            Active Zone Minutes
          </Txt>
          <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
            This week, Monday to Sunday
          </Txt>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {week.done && <CheckBadge size={20} />}
          <ValueOverTarget value={String(total)} target={`${week.target}${NBSP}min`} color={c.tintInk[tint]} size={20} />
        </View>
      </View>
      <WeekColumns cols={cols} tint={tint} height={44} current={week.to} label={`Active Zone Minutes this week: ${total} of ${week.target} minutes`} />
    </View>
  );
}

/**
 * One goal's full row in the sheet: its icon tile, name and streak, value over target (on the name's line) and the
 * check's column (kept on every row, so the values share one right edge), then, between the name's column and the
 * values' edge, a capsule with the percent and the last 7 days.
 */
function GoalLine({ g }: { g: GoalRow }) {
  const c = useCalm();
  const tint = goalTint(g.key);
  const ink = c.tintInk[tint];
  const value = valueText(g);
  const target = targetText(g);
  const met = g.history.filter((h) => h.done).length;
  const pct = Math.round(g.progress * 100);
  const caption = g.done ? (g.streak > 1 ? `Reached · ${g.streak}-day streak` : "Reached") : g.streak > 0 ? `${g.streak}-day streak on the line` : `Met ${met} of the last 7 days`;
  const cols: WeekColumn[] = g.history.map((h) => ({ day: h.day, frac: h.progress, met: h.done }));
  return (
    <View style={{ paddingVertical: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ marginTop: onBand(LINE_BAND, LINE_TILE) }}>
          <HeadTile icon={goalIcon(g.key)} color={ink} bg={c.tint[tint]} size={LINE_TILE} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
            {g.label}
          </Txt>
          <Txt size={13} lineHeight={18} weight={g.done || g.streak > 0 ? 600 : 400} style={{ color: g.done ? c.tintInk.mint : g.streak > 0 ? c.tintInk.sand : c.sub, marginTop: 2 }}>
            {caption}
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
          <Txt size={22} lineHeight={26} align="right" style={[font.numeric(700), { color: ink }]}>
            {value}
          </Txt>
          <Txt size={12} lineHeight={16} weight={500} align="right" style={{ color: c.sub }}>
            {`of ${target}`}
          </Txt>
        </View>
        <View style={{ width: 24, height: 24, marginTop: onBand(LINE_BAND, 24) }}>{g.done && <CheckBadge />}</View>
      </View>
      {/* In the name's column, ending where the values do (the check keeps its column). */}
      <View style={{ marginLeft: LINE_INSET, marginRight: 24 + 12, gap: 14 }}>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Capsule value={g.done ? 1 : g.progress} color={ink} height={8} style={{ flex: 1 }} />
          <Txt size={13} lineHeight={18} align="right" style={[font.numeric(600), { color: g.done ? c.tintInk.mint : c.sub, minWidth: 40 }]}>
            {g.value === null ? MISSING : `${pct}%`}
          </Txt>
        </View>
        <WeekColumns cols={cols} tint={tint} height={32} current={g.history[g.history.length - 1]?.day ?? ""} label={`${g.label}, last 7 days: met ${met} of 7`} />
      </View>
    </View>
  );
}

function GoalsSheet({
  open,
  onClose,
  data,
  goals,
  day,
  today,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  data: GoalsDayVM | undefined;
  goals: Goals;
  day: string;
  today: string;
  onEdit: () => void;
}) {
  const c = useCalm();
  const off = GOAL_KEYS.filter((k) => !goals.enabled[k]);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Goals"
      description={dayLabel(day, today)}
      footer={
        <Button size="sheet" onPress={onEdit}>
          Edit goals
        </Button>
      }
    >
      {data ? (
        <View>
          {data.goals.map((g, i) => (
            <React.Fragment key={g.key}>
              {i > 0 && <RowRule inset={0} />}
              <GoalLine g={g} />
            </React.Fragment>
          ))}
          {data.week && (
            <View style={{ paddingBottom: 8 }}>
              <WeekStrip week={data.week} dayTarget={goals.targets.azm} />
            </View>
          )}
          {off.length > 0 && (
            <View style={{ marginTop: 20, gap: 8 }}>
              <SheetSection>Off</SheetSection>
              <Txt size={14} lineHeight={19} style={{ color: c.sub }}>{`${off.map((k) => GOAL_META[k].label).join(", ")}. Switch them on in Settings › Goals.`}</Txt>
            </View>
          )}
        </View>
      ) : (
        <View style={{ gap: 16, paddingVertical: 8 }}>
          {GOAL_KEYS.filter((k) => goals.enabled[k]).map((k) => (
            <SkeletonText key={k} role="value" chars={8} />
          ))}
        </View>
      )}
    </BottomSheet>
  );
}
