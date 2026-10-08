// The food sheet: add food three ways (a photo, taken or chosen; a few words; or typed in), check an AI estimate as an
// editable list before saving, and edit a food logged in Pulse. Opened from the Journal's Food tile (Today's quick log
// lands there through `/journal?log=food`) and from Nutrition.
//
// Estimates use the person's own coach provider and key (Settings › Coach); without one the sheet says so, links to
// the coach's settings and offers the typed form. The photo is scaled and sent once (src/nutrition/photo.ts and
// estimate.ts), held in memory only until its estimate is in (or for a retry after a failure) and never saved.
//
// Each opening is its own session (`key={request.id}`): the parent builds the request in its press handler, so the
// state starts from it with no reset logic.
import * as React from "react";
import { ActivityIndicator, Image, Keyboard, Linking, Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { Camera, ChevronRight, ImagePlus, KeyRound, PencilLine, ShieldCheck, Sparkles, Trash2, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { providerLabel } from "@/coach/providers";
import { deviceModel, useCoachSetup } from "@/coach/session";
import { FORMATS } from "@/lib/format";
import { wall } from "@/lib/time";
import { estimateFood, MAX_DESCRIPTION, type Confidence, type EstimateInput, type EstimateProblem } from "@/nutrition/estimate";
import { chooseMealPhoto, takeMealPhoto, type MealPhoto } from "@/nutrition/photo";
import type { FoodVia } from "@/queries/food";
import { MEALS, type Meal } from "@/queries/log";
import type { FoodItem } from "@/queries/nutrition";
import { useApp } from "@/state/app";
import { BottomSheet, Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { logFoods, updateFoodEntry, type ActionResult, type FoodItemInput } from "@/screens/journal/actions";
import { useActionCtx } from "@/screens/journal/AddBehaviour";
import { Chips, ErrorAlert, Field, TextField, toast } from "@/screens/journal/controls";
import { atOf, EMPTY_FOOD, foodFormOf, foodItemOf, mealAt, num, wallNow, type FoodForm } from "@/screens/journal/forms";
import { bumpJournal } from "@/screens/journal/state";
import { CalmButton, Hairline, IconTile, Notice, SectionLabel, Sentence, TintPill, useCalm, type CalmTint } from "@/screens/settings/calmKit";

// ── Opening ─────────────────────────────────────────────────────────────────

/** One opening of the sheet: its time and meal to start from, and the Pulse entry being edited, if any. */
export type FoodRequest = { id: number; at: string; meal: Meal; edit: FoodItem | null };

let seq = 0;
/** A new session for the sheet, from a press handler: now (or the entry's time) in the person's zone. */
export function foodRequest(timeZone: string, edit: FoodItem | null = null): FoodRequest {
  const at = edit ? wallOf(edit.ts, timeZone) : wallNow(timeZone);
  const meal = edit && edit.meal !== "UNKNOWN" ? edit.meal : mealAt(at.slice(11, 16));
  seq += 1;
  return { id: seq, at, meal, edit };
}

/** A moment as the time field's text, "YYYY-MM-DD HH:mm". */
const wallOf = (ts: number, timeZone: string) => {
  const w = wall(ts, timeZone);
  return `${w.day} ${w.time.slice(0, 5)}`;
};

export type FoodSheetProps = {
  request: FoodRequest;
  open: boolean;
  onClose: () => void;
  /** Today's calories and protein so far, for the line at the top of "Log food". */
  today?: { kcal: number | null; protein: number | null } | null;
  /** That line links to Nutrition (from the Journal; not on Nutrition itself). */
  overviewLink?: boolean;
};

// ── Small parts ─────────────────────────────────────────────────────────────

type Step = "start" | "manual" | "estimating" | "review" | "failed";
type Problem = EstimateProblem | "no_food";
type Draft = { key: number; form: FoodForm; confidence: Confidence | null; open: boolean; error: string | null };

const grouped = (v: number) => FORMATS.grouped(v);
const gramsText = (v: number) => (Math.round(v * 10) / 10).toString();

/** A section of the sheet: a small spaced-caps header over its parts. */
function Section({ title, first, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: first ? 4 : 22, gap: 12 }}>
      <SectionLabel style={{ paddingHorizontal: 4 }}>{title}</SectionLabel>
      {children}
    </View>
  );
}

/** A way to add food, half the row: its icon on the sand pastel and its name under it. */
function MethodTile({ icon: Icon, label, onPress, disabled }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 104, borderRadius: 24, backgroundColor: c.tint.sand, padding: 14, gap: 12, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}
    >
      <IconTile icon={Icon} tint="sand" on="tint" size={40} />
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Where the photo or words go, in one line under the ways in. */
function PrivacyNote({ provider }: { provider: string }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 }}>
      <ShieldCheck size={16} color={c.tintInk.mint} strokeWidth={2} style={{ marginTop: 1 }} />
      <Sentence size={13} style={{ flex: 1 }}>
        {`Your photo or description goes only to ${provider}, with your own key, for this estimate. Halo doesn’t save the photo.`}
      </Sentence>
    </View>
  );
}

