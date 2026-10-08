// The check-in (spec §7.11, journey 7), ported from the web's src/app/(app)/journal/CheckIn.tsx: the Journal's
// check-in card, and the one check-in sheet mounted for the whole app (the web mounts it in the app layout and opens
// it with `?checkin=1`). `openCheckIn(day?)` opens it over whatever screen is showing, for that screen's day (`?d=`),
// and closing it leaves the screen as it was. The behaviours and answers load when it opens.
import * as React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useGlobalSearchParams, useRouter, type Href } from "expo-router";
import { Check, ChevronRight, NotebookPen } from "lucide-react-native";
import { dayHref } from "@/lib/day";
import { DAY, dayLabel as dayWord, formatDay } from "@/lib/format";
import { useApp, useQueryCtx } from "@/state/app";
import type { JournalTag, JournalVM } from "@/queries/types";
import { BottomSheet, Txt } from "@/ui";
import { CalmButton, CalmCard, IconTile, SectionLabel, TintPill, useCalm, type CalmTint } from "../settings/calmKit";
import { loadCheckIn, saveJournalEntry } from "./actions";
import { AddBehaviour, useActionCtx } from "./AddBehaviour";
import { ConfirmDialog, DialogAction, ErrorAlert, haptic, TagBadge, toast, YesNo } from "./controls";
import { changedEntries, type Values } from "./forms";
import { bumpJournal, openCheckIn, useOpenCheckInListener } from "./state";
import { TAG_GROUPS, tagIcon } from "./tags";

export { openCheckIn } from "./state";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CheckInProps = {
  /** "Mon, Sep 28". */
  dayLabel: string;
  /** The card's day, which the sheet opens for. */
  day: string;
  checkIn: JournalVM["checkIn"];
};

/** Each behaviour group's pastel: evening habits lavender (sleep), recovery mint, context sand, your own sky. */
export const GROUP_TINT: Record<JournalTag["group"], CalmTint> = { evening: "lavender", recovery: "mint", context: "sand", custom: "sky" };

/** The Journal's check-in card (spec §7.11, journey 7). Its button opens the app-wide check-in sheet. */
export function CheckIn({ dayLabel, day, checkIn }: CheckInProps) {
  const start = () => openCheckIn(day);
  // The section above is headed "Check-in", so the card is titled by its day, as History's rows are (SYM2).
  return (
    <CalmCard
      icon={NotebookPen}
      iconTint="mint"
      title={dayLabel}
      subtitle={checkIn.done ? undefined : "Log what you did today. Halo compares it with tomorrow’s Recovery."}
      right={checkIn.done ? <TintPill tint="mint" icon={Check}>Checked in</TintPill> : undefined}
      gap={16}
    >
      {checkIn.done ? (
        <>
          {/* The day's behaviours on one wrapping line. */}
          {checkIn.yes.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              {checkIn.yes.map((y) => (
                <TagBadge key={y.tag}>{y.label}</TagBadge>
              ))}
            </View>
          )}
          {/* Full width at the card's foot, as Check in and Home's card buttons are (SYM3). */}
          <CalmButton variant="secondary" on="card" onPress={start}>
            Edit check-in
          </CalmButton>
        </>
      ) : (
        <CalmButton onPress={start}>Check in</CalmButton>
      )}
    </CalmCard>
  );
}

/** The day the round button would check in for: the screen's `?d=` when valid, else today. */
function useScreenDay() {
  const { today } = useApp();
  const params = useGlobalSearchParams<{ d?: string | string[] }>();
  const raw = Array.isArray(params.d) ? params.d[0] : params.d;
  return raw && DAY_RE.test(raw) && raw <= today ? raw : today;
}

/** The tab bar's round "Check in" button: opens the sheet for the day on screen. */
export function useCheckInAction() {
  const { today } = useApp();
  const d = useScreenDay();
  const onAction = React.useCallback(() => openCheckIn(), []);
  return { onAction, actionLabel: `Check in for ${dayWord(d, today)}` };
}

type Loaded = { day: string } & Pick<JournalVM, "tags" | "checkIn">;

