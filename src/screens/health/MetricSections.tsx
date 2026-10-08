// The per-metric sections of `/metric/[key]` (spec §11 MD1), one component per Section kind of the view model,
// ported from Pulse's metric/[key]/sections.tsx and RangeStats.tsx.
import * as React from "react";
import { View } from "react-native";
import { clock, DAY, durationWords, formatDay, formatValue, hmm, type FormatKey } from "@/lib/format";
import type { GoodDirection } from "@/lib/bands";
import type { Metric } from "@/lib/reasons";
import type { MetricDetailVM, RangeStats, Section, TrendRange } from "@/queries";
import { EmptyState, KeyStatRow, MetricState, SectionShell } from "@/ui";
import { useCalm } from "@/ui/calm";
import { Num, Sentence, Title } from "@/screens/detail/calmKit";
import { ColumnChart, ColumnChartSkeleton } from "./ColumnChart";
import { usePush } from "./shells";
import { Rows, statProps } from "./view";

type Ctx = { vm: MetricDetailVM; timeZone: string };

const ok = (v: number): Metric<number> => ({ value: v, reason: null, provisional: false });

/** A footnote under a card's rows: a plain sentence (no grey strip). */
function Legend({ children }: { children: string }) {
  return (
    <View style={{ marginTop: 8 }}>
      <Sentence size={13}>{children}</Sentence>
    </View>
  );
}

