// Breathe `/breathe`: paced breathing with a circle, a label and haptic cues, from the Stress screen and More. Pick a
// pace (resonance 5.5, box, 4-7-8, physiological sigh) and 1, 3 or 5 minutes; the circle fills and empties on the UI
// thread (BreathCircle) while the JS side counts the stage down and buzzes at each switch, all off one start time.
// With the band live over Bluetooth it shows the heart rate, and when the band sends RR intervals a spot HRV before
// and after (src/live/spotHrv.ts); without the band it is a plain pacer. Sessions are kept on the phone
// (src/live/storage.ts) and never reach the Store: scores keep using what Health Connect holds. Calm: the circle sits
// on a lavender hero card (stress's family) with the count in the numeric face; the controls are white cards with teal
// actions.
//
// No keep-awake: expo-keep-awake is not a dependency of the app (only of expo itself), so the screen may dim on a
// long session; the timers and the Bluetooth link pause with it and the session picks up on return.
import * as React from "react";
import { Pressable, View } from "react-native";
import { Check, HeartPulse, TriangleAlert, Wind } from "lucide-react-native";
import { DURATIONS, phaseAt, planSession, protocolById, PROTOCOLS, scheduleCues, secondsLeft, stageLabel, type BreathMinutes, type BreathProtocol, type BreathProtocolId } from "@/live/breath";
import { breathCue, sessionDone } from "@/live/haptics";
import { breathRecord, clockDuration, pctChange, signedPct, type BreathRecord } from "@/live/sessions";
import { BREATH_HAPTICS_KEY, saveBreath, useBreathLog, useStoredFlag } from "@/live/storage";
import { useCapture } from "@/live/useCapture";
import { clock, dayLabel, MISSING } from "@/lib/format";
import { localDay } from "@/lib/time";
import { mix } from "@/lib/utils";
import { useApp } from "@/state/app";
import { showsLive, useLiveBle, useLiveBleControl } from "@/state/liveBle";
import { DetailShell, ToggleGroup, Txt, type InfoContent } from "@/ui";
import { font } from "@/ui/fonts";
import { CalmButton, CalmSwitch, Caption, Hairline, IconTile, Notice, Num, Sentence, Surface, Title, useCalm } from "@/screens/settings/calmKit";
import { useBack } from "@/screens/detail/nav";
import { GoLiveButton, GoLiveSheet, LivePill, rmssdLine } from "@/screens/settings/liveHr";
import { BreathCircle } from "./BreathCircle";
import { KeepAwake } from "@/live/KeepAwake";

/** The circle's diameter at full. */
const CIRCLE = 216;
/** A session stopped sooner than this is not kept. */
const MIN_SAVE_MS = 30_000;
/** A stage reached this late (the app was in the background) changes the label but does not buzz. */
const LATE_CUE_MS = 400;

const INFO: InfoContent = {
  title: "About Breathe",
  body: "Paced breathing with a circle and haptic cues: one light pulse as you breathe in, two as you breathe out, none on a hold. With your band live, Halo shows your heart rate; when the band also sends beat-to-beat intervals, it takes a one-minute HRV reading (RMSSD) before and after. Sessions stay on this phone and scores don’t use them.",
};

// The last pace and length picked, for the next visit while the app stays open.
const remembered: { pick: { id: BreathProtocolId; minutes: BreathMinutes } } = { pick: { id: "resonance", minutes: 3 } };

type Run = { protocol: BreathProtocol; start: number; plannedMs: number; preRr: number[] };
type Clock = { /** The run's start, so a finished run's count never shows for the next. */ run: number; stage: number; secs: number; leftMs: number };

/**
 * The session's clock on the JS side: wakes at each stage switch and each whole second (of the stage count and of
 * the time left), buzzes at the switches, and calls `onEnd` when the planned time is up. ≤ 2 renders a second.
 */
