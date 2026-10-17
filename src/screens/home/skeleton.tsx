// Today's loading state (spec §5.19), in the layout it stands in for: the rings hero (bare ring tracks beside the three
// names), "Pinned" with the Heart Rate card and Health cards, then the goals' rings, the day's activities and the
// journal, each with its real card, glyph, title and labels; only values are soft bars, so nothing moves when data
// arrives. The links that need no data stay live ("See data"). My Dashboard's own (the Health tab) is
// DashboardSkeleton. The large title and the bar are the screen's, there from the first frame.
import * as React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Activity, ChartNoAxesCombined, Heart, NotebookPen, Target, type LucideIcon } from "lucide-react-native";
import { DASHBOARD_DEFAULT, DASHBOARD_LABEL, type DashboardKey } from "@/queries";
import { accentFamily, InfoButton, SectionShell, Skeleton, SkeletonText, TimelineSkeleton, Txt } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { Caption, FAMILY_TINT } from "@/ui/components/calmKit";
import { CalmSurface, PillAction } from "@/ui/components/CalmSurface";
import { RowRule, useTitleInk } from "./controls";
import { STRAIN_RECOVERY_INFO } from "./info";
import { MINI_H, MINI_W } from "./miniCharts";
import { CARD_GAP, SectionTitle } from "./sections";
import { STAT_ICON } from "./view";

/** A card's head: the glyph and the title in the family's colour (or a bar for the title), then its body. */
function SkelCard({ icon: Icon, tint, title, sentence = false, right, children }: { icon: LucideIcon; tint: CalmTint; title?: string; sentence?: boolean; right?: React.ReactNode; children?: React.ReactNode }) {
  const ink = useTitleInk(tint);
  return (
    <CalmSurface padding={16} gap={14}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, minHeight: 22 }}>
          <Icon size={18} color={ink} strokeWidth={2.2} />
          {title ? (
            <Txt size={16} lineHeight={21} weight={600} style={{ color: ink, flex: 1, minWidth: 0 }}>
              {title}
            </Txt>
          ) : (
            <SkeletonText size={16} lineHeight={21} width={140} style={{ flex: 1 }} />
          )}
          {right}
        </View>
        {sentence && <SkeletonText size={15} lineHeight={20} width="60%" />}
      </View>
      {children}
    </CalmSurface>
  );
}

/** A Health card's loading shape: its real glyph and name when known, bars for the value and context, the chart's box. */
function HealthSkeleton({ icon: Icon, tint, title, filled }: { icon: LucideIcon; tint: CalmTint | null; title?: string; filled?: boolean }) {
  const c = useCalm();
  const titleInk = useTitleInk(tint ?? "sky");
  const ink = tint ? titleInk : c.sub;
  return (
    <CalmSurface padding={16}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, minHeight: 22 }}>
        <Icon size={18} color={ink} fill={filled ? ink : "none"} strokeWidth={2.2} />
        {title ? (
          <Txt size={16} lineHeight={21} weight={600} style={{ color: ink, flex: 1, minWidth: 0 }}>
            {title}
          </Txt>
        ) : (
          <SkeletonText size={16} lineHeight={21} width={120} style={{ flex: 1 }} />
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <SkeletonText size={30} lineHeight={36} width={84} />
          <SkeletonText size={14} lineHeight={19} width={132} />
        </View>
        <Skeleton radius={10} style={{ width: MINI_W, height: MINI_H, marginBottom: 3 }} />
      </View>
    </CalmSurface>
  );
}

/** The hero's three bare ring tracks, the size the rings will draw at. */
function RingTracks({ size }: { size: number }) {
  const c = useCalm();
  const sw = Math.round(size * 0.115 * 2) / 2;
  const g = Math.max(1.5, Math.round(size * 0.012 * 2) / 2);
  const tints: CalmTint[] = ["mint", "lavender", "peach"];
  return (
    <Svg width={size} height={size}>
      {tints.map((t, i) => (
        <Circle key={t} cx={size / 2} cy={size / 2} r={size / 2 - sw / 2 - i * (sw + g)} stroke={c.tint[t]} strokeWidth={sw} fill="none" />
      ))}
    </Svg>
  );
}

