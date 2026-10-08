import * as React from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Activity, Heart, Hourglass, Moon, Rabbit, Thermometer, Turtle, Wind, Zap } from "lucide-react-native";
import type { Metric } from "@/lib/reasons";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { ActivityCard } from "./components/ActivityCard";
import { Alert } from "./components/Alert";
import { BottomSheet, SheetSection } from "./components/BottomSheet";
import { Button } from "./components/Button";
import { Card, LegendStrip } from "./components/Card";
import { ContributorRow } from "./components/ContributorRow";
import { DateSwitcher } from "./components/DateSwitcher";
import { DetailHeader } from "./components/DetailHeader";
import { DriverList } from "./components/DriverList";
import { EnergyBankChart } from "./components/EnergyBankChart";
import { HomeHeader } from "./components/HomeHeader";
import { HomeInsight } from "./components/HomeInsight";
import { Hypnogram } from "./components/Hypnogram";
import { InfoRows, type InfoContent } from "./components/InfoButton";
import { InsightCard } from "./components/InsightCard";
import { IntradayHrChart, type HrSeries } from "./components/IntradayHrChart";
import { KeyStatRow } from "./components/KeyStatRow";
import { TileRow } from "./components/TileRow";
import { Mark } from "./components/Mark";
import { MetricState } from "./components/MetricState";
import { MiniRing } from "./components/MiniRing";
import { Ground } from "./components/PageShell";
import { DeltaMark, MetricTags, StatusChip, Tag, ValueUnit } from "./components/primitives";
import { ReasonPlaceholder } from "./components/ReasonPlaceholder";
import { ScoreDial } from "./components/ScoreDial";
import { SectionShell } from "./components/SectionShell";
import { Skeleton, SkeletonText } from "./components/Skeleton";
import { SleepCard } from "./components/SleepCard";
import { SleepHrChart, type SleepHr } from "./components/SleepHrChart";
import { SleepStages, type SleepStagesNight } from "./components/SleepStages";
import { Sparkline } from "./components/Sparkline";
import { StrainRecoveryChart } from "./components/StrainRecoveryChart";
import { SyncStatus } from "./components/SyncStatus";
import { TabBar } from "./components/TabBar";
import { Txt } from "./components/Text";
import { TickScale } from "./components/TickScale";
import { ToggleGroup } from "./components/ToggleGroup";
import { TonightPlan } from "./components/TonightPlan";
import { TrendChart, type TrendPoint } from "./components/TrendChart";
import { Wordmark } from "./components/Wordmark";
import { ZoneBars } from "./components/ZoneBars";
import { HaloLine, HaloRing, RollingNumber } from "./components/Halo";
import { CalmSurface } from "./components/CalmSurface";
import { useCalm } from "./calm";
import { font, useAppFonts } from "./fonts";
import { GrowIn } from "./motion/Rise";

// --- Sample data (deterministic, so the preview looks the same on every run) ---

const TODAY = "2026-10-07";
const TZ = "Europe/London";
const DAY_MS = 86_400_000;
const dayAt = (hour: number, minute = 0) => Date.UTC(2026, 9, 7, hour - 1, minute); // London is UTC+1 in October
let seed = 7;
const rnd = () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const m = <T,>(value: T, extra?: Partial<Metric<T>>): Metric<T> => ({ value, reason: null, provisional: false, ...extra });
const reason = <T,>(code: Metric<T>["reason"], nightsLeft?: number): Metric<T> => ({ value: null, reason: code, provisional: false, nightsLeft });

const isoDay = (offset: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - offset * DAY_MS).toISOString().slice(0, 10);
const trend = (n: number, base: number, swing: number, f: (v: number) => number = (v) => v): TrendPoint[] =>
  Array.from({ length: n }, (_, i) => {
    const d = isoDay(n - 1 - i);
    const v = base + Math.sin(i / 3) * swing * 0.6 + (rnd() - 0.5) * swing;
    return { date: d, value: i % 11 === 5 ? null : f(v), provisional: i === n - 1 };
  });
const RECOVERY_TREND = trend(365, 57, 40, (v) => Math.round(Math.min(100, Math.max(5, v))));
const HRV_TREND = trend(365, 54, 16, (v) => Math.round(v));
const CALORIES: TrendPoint[] = trend(365, 2400, 500, (v) => Math.round(v)).map((p, i) => ({ ...p, parts: p.value === null ? null : i % 9 === 2 ? null : { resting: Math.round(p.value * 0.72), active: Math.round(p.value * 0.28) } }));
const STRAIN_WEEK = Array.from({ length: 7 }, (_, i) => ({ day: isoDay(6 - i), strain: i === 2 ? null : Math.round((6 + Math.abs(Math.sin(i)) * 10) * 10) / 10, recovery: i === 4 ? null : Math.round(25 + Math.abs(Math.cos(i)) * 70) }));

