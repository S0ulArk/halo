// Settings › Profile's "Edit" (U19), ported from the web's EditProfileButton + ProfileForm: the bar's glass Edit capsule
// and the profile fields in a sheet, set as Apple Health sets "Health Details": inset grouped form rows (the label on
// the left, the value or field on the right, a red error under a row), what each is for in the groups' footers, and a
// filled Save at the foot. Saving goes through useApp().saveProfile, which rescoring every day picks up. The time zone
// is the phone's own (the import and every screen read the device zone), so the sheet shows it rather than offering a
// picker.
import * as React from "react";
import { View } from "react-native";
import type { Profile, Sex } from "@/data/types";
import { wholeYears } from "@/lib/time";
import { amount, cmToIn, conversionFor, heightDraftOf, heightFromDraft, heightText, IMPERIAL, inputText, inToCm, lengthFromInput, METRIC, type HeightDraft, type Units } from "@/lib/units";
import { deviceTimeZone, useApp } from "@/state/app";
import { useUnits } from "@/state/units";
import { BottomSheet, GlassButton, Txt } from "@/ui";
import { BirthDatePicker } from "./BirthDatePicker";
import { CalmButton, CalmInput, useCalm } from "./calmKit";
import { FormRow, InfoRow, InsetGroup } from "./list";
import { Segmented } from "./parts";
import { toast } from "./toast";
import { HeightInput, useHeightDraft } from "./units";
import { describeZone } from "./zone";

type Errors = Partial<Record<"birthDate" | "sex" | "maxHr" | "heightCm" | "waistCm", string>>;

/** The height limits in feet and inches, rounded inward so each is itself allowed: 3 ft 4 in to 8 ft 2 in. */
const FTIN_RANGE = `Between ${heightText(inToCm(Math.ceil(cmToIn(100))), IMPERIAL)} and ${heightText(inToCm(Math.floor(cmToIn(250))), IMPERIAL)}`;

/**
 * The web's ProfileInput rules: ages 13 to 100, max HR 100-240 (whole), height 100-250 cm; (mobile) waist 40-200 cm.
 * Height and waist are typed in `units` (feet and inches, a waist in inches) and come back in cm, to 0.1; the messages
 * give the limits in the unit typed.
 */
export function validateProfile(
  f: { birthDate: string; sex: Sex | null; maxHr: string; height: HeightDraft; waist?: string },
  today: string,
  units: Units = METRIC,
): { errors: Errors; maxHr: number | null; heightCm: number | null; waistCm: number | null } {
  const errors: Errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.birthDate)) errors.birthDate = "Enter your birth date";
  else {
    const age = wholeYears(f.birthDate, today);
    if (age < 13 || age > 100) errors.birthDate = "Enter a birth date between 13 and 100 years ago";
  }
  if (!f.sex) errors.sex = "Choose one";
  const num = (s: string) => (s.trim() === "" ? null : Number(s.trim().replace(",", ".")));
  const maxHr = num(f.maxHr);
  if (maxHr !== null && !(Number.isInteger(maxHr) && maxHr >= 100 && maxHr <= 240)) errors.maxHr = "Between 100 and 240";
  const ftin = units.height === "ftin";
  const heightCm = heightFromDraft(f.height, units);
  if (heightCm !== null && !(Number.isFinite(heightCm) && heightCm >= 100 && heightCm <= 250)) errors.heightCm = ftin ? FTIN_RANGE : "Between 100 and 250 cm";
  const waistCm = lengthFromInput(f.waist ?? "", units);
  if (waistCm !== null && !(Number.isFinite(waistCm) && waistCm >= 40 && waistCm <= 200))
    errors.waistCm = ftin ? `Between ${amount(Math.ceil(cmToIn(40) * 10) / 10)} and ${amount(Math.floor(cmToIn(200) * 10) / 10)} in` : "Between 40 and 200 cm";
  return { errors, maxHr, heightCm, waistCm };
}

/** A number typed into a row: a compact field with tabular figures and its unit after it. */
function NumberField({ value, onChange, placeholder, invalid, label, unit, decimal = false }: { value: string; onChange: (v: string) => void; placeholder: string; invalid: boolean; label: string; unit: string; decimal?: boolean }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <CalmInput value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={decimal ? "decimal-pad" : "number-pad"} accessibilityLabel={label} invalid={invalid} on="card" numeric style={{ width: 96, minHeight: 40, borderRadius: 10, textAlign: "right" }} />
      <Txt size={16} lineHeight={21} style={{ color: c.sub, minWidth: 30 }}>
        {unit}
      </Txt>
    </View>
  );
}

