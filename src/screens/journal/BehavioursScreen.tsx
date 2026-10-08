// More › Behaviours `/more/behaviours` (U21), ported from the web's src/app/(app)/more/behaviours/{page,Behaviours,
// loading}.tsx: show or hide each behaviour on the check-in sheet, reorder it inside its group, add your own. The list
// updates in place; a failed write puts it back and says so.
import * as React from "react";
import { Pressable, View } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { moved } from "@/lib/utils";
import { getBehaviours } from "@/queries/journal";
import type { BehavioursVM } from "@/queries/types";
import { useQuery } from "@/state/app";
import { Skeleton, SkeletonText, Txt } from "@/ui";
import { onBand } from "@/ui/components/calmKit";
import { font } from "@/ui/fonts";
import { DetailScreen, LoadError } from "@/screens/detail/DetailScreen";
import { useBack, useRefresh } from "@/screens/detail/nav";
import { reorderBehaviours, setBehaviourHidden, type ActionResult } from "./actions";
import { Group, Hairline, IconTile, Sentence, useCalm } from "../settings/calmKit";
import { AddBehaviour, useActionCtx } from "./AddBehaviour";
import { GROUP_TINT } from "./CheckInSheet";
import { Switch, toast } from "./controls";
import { bumpJournal, useJournalVersion } from "./state";
import { TAG_GROUPS, tagIcon } from "./tags";

type Tag = BehavioursVM["tags"][number];

/** A behaviour row's band: its name (21) and its count under it (2 + 18). */
const ROW_BAND = 41;

const INTRO = "Choose what the check-in asks. A hidden behaviour leaves the check-in, but its past answers stay and still count in your insights.";
/** One centred column up to 640 px. */
const COLUMN = { alignSelf: "center", width: "100%", maxWidth: 640, gap: 24 } as const;

export default function BehavioursScreen() {
  const onBack = useBack("/more");
  const { retry } = useRefresh();
  const version = useJournalVersion();
  const q = useQuery((ctx) => getBehaviours(ctx), [version]);
  // "Add a behaviour" sits at the page's foot: the page scrolls it clear of the keyboard.
  const common = { title: "Behaviours", onBack, keyboardAware: true } as const;
  if (q.error && !q.data) return <DetailScreen {...common} primary={<LoadError onRetry={retry} />} />;
  return <DetailScreen {...common} primary={q.data ? <Behaviours vm={q.data} /> : <BehavioursSkeleton />} />;
}