function useBreathClock(run: Run | null, haptics: boolean, onEnd: (end: number) => void): Clock | null {
  const [state, setState] = React.useState<Clock | null>(null);
  const latest = React.useRef({ haptics, onEnd });
  React.useEffect(() => {
    latest.current = { haptics, onEnd };
  });
  React.useEffect(() => {
    if (!run) return;
    const stages = run.protocol.stages;
    const loops = new Map(scheduleCues(stages, run.plannedMs).map((c) => [c.offsetMs, c.loops]));
    let timer: ReturnType<typeof setTimeout> | null = null;
    let seen = -1;
    const step = () => {
      const t = Date.now() - run.start;
      if (t >= run.plannedMs) {
        latest.current.onEnd(run.start + run.plannedMs);
        return;
      }
      const p = phaseAt(stages, t);
      if (p.start !== seen) {
        seen = p.start;
        if (latest.current.haptics && t - p.start < LATE_CUE_MS) breathCue(loops.get(p.start) ?? 0);
      }
      const secs = secondsLeft(p, t);
      const left = Math.ceil((run.plannedMs - t) / 1000);
      setState({ run: run.start, stage: p.stage, secs, leftMs: left * 1000 });
      // The next moment anything on screen changes: the stage count ticking, the time left ticking, the stage ending.
      const next = Math.min(p.end - (secs - 1) * 1000, run.plannedMs - (left - 1) * 1000);
      timer = setTimeout(step, Math.max(1, next - t + 1));
    };
    timer = setTimeout(step, 0);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [run]);
  // A new run shows nothing until its first step (the same frame), never the last run's count.
  return run && state && state.run === run.start ? state : null;
}

/** A number over its small caps label, centred (the hero's length and breaths). */
function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 2 }}>
      <Num value={value} size={26} />
      <Caption align="center">{label}</Caption>
    </View>
  );
}

