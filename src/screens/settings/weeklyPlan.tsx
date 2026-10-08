// Settings › Goals › "Weekly plan" (a phone addition, after WHOOP's Weekly Plan): a switch and a whole-number target for
// each weekly habit Home's "Weekly plan" row (in Today's goals) tracks, with the evidence behind each default, and
// "Reset weekly plan".
// Saved as typed (src/state/weeklyPlan.ts); an out-of-range number is shown in red and not saved.
import * as React from "react";
import { View } from "react-native";
import { CalendarCheck, Dumbbell, Flame, Footprints, HeartPulse, Moon, type LucideIcon } from "lucide-react-native";
import { isDefaultPlan, parsePlanTarget, PLAN_DEFAULTS, PLAN_KEYS, PLAN_LIMITS, withPlanEnabled, withPlanTarget, type PlanKey } from "@/core/algorithms/weeklyPlan";
import { PLAN_META } from "@/queries/weeklyPlan";
import { useWeeklyPlan } from "@/state/weeklyPlan";
import { Group, type CalmTint } from "./calmKit";
import { NumberField, TargetField } from "./goals";
import { Body, Divided, OutlineButton } from "./parts";
import { toast } from "./toast";

const ICON: Record<PlanKey, LucideIcon> = { zone13: HeartPulse, zone45: Flame, strength: Dumbbell, steps: Footprints, consistency: CalendarCheck, sleepNeed: Moon };
/** Each habit's family: heart rose, strain peach, activity sky, sleep lavender. */
const TINT: Record<PlanKey, CalmTint> = { zone13: "rose", zone45: "peach", strength: "peach", steps: "sky", consistency: "lavender", sleepNeed: "lavender" };

/** Where each default comes from, under its field. */
const HINT: Record<PlanKey, string> = {
  zone13: "WHO: 150–300 minutes a week. Counted from 40% of heart-rate reserve, a brisk walk, as Halo Age counts it.",
  zone45: "WHO: 75–150 minutes a week, or mix them with moderate minutes.",
  strength: "Strength, weights, HIIT or calisthenics workouts. WHO: 2 or more days a week.",
  steps: "The benefit levels off around 8,000 to 10,000 steps a day (Paluch 2022).",
  consistency: "Your sleep consistency over the last 7 nights. 80% and up is optimal.",
  sleepNeed: "Nights you sleep the need Halo sets for that night.",
};

function PlanField({ k, on, onToggle, text, error, onChange, onBlur }: { k: PlanKey; on: boolean; onToggle: (on: boolean) => void; text: string; error?: string; onChange: (t: string) => void; onBlur: () => void }) {
  const label = PLAN_META[k].label;
  return (
    <TargetField
      icon={ICON[k]}
      tint={TINT[k]}
      label={label}
      switchLabel={`${label} target`}
      on={on}
      onToggle={onToggle}
      unit={PLAN_LIMITS[k].unit}
      error={error}
      hint={HINT[k]}
      field={<NumberField value={text} onChange={onChange} onBlur={onBlur} placeholder={String(PLAN_DEFAULTS.targets[k])} invalid={!!error} label={`${label} target`} decimals={0} />}
    />
  );
}

export function WeeklyPlanSection() {
  const { plan, update, reset } = useWeeklyPlan();
  // A field shows what is being typed until it loses focus; then the stored target.
  const [drafts, setDrafts] = React.useState<Partial<Record<PlanKey, string>>>({});
  const [errors, setErrors] = React.useState<Partial<Record<PlanKey, string>>>({});

  const edit = (k: PlanKey) => (t: string) => {
    setDrafts((d) => ({ ...d, [k]: t }));
    const r = parsePlanTarget(k, t);
    setErrors((e) => ({ ...e, [k]: r.error ?? undefined }));
    if (r.value !== null) void update((p) => withPlanTarget(p, k, r.value!));
  };
  const blur = (k: PlanKey) => () => {
    if (errors[k]) return; // keep the rejected text in view with its error
    setDrafts((d) => {
      const { [k]: _, ...rest } = d;
      return rest;
    });
  };
  const doReset = async () => {
    await reset();
    setDrafts({});
    setErrors({});
    toast("Weekly plan reset to its defaults");
  };

  return (
    <Group title="Weekly plan" padding={20} gap={4}>
      <Body style={{ paddingBottom: 8 }}>Weekly targets for the habits Halo Age scores, tracked on Home as “Weekly plan” in Today’s goals, Monday to Sunday, with a streak for every week you meet them.</Body>
      <Divided top>
        {PLAN_KEYS.map((k) => (
          <PlanField
            key={k}
            k={k}
            on={plan.enabled[k]}
            onToggle={(on) => void update((p) => withPlanEnabled(p, k, on))}
            text={drafts[k] ?? String(plan.targets[k])}
            error={errors[k]}
            onChange={edit(k)}
            onBlur={blur(k)}
          />
        ))}
      </Divided>
      <View style={{ alignItems: "center", paddingTop: 12 }}>
        <OutlineButton onPress={() => void doReset()} disabled={isDefaultPlan(plan)}>
          Reset weekly plan
        </OutlineButton>
      </View>
    </Group>
  );
}