/**
 * `progress`: the first import's step ("Scoring your days · 12/180"), shown under the hero. `go` keeps the links that
 * need no data live while the day loads (See data), as the web's skeleton does.
 */
export function HomeSkeleton({ progress, go }: { progress?: string | null; go: (href: string) => void }) {
  const c = useCalm();
  return (
    <View style={{ gap: CARD_GAP }}>
      {/* The hero: the rings' tracks beside the three names. */}
      <CalmSurface padding={16} gap={14}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          <RingTracks size={140} />
          <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
            {["Recovery", "Sleep", "Strain"].map((label) => (
              <View key={label}>
                <Txt size={15} lineHeight={19} weight={600} style={{ color: c.ink }}>
                  {label}
                </Txt>
                <SkeletonText size={28} lineHeight={32} width={72} />
              </View>
            ))}
          </View>
        </View>
        {progress && (
          <View accessibilityLiveRegion="polite">
            <Txt size={14} lineHeight={19} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
              {progress}
            </Txt>
          </View>
        )}
        <View style={{ marginHorizontal: -16, marginBottom: -6 }}>
          <RowRule inset={16} />
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <PillAction label="See data" accessibilityLabel="See data: every metric in Trends" onPress={() => go("/trends")} />
          </View>
        </View>
      </CalmSurface>
      <SectionTitle title="Pinned" />
      <HealthSkeleton icon={Heart} tint="rose" title="Heart Rate" filled />
      {DASHBOARD_DEFAULT.slice(0, 3).map((k) => {
        const family = accentFamily(k);
        return <HealthSkeleton key={k} icon={STAT_ICON[k] ?? Activity} tint={family ? FAMILY_TINT[family] : null} title={DASHBOARD_LABEL[k]} />;
      })}
      <SectionTitle title="Your day" />
      {/* The goals at a glance: four rings to a row. */}
      <SkelCard icon={Target} tint="mint" title="Today’s goals" sentence>
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: "25%", alignItems: "center", gap: 6 }}>
              <View style={{ width: 58, height: 58, borderRadius: 29, borderWidth: 7, borderColor: c.fill }} />
              <SkeletonText size={15} lineHeight={19} width={40} />
              <SkeletonText size={12} lineHeight={15} width={36} />
            </View>
          ))}
        </View>
      </SkelCard>
      <SkelCard icon={Activity} tint="peach" title="Today’s activities">
        <TimelineSkeleton />
      </SkelCard>
      {/* The journal: the week's circles, the check-in. */}
      <SkelCard icon={NotebookPen} tint="lavender" title="My journal" sentence>
        <View style={{ flexDirection: "row" }}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <SkeletonText size={12} lineHeight={15} width={10} />
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.fill }} />
            </View>
          ))}
        </View>
        <Skeleton radius={24} style={{ height: 48 }} />
      </SkelCard>
    </View>
  );
}

/** My Dashboard's loading state (the Health tab): a Health card per metric with its real name, then Strain & recovery. */
export function DashboardSkeleton({ stats = DASHBOARD_DEFAULT }: { stats?: DashboardKey[] }) {
  const c = useCalm();
  return (
    <SectionShell
      variant="section"
      title="My Dashboard"
      aside={<Caption>vs 30-day avg</Caption>}
      action={
        <Txt size={17} lineHeight={22} style={{ color: c.tertiary }}>
          Edit
        </Txt>
      }
    >
      <View style={{ gap: CARD_GAP }}>
        {stats.map((k) => {
          const family = accentFamily(k);
          return <HealthSkeleton key={k} icon={STAT_ICON[k] ?? Activity} tint={family ? FAMILY_TINT[family] : null} title={DASHBOARD_LABEL[k]} />;
        })}
        <SkelCard icon={ChartNoAxesCombined} tint="peach" title="Strain & recovery" sentence right={<InfoButton info={STRAIN_RECOVERY_INFO} label="Strain & recovery" variant="card" />}>
          <Skeleton radius={14} style={{ height: 232 }} />
        </SkelCard>
      </View>
    </SectionShell>
  );
}
