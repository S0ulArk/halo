// Nutrition `/nutrition` (a phone-only screen): today's calories, protein, carbs and fat against the person's targets
// (protein 1.6 g per kg of their weight by default, worded in pounds when they chose them; all four editable), their
// 7- and 30-day daily averages, daily protein and calories over the last month, and today's food: Pulse's entries to
// edit or delete, Fitbit's read-only.
// Opened from the Journal's food sheet and from Today's journal card.
//
// In the Apple Health look: today's card leads with a ring for the calories (it sweeps in on the ring spring, the number
// rolling into place in its middle) beside capsule meters for protein, carbs and fat (each growing in its own colour),
// then "Add food", today's food as inset grouped lists by meal, the targets as an iOS list with "Edit", the averages as
// Health cards and the month as Apple Health's bars. The food and targets sheets are iOS sheets.
import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Camera, ChartColumn, Pencil, Plus, Sparkles, Trash2, TriangleAlert, Utensils, type LucideIcon } from "lucide-react-native";
import { FORMATS } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { KG_PER_LB, roundTo } from "@/lib/units";
import { progressOf, PROTEIN_G_PER_KG, TARGET_KEYS, TARGET_LIMITS, parseTarget, type CustomTargets, type TargetKey, type Targets } from "@/nutrition/targets";
import { useUnits } from "@/state/units";
import { deleteLogEntry, setFoodSeparate } from "@/screens/journal/actions";
import { useActionCtx } from "@/screens/journal/AddBehaviour";
import { ConfirmDialog, DialogAction, ErrorAlert, Field, TextField, toast } from "@/screens/journal/controls";
import { when } from "@/screens/journal/forms";
import { bumpJournal, useJournalVersion } from "@/screens/journal/state";
import { DetailScreen, LoadError } from "@/screens/detail/DetailScreen";
import { useBack, useRefresh } from "@/screens/detail/nav";
import { EditLink, HomeCard } from "@/screens/home/controls";
import { CalmButton, CalmSegmented, IconTile, LIST_RADIUS, Notice, Num, SectionLabel, Sentence, Surface, useCalm } from "@/screens/settings/calmKit";
import { getNutrition, type Averages, type FoodItem, type MealGroup, type NutritionVM } from "@/queries/nutrition";
import { useApp, useQuery } from "@/state/app";
import { useNutritionTargets } from "@/state/nutrition";
import { BottomSheet, Skeleton, SkeletonText, TrendChart, Txt, type TrendPoint } from "@/ui";
import { CapsuleMeter } from "@/ui/components/CapsuleMeter";
import { HaloRing, RING_LAND_MS, RollingNumber } from "@/ui/components/Halo";
import { font } from "@/ui/fonts";
import type { CalmTint } from "@/ui/calm";
import { FoodSheet, foodRequest, type FoodRequest } from "./FoodSheet";

const grouped = (v: number) => FORMATS.grouped(v);
const grams = (v: number) => FORMATS.int(v);
/** A value, or the missing dash. */
const show = (v: number | null, f: (x: number) => string) => (v === null ? "--" : f(v));

// ── Today ───────────────────────────────────────────────────────────────────

/** Each macro's colour, so the three meters read apart at a glance: protein blue, carbs orange, fat indigo. */
const MACRO_TINT: Record<"protein" | "carbs" | "fat", CalmTint> = { protein: "sky", carbs: "peach", fat: "lavender" };

/** "46 g to go", "12 g over your target" or "Target reached": what is left of a target. */
const leftText = (left: number, unit: string) => (left > 0 ? `${unit === "kcal" ? grouped(left) : grams(left)} ${unit} left of your target` : left < 0 ? `${unit === "kcal" ? grouped(-left) : grams(-left)} ${unit} over your target` : "Target reached");

/**
 * A macro against its target, Apple Health's way: its name in its colour, "82 g of 128 g", and a capsule growing in to
 * its share (the first frame shows the track).
 */
