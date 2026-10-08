// Loading states for the detail screens (spec §5.19), ported from the web's src/app/(app)/_lib/skeletons.tsx: the real
// shell and each section's own box with its static titles and labels; only values are bars, so nothing moves when data
// arrives. Headers never skeleton. Each returns the DetailScreen slots the screen spreads in.
import * as React from "react";
import { View } from "react-native";
import { Flame } from "lucide-react-native";
import { alpha } from "@/lib/utils";
import {
  ContributorRowSkeleton,
  DriverListSkeleton,
  InsightCard,
  IntradayHrChart,
  KeyStatRow,
  KeyStatRowSkeleton,
  ScoreDialSkeleton,
  SectionShell,
  Skeleton,
  SkeletonText,
  SleepStages,
  TileRow,
  TimelineSkeleton,
  TrendChartSkeleton,
  Txt,
  useTheme,
  ZoneBars,
} from "@/ui";
import { useCalm } from "@/ui/calm";
import { Caption } from "./calmKit";
import type { DetailScreenProps } from "./DetailScreen";
import { TONIGHT_INFO } from "./info";
import { Aside, Divided, LegendText, statIcon, SummaryCard } from "./view";

export type Slots = Pick<DetailScreenProps, "hero" | "summary" | "insight" | "primary" | "secondary" | "footer">;

/** The summary rows' keys (for their icon tiles, as the loaded rows draw them) and names. */
const SUMMARY: Record<"strain" | "sleep", [key: string, label: string][]> = {
  strain: [
    ["target", "Strain Target"],
    ["zones13", "Heart rate zones 1-3"],
    ["zones45", "Heart rate zones 4-5"],
    ["strength", "Strength activity time"],
    ["steps", "Steps"],
  ],
  sleep: [
    ["hours", "Hours vs. needed"],
    ["consistency", "Sleep consistency"],
    ["efficiency", "Sleep efficiency"],
    ["restorative", "Restorative sleep"],
  ],
};

/** Rows with no icon (`labels`), or with their icon tiles (`[key, label]`), so the names sit where the loaded rows' do. */
function StatRows({ rows }: { rows: (string | [key: string, label: string])[] }) {
  const { c } = useTheme();
  return (
    <Divided>
      {rows.map((r) => {
        const [key, label] = typeof r === "string" ? [null, r] : r;
        const icon = key === "target" ? <Flame size={20} color={c.mutedForeground} strokeWidth={1.75} /> : key ? statIcon(key, c.mutedForeground) : undefined;
        return <KeyStatRowSkeleton key={label} variant="row" label={label} icon={icon} />;
      })}
    </Divided>
  );
}
const statRows = (rows: (string | [key: string, label: string])[]) => <StatRows rows={rows} />;

/** Recovery, Strain and Sleep: the dial with the notched summary card, then the insight. */
function dialDetail(dial: "recovery" | "strain" | "sleep", summary: React.ReactNode, legend: React.ReactNode, action: boolean): Slots {
  return {
    hero: <ScoreDialSkeleton size="lg" variant={dial} />,
    summary: <SummaryCard legend={legend}>{summary}</SummaryCard>,
    insight: <InsightCard.Skeleton action={action} />,
  };
}

export function recoverySkeleton(): Slots {
  return {
    ...dialDetail(
      "recovery",
      Array.from({ length: 5 }, (_, i) => <ContributorRowSkeleton key={i} icon={44} />),
      <LegendText>Dot: today. Shaded: your normal range.</LegendText>,
      true,
    ),
    primary: (
      <SectionShell variant="card" title="Recovery trend">
        <TrendChartSkeleton chip />
      </SectionShell>
    ),
    secondary: [
      <SectionShell key="drivers" variant="card" title="What shaped it">
        <DriverListSkeleton variant="recovery" unit="pts" rows={5} inCard />
      </SectionShell>,
      <SectionShell key="forecast" variant="card" title="Tomorrow’s forecast" fill>
        <View style={{ gap: 12 }}>
          <View>
            <SkeletonText role="valueXl" size={34} lineHeight={38} chars={3} />
            <Caption style={{ marginTop: 4 }}>Tomorrow</Caption>
          </View>
          <Skeleton radius={4} style={{ height: 8 }} />
          <SkeletonText role="caption" width="80%" />
        </View>
      </SectionShell>,
    ],
  };
}

export function strainSkeleton(): Slots {
  return {
    ...dialDetail("strain", statRows(SUMMARY.strain), <LegendText>Today vs. prior 30 days</LegendText>, true),
    primary: (
      <SectionShell variant="card" title="Heart rate">
        <IntradayHrChart.Skeleton />
      </SectionShell>
    ),
    secondary: [
      <SectionShell key="zones" variant="card" title="Time in zones" fill>
        <ZoneBars.Skeleton variant="rows" />
        <SkeletonText role="caption" width={224} style={{ marginTop: 12 }} />
      </SectionShell>,
      <SectionShell key="activities" variant="card" title="Activities">
        <TimelineSkeleton rows={1} />
      </SectionShell>,
      <SectionShell key="trend" variant="card" title="Strain trend">
        <TrendChartSkeleton chip caption />
      </SectionShell>,
      <SectionShell key="calories" variant="card" title="Calories burned">
        <TrendChartSkeleton ranges={["w", "m"]} day legend />
      </SectionShell>,
      <SectionShell key="workouts" variant="card" title="Workout duration">
        <TrendChartSkeleton ranges={["w", "m"]} chip />
      </SectionShell>,
    ],
  };
}

