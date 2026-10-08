import * as React from "react";
import { Pressable, View } from "react-native";
import { ArrowRight, Sparkles } from "lucide-react-native";
import { useScreenAccent, type AccentFamily } from "@/ui/accents";
import { useCalm } from "@/ui/calm";
import { CARD_RADIUS } from "./Card";
import { familyTint, IconTile, OnCard } from "./calmKit";
import { Skeleton, SkeletonText } from "./Skeleton";
import { Txt } from "./Text";

export type InsightCardProps = {
  title?: string;
  /** Second person, present tense, one idea. */
  body: string;
  action?: { label: string; onPress: () => void };
  /**
   * Tints the icon tile in this metric family's pastel instead of the coach lavender. Default: the screen's family
   * from an enclosing `AccentScope`, else lavender.
   */
  accent?: AccentFamily | null;
};

/** The frame: the white card (32 px corners, 20 px padding) with the faint hairline and the soft lift. */
function Frame({ children }: { children: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={{ borderRadius: CARD_RADIUS, backgroundColor: c.card, borderWidth: 1, borderColor: c.edge, padding: 20, ...(c.shadow ? { boxShadow: c.shadow } : null) }}>
      <OnCard>{children}</OnCard>
    </View>
  );
}

/**
 * The coach card (spec §5.15), Calm: a lavender icon tile (or the family's pastel), the title in Figtree 600 17/22,
 * the body 15/22 in ink, and the action as a teal link. Not rendered when empty.
 */
export function InsightCard({ title, body, action, accent }: InsightCardProps) {
  const c = useCalm();
  const screen = useScreenAccent();
  const family = accent !== undefined ? accent : screen;
  const tint = familyTint(family) ?? "lavender";
  return (
    <Frame>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <IconTile icon={<Sparkles size={20} color={c.ink} strokeWidth={1.75} />} tint={tint} size={40} radius={13} />
        <View style={{ flex: 1, minWidth: 0, gap: 6, minHeight: 40, justifyContent: "center" }}>
          {title && (
            <Txt size={17} lineHeight={22} weight={600} style={{ color: c.ink }}>
              {title}
            </Txt>
          )}
          <Txt size={15} lineHeight={22} style={{ color: c.ink }}>
            {body}
          </Txt>
          {action && (
            <Pressable
              onPress={action.onPress}
              accessibilityRole="button"
              hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }}
              style={({ pressed }) => ({ marginTop: 6, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}
            >
              <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal }}>
                {action.label}
              </Txt>
              <ArrowRight size={16} color={c.teal} strokeWidth={2.25} />
            </Pressable>
          )}
        </View>
      </View>
    </Frame>
  );
}

/** `title` / `action`: room for the card's title line and its link line ("See what shaped it"). */
export function InsightCardSkeleton({ title = false, action = false }: { title?: boolean; action?: boolean }) {
  return (
    <Frame>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <Skeleton radius={13} style={{ width: 40, height: 40 }} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          {title && <SkeletonText role="insightTitle" size={17} lineHeight={22} width={160} />}
          <View>
            <SkeletonText role="body" size={15} lineHeight={22} />
            <SkeletonText role="body" size={15} lineHeight={22} width="66%" />
          </View>
          {action && <SkeletonText role="label" size={15} lineHeight={20} width={144} style={{ marginTop: 6 }} />}
        </View>
      </View>
    </Frame>
  );
}
InsightCard.Skeleton = InsightCardSkeleton;
