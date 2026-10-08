// Settings › Profile's "Edit" (U19), ported from the web's EditProfileButton + ProfileForm: the profile fields in a sheet.
// Saving goes through useApp().saveProfile, which rescoring every day picks up. The time zone is the phone's own (the
// import and every screen read the device zone), so the sheet shows it rather than offering a picker.
import * as React from "react";
import { View } from "react-native";
import { Pencil } from "lucide-react-native";
import type { Profile, Sex } from "@/data/types";
import { wholeYears } from "@/lib/time";
import { deviceTimeZone, useApp } from "@/state/app";
import { BottomSheet, Txt } from "@/ui";
import { BirthDatePicker } from "./BirthDatePicker";
import { CalmButton, CalmField, CalmInput, useCalm } from "./calmKit";
import { Segmented } from "./parts";
import { toast } from "./toast";
import { describeZone } from "./zone";

type Errors = Partial<Record<"birthDate" | "sex" | "maxHr" | "heightCm" | "waistCm", string>>;

/** The web's ProfileInput rules: ages 13 to 100, max HR 100-240 (whole), height 100-250 cm; (mobile) waist 40-200 cm. */
export function validateProfile(
  f: { birthDate: string; sex: Sex | null; maxHr: string; heightCm: string; waistCm?: string },
  today: string,
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
  const heightCm = num(f.heightCm);
  if (heightCm !== null && !(Number.isFinite(heightCm) && heightCm >= 100 && heightCm <= 250)) errors.heightCm = "Between 100 and 250 cm";
  const waistCm = num(f.waistCm ?? "");
  if (waistCm !== null && !(Number.isFinite(waistCm) && waistCm >= 40 && waistCm <= 200)) errors.waistCm = "Between 40 and 200 cm";
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

function NumberField({ value, onChange, placeholder, invalid, label }: { value: string; onChange: (v: string) => void; placeholder: string; invalid: boolean; label: string }) {
  return <CalmInput value={value} onChangeText={onChange} placeholder={placeholder} keyboardType="number-pad" accessibilityLabel={label} invalid={invalid} on="card" numeric />;
}

/** The teal "✎ Edit" link beside the Profile header, and its sheet. */
export function EditProfileButton({ profile }: { profile: Profile }) {
  const c = useCalm();
  const app = useApp();
  const [open, setOpen] = React.useState(false);
  const [birthDate, setBirthDate] = React.useState(profile.birthDate);
  const [sex, setSex] = React.useState<Sex | null>(profile.sex);
  const [maxHr, setMaxHr] = React.useState(profile.maxHr ? String(profile.maxHr) : "");
  const [heightCm, setHeightCm] = React.useState(profile.heightCm ? String(profile.heightCm) : "");
  const [waistCm, setWaistCm] = React.useState(profile.waistCm ? String(profile.waistCm) : "");
  const [errors, setErrors] = React.useState<Errors>({});
  const [pending, setPending] = React.useState(false);
  const zone = deviceTimeZone();

  const start = () => {
    setBirthDate(profile.birthDate);
    setSex(profile.sex);
    setMaxHr(profile.maxHr ? String(profile.maxHr) : "");
    setHeightCm(profile.heightCm ? String(profile.heightCm) : "");
    setWaistCm(profile.waistCm ? String(profile.waistCm) : "");
    setErrors({});
    setOpen(true);
  };
  const save = async () => {
    const v = validateProfile({ birthDate, sex, maxHr, heightCm, waistCm }, app.today);
    setErrors(v.errors);
    if (Object.keys(v.errors).length || !sex) return;
    setPending(true);
    try {
      await app.saveProfile({ birthDate, sex, maxHr: v.maxHr, heightCm: v.heightCm, waistCm: v.waistCm, timeZone: zone });
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
          <Field label="Height" hint="In cm. Lean body mass for your height, and body fat from weight when no scale reports it." error={errors.heightCm} optional>
            <NumberField label="Height in centimetres" value={heightCm} onChange={setHeightCm} placeholder="cm" invalid={!!errors.heightCm} />
          </Field>
          <Field label="Waist" hint="In cm, at the navel. Sharpens the VO2 max Halo estimates from resting heart rate and activity." error={errors.waistCm} optional>
            <NumberField label="Waist in centimetres" value={waistCm} onChange={setWaistCm} placeholder="cm" invalid={!!errors.waistCm} />
          </Field>
          <Field label="Max heart rate" hint="Leave blank to estimate it from your age." error={errors.maxHr} optional>
            <NumberField label="Max heart rate in beats per minute" value={maxHr} onChange={setMaxHr} placeholder="bpm" invalid={!!errors.maxHr} />
          </Field>
        </View>
      </BottomSheet>
    </>
  );
}
