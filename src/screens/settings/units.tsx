// Settings › Units `/settings?s=units` (a phone-only addition): kilograms or pounds, centimetres or feet and inches,
// kilometres or miles (with pace and elevation), °C or °F, millilitres or US fluid ounces, kept on this phone
// like the theme (src/state/units.ts). A preset sets them all; each row changes one. Halo keeps every measurement in
// metric, so a switch changes what is shown and typed, never the data or the scores. Also the height field that follows
// the choice (one field in cm, or feet and inches side by side), shared by Settings › Profile and onboarding.
import * as React from "react";
import { View } from "react-native";
import { Flame, GlassWater, Route, Ruler, Scale, Thermometer, type LucideIcon } from "lucide-react-native";
import { heightDraftOf, heightFromDraft, PRESETS, presetOf, UNIT_NAME, UNIT_SYMBOL, type HeightDraft, type Preset, type UnitKind, type Units } from "@/lib/units";
import { useUnits } from "@/state/units";
import { Txt } from "@/ui";
import { CalmInput, Group, IconTile, Sentence, useCalm, type CalmTint, type On } from "./calmKit";
import { Divided, Segmented } from "./parts";

const PRESET_ITEMS = [
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial (US)" },
] as const satisfies readonly { value: Preset; label: string }[];

/** "Kilograms (kg)", "Feet and inches": each choice's name with its symbol, written out in full. */
const choiceLabel = <K extends UnitKind>(kind: K, v: Units[K]) => {
  const name = (UNIT_NAME[kind] as Record<string, string>)[v];
  return kind === "height" && v === "ftin" ? name : `${name} (${(UNIT_SYMBOL[kind] as Record<string, string>)[v]})`;
};

type UnitRowDef = { kind: UnitKind; label: string; icon: LucideIcon; tint: CalmTint; detail: string; options: readonly string[] };

/** One row per kind of measurement: what it covers, then its two choices. */
const ROWS: UnitRowDef[] = [
  { kind: "weight", label: "Weight", icon: Scale, tint: "sand", detail: "Your weight, lean and fat mass, and the protein suggestion.", options: ["kg", "lb"] },
  { kind: "height", label: "Height and waist", icon: Ruler, tint: "sand", detail: "Height in cm, or in feet and inches with your waist in inches.", options: ["cm", "ftin"] },
  { kind: "distance", label: "Distance", icon: Route, tint: "sky", detail: "Distance and its goal, pace per km or per mile, and elevation gain in metres or feet.", options: ["km", "mi"] },
  { kind: "temperature", label: "Temperature", icon: Thermometer, tint: "rose", detail: "Core temperature, and skin temperature’s change from your baseline.", options: ["c", "f"] },
  { kind: "fluid", label: "Water", icon: GlassWater, tint: "sky", detail: "What you log, your daily total and the water goal.", options: ["ml", "floz"] },
];

/** What a preset sets, in a sentence; a mix says so. */
function presetSentence(p: Preset | null) {
  if (p === "metric") return "Kilograms, centimetres, kilometres, °C and millilitres. Halo’s default.";
  if (p === "imperial") return "Pounds, feet and inches, miles, °F and US fluid ounces, as in the United States.";
  return "Your own mix, set below. Pick a preset to set every measurement at once.";
}

