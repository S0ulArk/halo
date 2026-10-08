// Settings › Goals `/settings?s=goals` (a phone-only addition): Fitbit-style daily goals, each with a switch and a
// numeric target in its unit, the weekly Active Zone Minutes target, and "Reset to Fitbit defaults". Saved as typed
// (src/state/goals.ts), so Home's rings and the Trends goal lines follow at once; an out-of-range number is shown in
// red and not saved. Settings › Goals shows the Weekly plan's targets after these (./weeklyPlan.tsx).
import * as React from "react";
import { View } from "react-native";
import { Moon, type LucideIcon } from "lucide-react-native";
import { GOAL_KEYS, GOAL_META, type GoalKey } from "@/queries/goals";
import { isDefaultGoals, parseTarget, TARGET_LIMITS, useGoals, withEnabled, withTarget, type TargetKey } from "@/state/goals";
import { Txt } from "@/ui";
import { STAT_ICON } from "../home/view";
import { CalmInput, CalmSwitch, Group, IconTile, Sentence, useCalm, type CalmTint } from "./calmKit";
import { Body, Divided, OutlineButton } from "./parts";
import { toast } from "./toast";

const HINT: Partial<Record<TargetKey, string>> = {
  sleep: "Blank follows Halo’s sleep need for the night.",
  azmWeek: "Fitbit counts moderate minutes once and vigorous or peak minutes twice.",
};

/** Each goal's family: activity sky, water (nutrition) sand, sleep lavender. */
const GOAL_TINT: Partial<Record<GoalKey, CalmTint>> = { water: "sand", sleep: "lavender" };

/** A goal's target: a 16 px rounded field with the number in the numeric face, grey on the white card. */
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
      style={{ width: 128, minHeight: 48 }}
    />
  );
}

/**
 * One habit or goal with a target: its tinted icon tile, the name, and its switch on one row; while on, the target
 * field with its unit and a hint (or a rose error) under it. Shared by Daily goals and the Weekly plan.
 */
export function TargetField({
  icon: Icon,
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
    <View style={{ paddingVertical: 14, gap: 12 }}>
      <View style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ opacity: on ? 1 : 0.55 }}>
          <IconTile icon={Icon} tint={tint} size={40} />
        </View>
        <Txt size={16} lineHeight={21} weight={600} style={{ flex: 1, minWidth: 0, color: on ? c.ink : c.sub }}>
          {label}
        </Txt>
        <CalmSwitch value={on} onChange={onToggle} label={switchLabel} />
      </View>
      {on && (
        <View style={{ paddingLeft: 54, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {field}
            <Txt size={14} lineHeight={19} weight={500} style={{ flex: 1, minWidth: 0, color: c.sub }}>
              {unit}
            </Txt>
          </View>
          {error ? (
            <Sentence color={c.tintInk.rose} weight={500} accessibilityRole="alert">
              {error}
            </Sentence>
          ) : hint ? (
            <Sentence>{hint}</Sentence>
          ) : null}
        </View>
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

/** One goal: its switch on the name's row and, while on, the target field with its unit and a hint or error under it. */
function GoalField({ icon, tint, label, on, onToggle, targetKey, text, error, onChange, onBlur }: FieldProps) {
  const l = TARGET_LIMITS[targetKey];
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

  const text = (k: TargetKey) => drafts[k] ?? (goals.targets[k] === null ? "" : String(goals.targets[k]));
  const edit = (k: TargetKey) => (t: string) => {
    setDrafts((d) => ({ ...d, [k]: t }));
    const r = parseTarget(k, t);
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
    />
  );

  return (
    <>
      <Group title="Daily goals" padding={20} gap={4}>
        <Body style={{ paddingBottom: 8 }}>Each goal is a ring on Home that fills through the day. Fitbit’s defaults: 10,000 steps, 8 km, 10 floors, 22 Active Zone Minutes, 30 active minutes and 2,000 ml of water.</Body>
        <Divided top>{GOAL_KEYS.map((k) => field(k))}</Divided>
      </Group>
      <Group title="Weekly goal" padding={20} gap={4}>
        <Body style={{ paddingBottom: 8 }}>Active Zone Minutes add up over the week, Monday to Sunday. The switch is the daily goal’s.</Body>
        <Divided top>{field("azm", "azmWeek")}</Divided>
      </Group>
      <View style={{ alignItems: "center", paddingTop: 4, paddingBottom: 8 }}>
        <OutlineButton on="ground" onPress={() => void doReset()} disabled={isDefaultGoals(goals)}>
          Reset to Fitbit defaults
        </OutlineButton>
      </View>
    </>
  );
}