/** A teal link with a chevron, inside a notice or a line. */
function Link({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useCalm();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}>
      <Txt size={14} lineHeight={19} weight={600} style={{ color: c.teal }}>
        {label}
      </Txt>
      <ChevronRight size={16} color={c.teal} strokeWidth={2.25} />
    </Pressable>
  );
}

/** "TODAY 1,450 kcal · 82 g protein   Nutrition ›": today so far, and the way to the overview. */
function TodayLine({ today, onOpen }: { today: { kcal: number | null; protein: number | null }; onOpen?: () => void }) {
  const c = useCalm();
  const words =
    today.kcal === null ? (
      <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
        Nothing logged yet
      </Txt>
    ) : (
      <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
        <Txt size={16} lineHeight={20} style={[font.numeric(700), { color: c.ink }]}>{grouped(today.kcal)}</Txt>
        {" kcal"}
        {today.protein !== null && (
          <>
            {"  ·  "}
            <Txt size={16} lineHeight={20} style={[font.numeric(700), { color: c.ink }]}>{gramsText(Math.round(today.protein))}</Txt>
            {" g protein"}
          </>
        )}
      </Txt>
    );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 6, paddingHorizontal: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexGrow: 1, flexShrink: 1 }}>
        <Txt size={11} lineHeight={15} weight={600} style={{ color: c.faint, letterSpacing: 1.4 }}>
          TODAY
        </Txt>
        <View style={{ flexShrink: 1 }}>{words}</View>
      </View>
      {onOpen && <Link label="Nutrition" onPress={onOpen} />}
    </View>
  );
}

