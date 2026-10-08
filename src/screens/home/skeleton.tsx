// Today's loading state (spec §5.19), in the Calm layout it stands in for: the three score cards beside the band tile
// and "See data", the day's outlook, the goals at a glance, the day's activities and the journal with its quick log,
// each with its real surface, icon tile, title and labels; only values are bars, so nothing moves when data arrives.
// The links that need no data stay live. My Dashboard's own (the Health tab) is DashboardSkeleton.
import * as React from "react";
import { Pressable, View } from "react-native";
import { Activity, ChartNoAxesCombined, ChevronRight, NotebookPen, Sun, Target, type LucideIcon } from "lucide-react-native";
import { DASHBOARD_DEFAULT, DASHBOARD_LABEL, type DashboardKey } from "@/queries";
import { accentFamily, InfoButton, SectionShell, Skeleton, SkeletonText, TimelineSkeleton, Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { Caption, FAMILY_TINT, OnCard } from "@/ui/components/calmKit";
import { Card } from "@/ui/components/Card";
import { CalmSurface } from "@/ui/components/CalmSurface";
import { TileLabel, TileRow } from "@/ui/components/TileRow";
import { HeadTile, IconSlot } from "./controls";
import { STRAIN_RECOVERY_INFO } from "./info";
import { bentoRows, CARD_GAP } from "./sections";
import { STAT_ICON } from "./view";

/** A card's surface and head (icon tile, title or a bar for it, a bar for its sentence), then its body. */
function SkelCard({ tint, icon, iconTint, title, sentence = true, right, children }: { tint?: CalmTint; icon: LucideIcon; iconTint?: CalmTint; title?: string; sentence?: boolean; right?: React.ReactNode; children?: React.ReactNode }) {
  const c = useCalm();
  const ink = tint ? c.tintInk[tint] : iconTint ? c.tintInk[iconTint] : c.teal;
  const bg = tint ? c.chip : iconTint ? c.tint[iconTint] : c.tint.mint;
  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <HeadTile icon={icon} color={ink} bg={bg} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: sentence ? 26 : 44 }}>
            {title ? (
              <Txt size={17} lineHeight={22} weight={600} style={{ color: c.ink, flex: 1, minWidth: 0 }}>
                {title}
              </Txt>
            ) : (
              <SkeletonText size={17} lineHeight={22} width={150} style={{ flex: 1 }} />
            )}
            {right}
          </View>
          {sentence && <SkeletonText size={14} lineHeight={19} width="70%" />}
        </View>
      </View>
      {children}
    </>
  );
  return (
    <CalmSurface tint={tint} watermark={tint ? icon : undefined} padding={20} gap={18}>
      {tint ? body : <OnCard>{body}</OnCard>}
    </CalmSurface>
  );
}

/** A dashboard tile's box: its real icon tile and name, bars for the value and the comparison. */
function DashTileSkeleton({ k, wide }: { k: DashboardKey; wide: boolean }) {
  const c = useCalm();
  const family = accentFamily(k);
  const tint = family ? FAMILY_TINT[family] : null;
  const Icon = STAT_ICON[k] ?? Activity;
  const label = (
    <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, flexShrink: 1 }}>
      {DASHBOARD_LABEL[k]}
    </Txt>
  );
  return (
    <Card padding={16} style={{ flex: 1 }}>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", gap: wide ? 12 : 10 }}>
          <HeadTile icon={Icon} color={tint ? c.tintInk[tint] : c.sub} bg={tint ? c.tint[tint] : c.ground} size={36} />
          {wide ? label : <TileLabel>{label}</TileLabel>}
        </View>
        <View style={{ gap: 6 }}>
          <SkeletonText size={28} lineHeight={32} width={72} />
          <Skeleton radius={12} style={{ width: 84, height: 24 }} />
          <SkeletonText size={12} lineHeight={16} width={96} />
        </View>
      </View>
    </Card>
  );
}

/**
 * `progress`: the first import's step ("Scoring your days · 12/180"), shown where the reason line goes. `go` keeps the
 * links that need no data live while the day loads (See data), as the web's skeleton does.
 */
