// Settings › Profile's "Edit" (U19), ported from the web's EditProfileButton + ProfileForm: the profile fields in a sheet.
// Saving goes through useApp().saveProfile, which rescoring every day picks up. The time zone is the phone's own (the
// import and every screen read the device zone), so the sheet shows it rather than offering a picker.
import * as React from "react";
import { View } from "react-native";
import { Pencil } from "lucide-react-native";
import type { Profile, Sex } from "@/data/types";
import { wholeYears } from "@/lib/time";
import { amount, cmToIn, conversionFor, heightDraftOf, heightFromDraft, heightText, IMPERIAL, inputText, inToCm, lengthFromInput, METRIC, type HeightDraft, type Units } from "@/lib/units";
import { deviceTimeZone, useApp } from "@/state/app";
import { useUnits } from "@/state/units";
import { BottomSheet, Txt } from "@/ui";
import { BirthDatePicker } from "./BirthDatePicker";
import { CalmButton, CalmField, CalmInput, useCalm } from "./calmKit";
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

/** A labelled field: the label above (with "Optional" in grey), the control, then its hint or a rose error. */
function Field({ label, hint, error, optional, children }: { label: string; hint: string; error?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <CalmField label={label} hint={optional ? "Optional" : undefined} help={hint} error={error}>
      {children}
    </CalmField>
  );
}

function NumberField({ value, onChange, placeholder, invalid, label, decimal = false }: { value: string; onChange: (v: string) => void; placeholder: string; invalid: boolean; label: string; decimal?: boolean }) {
  return <CalmInput value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={decimal ? "decimal-pad" : "number-pad"} accessibilityLabel={label} invalid={invalid} on="card" numeric />;
}

/** The teal "✎ Edit" link beside the Profile header, and its sheet. */
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
      <CalmButton variant="quiet" size="sm" icon={Pencil} onPress={start} accessibilityLabel="Edit profile" style={{ marginVertical: -8 }}>
        Edit
      </CalmButton>
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
        <View style={{ gap: 22, paddingTop: 4 }}>
          <Field label="Birth date" hint="For heart rate zones, sleep need and Halo Age." error={errors.birthDate}>
            <BirthDatePicker value={birthDate} onChange={setBirthDate} invalid={!!errors.birthDate} />
          </Field>
          <Field label="Sex" hint="Sex at birth. Reference ranges differ by sex." error={errors.sex}>
            <Segmented
              accessibilityLabel="Sex"
              value={sex}
              onChange={setSex}
              items={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
              ]}
            />
          </Field>
          <Field label="Time zone" hint="This phone’s time zone. Your days start at midnight here.">
            <View style={{ minHeight: 52, borderRadius: 16, backgroundColor: c.ground, paddingHorizontal: 16, paddingVertical: 12, justifyContent: "center" }}>
              <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
                {describeZone(zone)}
              </Txt>
            </View>
          </Field>
          <Field label="Height" hint={`${ftin ? "In feet and inches" : "In cm"}. Lean body mass for your height, and body fat from weight when no scale reports it.`} error={errors.heightCm} optional>
            <HeightInput value={height} onChange={setHeight} units={units} invalid={!!errors.heightCm} placeholder="cm" />
          </Field>
          <Field label="Waist" hint={`${ftin ? "In inches" : "In cm"}, at the navel. Sharpens the VO2 max Halo estimates from resting heart rate and activity.`} error={errors.waistCm} optional>
            <NumberField label={ftin ? "Waist in inches" : "Waist in centimetres"} value={waist} onChange={setWaist} placeholder={ftin ? "in" : "cm"} invalid={!!errors.waistCm} decimal={ftin} />
          </Field>
          <Field label="Max heart rate" hint="Leave blank to estimate it from your age." error={errors.maxHr} optional>
            <NumberField label="Max heart rate in beats per minute" value={maxHr} onChange={setMaxHr} placeholder="bpm" invalid={!!errors.maxHr} />
          </Field>
        </View>
      </BottomSheet>
    </>
  );
}
