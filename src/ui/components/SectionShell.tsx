// A titled section or card, the frame every metric block on Today, Health and the detail screens sits in.
import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Activity, ChevronRight, Flame, Heart, HeartPulse, Moon, Scale, Waves, type LucideIcon } from "lucide-react-native";
import { accentFamily, type AccentFamily } from "@/ui/accents";
import { useCalm } from "@/ui/calm";
import { Card } from "./Card";
import { CHEVRON, FAMILY_TINT } from "./calmKit";
import { InfoButton, type InfoContent } from "./InfoButton";
import { Txt } from "./Text";

export type SectionShellProps = {
  variant: "section" | "card";
  title: string;
  info?: InfoContent;
  /** A "View all" style action, or any node (e.g. an icon button). */
  action?: { label: string; onPress: () => void } | React.ReactNode;
  /** Right side of the header: a caption ("vs. 30-day average") or tags. */
  aside?: React.ReactNode;
  /** Card only: the whole card is one tap target; the header then shows only a chevron. */
  onPress?: () => void;
  /** Card only: the body is a flex column that fills the card's height. */
  fill?: boolean;
  /**
   * Card only: the metric family whose glyph and colour lead the title (src/ui/accents.ts). Default: found from the
   * title ("Sleep" → sleep); null: an ink title alone.
   */
  accent?: AccentFamily | null;
  /** Card only: passed to `Card` (kept for API compatibility; cards no longer animate in). */
  animateIn?: boolean;
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

const isAction = (a: SectionShellProps["action"]): a is { label: string; onPress: () => void } => !!a && typeof a === "object" && "onPress" in a && "label" in a;

/** The icon a family's tile shows in a card header. */
const FAMILY_ICON: Record<AccentFamily, LucideIcon> = {
  sleep: Moon,
  recovery: HeartPulse,
  strain: Flame,
  heart: Heart,
  activity: Activity,
  body: Scale,
  stress: Waves,
};

/** "View all" and friends: a blue link, iOS's ("Edit", "Show All"). */
function ActionLink({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useCalm();
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 1, opacity: pressed ? 0.5 : 1 })}>
      <Txt size={16} lineHeight={21} weight={500} style={{ color: c.teal }}>
        {label}
      </Txt>
      <ChevronRight size={17} color={c.teal} strokeWidth={2.4} />
    </Pressable>
  );
}

/**
 * A titled section or card (spec §4.7), in Apple Health's look. `section`: a 22/28 bold ink title (iOS's title2) over
 * its content, the aside and action at the right. `card`: the flat card (20 px corners, 16 px padding) whose header is
 * the family's glyph and its name in the family's colour (15 px semibold, as Health heads "Heart Rate"), or an ink
 * title when the title maps to no family, then the aside, a thin chevron, action or info at the right.
 */
export function SectionShell({ variant, title, info, action, aside, onPress, fill, accent, animateIn, index, style, children }: SectionShellProps) {
  const c = useCalm();
  const actionNode = isAction(action) ? <ActionLink {...action} /> : action;

  if (variant === "section")
    return (
      <View style={[{ minWidth: 0 }, style]} accessibilityRole="header">
        {/* One header height for every section (the 34 px "+" on My Day), so side-by-side sections start their cards level. */}
        <View style={{ marginBottom: 10, minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 4 }}>
          <Txt size={22} lineHeight={28} weight={700} style={{ color: c.ink, flexShrink: 1 }}>
            {title}
          </Txt>
          {(aside || actionNode) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 0 }}>
              {aside}
              {actionNode}
            </View>
          )}
        </View>
        {children}
      </View>
    );

  // The family's tile leads the title: given, else found from the title ("Heart rate" → heart).
  const family = accent !== undefined ? accent : accentFamily(title);
  const Icon = family ? FAMILY_ICON[family] : null;
  const ink = family ? c.tintInk[FAMILY_TINT[family]] : c.ink;
  const header = (
    <View style={{ marginBottom: 12, minHeight: 24, flexDirection: "row", alignItems: "center", gap: 7 }}>
      {family && Icon && <Icon size={18} color={ink} strokeWidth={2.2} />}
      {/* Wraps to two lines rather than cutting a long title short. */}
      <Txt size={family ? 15 : 17} lineHeight={family ? 20 : 22} weight={600} numberOfLines={2} style={{ color: ink, flex: 1, minWidth: 0 }}>
        {title}
      </Txt>
      {(aside || onPress || actionNode || info) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0, maxWidth: "60%" }}>
          {aside}
          {onPress ? <ChevronRight size={CHEVRON.size} color={c.tertiary} strokeWidth={CHEVRON.stroke} style={{ marginRight: -4 }} /> : actionNode}
          {/* A card's info button sits at its top right corner (spec §11 F8). */}
          {info && !onPress && <InfoButton info={info} label={title} variant="card" />}
        </View>
      )}
    </View>
  );

  return (
    <Card onPress={onPress} accessibilityLabel={onPress ? title : undefined} animateIn={animateIn} index={index} style={style}>
      <View style={fill ? { flex: 1 } : undefined}>
        {header}
        {children}
      </View>
    </Card>
  );
}
