// Live Workout `/workout-live`: Strain Coach on the band's live Bluetooth heart rate, from Home's activities card and
// Activities. While it runs: Day Strain building beat by beat on the app's Strain math (src/live/liveStrain.ts) on
// a ring against today's Strain Target, the current heart-rate zone, the elapsed time, and a "push" / "ease off"
// line from the target and the Recovery-gated heart-rate band (src/live/coach.ts), with optional haptic cues. Without
// a live band it shows how to connect (the Go-live sheet).
//
// Nothing is written to the Store or Health Connect: the real workout arrives later through the Fitbit sync and is
// scored then. A short summary stays on the phone (src/live/storage.ts). In the look of Apple's Workout app: the
// running numbers big and coloured on one card (the elapsed time in yellow, the heart rate in its zone's colour with a
// beating heart, the workout's Strain in orange, Day Strain on its ring), the zones as five capsules with the current
// one lit, the coach's line on its tone's soft fill, and the session's controls as large round glass buttons floating
// at the foot of the screen (green to start, red to end). The heart beats on the UI thread; the numbers change once a
// second with the clock.
import * as React from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Activity, Check, Heart, HeartPulse, Play, RotateCcw, Square } from "lucide-react-native";
import { zoneNumber, zones } from "@/core/scoring/zones";
import type { LiveSample } from "@/health/ble";
import { DATA_COLORS } from "@/lib/bands";
import { clock, dayLabel, MISSING } from "@/lib/format";
import { addDays, localDay } from "@/lib/time";
import { alpha } from "@/lib/utils";
import { band as coachBand, guidance, LiveCoach, type CoachOutput, type GuidanceTone } from "@/live/coach";
import { coachCue } from "@/live/haptics";
import { effortToTrimp, LiveStrain, strainOfTrimp, targetCrossing } from "@/live/liveStrain";
import { clockDuration, type WorkoutRecord } from "@/live/sessions";
import { COACH_HAPTICS_KEY, saveWorkout, useStoredFlag, useWorkoutLog } from "@/live/storage";
import { useCapture } from "@/live/useCapture";
import { workoutSetup, type WorkoutSetup } from "@/live/workoutSetup";
import { loadDays, maxHrOf } from "@/queries/common";
import { useApp, useQuery } from "@/state/app";
import { showsLive, useLiveBle, useLiveBleControl } from "@/state/liveBle";
import { DetailShell, Txt, useTheme, ZONE_COLOR, type InfoContent, type Tokens } from "@/ui";
import type { CalmPalette } from "@/ui/calm";
import { ActivityRings } from "@/ui/components/Halo";
import { useBottomClearance } from "@/ui/components/PageShell";
import { GlassTarget } from "@/ui/glass";
import { reduceMotionNow, useAppActive } from "@/ui/motion/system";
import { CalmSwitch, Caption, Hairline, IconTile, Num, Sentence, Surface, Title, useCalm, type CalmTint } from "@/screens/settings/calmKit";
import { useBack } from "@/screens/detail/nav";
import { ScoreHero } from "@/screens/detail/ScoreHero";
import { GoLiveButton, GoLiveSheet, LivePill } from "@/screens/settings/liveHr";
import { font, TABULAR } from "@/ui/fonts";
import { KeepAwake } from "@/live/KeepAwake";
import { CONTROLS_CLEARANCE, FloatingControls, GlassRound } from "./controls";

/** A workout shorter than this is not kept. */
const MIN_SAVE_MS = 60_000;
/** The bpm on screen counts as current this long after the last beat. */
const FRESH_MS = 10_000;

const INFO: InfoContent = {
  title: "About Live Workout",
  body: "Strain Coach on your band’s live heart rate. Day Strain builds as you train, on the same Strain math as the rest of Halo, starting from what today already holds. The coach compares it with today’s Strain Target, and your heart rate with a band set by today’s Recovery: it says push when you’re easy for the day and ease off once you’re in range or climbing past what Recovery can pay for. Nothing here is saved to your scores: the workout counts when Fitbit syncs it.",
};

type Session = {
  start: number;
  setup: WorkoutSetup;
  strain: LiveStrain;
  coach: LiveCoach;
  out: CoachOutput | null;
  last: { t: number; bpm: number } | null;
  /** Day Strain at the last check, for crossing the target's edges. */
  prevDay: number;
};

type Snapshot = {
  now: number;
  bpm: number | null;
  zone: number | null;
  day: number;
  session: number;
  out: CoachOutput | null;
  minutesToLow: number | null;
  zoneSeconds: number[];
};

