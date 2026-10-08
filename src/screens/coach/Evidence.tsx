// The cards under a coach answer, ported from Pulse's coach/Evidence.tsx and Coach.tsx (DayCard, Stat): each tool's
// result as Pulse's own components on a white Calm card, and a teal "Based on …" link to the screen the numbers come
// from. The day's three scores sit on their families' pastels (Recovery mint, Sleep lavender, Strain peach).
import * as React from "react";
import { Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ArrowUpRight } from "lucide-react-native";
import type { CoachOutputs, dayDigest } from "@/coach/tools";
import { recoveryBand } from "@/lib/bands";
import { normalizeReason, type Metric } from "@/lib/reasons";
import { KeyStatRow, MetricState, Sparkline, Txt, ZoneBars, type MiniRingVariant } from "@/ui";
import { font } from "@/ui/fonts";
import { Caption, Hairline, Num, Surface, useCalm, type CalmTint } from "@/screens/settings/calmKit";
import { Rows } from "@/screens/health/view";

type DayDigest = Awaited<ReturnType<typeof dayDigest>>;
type Score = { value: number | null; reason?: string | null };

const REASON: Record<string, string> = {
  calibrating: "Calibrating",
  no_hrv_last_night: "No HRV",
  awaiting_sleep_sync: "Syncing",
  insufficient_hr_data: "Not enough data",
  band_not_worn: "Not worn",
  no_data: "No data",
};

const MAX: Record<MiniRingVariant, number> = { recovery: 100, sleep: 100, strain: 21 };

/** Where "Your profile" points: Settings › Profile (the web's Settings › Account). */
export const PROFILE_HREF = "/settings?s=profile";

function metric(m: { value: number | null; reason?: string | null; provisional?: boolean }): Metric<number> {
  return { value: m.value, reason: m.value === null ? normalizeReason(m.reason) : null, provisional: m.provisional ?? false };
}

const twelveHour = new Map<string, Intl.DateTimeFormat>();
/** "10:30 PM" in the zone the sleep was read in (the web's `Intl.DateTimeFormat("en", { hour, minute })`). */
function time(ms: number, timeZone: string) {
  let f = twelveHour.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
    twelveHour.set(timeZone, f);
  }
  return f.format(ms);
}

/**
 * One score as a tile on its family's pastel: the value in the numeric face (the Recovery band's ink: mint, sand or
 * rose), its label in small capitals under it (or the reason there is no value), and a bar filled to where the value
 * sits on its scale.
 */
function Stat({ variant, label, m, unit }: { variant: MiniRingVariant; label: string; m: Score; unit?: string }) {
  const c = useCalm();
  const tint: CalmTint = variant === "sleep" ? "lavender" : variant === "strain" ? "peach" : "mint";
  const band = variant === "recovery" && m.value !== null ? recoveryBand(m.value) : null;
  const ink = band === "yellow" ? c.tintInk.sand : band === "red" ? c.tintInk.rose : c.tintInk[tint];
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 20, backgroundColor: c.tint[tint], padding: 12, gap: 4 }}>
      {m.value === null ? (
        <Txt size={14} lineHeight={19} weight={600} style={{ color: c.sub, minHeight: 28, textAlignVertical: "center" }}>
          {REASON[m.reason ?? "no_data"] ?? REASON.no_data}
        </Txt>
      ) : (
        <Num value={String(m.value)} unit={unit} size={24} color={ink} />
      )}
      <Caption>{label}</Caption>
      <View style={{ marginTop: 4, height: 4, overflow: "hidden", borderRadius: 2, backgroundColor: c.chip }}>
        {m.value !== null && <View style={{ height: "100%", borderRadius: 2, width: `${Math.max(0, Math.min(100, (m.value / MAX[variant]) * 100))}%`, backgroundColor: ink }} />}
      </View>
    </View>
  );
}