function MacroBar({ macro, label, value, target }: { macro: keyof typeof MACRO_TINT; label: string; value: number | null; target: number }) {
  const c = useCalm();
  const ink = c.tintInk[MACRO_TINT[macro]];
  const p = progressOf(value, target) ?? 0;
  return (
    <View accessible accessibilityLabel={`${label}: ${value === null ? "none" : `${grams(value)} g`} of ${grams(target)} g`} style={{ gap: 5 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 6 }}>
        <Txt size={15} lineHeight={20} weight={600} style={{ color: ink }}>
          {label}
        </Txt>
        <Txt size={15} lineHeight={20} style={[font.numeric(700), { color: c.ink }]}>
          {`${show(value, grams)} g`}
        </Txt>
        <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
          {`of ${grams(target)} g`}
        </Txt>
      </View>
      <CapsuleMeter frac={p} color={ink} height={8} track={c.fill} grow />
    </View>
  );
}

/** The calories ring's size. */
const RING = 132;

/**
 * Today's card: the calories as a ring against the target (the number rolling into place in its middle), the three
 * macros as capsule meters beside it, what is left of the target, and the fiber when known.
 */
function TodayCard({ vm }: { vm: NutritionVM }) {
  const c = useCalm();
  const { totals: t, targets } = vm;
  const kcal = targets.kcal.value;
  const left = t.kcal === null ? kcal : kcal - t.kcal;
  const proteinLeft = t.protein === null ? targets.protein.value : targets.protein.value - t.protein;
  return (
    <HomeCard icon={Utensils} iconTint="sand" title={t.kcal === null ? "Nothing logged today" : "Today so far"} gap={16} style={{ alignSelf: "stretch" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <View accessible accessibilityLabel={`${show(t.kcal, grouped)} of ${grouped(kcal)} kcal`}>
          <HaloRing size={RING} stroke={14} progress={progressOf(t.kcal, kcal)} track={c.tint.sand} color={c.tintInk.sand} colors={c.vivid.sand} delay={120}>
            <View style={{ alignItems: "center" }}>
              {t.kcal === null ? (
                <Txt size={26} lineHeight={30} style={[font.numberAt(26), { color: c.faint }]}>
                  --
                </Txt>
              ) : (
                <RollingNumber text={grouped(t.kcal)} lineHeight={30} delay={120} duration={RING_LAND_MS} style={[font.numberAt(26, 800), { color: c.ink }]} />
              )}
              <Txt size={12} lineHeight={15} style={[font.numeric(500), { color: c.sub }]}>
                {`of ${grouped(kcal)} kcal`}
              </Txt>
            </View>
          </HaloRing>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
          <MacroBar macro="protein" label="Protein" value={t.protein} target={targets.protein.value} />
          <MacroBar macro="carbs" label="Carbs" value={t.carbs} target={targets.carbs.value} />
          <MacroBar macro="fat" label="Fat" value={t.fat} target={targets.fat.value} />
        </View>
      </View>
      <View style={{ gap: 2 }}>
        <Sentence>{left === 0 ? "Calorie target reached" : `Calories: ${leftText(left, "kcal")}`}</Sentence>
        <Sentence>{proteinLeft === 0 ? "Protein target reached" : `Protein: ${proteinLeft > 0 ? `${grams(proteinLeft)} g to go` : `${grams(-proteinLeft)} g over your target`}`}</Sentence>
      </View>
      {t.fiber !== null && (
        <View accessible style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 6 }}>
          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
            Fiber
          </Txt>
          <Num value={grams(t.fiber)} unit="g" size={17} />
          <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
            from food logged in Halo
          </Txt>
        </View>
      )}
    </HomeCard>
  );
}

// ── Targets ─────────────────────────────────────────────────────────────────

