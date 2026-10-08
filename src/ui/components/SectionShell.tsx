import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Activity, ChevronRight, Flame, Heart, HeartPulse, Moon, Scale, Waves, type LucideIcon } from "lucide-react-native";
import { accentFamily, type AccentFamily } from "@/ui/accents";
import { useCalm } from "@/ui/calm";
import { Card } from "./Card";
import { FAMILY_TINT, IconTile } from "./calmKit";
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
   * Card only: the metric family whose pastel icon tile leads the title (src/ui/accents.ts). Default: found from the
   * title ("Sleep" → sleep); null: no tile.
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

/** "View all" and friends: a teal link with a chevron. */
function ActionLink({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useCalm();
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, opacity: pressed ? 0.6 : 1 })}>
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal }}>
        {label}
      </Txt>
      <ChevronRight size={16} color={c.teal} strokeWidth={2.25} />
    </Pressable>
  );
}

/**
 * A titled section or card (spec §4.7), Calm. `section`: a 24/30 bold ink title over its content, the aside and
 * action at the right. `card`: the white Calm card (28 px corners, 20 px padding) whose header is the family's pastel
 * icon tile (when the title maps to one), the title in Figtree 600 17/22 ink, then the aside, action or info at the
 * right.
 */
export function SectionShell({ variant, title, info, action, aside, onPress, fill, accent, animateIn, index, style, children }: SectionShellProps) {
  const c = useCalm();
  const actionNode = isAction(action) ? <ActionLink {...action} /> : action;

  if (variant === "section")
    return (
      <View style={[{ minWidth: 0 }, style]} accessibilityRole="header">
        {/* One header height for every section (the 34 px "+" on My Day), so side-by-side sections start their cards level. */}
        <View style={{ marginBottom: 12, minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Txt size={22} lineHeight={30} weight={600} style={{ color: c.ink, flexShrink: 1, letterSpacing: -0.3 }}>
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
  const header = (
    <View style={{ marginBottom: 16, minHeight: 26, flexDirection: "row", alignItems: "center", gap: 12 }}>
      {family && Icon && <IconTile icon={<Icon size={22} color={c.ink} strokeWidth={1.75} />} tint={FAMILY_TINT[family]} />}
      {/* Wraps to two lines rather than cutting a long title short. */}
      <Txt size={17} lineHeight={22} weight={600} numberOfLines={2} style={{ color: c.ink, flex: 1, minWidth: 0 }}>
        {title}
      </Txt>
      {(aside || onPress || actionNode || info) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0, maxWidth: "60%" }}>
          {aside}
          {onPress ? <ChevronRight size={18} color={c.label} strokeWidth={1.5} style={{ marginRight: -4 }} /> : actionNode}
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
