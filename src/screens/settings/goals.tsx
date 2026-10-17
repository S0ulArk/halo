// Settings › Goals `/settings?s=goals` (a phone-only addition): Fitbit-style daily goals, each a row with its coloured
// icon square and a switch and, while on, its numeric target in its unit under the name; the weekly Active Zone Minutes
// target; and "Reset to Fitbit defaults". Saved as typed (src/state/goals.ts), so Home's rings and the Trends goal lines
// follow at once; an out-of-range number is shown in red and not saved. Settings › Goals shows the Weekly plan's targets
// after these (./weeklyPlan.tsx). The groups rise into place as the page opens; a target fades in when its switch turns on.
import * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Moon, type LucideIcon } from "lucide-react-native";
import { GOAL_KEYS, GOAL_META, type GoalKey } from "@/queries/goals";
import type { Units } from "@/lib/units";
import { DEFAULT_GOALS, isDefaultGoals, parseTarget, targetLimit, targetText, useGoals, withEnabled, withTarget, type TargetKey } from "@/state/goals";
import { useUnits } from "@/state/units";
import { Txt } from "@/ui";
import { reduceMotionNow } from "@/ui/motion/system";
import { RiseEach } from "@/ui/motion/Rise";
import { STAT_ICON } from "../home/view";
import { CalmInput, CalmSwitch, useCalm, type CalmTint } from "./calmKit";
import { ButtonRow, InsetGroup, ROW_ICON, RowIcon } from "./list";
import { toast } from "./toast";

const HINT: Partial<Record<TargetKey, string>> = {
  sleep: "Blank follows Halo’s sleep need for the night.",
  azmWeek: "Fitbit counts moderate minutes once and vigorous or peak minutes twice.",
};

/** Each goal's family: activity blue, water (nutrition) sand, sleep indigo. */
const GOAL_TINT: Partial<Record<GoalKey, CalmTint>> = { water: "sand", sleep: "lavender" };

