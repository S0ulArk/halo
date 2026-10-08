// Nutrition `/nutrition` (a phone-only screen): today's calories, protein, carbs and fat against the person's targets
// (protein 1.6 g per kg of their weight by default; all four editable), their 7- and 30-day daily averages, daily
// protein and calories over the last month, and today's food: Pulse's entries to edit or delete, Fitbit's read-only.
// Opened from the Journal's food sheet and from Today's journal card. Calm: the sand pastel of nutrition.
import * as React from "react";
import { Pressable, View } from "react-native";
import { Camera, ChartColumn, Pencil, Plus, Sparkles, Trash2, TriangleAlert, Utensils, type LucideIcon } from "lucide-react-native";
import { FORMATS } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { progressOf, TARGET_KEYS, TARGET_LIMITS, parseTarget, type CustomTargets, type TargetKey, type Targets } from "@/nutrition/targets";
import { deleteLogEntry, setFoodSeparate } from "@/screens/journal/actions";
import { useActionCtx } from "@/screens/journal/AddBehaviour";
import { ConfirmDialog, DialogAction, ErrorAlert, Field, TextField, toast } from "@/screens/journal/controls";
import { when } from "@/screens/journal/forms";
import { bumpJournal, useJournalVersion } from "@/screens/journal/state";
import { CalmCard as LeadCard } from "@/screens/detail/calmKit";
import { DetailScreen, LoadError } from "@/screens/detail/DetailScreen";
import { useBack, useRefresh } from "@/screens/detail/nav";
import { CalmButton, CalmCard, CalmProgress, CalmSegmented, Caption, Hairline, IconTile, Notice, Num, SectionLabel, Sentence, Surface, useCalm } from "@/screens/settings/calmKit";
import { getNutrition, type Averages, type FoodItem, type MealGroup, type NutritionVM } from "@/queries/nutrition";
import { useApp, useQuery } from "@/state/app";
import { useNutritionTargets } from "@/state/nutrition";
import { BottomSheet, Skeleton, SkeletonText, TrendChart, Txt, type TrendPoint } from "@/ui";
import { PillAction } from "@/ui/components/CalmSurface";
import { FoodSheet, foodRequest, type FoodRequest } from "./FoodSheet";

const grouped = (v: number) => FORMATS.grouped(v);
const grams = (v: number) => FORMATS.int(v);
/** A value, or the missing dash. */
const show = (v: number | null, f: (x: number) => string) => (v === null ? "--" : f(v));

// ── Today ───────────────────────────────────────────────────────────────────

