// Journal `/journal?d=` (spec §7.11, journey 7), ported from the web's src/app/(app)/journal/page.tsx and its
// loading.tsx: the day strip, then Log, Check-in, Insights and History, top to bottom as on a phone.
//
// The shell is the kit's PageShell (title header with the date pill) rebuilt in place, for the ScrollView's ref: a
// History row scrolls back to the top, as the web's link does.
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, CircleAlert, Sparkles } from "lucide-react-native";
import { DAY, dayLabel, formatDay } from "@/lib/format";
import { useDay } from "@/lib/day";
import { getJournal } from "@/queries/journal";
import { getLog } from "@/queries/log";
import type { JournalVM } from "@/queries/types";
import { useApp, useQuery } from "@/state/app";
import { EmptyState, Ground, Skeleton, SkeletonText, TitleHeader, Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { QUIET_SCROLL, useBottomClearance } from "@/ui/components/PageShell";
import { CalmButton, CalmCard, Hairline, SectionLabel, Sentence, Surface, useCalm } from "../settings/calmKit";
import { CheckIn } from "./CheckInSheet";
import { TagBadge } from "./controls";
import { DayStrip, DayStripSkeleton } from "./DayStrip";
import { Log, LogSkeleton } from "./Log";
import { openCheckIn, useJournalVersion } from "./state";

/** History rows before "Show 30 days": a week. The day strip above already reaches every day of the last three weeks. */
const RECENT = 7;

/** A section: a small spaced-caps header (with a teal link on the right), then its body. */
function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  const c = useCalm();
  return (
    <View style={{ minWidth: 0, gap: 12 }}>
      <SectionLabel
        right={
          action ? (
            <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, opacity: pressed ? 0.6 : 1 })}>
              <Txt size={14} lineHeight={18} weight={600} style={{ color: c.teal }}>
                {action.label}
              </Txt>
              <ChevronRight size={16} color={c.teal} strokeWidth={2.25} />
            </Pressable>
          ) : undefined
        }
      >
        {title}
      </SectionLabel>
      {children}
    </View>
  );
}

export default function JournalScreen() {
  const app = useApp();
  const router = useRouter();
  const c = useCalm();
  const clearance = useBottomClearance("tabs");
  const { d, today } = useDay();
  const version = useJournalVersion();
  const scroll = React.useRef<ScrollView>(null);
  const [allHistory, setAllHistory] = React.useState(false);
  const q = useQuery((ctx) => getJournal(d, ctx), [d, version]);
  const log = useQuery((ctx) => getLog(ctx, { demo: app.source === "demo" }), [version, app.source]);
  // useQuery keeps the last day's data while the next loads: never show it as this day's.
  const vm = q.data?.day === d ? q.data : undefined;
  // The strip doesn't depend on the day (beyond reaching back to it), so the last one stays while the next loads.
  const strip = q.data && q.data.strip.length && q.data.strip[0].day <= d ? q.data.strip : null;

  const setDay = React.useCallback((day: string) => router.setParams({ d: day === today ? undefined : day }), [router, today]);
  const goInsights = () => router.push("/journal/insights" as Href);
  const pickHistory = (day: string) => {
    setDay(day);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  let body: React.ReactNode;
  if (q.error && !vm) body = <EmptyState icon={CircleAlert} body="Couldn’t load this screen." action={{ label: "Try again", onPress: () => void app.refresh() }} />;
  else
    body = (
      <>
        {/* Log first: a drink or a weigh-in is a two-tap job, the check-in an evening one (spec §11 LG1). */}
        <Section title="Log">{log.data ? <Log vm={log.data} /> : <LogSkeleton />}</Section>

        <Section title="Check-in">{vm ? <CheckIn dayLabel={formatDay(d, DAY.short)} day={d} checkIn={vm.checkIn} /> : <CheckInSkeleton />}</Section>

        <Section title="Insights" action={{ label: "See all", onPress: goInsights }}>
          {vm ? (
            <CalmCard tint="lavender" icon={Sparkles} title="Behaviour insights" subtitle={vm.teaser.text} gap={14}>
              {vm.teaser.ready && (
                <Pressable onPress={goInsights} accessibilityRole="button" hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }} style={({ pressed }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}>
                  <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal }}>
                    See all insights
                  </Txt>
                  <ChevronRight size={18} color={c.teal} strokeWidth={2.25} />
                </Pressable>
              )}
            </CalmCard>
          ) : (
            <InsightSkeleton />
          )}
        </Section>

        <Section title="History">
          {!vm ? (
            <HistorySkeleton />
          ) : vm.history.length ? (
            <View style={{ borderRadius: 32, borderWidth: 1, borderColor: c.edge, backgroundColor: c.card, ...(c.shadow ? { boxShadow: c.shadow } : null), overflow: "hidden", paddingVertical: 4 }}>
              {(allHistory ? vm.history : vm.history.slice(0, RECENT)).map((h, i) => (
                <React.Fragment key={h.day}>
                  {i > 0 && <Hairline inset={16} />}
                  <HistoryRow h={h} current={h.day === d} today={today} onPress={() => pickHistory(h.day)} />
                </React.Fragment>
              ))}
              {vm.history.length > RECENT && (
                <>
                  <Hairline />
                  <CalmButton variant="quiet" size="md" onPress={() => setAllHistory((x) => !x)} style={{ alignSelf: "stretch" }}>
                    {allHistory ? "Show last week" : "Show 30 days"}
                  </CalmButton>
                </>
              )}
            </View>
          ) : (
            <Surface gap={14} style={{ alignItems: "center" }}>
              <Sentence align="center" style={{ maxWidth: 300 }}>
                No check-ins yet. Your first one takes under a minute.
              </Sentence>
              <CalmButton size="md" onPress={() => openCheckIn(d)}>
                Check in
              </CalmButton>
            </Surface>
          )}
        </Section>
      </>
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <Ground />
      <TitleHeader
        title="Journal"
        // Off the tab bar (it opens from Today and the check-in): back to where it was opened from, or Today.
        onBack={() => (router.canGoBack() ? router.back() : router.navigate("/" as Href))}
        dateSwitcher={{ mode: "day", date: d, today, firstDay: app.sync.firstDay, onChange: setDay, loading: !!q.data && !vm }}
      />
      <ScrollView
        ref={scroll}
        scrollEventThrottle={QUIET_SCROLL}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: clearance }}
      >
        <View style={{ gap: 28 }}>
          {/* Full-bleed: the strip scrolls edge to edge, its first pill keeps the 16 px gutter inside. */}
          {strip ? <DayStrip days={strip.map((s) => ({ date: s.day, done: s.done }))} value={d} onChange={setDay} /> : <DayStripSkeleton />}
          {body}
        </View>
      </ScrollView>
    </View>
  );
}