/** A measure card's shape (hours vs. needed): the percentage, a bar, then its legend rows. */
function MeasureSkeleton({ rows }: { rows: string[] }) {
  const c = useCalm();
  return (
    <View>
      <SkeletonText role="valueXl" size={36} lineHeight={40} width={96} />
      <Skeleton radius={7} style={{ marginTop: 16, height: 14 }} />
      <View style={{ marginTop: 16 }}>
        <Divided>
          {rows.map((l) => (
            <View key={l} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: c.line }} />
              <Txt size={14} lineHeight={19} style={{ flex: 1, color: c.sub }}>
                {l}
              </Txt>
              <SkeletonText role="numericCaption" chars={5} />
            </View>
          ))}
        </Divided>
      </View>
    </View>
  );
}

function PlannerSkeleton() {
  return (
    <View style={{ gap: 8 }}>
      <Divided>
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <SkeletonText role="label" width={80} />
              <SkeletonText role="caption" width={96} style={{ marginTop: 2 }} />
            </View>
            <SkeletonText role="value" chars={5} />
          </View>
        ))}
      </Divided>
      <SkeletonText role="caption" width={112} />
    </View>
  );
}

export function sleepSkeleton(): Slots {
  return {
    ...dialDetail("sleep", statRows(SUMMARY.sleep), <SkeletonText role="caption" lineHeight={20} width={192} />, false),
    primary: (
      <SectionShell variant="card" title="Last night’s sleep" aside={<Aside>vs. prior 30 days</Aside>}>
        <SleepStages.Skeleton />
      </SectionShell>
    ),
    secondary: [
      <SectionShell key="need" variant="card" title="Hours vs. needed">
        <MeasureSkeleton rows={["Healthy minimum", "Recent strain", "Sleep debt"]} />
      </SectionShell>,
      <SectionShell key="consistency" variant="card" title="Sleep consistency">
        <View style={{ gap: 16 }}>
          <SkeletonText role="valueXl" size={36} lineHeight={40} width={96} />
          <Skeleton style={{ height: 208 }} />
        </View>
      </SectionShell>,
      <SectionShell key="restorative" variant="card" title="Restorative sleep">
        <TrendChartSkeleton ranges={["w", "m"]} day legend />
      </SectionShell>,
      <SectionShell key="efficiency" variant="card" title="Sleep efficiency">
        <TrendChartSkeleton chip />
      </SectionShell>,
      <SectionShell key="details" variant="card" title="Details">
        {statRows(["Time in bed", "Wake events", "Respiratory rate", "Sleep debt"])}
      </SectionShell>,
      <SectionShell key="debt" variant="card" title="Sleep debt">
        <TrendChartSkeleton chip />
      </SectionShell>,
      <SectionShell key="planner" variant="card" title="Tonight’s sleep" info={TONIGHT_INFO}>
        <PlannerSkeleton />
      </SectionShell>,
    ],
  };
}

/** The activity hero's pastel card with bars for the numbers. */
function ActivityHeroSkeleton() {
  const c = useCalm();
  return (
    <View style={{ alignSelf: "stretch", gap: 14, borderRadius: 32, borderWidth: 1, borderColor: c.tintEdge.peach, backgroundColor: c.tint.peach, padding: 20 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", columnGap: 32, rowGap: 12 }}>
        {(
          [
            ["Activity strain", 52],
            ["Duration", 34],
          ] as const
        ).map(([l, size]) => (
          <View key={l}>
            <SkeletonText role="valueXl" size={size} lineHeight={Math.round(size * 1.12)} chars={3} />
            <Caption style={{ marginTop: 4 }}>{l}</Caption>
          </View>
        ))}
      </View>
      <SkeletonText role="caption" width={96} />
    </View>
  );
}

function ActivityTilesSkeleton() {
  const { c } = useTheme();
  const tile = (k: string, l: string, wide = false) => <KeyStatRow key={k} variant="tile" wide={wide} label={l} icon={statIcon(k, c.mutedForeground, 1.5)} metric={undefined} format="int" direction="none" />;
  // Two a row, the odd last tile spanning the row on a phone, as the loaded grid draws it.
  return (
    <View style={{ gap: 12 }}>
      <TileRow gap={12}>
        {tile("avgHr", "Average heart rate")}
        {tile("maxHr", "Max heart rate")}
      </TileRow>
      <TileRow gap={12}>{tile("calories", "Calories", true)}</TileRow>
    </View>
  );
}

export function activitySkeleton(): Slots {
  return {
    hero: <ActivityHeroSkeleton />,
    primary: (
      <View style={{ gap: 14 }}>
        <SectionShell variant="card" title="Heart rate">
          <IntradayHrChart.Skeleton variant="activity" />
        </SectionShell>
        <SectionShell variant="card" title="Time in zones">
          <ZoneBars.Skeleton variant="rows" />
          <SkeletonText role="caption" width={224} style={{ marginTop: 12 }} />
        </SectionShell>
      </View>
    ),
    secondary: [
      <SectionShell key="stats" variant="section" title="Key statistics" aside={<Aside>vs. 30-day average</Aside>}>
        <ActivityTilesSkeleton />
      </SectionShell>,
      <SectionShell key="hrr" variant="card" title="Heart rate recovery">
        <HrrSkeleton />
      </SectionShell>,
    ],
    footer: <InsightCard.Skeleton />,
  };
}

function HrrSkeleton() {
  const c = useCalm();
  return <Skeleton style={{ height: 96, backgroundColor: alpha(c.line, 0.6) }} />;
}
