// Journal's Log (spec §11 LG1), ported from the web's src/app/(app)/journal/Log.tsx: one tile per thing to log, each
// opening its sheet, and what was logged lately.
//
// mobile: entries stay on the phone (queries/log.ts), so there is no Google access to check and no Reconnect state;
// the sheets' subtitle and the note under the tiles say where entries go. Time and date fields are typed
// ("2026-10-07 14:30", "2026-10-07"): the app ships no native date picker. Food has a sheet of its own
// (src/screens/nutrition/FoodSheet.tsx): a photo or a few words estimated by the person's AI provider, or typed in.
import * as React from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarHeart, Droplet, FlaskConical, HeartPulse, Scale, Smile, Thermometer, Trash2, Utensils, type LucideIcon } from "lucide-react-native";
import { FORMATS } from "@/lib/format";
import { CYCLE_SYMPTOMS, FLOWS, KIND_LABEL, LOG_KINDS, MOODS, OVULATION_RESULTS, SYMPTOMS, VALENCES, WATER_STEPS, type LogKind, type LoggedEntry, type LogType, type LogVM } from "@/queries/log";
import { BottomSheet, Skeleton, Txt } from "@/ui";
import { CalmButton, Hairline, IconTile, Num, SectionLabel, Sentence, useCalm, type CalmTint } from "../settings/calmKit";
import { deleteLogEntry, logEntry, type LogInput } from "./actions";
import { useActionCtx } from "./AddBehaviour";
import { Chips, ConfirmDialog, DialogAction, ErrorAlert, Field, TextField, toast } from "./controls";
import { EMPTY, toInput, wallNow, when, type Form } from "./forms";
import { bumpJournal } from "./state";
import { useApp } from "@/state/app";
import { FoodSheet, foodRequest, type FoodRequest } from "../nutrition/FoodSheet";

const ICON: Record<LogKind, LucideIcon> = {
  water: Droplet,
  food: Utensils,
  weight: Scale,
  spo2: HeartPulse,
  mood: Smile,
  symptoms: Thermometer,
  period: CalendarHeart,
  ovulation: FlaskConical,
};
/** Each kind's pastel: nutrition sand, body sand, blood oxygen and the cycle rose (heart), mood lavender (stress). */
const TINT: Record<LogKind, CalmTint> = {
  water: "sky",
  food: "sand",
  weight: "sand",
  spo2: "rose",
  mood: "lavender",
  symptoms: "peach",
  period: "rose",
  ovulation: "lavender",
};
const TYPE_ICON: Record<LogType, LucideIcon> = {
  "hydration-log": Droplet,
  "nutrition-log": Utensils,
  weight: Scale,
  "body-fat": Scale,
  "oxygen-saturation": HeartPulse,
  moods: Smile,
  symptoms: Thermometer,
  "menstrual-period": CalendarHeart,
  "ovulation-test": FlaskConical,
};
const TYPE_TINT: Record<LogType, CalmTint> = {
  "hydration-log": "sky",
  "nutrition-log": "sand",
  weight: "sand",
  "body-fat": "sand",
  "oxygen-saturation": "rose",
  moods: "lavender",
  symptoms: "peach",
  "menstrual-period": "rose",
  "ovulation-test": "lavender",
};

const grouped = (v: number) => FORMATS.grouped(v);

/** A section inside a sheet: a small spaced-caps header over its fields. */
function Section({ title, first, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: first ? 8 : 24, gap: 12 }}>
      <SectionLabel style={{ paddingHorizontal: 4 }}>{title}</SectionLabel>
      {children}
    </View>
  );
}

const TILE_GAP = 10;
const TILE_HEIGHT = 104;
/** A logged entry's band: its title (21) and when (2 + 18). */
const ENTRY_BAND = 41;

/** Water's and food's running totals on their tiles: the amount today, in the numeric face. */
const TOTAL: Partial<Record<LogKind, { unit: string; tint: CalmTint }>> = { water: { unit: "ml", tint: "sky" }, food: { unit: "kcal", tint: "sand" } };

