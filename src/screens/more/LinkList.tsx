// The settings rows (spec §7.14 v2), ported from the web's src/components/shells/LinkList.tsx and drawn in the Calm
// style: a small spaced-capitals group label, then one white 28 px card per group with a row per link: a tinted icon
// tile, the label with a short sentence under it, an aside, and a chevron. On the phone a row can also run an action
// (Sync now) instead of opening a route.
import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { CALM_COLUMN, CALM_RADIUS, GroupList, GroupRow, SectionLabel, useCalm, type CalmTint } from "../settings/calmKit";

export type LinkListRow = {
  label: string;
  /** A route ("/trends", "/settings?s=source"), or an https URL with `external`. */
  href?: string;
  /** Runs instead of opening `href`. */
  onPress?: () => void;
  icon?: LucideIcon;
  /** In place of `icon` (a spinner while syncing). */
  iconNode?: React.ReactNode;
  /** The icon tile's pastel (the metric family the row belongs to). */
  tint?: CalmTint;
  /** Right-aligned, before the chevron: a short caption ("Sep 22 - Sep 28") or a node. */
  aside?: React.ReactNode;
  /** A line under the label, sentence case. */
  description?: string;
  /** The description's colour (a failed sync in rose). */
  descriptionColor?: string;
  /** Opens outside the app, with an arrow instead of the chevron. */
  external?: boolean;
  /** No chevron: the row is an action, not a way somewhere. */
  action?: boolean;
  /** The label in rose (Remove all data). */
  danger?: boolean;
  disabled?: boolean;
};

/** One centred column up to 640 px, 24 px between groups. */
export const MORE_COLUMN = CALM_COLUMN;

/** A group's label: small spaced capitals, a heading for screen readers. */
export function GroupLabel({ children }: { children: string }) {
  return <SectionLabel>{children}</SectionLabel>;
}

/** One row on its own white card (the rows of a group share one card in LinkList). */
export function LinkRow({ row }: { row: LinkListRow }) {
  const c = useCalm();
  return (
    <View style={{ borderRadius: CALM_RADIUS, overflow: "hidden", backgroundColor: c.card }}>
      <GroupRow row={row} />
    </View>
  );
}

/** A group label over one white card of rows, hairlines between them. */
export function LinkList({ title, rows, style }: { title: string; rows: LinkListRow[]; style?: StyleProp<ViewStyle> }) {
  return <GroupList title={title} rows={rows} style={style} />;
}
