// Loading states for the detail screens (spec §5.19), ported from the web's src/app/(app)/_lib/skeletons.tsx and drawn
// in the screens' own iOS shapes: the real shell, each card or grouped list in its final box with its static titles
// and row names; only values are bars, so nothing moves when data arrives. Headers never skeleton. Each returns the
// DetailScreen slots the screen spreads in.
import * as React from "react";
import { View } from "react-native";
import { alpha } from "@/lib/utils";
import { ContributorRowSkeleton, DriverListSkeleton, InsightCard, IntradayHrChart, SectionShell, Skeleton, SkeletonText, TrendChartSkeleton, Txt, ZoneBars } from "@/ui";
import { useCalm } from "@/ui/calm";
import { iconRadius } from "@/ui/components/calmKit";
import { SleepHrChartSkeleton } from "@/ui/components/SleepHrChart";
import { TimelineSkeleton } from "@/ui/components/ActivityCard";
import type { DetailScreenProps } from "./DetailScreen";
import { ListGroup, ROW_ICON } from "./ios";
import { ScoreHeroSkeleton } from "./ScoreHero";
import { StagesCardsSkeleton, TimeAsleepSkeleton } from "./SleepNight";

export type Slots = Pick<DetailScreenProps, "hero" | "summary" | "insight" | "primary" | "secondary" | "footer">;

/** A grouped list row with its real name, an icon square's place when the loaded row has one, and a bar for the value. */
function RowSkeleton({ label, icon = false, detail = true }: { label: string; icon?: boolean; detail?: boolean }) {
  const c = useCalm();
  return (
    <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 10 }}>
      {icon && <Skeleton radius={iconRadius(ROW_ICON)} style={{ width: ROW_ICON, height: ROW_ICON }} />}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
          {label}
        </Txt>
        {detail && <SkeletonText role="caption" size={13} lineHeight={18} width={120} />}
      </View>
      <SkeletonText role="value" size={20} lineHeight={24} chars={4} />
    </View>
  );
}

/** A card with a section's title over a box the size of its chart. */
function ChartCard({ title, height, accent }: { title: string; height: number; accent?: "sleep" | "strain" | "recovery" | "heart" }) {
  const c = useCalm();
  return (
    <SectionShell variant="card" title={title} accent={accent}>
      <Skeleton style={{ height, backgroundColor: alpha(c.line, 0.6) }} />
    </SectionShell>
  );
}

