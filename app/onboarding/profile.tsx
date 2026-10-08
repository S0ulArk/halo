// First run: birth date, sex, optional max HR and height. Mirrors the web app's onboarding fields. Calm: the warm ground,
// white rounded fields with their labels above, a teal segmented choice and a teal Continue.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Sex } from "@/data/types";
import { deviceTimeZone, useApp } from "@/state/app";
import { Txt } from "@/ui";
import { Wordmark } from "@/ui/components/Wordmark";
import { CalmButton, CalmField, CalmInput, CalmSegmented, Sentence, useCalm } from "@/screens/settings/calmKit";
import { BirthDatePicker } from "@/screens/settings/BirthDatePicker";
import { maskDate } from "@/lib/dateInput";
import { CalendarDays } from "lucide-react-native";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEXES = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
] as const;

export default function ProfileScreen() {
  const app = useApp();
  const router = useRouter();
  const c = useCalm();
  const insets = useSafeAreaInsets();
  const [birthDate, setBirthDate] = React.useState(app.profile?.birthDate ?? "");
  const [calendar, setCalendar] = React.useState(false);
  const [sex, setSex] = React.useState<Sex>(app.profile?.sex ?? "male");
  const [maxHr, setMaxHr] = React.useState(app.profile?.maxHr ? String(app.profile.maxHr) : "");
  const [heightCm, setHeightCm] = React.useState(app.profile?.heightCm ? String(app.profile.heightCm) : "");
  const [saving, setSaving] = React.useState(false);

  const m = DATE.exec(birthDate);
  const year = m ? +m[1] : 0;
  const validDate = !!m && year >= 1900 && year <= new Date().getFullYear() - 5 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31;
  const hr = maxHr.trim() === "" ? null : Number(maxHr);
  const validHr = hr === null || (Number.isFinite(hr) && hr >= 120 && hr <= 230);
  const h = heightCm.trim() === "" ? null : Number(heightCm);
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
      {/* A focused field scrolls clear of the keyboard with Continue (84 px under the last fields) still above it, with air. */}
      <KeyboardAwareScrollView
        bottomOffset={136}
        contentContainerStyle={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, gap: 22 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <Wordmark height={22} color={c.sub} />
        </View>
        <View style={{ gap: 8, paddingHorizontal: 4 }}>
          <Txt size={28} lineHeight={34} weight={700} accessibilityRole="header" style={{ color: c.ink }}>
            About you
          </Txt>
          <Sentence size={15}>Sleep need, heart-rate zones and Strain depend on your age and sex. Nothing leaves your phone.</Sentence>
        </View>

        <CalmField label="Birth date" error={dateError ? "Enter a date like 1992-05-17." : null}>
          {/* Typed with the dashes put in for you, or picked on the calendar wheels. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <CalmInput
                on="ground"
                numeric={birthDate !== ""}
                value={birthDate}
                onChangeText={(t) => setBirthDate((prev) => maskDate(prev, t))}
                placeholder="YYYY-MM-DD"
                keyboardType="number-pad"
                maxLength={10}
                accessibilityLabel="Birth date"
                invalid={dateError}
                autoFocus
              />
            </View>
            <Pressable
              onPress={() => setCalendar((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: calendar }}
              accessibilityLabel={calendar ? "Close the calendar" : "Choose on a calendar"}
              hitSlop={4}
              style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: calendar ? c.teal : c.ground, opacity: pressed ? 0.7 : 1 })}
            >
              <CalendarDays size={22} color={calendar ? c.card : c.teal} strokeWidth={1.75} />
            </Pressable>
          </View>
          {calendar && <BirthDatePicker value={/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : ""} onChange={setBirthDate} startOpen />}
        </CalmField>

        <CalmField label="Sex" help="Used for the sleep-need and fitness reference tables.">
          <CalmSegmented value={sex} onChange={setSex} items={SEXES} on="ground" accessibilityLabel="Sex" />
        </CalmField>

        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-end" }}>
          <CalmField label="Max HR" hint="(optional)" style={{ flex: 1 }}>
            <CalmInput on="ground" numeric={maxHr !== ""} value={maxHr} onChangeText={setMaxHr} placeholder="Tanaka estimate" keyboardType="number-pad" accessibilityLabel="Max HR (optional)" />
          </CalmField>
          <CalmField label="Height" hint="(cm, optional)" style={{ flex: 1 }}>
            <CalmInput on="ground" numeric={heightCm !== ""} value={heightCm} onChangeText={setHeightCm} placeholder="175" keyboardType="number-pad" accessibilityLabel="Height in cm (optional)" />
          </CalmField>
        </View>

        <CalmButton onPress={() => void save()} disabled={!ok} style={{ marginTop: 8, minHeight: 56, borderRadius: 28 }}>
          Continue
        </CalmButton>
      </KeyboardAwareScrollView>
    </View>
  );
}