/** A macro against its target: the caps label, "82 g of 128 g" and a thin sand bar. */
function MacroBar({ label, value, target, wide }: { label: string; value: number | null; target: number; wide?: boolean }) {
  const c = useCalm();
  const p = progressOf(value, target) ?? 0;
  const left = value === null ? target : target - value;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value === null ? "none" : `${grams(value)} g`} of ${grams(target)} g`}
      style={{ flex: wide ? undefined : 1, minWidth: 0, borderRadius: 20, backgroundColor: c.chip, padding: 14, gap: 8 }}
    >
      <Caption>{label}</Caption>
      <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 6 }}>
        <Num value={show(value, grams)} unit="g" size={wide ? 28 : 22} />
        <Txt size={13} lineHeight={18} weight={500} style={{ color: c.sub }}>
          {`of ${grams(target)} g`}
        </Txt>
      </View>
      <CalmProgress value={p} color={c.tintInk.sand} track={c.line} height={6} />
      {wide && (
        <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
          {left > 0 ? `${grams(left)} g to go` : left < 0 ? `${grams(-left)} g over your target` : "Target reached"}
        </Txt>
      )}
    </View>
  );
}

/** Today's card: calories big against the target, protein on its own row, carbs and fat beside each other, fiber when known. */
function TodayCard({ vm }: { vm: NutritionVM }) {
  const c = useCalm();
  const { totals: t, targets } = vm;
  const kcal = targets.kcal.value;
  const left = t.kcal === null ? kcal : kcal - t.kcal;
  return (
    <LeadCard tint="sand" icon={Utensils} title={t.kcal === null ? "Nothing logged today" : "Today so far"} gap={16} style={{ alignSelf: "stretch" }}>
      <View accessible accessibilityLabel={`${show(t.kcal, grouped)} of ${grouped(kcal)} kcal`} style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 8 }}>
          <Num value={show(t.kcal, grouped)} unit="kcal" size={44} color={c.tintInk.sand} />
          <Txt size={14} lineHeight={19} weight={500} style={{ color: c.sub }}>
            {`of ${grouped(kcal)}`}
          </Txt>
        </View>
        <CalmProgress value={progressOf(t.kcal, kcal) ?? 0} color={c.tintInk.sand} track={c.chip} />
        <Sentence>{left > 0 ? `${grouped(left)} kcal left of your target` : left < 0 ? `${grouped(-left)} kcal over your target` : "Calorie target reached"}</Sentence>
      </View>
      <MacroBar label="Protein" value={t.protein} target={targets.protein.value} wide />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <MacroBar label="Carbs" value={t.carbs} target={targets.carbs.value} />
        <MacroBar label="Fat" value={t.fat} target={targets.fat.value} />
      </View>
      {t.fiber !== null && (
        <View accessible style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 8, paddingHorizontal: 2 }}>
          <Caption>Fiber</Caption>
          <Num value={grams(t.fiber)} unit="g" size={18} />
          <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
            from food logged in Halo
          </Txt>
        </View>
      )}
    </LeadCard>
  );
}

// ── Targets ─────────────────────────────────────────────────────────────────

const TARGET_LABEL: Record<TargetKey, string> = { kcal: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat" };
const unitOf = (k: TargetKey) => TARGET_LIMITS[k].unit;
const valueText = (k: TargetKey, v: number) => `${k === "kcal" ? grouped(v) : grams(v)} ${unitOf(k)}`;

/** The four targets, each with where it comes from. */
function TargetsCard({ targets, onEdit }: { targets: Targets; onEdit: () => void }) {
  const c = useCalm();
  return (
    <View style={{ gap: 10 }}>
      <SectionLabel right={<PillAction label="Edit" onPress={onEdit} accessibilityLabel="Edit targets" />}>Daily targets</SectionLabel>
      <Surface padding={0}>
        {TARGET_KEYS.map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 && <Hairline inset={16} />}
            <View accessible accessibilityLabel={`${TARGET_LABEL[k]} target ${valueText(k, targets[k].value)}. ${targets[k].basis}`} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, flexShrink: 1 }}>
                  {TARGET_LABEL[k]}
                </Txt>
                <Num value={k === "kcal" ? grouped(targets[k].value) : grams(targets[k].value)} unit={unitOf(k)} size={18} />
              </View>
              <Txt size={13} lineHeight={18} style={{ color: targets[k].custom ? c.tintInk.sand : c.sub }}>
                {targets[k].basis}
              </Txt>
            </View>
          </React.Fragment>
        ))}
      </Surface>
    </View>
  );
}

/** Edit the targets: a field each, blank for Pulse's suggestion (shown as the placeholder). */
function TargetsSheet({ open, onClose, suggested, custom, onSave }: { open: boolean; onClose: () => void; suggested: Targets; custom: CustomTargets; onSave: (next: CustomTargets) => Promise<void> }) {
  const [text, setText] = React.useState<Record<TargetKey, string>>(() => Object.fromEntries(TARGET_KEYS.map((k) => [k, custom[k] === null ? "" : String(custom[k])])) as Record<TargetKey, string>);
  const [errors, setErrors] = React.useState<Partial<Record<TargetKey, string>>>({});
  const [saving, setSaving] = React.useState(false);
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
      footer={
        <View style={{ gap: 10, alignSelf: "stretch" }}>
          <CalmButton onPress={() => void save()} disabled={saving} style={{ alignSelf: "stretch", minHeight: 56, borderRadius: 28 }}>
            {saving ? "Saving…" : "Save"}
          </CalmButton>
          <CalmButton variant="quiet" on="card" onPress={() => void save({ kcal: null, protein: null, carbs: null, fat: null })} disabled={saving} style={{ alignSelf: "stretch" }}>
            Use Halo’s suggestions
          </CalmButton>
        </View>
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
          Protein is suggested at 1.6 g per kg of your latest weight, calories at what you burn on an average day, fat at 30% of the calories and carbs from the rest.
        </Sentence>
      </View>
    </BottomSheet>
  );
}

// ── Averages ────────────────────────────────────────────────────────────────

/** One period's daily averages as a tile: calories, then each macro with its word, then how many days had food. */
function AverageTile({ title, a }: { title: string; a: Averages }) {
  const c = useCalm();
  return (
    <Surface padding={16} gap={8} style={{ flex: 1, minWidth: 0 }}>
      <Caption>{title}</Caption>
      {a.days === 0 ? (
        <Sentence size={13}>No days with food logged yet.</Sentence>
      ) : (
        <>
          <Num value={show(a.kcal, grouped)} unit="kcal" size={22} color={c.tintInk.sand} />
          <View style={{ gap: 4 }}>
            {(
              [
                ["protein", "protein"],
                ["carbs", "carbs"],
                ["fat", "fat"],
              ] as const
            ).map(([k, word]) => (
              <Num key={k} value={show(a[k], grams)} unit={`g ${word}`} size={17} />
            ))}
          </View>
          <Txt size={12} lineHeight={16} weight={500} style={{ color: c.sub }}>
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
    <View style={{ gap: 10 }}>
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

/** A small teal text button under a row's lines. */
function RowLink({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  const c = useCalm();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={{ top: 12, bottom: 12, left: 4, right: 12 }} style={({ pressed }) => ({ alignSelf: "flex-start", marginTop: 4, opacity: pressed ? 0.6 : 1 })}>
      <Txt size={14} lineHeight={19} weight={600} style={{ color: c.teal }}>
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
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingLeft: 16, paddingRight: 6, paddingVertical: 12 }}>
      <View style={{ marginTop: 2 }}>
        <IconTile icon={mine ? VIA_ICON[f.via ?? "manual"] : Utensils} tint={mine ? "sand" : "sky"} size={40} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: f.duplicateOf ? c.sub : c.ink }}>
          {f.title}
          {f.portion ? <Txt size={15} lineHeight={21} weight={400} style={{ color: c.sub }}>{`  ${f.portion}`}</Txt> : null}
        </Txt>
        <Txt size={14} lineHeight={19} style={{ color: f.duplicateOf ? c.faint : c.ink, fontVariant: ["tabular-nums"], textDecorationLine: f.duplicateOf ? "line-through" : "none" }}>
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
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${f.title}`} style={({ pressed }) => ({ width: 40, height: 44, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.ground : "transparent" })}>
            <Pencil size={18} color={c.faint} strokeWidth={1.75} />
          </Pressable>
          <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`Delete ${f.title}`} style={({ pressed }) => ({ width: 40, height: 44, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.ground : "transparent" })}>
            <Trash2 size={18} color={c.faint} strokeWidth={1.75} />
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
      <View style={{ gap: 10 }}>
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
    <View style={{ gap: 10 }}>
      <SectionLabel>Today’s food</SectionLabel>
      {meals.map((g: MealGroup) => (
        <View key={g.meal} style={{ gap: 8 }}>
          <View style={{ borderRadius: 32, borderWidth: 1, borderColor: c.edge, backgroundColor: c.card, ...(c.shadow ? { boxShadow: c.shadow } : null), overflow: "hidden", paddingVertical: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 }}>
              <Caption>{g.label}</Caption>
              <Num value={grouped(g.kcal)} unit="kcal" size={15} />
            </View>
            {g.items.map((f, i) => (
              <React.Fragment key={f.id}>
                {i > 0 && <Hairline inset={16 + 40 + 12} />}
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

function Loading() {
  return (
    <View style={{ alignSelf: "stretch", gap: 14 }}>
      <Surface tint="sand" gap={14}>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Skeleton radius={14} style={{ width: 44, height: 44 }} />
          <SkeletonText role="body" width="40%" />
        </View>
        <SkeletonText role="value" size={44} lineHeight={50} chars={5} />
        <Skeleton radius={4} style={{ height: 8 }} />
        <Skeleton radius={20} style={{ height: 110 }} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Skeleton radius={20} style={{ flex: 1, height: 84 }} />
          <Skeleton radius={20} style={{ flex: 1, height: 84 }} />
        </View>
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
              <CalmButton icon={Plus} onPress={() => openFood()} style={{ alignSelf: "stretch", minHeight: 56, borderRadius: 28 }}>
                Add food
              </CalmButton>
              <MealList vm={vm} google={app.source === "google"} onEdit={(f) => openFood(f)} onDelete={setRemove} onSeparate={(f, on) => void separate(f, on)} onAdd={() => openFood()} />
              <TargetsCard targets={vm.targets} onEdit={openTargets} />
              <View style={{ gap: 10 }}>
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
            <CalmCard icon={ChartColumn} iconTint="sand" title="How Halo counts food" gap={12}>
              <Sentence>
                {app.source === "google"
                  ? "Totals add what you log in Halo to the food your Google account reports from Fitbit. Halo can’t see Fitbit’s single foods there, so log each meal in one app."
                  : "Totals add what you log in Halo to the food logged in Fitbit (read from Health Connect). A food logged in both apps counts once: when Fitbit has the same food at the same meal, or the same calories within an hour and a half, Halo leaves its own entry out."}
              </Sentence>
              <Sentence>Photo and description estimates come from your own AI provider and are approximate. Halo never keeps the photo.</Sentence>
            </CalmCard>
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
