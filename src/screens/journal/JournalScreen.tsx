// Journal `/journal?d=` (spec §7.11, journey 7), ported from the web's src/app/(app)/journal/page.tsx and its
// loading.tsx, in the iOS look: the large title with the day under it, Fitness's day strip, then Log, Check-in,
// Insights and History, each under a small capital header, top to bottom as on a phone. The sections rise into place as
// the journal opens (home/rise.tsx); History is an inset grouped list.
//
// The shell is the kit's PageShell (the floating bar, the large title with the day under it) rebuilt in place, for the
// ScrollView's ref: a History row scrolls back to the top, as the web's link does.
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, CircleAlert, Sparkles } from "lucide-react-native";
import { DAY, dayLabel, formatDay } from "@/lib/format";
import { useDay } from "@/lib/day";
import { getJournal } from "@/queries/journal";
import { getLog } from "@/queries/log";
import type { JournalVM } from "@/queries/types";
import { useApp, useQuery } from "@/state/app";
import { DateSwitcher, EmptyState, Skeleton, SkeletonText, TitleHeader, Txt } from "@/ui";
import { PillAction } from "@/ui/components/CalmSurface";
import { LargeTitle, useBarInset } from "@/ui/components/DetailHeader";
import { usePress, usePressStyle } from "@/ui/components/press";
import { RevealScroll, useRevealScroll } from "@/ui/motion/Rise";
import { GlassTarget } from "@/ui/glass";
import { font } from "@/ui/fonts";
import { useBottomClearance } from "@/ui/components/PageShell";
import { HomeCard } from "@/screens/home/controls";
import { Rise } from "@/screens/home/rise";
import { CalmButton, LIST_RADIUS, SectionLabel, Sentence, Surface, useCalm } from "../settings/calmKit";
import { CheckIn } from "./CheckInSheet";
import { TagBadge } from "./controls";
import { DayStrip, DayStripSkeleton } from "./DayStrip";
import { Log, LogSkeleton } from "./Log";
import { openCheckIn, useJournalVersion } from "./state";

/** History rows before "Show 30 days": a week. The day strip above already reaches every day of the last three weeks. */
const RECENT = 7;

const PressableView = Animated.createAnimatedComponent(Pressable);

/** A section: a small capital header (with a blue link on the right), then its body. */
function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  return (
    <View style={{ minWidth: 0, gap: 8 }}>
      <SectionLabel right={action ? <PillAction label={action.label} onPress={action.onPress} /> : undefined} style={{ minHeight: action ? 32 : 18, alignItems: "center" }}>
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
  const { setRef: setScrollRef, y: scrollY } = useRevealScroll(scroll);
  const top = useBarInset();
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
        <Rise index={1}>
          <Section title="Log">{log.data ? <Log vm={log.data} /> : <LogSkeleton />}</Section>
        </Rise>

        <Rise index={2}>
          <Section title="Check-in">{vm ? <CheckIn dayLabel={formatDay(d, DAY.short)} day={d} checkIn={vm.checkIn} /> : <CheckInSkeleton />}</Section>
        </Rise>

        <Rise index={3}>
          <Section title="Insights" action={{ label: "See all", onPress: goInsights }}>
            {vm ? (
              <HomeCard tint="lavender" icon={Sparkles} title="Behaviour insights" subtitle={vm.teaser.text} gap={10}>
                {vm.teaser.ready && (
                  <View style={{ alignSelf: "flex-start" }}>
                    <PillAction label="See all insights" onPress={goInsights} />
                  </View>
                )}
              </HomeCard>
            ) : (
              <InsightSkeleton />
            )}
          </Section>
        </Rise>

        <Rise index={4}>
          <Section title="History">
            {!vm ? (
              <HistorySkeleton />
            ) : vm.history.length ? (
              <View style={{ borderRadius: LIST_RADIUS, backgroundColor: c.card, overflow: "hidden" }}>
                {(allHistory ? vm.history : vm.history.slice(0, RECENT)).map((h, i) => (
                  <React.Fragment key={h.day}>
                    {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: c.line }} />}
                    <HistoryRow h={h} current={h.day === d} today={today} onPress={() => pickHistory(h.day)} />
                  </React.Fragment>
                ))}
                {vm.history.length > RECENT && (
                  <>
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />
                    <CalmButton variant="quiet" size="md" onPress={() => setAllHistory((x) => !x)} style={{ alignSelf: "stretch", borderRadius: 0 }}>
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
        </Rise>
      </>
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      {/* Every frame's offset reaches the UI thread: the floating bar's inline title and scroll edge follow it. The page
          is the glass's backdrop for the bar's round back button. Off the tab bar (it opens from Today and the check-in),
          back goes to where it was opened from, or Today. */}
      <GlassTarget style={{ flex: 1 }} overlay={<TitleHeader title="Journal" onBack={() => (router.canGoBack() ? router.back() : router.navigate("/" as Href))} scrollY={scrollY} />}>
        <Animated.ScrollView ref={setScrollRef} scrollEventThrottle={16} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: top, paddingBottom: clearance }}>
          <LargeTitle title="Journal" eyebrow={formatDay(d, DAY.long)} y={scrollY}>
            <DateSwitcher mode="day" date={d} today={today} firstDay={app.sync.firstDay} onChange={setDay} loading={!!q.data && !vm} />
          </LargeTitle>
          <RevealScroll.Provider value={scrollY}>
            <View style={{ gap: 26 }}>
              {/* Full-bleed: the strip scrolls edge to edge, its first day keeps the 16 px gutter inside. */}
              <Rise index={0}>{strip ? <DayStrip days={strip.map((s) => ({ date: s.day, done: s.done }))} value={d} today={today} onChange={setDay} /> : <DayStripSkeleton />}</Rise>
              {body}
            </View>
          </RevealScroll.Provider>
        </Animated.ScrollView>
      </GlassTarget>
    </View>
  );
}