function snapshot(s: Session, now: number): Snapshot {
  const fresh = s.last && now - s.last.t < FRESH_MS ? s.last.bpm : null;
  const t = s.setup.target;
  return {
    now,
    bpm: fresh,
    zone: fresh === null ? null : s.strain.zoneOf(fresh),
    day: s.strain.dayStrain,
    session: s.strain.sessionStrain,
    out: s.out,
    minutesToLow: t ? s.strain.minutesTo(t[0], now) : null,
    zoneSeconds: s.strain.zoneSeconds.slice(),
  };
}

function record(s: Session, end: number): WorkoutRecord {
  return {
    at: s.start,
    ms: end - s.start,
    strain: s.strain.sessionStrain,
    dayStart: s.strain.dayStartStrain,
    dayEnd: s.strain.dayStrain,
    avgHr: s.strain.avgHr,
    maxHr: s.strain.maxBpm,
    zoneSeconds: s.strain.zoneSeconds.map(Math.round),
    target: s.setup.target,
  };
}

const zoneColor = (c: Tokens, zone: number | null) => (zone && ZONE_COLOR[zone] ? c[DATA_COLORS[ZONE_COLOR[zone]].fill] : c.mutedForeground);
/** The coach's tone as a soft fill: push orange (strain), steady green, ease off yellow, anything else blue. */
const toneTint = (tone: GuidanceTone): CalmTint => (tone === "push" ? "peach" : tone === "steady" ? "mint" : tone === "ease" ? "sand" : "sky");
const toneInk = (k: CalmPalette, tone: GuidanceTone) => (tone === "push" || tone === "steady" || tone === "ease" ? k.tintInk[toneTint(tone)] : k.sub);
const f1 = (x: number) => x.toFixed(1);

