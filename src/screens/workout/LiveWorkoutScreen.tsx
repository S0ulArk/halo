// Live Workout `/workout-live`: Strain Coach on the band's live Bluetooth heart rate, from Home's activities card and
// Activities. While it runs: Day Strain building beat by beat on the app's Strain math (src/live/liveStrain.ts) on
// the dial against today's Strain Target, the current heart-rate zone, the elapsed time, and a "push" / "ease off"
// line from the target and the Recovery-gated heart-rate band (src/live/coach.ts), with optional haptic cues. Without
// a live band it shows how to connect (the Go-live sheet).
//
// Nothing is written to the Store or Health Connect: the real workout arrives later through the Fitbit sync and is
// scored then. A short summary stays on the phone (src/live/storage.ts). Calm: Day Strain is the kit's peach hero card,
// the running numbers sit in the numeric face over small caps labels, the coach's line on its tone's pastel, and the
// controls are white cards with teal actions.
import * as React from "react";
import { View } from "react-native";
import { Activity, HeartPulse } from "lucide-react-native";
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
import { DetailShell, ScoreDial, Txt, useTheme, ZONE_COLOR, type InfoContent, type Tokens } from "@/ui";
import type { CalmPalette } from "@/ui/calm";
import { CalmButton, CalmSwitch, Caption, Hairline, IconTile, Num, Sentence, Surface, Title, useCalm, type CalmTint } from "@/screens/settings/calmKit";
import { useBack } from "@/screens/detail/nav";
import { GoLiveButton, GoLiveSheet, LivePill } from "@/screens/settings/liveHr";
import { font } from "@/ui/fonts";
import { KeepAwake } from "@/live/KeepAwake";

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
/** The coach's tone as a pastel: push peach (strain), steady mint, ease off sand, anything else sky. */
const toneTint = (tone: GuidanceTone): CalmTint => (tone === "push" ? "peach" : tone === "steady" ? "mint" : tone === "ease" ? "sand" : "sky");
const toneInk = (k: CalmPalette, tone: GuidanceTone) => (tone === "push" || tone === "steady" || tone === "ease" ? k.tintInk[toneTint(tone)] : k.sub);
const f1 = (x: number) => x.toFixed(1);

