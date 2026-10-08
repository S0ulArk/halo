// Live heart rate over Bluetooth, the UI: the pieces Home's card and the Heart rate screen share (the beating heart,
// the "Live · Fitbit Air" pill, the 2-minute trace), the Go-live sheet (the three steps in Google Health, then scan
// and connect), and Settings › Live heart rate (`/settings?s=live`): the remembered band, auto-connect, forget,
// status, permissions and the how-to.
//
// The band shares heart rate with the standard Bluetooth Heart Rate Service once Google Health › Fitbit Air ›
// Connections › Share heart rate is on (src/health/ble.ts). Live readings are for viewing only: scores keep using
// what Google Health saves to Health Connect.
import * as React from "react";
import { ActivityIndicator, Animated, AppState, Easing, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { BatteryMedium, Bluetooth, BluetoothOff, ChevronRight, ExternalLink, Heart, Info, Square, Watch } from "lucide-react-native";
import { BACKGROUND_GRACE_MS } from "@/health/ble";
import { liveTrace, signalWord } from "@/health/bleHr";
import { MISSING } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { showsLive, useLiveBle, useLiveBleControl, type FoundDevice, type LiveControl, type LiveData } from "@/state/liveBle";
import { BottomSheet, Sparkline, Txt, useAppActive, useReduceMotion, useTheme } from "@/ui";
import { openApp } from "../../../modules/pulse-bt";
import { font } from "@/ui/fonts";
import { CalmButton, CalmSwitch, Group, IconTile, Num, SectionLabel, Sentence, useCalm } from "./calmKit";
import { Body, ButtonGrid, Cell, ConfirmDialog, Divided, OutlineButton, Row } from "./parts";

/** How long Pulse keeps the band after leaving the foreground, in words. */
const GRACE_WORDS = `${Math.round(BACKGROUND_GRACE_MS / 1000)} seconds`;

// ── Shared pieces ────────────────────────────────────────────────────────────

/**
 * A filled heart that beats at `bpm` while `live` (a 20 % swell on each beat). Each beat reads the current rate, so a
 * changing bpm changes the tempo without restarting the animation. Still in the background or with reduced motion.
 */
export function BeatingHeart({ bpm, live, color, size = 22 }: { bpm: number; live: boolean; color: string; size?: number }) {
  const scale = React.useState(() => new Animated.Value(1))[0];
  const rate = React.useRef(bpm);
  React.useEffect(() => {
    rate.current = bpm;
  }, [bpm]);
  const active = useAppActive();
  const reduce = useReduceMotion();
  React.useEffect(() => {
    if (!live || !active || reduce) return;
    let stopped = false;
    let beat: Animated.CompositeAnimation | null = null;
    const next = () => {
      if (stopped) return;
      const period = 60_000 / Math.min(220, Math.max(30, rate.current || 60));
      beat = Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: period * 0.3, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: period * 0.7, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]);
      beat.start(({ finished }) => finished && next());
    };
    next();
    return () => {
      stopped = true;
      beat?.stop();
      scale.setValue(1);
    };
  }, [live, active, reduce, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Heart size={size} color={color} fill={color} strokeWidth={1.75} />
    </Animated.View>
  );
}

