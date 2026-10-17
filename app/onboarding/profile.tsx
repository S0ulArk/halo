// First run: birth date, sex, units, optional max HR and height. Mirrors the web app's onboarding fields, set as Apple
// Health's onboarding: the app's mark over a large centred title and a short sentence, then iOS form rows in inset
// grouped lists (the birth date typed with the dashes put in, or picked on wheels under it; sex and units as segmented
// controls; max HR and height in the chosen units) with what each is for in the footers, and the filled blue Continue.
// The blocks fade and rise into place one after another as the screen opens. The units choice is Settings › Units'
// preset (metric or US), saved at once; the height is typed in it (cm, or feet and inches) and stored in cm.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays } from "lucide-react-native";
import type { Sex } from "@/data/types";
import { maskDate } from "@/lib/dateInput";
import { heightFromDraft, PRESETS, presetOf, type Preset } from "@/lib/units";
import { deviceTimeZone, useApp } from "@/state/app";
import { useUnits } from "@/state/units";
import { Txt } from "@/ui";
import { BirthDatePicker } from "@/screens/settings/BirthDatePicker";
import { CalmButton, CalmInput, CalmSegmented, useCalm } from "@/screens/settings/calmKit";
import { Appear, FormRow, InsetGroup, PageHead } from "@/screens/settings/list";
import { HeightInput, useHeightDraft } from "@/screens/settings/units";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEXES = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
] as const;
const UNIT_PRESETS = [
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial (US)" },
] as const satisfies readonly { value: Preset; label: string }[];

export default function ProfileScreen() {
  const app = useApp();
  const router = useRouter();
  const c = useCalm();
  const insets = useSafeAreaInsets();
  const [birthDate, setBirthDate] = React.useState(app.profile?.birthDate ?? "");
  const [calendar, setCalendar] = React.useState(false);
  const [sex, setSex] = React.useState<Sex>(app.profile?.sex ?? "male");
  const [maxHr, setMaxHr] = React.useState(app.profile?.maxHr ? String(app.profile.maxHr) : "");
  const { units, set: setUnits } = useUnits();
  const ftin = units.height === "ftin";
  // The height typed so far follows a change of units (the draft converts itself).
  const [height, setHeight] = useHeightDraft(app.profile?.heightCm, units);
  const [saving, setSaving] = React.useState(false);

  // A preset switches every unit at once (Settings › Units).
  const chooseUnits = (p: Preset) => void setUnits(PRESETS[p]);

  const m = DATE.exec(birthDate);
  const year = m ? +m[1] : 0;
  const validDate = !!m && year >= 1900 && year <= new Date().getFullYear() - 5 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31;
  const hr = maxHr.trim() === "" ? null : Number(maxHr);
  const validHr = hr === null || (Number.isFinite(hr) && hr >= 120 && hr <= 230);
  const h = heightFromDraft(height, units);
  const validH = h === null || (Number.isFinite(h) && h >= 100 && h <= 250);
  const ok = validDate && validHr && validH && !saving;
  const dateError = birthDate.length >= 10 && !validDate;

  const save = async () => {
    if (!ok) return;
    setSaving(true);
    const editing = !!app.source;
    await app.saveProfile({ birthDate, sex, maxHr: hr, heightCm: h, timeZone: deviceTimeZone() });
    setSaving(false);
    // Opened from More: go back there; during onboarding the root gate moves on by itself.
    if (editing && router.canGoBack()) router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      {/* A focused field scrolls clear of the keyboard with Continue (under the last fields) still above it, with air. */}
      <KeyboardAwareScrollView
        bottomOffset={136}
        contentContainerStyle={{ paddingTop: insets.top + 36, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, gap: 26 }}
        keyboardShouldPersistTaps="handled"
      >
        <Appear index={0}>
          <PageHead title="About you">Sleep need, heart-rate zones and Strain depend on your age and sex. Nothing leaves your phone.</PageHead>
        </Appear>

        <Appear index={1}>
          <InsetGroup footer="Typed with the dashes put in for you, or picked on the wheels.">
            <View>
              <FormRow label="Birth date" error={dateError ? "Enter a date like 1992-05-17." : null}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <CalmInput
                    on="card"
                    numeric={birthDate !== ""}
                    value={birthDate}
                    onChangeText={(t) => setBirthDate((prev) => maskDate(prev, t))}
                    placeholder="YYYY-MM-DD"
                    keyboardType="number-pad"
                    maxLength={10}
                    accessibilityLabel="Birth date"
                    invalid={dateError}
                    autoFocus
                    style={{ width: 138, minHeight: 40, borderRadius: 10, textAlign: "center" }}
                  />
                  <Pressable
                    onPress={() => setCalendar((o) => !o)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: calendar }}
                    accessibilityLabel={calendar ? "Close the calendar" : "Choose on a calendar"}
                    hitSlop={6}
                    style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: calendar ? c.teal : c.fill, opacity: pressed ? 0.7 : 1 })}
                  >
                    <CalendarDays size={20} color={calendar ? "#ffffff" : c.teal} strokeWidth={2} />
                  </Pressable>
                </View>
              </FormRow>
              {calendar && <BirthDatePicker wheelsOnly value={DATE.test(birthDate) ? birthDate : ""} onChange={setBirthDate} onDone={() => setCalendar(false)} />}
            </View>
          </InsetGroup>
        </Appear>

        <Appear index={2}>
          <InsetGroup footer="Sex is used for the sleep-need and fitness reference tables. Units are for weight, height, distance, temperature and water; change them any time in Settings › Units.">
            <FormRow label="Sex" wide>
              <CalmSegmented value={sex} onChange={setSex} items={SEXES} accessibilityLabel="Sex" />
            </FormRow>
            <FormRow label="Units" wide>
              <CalmSegmented value={presetOf(units)} onChange={chooseUnits} items={UNIT_PRESETS} accessibilityLabel="Units" />
            </FormRow>
          </InsetGroup>
        </Appear>

        <Appear index={3}>
          <InsetGroup title="Optional" footer={`Leave max HR blank for the Tanaka estimate from your age. Height in ${ftin ? "feet and inches" : "cm"}.`}>
            <FormRow label="Max HR" optional>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <CalmInput on="card" numeric={maxHr !== ""} value={maxHr} onChangeText={setMaxHr} placeholder="Auto" keyboardType="number-pad" accessibilityLabel="Max HR (optional)" style={{ width: 96, minHeight: 40, borderRadius: 10, textAlign: "right" }} />
                <Txt size={16} lineHeight={21} style={{ color: c.sub, minWidth: 30 }}>
                  bpm
                </Txt>
              </View>
            </FormRow>
            <FormRow label="Height" optional wide={ftin}>
              {ftin ? (
                <HeightInput value={height} onChange={setHeight} units={units} optional />
              ) : (
                <View style={{ width: 134 }}>
                  <HeightInput value={height} onChange={setHeight} units={units} optional />
                </View>
              )}
            </FormRow>
          </InsetGroup>
        </Appear>

        <Appear index={4}>
          <CalmButton onPress={() => void save()} disabled={!ok} style={{ marginTop: 4 }}>
            Continue
          </CalmButton>
        </Appear>
      </KeyboardAwareScrollView>
    </View>
  );
}
