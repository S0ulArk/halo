// Reports `/reports/[period]` (spec §7.13, journey 8), ported from Pulse's src/app/(app)/reports/[period]/page.tsx and
// its loading.tsx. `period` is `YYYY-Www` or `YYYY-MM`. Phone additions: the Performance Assessment (focus points, the
// biggest changes, sleep against need and activity against the Weekly Plan's targets) and a Share button that sends
// the report as text (./share.ts).
import * as React from "react";
import { Pressable, Share, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronLeft, ChevronRight, Crosshair, Share2, TrendingDown, TrendingUp } from "lucide-react-native";
import { recoveryBand, type DataColor } from "@/lib/bands";
import { dayHref } from "@/lib/day";
import { DAY, formatDay, formatValue, MISSING, rangeLabel } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import type { KeyStat, ReportVM } from "@/queries";
import { latestReport } from "@/queries/home";
import { getReport, MONTH_PERIOD, WEEK_PERIOD, type PerformanceVM, type ReportChange, type ReportPageVM } from "@/queries/reports";
import { useApp, useQuery } from "@/state/app";
import { useWeeklyPlan } from "@/state/weeklyPlan";
import {
  Button,
  DriverList,
  DriverListSkeleton,
  EmptyState,
  InsightCard,
  KeyStatRow,
  KeyStatRowSkeleton,
  MetricTags,
  ScoreDial,
  ScoreDialSkeleton,
  SectionShell,
  Skeleton,
  SkeletonText,
  Txt,
  ZoneBars,
} from "@/ui";
import { InsightCardSkeleton } from "@/ui/components/InsightCard";
import { ZoneBarsSkeleton } from "@/ui/components/ZoneBars";
import { font } from "@/ui/fonts";
import { DetailScreen, LoadError } from "@/screens/detail/DetailScreen";
import { useBack, usePush, useRefresh } from "@/screens/detail/nav";
import { Rows } from "@/screens/health/view";
import { Caption, Num, Sentence, Surface, useCalm, type CalmTint } from "@/screens/settings/calmKit";
import { reportShareText, STAT_FORMAT } from "./share";
const DIAL_FORMAT = { sleep: "int", recovery: "int", strain: "decimal1" } as const;
/** Each dial's family pastel ink; Recovery's follows its band. */
const DIAL_TINT: Record<"sleep" | "strain", CalmTint> = { sleep: "lavender", strain: "peach" };
const BALANCE_TINT: Record<"balanced" | "overreaching" | "undertrained", CalmTint | null> = { balanced: "mint", overreaching: "peach", undertrained: null };
const DIALS = [
  ["sleep", "Avg sleep"],
  ["recovery", "Avg recovery"],
  ["strain", "Avg strain"],
] as const;
const AVERAGES = ["Recovery", "Day strain", "Sleep performance", "Heart rate variability", "Resting heart rate"];
/** The Averages card's rows: hours of sleep and consistency move to the Sleep card. */
const AVERAGE_KEYS = new Set(["recovery", "strain", "sleepPerf", "hrv", "rhr"]);
const SLEEP_ROWS = ["Hours slept", "Nights at sleep need", "Sleep consistency"];
const ACTIVITY_ROWS = ["Moderate activity", "Vigorous activity", "Strength sessions", "Daily steps"];

const periodLabel = (kind: "week" | "month", start: string, end: string) => (kind === "week" ? rangeLabel(start, end) : formatDay(start, DAY.monthYear));

/** A 36 px round step in the period pill; the next arrow is disabled at the latest period. */
function Step({ dir, label, onPress }: { dir: "prev" | "next"; label: string; onPress: (() => void) | null }) {
  const c = useCalm();
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={onPress ?? undefined}
      disabled={!onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", opacity: onPress ? 1 : 0.35, backgroundColor: pressed ? c.ground : "transparent" })}
    >
      <Icon size={20} color={c.teal} strokeWidth={2.25} />
    </Pressable>
  );
}