const WAKE = dayAt(7, 10);
const BED = dayAt(0, 40) - DAY_MS;
const HR_DAY: HrSeries = {
  points: Array.from({ length: 24 * 60 }, (_, i) => {
    const t = dayAt(0) + i * 60_000;
    const h = i / 60;
    const run = h >= 17.5 && h <= 18.4;
    const asleep = h < 7.2;
    const bpm = asleep ? 52 + Math.sin(i / 25) * 6 : run ? 120 + Math.sin((h - 17.5) * 9) * 35 + 15 : 68 + Math.sin(i / 40) * 10 + (rnd() - 0.5) * 8;
    return { t, bpm: i > 20 * 60 ? null : Math.round(bpm) };
  }),
  zones: [
    { zone: 1, label: "Zone 1", min: 100, max: 118 },
    { zone: 2, label: "Zone 2", min: 119, max: 136 },
    { zone: 3, label: "Zone 3", min: 137, max: 154 },
    { zone: 4, label: "Zone 4", min: 155, max: 172 },
    { zone: 5, label: "Zone 5", min: 173, max: 190 },
  ],
  spans: [
    { kind: "sleep", start: dayAt(0), end: WAKE, label: "Sleep" },
    { kind: "workout", start: dayAt(17, 30), end: dayAt(18, 24), label: "Run" },
  ],
  now: dayAt(20),
};
const SLEEP_HR: SleepHr = {
  bed: BED,
  wake: WAKE,
  points: Array.from({ length: Math.round((WAKE - BED) / 60_000) + 40 }, (_, i) => {
    const t = BED - 20 * 60_000 + i * 60_000;
    return { t, v: Math.round(50 + Math.sin(i / 30) * 7 + Math.cos(i / 7) * 2 + (t < BED || t > WAKE ? 14 : 0)) };
  }),
};
const SEGMENTS: SleepStagesNight["segments"] = (() => {
  const out: SleepStagesNight["segments"] = [];
  const cycle = ["awake", "light", "deep", "light", "rem"] as const;
  let t = BED;
  let k = 0;
  while (t < WAKE) {
    const stage = cycle[k % cycle.length];
    const len = (stage === "awake" ? 6 : stage === "deep" ? 35 : stage === "rem" ? 28 : 45) * 60_000;
    const end = Math.min(WAKE, t + len);
    out.push({ stage, start: t, end });
    t = end;
    k++;
  }
  return out;
})();
const NIGHT: SleepStagesNight = {
  bed: BED,
  wake: WAKE,
  segments: SEGMENTS,
  rows: [
    { stage: "awake", label: "Awake", pct: 7, minutes: 27, typical: [5, 12] },
    { stage: "light", label: "Light", pct: 52, minutes: 203, typical: [45, 60] },
    { stage: "deep", label: "SWS (Deep)", pct: 19, minutes: 74, typical: [15, 25] },
    { stage: "rem", label: "REM", pct: 22, minutes: 86, typical: [20, 25] },
  ],
};
const ENERGY = {
  points: Array.from({ length: 13 * 4 }, (_, i) => ({ t: WAKE + i * 15 * 60_000, value: Math.round(Math.max(8, 88 - i * 1.1 - (i > 40 ? (i - 40) * 1.8 : 0) + (i > 20 && i < 28 ? 6 : 0))) })),
  drains: [
    { t: WAKE + 41 * 15 * 60_000, amount: 18, label: "Run" },
    { t: WAKE + 12 * 15 * 60_000, amount: 6, label: "Commute" },
  ],
  naps: [{ start: WAKE + 21 * 15 * 60_000, end: WAKE + 27 * 15 * 60_000 }],
};
const SYNC = { mode: "demo" as const, sync: { state: "ok" as const, lastSuccessAt: dayAt(19, 48) }, connection: "connected" as const, timeZone: TZ };
const NOW = dayAt(20);
const RECOVERY_INFO: InfoContent = {
  title: "How Recovery works",
  body: (
    <>
      <Txt role="body">Recovery shows how ready your body is to take on strain, from 0 to 100%. Halo scores it each morning from last night’s heart rate variability, resting heart rate, respiratory rate, sleep performance and skin temperature, each compared with your own baseline.</Txt>
      <InfoRows rows={[["#3ddc84", "Green, 67-100%: your body is primed for strain."], ["#f5c842", "Yellow, 34-66%: you are maintaining; moderate strain fits."], ["#f2445a", "Red, 0-33%: your body needs rest."]]} />
    </>
  ),
};

// --- Preview chrome ---