export function recoverySkeleton(): Slots {
  return {
    hero: <ScoreHeroSkeleton variant="recovery" />,
    summary: (
      <ListGroup title="What shaped it" footer="Dot: today. Shaded: your normal range.">
        {Array.from({ length: 5 }, (_, i) => (
          <ContributorRowSkeleton key={i} icon={ROW_ICON} />
        ))}
      </ListGroup>
    ),
    primary: <WeekSkeleton />,
    secondary: [
      <SectionShell key="effect" variant="card" title="Effect on Recovery" accent="recovery">
        <DriverListSkeleton variant="recovery" unit="pts" rows={5} inCard />
      </SectionShell>,
      <SectionShell key="trend" variant="card" title="Recovery trend">
        <TrendChartSkeleton chip />
      </SectionShell>,
      <SectionShell key="forecast" variant="card" title="Tomorrow’s forecast" accent="recovery">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Skeleton radius={38} style={{ width: 76, height: 76 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonText role="headline" size={17} lineHeight={22} width={120} />
            <SkeletonText role="caption" width="80%" />
          </View>
        </View>
      </SectionShell>,
    ],
  };
}

/** Recovery's week card: its title, the plot's box and the weekday row. */
function WeekSkeleton() {
  const c = useCalm();
  return (
    <View style={{ borderRadius: 20, backgroundColor: c.card, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 14 }}>
      <Txt size={17} lineHeight={22} weight={600} style={{ color: c.ink }}>
        This week
      </Txt>
      <Skeleton style={{ height: 146, backgroundColor: alpha(c.line, 0.6) }} />
    </View>
  );
}

/** Strain's summary rows by their names (the target, then the day's parts), each with its icon square. */
const STRAIN_ROWS = ["Strain Target", "Heart rate zones 1-3", "Heart rate zones 4-5", "Strength activity time", "Steps"];

export function strainSkeleton(): Slots {
  return {
    hero: <ScoreHeroSkeleton variant="strain" />,
    summary: (
      <ListGroup footer="Each part against your prior 30 days: green better, orange worse.">
        {STRAIN_ROWS.map((l) => (
          <RowSkeleton key={l} label={l} icon />
        ))}
      </ListGroup>
    ),
    insight: <InsightCard.Skeleton action />,
    primary: (
      <SectionShell variant="card" title="Heart rate">
        <IntradayHrChart.Skeleton />
      </SectionShell>
    ),
    secondary: [
      <SectionShell key="zones" variant="card" title="Time in zones" accent="heart" fill>
        <ZoneBars.Skeleton variant="rows" />
        <SkeletonText role="caption" width={224} style={{ marginTop: 12 }} />
      </SectionShell>,
      <SectionShell key="activities" variant="card" title="Workouts" accent="strain">
        <TimelineSkeleton rows={1} />
      </SectionShell>,
      <SectionShell key="trend" variant="card" title="Strain trend" accent="strain">
        <TrendChartSkeleton chip caption />
      </SectionShell>,
      <SectionShell key="calories" variant="card" title="Calories burned" accent="strain">
        <TrendChartSkeleton ranges={["w", "m"]} day legend />
      </SectionShell>,
      <SectionShell key="workouts" variant="card" title="Workout duration" accent="strain">
        <TrendChartSkeleton ranges={["w", "m"]} chip />
      </SectionShell>,
    ],
  };
}

/** Sleep Performance's parts by their names. */
const PERFORMANCE_ROWS = ["Hours vs. needed", "Sleep consistency", "Sleep efficiency", "Restorative sleep", "Sleep stress"];

export function sleepSkeleton(): Slots {
  return {
    hero: <TimeAsleepSkeleton />,
    summary: <StagesCardsSkeleton />,
    primary: (
      <ListGroup title="Sleep performance" inset={16}>
        {PERFORMANCE_ROWS.map((l) => (
          <RowSkeleton key={l} label={l} />
        ))}
      </ListGroup>
    ),
    secondary: [
      <SectionShell key="hr" variant="card" title="Heart rate" accent="heart">
        <SleepHrChartSkeleton />
      </SectionShell>,
      <ListGroup key="planner" title="Tonight’s sleep" inset={16}>
        {["Peak", "Perform", "Get by", "Typical wake"].map((l) => (
          <RowSkeleton key={l} label={l} />
        ))}
      </ListGroup>,
      <ChartCard key="need" title="Hours vs. needed" height={200} accent="sleep" />,
      <ChartCard key="consistency" title="Sleep consistency" height={268} accent="sleep" />,
      <SectionShell key="restorative" variant="card" title="Restorative sleep" accent="sleep">
        <TrendChartSkeleton ranges={["w", "m"]} day legend />
      </SectionShell>,
      <SectionShell key="efficiency" variant="card" title="Sleep efficiency" accent="sleep">
        <TrendChartSkeleton chip />
      </SectionShell>,
      <ListGroup key="details" title="Details" inset={16}>
        {["Time in bed", "Wake events", "Respiratory rate", "Sleep debt"].map((l) => (
          <RowSkeleton key={l} label={l} />
        ))}
      </ListGroup>,
      <SectionShell key="debt" variant="card" title="Sleep debt" accent="sleep">
        <TrendChartSkeleton chip />
      </SectionShell>,
    ],
  };
}

/** The workout's details card: its title and the grid of numbers with their real labels, bars for the numbers. */
function WorkoutDetailsSkeleton() {
  const c = useCalm();
  const rows = [
    ["Activity strain", "Duration"],
    ["Average heart rate", "Max heart rate"],
    ["Calories"],
  ];
  return (
    <View style={{ alignSelf: "stretch", borderRadius: 20, backgroundColor: c.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
      <Txt size={17} lineHeight={22} weight={600} style={{ color: c.ink }}>
        Workout details
      </Txt>
      {rows.map((row, i) => (
        <View key={row[0]} style={[{ flexDirection: "row", gap: 16 }, i > 0 && { borderTopWidth: 0.5, borderTopColor: c.line }]}>
          {row.map((l) => (
            <View key={l} style={{ flex: 1, gap: 4, paddingVertical: 12 }}>
              <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
                {l}
              </Txt>
              <SkeletonText role="valueXl" size={28} lineHeight={32} chars={3} />
            </View>
          ))}
          {row.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

export function activitySkeleton(): Slots {
  return {
    hero: <WorkoutDetailsSkeleton />,
    primary: (
      <View style={{ gap: 14 }}>
        <SectionShell variant="card" title="Heart rate">
          <IntradayHrChart.Skeleton variant="activity" />
        </SectionShell>
        <SectionShell variant="card" title="Time in zones" accent="heart">
          <ZoneBars.Skeleton variant="rows" />
          <SkeletonText role="caption" width={224} style={{ marginTop: 12 }} />
        </SectionShell>
      </View>
    ),
    secondary: [<ChartCard key="hrr" title="Heart rate recovery" height={96} />],
    footer: <InsightCard.Skeleton />,
  };
}