/** Previous / next period, in place (the web's links replace the URL); the next arrow is disabled at the latest period. */
function PeriodSwitcher({ vm, go }: { vm: ReportVM; go: (period: string) => void }) {
  const c = useCalm();
  const unit = vm.kind;
  return (
    <View style={{ height: 48, flexDirection: "row", alignItems: "center", borderRadius: 24, paddingHorizontal: 4, backgroundColor: c.card }}>
      <Step dir="prev" label={`Previous ${unit}`} onPress={vm.prev ? () => go(vm.prev!) : null} />
      <Txt size={15} lineHeight={20} weight={600} align="center" style={{ color: c.ink, minWidth: 112, paddingHorizontal: 8 }}>
        {periodLabel(vm.kind, vm.start, vm.end)}
      </Txt>
      <Step dir="next" label={`Next ${unit}`} onPress={vm.next ? () => go(vm.next!) : null} />
    </View>
  );
}

/** Week / Month: the latest report of each kind; a kind with none is greyed out. */
function KindToggle({ kind, week, month, open }: { kind?: "week" | "month"; week: string | null; month: string | null; open?: (period: string) => void }) {
  const c = useCalm();
  const item = (k: "week" | "month", label: string, to: string | null) => {
    const on = kind === k;
    return (
      <Pressable
        key={k}
        onPress={to && open ? () => open(to) : undefined}
        disabled={!to || !open}
        accessibilityRole="link"
        accessibilityState={{ selected: on, disabled: !to }}
        style={({ pressed }) => ({ height: 40, minWidth: 80, paddingHorizontal: 16, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.teal : "transparent", opacity: to || !open ? (pressed ? 0.8 : 1) : 0.4 })}
      >
        <Txt size={14} lineHeight={18} weight={600} style={{ color: on ? c.card : c.ink }}>
          {label}
        </Txt>
      </Pressable>
    );
  };
  return (
    <View accessibilityLabel="Report period" style={{ flexDirection: "row", gap: 4, borderRadius: 18, backgroundColor: c.card, padding: 4 }}>
      {item("week", "Week", week)}
      {item("month", "Month", month)}
    </View>
  );
}

/**
 * The period's three averages as big numbers on one white card (Sleep, Recovery, Strain), each in its family's ink with
 * its label in small capitals under it and the change against the period before under that. A missing average says why.
 */
function Dials({ vm }: { vm: ReportVM }) {
  const c = useCalm();
  const word = vm.kind === "week" ? "last week" : "last month";
  return (
    <Surface style={{ width: "100%" }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        {vm.dials.map((dl) => {
          const f = DIAL_FORMAT[dl.key];
          const v = dl.metric.value;
          const band = dl.key === "recovery" && v !== null ? recoveryBand(v) : null;
          const ink = dl.key === "recovery" ? (band === "green" ? c.tintInk.mint : band === "yellow" ? c.tintInk.sand : band === "red" ? c.tintInk.rose : c.ink) : c.tintInk[DIAL_TINT[dl.key]];
          const tone = dl.delta === null || dl.key === "strain" || Math.round(dl.delta * 10) === 0 ? c.sub : dl.delta > 0 ? c.tintInk.mint : c.tintInk.peach;
          const unit = f === "int" ? "%" : undefined;
          const why = v === null ? reasonCopy(dl.metric.reason).short : null;
          const delta = dl.delta === null ? null : formatValue(f === "int" ? "signedInt" : "signed1", dl.delta);
          return (
            <View
              key={dl.key}
              accessible
              accessibilityLabel={`${dl.label}: ${v === null ? why : `${formatValue(f, v)}${unit ? " percent" : ""}`}${delta ? `, ${delta} vs. ${word}` : ""}`}
              style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 4 }}
            >
              {v === null ? <Num value={MISSING} size={30} color={c.faint} /> : <Num value={formatValue(f, v)} unit={unit} size={30} color={ink} />}
              <Caption>{dl.label}</Caption>
              {why && <Sentence size={12}>{why}</Sentence>}
              {delta !== null && (
                <Txt size={12} lineHeight={16} style={{ color: c.sub, marginTop: 2 }}>
                  <Txt size={13} lineHeight={16} style={[font.numeric(700), { color: tone }]}>
                    {delta}
                  </Txt>
                  {` vs. ${word}`}
                </Txt>
              )}
            </View>
          );
        })}
      </View>
    </Surface>
  );
}

