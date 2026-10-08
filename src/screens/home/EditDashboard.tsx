// Home › My Dashboard's pencil (spec §11 CD1, CD2), ported from the web's src/app/(app)/_lib/EditDashboard.tsx: the
// reference app's two lists in a tall bottom sheet. "On Home" holds the shown metrics in order, each with Move up /
// Move down and Remove; "Add to My Dashboard" holds the rest by group with a search field, and a tap adds a metric to
// the end. Save keeps the list on the phone (dashboard.ts); Reset to default restores `defaults`. Calm: each metric
// leads with its family's pastel icon tile, section labels are small spaced capitals, rules are the palette's line.
import * as React from "react";
import { Pressable, TextInput, View } from "react-native";
import { ArrowDown, ArrowUp, Minus, Plus, Search } from "lucide-react-native";
import { DASHBOARD_GROUPS, DASHBOARD_LABEL, DASHBOARD_METRICS, type DashboardKey } from "@/queries";
import { moved } from "@/lib/utils";
import { accentFamily, BottomSheet, Button, font, Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { useSheetFieldAtTop } from "@/ui/components/BottomSheet";
import { FAMILY_TINT, softFill } from "@/ui/components/calmKit";
import { toast } from "../settings/toast";
import { EditButton, HeadTile } from "./controls";
import { saveDashboardKeys } from "./dashboard";
import { STAT_ICON } from "./view";

export type EditDashboardProps = {
  /** The metrics on Home now, in order. */
  keys: DashboardKey[];
  /** What Reset to default restores (the v1 rows, or phone metrics without a band). */
  defaults: DashboardKey[];
  /** Metrics with no value in the last 30 days: still addable, marked "No data yet". */
  empty?: DashboardKey[];
};

const GROUP_LABEL = Object.fromEntries(DASHBOARD_GROUPS.map((g) => [g.key, g.label])) as Record<string, string>;
const same = (a: DashboardKey[], b: DashboardKey[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/** The metric search. Focused, the sheet scrolls it to the top of what shows above the keyboard: matches list under it. */
function SearchField({ value, onChangeText }: { value: string; onChangeText: (q: string) => void }) {
  const c = useCalm();
  const ref = React.useRef<TextInput>(null);
  useSheetFieldAtTop(ref);
  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      placeholder="Search metrics…"
      placeholderTextColor={c.faint}
      accessibilityLabel="Search metrics"
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      style={{ height: 44, paddingLeft: 40, paddingRight: 16, fontSize: 16, color: c.ink, ...font.sans(400) }}
    />
  );
}

/** The sheet's caps section label (11 px spaced capitals) with a rule to the edge, and a count after it. */
function SectionLabel({ children, count, style }: { children: string; count?: number; style?: object }) {
  const c = useCalm();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, style]}>
      <Txt size={11} lineHeight={15} weight={600} style={{ color: c.faint, letterSpacing: 1.4 }}>
        {children.toUpperCase()}
        {count !== undefined && (
          <Txt size={12} lineHeight={15} style={[font.numeric(700), { color: c.ink, letterSpacing: 0 }]}>
            {`  ${count}`}
          </Txt>
        )}
      </Txt>
      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
    </View>
  );
}

/** The metric's icon tile in its family's pastel (a quiet grey one without a family). */
function StatIcon({ k }: { k: DashboardKey }) {
  const c = useCalm();
  const family = accentFamily(k);
  const tint = family ? FAMILY_TINT[family] : null;
  const Icon = STAT_ICON[k];
  if (!Icon) return <View style={{ width: 36, height: 36 }} />;
  return <HeadTile icon={Icon} color={tint ? c.tintInk[tint] : c.sub} bg={tint ? c.tint[tint] : c.ground} size={36} />;
}

