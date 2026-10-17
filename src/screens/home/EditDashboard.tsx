// Today's "Pinned" and Health's My Dashboard editor (spec §11 CD1, CD2), ported from the web's
// src/app/(app)/_lib/EditDashboard.tsx, as iOS's list editing: "Edit" beside the section's title opens a tall sheet
// with two inset grouped lists. "Pinned" holds the shown metrics in order, each with iOS's red remove button and Move up
// / Move down; "More metrics" holds the rest by group under a search field, each row led by the green add mark, and a
// tap on the row adds it to the end. Done keeps the list on the phone (dashboard.ts); Reset to default restores `defaults`. Each metric
// leads with its family's icon square.
import * as React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { ArrowDown, ArrowUp, Minus, Plus, Search } from "lucide-react-native";
import { DASHBOARD_GROUPS, DASHBOARD_LABEL, DASHBOARD_METRICS, type DashboardKey } from "@/queries";
import { moved } from "@/lib/utils";
import { accentFamily, BottomSheet, Button, font, SheetSection, Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { useSheetFieldAtTop } from "@/ui/components/BottomSheet";
import { FAMILY_TINT } from "@/ui/components/calmKit";
import { usePress, usePressStyle } from "@/ui/components/press";
import { haptic } from "@/ui/motion/haptics";
import { toast } from "../settings/toast";
import { EditLink, HeadTile, RowIcon } from "./controls";
import { saveDashboardKeys } from "./dashboard";
import { STAT_ICON } from "./view";

const PressableView = Animated.createAnimatedComponent(Pressable);

export type EditDashboardProps = {
  /** The pinned metrics now, in order. */
  keys: DashboardKey[];
  /** What Reset to default restores (the v1 rows, or phone metrics without a band). */
  defaults: DashboardKey[];
  /** Metrics with no value in the last 30 days: still addable, marked "No data yet". */
  empty?: DashboardKey[];
};

const GROUP_LABEL = Object.fromEntries(DASHBOARD_GROUPS.map((g) => [g.key, g.label])) as Record<string, string>;
const same = (a: DashboardKey[], b: DashboardKey[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/** A list row's icon square inset: the hairline under a row starts at its text. */
const ROW_INSET = 16 + 24 + 12 + 29 + 12;

/** iOS's search field: a rounded box in the quiet fill with the magnifier. Focused, the sheet scrolls it to the top of what shows above the keyboard. */
function SearchField({ value, onChangeText }: { value: string; onChangeText: (q: string) => void }) {
  const c = useCalm();
  const ref = React.useRef<TextInput>(null);
  useSheetFieldAtTop(ref);
  return (
    <View style={{ height: 40, borderRadius: 12, backgroundColor: c.fill, justifyContent: "center" }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 10 }}>
        <Search size={18} color={c.sub} strokeWidth={2.2} />
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder="Search metrics"
        placeholderTextColor={c.sub}
        accessibilityLabel="Search metrics"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        cursorColor={c.teal}
        style={{ height: 40, paddingLeft: 36, paddingRight: 12, fontSize: 17, color: c.ink, ...font.sans(400) }}
      />
    </View>
  );
}

/** The metric's icon square in its family's colour (a quiet grey one without a family). */
function StatIcon({ k }: { k: DashboardKey }) {
  const c = useCalm();
  const family = accentFamily(k);
  const tint = family ? FAMILY_TINT[family] : null;
  const Icon = STAT_ICON[k];
  if (!Icon) return <View style={{ width: 29, height: 29 }} />;
  return tint ? <RowIcon icon={Icon} tint={tint} /> : <HeadTile icon={Icon} color="#ffffff" bg={c.faint} size={29} />;
}

/** iOS's round edit control: the green plus that adds (drawn only: its whole row is the button). */
function AddDot() {
  const c = useCalm();
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.system.green, alignItems: "center", justifyContent: "center" }}>
      <Plus size={16} color="#ffffff" strokeWidth={3} />
    </View>
  );
}

/** iOS's round edit control: the red minus that removes. */
function RemoveDot({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useCalm();
  const press = usePress(0.85);
  const pressed = usePressStyle(press, { dim: 0.7 });
  return (
    <PressableView
      onPress={() => {
        haptic.select();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.system.red, alignItems: "center", justifyContent: "center" }, pressed]}
    >
      <Minus size={16} color="#ffffff" strokeWidth={3} />
    </PressableView>
  );
}