/** A goal's target: a compact field with the number in tabular figures, in the quiet fill of the card. */
export function NumberField({ value, onChange, onBlur, placeholder, invalid, label, decimals }: { value: string; onChange: (v: string) => void; onBlur: () => void; placeholder: string; invalid: boolean; label: string; decimals: number }) {
  return (
    <CalmInput
      value={value}
      onChangeText={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      keyboardType={decimals ? "decimal-pad" : "number-pad"}
      accessibilityLabel={label}
      invalid={invalid}
      on="card"
      numeric
      style={{ width: 132, minHeight: 44, borderRadius: 11 }}
    />
  );
}

/**
 * One habit or goal with a target, as an iOS row: its coloured icon square, the name and its switch; while on, the
 * target field with its unit under the name, and a hint (or a red error) under that. Shared by Daily goals and the
 * Weekly plan.
 */
export function TargetField({
  icon,
  tint,
  label,
  switchLabel,
  on,
  onToggle,
  field,
  unit,
  error,
  hint,
}: {
  icon: LucideIcon | undefined;
  tint: CalmTint;
  label: string;
  switchLabel: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  field: React.ReactNode;
  unit: string;
  error?: string;
  hint?: string;
}) {
  const c = useCalm();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}>
      <View style={{ minHeight: 31, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ opacity: on ? 1 : 0.45 }}>
          <RowIcon icon={icon} tint={tint} />
        </View>
        <Txt size={16} lineHeight={21} style={{ flex: 1, minWidth: 0, color: c.ink }}>
          {label}
        </Txt>
        <CalmSwitch value={on} onChange={onToggle} label={switchLabel} />
      </View>
      {on && (
        <Animated.View entering={reduceMotionNow() ? undefined : FadeIn.duration(180)} style={{ paddingLeft: ROW_ICON + 12, gap: 6, paddingBottom: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {field}
            <Txt size={15} lineHeight={20} style={{ flex: 1, minWidth: 0, color: c.sub }}>
              {unit}
            </Txt>
          </View>
          {error ? (
            <Txt size={13} lineHeight={18} accessibilityRole="alert" style={{ color: c.system.red }}>
              {error}
            </Txt>
          ) : hint ? (
            <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
              {hint}
            </Txt>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

type FieldProps = {
  icon: LucideIcon | undefined;
  tint: CalmTint;
  label: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  targetKey: TargetKey;
  text: string;
  error?: string;
  onChange: (t: string) => void;
  onBlur: () => void;
};

/**
 * One goal: its switch on the name's row and, while on, the target field with its unit and a hint or error under it.
 * Distance and water are typed in the person's units (km or mi, ml or fl oz).
 */
function GoalField({ icon, tint, label, on, onToggle, targetKey, text, error, onChange, onBlur, units }: FieldProps & { units: Units }) {
  const l = targetLimit(targetKey, units);
  return (
    <TargetField
      icon={icon}
      tint={tint}
      label={label}
      switchLabel={`${label} goal`}
      on={on}
      onToggle={onToggle}
      unit={l.unit}
      error={error}
      hint={HINT[targetKey]}
      field={<NumberField value={text} onChange={onChange} onBlur={onBlur} placeholder={l.optional ? "Halo’s need" : String(l.min)} invalid={!!error} label={`${label} target`} decimals={l.decimals} />}
    />
  );
}

export function GoalsSection() {
  const { goals, update, reset } = useGoals();
  // A field shows what is being typed until it loses focus; then the stored target.
  const [drafts, setDrafts] = React.useState<Partial<Record<TargetKey, string>>>({});
  const [errors, setErrors] = React.useState<Partial<Record<TargetKey, string>>>({});
  // Distance and water in km or miles, ml or fl oz (Settings › Units); stored in km and ml.
  const { units } = useUnits();

  const text = (k: TargetKey) => drafts[k] ?? targetText(k, goals.targets[k], units);
  const edit = (k: TargetKey) => (t: string) => {
    setDrafts((d) => ({ ...d, [k]: t }));
    const r = parseTarget(k, t, units);
    setErrors((e) => ({ ...e, [k]: r.error ?? undefined }));
    if (!r.error) void update((g) => withTarget(g, k, r.value));
  };
  const blur = (k: TargetKey) => () => {
    if (errors[k]) return; // keep the rejected text in view with its error
    setDrafts((d) => {
      const { [k]: _, ...rest } = d;
      return rest;
    });
  };
  const toggle = (k: GoalKey) => (on: boolean) => void update((g) => withEnabled(g, k, on));
  const doReset = async () => {
    await reset();
    setDrafts({});
    setErrors({});
    toast("Goals reset to Fitbit’s defaults");
  };

  const field = (k: GoalKey, targetKey: TargetKey = k) => (
    <GoalField
      key={targetKey}
      icon={k === "sleep" ? Moon : STAT_ICON[k]}
      tint={GOAL_TINT[k] ?? "sky"}
      label={targetKey === "azmWeek" ? "Active Zone Minutes a week" : GOAL_META[k].label}
      on={goals.enabled[k]}
      onToggle={toggle(k)}
      targetKey={targetKey}
      text={text(targetKey)}
      error={errors[targetKey]}
      onChange={edit(targetKey)}
      onBlur={blur(targetKey)}
      units={units}
    />
  );
  // Fitbit's 8 km and 2,000 ml, in the person's units ("about 5 mi", "about 68 fl oz").
  const distanceDefault = units.distance === "mi" ? `about ${targetText("distance", DEFAULT_GOALS.targets.distance, units)} mi` : "8 km";
  const waterDefault = units.fluid === "floz" ? `about ${targetText("water", DEFAULT_GOALS.targets.water, units)} fl oz` : "2,000 ml";

  return (
    <RiseEach>
      <InsetGroup
        title="Daily goals"
        inset="icon"
        footer={`Each goal is a ring on Home that fills through the day. Fitbit’s defaults: 10,000 steps, ${distanceDefault}, 10 floors, 22 Active Zone Minutes, 30 active minutes and ${waterDefault} of water.`}
      >
        {GOAL_KEYS.map((k) => field(k))}
      </InsetGroup>
      <InsetGroup title="Weekly goal" footer="Active Zone Minutes add up over the week, Monday to Sunday. The switch is the daily goal’s.">
        {field("azm", "azmWeek")}
      </InsetGroup>
      <InsetGroup>
        <ButtonRow label="Reset to Fitbit defaults" center onPress={() => void doReset()} disabled={isDefaultGoals(goals)} />
      </InsetGroup>
    </RiseEach>
  );
}