/** The bar's "Edit" (a glass capsule, iOS's), and its sheet. */
export function EditProfileButton({ profile }: { profile: Profile }) {
  const c = useCalm();
  const app = useApp();
  // Height and waist are typed in Settings › Units' height unit (cm, or feet and inches with the waist in inches).
  const { units } = useUnits();
  const ftin = units.height === "ftin";
  const waistOf = (cm: number | null | undefined) => (cm ? inputText(cm, conversionFor("cm", units), 1) : "");
  const [open, setOpen] = React.useState(false);
  const [birthDate, setBirthDate] = React.useState(profile.birthDate);
  const [sex, setSex] = React.useState<Sex | null>(profile.sex);
  const [maxHr, setMaxHr] = React.useState(profile.maxHr ? String(profile.maxHr) : "");
  const [height, setHeight] = useHeightDraft(profile.heightCm, units);
  const [waist, setWaist] = React.useState(() => waistOf(profile.waistCm));
  const [errors, setErrors] = React.useState<Errors>({});
  const [pending, setPending] = React.useState(false);
  const zone = deviceTimeZone();

  const start = () => {
    setBirthDate(profile.birthDate);
    setSex(profile.sex);
    setMaxHr(profile.maxHr ? String(profile.maxHr) : "");
    setHeight(heightDraftOf(profile.heightCm, units));
    setWaist(waistOf(profile.waistCm));
    setErrors({});
    setOpen(true);
  };
  const save = async () => {
    const v = validateProfile({ birthDate, sex, maxHr, height, waist }, app.today, units);
    setErrors(v.errors);
    if (Object.keys(v.errors).length || !sex) return;
    // A height or waist left as it was shown keeps its stored cm, so feet and inches never round it on a save.
    const shownHeight = heightDraftOf(profile.heightCm, units);
    const heightCm = height.cm === shownHeight.cm && height.ft === shownHeight.ft && height.in === shownHeight.in ? (profile.heightCm ?? null) : v.heightCm;
    const waistCm = waist === waistOf(profile.waistCm) ? (profile.waistCm ?? null) : v.waistCm;
    setPending(true);
    try {
      await app.saveProfile({ birthDate, sex, maxHr: v.maxHr, heightCm, waistCm, timeZone: zone });
      setOpen(false);
      toast("Profile saved. Scores are being recomputed.");
    } catch {
      toast("Couldn’t save your profile. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <GlassButton wide onPress={start} accessibilityLabel="Edit profile">
        <Txt size={16} lineHeight={21} weight={600} style={{ color: c.teal }}>
          Edit
        </Txt>
      </GlassButton>
      <BottomSheet
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Profile"
        description="Changing it recomputes every day’s scores."
        size="tall"
        footer={
          <CalmButton onPress={() => void save()} disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </CalmButton>
        }
      >
        <View style={{ gap: 24, paddingTop: 4 }}>
          <InsetGroup footer="For heart rate zones, sleep need and Halo Age. Sex at birth: reference ranges differ by sex.">
            <View>
              <BirthDatePicker label="Birth date" value={birthDate} onChange={setBirthDate} invalid={!!errors.birthDate} />
              {errors.birthDate ? (
                <Txt size={13} lineHeight={18} accessibilityRole="alert" style={{ color: c.system.red, paddingHorizontal: 16, paddingBottom: 10 }}>
                  {errors.birthDate}
                </Txt>
              ) : null}
            </View>
            <FormRow label="Sex" error={errors.sex}>
              <View style={{ width: 190 }}>
                <Segmented
                  accessibilityLabel="Sex"
                  value={sex}
                  onChange={setSex}
                  items={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                  ]}
                />
              </View>
            </FormRow>
          </InsetGroup>
          <InsetGroup title="Body" footer={`${ftin ? "Height in feet and inches, waist in inches" : "In cm"}. Height gives lean body mass, and body fat from weight when no scale reports it; the waist, measured at the navel, sharpens the VO2 max Halo estimates from resting heart rate and activity.`}>
            <FormRow label="Height" optional error={errors.heightCm} wide={ftin}>
              {ftin ? (
                <HeightInput value={height} onChange={setHeight} units={units} invalid={!!errors.heightCm} placeholder="cm" />
              ) : (
                <View style={{ width: 134 }}>
                  <HeightInput value={height} onChange={setHeight} units={units} invalid={!!errors.heightCm} placeholder="cm" />
                </View>
              )}
            </FormRow>
            <FormRow label="Waist" optional error={errors.waistCm}>
              <NumberField label={ftin ? "Waist in inches" : "Waist in centimetres"} value={waist} onChange={setWaist} placeholder={ftin ? "in" : "cm"} unit={ftin ? "in" : "cm"} invalid={!!errors.waistCm} decimal={ftin} />
            </FormRow>
          </InsetGroup>
          <InsetGroup title="Heart" footer="Leave max heart rate blank to estimate it from your age.">
            <FormRow label="Max heart rate" optional error={errors.maxHr}>
              <NumberField label="Max heart rate in beats per minute" value={maxHr} onChange={setMaxHr} placeholder="bpm" unit="bpm" invalid={!!errors.maxHr} />
            </FormRow>
          </InsetGroup>
          <InsetGroup footer="This phone’s time zone. Your days start at midnight here.">
            <InfoRow label="Time zone" value={describeZone(zone)} />
          </InsetGroup>
        </View>
      </BottomSheet>
    </>
  );
}