/** A move button: the blue arrow, faint where the metric can't move further. */
function MoveButton({ up, label, disabled, onPress }: { up: boolean; label: string; disabled: boolean; onPress: () => void }) {
  const c = useCalm();
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={2}
      style={({ pressed }) => ({ width: 40, height: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.25 : pressed ? 0.45 : 1 })}
    >
      <Icon size={20} color={c.teal} strokeWidth={2.2} />
    </Pressable>
  );
}

/** A row of "More metrics": the whole row adds the metric, settling and dimming while pressed. */
function AddRow({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { dim: 0.55 });
  return (
    <PressableView
      onPress={() => {
        haptic.select();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 4 }, pressed]}
    >
      {children}
    </PressableView>
  );
}

/** One inset grouped list on the sheet: rows in the sheet's card fill, iOS hairlines inset to the text between them. */
function List({ children }: { children: React.ReactNode[] }) {
  const c = useCalm();
  return (
    <View style={{ borderRadius: 14, backgroundColor: c.sheetFill, overflow: "hidden" }}>
      {children.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: ROW_INSET, backgroundColor: c.line }} />}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

/** "Edit" and its sheet. */
export function EditDashboard({ keys, defaults, empty = [] }: EditDashboardProps) {
  const c = useCalm();
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

  const row = { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 6, paddingVertical: 4 } as const;

  return (
    <>
      <EditLink accessibilityLabel="Edit My Dashboard" onPress={start} />
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="My Dashboard"
        description="Choose the metrics you pin and their order."
        size="tall"
        done={{ label: saving ? "Saving…" : "Done", onPress: () => void save(), disabled: saving || shown.length === 0 }}
        footer={
          <Button size="sheet" variant="outline-pill" onPress={() => setShown(defaults)} disabled={saving || same(shown, defaults)}>
            Reset to default
          </Button>
        }
      >
        <View style={{ gap: 8, marginTop: 4 }}>
          <SheetSection>{`Pinned · ${shown.length}`}</SheetSection>
          {shown.length === 0 ? (
            <Txt size={15} lineHeight={20} accessibilityRole="alert" style={{ paddingHorizontal: 4, paddingVertical: 8, color: c.sub }}>
              Add at least one metric to save.
            </Txt>
          ) : (
            <List>
              {shown.map((key, i) => {
                const label = DASHBOARD_LABEL[key];
                return (
                  <View key={key} style={row}>
                    {/* the reference app hides removal behind a swipe that members could not find; Halo shows it (spec §11 CD2). */}
                    <RemoveDot label={`Remove ${label}`} onPress={() => setShown(shown.filter((_, j) => j !== i))} />
                    <StatIcon k={key} />
                    <Txt size={16} lineHeight={21} style={{ flex: 1, minWidth: 0, color: c.ink }}>
                      {label}
                    </Txt>
                    <View style={{ flexDirection: "row" }}>
                      <MoveButton up label={`Move ${label} up`} disabled={i === 0} onPress={() => setShown(moved(shown, i, -1))} />
                      <MoveButton up={false} label={`Move ${label} down`} disabled={i === shown.length - 1} onPress={() => setShown(moved(shown, i, 1))} />
                    </View>
                  </View>
                );
              })}
            </List>
          )}
        </View>

        <View style={{ gap: 10, marginTop: 28 }}>
          <SheetSection>More metrics</SheetSection>
          <SearchField value={query} onChangeText={setQuery} />
        </View>
        {groups.map((g) => (
          <View key={g.key} style={{ gap: 8, marginTop: 20 }}>
            <SheetSection>{g.label}</SheetSection>
            <List>
              {g.items.map((m) => (
                <AddRow key={m.key} label={`Add ${m.label}${noData.has(m.key) ? ", no data yet" : ""}`} onPress={() => setShown([...shown, m.key])}>
                  <AddDot />
                  <StatIcon k={m.key} />
                  <View style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
                    <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
                      {m.label}
                    </Txt>
                    {noData.has(m.key) && (
                      <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
                        No data yet
                      </Txt>
                    )}
                  </View>
                </AddRow>
              ))}
            </List>
          </View>
        ))}
        {groups.length === 0 && (
          <Txt size={15} lineHeight={20} align="center" style={{ paddingVertical: 24, color: c.sub }}>
            {hidden.length ? `No metric matches “${query.trim()}”.` : "Every metric is pinned."}
          </Txt>
        )}
      </BottomSheet>
    </>
  );
}