/** A behaviour badge's height (TagBadge): a day with none keeps the line as tall. */
const BADGE_H = 26;
/** A History row's band: the date (21), the gap and the badges' first line. */
const HISTORY_BAND = 21 + 6 + BADGE_H;

/** One History day, an iOS row: the date (blue for the day shown), the day's behaviours under it (two, then a count), the chevron. */
function HistoryRow({ h, current, today, onPress }: { h: JournalVM["history"][number]; current: boolean; today: string; onPress: () => void }) {
  const c = useCalm();
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { dim: 0.55 });
  const shown = h.yes.slice(0, 2); // two tags, then how many more
  const more = h.yes.length - shown.length;
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="link"
      accessibilityState={{ selected: current }}
      accessibilityLabel={`${dayLabel(h.day, today)}: ${h.yes.length ? h.yes.join(", ") : "no behaviours"}`}
      style={[{ minHeight: 60, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 11 }, pressed]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Txt size={16} lineHeight={21} weight={current ? 600 : 400} style={{ color: current ? c.teal : c.ink, fontVariant: ["tabular-nums"] }}>
          {dayLabel(h.day, today)}
        </Txt>
        {/* The badges' line, or the same height of words, so every day's row is as tall. */}
        {h.yes.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            {shown.map((y) => (
              <TagBadge key={y}>{y}</TagBadge>
            ))}
            {more > 0 && (
              <Txt size={15} lineHeight={20} style={[font.numeric(600), { color: c.sub }]}>
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
      <ChevronRight size={18} color={c.tertiary} strokeWidth={2.4} style={{ marginTop: (HISTORY_BAND - 18) / 2 }} />
    </PressableView>
  );
}

/** The check-in card's loading shape: its head, two lines of copy and the button's capsule. */
function CheckInSkeleton() {
  return (
    <Surface gap={14}>
      <SkeletonText role="body" width="45%" />
      <SkeletonText role="body" width="80%" />
      <Skeleton radius={25} style={{ height: 50 }} />
    </Surface>
  );
}

/** The insight card's loading shape: its head, two lines and the link. */
function InsightSkeleton() {
  return (
    <Surface gap={10}>
      <SkeletonText role="body" width="55%" />
      <SkeletonText role="body" />
      <SkeletonText role="label" width={144} />
    </Surface>
  );
}

/** A week of History rows. */
function HistorySkeleton() {
  const c = useCalm();
  return (
    <View style={{ borderRadius: LIST_RADIUS, backgroundColor: c.card, overflow: "hidden" }}>
      {Array.from({ length: RECENT }, (_, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: c.line }} />}
          <View style={{ minHeight: 60, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 11 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonText size={16} lineHeight={21} width={96} />
              <Skeleton radius={13} style={{ height: BADGE_H, width: 120 }} />
            </View>
            <ChevronRight size={18} color={c.tertiary} strokeWidth={2.4} style={{ marginTop: (HISTORY_BAND - 18) / 2 }} />
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