export function MetricSection({ s, vm, timeZone }: Ctx & { s: Section }) {
  const push = usePush();
  const calm = useCalm();
  switch (s.kind) {
    case "hourly":
      return <Hourly s={s} vm={vm} timeZone={timeZone} />;
    case "goal":
      return (
        <SectionShell variant="card" title={`${formatValue("grouped", s.target)}-step days`}>
          <Rows>
            <KeyStatRow variant="row" label="Current streak" metric={ok(s.streak)} unit={s.streak === 1 ? "day" : "days"} format="int" direction="none" />
            <KeyStatRow variant="row" label="Longest streak" caption="In the past year" metric={ok(s.longest)} unit={s.longest === 1 ? "day" : "days"} format="int" direction="none" />
            <KeyStatRow variant="row" label="Days reached" caption={`In the last ${s.days} days`} metric={ok(s.met)} unit={`of ${s.days}`} format="int" direction="none" />
          </Rows>
          <Legend>About 7,000 steps a day goes with markedly lower health risks in a 2025 review of 57 studies. It is a reference, not a goal you set.</Legend>
        </SectionShell>
      );
    case "weekday": {
      const best = Math.max(...s.days.map((d) => d.value ?? -Infinity));
      return (
        <SectionShell variant="card" title="By weekday">
          <ColumnChart
            summary={`Average ${vm.label} by weekday over the last ${s.weeks} weeks: ${s.days.map((d) => `${d.label} ${formatValue(vm.format, d.value)}`).join(", ")}.`}
            data={s.days.map((d) => ({ label: d.label, value: d.value, highlight: d.value === best }))}
            format={vm.format}
            unit={vm.unit}
          />
          <View style={{ marginTop: 8 }}>
            <Sentence size={13}>{`Daily average for each weekday over the last ${s.weeks} weeks.`}</Sentence>
          </View>
        </SectionShell>
      );
    }
    case "weekly":
      return <Weekly s={s} vm={vm} />;
    case "intensity":
      return (
        <SectionShell variant="card" title="Minutes by intensity">
          <Rows>
            {s.rows.map((k) => (
              <KeyStatRow key={k.key} variant="row" {...statProps(k)} />
            ))}
          </Rows>
          <Legend>This day vs. its prior 30 days</Legend>
        </SectionShell>
      );
    case "workouts": {
      const burned = s.items.reduce((a, w) => a + (w.calories ?? 0), 0);
      return (
        <SectionShell variant="card" title="Workouts">
          {s.items.length ? (
            <>
              <Rows>
                {s.items.map((w) => (
                  <KeyStatRow
                    key={w.id}
                    variant="row"
                    label={w.name}
                    caption={`${clock(w.start, timeZone)} - ${clock(w.end, timeZone)}`}
                    metric={w.calories === null ? { value: null, reason: "no_data", provisional: false } : ok(w.calories)}
                    unit="kcal"
                    format="grouped"
                    direction="none"
                    onPress={() => push(`/activity/${encodeURIComponent(w.id)}`)}
                  />
                ))}
              </Rows>
              {s.active !== null && burned > 0 && (
                <Legend>{`Workouts burned ${formatValue("grouped", burned)} of the day’s ${formatValue("grouped", s.active)} active kcal.`}</Legend>
              )}
            </>
          ) : (
            <EmptyState body="No workouts recorded on this day." style={{ paddingVertical: 16 }} />
          )}
        </SectionShell>
      );
    }
    case "entries":
      return (
        <SectionShell variant="card" title="Logged entries">
          {s.items.length ? (
            <Rows>
              {s.items.map((e) => (
                // The time on the title's line, wherever the detail wraps.
                <View key={e.id} style={{ minHeight: 56, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Title size={15}>{e.title}</Title>
                    <Sentence size={13}>{e.source === "health_connect" ? `${e.detail} · logged in Fitbit` : e.detail}</Sentence>
                  </View>
                  <View style={{ flexShrink: 0, marginTop: (20 - 17) / 2 }}>
                    <Num value={clock(e.ts * 1000, timeZone)} size={15} color={calm.sub} />
                  </View>
                </View>
              ))}
            </Rows>
          ) : (
            <EmptyState body="Nothing logged in Halo on this day. Entries made in other apps count in the total once they sync." style={{ paddingVertical: 16 }} />
          )}
        </SectionShell>
      );
    case "balance":
      return (
        <SectionShell variant="card" title="Eaten vs. burned">
          <Rows>
            {s.rows.map((k) => (
              <KeyStatRow key={k.key} variant="row" {...statProps(k, false)} />
            ))}
          </Rows>
        </SectionShell>
      );
    case "macros":
      return (
        <SectionShell variant="card" title="Macros">
          <Rows>
            {s.rows.map((k) => (
              <KeyStatRow key={k.key} variant="row" {...statProps(k, false)} />
            ))}
          </Rows>
        </SectionShell>
      );
    case "readings":
      return (
        <SectionShell variant="card" title="Readings">
          <Rows>
            {s.changes.map((k) => (
              <KeyStatRow key={k.key} variant="row" {...statProps(k, false)} />
            ))}
            {s.items.map((r) => (
              <KeyStatRow key={r.day} variant="row" label={formatDay(r.day, DAY.short)} metric={ok(r.value)} unit={vm.unit} format={vm.format} direction="none" />
            ))}
          </Rows>
        </SectionShell>
      );
    case "outliers": {
      const range = `${formatValue(vm.format, s.mean - s.sd)} - ${formatValue(vm.format, s.mean + s.sd)}${vm.unit ? ` ${vm.unit}` : ""}`;
      return (
        <SectionShell variant="card" title="Unusual days">
          <View style={{ marginBottom: 8 }}>
            <Sentence size={13}>{`Your usual range over the last 90 days is ${range}. Days far outside it are listed here.`}</Sentence>
          </View>
          {s.items.length ? (
            <Rows>
              {s.items.map((o) => (
                <KeyStatRow
                  key={o.day}
                  variant="row"
                  label={formatDay(o.day, DAY.short)}
                  caption={o.dir === "high" ? "Above your usual range" : "Below your usual range"}
                  metric={ok(o.value)}
                  unit={vm.unit}
                  format={vm.format}
                  direction="none"
                />
              ))}
            </Rows>
          ) : (
            <EmptyState body="No unusual days in the last 90 days." style={{ paddingVertical: 16 }} />
          )}
        </SectionShell>
      );
    }
  }
}

function Hourly({ s, vm, timeZone }: Ctx & { s: Extract<Section, { kind: "hourly" }> }) {
  const sedentary = vm.key === "sedentary_minutes";
  return (
    <SectionShell variant="card" title={sedentary ? "Movement by hour" : "Steps by hour"}>
      <MetricState metric={s.hours} skeleton={<ColumnChartSkeleton />} renderReason={() => <EmptyState body="No per-minute steps for this day." style={{ paddingVertical: 40 }} />}>
        {(hours) => {
          const done = hours.filter((h) => h.value !== null);
          const peak = done.reduce((a, h) => ((h.value ?? 0) > (a?.value ?? 0) ? h : a), done[0]);
          return (
            <>
              <ColumnChart
                summary={`Steps by hour${peak?.value ? `, most at ${peak.label} with ${formatValue("grouped", peak.value)}` : ""}.`}
                data={hours.map((h, i) => ({ label: h.label, title: `${h.label} - ${hours[i + 1]?.label ?? "24:00"}`, value: h.value }))}
                format="grouped"
                unit="steps"
                tickEvery={6}
              />
              {sedentary && s.still && (
                <Legend>{`Longest daytime stretch without steps: ${durationWords(s.still.minutes)}, ${clock(s.still.from, timeZone)} - ${clock(s.still.to, timeZone)}`}</Legend>
              )}
            </>
          );
        }}
      </MetricState>
    </SectionShell>
  );
}

function Weekly({ s, vm }: { s: Extract<Section, { kind: "weekly" }>; vm: MetricDetailVM }) {
  const c = useCalm();
  const pct = Math.min(100, (s.week.total / s.target) * 100);
  return (
    <SectionShell variant="card" title="This week">
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 }}>
        <Num value={hmm(s.week.total)} size={28} color={c.tintInk.sky} />
        <Sentence>{`of ${hmm(s.target)}`}</Sentence>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${vm.label} this week`}
        accessibilityValue={{ min: 0, max: s.target, now: Math.round(s.week.total) }}
        style={{ marginTop: 8, marginBottom: 6, height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: c.line }}
      >
        <View style={{ height: "100%", width: `${pct}%`, borderRadius: 4, backgroundColor: c.tintInk.mint }} />
      </View>
      <View style={{ marginBottom: 16 }}>
        <Sentence size={13}>{`${formatDay(s.week.from, DAY.monthDay)} - ${formatDay(s.week.to, DAY.monthDay)}, toward the ${s.target} minutes a week the WHO recommends`}</Sentence>
      </View>
      <ColumnChart
        summary={`${vm.label} per week, last ${s.weeks.length} weeks. Target met in ${s.met}.`}
        data={s.weeks.map((w) => ({ label: formatDay(w.from, DAY.monthDay), title: `Week of ${formatDay(w.from, DAY.monthDay)}`, value: w.value, highlight: (w.value ?? 0) >= s.target }))}
        format="duration"
        tickEvery={3}
        reference={{ y: s.target, label: hmm(s.target) }}
      />
      <View style={{ marginTop: 8 }}>
        <Sentence size={13}>{`Target met in ${s.met} of the last ${s.weeks.length} weeks`}</Sentence>
      </View>
    </SectionShell>
  );
}

const RANGE: Record<TrendRange, { label: string; prior: string }> = {
  w: { label: "Last 7 days", prior: "the 7 days before" },
  m: { label: "Last 30 days", prior: "the 30 days before" },
  "6m": { label: "Last 6 months", prior: "the 6 months before" },
  "1y": { label: "Last 12 months", prior: "the year before" },
};

const metric = (v: number | null): Metric<number> => (v === null ? { value: null, reason: "no_data", provisional: false } : ok(v));

/** The history card's range in words and numbers; follows the chart's range toggle (`?r=`). */
export function RangeStatsCard({
  ranges,
  format,
  unit,
  direction,
  total,
  range,
}: {
  ranges: Record<TrendRange, RangeStats>;
  format: FormatKey;
  unit?: string;
  direction: GoodDirection;
  total: boolean;
  range: TrendRange;
}) {
  const s = ranges[range];
  const r = RANGE[range];
  const row = { variant: "row" as const, format, unit };
  return (
    <SectionShell variant="card" title={r.label}>
      <Rows>
        <KeyStatRow {...row} label="Daily average" caption={`vs. ${r.prior}`} metric={metric(s.average)} average={s.prior} averageLabel={r.prior} direction={direction} />
        {total && <KeyStatRow {...row} label="Total" metric={metric(s.total)} direction="none" />}
        <KeyStatRow {...row} label="Highest" caption={s.high ? formatDay(s.high.day, DAY.short) : undefined} metric={metric(s.high?.value ?? null)} direction="none" />
        <KeyStatRow {...row} label="Lowest" caption={s.low ? formatDay(s.low.day, DAY.short) : undefined} metric={metric(s.low?.value ?? null)} direction="none" />
        <KeyStatRow variant="row" format="int" unit={`of ${s.days}`} label="Days with data" metric={metric(s.withData)} direction="none" />
      </Rows>
    </SectionShell>
  );
}