const TARGET_LABEL: Record<TargetKey, string> = { kcal: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat" };
const unitOf = (k: TargetKey) => TARGET_LIMITS[k].unit;
const valueText = (k: TargetKey, v: number) => `${k === "kcal" ? grouped(v) : grams(v)} ${unitOf(k)}`;

/** The four targets as an iOS list, each with where it comes from, "Edit" beside the header. */
function TargetsCard({ targets, onEdit }: { targets: Targets; onEdit: () => void }) {
  const c = useCalm();
  return (
    <View style={{ gap: 6 }}>
      <SectionLabel right={<EditLink accessibilityLabel="Edit targets" onPress={onEdit} />} style={{ alignItems: "center", minHeight: 30 }}>
        Daily targets
      </SectionLabel>
      <View style={{ borderRadius: LIST_RADIUS, backgroundColor: c.card, overflow: "hidden" }}>
        {TARGET_KEYS.map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: c.line }} />}
            <View accessible accessibilityLabel={`${TARGET_LABEL[k]} target ${valueText(k, targets[k].value)}. ${targets[k].basis}`} style={{ minHeight: 52, paddingHorizontal: 16, paddingVertical: 11, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <Txt size={16} lineHeight={21} style={{ color: c.ink, flexShrink: 1 }}>
                  {TARGET_LABEL[k]}
                </Txt>
                <Txt size={16} lineHeight={21} style={[font.numeric(500), { color: c.sub }]}>
                  {valueText(k, targets[k].value)}
                </Txt>
              </View>
              <Txt size={13} lineHeight={18} style={{ color: targets[k].custom ? c.tintInk.sand : c.sub }}>
                {targets[k].basis}
              </Txt>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/** Edit the targets: a field each, blank for Pulse's suggestion (shown as the placeholder). */
function TargetsSheet({ open, onClose, suggested, custom, onSave }: { open: boolean; onClose: () => void; suggested: Targets; custom: CustomTargets; onSave: (next: CustomTargets) => Promise<void> }) {
  const [text, setText] = React.useState<Record<TargetKey, string>>(() => Object.fromEntries(TARGET_KEYS.map((k) => [k, custom[k] === null ? "" : String(custom[k])])) as Record<TargetKey, string>);
  const [errors, setErrors] = React.useState<Partial<Record<TargetKey, string>>>({});
  const [saving, setSaving] = React.useState(false);
  // The protein rate in the person's weight unit (Settings › Units): 1.6 g per kg is 0.73 g per lb.
  const { units } = useUnits();
  const proteinRate = units.weight === "lb" ? `${roundTo(PROTEIN_G_PER_KG * KG_PER_LB, 2)} g per lb` : `${PROTEIN_G_PER_KG} g per kg`;
  const save = async (next?: CustomTargets) => {
    let out = next;
    if (!out) {
      const parsed = TARGET_KEYS.map((k) => [k, parseTarget(k, text[k])] as const);
      const bad = Object.fromEntries(parsed.filter(([, p]) => p.error).map(([k, p]) => [k, p.error!]));
      setErrors(bad);
      if (Object.keys(bad).length) return;
      out = Object.fromEntries(parsed.map(([k, p]) => [k, p.value])) as CustomTargets;
    }
    setSaving(true);
    try {
      await onSave(out);
      onClose();
      toast("Targets saved");
    } catch {
      toast("Couldn’t save that on this phone. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <BottomSheet
      open={open}
      onClose={() => !saving && onClose()}
      title="Daily targets"
      description="Leave a field blank for Halo’s suggestion"
      done={{ label: saving ? "Saving…" : "Save", onPress: () => void save(), disabled: saving }}
      footer={
        <CalmButton variant="secondary" onPress={() => void save({ kcal: null, protein: null, carbs: null, fat: null })} disabled={saving} style={{ alignSelf: "stretch" }}>
          Use Halo’s suggestions
        </CalmButton>
      }
    >
      <View style={{ gap: 16, paddingTop: 4 }}>
        {TARGET_KEYS.map((k) => (
          <Field key={k} label={TARGET_LABEL[k]} hint={`(${unitOf(k)} a day)`}>
            <TextField
              value={text[k]}
              onChangeText={(t) => {
                setText((x) => ({ ...x, [k]: t }));
                setErrors((e) => ({ ...e, [k]: undefined }));
              }}
              placeholder={`Halo suggests ${valueText(k, suggested[k].value)}`}
              keyboardType="number-pad"
              autoComplete="off"
              accessibilityLabel={`${TARGET_LABEL[k]} target`}
              invalid={!!errors[k]}
              numeric
            />
            {errors[k] ? <ErrorAlert>{errors[k]!}</ErrorAlert> : null}
          </Field>
        ))}
        <Sentence size={13} style={{ paddingHorizontal: 4 }}>
          {`Protein is suggested at ${proteinRate} of your latest weight, calories at what you burn on an average day, fat at 30% of the calories and carbs from the rest.`}
        </Sentence>
      </View>
    </BottomSheet>
  );
}

// ── Averages ────────────────────────────────────────────────────────────────

/** One period's daily averages as a Health tile: its name in the nutrition colour, the calories, each macro in its colour, then how many days had food. */
function AverageTile({ title, a }: { title: string; a: Averages }) {
  const c = useCalm();
  return (
    <Surface padding={16} gap={8} style={{ flex: 1, minWidth: 0 }}>
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.tintInk.sand }}>
        {title}
      </Txt>
      {a.days === 0 ? (
        <Sentence size={13}>No days with food logged yet.</Sentence>
      ) : (
        <>
          <Num value={show(a.kcal, grouped)} unit="kcal" size={24} />
          <View style={{ gap: 4 }}>
            {(
              [
                ["protein", "protein"],
                ["carbs", "carbs"],
                ["fat", "fat"],
              ] as const
            ).map(([k, word]) => (
              <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.tintInk[MACRO_TINT[k]] }} />
                <Num value={show(a[k], grams)} unit={`g ${word}`} size={16} />
              </View>
            ))}
          </View>
          <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
            {`${a.days} of ${a.span} days logged`}
          </Txt>
        </>
      )}
    </Surface>
  );
}

// ── Chart ───────────────────────────────────────────────────────────────────

type ChartKey = "protein" | "kcal";

function HistoryChart({ vm }: { vm: NutritionVM }) {
  const [key, setKey] = React.useState<ChartKey>("protein");
  const points: TrendPoint[] = vm.history.map((h) => ({ date: h.day, value: h[key], ...(h.provisional && { provisional: true }) }));
  const data: Metric<TrendPoint[]> = points.some((p) => p.value !== null) ? { value: points, reason: null, provisional: false } : { value: null, reason: "no_data", provisional: false };
  const target = key === "protein" ? vm.targets.protein.value : vm.targets.kcal.value;
  return (
    <View style={{ gap: 6 }}>
      <SectionLabel>Daily protein and calories</SectionLabel>
      <Surface gap={16}>
        <CalmSegmented
          value={key}
          onChange={setKey}
          accessibilityLabel="Chart"
          items={[
            { value: "protein", label: "Protein" },
            { value: "kcal", label: "Calories" },
          ]}
        />
        <TrendChart
          key={key}
          label={key === "protein" ? "Protein" : "Calories eaten"}
          unit={key === "protein" ? "g" : "kcal"}
          format={key === "protein" ? "int" : "grouped"}
          colorBy="single"
          data={data}
          ranges={["w", "m"]}
          defaultRange="w"
          reference={{ y: target, label: "Target" }}
          today={vm.today}
        />
        <Sentence size={13}>Today’s bar is faded until the day is over. The line is your target.</Sentence>
      </Surface>
    </View>
  );
}

// ── Today's food ────────────────────────────────────────────────────────────

const VIA_ICON: Record<NonNullable<FoodItem["via"]>, LucideIcon> = { photo: Camera, text: Sparkles, manual: Utensils };

/** "320 kcal · 11 g protein · 40 g carbs · 9 g fat" for one food. */
const numbersOf = (f: FoodItem) =>
  [`${grouped(f.kcal)} kcal`, f.protein !== null && `${grams(f.protein)} g protein`, f.carbs !== null && `${grams(f.carbs)} g carbs`, f.fat !== null && `${grams(f.fat)} g fat`].filter(Boolean).join(" · ");

/** A small blue text button under a row's lines. */
function RowLink({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  const c = useCalm();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={{ top: 12, bottom: 12, left: 4, right: 12 }} style={({ pressed }) => ({ alignSelf: "flex-start", marginTop: 4, opacity: pressed ? 0.6 : 1 })}>
      <Txt size={14} lineHeight={19} weight={500} style={{ color: c.teal }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * One food: its icon (how it was logged), name and portion, numbers, time and source; edit and delete for Pulse's. A
 * Pulse entry taken for a repeat of a Fitbit one says so, numbers struck through, with "Count it too" for when it isn't.
 */
function FoodRow({ f, today, timeZone, onEdit, onDelete, onSeparate }: { f: FoodItem; today: string; timeZone: string; onEdit: () => void; onDelete: () => void; onSeparate: (separate: boolean) => void }) {
  const c = useCalm();
  const mine = f.source === "pulse";
  const time = when(f.ts, today, timeZone).replace(/^Today, /, "");
  const from = !mine
    ? "Logged in Fitbit"
    : f.duplicateOf
      ? "Also in Fitbit’s log: counted once"
      : f.separate
        ? "Counted as its own food"
        : f.via === "photo"
          ? "From a photo"
          : f.via === "text"
            ? "From a description"
            : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingLeft: 16, paddingRight: 6, paddingVertical: 11 }}>
      <View style={{ marginTop: 2 }}>
        <IconTile icon={mine ? VIA_ICON[f.via ?? "manual"] : Utensils} tint={mine ? "sand" : "sky"} size={30} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={16} lineHeight={21} style={{ color: f.duplicateOf ? c.sub : c.ink }}>
          {f.title}
          {f.portion ? <Txt size={15} lineHeight={21} weight={400} style={{ color: c.sub }}>{`  ${f.portion}`}</Txt> : null}
        </Txt>
        <Txt size={14} lineHeight={19} style={{ color: f.duplicateOf ? c.faint : c.sub, fontVariant: ["tabular-nums"], textDecorationLine: f.duplicateOf ? "line-through" : "none" }}>
          {numbersOf(f)}
        </Txt>
        <Txt size={13} lineHeight={18} style={{ color: f.duplicateOf ? c.tintInk.sand : c.sub, fontVariant: ["tabular-nums"] }}>
          {from ? `${time} · ${from}` : time}
        </Txt>
        {f.duplicateOf && <RowLink label="Not the same food? Count it too" accessibilityLabel={`${f.title} is a different food: count it too`} onPress={() => onSeparate(true)} />}
        {f.separate && !f.duplicateOf && <RowLink label="Undo" accessibilityLabel={`Let Halo match ${f.title} with Fitbit’s log again`} onPress={() => onSeparate(false)} />}
      </View>
      {mine ? (
        <View style={{ flexDirection: "row" }}>
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${f.title}`} style={({ pressed }) => ({ width: 40, height: 44, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.fill : "transparent" })}>
            <Pencil size={18} color={c.teal} strokeWidth={2} />
          </Pressable>
          <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`Delete ${f.title}`} style={({ pressed }) => ({ width: 40, height: 44, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.fill : "transparent" })}>
            <Trash2 size={18} color={c.sub} strokeWidth={2} />
          </Pressable>
        </View>
      ) : (
        <View style={{ width: 80 }} />
      )}
    </View>
  );
}

function MealList({ vm, google, onEdit, onDelete, onSeparate, onAdd }: { vm: NutritionVM; google: boolean; onEdit: (f: FoodItem) => void; onDelete: (f: FoodItem) => void; onSeparate: (f: FoodItem, separate: boolean) => void; onAdd: () => void }) {
  const c = useCalm();
  const { meals, unlisted } = vm;
  if (!meals.length && !unlisted)
    return (
      <View style={{ gap: 6 }}>
        <SectionLabel>Today’s food</SectionLabel>
        <Surface gap={14} style={{ alignItems: "center" }}>
          <Sentence align="center" style={{ maxWidth: 300 }}>
            Nothing logged today. Add a meal with a photo, a few words, or its numbers.
          </Sentence>
          <CalmButton size="md" icon={Plus} onPress={onAdd}>
            Add food
          </CalmButton>
        </Surface>
      </View>
    );
  return (
    <View style={{ gap: 18 }}>
      <Txt size={22} lineHeight={28} weight={700} accessibilityRole="header" style={{ color: c.ink, paddingHorizontal: 4 }}>
        Today’s food
      </Txt>
      {meals.map((g: MealGroup) => (
        <View key={g.meal} style={{ gap: 6 }}>
          {/* The meal as the list's header, its calories on the right. */}
          <SectionLabel right={<Txt size={13} lineHeight={18} style={[font.numeric(600), { color: c.sub }]}>{`${grouped(g.kcal)} KCAL`}</Txt>}>{g.label}</SectionLabel>
          <View style={{ borderRadius: LIST_RADIUS, backgroundColor: c.card, overflow: "hidden" }}>
            {g.items.map((f, i) => (
              <React.Fragment key={f.id}>
                {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16 + 30 + 12, backgroundColor: c.line }} />}
                <FoodRow f={f} today={vm.today} timeZone={vm.timeZone} onEdit={() => onEdit(f)} onDelete={() => onDelete(f)} onSeparate={(x) => onSeparate(f, x)} />
              </React.Fragment>
            ))}
          </View>
          {g.overlap && (
            <Notice tint="sand" icon={TriangleAlert}>
              {`${g.label} is logged in both Halo and Fitbit under different names. If it’s the same food, delete the Halo entry so it counts once.`}
            </Notice>
          )}
        </View>
      ))}
      {unlisted && (
        <Surface gap={4}>
          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
            More from Fitbit’s food log
          </Txt>
          <Txt size={14} lineHeight={19} style={{ color: c.ink, fontVariant: ["tabular-nums"] }}>
            {[unlisted.kcal !== null && `${grouped(unlisted.kcal)} kcal`, unlisted.protein !== null && `${grams(unlisted.protein)} g protein`, unlisted.carbs !== null && `${grams(unlisted.carbs)} g carbs`, unlisted.fat !== null && `${grams(unlisted.fat)} g fat`]
              .filter(Boolean)
              .join(" · ")}
          </Txt>
          <Sentence size={13}>
            {google ? "Your Google account sends the day’s total, not each food, so it counts here as one line." : "Fitbit’s daily total holds more than the foods listed here, so the rest counts as one line."}
          </Sentence>
        </Surface>
      )}
    </View>
  );
}

// ── The screen ──────────────────────────────────────────────────────────────

/** Today's card while it loads: its head, the ring's bare track beside three meters' bars, the line under them. */
function Loading() {
  const c = useCalm();
  return (
    <View style={{ alignSelf: "stretch" }}>
      <Surface gap={16}>
        <SkeletonText role="body" width="40%" />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: 14, borderColor: c.tint.sand }} />
          <View style={{ flex: 1, gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ gap: 6 }}>
                <SkeletonText size={15} lineHeight={20} width="70%" />
                <Skeleton radius={4} style={{ height: 8 }} />
              </View>
            ))}
          </View>
        </View>
        <SkeletonText role="body" width="60%" />
      </Surface>
    </View>
  );
}

export default function NutritionScreen() {
  const app = useApp();
  const onBack = useBack("/journal");
  const { refreshing, onRefresh, retry } = useRefresh();
  const version = useJournalVersion();
  const actx = useActionCtx();
  const { custom, ready, save } = useNutritionTargets();
  // No shared cache key: a food logged a moment ago shows at once (the journal version), whatever the scoring run.
  const q = useQuery((ctx) => (ready ? getNutrition(ctx, custom) : Promise.resolve(null)), [version, custom, ready]);
  const vm = q.data ?? undefined;

  const [food, setFood] = React.useState<FoodRequest | null>(null);
  const [foodOpen, setFoodOpen] = React.useState(false);
  const [targetsOpen, setTargetsOpen] = React.useState(false);
  const [targetsKey, setTargetsKey] = React.useState(0);
  const [remove, setRemove] = React.useState<FoodItem | null>(null);
  const [removing, setRemoving] = React.useState(false);

  const openFood = (edit: FoodItem | null = null) => {
    setFood(foodRequest(app.timeZone, edit));
    setFoodOpen(true);
  };
  const openTargets = () => {
    setTargetsKey((k) => k + 1);
    setTargetsOpen(true);
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
    app.dataChanged();
  };

  const separate = async (f: FoodItem, on: boolean) => {
    if (!actx) return;
    const r = await setFoodSeparate(actx, { id: f.id, ts: f.ts, separate: on }).catch(() => ({ ok: false as const, error: "network" }));
    if (!r.ok) return toast("Couldn’t change that. Try again.");
    toast(on ? `${f.title} now counts too` : `Halo matches ${f.title} with Fitbit again`);
    bumpJournal();
    app.dataChanged();
  };

  const common = { title: "Nutrition", onBack, refreshing, onRefresh } as const;
  if (q.error && !vm) return <DetailScreen {...common} primary={<LoadError onRetry={retry} />} />;

  return (
    <>
      <DetailScreen
        {...common}
        hero={vm ? <TodayCard vm={vm} /> : <Loading />}
        primary={
          vm ? (
            <View style={{ gap: 28 }}>
              <CalmButton icon={Plus} onPress={() => openFood()} style={{ alignSelf: "stretch" }}>
                Add food
              </CalmButton>
              <MealList vm={vm} google={app.source === "google"} onEdit={(f) => openFood(f)} onDelete={setRemove} onSeparate={(f, on) => void separate(f, on)} onAdd={() => openFood()} />
              <TargetsCard targets={vm.targets} onEdit={openTargets} />
              <View style={{ gap: 6 }}>
                <SectionLabel>Daily averages</SectionLabel>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <AverageTile title="Last 7 days" a={vm.week} />
                  <AverageTile title="Last 30 days" a={vm.month} />
                </View>
                <Sentence size={13} style={{ paddingHorizontal: 4 }}>
                  Over the days with food logged, before today. A day you logged nothing doesn’t pull the average down.
                </Sentence>
              </View>
              <HistoryChart vm={vm} />
            </View>
          ) : null
        }
        footer={
          vm ? (
            <HomeCard icon={ChartColumn} iconTint="sand" title="How Halo counts food" gap={10}>
              <Sentence>
                {app.source === "google"
                  ? "Totals add what you log in Halo to the food your Google account reports from Fitbit. Halo can’t see Fitbit’s single foods there, so log each meal in one app."
                  : "Totals add what you log in Halo to the food logged in Fitbit (read from Health Connect). A food logged in both apps counts once: when Fitbit has the same food at the same meal, or the same calories within an hour and a half, Halo leaves its own entry out."}
              </Sentence>
              <Sentence>Photo and description estimates come from your own AI provider and are approximate. Halo never keeps the photo.</Sentence>
            </HomeCard>
          ) : null
        }
      />
      {food && <FoodSheet key={food.id} request={food} open={foodOpen} onClose={() => setFoodOpen(false)} />}
      {vm && <TargetsSheet key={targetsKey} open={targetsOpen} onClose={() => setTargetsOpen(false)} suggested={vm.suggested} custom={custom} onSave={save} />}
      <ConfirmDialog
        open={remove !== null}
        onClose={() => !removing && setRemove(null)}
        title="Delete this food?"
        description={`${remove ? `${remove.title}, ${numbersOf(remove)}. ` : ""}It is deleted from Halo.`}
        actions={[
          <DialogAction key="keep" label="Keep" onPress={() => setRemove(null)} disabled={removing} />,
          <DialogAction key="delete" label={removing ? "Deleting…" : "Delete"} variant="outline" danger onPress={() => void confirmRemove()} disabled={removing} />,
        ]}
      />
    </>
  );
}