/** A measurement's row: its tinted icon tile, name and what it covers, then the two choices side by side. */
function UnitRow({ row, units, onChange }: { row: UnitRowDef; units: Units; onChange: (kind: UnitKind, v: string) => void }) {
  const c = useCalm();
  const items = row.options.map((v) => ({ value: v, label: choiceLabel(row.kind, v as never) }));
  return (
    <View style={{ paddingVertical: 14, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <IconTile icon={row.icon} tint={row.tint} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
            {row.label}
          </Txt>
          <Sentence size={13}>{row.detail}</Sentence>
        </View>
      </View>
      <Segmented accessibilityLabel={row.label} value={units[row.kind]} onChange={(v) => onChange(row.kind, v)} items={items} />
    </View>
  );
}

/** Settings › Units: a preset, then one choice per kind of measurement, and how the data stays metric. */
export function UnitsSection() {
  const c = useCalm();
  const { units, update, set } = useUnits();
  const preset = presetOf(units);
  return (
    <>
      <Group title="Units" gap={12}>
        <Segmented accessibilityLabel="Units" value={preset} onChange={(p) => void set(PRESETS[p])} items={PRESET_ITEMS} />
        <Sentence>{presetSentence(preset)}</Sentence>
      </Group>
      <Group title="Each measurement" padding={20} gap={4}>
        <Divided>
          {ROWS.map((row) => (
            <UnitRow key={row.kind} row={row} units={units} onChange={(kind, v) => void update({ [kind]: v } as Partial<Units>)} />
          ))}
          <View style={{ paddingVertical: 14, flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
            <IconTile icon={Flame} tint="peach" size={40} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
                Energy
              </Txt>
              <Sentence size={13}>Calories stay in kilocalories (kcal), as food labels and Health Connect give them.</Sentence>
            </View>
          </View>
        </Divided>
      </Group>
      <Sentence style={{ paddingHorizontal: 4 }}>
        Halo keeps every measurement in metric on this phone and converts only what it shows and what you type, so switching never changes your data or your scores. Exports stay metric.
      </Sentence>
    </>
  );
}

/**
 * A height being typed, starting from `cm`, that follows a change of unit: typed in cm and switched to feet and inches
 * (by the onboarding preset, or the stored units arriving), it shows the same height in feet and inches.
 */
export function useHeightDraft(cm: number | null | undefined, units: Units): [HeightDraft, (d: HeightDraft) => void] {
  const [s, setS] = React.useState(() => ({ draft: heightDraftOf(cm, units), unit: units.height }));
  const draft = s.unit === units.height ? s.draft : heightDraftOf(heightFromDraft(s.draft, { ...units, height: s.unit }), units);
  const set = React.useCallback((d: HeightDraft) => setS({ draft: d, unit: units.height }), [units.height]);
  return [draft, set];
}

/**
 * The height field in the person's unit: one number in cm, or feet and inches side by side, each with its unit after
 * it. `value` holds what is typed (heightFromDraft reads it back to cm).
 */
export function HeightInput({
  value,
  onChange,
  units,
  invalid = false,
  on = "card",
  optional = false,
  placeholder = "175",
}: {
  value: HeightDraft;
  onChange: (d: HeightDraft) => void;
  units: Units;
  invalid?: boolean;
  on?: On;
  optional?: boolean;
  /** The centimetre field's placeholder. */
  placeholder?: string;
}) {
  const c = useCalm();
  const tail = optional ? " (optional)" : "";
  if (units.height === "cm")
    return (
      <CalmInput
        on={on}
        numeric={value.cm !== ""}
        value={value.cm}
        onChangeText={(t) => onChange({ ...value, cm: t })}
        placeholder={placeholder}
        keyboardType="number-pad"
        accessibilityLabel={`Height in centimetres${tail}`}
        invalid={invalid}
      />
    );
  const unit = (text: string) => (
    <Txt size={15} lineHeight={20} weight={500} style={{ color: c.sub }}>
      {text}
    </Txt>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <CalmInput on={on} numeric={value.ft !== ""} value={value.ft} onChangeText={(t) => onChange({ ...value, ft: t })} placeholder="5" keyboardType="number-pad" maxLength={1} accessibilityLabel={`Height, feet${tail}`} invalid={invalid} />
      </View>
      {unit("ft")}
      <View style={{ flex: 1, minWidth: 0 }}>
        <CalmInput on={on} numeric={value.in !== ""} value={value.in} onChangeText={(t) => onChange({ ...value, in: t })} placeholder="9" keyboardType="decimal-pad" maxLength={4} accessibilityLabel={`Height, inches${tail}`} invalid={invalid} />
      </View>
      {unit("in")}
    </View>
  );
}