function H({ children }: { children: string }) {
  return (
    <Txt role="sectionTitle" style={{ marginTop: 32, marginBottom: 12 }}>
      {children}
    </Txt>
  );
}
function Sub({ children }: { children: string }) {
  return (
    <Txt role="caption" style={{ marginTop: 12, marginBottom: 8 }}>
      {children}
    </Txt>
  );
}
function Row({ children, gap = 12 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap }}>{children}</View>;
}

function Preview() {
  const { c, scheme, setChoice } = useTheme();
  const calm = useCalm();
  const [date, setDate] = React.useState(TODAY);
  const [tab, setTab] = React.useState(0);
  const [sheet, setSheet] = React.useState(false);
  const [range, setRange] = React.useState<"w" | "m" | "6m" | "1y">("m");
  const [rings, setRings] = React.useState(false);
  const icon = (I: typeof Heart) => <I size={20} color={c.mutedForeground} strokeWidth={1.75} />;
  const noop = () => {};
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Ground />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Headers (full-bleed) */}
        <HomeHeader
          dateSwitcher={{ mode: "day", date, today: TODAY, firstDay: "2026-04-01", onChange: setDate, onOpenCalendar: noop }}
          sync={{ status: SYNC, now: NOW, onPress: noop }}
          streak={{ days: 23 }}
          rings={{ sleep: { value: 81, onPress: noop }, recovery: { value: 39, onPress: noop }, strain: { value: 11.2, onPress: noop } }}
          showRings={rings}
        />
        <View style={{ paddingHorizontal: 16 }}>
          <Row>
            <Button size="sm" variant="secondary" onPress={() => setChoice(scheme === "dark" ? "light" : "dark")}>
              {scheme === "dark" ? "Light theme" : "Dark theme"}
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setRings((v) => !v)}>
              {rings ? "Hide ring row" : "Show ring row"}
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setSheet(true)}>
              Open sheet
            </Button>
          </Row>
          <H>Brand</H>
          <Row gap={20}>
            <Wordmark height={16} color={c.foregroundSecondary} />
            <Wordmark height={32} weight="black" />
            <Mark size={28} />
            <Mark size={28} color="mono" />
          </Row>

          <H>Motion</H>
          <Sub>A ring drawing on in a family ink, a full ring’s pulse, a rolling number, the halo line, a breathing hero card</Sub>
          <Row gap={16}>
            <HaloRing size={56} stroke={5} progress={0.4} track={calm.tint.sky} color={calm.tintInk.sky} />
            <HaloRing size={56} stroke={5} progress={1} track={calm.tint.mint} color={calm.tintInk.mint} celebrateKey="kit:ring" />
            <HaloRing size={56} stroke={5} progress={null} track={calm.line} />
            <RollingNumber text="72" lineHeight={60} style={[font.numberAt(56), { color: calm.tintInk.mint, letterSpacing: -1 }]} />
          </Row>
          <HaloLine width={120} style={{ marginTop: 12 }} />
          <CalmSurface tint="lavender" breathe style={{ marginTop: 12 }}>
            <Txt size={11} lineHeight={16} weight={600} style={{ color: calm.label, letterSpacing: 1.4 }}>
              YOUR WEEK
            </Txt>
            <GrowIn>
              <Row gap={6}>
                {[40, 64, 52, 80, 30].map((h, i) => (
                  <View key={i} style={{ width: 18, height: h, borderRadius: 9, backgroundColor: calm.tintInk.lavender, opacity: i === 3 ? 1 : 0.55 }} />
                ))}
              </Row>
            </GrowIn>
          </CalmSurface>

          <H>Type roles</H>
          <Txt role="label">Label 12/16 bold caps</Txt>
          <Txt role="caption">Caption 12/16 medium muted</Txt>
          <Txt role="body">Body 15/22: You are past today’s target. Prioritise sleep tonight to recover.</Txt>
          <Txt role="sectionTitle">Section title 22/28</Txt>
          <Row gap={16}>
            <Txt role="value">124</Txt>
            <Txt role="valueLg">57</Txt>
            <Txt role="valueXl">16.4</Txt>
            <Txt role="valueHero">7:42</Txt>
            <ValueUnit value="124" unit="ms" role="value" />
            <ValueUnit value="72" unit="%" role="valueXl" />
          </Row>

          <H>Primitives</H>
          <Row>
            <Tag kind="provisional" />
            <Tag kind="so_far" />
            <Tag kind="stale_baseline" />
            <MetricTags provisional tags={["updated"]} extra={["estimate"]} />
          </Row>
          <Row>
            <StatusChip tone="optimal">Within 16.1 - 16.9</StatusChip>
            <StatusChip tone="warning">Above your range</StatusChip>
            <StatusChip tone="alert">Well above</StatusChip>
            <StatusChip tone="neutral" delta="up">
              98 ms
            </StatusChip>
            <StatusChip tone="neutral" delta="down" compact>
              9,505
            </StatusChip>
          </Row>
          <Row gap={16}>
            <DeltaMark dir="up" tone="good" />
            <DeltaMark dir="down" tone="bad" />
            <DeltaMark dir="up" tone="neutral" />
            <DeltaMark dir="flat" tone="neutral" />
          </Row>
          <Row>
            <Button onPress={noop}>Primary</Button>
            <Button variant="secondary" onPress={noop}>
              Secondary
            </Button>
            <Button variant="outline-pill" onPress={noop}>
              Outline pill
            </Button>
            <Button variant="ghost" onPress={noop}>
              Ghost
            </Button>
          </Row>
          <Sub>Skeleton bars</Sub>
          <Row>
            <Skeleton style={{ width: 120, height: 24 }} />
            <SkeletonText role="value" chars={4} />
            <SkeletonText role="label" width={128} />
          </Row>

          <H>ScoreDial</H>
          <Sub>md (Home row): sleep, recovery, strain with tags and links</Sub>
          <Row gap={0}>
            <ScoreDial variant="sleep" size="md" value={81} onPress={noop} />
            <ScoreDial variant="recovery" size="md" value={39} onPress={noop} provisional />
            <ScoreDial variant="strain" size="md" value={11.2} onPress={noop} extraTags={["so_far"]} />
          </Row>
          <Sub>md: reason, loading; sm; compact; stat; gauge</Sub>
          <Row gap={0}>
            <ScoreDial variant="recovery" size="md" value={null} reason="calibrating" nightsLeft={4} onPress={noop} />
            <ScoreDial variant="strain" size="md" value={null} loading />
            <ScoreDial variant="recovery" size="sm" value={72} />
            <ScoreDial variant="recovery" size="md" value={72} compact />
            <ScoreDial variant="stat" size="md" value={6.4} label="Halo Age" color="chart-5" max={10} format="decimal1" />
            <ScoreDial variant="gauge" size="md" value={0.6} caption="19:31" />
          </Row>
          <Sub>lg hero: recovery with band word</Sub>
          <View style={{ alignItems: "center" }}>
            <ScoreDial variant="recovery" size="lg" value={39} tags={["updated"]} />
          </View>
          <Sub>lg hero: strain with target band and tick, so far</Sub>
          <View style={{ alignItems: "center" }}>
            <ScoreDial variant="strain" size="lg" value={11.2} target={[5.2, 7.2]} extraTags={["so_far"]} />
          </View>
          <Sub>lg hero: sleep with status segments; gauge lg; reason; loading</Sub>
          <View style={{ alignItems: "center", gap: 24 }}>
            <ScoreDial variant="sleep" size="lg" value={81} status="sufficient" />
            <ScoreDial variant="gauge" size="lg" value={1.4} caption="Last updated 15:05" />
            <ScoreDial variant="recovery" size="lg" value={null} reason="no_hrv_last_night" />
            <ScoreDial variant="recovery" size="lg" value={null} loading />
          </View>
          <Sub>MiniRing</Sub>
          <Row>
            <MiniRing variant="sleep" value={81} />
            <MiniRing variant="recovery" value={39} />
            <MiniRing variant="strain" value={11.2} />
            <MiniRing variant="recovery" value={null} />
          </Row>

          <H>Cards and sections</H>
          <SectionShell variant="card" title="Health monitor" onPress={noop}>
            <Row>
              <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: "rgba(0,241,159,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Txt role="value" color="optimal">
                  ✓
                </Txt>
              </View>
              <View>
                <Txt role="label" color="optimal">
                  Within range
                </Txt>
                <Txt role="caption">5/5 within range</Txt>
              </View>
            </Row>
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Strain & recovery" info={RECOVERY_INFO} aside={<Txt role="caption">Last 7 days</Txt>}>
            <StrainRecoveryChart points={STRAIN_WEEK} today={TODAY} />
          </SectionShell>
          <View style={{ height: 24 }} />
          <SectionShell variant="section" title="My Day" action={{ label: "View all", onPress: noop }}>
            <Card>
              <Txt role="body">A plain card with the card material: 16 px radius, card-top → card gradient, 1 px lit top edge.</Txt>
            </Card>
          </SectionShell>
          <View style={{ height: 12 }} />
          <LegendStrip>
            <Txt role="caption" color="foregroundSecondary">
              Latest reading vs. the 30 days before it
            </Txt>
          </LegendStrip>
          <Alert title="Sync is behind" description="Last sync 3 hours ago. Open the Fitbit app to push new data." icon={Activity} />
          <View style={{ height: 8 }} />
          <Alert variant="destructive" title="Health Connect access was revoked" description="Reconnect in Settings › Data source." />

          <H>KeyStatRow</H>
          <Sub>row variant (Recovery summary card, Sleep summary with status, reason, loading)</Sub>
          <Card padding={0}>
            <View style={{ paddingHorizontal: 16 }}>
              <KeyStatRow variant="row" icon={icon(Activity)} label="Heart rate variability" metric={m(50)} unit="ms" format="int" average={54} sd={8} direction="up" onPress={noop} />
              <View style={{ height: 1, backgroundColor: c.border }} />
              <KeyStatRow variant="row" icon={icon(Heart)} label="Resting heart rate" metric={m(58, { provisional: true })} unit="bpm" format="int" average={56} sd={3} direction="down" />
              <View style={{ height: 1, backgroundColor: c.border }} />
              <KeyStatRow variant="row" icon={icon(Hourglass)} label="Hours vs. needed" metric={m(81)} unit="%" format="int" direction="none" status="sufficient" />
              <View style={{ height: 1, backgroundColor: c.border }} />
              <KeyStatRow variant="row" icon={icon(Wind)} label="Respiratory rate" metric={reason("insufficient_hr_data")} unit="rpm" format="decimal1" direction="neutral" caption="Typical 12-20" />
              <View style={{ height: 1, backgroundColor: c.border }} />
              <KeyStatRow variant="row" icon={icon(Thermometer)} label="Skin temperature" metric={undefined} unit="°C" format="signed1" direction="toward_zero" />
            </View>
          </Card>
          <Sub>card variant (My Dashboard)</Sub>
          <View style={{ gap: 8 }}>
            <KeyStatRow variant="card" icon={icon(Zap)} label="Calories" metric={m(2410)} unit="kcal" format="grouped" average={2290} direction="neutral" onPress={noop} />
            <KeyStatRow variant="card" icon={icon(Moon)} label="Sleep" metric={m(442)} format="duration" average={460} sd={20} direction="up" onPress={noop} />
          </View>
          <Sub>tile variant (Health Monitor grid), wide with sparkline, wide with comparison</Sub>
          {/* Two a row (TileRow): one height per row, the names one height, so the values share a line. */}
          <View style={{ gap: 12 }}>
            <TileRow>
              <KeyStatRow variant="tile" icon={icon(Heart)} label="Resting heart rate" metric={m(58)} unit="bpm" format="int" direction="down" chip={{ tone: "optimal", text: "Within 54 - 60" }} onPress={noop} />
              <KeyStatRow variant="tile" icon={icon(Wind)} label="Respiratory rate" metric={m(16.4)} unit="rpm" format="decimal1" direction="neutral" chip={{ tone: "warning", text: "Above 13.9 - 15.8" }} />
            </TileRow>
            <TileRow>
              <KeyStatRow variant="tile" icon={icon(Activity)} label="HRV" metric={undefined} unit="ms" format="int" direction="up" />
              <KeyStatRow variant="tile" icon={icon(Thermometer)} label="Skin temp" metric={reason("band_not_worn")} unit="°C" format="signed1" direction="toward_zero" />
            </TileRow>
          </View>
          <View style={{ height: 12 }} />
          <KeyStatRow variant="tile" wide icon={icon(Activity)} label="Heart rate variability" metric={m(50)} unit="ms" format="int" average={54} sd={8} direction="up" spark={{ values: [48, 52, null, 61, 55, 49, 58, 50], band: { low: 46, high: 62 }, caption: "Last 7 nights" }} />
          <View style={{ height: 12 }} />
          <KeyStatRow variant="tile" wide icon={icon(Heart)} label="Resting heart rate" metric={m(58)} unit="bpm" format="int" average={56} sd={3} direction="down" />

          <H>ContributorRow</H>
          <Card padding={0}>
            <View style={{ paddingHorizontal: 16 }}>
              <ContributorRow variant="recovery" icon={icon(Activity)} label="Heart rate variability" metric={m(50)} unit="ms" format="int" baseline={{ mean: 54, sd: 8 }} points={-10} direction="up" />
              <View style={{ height: 1, backgroundColor: c.border }} />
              <ContributorRow variant="recovery" icon={icon(Heart)} label="Resting heart rate" metric={m(58, { provisional: true })} unit="bpm" format="int" baseline={{ mean: 56, sd: 3 }} points={-7} direction="down" />
              <View style={{ height: 1, backgroundColor: c.border }} />
              <ContributorRow variant="recovery" icon={icon(Wind)} label="Respiratory rate" metric={reason("no_data")} unit="rpm" format="decimal1" baseline={{ mean: 14.7, sd: 0.6 }} points={null} direction="neutral" />
              <View style={{ height: 1, backgroundColor: c.border }} />
              <ContributorRow variant="recovery" icon={icon(Moon)} label="Sleep performance" metric={undefined} unit="%" format="int" baseline={{ mean: 85, sd: 12 }} points={null} direction="up" />
            </View>
          </Card>
          <Sub>healthspan variant</Sub>
          <Card padding={0}>
            <View style={{ paddingHorizontal: 16 }}>
              <ContributorRow variant="healthspan" label="VO2 max" metric={m(42)} unit="ml/kg/min" format="int" domain={[25, 60]} target={48} years={1.6} higherIsBetter onPress={noop} />
              <View style={{ height: 1, backgroundColor: c.border }} />
              <ContributorRow variant="healthspan" label="Resting heart rate" metric={m(58)} unit="bpm" format="int" domain={[40, 90]} target={55} years={-0.4} higherIsBetter={false} />
            </View>
          </Card>

          <H>DriverList</H>
          <DriverList
            variant="recovery"
            unit="pts"
            data={m(
              [
                { key: "hrv", label: "Heart rate variability", delta: -10 },
                { key: "rhr", label: "Resting heart rate", delta: -7 },
                { key: "sleep", label: "Sleep performance", delta: 4 },
                { key: "resp", label: "Respiratory rate", delta: 0, effect: "none" },
              ],
              { provisional: true }
            )}
          />
          <Sub>impact variant, inside a card, with selection</Sub>
          <Card>
            <DriverList
              variant="impact"
              unit="%"
              inCard
              selectedKey="alcohol"
              onSelect={noop}
              data={m([
                { key: "alcohol", label: "Alcohol", delta: -12, yes: 9, no: 41, ci: [-18, -6] },
                { key: "late", label: "Late caffeine", delta: -5, yes: 14, no: 36, ci: [-9, -1] },
                { key: "reading", label: "Read before bed", delta: 6, yes: 22, no: 28, ci: [2, 10] },
              ])}
            />
          </Card>
          <Sub>loading and empty</Sub>
          <DriverList variant="impact" unit="%" data={undefined} />
          <DriverList variant="recovery" unit="pts" data={null} />

          <H>TickScale</H>
          <Card>
            <TickScale variant="marker" label="Pace of Aging" metric={m(0.82)} min={-1} max={3} format="decimal2" unit="x" ends={["−1.0x", "1.0x", "3.0x"]} leading={<><Turtle size={16} color={c.foregroundSecondary} /><Txt role="body" color="foregroundSecondary">Slow</Txt></>} trailing={<><Txt role="body" color="foregroundSecondary">Fast</Txt><Rabbit size={16} color={c.foregroundSecondary} /></>} bands={[{ from: 0.8, to: 1.3, tone: "optimal" }, { from: 1.5, to: 3, tone: "warning" }]} />
            <View style={{ height: 24 }} />
            <TickScale variant="meter" label="Energy" metric={m(62, { provisional: true })} min={0} max={100} format="int" unit="%" />
            <View style={{ height: 24 }} />
            <TickScale variant="meter" label="Energy" metric={undefined} min={0} max={100} format="int" />
          </Card>

          <H>TrendChart</H>
          <SectionShell variant="card" title="Recovery" action={{ label: "Details", onPress: noop }}>
            <TrendChart label="Recovery" data={m(RECOVERY_TREND)} unit="%" format="int" colorBy="band" direction="up" deltas={{ w: 4, m: -6 }} ranges={["w", "m", "6m", "1y"]} range={range} onRangeChange={setRange} today={TODAY} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Heart rate variability">
            <TrendChart label="HRV" data={m(HRV_TREND)} unit="ms" format="int" colorBy="single" direction="up" deltas={{ w: 2, m: 1 }} baseline={{ mean: 54, sd: 8 }} defaultRange="w" line today={TODAY} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Calories burned">
            <TrendChart label="Calories" data={m(CALORIES)} unit="kcal" format="grouped" colorBy="single" headline="day" stack={[{ key: "resting", label: "Resting", color: c.energyResting }, { key: "active", label: "Active", color: c.energyActive }]} defaultRange="w" today={TODAY} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Strain">
            <TrendChart label="Strain" data={m(trend(182, 11, 8, (v) => Math.round(Math.max(0, Math.min(21, v)) * 10) / 10))} format="decimal1" colorBy="strain" target={[9.5, 13.2]} fixedRange="m" today={TODAY} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Weight">
            <TrendChart label="Weight" data={m(trend(182, 77.2, 1.4, (v) => Math.round(v * 10) / 10))} unit="kg" format="decimal1" colorBy="single" smooth={7} defaultRange="6m" today={TODAY} />
          </SectionShell>
          <Sub>loading</Sub>
          <Card>
            <TrendChart label="Stress" data={undefined} format="decimal1" colorBy="stress" />
          </Card>

          <H>Intraday charts</H>
          <SectionShell variant="card" title="Heart rate">
            <IntradayHrChart data={m(HR_DAY)} timeZone={TZ} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Energy bank">
            <EnergyBankChart data={m(ENERGY)} timeZone={TZ} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Energy bank">
            <EnergyBankChart data={reason("awaiting_sleep_sync")} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Heart rate">
            <IntradayHrChart data={undefined} />
          </SectionShell>

          <H>Sleep</H>
          <SectionShell variant="card" title="Last night’s sleep">
            <SleepStages hours={m({ asleepMin: 390, average: 452, sd: 25 })} hr={m(SLEEP_HR)} data={m(NIGHT)} timeZone={TZ} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Overnight heart rate">
            <SleepHrChart data={m(SLEEP_HR)} timeZone={TZ} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Stages">
            <Hypnogram data={m(NIGHT)} timeZone={TZ} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Last night’s sleep">
            <SleepStages hours={reason("awaiting_sleep_sync")} hr={undefined} data={undefined} />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Last night’s sleep">
            <SleepStages hours={undefined} hr={undefined} data={undefined} />
          </SectionShell>

          <H>ZoneBars</H>
          <SectionShell variant="card" title="Time in zones">
            <ZoneBars
              variant="rows"
              note="Zones from your max heart rate of 190."
              data={m([
                { zone: 5, label: "Zone 5", min: 173, max: null, seconds: 0 },
                { zone: 4, label: "Zone 4", min: 155, max: 172, seconds: 312, typical: { seconds: 240, share: 0.08 } },
                { zone: 3, label: "Zone 3", min: 137, max: 154, seconds: 1470, typical: { seconds: 1200, share: 0.4 } },
                { zone: 2, label: "Zone 2", min: 119, max: 136, seconds: 960, typical: { seconds: 1100, share: 0.36 } },
                { zone: 1, label: "Zone 1", min: 100, max: 118, seconds: 420, typical: { seconds: 300, share: 0.1 } },
                { zone: 0, label: "Zone 0", min: 0, max: 99, seconds: 180 },
              ])}
            />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Recovery breakdown">
            <ZoneBars
              variant="stacked"
              unit="days"
              data={m([
                { key: "green", label: "Green", count: 12, color: "recovery-green" },
                { key: "yellow", label: "Yellow", count: 14, color: "recovery-yellow" },
                { key: "red", label: "Red", count: 4, color: "recovery-red" },
              ])}
            />
          </SectionShell>
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Time in zones">
            <ZoneBars variant="rows" data={undefined} />
          </SectionShell>

          <H>Timeline rows</H>
          <View style={{ gap: 6 }}>
            <SleepCard kind="sleep" minutes={390} start={BED} end={WAKE} onPress={noop} timeZone={TZ} />
            <ActivityCard name="Running" kind="run" strain={m(8.4)} start={dayAt(17, 30)} end={dayAt(18, 24)} onPress={noop} timeZone={TZ} distanceKm={5.21} paceS={332} />
            <ActivityCard name="Strength training" kind="strength" strain={reason("insufficient_hr_data")} start={dayAt(12, 5)} end={dayAt(12, 50)} onPress={noop} timeZone={TZ} />
            <SleepCard kind="nap" minutes={34} start={WAKE + 21 * 15 * 60_000} end={WAKE + 27 * 15 * 60_000} onPress={noop} timeZone={TZ} />
            <ActivityCard.Skeleton />
          </View>

          <H>Insights</H>
          <HomeInsight
            items={[
              { key: "a", title: "Past your target", body: "You are past today’s target. Prioritise sleep tonight to recover." },
              { key: "b", title: "HRV is below your baseline", body: "Your HRV was 50 ms against a 54 ms baseline; an easy day helps." },
              { key: "c", title: "Bedtime drift", body: "Your bedtimes have moved 40 minutes later this week." },
            ]}
          />
          <View style={{ height: 12 }} />
          <InsightCard title="Why 39%" body="Your sleep was sufficient. You slept 92 minutes less than you needed; an earlier night helps." action={{ label: "See what shaped it", onPress: noop }} />
          <View style={{ height: 12 }} />
          <InsightCard.Skeleton title action />
          <View style={{ height: 12 }} />
          <SectionShell variant="card" title="Tonight’s sleep" fill>
            <TonightPlan
              timeZone={TZ}
              plan={{
                wakeAt: dayAt(7, 30) + DAY_MS,
                needMin: 512,
                plans: [
                  { key: "peak", label: "Peak", bedtimeAt: dayAt(22, 58), share: 1 },
                  { key: "perform", label: "Perform", bedtimeAt: dayAt(23, 55), share: 0.85 },
                  { key: "getby", label: "Get by", bedtimeAt: dayAt(0, 52) + DAY_MS, share: 0.7 },
                ],
              }}
            />
          </SectionShell>

          <H>States</H>
          <Card>
            <ReasonPlaceholder reason="calibrating" nightsLeft={4} size="sm" />
            <ReasonPlaceholder reason="band_not_worn" size="md" />
            <ReasonPlaceholder reason="awaiting_sleep_sync" size="lg" />
            <MetricState metric={reason<number>("no_hrv_last_night")} skeleton={<Skeleton style={{ height: 40 }} />}>
              {(v) => <Txt role="value">{v}</Txt>}
            </MetricState>
          </Card>

          <H>Controls</H>
          <ToggleGroup value={range} onChange={setRange} items={[{ value: "w", label: "W" }, { value: "m", label: "M" }, { value: "6m", label: "6M" }, { value: "1y", label: "1Y" }]} font="numeric" fill />
          <View style={{ height: 12 }} />
          <Row>
            <DateSwitcher mode="day" date={date} today={TODAY} firstDay="2026-04-01" onChange={setDate} onOpenCalendar={noop} />
            <DateSwitcher mode="week" date={date} today={TODAY} onChange={setDate} />
            <DateSwitcher mode="day" date={date} today={TODAY} onChange={setDate} loading />
          </Row>
          <View style={{ height: 12 }} />
          <DateSwitcher mode="day" date={date} today={TODAY} onChange={setDate} placement="header" />
          <View style={{ height: 12 }} />
          <Row>
            <SyncStatus status={SYNC} now={NOW} onPress={noop} />
            <SyncStatus status={{ ...SYNC, mode: "google", sync: { state: "syncing", lastSuccessAt: NOW - 600_000 } }} now={NOW} />
            <SyncStatus status={{ ...SYNC, mode: "google", sync: { state: "stale", lastSuccessAt: NOW - 5 * 3_600_000 } }} now={NOW} />
            <SyncStatus status={{ ...SYNC, mode: "google", sync: { state: "error", lastSuccessAt: NOW - 2 * DAY_MS } }} now={NOW} />
          </Row>
          <Sub>Sparkline alone</Sub>
          <View style={{ height: 64, width: 200 }}>
            <Sparkline values={[48, 52, null, 61, 55, 49, 58, 50]} band={{ low: 46, high: 62 }} caption="Last 7 nights" style={{ flex: 1 }} />
          </View>
        </View>

        <H>Detail headers</H>
        <DetailHeader title="Recovery" onBack={noop} info={RECOVERY_INFO} dateTitle={{ mode: "day", date, today: TODAY, onChange: setDate }} />
        <View style={{ height: 24 }} />
        <DetailHeader title="Health monitor" onBack={noop} info={RECOVERY_INFO} />
        <View style={{ height: 24 }} />
        <DetailHeader title="Halo Age" subtitle="Next update in 7 days" onBack={noop} />
        <View style={{ height: 24 }} />
        <DetailHeader title="Running" subtitle="17:30 - 18:24" align="start" titleIcon={<Activity size={24} color={c.foreground} strokeWidth={1.75} />} onBack={noop} info={RECOVERY_INFO} />
        <View style={{ height: 24 }} />
        <DetailHeader title="Settings" dismiss="close" onBack={noop} />
        <View style={{ height: 48 }} />
      </ScrollView>
      <TabBar current={tab} onChange={(i) => setTab(i)} onAction={() => setSheet(true)} />
      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Check in"
        description="Wed, Oct 7"
        footer={
          <>
            <Button size="sheet" onPress={() => setSheet(false)}>
              Save
            </Button>
            <Button size="sheet" variant="outline-pill" onPress={() => setSheet(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <View style={{ gap: 16 }}>
          <SheetSection>Time</SheetSection>
          <Txt role="body">The sheet material: 28 px top corners, a 40 × 6 grab handle, the sheet → sheet-bottom gradient with a lit top edge.</Txt>
          <SheetSection>Tags</SheetSection>
          <Row>
            <Tag kind="provisional" />
            <Tag kind="estimate" />
          </Row>
        </View>
      </BottomSheet>
    </View>
  );
}

/** Every kit component with sample data, in value, reason and loading states. Mount it as a screen to check on a device. */
export default function KitPreview() {
  const [loaded] = useAppFonts();
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider initial="dark">
        <Preview />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
