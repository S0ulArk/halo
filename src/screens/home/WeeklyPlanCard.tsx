// Activity › Goals › "Weekly plan" (a phone addition, after WHOOP's Weekly Plan): a row at the Goals
// card's foot with how many of the week's targets are on track and the plan's streak of weeks. It opens the plan's
// sheet: every target's full row (its value against the target, an 8 px bar with a tick where an even pace would be by
// now, its status and what is left, the days of the week as rounded columns, the last 8 weeks and the streak, and what
// the habit is worth on Pulse Age), each a link to its screen, and ways to Pulse Age and Settings › Goals. With no
// target switched on, the row goes straight to Settings › Goals.
import * as React from "react";
import { Pressable, View } from "react-native";
import { CalendarCheck, Dumbbell, Flame, Footprints, HeartPulse, Moon, type LucideIcon } from "lucide-react-native";
import { DAY, formatDay, rangeLabel } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { getWeeklyPlan, PLAN_KEYS, type PlanKey, type PlanRow, type WeeklyPlanVM } from "@/queries/weeklyPlan";
import { useQuery } from "@/state/app";
import { useWeeklyPlan } from "@/state/weeklyPlan";
import { BottomSheet, Button, SheetSection, SkeletonText, Txt } from "@/ui";
import { useCalm, type CalmPalette, type CalmTint } from "@/ui/calm";
import { onBand, useSoftFill } from "@/ui/components/calmKit";
import { Capsule } from "@/ui/components/Meter";
import { font } from "@/ui/fonts";
import { CheckBadge, FootRow, HeadTile, LINE_BAND, LINE_INSET, LINE_TILE, NumSpan, RowRule, Sentence, WeekColumns, type WeekColumn } from "./controls";
import type { SlotProps } from "./sections";
import { ageText, PLAN_STATUS, planCaption, planTargetText, planValueText } from "./weeklyPlanView";

const PLAN_HREF = "/settings?s=goals";

const PLAN_ICON: Record<PlanKey, LucideIcon> = {
  zone13: HeartPulse,
  zone45: Flame,
  strength: Dumbbell,
  steps: Footprints,
  consistency: CalendarCheck,
  sleepNeed: Moon,
};

/** One pastel per target, by family: the training minutes and strength strain's peach (vigorous the heart's rose), steps activity's sky, sleep lavender. */
const PLAN_TINT: Record<PlanKey, CalmTint> = {
  zone13: "peach",
  zone45: "rose",
  strength: "peach",
  steps: "sky",
  consistency: "lavender",
  sleepNeed: "lavender",
};

/** A status word's ink. */
const statusInk = (c: CalmPalette, it: Pick<PlanRow, "status">) => {
  const st = PLAN_STATUS[it.status];
  return st.tint ? c.tintInk[st.tint] : st.faint ? c.faint : c.sub;
};

const titleOf = (vm: { isCurrentWeek: boolean; monday: string }) => (vm.isCurrentWeek ? "This week" : `Week of ${formatDay(vm.monday, DAY.monthDay)}`);

/** The Goals card's footer row: "2 of 4 on track" and the plan's streak; it opens the sheet (Settings › Goals with no target on). */
export function WeeklyPlanRow({ vm, go }: Pick<SlotProps, "vm" | "go">) {
  const c = useCalm();
  const { plan, ready } = useWeeklyPlan();
  // Until the phone's plan is read the defaults would show the wrong targets: wait for it.
  const q = useQuery((ctx) => (ready ? getWeeklyPlan(vm.day, ctx, plan) : Promise.resolve(null)), [vm.day, plan, ready], ready ? `weeklyplan:${vm.day}:${JSON.stringify(plan)}` : undefined);
  const data = q.data && q.data.day === vm.day ? q.data : undefined;
  const [open, setOpen] = React.useState(false);
  const keys = PLAN_KEYS.filter((k) => plan.enabled[k]);

  if (ready && keys.length === 0)
    return (
      <FootRow icon={CalendarCheck} tint="mint" title="Weekly plan" onPress={() => go(PLAN_HREF)} accessibilityLabel="Weekly plan: no weekly targets switched on. Set weekly targets">
        <Sentence>No weekly targets switched on</Sentence>
        <Txt size={14} lineHeight={19} weight={600} style={{ color: c.teal }}>
          Set weekly targets
        </Txt>
      </FootRow>
    );

  const all = !!data && data.items.length > 0 && data.onTrack >= data.items.length;
  const streak = data?.planStreak.current ?? 0;
  return (
    <>
      <FootRow
        icon={CalendarCheck}
        tint="mint"
        title="Weekly plan"
        onPress={() => setOpen(true)}
        accessibilityLabel={
          data
            ? `Weekly plan, ${data.isCurrentWeek ? "this week" : titleOf(data)}: ${data.onTrack} of ${data.items.length} on track${streak > 0 ? `. ${streakText(streak)}` : ""}. Opens every target`
            : "Weekly plan. Opens every target"
        }
      >
        {data ? (
          <Sentence>
            {data.isCurrentWeek ? "" : `${titleOf(data)} · `}
            <NumSpan color={all ? c.tintInk.mint : undefined}>{String(data.onTrack)}</NumSpan>
            {" of "}
            <NumSpan color={all ? c.tintInk.mint : undefined}>{String(data.items.length)}</NumSpan>
            {" on track"}
            {streak === 1 ? " · every target met last week" : streak > 1 ? (
              <>
                {" · "}
                <NumSpan>{String(streak)}</NumSpan>
                {"-week streak"}
              </>
            ) : null}
          </Sentence>
        ) : (
          <SkeletonText size={14} lineHeight={19} width="60%" />
        )}
      </FootRow>
      <PlanSheet
        open={open}
        onClose={() => setOpen(false)}
        data={data}
        keys={keys}
        go={(href) => {
          setOpen(false);
          go(href);
        }}
      />
    </>
  );
}