export default function BreatheScreen() {
  const c = useCalm();
  const { timeZone, today } = useApp();
  const onBack = useBack();
  const ctl = useLiveBleControl();
  const log = useBreathLog();
  const [haptics, setHaptics] = useStoredFlag(BREATH_HAPTICS_KEY);
  const [pick, setPick] = React.useState(remembered.pick);
  const [run, setRun] = React.useState<Run | null>(null);
  const [result, setResult] = React.useState<BreathRecord | null>(null);
  const [sheet, setSheet] = React.useState(false);
  const protocol = protocolById(pick.id) ?? PROTOCOLS[0];
  const plan = planSession(protocol.stages, pick.minutes);
  const capture = useCapture(run !== null);
  const runRef = React.useRef<Run | null>(null);
  // The live buffer's last minute of RR, kept current by <RecentRr> so this screen doesn't re-render with each beat.
  const recentRr = React.useRef<number[]>([]);
  const onRecentRr = React.useCallback((rr: number[]) => {
    recentRr.current = rr;
  }, []);

  const choose = (next: Partial<typeof pick>) => setPick({ ...pick, ...next });
  React.useEffect(() => {
    remembered.pick = pick;
  }, [pick]);

  /** Ends the session at `end`, sums it up and keeps it (when long enough). Safe to call twice. */
  const finish = React.useCallback((end: number, unmounting = false) => {
    const r = runRef.current;
    if (!r) return;
    runRef.current = null;
    const rec = breathRecord({ protocol: r.protocol, start: r.start, end, plannedMs: r.plannedMs, hr: capture.current.hr, beats: capture.current.beats, preRr: r.preRr });
    if (rec.ms >= MIN_SAVE_MS) void saveBreath(rec);
    if (unmounting) return;
    setRun(null);
    setResult(rec);
    if (rec.completed) sessionDone();
  }, [capture]);
  // Leaving mid-session keeps what was done.
  React.useEffect(() => () => finish(Date.now(), true), [finish]);

  const clockState = useBreathClock(run, haptics, finish);

  const start = React.useCallback(() => {
    // The minute before the tap is the "before" reading when it has enough clean beats.
    const r: Run = { protocol, start: Date.now(), plannedMs: plan.durationMs, preRr: recentRr.current.slice() };
    runRef.current = r;
    setResult(null);
    setRun(r);
  }, [protocol, plan.durationMs]);

  const running = run !== null;
  const stage = running && clockState ? run.protocol.stages[clockState.stage] : null;

  const hero = (
    <Surface tint="lavender" gap={16} style={{ alignSelf: "stretch", alignItems: "center" }}>
      <BreathCircle stages={(run?.protocol ?? protocol).stages} startAt={run?.start ?? null} size={CIRCLE} color={c.tintInk.lavender}>
        {stage && clockState ? (
          // Announced on each stage switch only: the label leaves out the per-second count.
          <View accessible accessibilityLiveRegion="polite" accessibilityLabel={stageLabel(stage)} style={{ alignItems: "center", gap: 2 }}>
            <Txt size={16} lineHeight={21} weight={600} align="center" style={{ color: c.ink }}>
              {stageLabel(stage)}
            </Txt>
            <Txt size={48} lineHeight={54} align="center" style={[font.numberAt(48), { color: c.tintInk.lavender }]}>
              {String(clockState.secs)}
            </Txt>
          </View>
        ) : (
          <Wind size={36} color={c.tintInk.lavender} strokeWidth={1.75} />
        )}
      </BreathCircle>
      {running && clockState ? (
        <View accessible accessibilityLabel={`${clockDuration(clockState.leftMs)} left · ${protocol.title}`} style={{ alignItems: "center", gap: 2 }}>
          <Num value={clockDuration(clockState.leftMs)} unit="left" size={28} />
          <Sentence align="center">{protocol.title}</Sentence>
        </View>
      ) : (
        <View style={{ alignSelf: "stretch", alignItems: "center", gap: 12 }}>
          <Title style={{ textAlign: "center" }}>{protocol.title}</Title>
          <View style={{ alignSelf: "stretch", flexDirection: "row", gap: 12 }}>
            <HeroStat value={clockDuration(plan.durationMs)} label="Length" />
            <HeroStat value={String(plan.cycles)} label="Breaths" />
          </View>
        </View>
      )}
    </Surface>
  );

  const liveCard = <LiveCard running={running} onGoLive={() => setSheet(true)} />;

  let primary: React.ReactNode;
  if (running)
    primary = (
      <View style={{ gap: 12 }}>
        {liveCard}
        <CalmButton variant="secondary" onPress={() => finish(Date.now())}>
          End session
        </CalmButton>
      </View>
    );
  else if (result)
    primary = (
      <View style={{ gap: 12 }}>
        <Summary rec={result} />
        <CalmButton onPress={start}>Go again</CalmButton>
        <CalmButton variant="secondary" onPress={() => setResult(null)}>
          Change pace
        </CalmButton>
      </View>
    );
  else
    primary = (
      <View style={{ gap: 12 }}>
        <Surface gap={12}>
          <Title header>Pace</Title>
          <View accessibilityRole="radiogroup" accessibilityLabel="Pace" style={{ gap: 8 }}>
            {PROTOCOLS.map((p) => (
              <ProtocolRow key={p.id} p={p} selected={p.id === protocol.id} onPress={() => choose({ id: p.id })} />
            ))}
          </View>
          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink, marginTop: 8 }}>
            Length
          </Txt>
          <ToggleGroup
            fill
            font="numeric"
            value={String(pick.minutes)}
            onChange={(v) => choose({ minutes: Number(v) as BreathMinutes })}
            items={DURATIONS.map((m) => ({ value: String(m), label: `${m} min`, accessibilityLabel: `${m} minute${m === 1 ? "" : "s"}` }))}
            accessibilityLabel="Session length"
          />
          <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
                Haptic cues
              </Txt>
              <Sentence size={13}>One pulse to breathe in, two to breathe out</Sentence>
            </View>
            <CalmSwitch value={haptics} onChange={setHaptics} label="Haptic cues" />
          </View>
        </Surface>
        {liveCard}
        <CalmButton onPress={start}>Start</CalmButton>
      </View>
    );

  const secondary = [
    <Surface key="about" gap={10}>
      <Title header>{`About ${protocol.title}`}</Title>
      <Txt size={15} lineHeight={22} style={{ color: c.ink }}>
        {protocol.edu}
      </Txt>
      {!!protocol.caution && (
        <Notice tint="sand" icon={TriangleAlert}>
          {protocol.caution}
        </Notice>
      )}
    </Surface>,
    <Surface key="recent" gap={6}>
      <Title header>Recent sessions</Title>
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
        <Sentence>Your sessions appear here, with heart rate and HRV when the band was live.</Sentence>
      )}
    </Surface>,
  ];

  return (
    <>
      <DetailShell title="Breathe" info={INFO} onBack={onBack} hero={hero} heroGlow={null} primary={primary} secondary={running ? undefined : secondary} />
      {running && <KeepAwake tag="breathe" />}
      <GoLiveSheet open={sheet} onClose={() => setSheet(false)} />
      <RecentRr onChange={onRecentRr} live={ctl.status === "live"} />
    </>
  );
}