export function Behaviours({ vm }: { vm: BehavioursVM }) {
  const c = useCalm();
  const actx = useActionCtx();
  const [tags, setTags] = React.useState(vm.tags);
  // Stored data wins when it changes (after a write elsewhere), without an effect.
  const [last, setLast] = React.useState(vm.tags);
  if (vm.tags !== last) {
    setLast(vm.tags);
    setTags(vm.tags);
  }

  const write = async (optimistic: Tag[], action: () => Promise<ActionResult>) => {
    const before = tags;
    setTags(optimistic);
    const r = await action().catch(() => ({ ok: false }));
    if (!r.ok) {
      setTags(before);
      toast("Couldn’t save. Try again.");
      return;
    }
    bumpJournal();
  };

  const toggle = (t: Tag, shown: boolean) =>
    actx &&
    write(
      tags.map((x) => (x.tag === t.tag ? { ...x, hidden: !shown } : x)),
      () => setBehaviourHidden(actx, { tag: t.tag, hidden: !shown }),
    );

  const move = (group: Tag[], i: number, by: -1 | 1) => {
    if (!actx) return;
    const order = moved(group, i, by);
    const rank = new Map(order.map((t, k) => [t.tag, k]));
    const next = [...tags].sort((a, b) => (rank.get(a.tag) ?? -1) - (rank.get(b.tag) ?? -1) || 0);
    // Only this group's relative order changes; other groups keep theirs (they render apart).
    return write(next, () => reorderBehaviours(actx, { tags: order.map((t) => t.tag) }));
  };

  return (
    <View style={COLUMN}>
      <Sentence style={{ paddingHorizontal: 4 }}>{INTRO}</Sentence>
      {TAG_GROUPS.map((g) => {
        const group = tags.filter((t) => t.group === g.key);
        if (!group.length && g.key !== "custom") return null;
        return (
          <Group key={g.key} title={g.title} padding={0}>
            {group.length > 0 ? (
              <View style={{ paddingVertical: 4 }}>
                {group.map((t, i) => (
                  <React.Fragment key={t.tag}>
                    {i > 0 && <Hairline inset={16 + 36 + 12} />}
                    {/* The tile, the arrows and the switch on the name and its count (21 + 2 + 18): a name that wraps
                        grows the row downward, and they stay on its first lines. */}
                    <View style={{ minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 4, paddingLeft: 16, paddingRight: 16, paddingVertical: (64 - ROW_BAND) / 2 }}>
                      <View style={{ opacity: t.hidden ? 0.45 : 1, marginRight: 8, marginTop: onBand(ROW_BAND, 36) }}>
                        <IconTile icon={tagIcon(t.tag)} tint={GROUP_TINT[g.key]} size={36} />
                      </View>
                      {/* The label toggles the switch, as the web's <Label htmlFor>. */}
                      <Pressable onPress={() => void toggle(t, t.hidden)} accessible={false} style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Txt size={16} lineHeight={21} weight={600} style={{ color: t.hidden ? c.faint : c.ink }}>
                          {t.label}
                        </Txt>
                        <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
                          {t.hidden ? (
                            "Hidden"
                          ) : t.answers ? (
                            <>
                              <Txt size={14} lineHeight={18} style={[font.numeric(700), { color: c.ink }]}>
                                {String(t.answers)}
                              </Txt>
                              {` ${t.answers === 1 ? "day" : "days"} logged`}
                            </>
                          ) : (
                            "Not logged yet"
                          )}
                        </Txt>
                      </Pressable>
                      {group.length > 1 && (
                        <View style={{ flexDirection: "row", marginTop: (ROW_BAND - 44) / 2 }}>
                          <MoveButton dir="up" label={`Move ${t.label} up`} disabled={i === 0} onPress={() => void move(group, i, -1)} />
                          <MoveButton dir="down" label={`Move ${t.label} down`} disabled={i === group.length - 1} onPress={() => void move(group, i, 1)} />
                        </View>
                      )}
                      <View style={{ marginLeft: 4, marginTop: onBand(ROW_BAND, 32) }}>
                        <Switch value={!t.hidden} onChange={(on) => void toggle(t, on)} label={`Show ${t.label} in the check-in`} />
                      </View>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            ) : (
              <Sentence style={{ paddingHorizontal: 20, paddingTop: 18 }}>None yet. Add one below.</Sentence>
            )}
            {g.key === "custom" && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
                <AddBehaviour divided={group.length > 0} tags={tags} onAdded={(_, name) => toast(`${name} added`)} />
              </View>
            )}
          </Group>
        );
      })}
    </View>
  );
}

/** A round 40 px arrow button that moves a behaviour within its group; faint when it can't move further. */
function MoveButton({ dir, label, disabled, onPress }: { dir: "up" | "down"; label: string; disabled: boolean; onPress: () => void }) {
  const c = useCalm();
  const Icon = dir === "up" ? ArrowUp : ArrowDown;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={2}
      style={({ pressed }) => ({ width: 40, height: 44, borderRadius: 20, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : 1, backgroundColor: pressed ? c.ground : "transparent" })}
    >
      <Icon size={20} color={c.teal} strokeWidth={2} />
    </Pressable>
  );
}

/** The default groups and their sizes (queries/journal.ts DEFAULT_JOURNAL_TAGS); custom ones only add rows below. */
const GROUPS: [string, number][] = [
  ["Evening", 4],
  ["Recovery", 3],
  ["Context", 2],
];

/** Behaviours loading: the intro, each group's card with its rows' boxes, and Your behaviours with the add form. */
function BehavioursSkeleton() {
  const c = useCalm();
  return (
    <View style={COLUMN}>
      <Sentence style={{ paddingHorizontal: 4 }}>{INTRO}</Sentence>
      {GROUPS.map(([title, n]) => (
        <Group key={title} title={title} padding={0}>
          <View style={{ paddingVertical: 4 }}>
            {Array.from({ length: n }, (_, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Hairline inset={16 + 36 + 12} />}
                <View style={{ minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: (64 - ROW_BAND) / 2 }}>
                  <Skeleton radius={12} style={{ width: 36, height: 36, marginTop: onBand(ROW_BAND, 36) }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <SkeletonText size={16} lineHeight={21} width={112} />
                    <SkeletonText size={13} lineHeight={18} width={96} />
                  </View>
                  <View style={{ width: 80 }} />
                  <Skeleton radius={16} style={{ height: 32, width: 52, marginTop: onBand(ROW_BAND, 32) }} />
                </View>
              </React.Fragment>
            ))}
          </View>
        </Group>
      ))}
      <Group title="Your behaviours">
        <SkeletonText role="body" width={176} />
        <View style={{ marginTop: 16, gap: 8, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16 }}>
          <Txt size={14} lineHeight={19} weight={600} style={{ color: c.ink, paddingHorizontal: 4 }}>
            Add a behaviour
          </Txt>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Skeleton radius={16} style={{ height: 52, flex: 1 }} />
            <Skeleton radius={26} style={{ height: 52, width: 76 }} />
          </View>
        </View>
      </Group>
    </View>
  );
}