export default function LiveWorkoutScreen() {
  const { timeZone, today } = useApp();
  const onBack = useBack("/activities");
  const ctl = useLiveBleControl();
  const isLive = ctl.status === "live";
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
  const hero = (
    <ScoreDial
      variant="strain"
      size="lg"
      label="Day strain"
      // Tenths, so the dial sweeps only when the shown number changes.
      value={result ? Math.round(result.dayEnd * 10) / 10 : dayValue === null ? null : Math.round(dayValue * 10) / 10}
      loading={!setup && !result}
      target={target}
      extraTags={running ? ["so_far"] : undefined}
    />
  );

  let summary: React.ReactNode = null;
  let primary: React.ReactNode;
  if (active && snap) {
    const a = active.setup;
    const coach = snap.out ?? { status: "warmup" as const, position: "inBand" as const, band: coachBand({ restingHr: a.restingHr, maxHr: a.maxHr, recovery: a.recovery }) };
    const g = guidance({ strain: snap.day, target: a.target, coach, minutesToLow: snap.minutesToLow });
    summary = <GuidanceCard tone={g.tone} title={g.title} body={g.body} />;
    primary = (
      <View style={{ gap: 12 }}>
        <RunningStats snap={snap} start={active.start} lost={ctl.status !== "live"} name={ctl.device?.name ?? null} />
        <CalmButton variant="secondary" onPress={() => finish()}>
          End workout
        </CalmButton>
      </View>
    );
  } else if (result) {
    summary = <WorkoutSummary rec={result} />;
    primary = (
      <View style={{ gap: 12 }}>
        <CalmButton onPress={start} disabled={!isLive || !setup}>
          Start another
        </CalmButton>
        <CalmButton variant="secondary" onPress={onBack}>
          Done
        </CalmButton>
      </View>
    );
  } else {
    summary = <TodayCard setup={setup} error={q.error} />;
    primary = (
      <View style={{ gap: 12 }}>
        <BandCard onGoLive={() => setSheet(true)} setup={setup} />
        <HapticsCard value={haptics} onChange={setHaptics} />
        <CalmButton onPress={start} disabled={!isLive || !setup}>
          Start workout
        </CalmButton>
      </View>
    );
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
      <DetailShell title="Live workout" info={INFO} onBack={onBack} hero={hero} summary={summary} primary={primary} secondary={running ? undefined : secondary} />
      {running && <KeepAwake tag="workout" />}
      <GoLiveSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

/** Haptic cues on or off, on a white card. */
function HapticsCard({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const k = useCalm();
  return (
    <Surface padding={18}>
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={15} lineHeight={20} weight={600} style={{ color: k.ink }}>
            Haptic cues
          </Txt>
          <Sentence size={13}>A tap to push, two to ease off, a buzz at your target</Sentence>
        </View>
        <CalmSwitch value={value} onChange={onChange} label="Haptic cues" />
      </View>
    </Surface>
  );
}

/** The coach's line on its tone's pastel: the ask in the tone's ink, the reason under it. */
function GuidanceCard({ tone, title, body }: { tone: GuidanceTone; title: string; body: string }) {
  const k = useCalm();
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${title}. ${body}`} style={{ borderRadius: 32, borderWidth: 1, borderColor: k.tintEdge[toneTint(tone)], backgroundColor: k.tint[toneTint(tone)], padding: 20, gap: 4 }}>
      <Txt size={17} lineHeight={22} weight={600} style={{ color: toneInk(k, tone) }}>
        {title}
      </Txt>
      <Txt size={15} lineHeight={21} style={{ color: k.ink }}>
        {body}
      </Txt>
    </View>
  );
}

/** Elapsed, heart rate and the workout's own Strain, then the zones with the current one lit. */
function RunningStats({ snap, start, lost, name }: { snap: Snapshot; start: number; lost: boolean; name: string | null }) {
  const { c } = useTheme();
  const k = useCalm();
  const zc = zoneColor(c, snap.zone);
  const cells = [
    { label: "Elapsed", value: clockDuration(snap.now - start), color: undefined, spoken: clockDuration(snap.now - start) },
    { label: "Heart rate", value: snap.bpm === null ? MISSING : String(snap.bpm), color: snap.bpm === null ? undefined : zc, spoken: snap.bpm === null ? "no reading" : `${snap.bpm} beats per minute` },
    { label: "Workout", value: f1(snap.session), color: k.tintInk.peach, spoken: `workout strain ${f1(snap.session)}` },
  ];
  const band = snap.out?.band;
  return (
    <Surface gap={16}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {cells.map((x) => (
          <View key={x.label} accessible accessibilityLabel={`${x.label}: ${x.spoken}`} style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 2 }}>
            <Txt size={30} lineHeight={34} align="center" numberOfLines={1} style={[font.numberAt(30), { color: x.color ?? k.ink }]}>
              {x.value}
            </Txt>
            <Caption align="center">{x.label}</Caption>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((z) => {
          const on = snap.zone === z;
          const col = zoneColor(c, z);
          const secs = snap.zoneSeconds[z] ?? 0;
          return (
            <View
              key={z}
              accessible
              accessibilityLabel={`Zone ${z}${on ? ", current" : ""}: ${clockDuration(secs * 1000)}`}
              style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 4, borderRadius: 14, paddingVertical: 10, backgroundColor: on ? alpha(col, 0.2) : k.ground }}
            >
              <Txt size={12} lineHeight={16} weight={700} style={{ color: on ? col : k.faint, letterSpacing: 0.6 }}>{`Z${z}`}</Txt>
              <Txt size={13} lineHeight={18} style={[font.numeric(600), { color: on ? k.ink : k.sub }]}>
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
      <Txt size={15} lineHeight={22} style={{ color: k.ink }}>
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
          <IconTile icon={Activity} tint="peach" size={40} />
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
        <IconTile icon={HeartPulse} tint="rose" size={40} />
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
    <Surface tint="peach" gap={4}>
      <Title header style={{ marginBottom: 4 }}>
        Workout summary
      </Title>
      {rows.map((r, i) => (
        <React.Fragment key={r.label}>
          {i > 0 && <Hairline color={k.chip} />}
          <View accessible accessibilityLabel={`${r.label}: ${r.value.replace("→", "to")}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10 }}>
            <Txt size={15} lineHeight={20} weight={600} style={{ color: k.ink, flexShrink: 1 }}>
              {r.label}
            </Txt>
            {r.node}
          </View>
        </React.Fragment>
      ))}
      {total > 0 && (
        <View accessible accessibilityLabel="Time in zones" style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2, marginTop: 8 }}>
          {rec.zoneSeconds.map((sec, z) => (sec > 0 ? <View key={z} style={{ flexGrow: sec, backgroundColor: z ? zoneColor(c, z) : k.chip }} /> : null))}
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
        <Txt size={15} lineHeight={20} weight={600} style={{ color: k.ink }}>
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
