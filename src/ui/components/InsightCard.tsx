// The coach card (spec §5.15) in the iOS look, as Today's coach card draws it: a flat card washed with the family's
// colour from its top left, a solid icon square in that colour with the sparkle in white, the title (16/21 semibold),
// the body (15/21 in ink) and the action as a blue link. Not rendered when empty.
import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Sparkles } from "lucide-react-native";
import { useScreenAccent, type AccentFamily } from "@/ui/accents";
import { useCalm, type CalmTint } from "@/ui/calm";
import { CARD_RADIUS } from "./Card";
import { familyTint, iconRadius, OnCard } from "./calmKit";
import { Skeleton, SkeletonText } from "./Skeleton";
import { Txt } from "./Text";

export type InsightCardProps = {
  title?: string;
  /** Second person, present tense, one idea. */
  body: string;
  action?: { label: string; onPress: () => void };
  /**
   * Colours the card in this metric family's colour instead of the coach indigo. Default: the screen's family from an
   * enclosing `AccentScope`, else indigo.
   */
  accent?: AccentFamily | null;
};

/** The frame: the flat card (20 px corners, 16 px padding), washed with `tint` when given. */
function Frame({ tint, children }: { tint?: CalmTint; children: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={{ borderRadius: CARD_RADIUS, backgroundColor: c.card, padding: 16, overflow: "hidden" }}>
      {tint && <LinearGradient pointerEvents="none" colors={[c.tint[tint], c.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      <OnCard>{children}</OnCard>
    </View>
  );
}

export function InsightCard({ title, body, action, accent }: InsightCardProps) {
  const c = useCalm();
  const screen = useScreenAccent();
  const family = accent !== undefined ? accent : screen;
  const tint = familyTint(family) ?? "lavender";
  return (
    <Frame tint={tint}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: iconRadius(36), backgroundColor: c.tintInk[tint], alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={20} color="#ffffff" strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4, minHeight: 36, justifyContent: "center" }}>
          {title && (
            <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
              {title}
            </Txt>
          )}
          <Txt size={15} lineHeight={21} style={{ color: title ? c.sub : c.ink }}>
            {body}
          </Txt>
          {action && (
            <Pressable
              onPress={action.onPress}
              accessibilityRole="button"
              hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }}
              style={({ pressed }) => ({ marginTop: 6, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 1, opacity: pressed ? 0.5 : 1 })}
            >
              <Txt size={15} lineHeight={20} weight={500} style={{ color: c.teal }}>
                {action.label}
              </Txt>
              <ChevronRight size={17} color={c.teal} strokeWidth={2.4} />
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
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <Skeleton radius={iconRadius(36)} style={{ width: 36, height: 36 }} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          {title && <SkeletonText role="insightTitle" size={16} lineHeight={21} width={160} />}
          <View>
            <SkeletonText role="body" size={15} lineHeight={21} />
            <SkeletonText role="body" size={15} lineHeight={21} width="66%" />
          </View>
          {action && <SkeletonText role="label" size={15} lineHeight={20} width={144} style={{ marginTop: 6 }} />}
        </View>
      </View>
    </Frame>
  );
}
InsightCard.Skeleton = InsightCardSkeleton;