/** The small grey note at a card header's right ("vs. last week", "Days"). */
function Aside({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} weight={500} style={{ color: c.sub }}>
      {children}
    </Txt>
  );
}

/** Rows of stats against the period before; a stat without a known format brings its own (the assessment's). */
function Averages({ stats, word }: { stats: KeyStat[]; word: string }) {
  return (
    <Rows>
      {stats.map((s) => {
        const f = STAT_FORMAT[s.key] ?? { format: s.format ?? ("decimal1" as const), unit: s.unit };
        const k = f.scale ?? 1;
        return (
          <KeyStatRow
            key={s.key}
            variant="row"
            label={s.label}
            caption={s.caption}
            metric={s.metric.value === null ? s.metric : { ...s.metric, value: s.metric.value * k }}
            unit={f.unit}
            format={f.format}
            average={s.average === null ? null : s.average * k}
            averageLabel={`${word}'s average`}
            direction={s.direction}
          />
        );
      })}
    </Rows>
  );
}

function TrainingBalance({ tb }: { tb: ReportVM["trainingBalance"] }) {
  const v = tb.value;
  if (!v) return <EmptyState body="Not enough data for a training balance." style={{ paddingVertical: 16 }} />;
  return <BalanceBody word={v.word} tint={BALANCE_TINT[v.status]} acwr={formatValue("decimal2", v.acwr)} line={v.line} />;
}

/** The balance in its word (mint when balanced, peach when overreaching), the load ratio as a number, then the line. */
function BalanceBody({ word, tint, acwr, line }: { word: string; tint: CalmTint | null; acwr: string; line: string }) {
  const c = useCalm();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <Txt size={22} lineHeight={28} weight={700} style={{ color: tint ? c.tintInk[tint] : c.sub, flexShrink: 1 }}>
          {word}
        </Txt>
        <View accessible accessibilityLabel={`Training load (ACWR) ${acwr}`} style={{ alignItems: "flex-end", gap: 2 }}>
          <Num value={acwr} size={24} />
          <Caption>Training load (ACWR)</Caption>
        </View>
      </View>
      <Sentence>{line}</Sentence>
    </View>
  );
}

/** Best and worst day: each opens Home on that day. */
function BestWorst({ items, open }: { items: NonNullable<ReportVM["bestWorst"]>; open: (day: string) => void }) {
  const c = useCalm();
  return (
    <Rows>
      {items.map((b) => (
        <Pressable
          key={b.label}
          onPress={() => open(b.day)}
          accessibilityRole="link"
          accessibilityLabel={`${b.label}: ${formatDay(b.day, DAY.long)}, Recovery ${Math.round(b.recovery)} percent${b.strain === null ? "" : `, strain ${formatValue("decimal1", b.strain)}`}`}
          style={({ pressed }) => ({ marginHorizontal: -10, minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: pressed ? c.ground : "transparent" })}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
              {b.label}
            </Txt>
            <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
              {formatDay(b.day, DAY.short)}
            </Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <ScoreDial variant="recovery" size="sm" value={b.recovery} />
            <View style={{ minWidth: 48, alignItems: "flex-end" }}>
              <Num value={formatValue("decimal1", b.strain)} size={20} color={c.tintInk.peach} />
              <Caption>Strain</Caption>
            </View>
          </View>
          <ChevronRight size={18} color={c.label} strokeWidth={1.5} />
        </Pressable>
      ))}
    </Rows>
  );
}