/** The check-in sheet, mounted once (app/(tabs)/_layout.tsx). */
export function CheckInSheetHost() {
  const c = useCalm();
  const app = useApp();
  const ctx = useQueryCtx();
  const actx = useActionCtx();
  const screenDay = useScreenDay();
  const ctxRef = React.useRef(ctx);
  React.useLayoutEffect(() => {
    ctxRef.current = ctx;
  });

  const [open, setOpen] = React.useState(false);
  const [day, setDay] = React.useState(app.today);
  const [data, setData] = React.useState<Loaded | null>(null);
  const [request, setRequest] = React.useState<{ day: string; n: number } | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [values, setValues] = React.useState<Values>({});
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  const tags = data?.tags ?? [];
  const saved = data?.checkIn.entries ?? {};
  const dirty = Object.keys(values).some((t) => values[t] !== saved[t]);
  const label = formatDay(data?.day ?? day, DAY.short);

  useOpenCheckInListener((requested) => {
    if (open) return;
    const d = requested && DAY_RE.test(requested) && requested <= app.today ? requested : screenDay;
    setDay(d);
    setData(null);
    setValues({});
    setLoadError(false);
    setSaveError(false);
    setConfirm(false);
    setOpen(true);
    setRequest((r) => ({ day: d, n: (r?.n ?? 0) + 1 }));
  });

  React.useEffect(() => {
    if (!request) return;
    let live = true;
    const q = ctxRef.current;
    if (!q) {
      setLoadError(true);
      return;
    }
    loadCheckIn(q, request.day)
      .then((r) => {
        if (!live) return;
        if (!r.ok) return setLoadError(true);
        setData({ day: request.day, ...r.data });
        setValues({ ...r.data.checkIn.entries });
      })
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, [request]);

  const finish = () => {
    setConfirm(false);
    setOpen(false);
  };
  const retry = () => {
    setLoadError(false);
    setRequest((r) => r && { ...r, n: r.n + 1 });
  };
  const close = () => {
    if (saving) return;
    if (dirty) return setConfirm(true);
    finish();
  };
  // The journal itself (the log, history, insights) is a tap away from the check-in, on the same day.
  const router = useRouter();
  const openJournal = () => {
    if (saving) return;
    if (dirty) return setConfirm(true);
    finish();
    router.navigate(dayHref("/journal", data?.day ?? day, app.today) as Href);
  };

  const save = async () => {
    if (!data || !actx) return;
    setSaving(true);
    setSaveError(false);
    const changes = changedEntries(values, data.checkIn.entries);
    let sent = 0;
    try {
      for (; sent < changes.length; sent++) {
        const [tag, value] = changes[sent];
        const r = await saveJournalEntry(actx, { day: data.day, tag, value });
        if (!r.ok) return setSaveError(true);
      }
      haptic();
      finish();
      toast("Check-in saved");
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
      if (sent > 0) {
        bumpJournal();
        // Journal impact, Insights and Monitor context read the journal: rescore in the background.
        void app.refresh();
      }
    }
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={close}
        title="Check in"
        description={label}
        size="tall"
        footer={
          <View style={{ gap: 10, alignSelf: "stretch" }}>
            {saveError && <ErrorAlert>Couldn’t save. Try again.</ErrorAlert>}
            <CalmButton onPress={() => void save()} disabled={saving || !data} style={{ alignSelf: "stretch", minHeight: 56, borderRadius: 28 }}>
              {saving ? "Saving…" : "Save check-in"}
            </CalmButton>
          </View>
        }
      >
        <Pressable
          onPress={openJournal}
          accessibilityRole="link"
          accessibilityLabel="Open journal: log water, food, weight and more"
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
        >
          <NotebookPen size={18} color={c.teal} strokeWidth={2} />
          <Txt size={15} lineHeight={20} weight={600} style={{ flex: 1, minWidth: 0, color: c.teal }}>
            Open journal · log water, food, weight and more
          </Txt>
          <ChevronRight size={18} color={c.teal} strokeWidth={2.25} />
        </Pressable>
        {!data &&
          (loadError ? (
            <View style={{ marginTop: 8 }}>
              <ErrorAlert
                action={
                  <CalmButton variant="secondary" size="md" onPress={retry}>
                    Try again
                  </CalmButton>
                }
              >
                Couldn’t load your check-in.
              </ErrorAlert>
            </View>
          ) : (
            <View accessibilityLabel="Loading" style={{ alignItems: "center", justifyContent: "center", paddingVertical: 64 }}>
              <ActivityIndicator size="small" color={c.teal} />
            </View>
          ))}
        {data &&
          TAG_GROUPS.map((g) => ({ ...g, items: tags.filter((t) => t.group === g.key) }))
            .filter((g) => g.items.length > 0 || g.key === "custom")
            .map((g, i) => (
              <View key={g.key} style={{ marginTop: i === 0 ? 8 : 24, gap: 10 }}>
                <SectionLabel style={{ paddingHorizontal: 4 }}>{g.title}</SectionLabel>
                {/* One card per question: the behaviour named in full, then No and Yes as two large pills. */}
                <View style={{ gap: 8 }}>
                  {g.items.map((t) => (
                    <View key={t.tag} style={{ borderRadius: 22, backgroundColor: c.ground, padding: 14, gap: 12 }}>
                      {/* The name's first line on the tile's middle; a long name wraps under it, the tile stays. */}
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                        <IconTile icon={tagIcon(t.tag)} tint={GROUP_TINT[g.key]} size={36} />
                        <Txt size={16} lineHeight={21} weight={600} style={{ flex: 1, minWidth: 0, color: c.ink, marginTop: (36 - 21) / 2 }}>
                          {t.label}
                        </Txt>
                      </View>
                      <YesNo label={t.label} on="ground" value={values[t.tag]} onChange={(v) => setValues((s) => ({ ...s, [t.tag]: v }))} />
                    </View>
                  ))}
                </View>
                {g.key === "custom" && (
                  <AddBehaviour
                    tags={tags}
                    onAdded={(tag, name) => {
                      // Shown at once, and it starts as "Yes": you add one because you just did it.
                      setData((d) => d && { ...d, tags: [...d.tags, { tag, label: name, group: "custom", isDefault: false, hidden: false }] });
                      setValues((v) => ({ ...v, [tag]: 1 }));
                    }}
                  />
                )}
              </View>
            ))}
      </BottomSheet>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Discard changes?"
        description={`Your check-in for ${label} isn’t saved.`}
        actions={[
          <DialogAction key="keep" label="Keep editing" onPress={() => setConfirm(false)} />,
          <DialogAction key="discard" label="Discard" variant="outline" danger onPress={finish} />,
        ]}
      />
    </>
  );
}