/** Hands up the live buffer's last minute of RR intervals (empty unless live) as it changes; renders nothing. */
function RecentRr({ onChange, live }: { onChange: (rr: number[]) => void; live: boolean }) {
  const { rrMs } = useLiveBle();
  React.useEffect(() => onChange(live ? rrMs : []), [onChange, live, rrMs]);
  return null;
}

/** One pace in the picker: its name and timing in full, the chosen one teal-tinted with a check. */
function ProtocolRow({ p, selected, onPress }: { p: BreathProtocol; selected: boolean; onPress: () => void }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${p.title}, ${p.subtitle}`}
      style={({ pressed }) => ({
        minHeight: 60,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: selected ? mix(c.teal, c.card, 0.12) : c.ground,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: selected ? c.teal : c.ink }}>
          {p.title}
        </Txt>
        <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
          {p.subtitle}
        </Txt>
      </View>
      {selected && <Check size={20} color={c.teal} strokeWidth={2.5} />}
    </Pressable>
  );
}

/** The band's part: live bpm and the HRV line, or how to connect. Breathe works without it. */
function LiveCard({ running, onGoLive }: { running: boolean; onGoLive: () => void }) {
  const c = useCalm();
  const live = useLiveBle();
  const isLive = showsLive(live);
  const head = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconTile icon={HeartPulse} tint="rose" size={40} />
      <Title header style={{ flex: 1 }}>
        Heart rate
      </Title>
    </View>
  );
  if (!isLive)
    return (
      <Surface gap={12}>
        {head}
        <Sentence>{running ? "No band connected: this session is pacing only." : "Connect your band over Bluetooth to see your heart rate, and HRV before and after when the band sends beat-to-beat intervals."}</Sentence>
        <GoLiveButton onPress={onGoLive} style={{ marginTop: 4 }} />
      </Surface>
    );
  const note = live.contact === false ? "No skin contact: wear the band snug." : (rmssdLine(live) ?? "Heart rate only: this band doesn’t send beat-to-beat intervals, so there’s no HRV reading.");
  return (
    <Surface gap={12}>
      {head}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View accessible accessibilityLabel={live.bpm === null ? "No heart rate yet" : `${live.bpm} beats per minute`}>
          <Num value={live.bpm === null ? MISSING : String(live.bpm)} unit="bpm" size={40} color={c.tintInk.rose} />
        </View>
        <LivePill name={live.device?.name ?? null} lost={live.status !== "live"} />
      </View>
      <Sentence size={13} color={live.contact === false ? c.tintInk.sand : c.sub} style={{ fontVariant: ["tabular-nums"] }}>
        {note}
      </Sentence>
    </Surface>
  );
}

/** "72 → 64": both ends, either missing as "--". */
function fromTo(a: number | null, b: number | null): string {
  return `${a ?? MISSING} → ${b ?? MISSING}`;
}

/** The end of a session: how long, heart rate start → end, HRV before → after and the swing per breath. */
function Summary({ rec }: { rec: BreathRecord }) {
  const c = useCalm();
  const p = protocolById(rec.protocol);
  const hrDelta = rec.hrStart !== null && rec.hrEnd !== null ? rec.hrEnd - rec.hrStart : null;
  const hrv = pctChange(rec.hrvBefore, rec.hrvAfter);
  const hrNone = rec.hrStart === null && rec.hrEnd === null;
  const hrvNone = rec.hrvBefore === null && rec.hrvAfter === null;
  const rows: { label: string; value: string; unit?: string; note?: string }[] = [
    { label: "Time", value: clockDuration(rec.ms), note: rec.completed ? `${p?.title ?? "Session"}, complete` : `${p?.title ?? "Session"}, ended early` },
    {
      label: "Heart rate",
      value: hrNone ? MISSING : fromTo(rec.hrStart, rec.hrEnd),
      unit: hrNone ? undefined : "bpm",
      note: hrDelta === null ? (rec.hrStart === null ? "No band connected" : undefined) : hrDelta === 0 ? "Unchanged" : `${hrDelta < 0 ? "Down" : "Up"} ${Math.abs(hrDelta)} bpm`,
    },
    {
      label: "HRV (RMSSD)",
      value: hrvNone ? MISSING : fromTo(rec.hrvBefore === null ? null : Math.round(rec.hrvBefore), rec.hrvAfter === null ? null : Math.round(rec.hrvAfter)),
      unit: hrvNone ? undefined : "ms",
      note: hrv !== null ? `${signedPct(hrv)} after` : rec.hrStart === null ? "Needs the band" : "Needs beat-to-beat intervals and a still minute",
    },
    ...(rec.rsa !== null ? [{ label: "Swing per breath", value: rec.rsa.toFixed(1), unit: "bpm", note: "How far your heart rate rose and fell with each breath" }] : []),
  ];
  return (
    <Surface tint="lavender" gap={4}>
      <Title header style={{ marginBottom: 4 }}>
        {rec.completed ? "Session complete" : "Session ended"}
      </Title>
      {rows.map((r, i) => (
        <React.Fragment key={r.label}>
          {i > 0 && <Hairline color={c.chip} />}
          <View accessible accessibilityLabel={`${r.label}: ${`${r.value}${r.unit ? ` ${r.unit}` : ""}`.replace("→", "to")}${r.note ? `. ${r.note}` : ""}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
                {r.label}
              </Txt>
              {!!r.note && <Sentence size={13}>{r.note}</Sentence>}
            </View>
            <Num value={r.value} unit={r.unit} size={20} color={c.tintInk.lavender} />
          </View>
        </React.Fragment>
      ))}
    </Surface>
  );
}