/** The header's share action: the report as text through Android's share sheet. */
function ShareButton({ vm }: { vm: ReportPageVM }) {
  const c = useCalm();
  const share = () => {
    // The sheet's own cancel resolves; a failure to open it leaves nothing to undo.
    Share.share({ message: reportShareText(vm) }, { dialogTitle: `Share ${vm.kind === "week" ? "weekly" : "monthly"} report` }).catch(() => {});
  };
  return (
    <Button variant="ghost" size="icon-touch" onPress={share} accessibilityLabel={`Share this ${vm.kind}'s report`}>
      <Share2 size={22} color={c.teal} strokeWidth={2} />
    </Button>
  );
}

/** The assessment's 1–2 focus points, each after a crosshair, in the plain words the coach uses. */
function FocusCard({ lines, title }: { lines: string[]; title: string }) {
  const c = useCalm();
  return (
    <SectionShell variant="card" title={title} accent={null}>
      <View style={{ gap: 14 }}>
        {lines.map((line) => (
          <View key={line} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: c.tint.mint, alignItems: "center", justifyContent: "center" }}>
              <Crosshair size={18} color={c.tintInk.mint} strokeWidth={2} />
            </View>
            <Txt size={15} lineHeight={21} style={{ color: c.ink, flex: 1, minWidth: 0, paddingTop: 5 }}>
              {line}
            </Txt>
          </View>
        ))}
      </View>
    </SectionShell>
  );
}

