// Home in the Calm style: a soft off-white ground, the day's three scores as pastel cards (each number rolling into
// place, its bar growing in) beside a live heart tile, then "Your week" (Sleep with its week of nights against the goal, Recovery with its vitals and week,
// Strain on a half gauge, one at a time under a segmented control) and the vitals row (Health Monitor and Stress).
// Every number keeps its unit small beside it.
import * as React from "react";
import { useRouter, type Href } from "expo-router";
import { Pressable, View } from "react-native";
import { BatteryCharging, ChevronRight, Flame, HeartPulse, Moon } from "lucide-react-native";
import { recoveryBand } from "@/lib/bands";
import { formatDay, formatValue, MISSING } from "@/lib/format";
import { reasonCopy } from "@/lib/reasons";
import { getTrends, type HomeVM, type KeyStat } from "@/queries";
import { useApp, useQuery, useLiveHr } from "@/state/app";
import { DateSwitcher, SyncStatus, Txt, type DateSwitcherProps, type SyncShellStatus } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { CapsuleMeter } from "@/ui/components/CapsuleMeter";
import { RollingNumber } from "@/ui/components/Halo";
import { GrowIn } from "@/ui/motion/Rise";
import { BandHero } from "@/ui/components/BandHero";
import { CalmSurface, PillAction } from "@/ui/components/CalmSurface";
import { StreakFlame, UserAvatar } from "@/ui/components/HomeHeader";
import { GoLiveButton, GoLiveSheet, StopLiveButton } from "@/screens/settings/liveHr";
import { ACTIVITY_TAB, HEALTH_TAB, SLEEP_TAB } from "./tabs";
import { chartHref } from "@/screens/chart/href";
import { showsLive, useLiveBle } from "@/state/liveBle";
import { font, TABULAR } from "@/ui/fonts";

type Go = { at: (p: string) => string; go: (h: string) => void };

/** "06h 11m". */
const hm = (min: number | null | undefined) => {
  if (min == null || !Number.isFinite(min)) return null;
  const m = Math.round(min);
  return { h: String(Math.floor(m / 60)).padStart(2, "0"), m: String(m % 60).padStart(2, "0") };
};

/**
 * A number with its unit beside it, sharing the baseline. Numbers are set apart from words: the numeric face (Barlow,
 * bold, tabular) in the number's colour, the unit small and grey in the text face, so "43 ms" reads as a value with a
 * unit, never as a phrase.
 */
function Num({ value, unit, size, color }: { value: string; unit?: string; size: number; color?: string; weight?: 500 | 600 | 700 }) {
  const c = useCalm();
  const ink = color ?? c.ink;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
      <Txt size={size} lineHeight={Math.round(size * 1.12)} style={[font.numberAt(size), { color: ink }]} numberOfLines={1}>
        {value}
      </Txt>
      {unit ? (
        <Txt size={Math.max(12, Math.round(size * 0.42))} lineHeight={Math.round(size * 0.6)} weight={500} style={{ color: c.sub, marginLeft: 4 }}>
          {unit}
        </Txt>
      ) : null}
    </View>
  );
}

/** The small grey caption under a number: capitals with air between letters, never mistaken for the value; wraps, never cut. */
function Caption({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={11} lineHeight={15} weight={600} style={{ color: c.faint, letterSpacing: 1.4, marginTop: 4 }}>
      {children.toUpperCase()}
    </Txt>
  );
}

/** "06h 11m" as a Num pair. */
function Duration({ min, size, color }: { min: number | null | undefined; size: number; color?: string }) {
  const t = hm(min);
  if (!t) return <Num value={MISSING} size={size} color={color} />;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
      <Num value={t.h} unit="h" size={size} color={color} />
      <Num value={t.m} unit="m" size={size} color={color} />
    </View>
  );
}

// ── Top bar ──────────────────────────────────────────────────────────────────