/** One food's fields: name and portion, then calories and the grams two to a row. */
function FoodFields({ form, onChange, onSubmit }: { form: FoodForm; onChange: (k: keyof FoodForm, v: string) => void; onSubmit?: () => void }) {
  const numeric = (k: keyof FoodForm, label: string, hint: string, decimal: boolean) => (
    <Field label={label} hint={hint} style={{ flex: 1 }}>
      <TextField
        value={form[k]}
        onChangeText={(t) => onChange(k, t)}
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        autoComplete="off"
        accessibilityLabel={`${label} ${hint}`}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        numeric
      />
    </Field>
  );
  return (
    <View style={{ gap: 12 }}>
      <Field label="Name" hint="(optional)">
        <TextField value={form.name} onChangeText={(t) => onChange("name", t)} maxLength={80} placeholder="e.g. Dal and rice" autoComplete="off" autoCapitalize="sentences" accessibilityLabel="Name" />
      </Field>
      <Field label="Portion" hint="(optional)">
        <TextField value={form.portion} onChangeText={(t) => onChange("portion", t)} maxLength={60} placeholder="e.g. 1 bowl (250 g)" autoComplete="off" accessibilityLabel="Portion" />
      </Field>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {numeric("kcal", "Calories", "(kcal)", false)}
        {numeric("protein", "Protein", "(g)", true)}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {numeric("carbs", "Carbs", "(g)", true)}
        {numeric("fat", "Fat", "(g)", true)}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {numeric("fiber", "Fiber", "(g, optional)", true)}
        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const CONFIDENCE: Record<Confidence, { label: string; tint: CalmTint }> = {
  high: { label: "High confidence", tint: "mint" },
  medium: { label: "Medium confidence", tint: "sand" },
  low: { label: "Low confidence", tint: "peach" },
};

/** A typed number, or 0 while it is blank or not a number yet (for the running total only). */
const n0 = (s: string) => {
  const v = num(s);
  return v === null || Number.isNaN(v) ? 0 : v;
};

/** "182 kcal · 12.6 g protein · 1.6 g carbs · 13.9 g fat": the numbers as typed so far. */
function summaryOf(f: FoodForm) {
  const g = (s: string, word: string) => (num(s) !== null && !Number.isNaN(num(s)) ? `${s.trim().replace(",", ".")} g ${word}` : null);
  return [`${f.kcal.trim() || "?"} kcal`, g(f.protein, "protein"), g(f.carbs, "carbs"), g(f.fat, "fat"), g(f.fiber, "fiber")].filter(Boolean).join(" · ");
}

/** One estimated food under review: its name, portion and numbers; Edit opens its fields, Remove drops it. */
function DraftRow({ d, onToggle, onChange, onRemove }: { d: Draft; onToggle: () => void; onChange: (k: keyof FoodForm, v: string) => void; onRemove: () => void }) {
  const c = useCalm();
  const name = d.form.name.trim() || "Food";
  return (
    <View style={{ gap: 12, paddingVertical: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`${d.open ? "Close" : "Edit"} ${name}`} accessibilityState={{ expanded: d.open }} style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 4, opacity: pressed ? 0.7 : 1 })}>
          <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
            {name}
            {d.form.portion.trim() ? <Txt size={15} lineHeight={21} weight={400} style={{ color: c.sub }}>{`  ${d.form.portion.trim()}`}</Txt> : null}
          </Txt>
          <Txt size={14} lineHeight={19} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
            {summaryOf(d.form)}
          </Txt>
          {d.confidence && (
            <View style={{ marginTop: 4 }}>
              <TintPill tint={CONFIDENCE[d.confidence].tint}>{CONFIDENCE[d.confidence].label}</TintPill>
            </View>
          )}
        </Pressable>
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`Edit ${name}`} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed || d.open ? c.ground : "transparent" })}>
          <PencilLine size={19} color={d.open ? c.teal : c.faint} strokeWidth={1.75} />
        </Pressable>
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${name}`} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.ground : "transparent" })}>
          <Trash2 size={19} color={c.faint} strokeWidth={1.75} />
        </Pressable>
      </View>
      {d.error && <ErrorAlert>{d.error}</ErrorAlert>}
      {d.open && <FoodFields form={d.form} onChange={onChange} />}
    </View>
  );
}

/** Each failure's heading and sentence; `provider` is the person's provider's name. */
function problemCopy(p: Problem, provider: string, photo: boolean): { title: string; body: string } {
  const instead = "or enter the food yourself.";
  switch (p) {
    case "timeout":
      return { title: "That took too long", body: `${provider} didn’t answer in time. Try again, ${instead}` };
    case "refused":
      return { title: `${provider} didn’t estimate this`, body: `Your AI provider declined this ${photo ? "photo" : "description"}. Try ${photo ? "another photo" : "other words"}, ${instead}` };
    case "unreadable":
      return { title: "The answer wasn’t usable", body: `${provider}’s answer couldn’t be read as nutrition numbers. Try again, ${instead}` };
    case "key":
      return { title: "Your AI key didn’t work", body: `${provider} didn’t accept your key. Check it in Settings › Coach, ${instead}` };
    case "busy":
      return { title: `${provider} is busy`, body: `Your provider is limiting requests right now. Try again in a minute, ${instead}` };
    case "network":
      return { title: "No connection", body: `Halo couldn’t reach ${provider}. Check your connection and try again, ${instead}` };
    case "no_food":
      return { title: "No food found", body: `${provider} didn’t find food or drink ${photo ? "in this photo" : "in that description"}. Try again, ${instead}` };
    case "provider":
    case "cancelled":
      return {
        title: "The estimate failed",
        body: `${provider} couldn’t make the estimate. Try again, ${instead}${photo ? " If it keeps failing, check in Settings › Coach that your model reads photos." : ""}`,
      };
  }
}

// ── The sheet ───────────────────────────────────────────────────────────────

const COACH_SETTINGS = "/coach/settings" as Href;

export function FoodSheet({ request, open, onClose, today, overviewLink }: FoodSheetProps) {
  const c = useCalm();
  const app = useApp();
  const actx = useActionCtx();
  const setup = useCoachSetup();
  const edit = request.edit;
  const hasKey = !!setup?.consent && !!setup.provider && !!setup.last4;
  const provider = providerLabel(setup?.provider ?? null);

  const [step, setStep] = React.useState<Step>(edit ? "manual" : "start");
  const [meal, setMeal] = React.useState<Meal>(request.meal);
  const [at, setAt] = React.useState(request.at);
  const [form, setForm] = React.useState<FoodForm>(() => (edit ? foodFormOf(edit) : EMPTY_FOOD));
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const [via, setVia] = React.useState<FoodVia>("photo");
  const [text, setText] = React.useState("");
  // The photo, in memory only: until its estimate is in, or for "Try again" after a failure. Never written anywhere.
  const [photo, setPhoto] = React.useState<MealPhoto | null>(null);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [notice, setNotice] = React.useState<"camera_denied" | "camera_blocked" | "photo_failed" | "no_key" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const task = React.useRef<AbortController | null>(null);
  const draftSeq = React.useRef(0);
  /** The session has ended: nothing new starts (a photo still being prepared is dropped, not sent). */
  const ended = React.useRef(false);

  // Closing (the X, the dim, a swipe, back) stops a running estimate and lets the photo go.
  const close = () => {
    if (saving) return;
    ended.current = true;
    task.current?.abort();
    task.current = null;
    setPhoto(null);
    onClose();
  };
  React.useEffect(() => {
    if (open) return;
    ended.current = true;
    task.current?.abort();
  }, [open]);

  const leave = (href: Href) => {
    close();
    router.push(href);
  };

  // ── Estimating ──

  const estimate = async (input: EstimateInput, shot: MealPhoto | null) => {
    if (ended.current) return;
    task.current?.abort();
    const ctl = new AbortController();
    task.current = ctl;
    setProblem(null);
    setNotice(null);
    setError(null);
    setStep("estimating");
    const model = await deviceModel();
    if (ctl.signal.aborted) return;
    if (!model) {
      setNotice("no_key");
      setStep("start");
      return;
    }
    const r = await estimateFood(model.model, input, { signal: ctl.signal });
    if (ctl.signal.aborted || task.current !== ctl) return;
    task.current = null;
    if (!r.ok) {
      if (r.problem === "cancelled") return setStep("start");
      setProblem(r.problem);
      return setStep("failed");
    }
    setNote(r.estimate.note);
    if (!r.estimate.foods.length) {
      setProblem("no_food");
      return setStep("failed");
    }
    // The estimate is in: the photo goes.
    setPhoto(null);
    setVia(shot ? "photo" : "text");
    setDrafts(
      r.estimate.foods.map((f) => {
        draftSeq.current += 1;
        return { key: draftSeq.current, form: foodFormOf(f), confidence: f.confidence, open: false, error: null };
      }),
    );
    setStep("review");
  };

  const fromPhoto = async (how: "camera" | "library") => {
    if (busy) return;
    setNotice(null);
    setBusy(true);
    const r = how === "camera" ? await takeMealPhoto() : await chooseMealPhoto();
    setBusy(false);
    if (ended.current) return;
    if (!r.ok) {
      if (r.reason === "denied") setNotice(r.canAskAgain ? "camera_denied" : "camera_blocked");
      else if (r.reason === "failed") setNotice("photo_failed");
      return;
    }
    setPhoto(r.photo);
    void estimate({ image: r.photo }, r.photo);
  };

  const fromText = () => {
    const t = text.trim();
    if (t.length < 2) return;
    Keyboard.dismiss();
    void estimate({ text: t }, null);
  };

  const retry = () => {
    if (photo) void estimate({ image: photo }, photo);
    else if (text.trim()) void estimate({ text: text.trim() }, null);
    else setStep("start");
  };

  /** Back to the ways in, for another photo or other words (the description stays). */
  const again = () => {
    setPhoto(null);
    setProblem(null);
    setError(null);
    setStep("start");
  };

  const cancel = () => {
    task.current?.abort();
    task.current = null;
    setStep("start");
  };

  /** To the typed form, carrying what is known (the description as the name). */
  const typeIt = () => {
    task.current?.abort();
    task.current = null;
    setPhoto(null);
    setError(null);
    if (!form.name && !photo && text.trim()) setForm((f) => ({ ...f, name: text.trim().slice(0, 80) }));
    setStep("manual");
  };

  // ── Saving ──

  const done = (message: string) => {
    onClose();
    toast(app.source === "demo" ? `${message} (demo)` : message);
    bumpJournal();
    // Food feeds the nutrition numbers (calories eaten, protein, carbs, fat), which the screens add up as they read:
    // they read again, with no sync or scoring run (neither reads food).
    app.dataChanged();
  };

  const send = async (run: () => Promise<ActionResult<unknown>>, message: string) => {
    if (!actx) return setError("Couldn’t save. Try again.");
    setSaving(true);
    setError(null);
    const r = await run().catch(() => ({ ok: false as const, error: "Couldn’t save. Try again." }));
    setSaving(false);
    if (!r.ok) return setError(r.error);
    done(message);
  };

  const saveTyped = () => {
    const item = foodItemOf(form);
    if (typeof item === "string") return setError(item);
    if (!actx) return setError("Couldn’t save. Try again.");
    if (edit) void send(() => updateFoodEntry(actx, { id: edit.id, ts: edit.ts, meal, at: atOf(at), item }), "Food updated");
    else void send(() => logFoods(actx, { meal, via: "manual", at: atOf(at), items: [item] }), "Food saved in Halo");
  };

  const saveReview = () => {
    const items: FoodItemInput[] = [];
    for (const d of drafts) {
      const item = foodItemOf(d.form);
      if (typeof item === "string") {
        setDrafts((ds) => ds.map((x) => (x.key === d.key ? { ...x, open: true, error: item } : x)));
        return setError(`Fix ${d.form.name.trim() || "a food"} before saving.`);
      }
      items.push(item);
    }
    if (!items.length) return setError("Every food was removed. Take another photo, or enter the food yourself.");
    if (!actx) return setError("Couldn’t save. Try again.");
    void send(() => logFoods(actx, { meal, via, at: atOf(at), items }), items.length === 1 ? "Food saved in Halo" : `${items.length} foods saved in Halo`);
  };

  const setField = (k: keyof FoodForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };
  const setDraft = (key: number, k: keyof FoodForm, v: string) => {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, form: { ...d.form, [k]: v }, error: null } : d)));
    setError(null);
  };

  // ── Parts per step ──

  const showTyped = step === "manual" || (step === "start" && setup !== undefined && !hasKey);

  const mealSection = (first: boolean) => (
    <Section title="Meal" first={first}>
      <Chips label="Meal" options={MEALS} value={meal} onChange={(v) => typeof v === "string" && v && setMeal(v as Meal)} />
    </Section>
  );
  const timeSection = (
    <Section title="When">
      <Field label="Time" hint="(YYYY-MM-DD HH:mm)">
        <TextField value={at} onChangeText={setAt} keyboardType="numbers-and-punctuation" autoComplete="off" maxLength={16} accessibilityLabel="Time" numeric />
      </Field>
    </Section>
  );

  const noKey = (
    <Notice tint="sand" icon={KeyRound} title="Photo estimates use your own AI key">
      <View style={{ gap: 8 }}>
        <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
          Add a key from Anthropic, OpenAI, Google or another provider in Settings › Coach, and Halo can estimate a meal from a photo or a few words. Until then, enter the food yourself below.
        </Txt>
        <Link label="Open Coach settings" onPress={() => leave(COACH_SETTINGS)} />
      </View>
    </Notice>
  );

  const startNotice =
    notice === "camera_denied" ? (
      <Notice tint="sand" icon={TriangleAlert}>
        Halo needs the camera to take the photo. Allow it when Android asks, or choose a photo instead.
      </Notice>
    ) : notice === "camera_blocked" ? (
      <Notice tint="sand" icon={TriangleAlert} title="The camera is off for Halo">
        <View style={{ gap: 8 }}>
          <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
            Allow it in Android’s settings for Halo, or choose a photo instead.
          </Txt>
          <Link label="Open Android settings" onPress={() => void Linking.openSettings()} />
        </View>
      </Notice>
    ) : notice === "photo_failed" ? (
      <Notice tint="rose" icon={TriangleAlert}>
        That photo couldn’t be read. Try another, or enter the food yourself.
      </Notice>
    ) : null;

  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  const errorLine = error ? <ErrorAlert>{error}</ErrorAlert> : null;
  const fullWidth = { alignSelf: "stretch", minHeight: 56, borderRadius: 28 } as const;

  if (step === "estimating") {
    body = (
      <View style={{ gap: 16, paddingTop: 4, paddingBottom: 8 }} accessibilityLiveRegion="polite">
        {photo ? (
          <Image source={{ uri: `data:${photo.mediaType};base64,${photo.base64}` }} resizeMode="cover" accessibilityLabel="Your meal photo" style={{ alignSelf: "stretch", height: 200, borderRadius: 24, backgroundColor: c.ground }} />
        ) : (
          <View style={{ borderRadius: 20, backgroundColor: c.ground, padding: 16 }}>
            <Txt size={16} lineHeight={22} style={{ color: c.ink }}>{`“${text.trim()}”`}</Txt>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 }}>
          <ActivityIndicator color={c.tintInk.sand} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
              {`Estimating with ${provider}…`}
            </Txt>
            <Sentence size={13}>Usually a few seconds; up to a minute for a busy plate.</Sentence>
          </View>
        </View>
      </View>
    );
    footer = (
      <CalmButton variant="secondary" on="card" onPress={cancel} style={fullWidth}>
        Cancel
      </CalmButton>
    );
  } else if (step === "failed" && problem) {
    const copy = problemCopy(problem, provider, !!photo);
    body = (
      <View style={{ gap: 16, paddingTop: 4 }}>
        <Notice tint={problem === "no_food" ? "sand" : "rose"} icon={TriangleAlert} title={copy.title} role="alert">
          <View style={{ gap: 8 }}>
            <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
              {copy.body}
            </Txt>
            {problem === "no_food" && note ? (
              <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
                {note}
              </Txt>
            ) : null}
            {problem === "key" || problem === "provider" ? <Link label="Open Coach settings" onPress={() => leave(COACH_SETTINGS)} /> : null}
          </View>
        </Notice>
      </View>
    );
    // The same request again where the failure was passing (slow, busy, offline, a garbled answer); another photo or
    // other words where the answer itself was no (nothing found, declined); neither with a refused key.
    const other = problem === "no_food" || problem === "refused";
    const canRetry = problem !== "key" && (!!photo || !!text.trim());
    footer = (
      <View style={{ gap: 10, alignSelf: "stretch" }}>
        {canRetry && (
          <CalmButton onPress={other ? again : retry} style={fullWidth}>
            {other ? (photo ? "Try another photo" : "Change the description") : "Try again"}
          </CalmButton>
        )}
        <CalmButton variant={canRetry ? "secondary" : "primary"} on="card" onPress={typeIt} style={fullWidth}>
          Enter it yourself
        </CalmButton>
      </View>
    );
  } else if (step === "review") {
    const total = drafts.reduce((t, d) => ({ kcal: t.kcal + n0(d.form.kcal), protein: t.protein + n0(d.form.protein), carbs: t.carbs + n0(d.form.carbs), fat: t.fat + n0(d.form.fat) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    body = (
      <View>
        {note ? (
          <Notice tint="sand" icon={Sparkles}>
            {note}
          </Notice>
        ) : null}
        <Section title="Total" first={!note}>
          <View accessible accessibilityLabel={`Total ${Math.round(total.kcal)} kcal, ${gramsText(total.protein)} g protein, ${gramsText(total.carbs)} g carbs, ${gramsText(total.fat)} g fat`} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 14, rowGap: 4, paddingHorizontal: 4 }}>
            {[
              [grouped(total.kcal), "kcal"],
              [gramsText(total.protein), "g protein"],
              [gramsText(total.carbs), "g carbs"],
              [gramsText(total.fat), "g fat"],
            ].map(([v, unit]) => (
              <Txt key={unit} size={13} lineHeight={22} weight={500} style={{ color: c.sub }}>
                <Txt size={20} lineHeight={22} style={[font.numeric(700), { color: c.ink }]}>{v}</Txt>
                {` ${unit}`}
              </Txt>
            ))}
          </View>
        </Section>
        <Section title={drafts.length === 1 ? "Food" : `Foods (${drafts.length})`}>
          <Sentence style={{ paddingHorizontal: 4 }}>Estimates are approximate. Fix any number, or remove what isn’t there, before saving.</Sentence>
          {drafts.length ? (
            <View style={{ borderRadius: 24, backgroundColor: c.card, borderWidth: 1, borderColor: c.edge, paddingHorizontal: 14 }}>
              {drafts.map((d, i) => (
                <React.Fragment key={d.key}>
                  {i > 0 && <Hairline />}
                  <DraftRow
                    d={d}
                    onToggle={() => setDrafts((ds) => ds.map((x) => (x.key === d.key ? { ...x, open: !x.open } : x)))}
                    onChange={(k, v) => setDraft(d.key, k, v)}
                    onRemove={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
                  />
                </React.Fragment>
              ))}
            </View>
          ) : (
            <Sentence style={{ paddingHorizontal: 4 }}>No foods left to save.</Sentence>
          )}
        </Section>
        {mealSection(false)}
        {timeSection}
        <View style={{ marginTop: 16 }}>
          <Sentence size={13} style={{ paddingHorizontal: 4 }}>
            {via === "photo" ? "The photo was used for this estimate only and isn’t kept." : "Your description was used for this estimate only."}
          </Sentence>
        </View>
      </View>
    );
    footer = (
      <View style={{ gap: 10, alignSelf: "stretch" }}>
        {errorLine}
        <CalmButton onPress={saveReview} disabled={saving || !drafts.length} style={fullWidth}>
          {saving ? "Saving…" : drafts.length > 1 ? `Save ${drafts.length} foods` : "Save"}
        </CalmButton>
        <CalmButton variant="quiet" on="card" onPress={typeIt} disabled={saving} style={{ alignSelf: "stretch" }}>
          Enter it yourself instead
        </CalmButton>
      </View>
    );
  } else if (showTyped) {
    body = (
      <View>
        {!edit && today && step === "start" && (
          <View style={{ marginTop: 4, marginBottom: 16 }}>
            <TodayLine today={today} onOpen={overviewLink ? () => leave("/nutrition" as Href) : undefined} />
          </View>
        )}
        {!edit && !hasKey && setup !== undefined && noKey}
        {mealSection(!!edit || (hasKey && step === "manual"))}
        <Section title="What you ate">
          <FoodFields form={form} onChange={setField} onSubmit={saveTyped} />
        </Section>
        {timeSection}
        {edit?.via === "photo" && (
          <View style={{ marginTop: 16 }}>
            <Sentence size={13} style={{ paddingHorizontal: 4 }}>
              Estimated from a photo. The photo wasn’t kept.
            </Sentence>
          </View>
        )}
      </View>
    );
    footer = (
      <View style={{ gap: 10, alignSelf: "stretch" }}>
        {errorLine}
        <CalmButton onPress={saveTyped} disabled={saving} style={fullWidth}>
          {saving ? "Saving…" : edit ? "Save changes" : "Save"}
        </CalmButton>
        {!edit && hasKey && (
          <CalmButton variant="quiet" on="card" onPress={again} disabled={saving} style={{ alignSelf: "stretch" }}>
            Estimate from a photo instead
          </CalmButton>
        )}
      </View>
    );
  } else {
    // The ways in (a coach key is set up, or the setup is still loading).
    body = (
      <View style={{ gap: 18, paddingTop: 4 }}>
        {today && <TodayLine today={today} onOpen={overviewLink ? () => leave("/nutrition" as Href) : undefined} />}
        {notice === "no_key" ? noKey : null}
        <View style={{ gap: 12 }}>
          <SectionLabel style={{ paddingHorizontal: 4 }}>Estimate with AI</SectionLabel>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <MethodTile icon={Camera} label="Take photo" onPress={() => void fromPhoto("camera")} disabled={busy || !hasKey} />
            <MethodTile icon={ImagePlus} label="Choose photo" onPress={() => void fromPhoto("library")} disabled={busy || !hasKey} />
          </View>
          {busy && (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 }}>
              <ActivityIndicator color={c.tintInk.sand} />
              <Sentence>Getting the photo ready…</Sentence>
            </View>
          )}
          {startNotice}
          <Field label="Or describe it" hint="(what and how much)">
            <TextField
              value={text}
              onChangeText={setText}
              placeholder="e.g. 2 eggs and a slice of toast"
              maxLength={MAX_DESCRIPTION}
              autoComplete="off"
              autoCapitalize="sentences"
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              onSubmitEditing={fromText}
              accessibilityLabel="Describe what you ate"
            />
          </Field>
          <CalmButton variant="secondary" on="card" icon={Sparkles} onPress={fromText} disabled={text.trim().length < 2 || !hasKey} style={{ alignSelf: "stretch" }}>
            Estimate from description
          </CalmButton>
          {hasKey && <PrivacyNote provider={provider} />}
        </View>
        <View style={{ gap: 12 }}>
          <SectionLabel style={{ paddingHorizontal: 4 }}>Or enter it yourself</SectionLabel>
          <CalmButton variant="secondary" on="card" icon={PencilLine} onPress={typeIt} style={{ alignSelf: "stretch" }}>
            Type the food and its numbers
          </CalmButton>
        </View>
      </View>
    );
  }

  const title = edit ? "Edit food" : step === "review" ? "Check the estimate" : step === "estimating" ? "Estimating…" : "Log food";
  return (
    <BottomSheet open={open} onClose={close} title={title} description={app.source === "demo" ? "Demo: saved in Halo only" : "Saved in Halo on this phone"} footer={footer ?? undefined}>
      {body}
    </BottomSheet>
  );
}