function ChangeRow({ ch }: { ch: ReportChange }) {
  const c = useCalm();
  const Icon = ch.better ? TrendingUp : TrendingDown;
  const tint: CalmTint = ch.better ? "mint" : "peach";
  return (
    <View accessible accessibilityLabel={`${ch.label}: ${ch.text}, ${ch.better ? "better" : "worse"}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.tint[tint] }}>
        <Icon size={18} color={c.tintInk[tint]} strokeWidth={2} />
      </View>
      <Txt size={15} lineHeight={20} weight={500} style={{ color: c.ink, flex: 1, minWidth: 0 }}>
        {ch.label}
      </Txt>
      <Txt size={17} lineHeight={22} style={[font.numeric(700), { color: c.tintInk[tint], flexShrink: 0 }]}>
        {ch.text}
      </Txt>
    </View>
  );
}

/** The biggest moves either way against the period before (scaled by each metric's typical spread). */
function Changes({ p, lastWord }: { p: PerformanceVM; lastWord: string }) {
  if (!p.improved.length && !p.declined.length) return <EmptyState body={`Nothing moved much from ${lastWord}.`} style={{ paddingVertical: 16 }} />;
  return (
    <Rows>
      {[...p.improved, ...p.declined].map((ch) => (
        <ChangeRow key={ch.key} ch={ch} />
      ))}
    </Rows>
  );
}

function MutedChevron() {
  const c = useCalm();
  return <ChevronRight size={18} color={c.label} strokeWidth={1.5} />;
}

/** A row's name while the report loads. */
function SkeletonLabel({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
      {children}
    </Txt>
  );
}

/** A card of KeyStatRow skeletons, one per label. */
function RowsSkeleton({ title, labels, aside }: { title: string; labels: string[]; aside?: boolean }) {
  return (
    <SectionShell variant="card" title={title} aside={aside ? <SkeletonText role="caption" width={80} /> : undefined}>
      <Rows>
        {labels.map((l) => (
          <KeyStatRowSkeleton key={l} variant="row" label={l} />
        ))}
      </Rows>
    </SectionShell>
  );
}

/**
 * Report loading (spec §7.13, §5.19): the period switcher, kind toggle and three dials, the insight, Recovery
 * breakdown, then the biggest changes, Averages, Sleep, Activity, Training balance, Top journal effects and Best and
 * worst day.
 */
function reportSkeleton(onViewAll: () => void) {
  return {
    hero: (
      <View importantForAccessibility="no-hide-descendants" style={{ width: "100%", alignItems: "center", gap: 20 }}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Skeleton radius={24} style={{ height: 48, width: 200 }} />
          <KindToggle week={null} month={null} />
        </View>
        <Surface style={{ width: "100%" }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            {DIALS.map(([k, l]) => (
              <View key={k} style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 6 }}>
                <SkeletonText role="valueXl" chars={2.4} />
                <Caption>{l}</Caption>
                <SkeletonText role="caption" width={72} />
              </View>
            ))}
          </View>
        </Surface>
      </View>
    ),
    insight: <InsightCardSkeleton />,
    primary: (
      <SectionShell variant="card" title="Recovery breakdown" aside={<Aside>Days</Aside>}>
        <ZoneBarsSkeleton variant="stacked" />
      </SectionShell>
    ),
    secondary: [
      <SectionShell key="changes" variant="card" title="Biggest changes" accent={null}>
        <View style={{ gap: 16, paddingVertical: 8 }}>
          <SkeletonText role="valueSm" width={192} />
          <SkeletonText role="valueSm" width={160} />
        </View>
      </SectionShell>,
      <RowsSkeleton key="avg" title="Averages" labels={AVERAGES} aside />,
      <RowsSkeleton key="sleep" title="Sleep" labels={SLEEP_ROWS} aside />,
      <RowsSkeleton key="activity" title="Activity" labels={ACTIVITY_ROWS} aside />,
      <SectionShell key="balance" variant="card" title="Training balance">
        <View style={{ gap: 4 }}>
          <SkeletonText role="value" width={96} />
          <SkeletonText role="caption" width={144} />
          <View style={{ paddingTop: 8 }}>
            <SkeletonText role="body" width={224} />
            <SkeletonText role="body" width={96} />
          </View>
        </View>
      </SectionShell>,
      <SectionShell key="journal" variant="card" title="Top journal effects" action={{ label: "View all", onPress: onViewAll }}>
        <DriverListSkeleton />
      </SectionShell>,
      <SectionShell key="best" variant="card" title="Best and worst day">
        <Rows>
          {["Best day", "Worst day"].map((l) => (
            <View key={l} style={{ minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <SkeletonLabel>{l}</SkeletonLabel>
                <SkeletonText role="caption" width={80} style={{ marginTop: 4 }} />
              </View>
              <ScoreDialSkeleton variant="recovery" size="sm" />
              <View style={{ minWidth: 48, alignItems: "flex-end" }}>
                <SkeletonText role="value" chars={3} />
                <Caption>Strain</Caption>
              </View>
              <MutedChevron />
            </View>
          ))}
        </Rows>
      </SectionShell>,
    ],
  };
}

/** Reports `/reports/[period]` (spec §7.13, journey 8): `YYYY-Www` or `YYYY-MM`. */
export default function ReportScreen() {
  const router = useRouter();
  const push = usePush();
  const { today } = useApp();
  // The Weekly Plan's targets name the gaps the focus points and the activity captions use.
  const { plan } = useWeeklyPlan();
  const onBack = useBack("/reports");
  const { refreshing, onRefresh, retry } = useRefresh();
  const params = useLocalSearchParams<{ period?: string }>();
  const period = typeof params.period === "string" ? params.period : "";
  const isWeek = WEEK_PERIOD.test(period);
  const valid = isWeek || MONTH_PERIOD.test(period);
  const q = useQuery(
    async (ctx) => {
      if (!valid) return { period, vm: null, latest: null };
      const vm = await getReport(period, ctx, plan.targets);
      return { period, vm, latest: vm ? null : await latestReport(ctx, isWeek ? "week" : "month") };
    },
    [period, plan.targets],
  );
  // useQuery keeps the last period's answer while this one loads: show the loading shape, not the previous period.
  const data = q.data && q.data.period === period ? q.data : undefined;
  const title = isWeek ? "Weekly report" : "Monthly report";
  const word = isWeek ? "week" : "month";
  const viewAll = () => push("/journal/insights");
  const common = { title, onBack, refreshing, onRefresh } as const;

  if (!valid) return <DetailScreen {...common} title="Report" hero={<EmptyState body="There is no report for this period." action={{ label: "All reports", onPress: () => router.replace("/reports" as Href) }} />} />;
  if (q.error && !data) return <DetailScreen {...common} primary={<LoadError onRetry={retry} />} />;
  if (!data) return <DetailScreen {...common} {...reportSkeleton(viewAll)} />;

  const vm = data.vm;
  if (!vm) {
    const latest = data.latest;
    return (
      <DetailScreen
        {...common}
        hero={<EmptyState body={`No data for this ${word}.`} action={latest ? { label: `Latest ${word}`, onPress: () => push(`/reports/${latest.period}`) } : undefined} />}
      />
    );
  }

  const lastWord = vm.kind === "week" ? "last week" : "last month";
  const p = vm.performance;
  return (
    <DetailScreen
      {...common}
      action={<ShareButton vm={vm} />}
      hero={
        <View style={{ width: "100%", alignItems: "center", gap: 20 }}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <PeriodSwitcher vm={vm} go={(to) => router.setParams({ period: to })} />
            <KindToggle kind={vm.kind} week={vm.latestWeek} month={vm.latestMonth} open={(to) => (to === period ? undefined : push(`/reports/${to}`))} />
            {vm.partial && <MetricTags extra={[vm.kind === "week" ? "partial_week" : "partial_month"]} />}
          </View>
          <Dials vm={vm} />
        </View>
      }
      insight={
        vm.insight || p.focus.length ? (
          <View style={{ gap: 12 }}>
            {vm.insight && <InsightCard body={vm.insight} />}
            {p.focus.length > 0 && <FocusCard lines={p.focus} title={vm.partial ? "Focus" : `Focus for next ${word}`} />}
          </View>
        ) : null
      }
      primary={
        <SectionShell variant="card" title="Recovery breakdown" aside={<Aside>Days</Aside>}>
          <ZoneBars
            variant="stacked"
            unit="days"
            emptyCopy="No days with Recovery in this period."
            data={vm.bands.value ? { ...vm.bands, value: vm.bands.value.map((b) => ({ ...b, color: b.color as DataColor })) } : null}
          />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="changes" variant="card" title="Biggest changes" accent={null} aside={<Aside>{`vs. ${lastWord}`}</Aside>}>
          <Changes p={p} lastWord={lastWord} />
        </SectionShell>,
        <SectionShell key="avg" variant="card" title="Averages" aside={<Aside>{`vs. ${lastWord}`}</Aside>}>
          <Averages stats={vm.averages.filter((s) => AVERAGE_KEYS.has(s.key))} word={lastWord} />
        </SectionShell>,
        <SectionShell key="sleep" variant="card" title="Sleep" aside={<Aside>{`vs. ${lastWord}`}</Aside>}>
          <Averages stats={p.sleep} word={lastWord} />
        </SectionShell>,
        <SectionShell key="activity" variant="card" title="Activity" aside={<Aside>{`vs. ${lastWord}`}</Aside>}>
          <Averages stats={p.activity} word={lastWord} />
        </SectionShell>,
        <SectionShell key="balance" variant="card" title="Training balance">
          <TrainingBalance tb={vm.trainingBalance} />
        </SectionShell>,
        <SectionShell key="journal" variant="card" title="Top journal effects" action={{ label: "View all", onPress: viewAll }}>
          {vm.topImpacts.length ? (
            <DriverList variant="impact" unit="%" inCard data={{ value: vm.topImpacts.slice(0, 3), reason: null, provisional: false }} />
          ) : (
            <EmptyState body="No journal effects yet." style={{ paddingVertical: 16 }} />
          )}
        </SectionShell>,
        vm.bestWorst && (
          <SectionShell key="best" variant="card" title="Best and worst day">
            <BestWorst items={vm.bestWorst} open={(day) => router.navigate(dayHref("/", day, today) as Href)} />
          </SectionShell>
        ),
      ]}
    />
  );
}