export function CalmTopBar({
  dateSwitcher,
  sync,
  streak,
  onAvatar,
}: {
  dateSwitcher: DateSwitcherProps;
  sync: { status: SyncShellStatus; now: number | null; onPress?: () => void };
  streak: { days: number } | null;
  onAvatar: () => void;
}) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 }}>
      <Pressable onPress={onAvatar} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={6} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.card, borderWidth: 1, borderColor: c.edge, alignItems: "center", justifyContent: "center", ...(c.shadow ? { boxShadow: c.shadow } : null) }}>
        <UserAvatar src={null} size={30} />
      </Pressable>
      {streak && streak.days > 0 ? (
        <View accessibilityLabel={`${streak.days}-day streak`} style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.edge }}>
          <StreakFlame u={0.56} />
          <Txt size={14} lineHeight={18} weight={600} style={[TABULAR, { color: c.ink }]}>
            {streak.days}
          </Txt>
        </View>
      ) : null}
      <View style={{ flex: 1, alignItems: "center" }}>
        <DateSwitcher {...dateSwitcher} narrow style={{ backgroundColor: c.card, height: 40, borderRadius: 20, paddingHorizontal: 4, borderWidth: 1, borderColor: c.edge }} />
      </View>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.card, borderWidth: 1, borderColor: c.edge, alignItems: "center", justifyContent: "center", ...(c.shadow ? { boxShadow: c.shadow } : null) }}>
        <SyncStatus status={sync.status} now={sync.now} onPress={sync.onPress} hideText />
      </View>
    </View>
  );
}

// ── Hero: the day's scores and the live heart ───────────────────────────────

/**
 * One of the day's three scores as its own small pastel card, so the three never run together: a round icon and the
 * score's name, the number large in the family's ink rolling into place, and a bar of how full the score is growing
 * in with it. `order` staggers the three, so they land one after another; each breathes a slow light.
 */
function ScoreCard({ tint, icon: Icon, label, value, unit, fill, spoken, onPress, order }: { tint: CalmTint; icon: typeof Moon; label: string; value: string; unit?: string; fill: number | null; spoken: string; onPress: () => void; order: number }) {
  const c = useCalm();
  const ink = c.tintInk[tint];
  const empty = value === MISSING;
  return (
    <CalmSurface tint={tint} onPress={onPress} accessibilityLabel={spoken} padding={12} radius={22} gap={6} breathe>
      {/* The name on the round icon's line; at a large text size it wraps under itself rather than being cut. */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} color={ink} strokeWidth={2.25} />
        </View>
        <Txt size={11} lineHeight={14} weight={600} style={{ color: c.sub, letterSpacing: 1.2, flexShrink: 1, marginTop: (24 - 14) / 2 }}>
          {label.toUpperCase()}
        </Txt>
      </View>
      <View importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "flex-end" }}>
        {empty ? (
          <Txt size={30} lineHeight={34} style={[font.numberAt(30), { color: c.faint }]}>
            {value}
          </Txt>
        ) : (
          <RollingNumber text={value} lineHeight={34} delay={order * 120} style={[font.numberAt(30), { color: ink, letterSpacing: -0.5 }]} />
        )}
        {unit && !empty ? (
          <Txt size={13} lineHeight={17} weight={500} style={{ color: c.sub, marginLeft: unit === "%" ? 1 : 4, marginBottom: 4 }}>
            {unit}
          </Txt>
        ) : null}
      </View>
      <CapsuleMeter frac={fill === null ? null : Math.max(0.04, Math.min(1, fill))} color={ink} height={6} track={c.card} grow />
    </CalmSurface>
  );
}

const TILE_W = 160;

