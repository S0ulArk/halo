// More's rows (spec §7.14 v2, ported from the web's src/components/shells/LinkList.tsx) as iOS Settings lists them: a
// small capital group header over one inset grouped card, a row per link with its coloured icon square, the label with a
// short sentence under it, a grey value and the thin chevron. On the phone a row can also run an action (Sync now)
// instead of opening a route.
import * as React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useRouter, type Href } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import type { SystemColor } from "@/ui/calm";
import type { CalmTint } from "../settings/calmKit";
import { InsetGroup, NavRow } from "../settings/list";

export type LinkListRow = {
  label: string;
  /** A route ("/trends", "/settings?s=source"), or an https URL with `external`. */
  href?: string;
  /** Runs instead of opening `href`. */
  onPress?: () => void;
  icon?: LucideIcon;
  /** In place of `icon` (a spinner while syncing). */
  iconNode?: React.ReactNode;
  /** The icon square's family colour (the metric family the row belongs to). */
  tint?: CalmTint;
  /** An iOS system colour for the icon square, in place of the family's (red notifications, purple, grey). */
  system?: SystemColor;
  /** Right-aligned, before the chevron, in grey: a short value ("Sep 22 - Sep 28"). */
  aside?: string;
  /** A line under the label, sentence case. */
  description?: string;
  /** The description's colour (a failed sync in red). */
  descriptionColor?: string;
  /** Opens outside the app, with an arrow instead of the chevron. */
  external?: boolean;
  /** No chevron: the row is an action, not a way somewhere. */
  action?: boolean;
  /** The label in red (Remove all data). */
  danger?: boolean;
  disabled?: boolean;
  /** Words a search finds the row by, beside its label and sentence ("theme", "dark"). */
  keywords?: string;
};

/** One row as NavRow draws it: its action, or a push to its route. */
export function LinkRow({ row }: { row: LinkListRow }) {
  const router = useRouter();
  const open = row.onPress ?? (row.href ? () => router.push(row.href as Href) : undefined);
  return (
    <NavRow
      icon={row.icon}
      iconNode={row.iconNode}
      tint={row.tint}
      system={row.system}
      label={row.label}
      description={row.description}
      descriptionColor={row.descriptionColor}
      value={row.aside}
      onPress={open}
      external={row.external}
      action={row.action}
      danger={row.danger}
      disabled={row.disabled}
    />
  );
}

/** A group header over one inset grouped card of rows, each hairline inset to the text above it; an optional footer. */
export function LinkList({ title, rows, footer, style }: { title?: string; rows: LinkListRow[]; footer?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <InsetGroup title={title} footer={footer} style={style}>
      {rows.map((r) => (
        <LinkRow key={r.href ?? r.label} row={r} />
      ))}
    </InsetGroup>
  );
}