/** A behaviour badge's height (TagBadge): a day with none keeps the line as tall. */
const BADGE_H = 28;
/** A History row's band: the date (21), the gap and the badges' first line. */
const HISTORY_BAND = 21 + 8 + BADGE_H;

/** One History day: the date, the day's behaviours under it (two, then a count), a chevron; the day shown in teal. */
function HistoryRow({ h, current, today, onPress }: { h: JournalVM["history"][number]; current: boolean; today: string; onPress: () => void }) {
  const c = useCalm();
  const shown = h.yes.slice(0, 2); // two tags, then how many more
  const more = h.yes.length - shown.length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: current }}
      accessibilityLabel={`${dayLabel(h.day, today)}: ${h.yes.length ? h.yes.join(", ") : "no behaviours"}`}
      style={({ pressed }) => ({ minHeight: 60, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? c.ground : "transparent" })}
    >
      {current && <View style={{ position: "absolute", left: 0, top: 14, bottom: 14, width: 4, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: c.teal }} />}
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: current ? c.teal : c.ink, fontVariant: ["tabular-nums"] }}>
          {dayLabel(h.day, today)}
        </Txt>
        {/* The badges' line, or the same height of words, so every day's row is as tall. */}
        {h.yes.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            {shown.map((y) => (
              <TagBadge key={y}>{y}</TagBadge>
            ))}
            {more > 0 && (
              <Txt size={15} lineHeight={20} style={[font.numeric(700), { color: c.sub }]}>
                {`+${more}`}
              </Txt>
            )}
          </View>
        ) : (
          <View style={{ minHeight: BADGE_H, justifyContent: "center" }}>
            <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
              No behaviours
            </Txt>
          </View>
        )}
      </View>
      {/* Centred on the date and the badges' first line, wherever more badges wrap. */}
      <ChevronRight size={20} color={c.label} strokeWidth={1.5} style={{ marginTop: (HISTORY_BAND - 20) / 2 }} />
    </Pressable>
  );
}

/** The check-in card's loading shape: its head, two lines of copy and the button's pill. */
function CheckInSkeleton() {
  return (
    <Surface gap={16}>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Skeleton radius={14} style={{ width: 44, height: 44 }} />
        <View style={{ flex: 1 }}>
          <SkeletonText role="body" width="50%" />
          <SkeletonText role="body" width="80%" />
        </View>
      </View>
      <Skeleton radius={26} style={{ height: 52 }} />
    </Surface>
  );
}

/** The insight card's loading shape: its head, two lines and the link. */
function InsightSkeleton() {
  return (
    <Surface tint="lavender" gap={14}>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Skeleton radius={14} style={{ width: 44, height: 44 }} />
        <View style={{ flex: 1 }}>
          <SkeletonText role="body" width="60%" />
          <SkeletonText role="body" />
        </View>
      </View>
      <SkeletonText role="label" width={144} />
    </Surface>
  );
}

/** A week of History rows. */
function HistorySkeleton() {
  const c = useCalm();
  return (
    <View style={{ borderRadius: 32, borderWidth: 1, borderColor: c.edge, backgroundColor: c.card, ...(c.shadow ? { boxShadow: c.shadow } : null), overflow: "hidden", paddingVertical: 4 }}>
      {Array.from({ length: RECENT }, (_, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Hairline inset={16} />}
          <View style={{ minHeight: 60, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonText size={16} lineHeight={21} width={96} />
              <Skeleton radius={14} style={{ height: BADGE_H, width: 120 }} />
            </View>
            <ChevronRight size={20} color={c.label} strokeWidth={1.5} style={{ marginTop: (HISTORY_BAND - 20) / 2 }} />
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