/**
 * One log tile, half the row: a white 24 px card with the kind's tinted icon tile and its full label under it (water's
 * and food's running totals beside the icon, in the numeric face). The label sits right under the icon row, so the two
 * labels of a row start on one line even if one wraps.
 */
function Tile({ kind, today, onPress }: { kind: LogKind; today: number | null; onPress: () => void }) {
  const c = useCalm();
  const total = TOTAL[kind];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={total ? `${KIND_LABEL[kind]}, ${today ? `${grouped(today)} ${total.unit}` : "none"} today` : KIND_LABEL[kind]}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: TILE_HEIGHT, borderRadius: 24, backgroundColor: c.card, padding: 14, gap: 12, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <IconTile icon={ICON[kind]} tint={TINT[kind]} size={40} />
        {total &&
          (today ? (
            <Num value={grouped(today)} unit={total.unit} size={20} color={c.tintInk[total.tint]} />
          ) : (
            <Txt size={12} lineHeight={16} weight={500} align="right" style={{ color: c.sub, flexShrink: 1 }}>
              None today
            </Txt>
          ))}
      </View>
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
        {KIND_LABEL[kind]}
      </Txt>
    </Pressable>
  );
}

/** Pairs, for the two-column grid (an odd last tile keeps half the row). */
const pairs = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 2) }, (_, i) => xs.slice(i * 2, i * 2 + 2));

export type LogProps = { vm: LogVM };