/** "Every target met 3 weeks running", for a screen reader. */
const streakText = (weeks: number) => (weeks === 1 ? "Every target met last week" : `Every target met ${weeks} weeks running`);

/** An 8 px capsule filled to the target's share, with a tick where an even pace would be by now. */
function PaceBar({ it }: { it: PlanRow }) {
  const c = useCalm();
  const ink = c.tintInk[PLAN_TINT[it.key]];
  const pace = it.expected !== null && it.status !== "done" && it.status !== "missed" && it.target > 0 ? Math.min(1, it.expected / it.target) : null;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(it.progress * 100) }}>
      <Capsule value={it.progress} color={it.done ? ink : alpha(ink, 0.85)} height={8} />
      {pace !== null && pace > 0 && pace < 1 && (
        <View pointerEvents="none" style={{ position: "absolute", left: `${pace * 100}%`, top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: c.ink, opacity: 0.6 }} />
      )}
    </View>
  );
}

/** "Every target met 3 weeks running", leading the sheet while the plan's streak runs. */
function PlanStreak({ weeks }: { weeks: number }) {
  const c = useCalm();
  return (
    <View style={{ paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <HeadTile icon={Flame} color={c.orange} bg={c.tint.peach} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {weeks === 1 ? (
          <Sentence>Every target met last week</Sentence>
        ) : (
          <Sentence>
            {"Every target met "}
            <NumSpan>{String(weeks)}</NumSpan>
            {" weeks running"}
          </Sentence>
        )}
      </View>
    </View>
  );
}

/** The week as rounded columns, Monday to Sunday, full colour on days that met their share; today's letter in ink. */
function DayBars({ it, day }: { it: PlanRow; day: string }) {
  const max = Math.max(1, ...it.days.map((d) => d.value ?? 0));
  // Sleep need and consistency draw met/unmet days full height; the rest scale to the week's biggest day.
  const frac = (v: number | null, met: boolean) => (v === null ? null : it.key === "sleepNeed" || it.key === "consistency" ? (met ? 1 : 0.4) : Math.min(1, v / max));
  const cols: WeekColumn[] = it.days.map((d) => ({ day: d.day, frac: frac(d.value, d.met), met: d.met }));
  return <WeekColumns cols={cols} tint={PLAN_TINT[it.key]} height={32} current={day} label={`${it.label}, this week: met on ${it.days.filter((d) => d.met).length} days`} />;
}

/** The last 8 weeks as dots, oldest first: filled when the target was met. */
function WeekDots({ it }: { it: PlanRow }) {
  const c = useCalm();
  const ink = c.tintInk[PLAN_TINT[it.key]];
  const met = it.weeks.filter((w) => w.met).length;
  return (
    <View accessible accessibilityLabel={`Met in ${met} of the last ${it.weeks.length} weeks`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Txt size={13} lineHeight={18} style={{ color: c.sub, flex: 1, minWidth: 0 }}>
        {"Last "}
        <NumSpan size={13} color={c.sub}>
          {String(it.weeks.length)}
        </NumSpan>
        {" weeks"}
      </Txt>
      <View style={{ flexDirection: "row", gap: 5 }}>
        {it.weeks.map((w) => (
          <View key={w.monday} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: w.met ? ink : "transparent", borderWidth: 2, borderColor: w.met ? ink : w.value === null ? c.line : alpha(ink, 0.45) }} />
        ))}
      </View>
    </View>
  );
}

/** The status word's column beside a bar: as wide as the widest word ("On pace", "No data") at 12 px bold. */
const STATUS_W = 52;

/** One target's full row in the sheet. */
function PlanLine({ it, day, onOpen }: { it: PlanRow; day: string; onOpen: () => void }) {
  const c = useCalm();
  const fill = useSoftFill();
  const tint = PLAN_TINT[it.key];
  const ink = c.tintInk[tint];
  const age = ageText(it.ageYears);
  const captionInk = it.status === "done" || it.status === "behind" || it.status === "missed" ? statusInk(c, it) : c.sub;
  return (
    <View style={{ paddingVertical: 16, gap: 12 }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={`${it.label}: ${planValueText(it)} ${planTargetText(it)}. ${planCaption(it)}`}
        style={({ pressed }) => ({ marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, backgroundColor: pressed ? fill : "transparent", flexDirection: "row", alignItems: "flex-start", gap: 12 })}
      >
        {/* The tile on the name and the caption's first line, the value on the name's line, whatever wraps. */}
        <View style={{ marginTop: onBand(LINE_BAND, LINE_TILE) }}>
          <HeadTile icon={PLAN_ICON[it.key]} color={ink} bg={c.tint[tint]} size={LINE_TILE} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
            {it.label}
          </Txt>
          <Txt size={13} lineHeight={18} weight={captionInk === c.sub ? 400 : 600} style={{ color: captionInk, marginTop: 2 }}>
            {planCaption(it)}
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
          <Txt size={22} lineHeight={26} align="right" style={[font.numeric(700), { color: ink }]}>
            {planValueText(it)}
          </Txt>
          <Txt size={12} lineHeight={16} weight={500} align="right" style={{ color: c.sub }}>
            {planTargetText(it)}
          </Txt>
        </View>
      </Pressable>
      {/* Everything under the head in the name's column. */}
      <View style={{ marginLeft: LINE_INSET, gap: 12 }}>
        {/* The bar with the target's status word beside it (a check once it is done), as Home's tiles had it; the word's
            column has one width on every row, so the bars end at one x. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <PaceBar it={it} />
          </View>
          <View style={{ minWidth: STATUS_W, alignItems: "flex-end", flexShrink: 0 }}>
            {it.done ? (
              <CheckBadge size={20} />
            ) : (
              <Txt size={12} lineHeight={16} weight={700} align="right" style={{ color: statusInk(c, it) }}>
                {PLAN_STATUS[it.status].word}
              </Txt>
            )}
          </View>
        </View>
        <DayBars it={it} day={day} />
        <WeekDots it={it} />
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Txt size={13} lineHeight={18} style={{ color: c.sub, flex: 1, minWidth: 0 }}>
            {it.detail}
          </Txt>
          {age && (
            <Txt size={13} lineHeight={18} weight={600} style={{ color: it.ageYears! > 0.05 ? c.tintInk.sand : it.ageYears! < -0.05 ? c.tintInk.mint : c.sub, flexShrink: 0 }}>
              {"Halo Age "}
              <NumSpan size={13} color={it.ageYears! > 0.05 ? c.tintInk.sand : it.ageYears! < -0.05 ? c.tintInk.mint : c.sub}>
                {age}
              </NumSpan>
            </Txt>
          )}
        </View>
      </View>
    </View>
  );
}

function PlanSheet({ open, onClose, data, keys, go }: { open: boolean; onClose: () => void; data: WeeklyPlanVM | undefined; keys: PlanKey[]; go: (href: string) => void }) {
  const c = useCalm();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={data ? titleOf(data) : "This week"}
      description={data ? `${rangeLabel(data.monday, data.sunday)} · ${data.onTrack} of ${data.items.length} on track` : undefined}
      footer={
        <>
          <Button size="sheet" onPress={() => go(PLAN_HREF)}>
            Edit weekly targets
          </Button>
          <Button size="sheet" variant="outline-pill" onPress={() => go("/health/healthspan")}>
            Open Halo Age
          </Button>
        </>
      }
    >
      {data ? (
        <View>
          {data.planStreak.current > 0 && (
            <>
              <PlanStreak weeks={data.planStreak.current} />
              <RowRule inset={0} />
            </>
          )}
          {data.items.map((it, i) => (
            <React.Fragment key={it.key}>
              {i > 0 && <RowRule inset={0} />}
              <PlanLine it={it} day={data.day} onOpen={() => go(it.href)} />
            </React.Fragment>
          ))}
          <View style={{ marginTop: 20, gap: 8 }}>
            <SheetSection>Why these</SheetSection>
            <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
              These are the habits Halo Age scores. The defaults follow the WHO’s 150 moderate or 75 vigorous minutes and two strength days a week, about 8,000 steps a day, and a steady sleep schedule. A tick on a bar marks where an even pace would be by now.
            </Txt>
          </View>
        </View>
      ) : (
        <View style={{ gap: 16, paddingVertical: 8 }}>
          {keys.map((k) => (
            <SkeletonText key={k} role="value" chars={8} />
          ))}
        </View>
      )}
    </BottomSheet>
  );
}