/** get_day's result as Pulse's own numbers, so the answer can point at them: three scores, then what moved Recovery. */
export function DayCard({ d }: { d: DayDigest }) {
  const c = useCalm();
  const movers = d.recovery.contributors
    .filter((x) => x.points !== null && Math.abs(x.points) >= 1)
    .sort((a, b) => Math.abs(b.points!) - Math.abs(a.points!))
    .slice(0, 3);
  return (
    <Surface padding={10}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Stat variant="recovery" label="Recovery" m={d.recovery} unit="%" />
        <Stat variant="sleep" label="Sleep" m={d.sleep.performance} unit="%" />
        <Stat variant="strain" label="Strain" m={d.strain} />
      </View>
      {movers.length > 0 && (
        <View style={{ paddingHorizontal: 8, paddingTop: 14, paddingBottom: 4 }}>
          <Caption>What moved Recovery</Caption>
          <View style={{ marginTop: 6 }}>
            {movers.map((x, i) => (
              <React.Fragment key={x.label}>
                {i > 0 && <Hairline />}
                {/* The points on the name's first line, if the name wraps. */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingVertical: 8 }}>
                  <Txt size={14} lineHeight={19} style={{ color: c.ink, flexShrink: 1 }}>
                    {x.label}
                  </Txt>
                  <Txt size={15} lineHeight={20} style={[font.numeric(700), { color: x.points! > 0 ? c.tintInk.mint : c.tintInk.rose }]}>
                    {`${x.points! > 0 ? "+" : "−"}${Math.abs(x.points!)} ${Math.abs(x.points!) === 1 ? "pt" : "pts"}`}
                  </Txt>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>
      )}
    </Surface>
  );
}

function BasedOn({ href, children }: { href: string; children: React.ReactNode }) {
  const c = useCalm();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(href as Href)} accessibilityRole="link" hitSlop={8} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 6, opacity: pressed ? 0.6 : 1 })}>
      <Txt size={13} lineHeight={18} weight={600} style={{ color: c.teal, flexShrink: 1 }}>
        Based on {children}
      </Txt>
      <ArrowUpRight size={15} color={c.teal} strokeWidth={2.25} />
    </Pressable>
  );
}

function EvidenceCard({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useCalm();
  return (
    <Surface padding={18}>
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, marginBottom: 6 }}>
        {title}
      </Txt>
      {children}
    </Surface>
  );
}

function Note({ children, size = 13, style }: { children: React.ReactNode; size?: 12 | 13; style?: object }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={size === 12 ? 17 : 18} style={[{ color: c.sub }, style]}>
      {children}
    </Txt>
  );
}