/** Journal's Log (spec §11 LG1): one tile per thing to log, each opening its sheet, and what was logged lately. */
export function Log({ vm }: LogProps) {
  const c = useCalm();
  const { demo } = vm;
  const actx = useActionCtx();
  const app = useApp();
  // Weight, body fat and blood oxygen feed their metrics, Pulse Age and Health Monitor, so they rescore. Water and food
  // feed the water goal and the nutrition numbers, which the screens add up as they read: those screens just read again
  // (no sync or scoring run; the food sheet does the same on save). Other entries are list-only.
  const rescoreIfBody = (type: string) => {
    if (type === "weight" || type === "body-fat" || type === "oxygen-saturation") void app.refresh();
    else if (type === "water" || type === "hydration-log" || type === "food" || type === "nutrition-log") app.dataChanged();
  };
  const [kind, setKind] = React.useState<LogKind | null>(null);
  const [shown, setShown] = React.useState<LogKind>("water");
  const [form, setForm] = React.useState<Form>(EMPTY.water);
  const [at, setAt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [remove, setRemove] = React.useState<LoggedEntry | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const [all, setAll] = React.useState(false);
  // Food's own sheet: one session per opening.
  const [food, setFood] = React.useState<FoodRequest | null>(null);
  const [foodOpen, setFoodOpen] = React.useState(false);

  const open = (k: LogKind) => {
    if (k === "food") {
      setFood(foodRequest(vm.timeZone));
      setFoodOpen(true);
      return;
    }
    setShown(k);
    setForm(EMPTY[k]);
    setAt(wallNow(vm.timeZone));
    setError(null);
    setKind(k);
  };
  const shut = () => setKind(null);
  // Opened from Today's quick log (`/journal?log=water`): straight to that log's form, once, then the param is cleared.
  const params = useLocalSearchParams<{ log?: string }>();
  const router = useRouter();
  const openRef = React.useRef(open);
  React.useEffect(() => {
    openRef.current = open;
  });
  React.useEffect(() => {
    const k = params.log;
    if (!k || !(LOG_KINDS as readonly string[]).includes(k)) return;
    const id = setTimeout(() => {
      openRef.current(k as LogKind);
      router.setParams({ log: undefined });
    }, 0);
    return () => clearTimeout(id);
  }, [params.log, router]);

  const set = (k: string) => (v: string | string[]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };

  const send = async (input: LogInput, close = true) => {
    if (!actx) return setError("Couldn’t save. Try again.");
    setSaving(true);
    setError(null);
    const r = await logEntry(actx, input).catch(() => ({ ok: false as const, error: "Couldn’t save. Try again." }));
    setSaving(false);
    if (!r.ok) return setError(r.error);
    if (close) shut();
    toast(demo ? `${KIND_LABEL[input.kind]} saved in Halo (demo)` : `${KIND_LABEL[input.kind]} saved in Halo`);
    bumpJournal();
    rescoreIfBody(input.kind);
  };

  const save = () => {
    const input = toInput(shown, form, at);
    if (typeof input === "string") return setError(input);
    void send(input);
  };

  const confirmRemove = async () => {
    if (!remove || !actx) return;
    setRemoving(true);
    const r = await deleteLogEntry(actx, { id: remove.id }).catch(() => ({ ok: false as const, error: "network" }));
    setRemoving(false);
    setRemove(null);
    if (!r.ok) return toast("Couldn’t delete. Try again.");
    toast("Deleted");
    bumpJournal();
    rescoreIfBody(remove.type);
  };

  const recent = all ? vm.recent : vm.recent.slice(0, 6);
  const timeField = shown !== "period" && (
    <Field label="Time" hint="(YYYY-MM-DD HH:mm)">
      <TextField value={at} onChangeText={setAt} keyboardType="numbers-and-punctuation" autoComplete="off" maxLength={16} accessibilityLabel="Time" numeric />
    </Field>
  );
  const numeric = (k: string, label: string, hint: string, opts: { decimal?: boolean; placeholder?: string } = {}) => (
    <Field label={label} hint={hint} style={{ flex: 1 }}>
      <TextField
        value={form[k] as string}
        onChangeText={(t) => set(k)(t)}
        keyboardType={opts.decimal ? "decimal-pad" : "number-pad"}
        autoComplete="off"
        placeholder={opts.placeholder}
        accessibilityLabel={label}
        returnKeyType="done"
        onSubmitEditing={save}
        numeric
      />
    </Field>
  );

  return (
    <>
      {/* Two columns of white tiles: every label whole, on one line. */}
      <View accessibilityLabel="Log" style={{ gap: TILE_GAP }}>
        {pairs(vm.kinds).map((row) => (
          <View key={row.join("-")} style={{ flexDirection: "row", gap: TILE_GAP }}>
            {row.map((k) => (
              <Tile key={k} kind={k} today={k === "water" ? vm.waterToday : k === "food" ? vm.foodToday.kcal : null} onPress={() => open(k)} />
            ))}
            {row.length === 1 && <View style={{ flex: 1 }} />}
          </View>
        ))}
      </View>

      <Sentence style={{ marginTop: 12, paddingHorizontal: 4 }}>
        {demo
          ? "Demo: what you log stays in Halo on this phone and is never written to Health Connect."
          : app.source === "health_connect"
            ? "What you log stays in Halo on this phone. Halo doesn’t write to Health Connect. Water, food and cycle entries logged in Fitbit show here once they sync."
            : app.source === "google"
              ? "What you log stays in Halo on this phone. Halo doesn’t write to your Google account; water and food logged in Fitbit count in your daily totals."
              : "What you log stays in Halo on this phone. Halo doesn’t write to Health Connect."}
      </Sentence>

      {vm.recent.length > 0 && (
        <View style={{ marginTop: 20, gap: 10 }}>
          <SectionLabel>Last 14 days</SectionLabel>
          <View accessibilityLabel="Logged in the last 14 days" style={{ borderRadius: 32, borderWidth: 1, borderColor: c.edge, backgroundColor: c.card, ...(c.shadow ? { boxShadow: c.shadow } : null), overflow: "hidden", paddingVertical: 4 }}>
            {recent.map((e, i) => {
              // Entries read from Health Connect were logged in Fitbit: shown as such, and never deleted from here
              // (Pulse doesn't write to Health Connect; they go when they are deleted in Fitbit).
              const external = e.source === "health_connect";
              const whenLine = e.type === "menstrual-period" ? e.day : when(e.ts, vm.today, vm.timeZone);
              return (
                <React.Fragment key={e.id}>
                  {i > 0 && <Hairline inset={16 + 40 + 14} />}
                  {/* The tile and the delete button on the title and its time (21 + 2 + 18), whatever wraps; an entry
                      logged in Fitbit keeps the button's column, so every row's lines wrap at one width. */}
                  <View style={{ minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 14, paddingLeft: 16, paddingRight: 6, paddingVertical: 11 }}>
                    <View style={{ marginTop: (ENTRY_BAND - 40) / 2 }}>
                      <IconTile icon={TYPE_ICON[e.type]} tint={TYPE_TINT[e.type]} size={40} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
                        {e.title}
                        <Txt size={15} lineHeight={21} weight={400} style={{ color: c.sub }}>{`  ${e.detail}`}</Txt>
                      </Txt>
                      <Txt size={13} lineHeight={18} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
                        {external ? `${whenLine} · Logged in Fitbit` : whenLine}
                      </Txt>
                    </View>
                    {external ? (
                      <View style={{ width: 44 }} />
                    ) : (
                      <Pressable
                        onPress={() => setRemove(e)}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${e.title.toLowerCase()}, ${e.detail}`}
                        style={({ pressed }) => ({ width: 44, height: 44, marginTop: (ENTRY_BAND - 44) / 2, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.ground : "transparent" })}
                      >
                        <Trash2 size={19} color={c.faint} strokeWidth={1.75} />
                      </Pressable>
                    )}
                  </View>
                </React.Fragment>
              );
            })}
            {vm.recent.length > 6 && (
              <>
                <Hairline />
                <CalmButton variant="quiet" size="md" onPress={() => setAll((x) => !x)} style={{ alignSelf: "stretch" }}>
                  {all ? "Show less" : `Show all ${vm.recent.length}`}
                </CalmButton>
              </>
            )}
          </View>
        </View>
      )}

      <BottomSheet
        open={kind !== null}
        onClose={() => !saving && shut()}
        title={`Log ${KIND_LABEL[shown].toLowerCase()}`}
        description={demo ? "Demo: saved in Halo only" : "Saved in Halo on this phone"}
        footer={
          <View style={{ gap: 10, alignSelf: "stretch" }}>
            {error ? <ErrorAlert>{error}</ErrorAlert> : null}
            <CalmButton onPress={save} disabled={saving} style={{ alignSelf: "stretch", minHeight: 56, borderRadius: 28 }}>
              {saving ? "Saving…" : "Save"}
            </CalmButton>
          </View>
        }
      >
        {shown === "water" && (
          <>
            <Section title="Add" first>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {WATER_STEPS.map((ml) => (
                  <CalmButton key={ml} variant="secondary" on="card" grow disabled={saving} style={{ minHeight: 56, borderRadius: 28 }} onPress={() => void send({ kind: "water", ml, at: at.trim().replace(/\s+/, "T") }, false)} accessibilityLabel={`+${ml} ml`}>
                    <Droplet size={20} color={c.tintInk.sky} strokeWidth={1.75} />
                    <Num value={`+${ml}`} unit="ml" size={18} />
                  </CalmButton>
                ))}
              </View>
              <View accessible accessibilityLabel={`Today: ${grouped(vm.waterToday)} ml`} accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: 4 }}>
                <Txt size={11} lineHeight={15} weight={600} style={{ color: c.faint, letterSpacing: 1.4 }}>
                  TODAY
                </Txt>
                <Num value={grouped(vm.waterToday)} unit="ml" size={18} color={c.tintInk.sky} />
              </View>
            </Section>
            <Section title="Other amount">
              {numeric("ml", "Amount", "(ml)", { placeholder: "e.g. 330" })}
              {timeField}
            </Section>
          </>
        )}

        {shown === "weight" && (
          <Section title="Measurement" first>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {numeric("kg", "Weight", "(kg)", { decimal: true })}
              {numeric("fat", "Body fat", "(%)", { decimal: true, placeholder: "Optional" })}
            </View>
            {timeField}
          </Section>
        )}

        {shown === "spo2" && (
          <Section title="Reading" first>
            {numeric("pct", "Blood oxygen", "(%)", { decimal: true, placeholder: "e.g. 95" })}
            <Sentence style={{ paddingHorizontal: 4 }}>The morning reading from the Fitbit app (Google Health doesn’t share blood oxygen with Health Connect).</Sentence>
            {timeField}
          </Section>
        )}

        {shown === "mood" && (
          <>
            <Section title="Overall" first>
              <Chips label="Overall" options={VALENCES} value={form.valence as string} onChange={set("valence")} />
            </Section>
            <Section title="Feelings">
              <Chips label="Feelings" options={MOODS} value={form.moods as string[]} onChange={set("moods")} />
            </Section>
            <Section title="When">{timeField}</Section>
          </>
        )}

        {shown === "symptoms" && (
          <>
            <Section title="Symptoms" first>
              <Chips
                label="Symptoms"
                options={SYMPTOMS.filter((s) => vm.kinds.includes("period") || !CYCLE_SYMPTOMS.has(s[0]))}
                value={form.symptoms as string[]}
                onChange={set("symptoms")}
              />
            </Section>
            <Section title="When">{timeField}</Section>
          </>
        )}

        {shown === "period" && (
          <>
            <Section title="Days" first>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Field label="First day" style={{ flex: 1 }}>
                  <TextField value={form.start as string} onChangeText={(t) => set("start")(t)} placeholder={vm.today} keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel="First day" numeric />
                </Field>
                <Field label="Last day" style={{ flex: 1 }}>
                  <TextField value={form.end as string} onChangeText={(t) => set("end")(t)} placeholder={vm.today} keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel="Last day" numeric />
                </Field>
              </View>
              <Sentence style={{ paddingHorizontal: 4 }}>Still going? Use today as the last day, and log it again once it ends.</Sentence>
            </Section>
            <Section title="Flow">
              <Chips label="Flow" options={FLOWS} value={form.flow as string} onChange={set("flow")} />
            </Section>
          </>
        )}

        {shown === "ovulation" && (
          <>
            <Section title="Result" first>
              <Chips label="Result" options={OVULATION_RESULTS} value={form.result as string} onChange={set("result")} />
            </Section>
            <Section title="When">{timeField}</Section>
          </>
        )}
      </BottomSheet>

      {food && (
        <FoodSheet key={food.id} request={food} open={foodOpen} onClose={() => setFoodOpen(false)} today={vm.foodToday} overviewLink />
      )}

      <ConfirmDialog
        open={remove !== null}
        onClose={() => !removing && setRemove(null)}
        title="Delete this entry?"
        description={`${remove ? `${remove.title}, ${remove.detail}. ` : ""}It is deleted from Halo.`}
        actions={[
          <DialogAction key="keep" label="Keep" onPress={() => setRemove(null)} disabled={removing} />,
          <DialogAction key="delete" label={removing ? "Deleting…" : "Delete"} variant="outline" danger onPress={() => void confirmRemove()} disabled={removing} />,
        ]}
      />
    </>
  );
}

/** The Log's loading shape: three rows of two tiles. */
export function LogSkeleton() {
  return (
    <View style={{ gap: TILE_GAP }}>
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", gap: TILE_GAP }}>
          <Skeleton radius={24} style={{ flex: 1, height: TILE_HEIGHT }} />
          <Skeleton radius={24} style={{ flex: 1, height: TILE_HEIGHT }} />
        </View>
      ))}
    </View>
  );
}
