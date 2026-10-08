import * as React from "react";
import { Pressable, View } from "react-native";
import { ChevronRight, Sparkles } from "lucide-react-native";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { Card } from "./Card";
import { IconTile, softFill } from "./calmKit";
import { Txt } from "./Text";

export type HomeInsightItem = { key: string; title: string; body: string };

/**
 * Home's coach card, Calm: a white card with a lavender icon tile, the title (Figtree 600 17/22) over the body (a
 * 14/19 sentence in the secondary grey). With several cards a second card peeks out underneath, and a footer counts them ("2 of 3", with a dot per
 * card) beside a round next button that cycles through them. Every card sits in the same cell, so nothing below moves
 * on a cycle.
 */
export function HomeInsight({ items }: { items: HomeInsightItem[] }) {
  const c = useCalm();
  const [i, setI] = React.useState(0);
  const n = items.length;
  if (!n) return null;
  const several = n > 1;
  const at = Math.min(i, n - 1);
  return (
    <View accessibilityLabel="Insights" style={{ paddingBottom: several ? 8 : 0 }}>
      {several && <View style={{ position: "absolute", left: 20, right: 20, bottom: 0, height: 32, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: alpha(c.card, 0.6) }} />}
      <Card padding={20}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
          <IconTile icon={<Sparkles size={22} color={c.ink} strokeWidth={1.75} />} tint="lavender" size={44} radius={14} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {items.map((it, k) => (
              <View
                key={it.key}
                accessibilityElementsHidden={k !== at}
                importantForAccessibility={k === at ? "auto" : "no-hide-descendants"}
                style={[{ gap: 4 }, k !== at && { position: "absolute", left: 0, top: 0, right: 0, opacity: 0 }]}
                pointerEvents={k === at ? "auto" : "none"}
              >
                <Txt size={17} lineHeight={22} weight={600} style={{ color: c.ink }}>
                  {it.title}
                </Txt>
                <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
                  {it.body}
                </Txt>
              </View>
            ))}
          </View>
        </View>
        {several && (
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            {/* The counter: a dot per card, the shown one teal and wider, then "2 of 3". */}
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityLabel={`Insight ${at + 1} of ${n}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {items.map((it, k) => (
                  <View key={it.key} style={{ height: 6, width: k === at ? 16 : 6, borderRadius: 3, backgroundColor: k === at ? c.teal : c.line }} />
                ))}
              </View>
              <Txt size={13} lineHeight={18} weight={600} style={{ color: c.sub }}>
                <Txt size={14} lineHeight={18} style={[font.numeric(700), { color: c.ink }]}>
                  {String(at + 1)}
                </Txt>
                {" of "}
                <Txt size={14} lineHeight={18} style={[font.numeric(700), { color: c.ink }]}>
                  {String(n)}
                </Txt>
              </Txt>
            </View>
            <Pressable
              onPress={() => setI((k) => (k + 1) % n)}
              accessibilityRole="button"
              accessibilityLabel={`Next insight (${at + 1} of ${n})`}
              hitSlop={6}
              style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: softFill(c, "card"), opacity: pressed ? 0.6 : 1 })}
            >
              <ChevronRight size={18} color={c.ink} strokeWidth={2.25} />
            </Pressable>
          </View>
        )}
      </Card>
    </View>
  );
}