/** One kept session: when, which pace, how long, and what changed. */
function RecentRow({ rec, timeZone, today }: { rec: BreathRecord; timeZone: string; today: string }) {
  const c = useCalm();
  const p = protocolById(rec.protocol);
  const when = `${dayLabel(localDay(Math.floor(rec.at / 1000), timeZone), today)}, ${clock(rec.at, timeZone)}`;
  const hrv = pctChange(rec.hrvBefore, rec.hrvAfter);
  const hr = rec.hrStart !== null && rec.hrEnd !== null;
  const aside = hrv !== null ? `HRV ${signedPct(hrv)}` : hr ? `${rec.hrStart} → ${rec.hrEnd} bpm` : rec.completed ? "Complete" : "Ended early";
  return (
    <View accessible accessibilityLabel={`${when}: ${p?.title ?? "Breathing"}, ${clockDuration(rec.ms)}, ${aside.replace("→", "to")}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
          {p?.title ?? "Breathing"}
        </Txt>
        <Sentence size={13} style={{ fontVariant: ["tabular-nums"] }}>{`${when} · ${clockDuration(rec.ms)}`}</Sentence>
      </View>
      {hrv !== null ? (
        <View style={{ alignItems: "flex-end" }}>
          <Num value={signedPct(hrv)} size={18} color={c.tintInk.lavender} />
          <Caption>HRV</Caption>
        </View>
      ) : hr ? (
        <Num value={`${rec.hrStart} → ${rec.hrEnd}`} unit="bpm" size={18} />
      ) : (
        <Sentence size={13}>{rec.completed ? "Complete" : "Ended early"}</Sentence>
      )}
    </View>
  );
}