/** "● LIVE · FITBIT AIR" in the heart coral; "RECONNECTING…" muted while the link is being rebuilt. */
export function LivePill({ name, lost = false, style }: { name: string | null; lost?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const tint = lost ? c.mutedForeground : c.heart;
  const label = lost ? "Reconnecting…" : `Live · ${name ?? "Band"}`;
  return (
    <View
      accessible
      accessibilityLabel={lost ? "Reconnecting to the band" : `Live from ${name ?? "the band"}`}
      style={[{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, height: 22, maxWidth: "100%", paddingHorizontal: 8, borderRadius: 11, backgroundColor: alpha(tint, 0.14) }, style]}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} />
      <Txt role="tag" color={tint} numberOfLines={1} style={{ flexShrink: 1, lineHeight: 14 }}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * The last 2 minutes of live bpm as a sparkline (2 s slots, ending at the newest beat, so a reconnecting link's
 * trace holds still); keeps its height while the first beats arrive.
 */
export function LiveTrace({ history, height = 56, caption = "Last 2 min" }: { history: LiveData["history"]; height?: number; caption?: string }) {
  const { c } = useTheme();
  const values = liveTrace(history, history.length ? history[history.length - 1].t : 0);
  return (
    <View style={{ height }} accessibilityLabel={`Live heart rate over the ${caption.toLowerCase()}`}>
      <Sparkline values={values} color={c.heart} caption={caption} style={{ height }} />
    </View>
  );
}

/** "HRV 42 ms" (RMSSD over the last minute), "HRV: measuring…" while too few clean beats, or null without RR. */
export function rmssdLine(l: Pick<LiveData, "rmssd" | "rrMs">): string | null {
  if (l.rmssd !== null) return `HRV ${Math.round(l.rmssd)} ms · RMSSD, last minute`;
  return l.rrMs.length ? "HRV: measuring…" : null;
}

/** The status in a few words, for rows and buttons. */
export function liveStatusLabel(l: Pick<LiveControl, "status" | "radio"> & Pick<LiveData, "bpm">): string {
  switch (l.status) {
    case "live":
      return `Live · ${l.bpm ?? MISSING} bpm`;
    case "lost":
      return "Reconnecting…";
    case "connecting":
      return "Connecting…";
    case "scanning":
      return "Searching…";
    case "unauthorized":
      return "Needs permission";
    case "off":
      return l.radio === "unsupported" ? "No Bluetooth" : l.radio === "unavailable" ? "Not available" : "Bluetooth off";
    default:
      return "Not connected";
  }
}

/**
 * Home's and the Heart rate screen's entry: "Go live" (or what the link is doing). The caller renders GoLiveSheet
 * outside any pressable card: a Modal's touches bubble up its React parents, so a sheet inside a tappable card would
 * also "tap" the card.
 */
export function GoLiveButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const live = useLiveBleControl();
  const busy = live.status === "connecting" || live.status === "scanning" || live.status === "lost";
  const label = live.status === "connecting" ? "Connecting…" : live.status === "scanning" ? "Searching…" : live.status === "lost" ? "Reconnecting…" : "Go live";
  // A solid rose pill, so it stands out on any ground: white words in the light theme, the dark ground's in the dark.
  const ink = dark ? c.ground : "#ffffff";
  return (
    <View style={[{ flexDirection: "row" }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: live heart rate over Bluetooth`}
        hitSlop={6}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c.tintInk.rose, opacity: pressed ? 0.85 : busy ? 0.9 : 1 })}
      >
        {busy ? <ActivityIndicator size="small" color={ink} /> : <Bluetooth size={16} color={ink} strokeWidth={2.25} />}
        <Txt size={14} lineHeight={18} weight={700} style={{ color: ink }}>
          {label}
        </Txt>
      </Pressable>
    </View>
  );
}

/** While live, under the band: stops it now, and it stays off (even after a restart) until the next Go live. */
export function StopLiveButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const live = useLiveBleControl();
  return (
    <View style={[{ flexDirection: "row" }, style]}>
      <Pressable
        onPress={() => void live.disconnect()}
        accessibilityRole="button"
        accessibilityLabel="Stop live heart rate"
        hitSlop={6}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5, borderColor: c.tintInk.rose, backgroundColor: c.tint.rose, opacity: pressed ? 0.8 : 1 })}
      >
        <Square size={12} color={c.tintInk.rose} fill={c.tintInk.rose} strokeWidth={2} />
        <Txt size={14} lineHeight={18} weight={700} style={{ color: c.tintInk.rose }}>
          Stop live
        </Txt>
      </Pressable>
    </View>
  );
}

// ── The how-to ───────────────────────────────────────────────────────────────

const GOOGLE_HEALTH = "com.fitbit.FitbitMobile";

const STEPS: { title: string; body: string }[] = [
  { title: "Share heart rate", body: "In Google Health, open your Fitbit Air › Connections and turn on Share heart rate." },
  { title: "Always visible (optional)", body: "Turn it on so the band keeps sharing outside workouts. It uses more of the band’s battery." },
  { title: "Connect", body: "Come back to Halo: it looks for the band. Tap it in the list to connect." },
];

function Steps() {
  const c = useCalm();
  const [missing, setMissing] = React.useState(false);
  return (
    <View style={{ gap: 14 }}>
      {/* Straight to where the setting lives. */}
      <Pressable
        onPress={() => setMissing(!openApp(GOOGLE_HEALTH))}
        accessibilityRole="button"
        accessibilityLabel="Open Google Health"
        style={({ pressed }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c.tint.mint, opacity: pressed ? 0.8 : 1 })}
      >
        <ExternalLink size={16} color={c.teal} strokeWidth={2.25} />
        <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal }}>
          Open Google Health
        </Txt>
      </Pressable>
      {missing && <Sentence color={c.tintInk.sand}>Couldn’t open Google Health. Open it from your home screen.</Sentence>}
      {STEPS.map((s, i) => (
        <View key={s.title} style={{ flexDirection: "row", gap: 14 }} accessible accessibilityLabel={`Step ${i + 1}: ${s.title}. ${s.body}`}>
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.tint.rose }}>
            <Txt size={16} lineHeight={20} style={[font.numeric(700), { color: c.tintInk.rose }]}>
              {String(i + 1)}
            </Txt>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 5 }}>
            <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
              {s.title}
            </Txt>
            <Sentence>{s.body}</Sentence>
          </View>
        </View>
      ))}
    </View>
  );
}

function Note({ icon: Icon, children }: { icon: typeof Info; children: string }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Icon size={16} color={c.faint} strokeWidth={2} style={{ marginTop: 2 }} />
      <Sentence size={13} style={{ flex: 1 }}>
        {children}
      </Sentence>
    </View>
  );
}

function Notes() {
  return (
    <View style={{ gap: 10 }}>
      <Note icon={BatteryMedium}>
        {`Sharing uses the band’s battery, and the band takes one connection at a time: while Halo holds it, gym equipment or another app can’t connect. Halo lets go ${GRACE_WORDS} after you leave it and reconnects when you come back.`}
      </Note>
      <Note icon={Info}>Live readings are for viewing; scores use what Google Health saves.</Note>
    </View>
  );
}

// ── The sheet ────────────────────────────────────────────────────────────────

function DeviceRow({ d, onPress, aside }: { d: FoundDevice; onPress: () => void; aside?: string }) {
  const c = useCalm();
  const signal = signalWord(d.rssi);
  const detail = [d.paired ? "Paired with this phone" : d.likely ? "Likely your band" : null, signal ? `${signal} signal` : null, aside ?? null].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Connect to ${d.name ?? "unnamed device"}${detail ? `, ${detail}` : ""}`}
      style={({ pressed }) => ({ minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
    >
      {/* The grouped rows' band: the tile, the name's first line and "Connect ›" on one line, the detail under the name. */}
      <IconTile icon={Watch} tint={d.likely ? "rose" : "sky"} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: (40 - 21) / 2 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
          {d.name ?? "Unnamed device"}
        </Txt>
        {!!detail && <Sentence size={13}>{detail}</Sentence>}
      </View>
      <View style={{ height: 40, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal }}>
          Connect
        </Txt>
        <ChevronRight size={18} color={c.teal} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

/** A tinted panel with an icon and a line or two: the band section's state when there is no list to show. */
function Panel({ icon, title, body, tone = "muted" }: { icon: React.ReactNode; title: string; body?: string | null; tone?: "muted" | "heart" | "warn" }) {
  const c = useCalm();
  const bg = tone === "heart" ? c.tint.rose : tone === "warn" ? c.tint.sand : c.ground;
  return (
    <View accessibilityRole="summary" style={{ flexDirection: "row", gap: 14, alignItems: "center", borderRadius: 20, backgroundColor: bg, padding: 16 }}>
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.chip, alignItems: "center", justifyContent: "center" }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
          {title}
        </Txt>
        {!!body && <Sentence>{body}</Sentence>}
      </View>
    </View>
  );
}

function secondsUntil(at: number | null, now: number) {
  return at === null ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/** The band section of the sheet: what the link is doing, or the scan's list. */
function BandState({ live, onConnect }: { live: LiveControl & LiveData; onConnect: (id: string) => void }) {
  const c = useCalm();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (live.retryAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live.retryAt]);
  const name = live.device?.name ?? live.remembered?.name ?? "the band";

  if (live.status === "off") {
    if (live.radio === "unsupported" || live.radio === "unavailable")
      return (
        <Panel
          icon={<BluetoothOff size={20} color={c.sub} strokeWidth={2} />}
          title={live.radio === "unsupported" ? "No Bluetooth here" : "Bluetooth isn’t available"}
          body={live.radio === "unsupported" ? "This phone (or emulator) has no Bluetooth Low Energy, so live heart rate can’t work on it." : "This build of Halo can’t use Bluetooth."}
        />
      );
    return <Panel icon={<BluetoothOff size={20} color={c.tintInk.sand} strokeWidth={2} />} tone="warn" title="Bluetooth is off" body="Turn it on to find your band." />;
  }
  if (live.status === "unauthorized")
    return (
      <Panel
        icon={<Bluetooth size={20} color={c.tintInk.sand} strokeWidth={2} />}
        tone="warn"
        title="Allow Nearby devices"
        body={
          live.permission === "blocked"
            ? "Nearby devices is off for Halo. Allow it in Android settings › Apps › Halo › Permissions."
            : "Halo needs it to find and connect to your band. It doesn’t use your location."
        }
      />
    );
  if (showsLive(live))
    return (
      <View accessibilityRole="summary" style={{ flexDirection: "row", gap: 16, alignItems: "center", borderRadius: 24, backgroundColor: c.tint.rose, padding: 18 }}>
        <View style={{ width: 52, height: 52, borderRadius: 17, backgroundColor: c.chip, alignItems: "center", justifyContent: "center" }}>
          <BeatingHeart bpm={live.bpm ?? 60} live={live.status === "live"} color={c.tintInk.rose} size={26} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Num value={live.bpm === null ? MISSING : String(live.bpm)} unit="bpm" size={34} color={c.tintInk.rose} />
          <LivePill name={live.device?.name ?? null} lost={live.status === "lost"} />
        </View>
      </View>
    );
  if (live.status === "connecting" || live.status === "lost") {
    const wait = secondsUntil(live.retryAt, now);
    return (
      <Panel
        icon={<ActivityIndicator size="small" color={c.tintInk.rose} />}
        tone="heart"
        title={`${live.status === "lost" ? "Reconnecting to" : "Connecting to"} ${name}…`}
        body={wait !== null && wait > 0 ? `${live.error ? `${live.error} ` : ""}Trying again in ${wait} s.` : live.error}
      />
    );
  }

  // idle / scanning: the list.
  const remembered = live.remembered && !live.found.some((d) => d.id === live.remembered!.id) ? live.remembered : null;
  return (
    <View style={{ gap: 4 }}>
      {live.status === "scanning" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
          <ActivityIndicator size="small" color={c.tintInk.rose} />
          <Sentence style={{ flex: 1 }}>Looking for bands sharing heart rate…</Sentence>
        </View>
      )}
      <Divided>
        {live.found.map((d) => (
          <DeviceRow key={d.id} d={d} onPress={() => onConnect(d.id)} aside={live.remembered?.id === d.id ? "Last used" : undefined} />
        ))}
        {remembered && (
          <DeviceRow
            key={remembered.id}
            d={{ id: remembered.id, name: remembered.name, rssi: null, likely: true }}
            onPress={() => onConnect(remembered.id)}
            aside={live.status === "scanning" ? "Last used, not seen yet" : "Last used"}
          />
        )}
      </Divided>
      {live.status === "idle" && !!live.error && (
        <Sentence color={c.tintInk.sand} weight={600} style={{ marginTop: 8 }} accessibilityRole="alert">
          {live.error}
        </Sentence>
      )}
    </View>
  );
}

/**
 * The Go-live sheet: the three steps in Google Health, then the band — a scan that starts on its own when Bluetooth
 * is ready (and again on coming back from Google Health), the bands it finds, the connection. The footer holds the
 * one action the state calls for.
 */
export function GoLiveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useCalm();
  const live = useLiveBle();
  const ctl = useLiveBleControl();
  const latest = React.useRef(ctl);
  React.useEffect(() => {
    latest.current = ctl;
  });
  const [btHint, setBtHint] = React.useState<string | null>(null);

  // Scan on opening (or once the controller has loaded) and on returning from Google Health, while nothing is
  // connected or connecting. Closing stops a scan still running.
  const loaded = live.loaded;
  React.useEffect(() => {
    if (!open || !loaded) return;
    const kick = () => {
      const s = latest.current;
      if (s.status === "idle") void s.scan();
    };
    kick();
    const sub = AppState.addEventListener("change", (st) => st === "active" && kick());
    return () => {
      sub.remove();
      latest.current.stopScan();
    };
  }, [open, loaded]);
  // …and as soon as the permission is granted or Bluetooth comes on from this sheet's own buttons.
  const status = live.status;
  const prevStatus = React.useRef(status);
  React.useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (open && status === "idle" && (was === "off" || was === "unauthorized")) void latest.current.scan();
  }, [open, status]);

  const turnOn = async () => {
    const ok = await live.turnOnBluetooth();
    setBtHint(ok ? null : "Turn Bluetooth on from Quick Settings, then come back.");
  };

  let footer: React.ReactNode;
  if (live.status === "off")
    footer =
      live.radio === "unsupported" || live.radio === "unavailable" ? (
        <CalmButton variant="secondary" on="card" onPress={onClose}>
          Close
        </CalmButton>
      ) : (
        <CalmButton onPress={() => void turnOn()}>Turn on Bluetooth</CalmButton>
      );
  else if (live.status === "unauthorized")
    footer = (
      <CalmButton onPress={() => void live.requestPermission()}>{live.permission === "blocked" ? "Open settings" : "Allow Nearby devices"}</CalmButton>
    );
  else if (live.status === "live")
    footer = (
      <>
        <CalmButton onPress={onClose}>Done</CalmButton>
        <CalmButton variant="secondary" on="card" onPress={() => void live.disconnect()}>
          Disconnect
        </CalmButton>
      </>
    );
  else if (live.status === "connecting" || live.status === "lost")
    footer = (
      <CalmButton variant="secondary" on="card" onPress={() => void live.disconnect()}>
        Cancel
      </CalmButton>
    );
  else if (live.status === "scanning")
    footer = (
      <CalmButton variant="secondary" on="card" onPress={live.stopScan}>
        Stop searching
      </CalmButton>
    );
  else
    footer = (
      <CalmButton onPress={() => void live.scan()}>{live.found.length || live.error ? "Search again" : "Search for my band"}</CalmButton>
    );

  return (
    <BottomSheet open={open} onClose={onClose} title="Live heart rate" description="Beat by beat from your band, over Bluetooth" footer={footer}>
      <View style={{ gap: 16 }}>
        <SectionLabel style={{ paddingHorizontal: 0 }}>How to</SectionLabel>
        <Steps />
        <SectionLabel style={{ paddingHorizontal: 0, marginTop: 8 }}>Your band</SectionLabel>
        <BandState live={live} onConnect={(id) => void live.connect(id)} />
        {!!btHint && live.status === "off" && (
          <Sentence color={c.tintInk.sand} weight={600}>
            {btHint}
          </Sentence>
        )}
        <SectionLabel style={{ paddingHorizontal: 0, marginTop: 8 }}>Good to know</SectionLabel>
        <Notes />
      </View>
    </BottomSheet>
  );
}

// ── Settings › Live heart rate ───────────────────────────────────────────────

function SwitchRow({ label, caption, value, onChange, disabled }: { label: string; caption?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useCalm();
  // The grouped rows' 40 px band: the switch and the label's first line centred on it, the caption hanging below, so
  // every switch sits on its label's line however the caption wraps.
  return (
    <View style={{ minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: (40 - 21) / 2 }}>
        <Txt size={16} lineHeight={21} weight={600} style={{ color: c.ink }}>
          {label}
        </Txt>
        {!!caption && <Sentence>{caption}</Sentence>}
      </View>
      <View style={{ marginTop: (40 - 32) / 2 }}>
        <CalmSwitch value={value} onChange={onChange} disabled={disabled} label={label} />
      </View>
    </View>
  );
}

function BandCard({ live, onFind }: { live: LiveControl & LiveData; onFind: () => void }) {
  const c = useCalm();
  const [confirmForget, setConfirmForget] = React.useState(false);
  const linked = live.status === "live" || live.status === "connecting" || live.status === "lost";
  const noRadio = live.radio === "unsupported" || live.radio === "unavailable";
  const remembered = live.remembered;
  return (
    <Group title="Live heart rate" padding={20} gap={4}>
      <Divided>
        <Row label="Status" value={liveStatusLabel(live)} valueColor={live.status === "live" ? "heart" : "foregroundSecondary"} />
        <Row label="Band" value={remembered ? (remembered.name ?? "Unnamed band") : "None yet"} />
        {live.status === "live" &&
          (live.rmssd === null ? (
            <Row label="HRV (RMSSD)" value={live.rrMs.length ? "Measuring…" : "Not sent by the band"} />
          ) : (
            <Row label="HRV (RMSSD)" value={String(Math.round(live.rmssd))} unit="ms" numeric />
          ))}
        <SwitchRow
          label="Connect automatically"
          caption="Off by default to save the band’s battery. On: Halo connects whenever it opens and the band is sharing"
          value={live.autoConnect}
          onChange={(v) => void live.setAutoConnect(v)}
          disabled={!remembered}
        />
      </Divided>
      {!!live.error && !linked && (
        <Sentence color={c.tintInk.sand} weight={600} style={{ marginTop: 8 }} accessibilityRole="alert">
          {live.error}
        </Sentence>
      )}
      <ButtonGrid>
        <Cell>
          {linked ? (
            <OutlineButton onPress={() => void live.disconnect()}>Disconnect</OutlineButton>
          ) : (
            <OutlineButton onPress={() => (remembered ? void live.connect(remembered.id) : onFind())} disabled={noRadio}>
              {remembered ? "Connect" : "Find a band"}
            </OutlineButton>
          )}
        </Cell>
        <Cell>
          <OutlineButton onPress={onFind}>{remembered ? "Change band" : "How to"}</OutlineButton>
        </Cell>
        {remembered && (
          <Cell wide>
            <OutlineButton danger onPress={() => setConfirmForget(true)}>
              Forget this band
            </OutlineButton>
          </Cell>
        )}
      </ButtonGrid>
      <ConfirmDialog
        open={confirmForget}
        onClose={() => setConfirmForget(false)}
        title="Forget this band?"
        description="Halo disconnects and stops reconnecting to it. Search again to pick a band."
        confirm="Forget band"
        danger
        onConfirm={async () => {
          await live.forget();
          setConfirmForget(false);
        }}
      />
    </Group>
  );
}

function PermissionsCard({ live }: { live: LiveControl & LiveData }) {
  const c = useCalm();
  const [btHint, setBtHint] = React.useState<string | null>(null);
  const noRadio = live.radio === "unsupported" || live.radio === "unavailable";
  const permission = live.permission === "granted" ? "Allowed" : live.permission === "blocked" ? "Blocked in Android settings" : "Not allowed yet";
  const radio = live.radio === "on" ? "On" : live.radio === "off" ? "Off" : live.radio === "turning" ? "Turning on or off" : noRadio ? "Not available" : "Unknown";
  return (
    <Group title="Permissions" padding={20} gap={4}>
      <Divided>
        <Row label="Nearby devices" value={permission} valueColor={live.permission === "granted" ? "foregroundSecondary" : "warning"} />
        <Row label="Bluetooth" value={radio} valueColor={live.radio === "on" ? "foregroundSecondary" : "warning"} />
      </Divided>
      <Body style={{ marginTop: 4 }}>Android asks for Nearby devices (scan and connect) only. Halo never uses your location for this.</Body>
      {(live.permission !== "granted" || (live.radio === "off" && !noRadio)) && (
        <ButtonGrid>
          {live.permission !== "granted" && (
            <Cell wide>
              <CalmButton onPress={() => void live.requestPermission()}>{live.permission === "blocked" ? "Open Android settings" : "Allow Nearby devices"}</CalmButton>
            </Cell>
          )}
          {live.permission === "granted" && live.radio === "off" && (
            <Cell wide>
              <CalmButton onPress={() => void live.turnOnBluetooth().then((ok) => setBtHint(ok ? null : "Turn Bluetooth on from Quick Settings."))}>Turn on Bluetooth</CalmButton>
            </Cell>
          )}
        </ButtonGrid>
      )}
      {!!btHint && (
        <Sentence color={c.tintInk.sand} weight={600} style={{ marginTop: 8 }}>
          {btHint}
        </Sentence>
      )}
    </Group>
  );
}

/** Settings › Live heart rate (`/settings?s=live`). */
export function LiveHrSection() {
  const live = useLiveBle();
  const [sheet, setSheet] = React.useState(false);
  return (
    <>
      <BandCard live={live} onFind={() => setSheet(true)} />
      <PermissionsCard live={live} />
      <Group title="How it works" padding={20} gap={20}>
        <Steps />
        <Notes />
      </Group>
      <GoLiveSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

export default LiveHrSection;