export function HomeSkeleton({ progress, go }: { progress?: string | null; go: (href: string) => void }) {
  const c = useCalm();
  return (
    <View style={{ gap: CARD_GAP }}>
      {/* The hero: the three score cards (each its own pastel), beside the band tile. */}
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          {(
            [
              ["RECOVERY", "mint"],
              ["SLEEP", "lavender"],
              ["STRAIN", "peach"],
            ] as const
          ).map(([label, tint]) => (
            <View key={label} style={{ borderRadius: 22, backgroundColor: c.tint[tint], padding: 12, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.card }} />
                <Txt size={11} lineHeight={14} weight={600} style={{ color: c.sub, letterSpacing: 1.4 }}>
                  {label}
                </Txt>
              </View>
              <SkeletonText size={30} lineHeight={34} width={64} />
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.card }} />
            </View>
          ))}
        </View>
        <Skeleton radius={28} style={{ width: 160, height: 250 }} />
      </View>
      {progress && (
        <View accessibilityLiveRegion="polite">
          <Txt size={13} lineHeight={18} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
            {progress}
          </Txt>
        </View>
      )}
      {/* The hero's "See data" link to Trends, live. */}
      <Pressable onPress={() => go("/trends")} accessibilityRole="link" hitSlop={8} style={({ pressed }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}>
        <Txt size={16} lineHeight={20} weight={600} style={{ color: c.teal }}>
          See data
        </Txt>
        <ChevronRight size={18} color={c.teal} strokeWidth={2.25} />
      </Pressable>
      {/* The day's outlook. */}
      <SkelCard tint="sand" icon={Sun} sentence={false}>
        <View>
          <SkeletonText size={14} lineHeight={19} />
          <SkeletonText size={14} lineHeight={19} width="60%" />
        </View>
      </SkelCard>
      {/* The goals at a glance: four rings to a row. */}
      <SkelCard icon={Target} title="Today’s goals">
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: "25%", alignItems: "center", gap: 6 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 5, borderColor: c.chip }} />
              <SkeletonText size={14} lineHeight={17} width={40} />
              <SkeletonText size={11} lineHeight={14} width={36} />
            </View>
          ))}
        </View>
      </SkelCard>
      <SkelCard icon={Activity} iconTint="peach" title="Today’s activities" sentence={false}>
        <TimelineSkeleton />
      </SkelCard>
      {/* The journal: the week's pills, the quick log, the ways in. */}
      <SkelCard icon={NotebookPen} iconTint="lavender" title="My journal">
        <View style={{ flexDirection: "row" }}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 8 }}>
              <SkeletonText size={11} lineHeight={15} width={24} />
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.ground }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 12 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={{ width: "33.33%", alignItems: "center", gap: 6 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.ground }} />
              <SkeletonText size={12} lineHeight={15} width={44} />
            </View>
          ))}
        </View>
      </SkelCard>
    </View>
  );
}

/** My Dashboard's loading state (the Health tab): the bento of tiles with their real names, then Strain & recovery. */
export function DashboardSkeleton({ stats = DASHBOARD_DEFAULT }: { stats?: DashboardKey[] }) {
  return (
    <SectionShell variant="section" title="My Dashboard" aside={<Caption>vs 30-day avg</Caption>} action={<IconSlot />}>
      <View style={{ gap: CARD_GAP }}>
        <View style={{ gap: 12 }}>
          {bentoRows(stats, (k) => DASHBOARD_LABEL[k]).map((row) => (
            <TileRow key={row[0]} gap={12}>
              {row.map((k) => (
                <DashTileSkeleton key={k} k={k} wide={row.length === 1} />
              ))}
            </TileRow>
          ))}
        </View>
        <SkelCard icon={ChartNoAxesCombined} iconTint="peach" title="Strain & recovery" right={<InfoButton info={STRAIN_RECOVERY_INFO} label="Strain & recovery" variant="card" />}>
          <Skeleton radius={14} style={{ height: 232 }} />
        </SkelCard>
      </View>
    </SectionShell>
  );
}