export default function LiveWorkoutScreen() {
  const { timeZone, today } = useApp();
  const k = useCalm();
  const onBack = useBack("/activities");
  const ctl = useLiveBleControl();
  const isLive = ctl.status === "live";
  const clearance = useBottomClearance("detail");
  const q = useQuery(async (ctx) => workoutSetup(await loadDays(ctx, addDays(ctx.today, -7), ctx.today), ctx.today, maxHrOf(ctx), ctx.profile.sex), []);
  const setup = q.data;
  const log = useWorkoutLog();
  const [haptics, setHaptics] = useStoredFlag(COACH_HAPTICS_KEY);
  const hapticsRef = React.useRef(haptics);
  React.useEffect(() => {
    hapticsRef.current = haptics;
  }, [haptics]);
  const [sheet, setSheet] = React.useState(false);
  /** The workout on screen: what render needs of it (the engines stay in sessionRef, fed outside render). */
  const [active, setActive] = React.useState<{ start: number; setup: WorkoutSetup } | null>(null);
  const running = active !== null;
  const [snap, setSnap] = React.useState<Snapshot | null>(null);
  const [result, setResult] = React.useState<WorkoutRecord | null>(null);
  const sessionRef = React.useRef<Session | null>(null);

  /** One coach output: buzz its cue (no push once Day Strain is in the target range) and keep it. */
  const handle = React.useCallback((s: Session, out: CoachOutput) => {
    s.out = out;
    const day = s.strain.dayStrain;
    const t = s.setup.target;
    const crossing = targetCrossing(s.prevDay, day, t);
    s.prevDay = day;
    if (!hapticsRef.current) return;
    if (crossing) coachCue(crossing);
    else if (out.cue === "easeOff" || (out.cue === "push" && !(t && day >= t[0]))) coachCue(out.cue);
  }, []);

  const onSample = React.useCallback(
    (x: LiveSample) => {
      const s = sessionRef.current;
      if (!s || !(x.bpm > 0)) return;
      if (s.strain.add(x.t, x.bpm)) s.last = { t: x.t, bpm: x.bpm };
      handle(s, s.coach.update(x.t / 1000, x.bpm));
    },
    [handle],
  );
  useCapture(running, onSample);

  // The clock: once a second the coach checks for a stalled stream and the screen redraws.
  React.useEffect(() => {
    if (!running) return;
    const tick = () => {
      const s = sessionRef.current;
      if (!s) return;
      const now = Date.now();
      handle(s, s.coach.update(now / 1000, null));
      setSnap(snapshot(s, now));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, handle]);

  const finish = React.useCallback((unmounting = false) => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;
    const rec = record(s, Date.now());
    if (rec.ms >= MIN_SAVE_MS) void saveWorkout(rec);
    if (unmounting) return;
    setActive(null);
    setSnap(null);
    setResult(rec);
  }, []);
  // Leaving mid-workout keeps its summary.
  React.useEffect(() => () => finish(true), [finish]);

  const start = React.useCallback(() => {
    if (!setup) return;
    const now = Date.now();
    const strain = new LiveStrain({ restingHr: setup.restingHr, maxHr: setup.maxHr, baseEffort: setup.baseEffort, sex: setup.sex });
    const session: Session = {
      start: now,
      setup,
      strain,
      coach: new LiveCoach({ restingHr: setup.restingHr, maxHr: setup.maxHr, recovery: setup.recovery }, now / 1000),
      out: null,
      last: null,
      prevDay: strain.dayStrain,
    };
    sessionRef.current = session;
    setResult(null);
    setSnap(snapshot(session, now));
    setActive({ start: now, setup });
  }, [setup]);

  const target = (active?.setup ?? setup)?.target ?? null;
  const dayValue = snap ? snap.day : setup ? strainOfTrimp(effortToTrimp(setup.baseEffort)) : null;

  let hero: React.ReactNode;
  let summary: React.ReactNode = null;
  let primary: React.ReactNode;
  let controls: React.ReactNode;
  if (active && snap) {
    const a = active.setup;
    const coach = snap.out ?? { status: "warmup" as const, position: "inBand" as const, band: coachBand({ restingHr: a.restingHr, maxHr: a.maxHr, recovery: a.recovery }) };
    const g = guidance({ strain: snap.day, target: a.target, coach, minutesToLow: snap.minutesToLow });
    hero = <RunningHero snap={snap} start={active.start} target={a.target} />;
    summary = <GuidanceCard tone={g.tone} title={g.title} body={g.body} />;
    primary = <ZonesCard snap={snap} lost={ctl.status !== "live"} name={ctl.device?.name ?? null} />;
    controls = <GlassRound icon={Square} label="End" color={k.system.red} onPress={() => finish()} accessibilityLabel="End workout" />;
  } else {
    hero = (
      <ScoreHero
        variant="strain"
        label="Day strain"
        // Tenths, so the ring sweeps only when the shown number changes.
        value={result ? Math.round(result.dayEnd * 10) / 10 : dayValue === null ? null : Math.round(dayValue * 10) / 10}
        loading={!setup && !result}
        target={target}
      />
    );
    if (result) {
      summary = <WorkoutSummary rec={result} />;
      primary = null;
      controls = (
        <>
          <GlassRound icon={RotateCcw} label="Start another" color={k.system.green} onPress={start} disabled={!isLive || !setup} />
          <GlassRound icon={Check} label="Done" color={k.teal} onPress={onBack} />
        </>
      );
    } else {
      summary = <TodayCard setup={setup} error={q.error} />;
      primary = (
        <View style={{ gap: 12 }}>
          <BandCard onGoLive={() => setSheet(true)} setup={setup} />
          <HapticsCard value={haptics} onChange={setHaptics} />
        </View>
      );
      controls = <GlassRound icon={Play} label="Start" color={k.system.green} onPress={start} disabled={!isLive || !setup} accessibilityLabel="Start workout" />;
    }
  }

  const secondary = [
    <Surface key="recent" gap={6}>
      <Title header>Recent live workouts</Title>
      {log.length ? (
        <View>
          {log.slice(0, 5).map((r, i) => (
            <React.Fragment key={r.at}>
              {i > 0 && <Hairline />}
              <RecentRow rec={r} timeZone={timeZone} today={today} />
            </React.Fragment>
          ))}
        </View>
      ) : (
        <Sentence>Workouts you coach here are summed up on this phone. Fitbit syncs the workout itself to your scores.</Sentence>
      )}
    </Surface>,
  ];

  return (
    <>
      {/* The page is the controls' backdrop: the round glass buttons bend what scrolls under them. */}
      <GlassTarget style={{ flex: 1 }} overlay={<FloatingControls>{controls}</FloatingControls>}>
        <DetailShell title="Live workout" info={INFO} onBack={onBack} hero={hero} summary={summary} primary={primary} secondary={running ? undefined : secondary} bottomInset={clearance + CONTROLS_CLEARANCE} />
      </GlassTarget>
      {running && <KeepAwake tag="workout" />}
      <GoLiveSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

/** A heart that beats once a second while there is a live reading (a scale on the UI thread); still otherwise. */
function BeatingHeart({ color, beating }: { color: string; beating: boolean }) {
  const active = useAppActive();
  const s = useSharedValue(1);
  const run = beating && active && !reduceMotionNow();
  React.useEffect(() => {
    if (!run) {
      cancelAnimation(s);
      s.set(1);
      return;
    }
    s.set(withRepeat(withSequence(withTiming(1.18, { duration: 140, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 560 })), -1, false));
    return () => cancelAnimation(s);
  }, [run, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={style}>
      <Heart size={26} color={color} fill={color} strokeWidth={2} />
    </Animated.View>
  );
}

/**
 * The running numbers, as the Workout app stacks them: the elapsed time large in yellow, the heart rate in its zone's
 * colour beside a beating heart, then the workout's Strain in orange and Day Strain on its ring against the target.
 */
function RunningHero({ snap, start, target }: { snap: Snapshot; start: number; target: readonly [number, number] | null }) {
  const { c, scheme } = useTheme();
  const k = useCalm();
  const zc = zoneColor(c, snap.zone);
  const yellow = scheme === "dark" ? k.system.yellow : k.tintInk.sand;
  const elapsed = clockDuration(snap.now - start);
  const segments = target ? [{ from: Math.min(target[0], 21) / 21, to: Math.min(target[1], 21) / 21, color: alpha(c.strain, 0.42) }] : undefined;
  return (
    <View style={{ alignSelf: "stretch", borderRadius: 20, backgroundColor: k.card, paddingHorizontal: 18, paddingVertical: 16, gap: 10 }}>
      <View accessible accessibilityLabel={`Elapsed ${elapsed}`}>
        <Caption>Elapsed</Caption>
        <Txt size={64} lineHeight={70} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[font.numberAt(64, 800), { color: yellow }]}>
          {elapsed}
        </Txt>
      </View>
      <View accessible accessibilityLabel={snap.bpm === null ? "Heart rate: no reading" : `Heart rate ${snap.bpm} beats per minute${snap.zone ? `, zone ${snap.zone}` : ""}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <BeatingHeart color={snap.bpm === null ? k.faint : zc} beating={snap.bpm !== null} />
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Txt size={44} lineHeight={50} style={[font.numberAt(44, 800), { color: snap.bpm === null ? k.faint : zc }]}>
            {snap.bpm === null ? MISSING : String(snap.bpm)}
          </Txt>
          <Txt size={17} lineHeight={22} weight={600} style={{ color: k.sub, marginLeft: 4 }}>
            BPM
          </Txt>
        </View>
        <View style={{ flex: 1 }} />
        {snap.zone !== null && (
          <View style={{ height: 26, borderRadius: 13, paddingHorizontal: 10, justifyContent: "center", backgroundColor: alpha(snap.zone ? zc : k.sub, 0.16) }}>
            <Txt size={13} lineHeight={17} weight={700} style={[TABULAR, { color: snap.zone ? zc : k.sub }]}>
              {snap.zone === 0 ? "Below Zone 1" : `Zone ${snap.zone}`}
            </Txt>
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, borderTopWidth: 0.5, borderTopColor: k.line, paddingTop: 12 }}>
        <View accessible accessibilityLabel={`Workout strain ${f1(snap.session)}`} style={{ flex: 1, minWidth: 0 }}>
          <Caption>Workout strain</Caption>
          <Txt size={40} lineHeight={46} style={[font.numberAt(40, 800), { color: k.tintInk.peach }]}>
            {f1(snap.session)}
          </Txt>
        </View>
        <View accessible accessibilityLabel={`Day strain ${f1(snap.day)} of 21 so far${target ? `, target ${f1(target[0])} to ${f1(target[1])}` : ""}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityRings size={64} stroke={8} rings={[{ progress: Math.min(snap.day, 21) / 21, color: c.strain, segments }]} />
          <View>
            <Caption>Day strain</Caption>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Txt size={22} lineHeight={26} style={[font.numberAt(22, 800), { color: k.ink }]}>
                {f1(snap.day)}
              </Txt>
              <Txt size={12} lineHeight={16} weight={600} style={{ color: k.sub }}>
                so far
              </Txt>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Haptic cues on or off, as an inset list's switch row. */
function HapticsCard({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const k = useCalm();
  return (
    <Surface padding={16} radius={16}>
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={16} lineHeight={21} style={{ color: k.ink }}>
            Haptic cues
          </Txt>
          <Sentence size={13}>A tap to push, two to ease off, a buzz at your target</Sentence>
        </View>
        <CalmSwitch value={value} onChange={onChange} label="Haptic cues" />
      </View>
    </Surface>
  );
}

/** The coach's line on its tone's soft fill: the ask in the tone's colour, the reason under it. */
function GuidanceCard({ tone, title, body }: { tone: GuidanceTone; title: string; body: string }) {
  const k = useCalm();
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${title}. ${body}`} style={{ borderRadius: 20, backgroundColor: k.tint[toneTint(tone)], padding: 18, gap: 4 }}>
      <Txt size={20} lineHeight={25} weight={700} style={{ color: toneInk(k, tone) }}>
        {title}
      </Txt>
      <Txt size={15} lineHeight={21} style={{ color: k.ink }}>
        {body}
      </Txt>
    </View>
  );
}

/** The zones as five capsules with the current one lit in its colour, each with its time; the band and the link under them. */
function ZonesCard({ snap, lost, name }: { snap: Snapshot; lost: boolean; name: string | null }) {
  const { c } = useTheme();
  const k = useCalm();
  const band = snap.out?.band;
  return (
    <Surface gap={14}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((z) => {
          const on = snap.zone === z;
          const col = zoneColor(c, z);
          const secs = snap.zoneSeconds[z] ?? 0;
          return (
            <View key={z} accessible accessibilityLabel={`Zone ${z}${on ? ", current" : ""}: ${clockDuration(secs * 1000)}`} style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 6 }}>
              <View style={{ alignSelf: "stretch", height: 8, borderRadius: 4, backgroundColor: on ? col : alpha(col, 0.22) }} />
              <Txt size={12} lineHeight={16} weight={700} style={{ color: on ? col : k.sub }}>{`Z${z}`}</Txt>
              <Txt size={13} lineHeight={18} style={[font.numeric(on ? 700 : 500), { color: on ? k.ink : k.sub }]}>
                {clockDuration(secs * 1000)}
              </Txt>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Sentence size={13} style={{ flex: 1, fontVariant: ["tabular-nums"] }}>
          {snap.zone === 0 ? "Below Zone 1" : snap.zone ? `Zone ${snap.zone}` : "Waiting for a beat"}
          {band ? ` · today’s band ${Math.round(band.floorBpm)}–${Math.round(band.ceilingBpm)} bpm` : ""}
        </Sentence>
        <LivePill name={name} lost={lost} />
      </View>
    </Surface>
  );
}

/** Before starting: where today stands (Strain so far, target, Recovery). */
function TodayCard({ setup, error }: { setup: WorkoutSetup | undefined; error: Error | null }) {
  const k = useCalm();
  if (!setup)
    return (
      <Surface>
        <Sentence color={error ? k.tintInk.rose : undefined} accessibilityRole={error ? "alert" : undefined}>
          {error ? `Couldn’t read today’s scores: ${error.message}` : "Reading today’s scores…"}
        </Sentence>
      </Surface>
    );
  const t = setup.target;
  const lines = [
    t ? `Today’s target is ${f1(t[0])} - ${f1(t[1])}.` : "No Strain Target yet today: it needs today’s Recovery. The coach uses your heart-rate band alone.",
    setup.recovery !== null ? `Recovery ${Math.round(setup.recovery)}% sets how hard the coach lets you go.` : null,
    setup.synced ? null : "Today’s heart rate hasn’t synced yet, so Day Strain starts from this workout.",
  ].filter(Boolean);
  return (
    <Surface>
      <Txt size={15} lineHeight={21} style={{ color: k.ink }}>
        {lines.join(" ")}
      </Txt>
    </Surface>
  );
}

/** The band: its live bpm and zone, or how to connect it. */
function BandCard({ onGoLive, setup }: { onGoLive: () => void; setup: WorkoutSetup | undefined }) {
  const { c } = useTheme();
  const k = useCalm();
  const live = useLiveBle();
  const set = React.useMemo(() => (setup ? zones(setup.restingHr, setup.maxHr) : null), [setup]);
  if (!showsLive(live))
    return (
      <Surface gap={12}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconTile icon={Activity} tint="peach" size={36} />
          <Title header style={{ flex: 1 }}>
            Connect your band
          </Title>
        </View>
        <Sentence>Live Workout needs your band’s heart rate over Bluetooth. Turn on Share heart rate in Google Health, then connect.</Sentence>
        <GoLiveButton onPress={onGoLive} style={{ marginTop: 4 }} />
      </Surface>
    );
  const zone = live.bpm !== null && set ? zoneNumber(set, live.bpm) : null;
  return (
    <Surface gap={12}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconTile icon={HeartPulse} tint="rose" size={36} />
        <Title header style={{ flex: 1 }}>
          Heart rate
        </Title>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View accessible accessibilityLabel={live.bpm === null ? "No heart rate yet" : `${live.bpm} beats per minute`}>
          <Num value={live.bpm === null ? MISSING : String(live.bpm)} unit="bpm" size={40} color={zone ? zoneColor(c, zone) : k.ink} />
        </View>
        <LivePill name={live.device?.name ?? null} lost={live.status !== "live"} />
      </View>
      {zone !== null && <Sentence size={13}>{zone === 0 ? "Below Zone 1" : `Zone ${zone}`}</Sentence>}
    </Surface>
  );
}

/** The end of a workout: its Strain, time, heart rate, zones and where the day ended up. */
function WorkoutSummary({ rec }: { rec: WorkoutRecord }) {
  const { c } = useTheme();
  const k = useCalm();
  const total = rec.zoneSeconds.reduce((a, b) => a + b, 0);
  const rows: { label: string; value: string; node: React.ReactNode }[] = [
    { label: "Workout strain", value: f1(rec.strain), node: <Num value={f1(rec.strain)} size={20} color={k.tintInk.peach} /> },
    { label: "Time", value: clockDuration(rec.ms), node: <Num value={clockDuration(rec.ms)} size={20} /> },
    {
      label: "Heart rate",
      value: rec.avgHr === null ? MISSING : `${rec.avgHr} avg · ${rec.maxHr ?? MISSING} max`,
      node:
        rec.avgHr === null ? (
          <Num value={MISSING} size={20} />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
            <Num value={String(rec.avgHr)} unit="avg" size={20} />
            <Num value={String(rec.maxHr ?? MISSING)} unit="max" size={20} />
          </View>
        ),
    },
    { label: "Day strain", value: `${f1(rec.dayStart)} → ${f1(rec.dayEnd)}`, node: <Num value={`${f1(rec.dayStart)} → ${f1(rec.dayEnd)}`} size={20} color={k.tintInk.peach} /> },
  ];
  const t = rec.target;
  const verdict = !t ? null : rec.dayEnd >= t[1] ? "Past today’s target: prioritise sleep tonight." : rec.dayEnd >= t[0] ? "Inside today’s target." : `${f1(t[0] - rec.dayEnd)} below today’s target.`;
  return (
    <Surface gap={2}>
      <Title header style={{ marginBottom: 6 }}>
        Workout summary
      </Title>
      {rows.map((r, i) => (
        <React.Fragment key={r.label}>
          {i > 0 && <Hairline />}
          <View accessible accessibilityLabel={`${r.label}: ${r.value.replace("→", "to")}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 11 }}>
            <Txt size={16} lineHeight={21} style={{ color: k.ink, flexShrink: 1 }}>
              {r.label}
            </Txt>
            {r.node}
          </View>
        </React.Fragment>
      ))}
      {total > 0 && (
        <View accessible accessibilityLabel="Time in zones" style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2, marginTop: 10 }}>
          {rec.zoneSeconds.map((sec, z) => (sec > 0 ? <View key={z} style={{ flexGrow: sec, backgroundColor: z ? zoneColor(c, z) : k.fill }} /> : null))}
        </View>
      )}
      <Sentence size={13} style={{ marginTop: 12 }}>
        {[verdict, "Kept on this phone; Fitbit syncs the workout itself to your scores."].filter(Boolean).join(" ")}
      </Sentence>
    </Surface>
  );
}

function RecentRow({ rec, timeZone, today }: { rec: WorkoutRecord; timeZone: string; today: string }) {
  const k = useCalm();
  const when = `${dayLabel(localDay(Math.floor(rec.at / 1000), timeZone), today)}, ${clock(rec.at, timeZone)}`;
  return (
    <View accessible accessibilityLabel={`${when}: ${clockDuration(rec.ms)}, workout strain ${f1(rec.strain)}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={16} lineHeight={21} style={{ color: k.ink }}>
          {when}
        </Txt>
        <Sentence size={13} style={{ fontVariant: ["tabular-nums"] }}>{`${clockDuration(rec.ms)}${rec.avgHr !== null ? ` · ${rec.avgHr} bpm avg` : ""}`}</Sentence>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Num value={f1(rec.strain)} size={20} color={k.tintInk.peach} />
        <Caption>Strain</Caption>
      </View>
    </View>
  );
}