/** The live pulse (a halo ring beating at your heart rate over a heartbeat line), with the newest heart rate laid over it: live over Bluetooth when streaming, else Health Connect's latest. */
function BandTile({ height, today, onPress }: { height: number; today: boolean; onPress: () => void }) {
  const c = useCalm();
  const { liveHr } = useLiveHr();
  const live = useLiveBle();
  const streaming = showsLive(live);
  const bpm = streaming ? live.bpm : (liveHr.latest?.bpm ?? null);
  const [sheet, setSheet] = React.useState(false);
  const [tileH, setTileH] = React.useState(0);
  // Against the last refresh (once a minute), so render stays pure.
  const ago = liveHr.latest && liveHr.updatedAt ? Math.max(0, Math.round((liveHr.updatedAt / 1000 - liveHr.latest.ts) / 60)) : null;
  const when = streaming ? "Live" : ago === null ? "No reading yet" : ago < 1 ? "Just now" : `${ago} min ago`;
  // Today the heart rate sits at the tile's foot; the band is centred in what's above it.
  const PILL = today ? 66 : 0;
  return (
    <View style={{ width: TILE_W, height, gap: 10 }}>
      <View style={{ flex: 1 }} onLayout={(e) => setTileH(Math.round(e.nativeEvent.layout.height))}>
        {tileH > 0 && (
          <BandHero width={TILE_W} height={tileH} footer={PILL} bpm={bpm}>
            {today && (
              // The newest heart rate on the tile: tap for the heart-rate screen.
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={bpm ? `Heart rate ${bpm} beats per minute, ${when}` : "Heart rate"}
                style={({ pressed }) => ({ position: "absolute", left: 8, right: 8, bottom: 8, borderRadius: 20, backgroundColor: c.card, paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.85 : 1, boxShadow: "0 2px 10px rgba(17,24,39,0.08)" })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <HeartPulse size={18} color={c.tintInk.rose} strokeWidth={2} />
                  <Num value={bpm ? String(bpm) : MISSING} unit="bpm" size={22} />
                </View>
                <Txt size={12} lineHeight={16} numberOfLines={1} style={{ color: streaming ? c.tintInk.mint : c.sub }}>
                  {streaming ? "Live from your band" : when}
                </Txt>
              </Pressable>
            )}
          </BandHero>
        )}
      </View>
      {today && !streaming && <GoLiveButton onPress={() => setSheet(true)} style={{ alignSelf: "center" }} />}
      {today && streaming && <StopLiveButton style={{ alignSelf: "center" }} />}
      {today && <GoLiveSheet open={sheet} onClose={() => setSheet(false)} />}
    </View>
  );
}

export function CalmHero({ vm, at, go }: { vm: HomeVM } & Go) {
  const c = useCalm();
  const { dials } = vm;
  const recovery = dials.recovery.value;
  const sleep = dials.sleep.value;
  const strain = dials.strain.value;
  const band = recovery === null ? null : recoveryBand(recovery);
  // Recovery's card takes its band's pastel: mint when ready, sand in the middle, rose when low.
  const recoveryTint: CalmTint = band === "yellow" ? "sand" : band === "red" ? "rose" : "mint";
  // The band's tile matches the three cards' height, whatever the font size makes it.
  const [colH, setColH] = React.useState(300);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <View onLayout={(e) => setColH(Math.round(e.nativeEvent.layout.height))} style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <ScoreCard
            tint={recoveryTint}
            icon={BatteryCharging}
            label="Recovery"
            value={recovery === null ? MISSING : formatValue("int", recovery)}
            unit={recovery === null ? undefined : "%"}
            fill={recovery === null ? null : recovery / 100}
            order={0}
            spoken={recovery === null ? "Recovery, no score" : `Recovery ${formatValue("int", recovery)} percent`}
            onPress={() => go(HEALTH_TAB)}
          />
          <ScoreCard
            tint="lavender"
            icon={Moon}
            label="Sleep"
            value={sleep === null ? MISSING : formatValue("int", sleep)}
            unit={sleep === null ? undefined : "%"}
            fill={sleep === null ? null : sleep / 100}
            order={1}
            spoken={sleep === null ? "Sleep, no score" : `Sleep ${formatValue("int", sleep)} percent`}
            onPress={() => go(at(SLEEP_TAB))}
          />
          <ScoreCard
            tint="peach"
            icon={Flame}
            label="Strain"
            value={strain === null ? MISSING : formatValue("decimal1", strain)}
            unit={strain !== null && dials.soFar ? "so far" : undefined}
            fill={strain === null ? null : strain / 21}
            order={2}
            spoken={strain === null ? "Strain, no score" : `Strain ${formatValue("decimal1", strain)}${dials.soFar ? " so far" : ""}`}
            onPress={() => go(at(ACTIVITY_TAB))}
          />
        </View>
        <BandTile height={colH} today={vm.isToday} onPress={() => go("/health/heart-rate")} />
      </View>
      {/* Why a score is missing, as the dials' reason line said it ("Waiting for last night's sleep to sync"). */}
      {dials.reason && (
        <Txt size={14} lineHeight={19} style={{ color: c.sub }}>
          {reasonCopy(dials.reason.reason, dials.reason.nightsLeft).long}
        </Txt>
      )}
      <Pressable onPress={() => go("/trends")} accessibilityRole="link" hitSlop={8} style={({ pressed }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}>
        <Txt size={16} lineHeight={20} weight={600} style={{ color: c.teal }}>
          See data
        </Txt>
        <ChevronRight size={18} color={c.teal} strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}

// ── Week cards: Sleep (the Sleep tab) and Recovery (the Health tab) ─────────

/** The week of nights against the goal, as lollipops: the shown night in orange with the Moon. */
function SleepWeek({ week, goalMin }: { week: { day: string; value: number | null }[]; goalMin: number }) {
  const c = useCalm();
  const H = 140;
  const max = Math.max(goalMin * 1.15, ...week.map((p) => p.value ?? 0));
  const y = (min: number) => H - (min / max) * H;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ height: H + 12, marginTop: 6 }}>
        {/* The goal: a dashed line with its label. */}
        <View style={{ position: "absolute", left: 0, right: 0, top: y(goalMin) + 6, height: 0, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: c.ink, opacity: 0.55 }} />
        <View style={{ position: "absolute", left: 0, top: y(goalMin) - 7, height: 26, paddingHorizontal: 10, borderRadius: 8, backgroundColor: c.ink, justifyContent: "center" }}>
          <Txt size={13} lineHeight={16} weight={600} style={{ color: c.card }}>{`Goal ${Math.round(goalMin / 60)}h`}</Txt>
        </View>
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingLeft: 92 }}>
          {week.map((p, i) => {
            const last = i === week.length - 1;
            const v = p.value ?? 0;
            const top = p.value == null ? H : y(v);
            return (
              <View key={p.day} style={{ width: 28, height: H + 12, alignItems: "center" }}>
                {p.value != null ? (
                  <>
                    <View style={{ position: "absolute", top: top + 6, bottom: 0, width: 2, backgroundColor: last ? c.orange : c.ink, opacity: last ? 1 : 0.85 }} />
                    {last ? (
                      <View style={{ position: "absolute", top: top - 8, width: 30, height: 30, borderRadius: 15, backgroundColor: c.orange, alignItems: "center", justifyContent: "center" }}>
                        <Moon size={15} color="#ffffff" strokeWidth={2.25} />
                      </View>
                    ) : (
                      <View style={{ position: "absolute", top: top, width: 12, height: 12, borderRadius: 6, backgroundColor: c.ink }} />
                    )}
                  </>
                ) : (
                  // A night with no sleep: a short stub in the lavender's edge, so it shows on the card's pastel.
                  <View style={{ position: "absolute", bottom: 0, height: 24, width: 2, backgroundColor: c.tintEdge.lavender }} />
                )}
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ height: 1.5, backgroundColor: c.ink, opacity: 0.8 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingLeft: 92 }}>
        {week.map((p) => (
          <View key={p.day} style={{ width: 28, alignItems: "center" }}>
            <Txt size={12} lineHeight={16} style={{ color: c.sub }}>
              {formatDay(p.day, { weekday: "short" }).slice(0, 2)}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A small number with its caps label; with `onPress`, a button to that number's own history. */
function MiniStat({ value, unit, label, color, onPress }: { value: string; unit?: string; label: string; color?: string; onPress?: () => void }) {
  const body = (
    <>
      <Num value={value} unit={unit} size={24} color={color} />
      <Caption>{label}</Caption>
    </>
  );
  if (!onPress) return <View style={{ flex: 1, minWidth: 0 }}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ""}. Opens its history`} hitSlop={6} style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}

const statText = (s: KeyStat | undefined, fmt: "int" | "decimal1" = "int") => (s?.metric.value == null ? MISSING : formatValue(fmt, s.metric.value));

/**
 * The last seven mornings' Recovery as labelled columns: each day's score on top of its column, in its band's colour
 * (mint ready, sand steady, rose low), the weekday under it, the shown day at full strength and the rest a little lighter.
 */
function RecoveryWeek({ week, shown }: { week: { day: string; recovery: number | null }[]; shown: string }) {
  const c = useCalm();
  const H = 76;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
      {week.map((p) => {
        const v = p.recovery;
        const band = v === null ? null : recoveryBand(v);
        const ink = band === "green" ? c.tintInk.mint : band === "yellow" ? c.tintInk.sand : band === "red" ? c.tintInk.rose : c.faint;
        const here = p.day === shown;
        return (
          <View key={p.day} style={{ width: 34, alignItems: "center", gap: 4 }}>
            <Txt size={12} lineHeight={15} style={[font.numeric(700), { color: v === null ? c.faint : ink }]}>
              {v === null ? MISSING : formatValue("int", v)}
            </Txt>
            <View style={{ height: H, justifyContent: "flex-end" }}>
              <View style={{ width: 18, height: v === null ? 4 : Math.max(6, (v / 100) * H), borderRadius: 9, backgroundColor: v === null ? c.line : ink, opacity: here || v === null ? 1 : 0.55 }} />
            </View>
            <Txt size={12} lineHeight={16} weight={here ? 700 : 400} style={{ color: here ? c.ink : c.sub }}>
              {formatDay(p.day, { weekday: "short" }).slice(0, 2)}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

/** "6 hours 11 minutes", for a screen reader. */
const spokenHm = (min: number | null) => {
  const t = hm(min);
  return t ? `${Number(t.h)} hours ${Number(t.m)} minutes` : "no sleep recorded";
};

/** A card's caps heading over its headline number. */
function CardHeading({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={11} lineHeight={14} weight={600} style={{ color: c.label, letterSpacing: 1.6 }}>
      {children.toUpperCase()}
    </Txt>
  );
}

/**
 * The Sleep tab's week: the last seven nights' hours asleep (ending on the night shown) as lollipops against your sleep
 * need, the shown night in orange with the Moon, and that night's hours as the headline.
 */
export function SleepWeekCard({ day, goalMin }: { day: string; goalMin: number }) {
  const c = useCalm();
  const router = useRouter();
  const { today } = useApp();
  // The card opens the nights' hours in the chart explorer, on this week.
  const openHours = () => router.push(chartHref({ metric: "hours", r: "w", d: day === today ? undefined : day }) as Href);
  const trend = useQuery((ctx) => getTrends("hours", ctx), [], "trends:hours");
  const pts = trend.data?.points.value ?? [];
  const end = pts.findIndex((p) => p.day === day);
  const nights = (end >= 0 ? pts.slice(Math.max(0, end - 6), end + 1) : pts.slice(-7)).slice(-7);
  const asleep = end >= 0 ? (pts[end].value ?? null) : null;
  const short = asleep !== null && asleep < goalMin - 30;
  const subtitle = asleep === null ? "No sleep recorded for this night" : short ? "Short of your sleep need" : "You met your sleep need";
  return (
    <CalmSurface tint="lavender" watermark={Moon} padding={20} gap={18} onPress={openHours} accessibilityLabel={`This week. This night: ${spokenHm(asleep)}. ${subtitle}. Opens your hours of sleep`}>
      <View style={{ gap: 4 }}>
        <CardHeading>This week</CardHeading>
        <Duration min={asleep} size={30} color={c.tintInk.lavender} />
        <Txt size={14} lineHeight={19} weight={short ? 600 : 400} style={{ color: short ? c.tintInk.rose : c.sub }}>
          {subtitle}
        </Txt>
      </View>
      {nights.length ? (
        // Grows up from the floor once; the padding (taken back by the margin) keeps the raised Moon inside the clip.
        <GrowIn style={{ paddingTop: 10, marginTop: -10 }}>
          <SleepWeek week={nights} goalMin={goalMin} />
        </GrowIn>
      ) : <View style={{ height: 196, borderRadius: 14, backgroundColor: c.chip, opacity: 0.6 }} />}
    </CalmSurface>
  );
}

/**
 * The Health tab's Recovery: the score in its band's colour with what it means today and "Details ›" to Recovery, then
 * HRV, resting heart rate and breathing, then the last seven mornings as labelled columns.
 */
export function RecoveryCard({ vm, at, go }: { vm: HomeVM } & Go) {
  const c = useCalm();
  const r = vm.dials.recovery;
  const band = r.value === null ? null : recoveryBand(r.value);
  const bandInk = band === "green" ? c.tintInk.mint : band === "yellow" ? c.tintInk.sand : c.tintInk.rose;
  const subtitle = r.value === null ? reasonCopy(r.reason, r.nightsLeft).short : band === "green" ? "Ready to perform" : band === "yellow" ? "Take it steady today" : "Prioritise recovery today";
  const { hrv, rhr, resp } = vm.cardStats;
  return (
    <CalmSurface tint="mint" watermark={HeartPulse} padding={20} gap={18}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View accessible accessibilityLabel={`Recovery: ${r.value === null ? "no score" : `${formatValue("int", r.value)} percent`}. ${subtitle}`} style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <CardHeading>Recovery</CardHeading>
          <Num value={r.value === null ? MISSING : formatValue("int", r.value)} unit={r.value === null ? undefined : "%"} size={30} color={band ? bandInk : c.faint} />
          <Txt size={14} lineHeight={19} weight={band ? 600 : 400} style={{ color: band ? bandInk : c.sub }}>
            {subtitle}
          </Txt>
        </View>
        <PillAction label="Details" accessibilityLabel="Recovery details" onPress={() => go(at("/recovery"))} />
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {/* Each number opens its own history in the chart explorer. */}
        <MiniStat value={statText(hrv)} unit="ms" label="HRV" color={c.tintInk.mint} onPress={() => go(chartHref({ metric: "hrv", r: "m" }))} />
        <MiniStat value={statText(rhr)} unit="bpm" label="Resting HR" color={c.tintInk.mint} onPress={() => go(chartHref({ metric: "rhr", r: "m" }))} />
        <MiniStat value={statText(resp, "decimal1")} unit="rpm" label="Breathing" color={c.tintInk.mint} onPress={() => go(chartHref({ metric: "resp", r: "m" }))} />
      </View>
      <GrowIn>
        <RecoveryWeek week={vm.strainRecovery.slice(-7)} shown={vm.day} />
      </GrowIn>
    </CalmSurface>
  );
}