export function Evidence({ name, output }: { name: string; output: unknown }) {
  const router = useRouter();
  const c = useCalm();
  if (!output || typeof output !== "object") return null;
  const go = (href: string) => () => router.push(href as Href);
  if (name === "get_day") {
    const d = output as CoachOutputs["get_day"];
    return <BasedOn href={`/recovery?d=${d.day}`}>Recovery, Sleep and Strain · {d.day}</BasedOn>;
  }
  if (name === "get_trend") {
    const d = output as CoachOutputs["get_trend"];
    if (!d.points || !d.previous) return <BasedOn href="/trends">Trends</BasedOn>;
    return (
      <View style={{ gap: 8 }}>
        <EvidenceCard title={`${d.metric} · ${d.start} to ${d.end}`}>
          <KeyStatRow variant="row" label="Period average" metric={metric(d.average)} unit={d.unit ?? undefined} format="decimal1" direction="none" average={d.previous.average.value} averageLabel="Previous period" caption={`${d.observedDays} of ${d.calendarDays} days measured`} />
          <Sparkline values={d.points.map((p) => p.value)} style={{ marginTop: 8, height: 56 }} />
        </EvidenceCard>
        <BasedOn href={`/trends?metric=${encodeURIComponent(d.key)}`}>
          {d.metric} · {d.start} to {d.end}
        </BasedOn>
      </View>
    );
  }
  if (name === "get_sleep") {
    const d = output as CoachOutputs["get_sleep"];
    const debt = d.details?.find((v) => v.key === "debt");
    return (
      <View style={{ gap: 8 }}>
        <EvidenceCard title={`Sleep · ${d.day}`}>
          <Rows>
            <KeyStatRow variant="row" label="Time asleep" metric={metric(d.asleepMinutes)} unit="min" format="int" direction="none" />
            {(d.summary ?? [])
              .filter((v) => v.key === "efficiency" || v.key === "consistency")
              .map((v) => (
                <KeyStatRow key={v.key} variant="row" label={v.label} metric={metric(v)} unit={v.unit ?? undefined} format="int" average={v.baseline} direction="up" />
              ))}
            {debt && <KeyStatRow variant="row" label="Sleep debt" metric={metric(debt)} unit="min" format="int" direction="down" />}
          </Rows>
          <MetricState metric={d.planner} skeleton={null} reasonSize="sm">
            {(p) => (
              <Txt size={14} lineHeight={19} style={{ color: c.sub, marginTop: 8 }}>
                For {time(p.wakeAt, d.timeZone)} wake-up, {p.plans.map((v) => `${v.label.toLowerCase()}: ${time(v.bedtimeAt, d.timeZone)}`).join("; ")}. These are planned bedtimes.
              </Txt>
            )}
          </MetricState>
        </EvidenceCard>
        <BasedOn href={`/sleep?d=${d.day}`}>Sleep and bedtime planner · {d.day}</BasedOn>
      </View>
    );
  }
  if (name === "get_activities") {
    const d = output as CoachOutputs["get_activities"];
    if (!d.workouts) return <BasedOn href="/activities">Workouts</BasedOn>;
    return (
      <View style={{ gap: 8 }}>
        <EvidenceCard title={`Workouts · ${d.start} to ${d.end}`}>
          {d.workouts.length ? (
            <Rows>
              {d.workouts.slice(0, 5).map((v) => (
                <KeyStatRow key={v.id} variant="row" label={v.name} metric={metric(v.strain)} format="decimal1" direction="none" caption={`${v.day} · ${v.minutes} min · Strain`} onPress={go(`/activity/${encodeURIComponent(v.id)}`)} />
              ))}
            </Rows>
          ) : (
            <Note>No workouts recorded in this period.</Note>
          )}
          {d.total > 5 && (
            <Note size={12} style={{ marginTop: 8 }}>
              Showing 5 of {d.total} recorded workouts.
            </Note>
          )}
        </EvidenceCard>
        <BasedOn href="/activities">
          Recorded workouts · {d.start} to {d.end}
        </BasedOn>
      </View>
    );
  }
  if (name === "get_activity") {
    const d = output as CoachOutputs["get_activity"];
    const a = d.workout;
    if (!a) return <Note>That workout is unavailable.</Note>;
    return (
      <View style={{ gap: 8 }}>
        <EvidenceCard title={`${a.name} · ${a.day}`}>
          <Rows>
            <KeyStatRow variant="row" label="Activity strain" metric={metric(a.strain)} format="decimal1" direction="none" />
            {a.stats.slice(0, 3).map((v) => (
              <KeyStatRow key={v.label} variant="row" label={v.label} metric={metric(v)} unit={v.unit ?? undefined} format="decimal1" average={v.baseline} direction="none" />
            ))}
          </Rows>
          <ZoneBars variant="rows" data={a.zones} note={a.zoneNote ?? undefined} />
        </EvidenceCard>
        <BasedOn href={`/activity/${encodeURIComponent(a.id)}`}>
          {a.name} · {a.day}
        </BasedOn>
      </View>
    );
  }
  if (name === "get_journal_impacts") {
    const d = output as CoachOutputs["get_journal_impacts"];
    return (
      <View style={{ gap: 8 }}>
        <EvidenceCard title={`Habit associations · ${d.outcome}`}>
          <Note size={12}>Differences in next-day averages, not proof of cause.</Note>
          {(d.effects ?? []).slice(0, 3).map((v) => (
            <View key={v.behaviour}>
              <KeyStatRow variant="row" label={v.behaviour} metric={metric({ value: v.delta })} unit={d.unit} format="signed1" direction="none" caption={`${v.yesDays} days with, ${v.noDays} without`} />
              {v.confidenceInterval && (
                <Note size={12} style={{ paddingBottom: 8 }}>
                  90% interval: {v.confidenceInterval.map((n) => n.toFixed(1)).join(" to ")} {d.unit}
                  {v.effect === "none" ? ". No clear association." : "."}
                </Note>
              )}
            </View>
          ))}
          {!d.effects?.length && <Note style={{ marginTop: 8 }}>Not enough check-ins to compare habits yet.</Note>}
        </EvidenceCard>
        <BasedOn href="/journal/insights">Behaviour insights</BasedOn>
      </View>
    );
  }
  if (name === "get_health") {
    const d = output as CoachOutputs["get_health"];
    return (
      <View style={{ gap: 8 }}>
        <EvidenceCard title={`Health Monitor · ${d.day}`}>
          {(d.vitals ?? []).map((v) => (
            <KeyStatRow key={v.vital} variant="row" label={v.vital} metric={metric(v)} unit={v.unit} format="decimal1" direction="none" caption={String(v.status).split("_").join(" ")} />
          ))}
        </EvidenceCard>
        <BasedOn href={`/health/monitor?d=${d.day}`}>Health Monitor · {d.day}</BasedOn>
      </View>
    );
  }
  if (name === "get_report") {
    const d = output as CoachOutputs["get_report"];
    if (!("scores" in d) || !d.scores) return <Note>No report available yet.</Note>;
    return (
      <View style={{ gap: 8 }}>
        <EvidenceCard title={`Report · ${d.start} to ${d.end}${d.partial ? " · Partial" : ""}`}>
          {d.scores.map((v) => (
            <KeyStatRow key={v.score} variant="row" label={v.score} metric={metric(v)} format="decimal1" direction="none" />
          ))}
        </EvidenceCard>
        <BasedOn href={d.period ? `/reports/${encodeURIComponent(d.period)}` : "/reports"}>
          Report · {d.start} to {d.end}
        </BasedOn>
      </View>
    );
  }
  if (name === "get_profile") return <BasedOn href={PROFILE_HREF}>Your profile</BasedOn>;
  return null;
}
