// The web's LinkList (src/components/shells/LinkList.tsx), as the Reports archive uses it, in the Calm grouped-list
// style: a small spaced-capitals group label, then one white 28 px card holding the group's rows, hairlines between
// them; each row has its label, an optional line under it, an aside and a chevron.
import * as React from "react";
import { Pressable, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { SkeletonText, Txt } from "@/ui";
import { CALM_RADIUS, Hairline, SectionLabel, useCalm } from "../settings/calmKit";

export type LinkListRow = {
  key: string;
  label: string;
  /** A line under the label, sentence case ("Partial week"). */
  description?: string;
  /** Right-aligned, before the chevron: a short caption or a node (a ring and value). */
  aside?: React.ReactNode;
  /** The row's spoken name when the aside says more than the label ("Sep 21 - Sep 27, average Recovery 58%"). */
  accessibilityLabel?: string;
  onPress: () => void;
};

/** One centred column of groups (the web's MORE_COLUMN): 24 px between them. */
export const MORE_COLUMN_GAP = 24;

/** The group label over the rows: small spaced capitals, a heading for screen readers. */
export function GroupLabel({ children }: { children: string }) {
  return <SectionLabel>{children}</SectionLabel>;
}

/**
 * A row's band (the 40 px a one-line row's content fills): the label's first line, the aside and the chevron are
 * centred on it; the line under the label hangs below, so every row's aside sits on its label's line.
 */
const BAND = 40;

/** The row's inside: the label (or its placeholder) with its line under it, the aside, the chevron. */
function RowBody({ label, description, aside, labelNode }: { label?: string; description?: string; aside?: React.ReactNode; labelNode?: React.ReactNode }) {
  const c = useCalm();
  return (
    <>
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: (BAND - 21) / 2 }}>
        {labelNode ?? (
          <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
            {label}
          </Txt>
        )}
        {description && (
          <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
            {description}
          </Txt>
        )}
      </View>
      {aside ? (
        <View style={{ minHeight: BAND, justifyContent: "center", flexShrink: 0 }}>
          {typeof aside === "string" ? (
            <Txt size={13} lineHeight={18} weight={500} style={{ color: c.sub }}>
              {aside}
            </Txt>
          ) : (
            aside
          )}
        </View>
      ) : null}
      <View style={{ height: BAND, justifyContent: "center" }}>
        <ChevronRight size={20} color={c.label} strokeWidth={1.5} />
      </View>
    </>
  );
}

const ROW = { minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 18, paddingVertical: 12 } as const;

/** The white card the rows share. */
function GroupCard({ children }: { children: React.ReactNode }) {
  const c = useCalm();
  return <View style={{ borderRadius: CALM_RADIUS, backgroundColor: c.card, overflow: "hidden", paddingVertical: 4 }}>{children}</View>;
}

export function LinkList({ title, rows }: { title: string; rows: LinkListRow[] }) {
  const c = useCalm();
  return (
    <View style={{ gap: 10, minWidth: 0 }}>
      <GroupLabel>{title}</GroupLabel>
      <GroupCard>
        {rows.map((r, i) => (
          <React.Fragment key={r.key}>
            {i > 0 ? <Hairline inset={18} /> : null}
            <Pressable onPress={r.onPress} accessibilityRole="button" accessibilityLabel={r.accessibilityLabel ?? r.label} style={({ pressed }) => [ROW, { backgroundColor: pressed ? c.ground : "transparent" }]}>
              <RowBody label={r.label} description={r.description} aside={r.aside} />
            </Pressable>
          </React.Fragment>
        ))}
      </GroupCard>
    </View>
  );
}

/** Loading shape (spec §5.19): bars for a blank group title and blank row labels; the chevrons stay. */
export function LinkListSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <View style={{ gap: 10, minWidth: 0 }} importantForAccessibility="no-hide-descendants">
      {title ? <GroupLabel>{title}</GroupLabel> : <SkeletonText role="button" width={112} style={{ marginHorizontal: 6 }} />}
      <GroupCard>
        {Array.from({ length: rows }, (_, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Hairline inset={18} /> : null}
            <View style={ROW}>
              <RowBody labelNode={<SkeletonText role="label" size={16} lineHeight={21} width={112} />} />
            </View>
          </React.Fragment>
        ))}
      </GroupCard>
    </View>
  );
}