/** The pencil and its sheet. */
export function EditDashboard({ keys, defaults, empty = [] }: EditDashboardProps) {
  const c = useCalm();
  // The sheet is a card: its quiet fills take the ground's grey.
  const quiet = softFill(c, "card");
  const [open, setOpen] = React.useState(false);
  const [shown, setShown] = React.useState(keys);
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const q = query.trim().toLowerCase();
  const hidden = DASHBOARD_METRICS.filter((m) => !shown.includes(m.key));
  const matches = hidden.filter((m) => !q || m.label.toLowerCase().includes(q) || GROUP_LABEL[m.group].toLowerCase().includes(q));
  const groups = DASHBOARD_GROUPS.map((g) => ({ ...g, items: matches.filter((m) => m.group === g.key) })).filter((g) => g.items.length);
  const noData = new Set(empty);

  const start = () => {
    setShown(keys);
    setQuery("");
    setOpen(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await saveDashboardKeys(shown, defaults);
      setOpen(false);
      toast("Dashboard saved");
    } catch {
      toast("Couldn’t save your dashboard. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const row = { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 4, borderBottomWidth: 1, borderBottomColor: c.line } as const;

  return (
    <>
      <EditButton label="Edit My Dashboard" onPress={start} />
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="My Dashboard"
        description="Choose the metrics on Home and their order."
        size="tall"
        footer={
          <>
            <Button size="sheet" onPress={() => void save()} disabled={saving || shown.length === 0}>
              {saving ? "Saving…" : "Save dashboard"}
            </Button>
            <Button size="sheet" variant="outline-pill" onPress={() => setShown(defaults)} disabled={saving || same(shown, defaults)}>
              Reset to default
            </Button>
          </>
        }
      >
        <SectionLabel count={shown.length} style={{ marginTop: 8 }}>
          On Home
        </SectionLabel>
        {shown.length === 0 ? (
          <Txt size={14} lineHeight={19} accessibilityRole="alert" style={{ paddingVertical: 16, color: c.sub }}>
            Add at least one metric to save.
          </Txt>
        ) : (
          <View>
            {shown.map((key, i) => {
              const label = DASHBOARD_LABEL[key];
              return (
                <View key={key} style={row}>
                  <View style={{ marginRight: 8 }}>
                    <StatIcon k={key} />
                  </View>
                  <Txt size={16} lineHeight={21} weight={500} style={{ flex: 1, minWidth: 0, color: c.ink }}>
                    {label}
                  </Txt>
                  <Button variant="ghost" size="icon-touch" accessibilityLabel={`Move ${label} up`} disabled={i === 0} onPress={() => setShown(moved(shown, i, -1))}>
                    <ArrowUp size={20} color={c.ink} strokeWidth={1.75} />
                  </Button>
                  <Button variant="ghost" size="icon-touch" accessibilityLabel={`Move ${label} down`} disabled={i === shown.length - 1} onPress={() => setShown(moved(shown, i, 1))}>
                    <ArrowDown size={20} color={c.ink} strokeWidth={1.75} />
                  </Button>
                  {/* the reference app hides removal behind a swipe that members could not find; Pulse shows it (spec §11 CD2). */}
                  <Button variant="ghost" size="icon-touch" accessibilityLabel={`Remove ${label}`} onPress={() => setShown(shown.filter((_, j) => j !== i))}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.tint.rose, alignItems: "center", justifyContent: "center" }}>
                      <Minus size={15} color={c.tintInk.rose} strokeWidth={2.5} />
                    </View>
                  </Button>
                </View>
              );
            })}
          </View>
        )}

        <SectionLabel style={{ marginTop: 32 }}>Add to My Dashboard</SectionLabel>
        <View style={{ marginTop: 12, height: 44, borderRadius: 22, backgroundColor: quiet, justifyContent: "center" }}>
          <View pointerEvents="none" style={{ position: "absolute", left: 14 }}>
            <Search size={18} color={c.sub} strokeWidth={2} />
          </View>
          <SearchField value={query} onChangeText={setQuery} />
        </View>
        {groups.map((g) => (
          <View key={g.key} style={{ marginTop: 20 }}>
            <Txt size={13} lineHeight={18} weight={600} style={{ color: c.sub }}>
              {g.label}
            </Txt>
            {g.items.map((m) => (
              <View key={m.key} style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
                <Pressable
                  onPress={() => setShown([...shown, m.key])}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${m.label}${noData.has(m.key) ? ", no data yet" : ""}`}
                  style={({ pressed }) => ({ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 14, backgroundColor: pressed ? quiet : "transparent" })}
                >
                  <StatIcon k={m.key} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={16} lineHeight={21} weight={500} style={{ color: c.ink }}>
                      {m.label}
                    </Txt>
                    {noData.has(m.key) && (
                      <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
                        No data yet
                      </Txt>
                    )}
                  </View>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.teal, alignItems: "center", justifyContent: "center" }}>
                    <Plus size={15} color={c.card} strokeWidth={2.5} />
                  </View>
                </Pressable>
              </View>
            ))}
          </View>
        ))}
        {groups.length === 0 && (
          <Txt size={14} lineHeight={19} align="center" style={{ paddingVertical: 24, color: c.sub }}>
            {hidden.length ? `No metric matches “${query.trim()}”.` : "Every metric is on Home."}
          </Txt>
        )}
      </BottomSheet>
    </>
  );
}
