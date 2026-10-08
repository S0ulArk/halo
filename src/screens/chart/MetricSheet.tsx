// The explorer's metric and compare pickers: Trends' metric sheet (one section open at a time, its metrics as
// wrapping chips), over the explorer's own catalogue.
import * as React from "react";
import { Pressable, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { BottomSheet, Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { CalmChip, useCalm } from "@/screens/settings/calmKit";

export type SheetGroup = { group: string; metrics: { key: string; label: string }[] };

/** A metric chip on the white sheet: grey, solid teal when it is the current one. */
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <CalmChip label={label} selected={selected} onPress={onPress} role="button" on="card" />;
}

/**
 * A sheet of metrics by section. A tap on a metric picks it and closes; `none` adds a first chip that clears the pick
 * (the compare picker's "None").
 */
export function MetricSheet({
  open,
  onClose,
  title,
  groups,
  current,
  onPick,
  none,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  groups: SheetGroup[];
  current: string | null;
  onPick: (key: string | null) => void;
  none?: string;
}) {
  const c = useCalm();
  const home = groups.find((g) => g.metrics.some((m) => m.key === current))?.group ?? groups[0]?.group ?? "";
  // Each opening starts on the current metric's section (state reset while rendering, React's pattern for it).
  const [state, setState] = React.useState({ open, expanded: home });
  if (state.open !== open) setState({ open, expanded: open ? home : state.expanded });
  const expanded = state.expanded;
  const setExpanded = (group: string) => setState((x) => ({ ...x, expanded: group }));
  const pick = (key: string | null) => {
    onClose();
    if (key !== current) onPick(key);
  };
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {none && (
        <View style={{ flexDirection: "row", paddingBottom: 12 }}>
          <Chip label={none} selected={current === null} onPress={() => pick(null)} />
        </View>
      )}
      {groups.length === 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 16 }}>
          {groups[0].metrics.map((m) => (
            <Chip key={m.key} label={m.label} selected={m.key === current} onPress={() => pick(m.key)} />
          ))}
        </View>
      ) : (
        groups.map(({ group, metrics }, i) => {
          const on = group === expanded;
          return (
            <View key={group} style={{ borderBottomWidth: i < groups.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
              <Pressable
                onPress={() => setExpanded(group)}
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <Txt size={16} lineHeight={21} weight={600} style={{ color: on ? c.teal : c.ink, flexShrink: 1 }}>
                  {group}
                </Txt>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Txt size={15} lineHeight={20} style={[font.numeric(600), { color: c.sub }]}>
                    {String(metrics.length)}
                  </Txt>
                  <ChevronDown size={20} color={c.label} strokeWidth={1.5} style={{ transform: [{ rotate: on ? "180deg" : "0deg" }] }} />
                </View>
              </Pressable>
              {on && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 16 }}>
                  {metrics.map((m) => (
                    <Chip key={m.key} label={m.label} selected={m.key === current} onPress={() => pick(m.key)} />
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
    </BottomSheet>
  );
}
