// The web's LinkList (src/components/shells/LinkList.tsx), as the Reports archive uses it, as an iOS inset grouped list:
// a small capitals header, then one card (16 px corners) holding the group's rows with hairlines inset to the text
// between them; each row has its label, an optional line under it, an aside and the thin tertiary chevron, and settles
// and dims under the finger (the kit's press, on the UI thread).
import * as React from "react";
import { Pressable, View } from "react-native";
import Reanimated from "react-native-reanimated";
import { SkeletonText, Txt } from "@/ui";
import { ChevronSlot } from "@/ui/components/calmKit";
import { usePress, usePressStyle } from "@/ui/components/press";
import { Hairline, LIST_RADIUS, SectionLabel, useCalm } from "../settings/calmKit";

const PressableView = Reanimated.createAnimatedComponent(Pressable);

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

/** The group label over the rows: small capitals in grey, a heading for screen readers. */
export function GroupLabel({ children }: { children: string }) {
  return <SectionLabel>{children}</SectionLabel>;
}

/**
 * A row's band (the 28 px a one-line row's content fills): the label's first line, the aside and the chevron are
 * centred on it; the line under the label hangs below, so every row's aside sits on its label's line.
 */
const BAND = 28;

/** The row's inside: the label (or its placeholder) with its line under it, the aside, the chevron. */
function RowBody({ label, description, aside, labelNode }: { label?: string; description?: string; aside?: React.ReactNode; labelNode?: React.ReactNode }) {
  const c = useCalm();
  return (
    <>
      <View style={{ flex: 1, minWidth: 0, gap: 1, paddingTop: (BAND - 21) / 2 }}>
        {labelNode ?? (
          <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
            {label}
          </Txt>
        )}
        {description && (
          <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
            {description}
          </Txt>
        )}
      </View>
      {aside ? (
        <View style={{ minHeight: BAND, justifyContent: "center", flexShrink: 0 }}>
          {typeof aside === "string" ? (
            <Txt size={16} lineHeight={21} style={{ color: c.sub }}>
              {aside}
            </Txt>
          ) : (
            aside
          )}
        </View>
      ) : null}
      <View style={{ height: BAND, justifyContent: "center" }}>
        <ChevronSlot shown />
      </View>
    </>
  );
}

const ROW = { minHeight: 48, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 10 } as const;

/** The card the rows share. */
function GroupCard({ children }: { children: React.ReactNode }) {
  const c = useCalm();
  return <View style={{ borderRadius: LIST_RADIUS, backgroundColor: c.card, overflow: "hidden" }}>{children}</View>;
}

/** One row: the kit's press settles and dims it under the finger. */
function LinkRow({ r }: { r: LinkListRow }) {
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { dim: 0.55 });
  return (
    <PressableView onPress={r.onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={r.accessibilityLabel ?? r.label} style={[ROW, pressed]}>
      <RowBody label={r.label} description={r.description} aside={r.aside} />
    </PressableView>
  );
}

export function LinkList({ title, rows }: { title: string; rows: LinkListRow[] }) {
  return (
    <View style={{ gap: 7, minWidth: 0 }}>
      <GroupLabel>{title}</GroupLabel>
      <GroupCard>
        {rows.map((r, i) => (
          <React.Fragment key={r.key}>
            {i > 0 ? <Hairline inset={16} /> : null}
            <LinkRow r={r} />
          </React.Fragment>
        ))}
      </GroupCard>
    </View>
  );
}

/** Loading shape (spec §5.19): bars for a blank group title and blank row labels; the chevrons stay. */
export function LinkListSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <View style={{ gap: 7, minWidth: 0 }} importantForAccessibility="no-hide-descendants">
      {title ? <GroupLabel>{title}</GroupLabel> : <SkeletonText role="footnote" width={112} style={{ marginHorizontal: 16 }} />}
      <GroupCard>
        {Array.from({ length: rows }, (_, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Hairline inset={16} /> : null}
            <View style={ROW}>
              <RowBody labelNode={<SkeletonText role="body" size={16} lineHeight={21} width={112} />} />
            </View>
          </React.Fragment>
        ))}
      </GroupCard>
    </View>
  );
}
