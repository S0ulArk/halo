// Live heart rate over Bluetooth, the UI: the pieces Home's card and the Heart rate screen share (the beating heart,
// the "Live · Fitbit Air" pill, the 2-minute trace, the Go live and Stop live capsules), the Go-live sheet (the three
// steps in Google Health, then scan and connect, as iOS grouped lists), and Settings › Live heart rate
// (`/settings?s=live`) as an iOS settings page: the feature header (with the live bpm and its beating heart while
// connected), the remembered band, auto-connect, connect / change / forget, permissions and the how-to.
//
// The band shares heart rate with the standard Bluetooth Heart Rate Service once Google Health › Fitbit Air ›
// Connections › Share heart rate is on (src/health/ble.ts). Live readings are for viewing only: scores keep using
// what Google Health saves to Health Connect.
import * as React from "react";
import { ActivityIndicator, AppState, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { BatteryMedium, Bluetooth, BluetoothOff, ExternalLink, Heart, Info, Square, Watch, type LucideIcon } from "lucide-react-native";
import { BACKGROUND_GRACE_MS } from "@/health/ble";
import { liveTrace, signalWord } from "@/health/bleHr";
import { MISSING } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { showsLive, useLiveBle, useLiveBleControl, type FoundDevice, type LiveControl, type LiveData } from "@/state/liveBle";
import { BottomSheet, Sparkline, Txt, useAppActive, useReduceMotion, useTheme } from "@/ui";
import { usePress, usePressStyle } from "@/ui/components/press";
import { RiseEach } from "@/ui/motion/Rise";
import { openApp } from "../../../modules/pulse-bt";
import { CalmButton, Num, useCalm } from "./calmKit";
import { ButtonRow, HeroCard, InfoRow, InsetGroup, NavRow, RowBox, Step, SwitchRow, useCardFill } from "./list";
import { ConfirmDialog } from "./parts";

/** How long Halo keeps the band after leaving the foreground, in words. */
const GRACE_WORDS = `${Math.round(BACKGROUND_GRACE_MS / 1000)} seconds`;

// ── Shared pieces ────────────────────────────────────────────────────────────

/**
 * A filled heart that beats at `bpm` while `live` (a 20 % swell on each beat: a quick rise over the first 30 % of the
 * beat, a slow fall over the rest). The beat's phase runs on the UI thread in a frame callback and moves on by each
 * frame's share of the current beat, so a changing bpm changes the tempo smoothly without restarting. Still in the
 * background or with reduced motion.
 */
export function BeatingHeart({ bpm, live, color, size = 22 }: { bpm: number; live: boolean; color: string; size?: number }) {
  const rate = useSharedValue(bpm);
  const phase = useSharedValue(0);
  const active = useAppActive();
  const reduce = useReduceMotion();
  const beat = useFrameCallback((f) => {
    "worklet";
    const period = 60_000 / Math.min(220, Math.max(30, rate.value || 60));
    phase.value = (phase.value + (f.timeSincePreviousFrame ?? 16) / period) % 1;
  }, false);
  React.useEffect(() => {
    rate.set(bpm);
  }, [bpm, rate]);
  React.useEffect(() => {
    const on = live && active && !reduce;
    beat.setActive(on);
    if (!on) phase.set(0);
    return () => beat.setActive(false);
  }, [live, active, reduce, beat, phase]);
  const style = useAnimatedStyle(() => {
    const p = phase.value;
    // Ease out on the swell, ease in and out on the fall.
    const up = p < 0.3 ? 1 - (1 - p / 0.3) * (1 - p / 0.3) : 1;
    const q = p < 0.3 ? 0 : (p - 0.3) / 0.7;
    const down = q < 0.5 ? 2 * q * q : 1 - 2 * (1 - q) * (1 - q);
    return { transform: [{ scale: 1 + 0.2 * (p < 0.3 ? up : 1 - down) }] };
  });
  return (
    <Animated.View style={style}>
      <Heart size={size} color={color} fill={color} strokeWidth={1.75} />
    </Animated.View>
  );
}

/** "● LIVE · FITBIT AIR" in the heart colour; "RECONNECTING…" in grey while the link is being rebuilt. */
export function LivePill({ name, lost = false, style }: { name: string | null; lost?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const tint = lost ? c.mutedForeground : c.heart;
  const label = lost ? "Reconnecting…" : `Live · ${name ?? "Band"}`;
  return (
    <View
      accessible
      accessibilityLabel={lost ? "Reconnecting to the band" : `Live from ${name ?? "the band"}`}
      style={[{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, height: 24, maxWidth: "100%", paddingHorizontal: 9, borderRadius: 12, backgroundColor: alpha(tint, 0.14) }, style]}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} />
      <Txt role="tag" color={tint} numberOfLines={1} style={{ flexShrink: 1, lineHeight: 16 }}>
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

/** A 40 px capsule with the kit's press (it settles and dims, springing back), for the live controls. */
function Capsule({ onPress, accessibilityLabel, filled, children, style }: { onPress: () => void; accessibilityLabel: string; filled: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const press = usePress(0.95);
  const pressed = usePressStyle(press, { dim: filled ? 0.85 : 0.7 });
  return (
    <View style={[{ flexDirection: "row" }, style]}>
      <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={6}>
        <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 7, height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: filled ? c.system.pink : alpha(c.system.pink, 0.15) }, pressed]}>
          {children}
        </Animated.View>
      </Pressable>
    </View>
  );
}

/**
 * Home's and the Heart rate screen's entry: "Go live" (or what the link is doing), a filled pink capsule. The caller
 * renders GoLiveSheet outside any pressable card: a sheet's touches bubble up its React parents, so a sheet inside a
 * tappable card would also "tap" the card.
 */
export function GoLiveButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const live = useLiveBleControl();
  const busy = live.status === "connecting" || live.status === "scanning" || live.status === "lost";
  const label = live.status === "connecting" ? "Connecting…" : live.status === "scanning" ? "Searching…" : live.status === "lost" ? "Reconnecting…" : "Go live";
  return (
    <Capsule onPress={onPress} accessibilityLabel={`${label}: live heart rate over Bluetooth`} filled style={style}>
      {busy ? <ActivityIndicator size="small" color="#ffffff" /> : <Bluetooth size={16} color="#ffffff" strokeWidth={2.4} />}
      <Txt size={15} lineHeight={20} weight={600} style={{ color: "#ffffff" }}>
        {label}
      </Txt>
    </Capsule>
  );
}

/** While live, under the band: stops it now, and it stays off (even after a restart) until the next Go live. */
export function StopLiveButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const live = useLiveBleControl();
  return (
    <Capsule onPress={() => void live.disconnect()} accessibilityLabel="Stop live heart rate" filled={false} style={style}>
      <Square size={12} color={c.system.pink} fill={c.system.pink} strokeWidth={2} />
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.system.pink }}>
        Stop live
      </Txt>
    </Capsule>
  );
}

// ── The how-to ───────────────────────────────────────────────────────────────

const GOOGLE_HEALTH = "com.fitbit.FitbitMobile";

const STEPS: { title: string; body: string }[] = [
  { title: "Share heart rate", body: "In Google Health, open your Fitbit Air › Connections and turn on Share heart rate." },
  { title: "Always visible (optional)", body: "Turn it on so the band keeps sharing outside workouts. It uses more of the band’s battery." },
  { title: "Connect", body: "Come back to Halo: it looks for the band. Tap it in the list to connect." },
];

/** The three steps, numbered, with the way straight to where the setting lives. */
function Steps() {
  const c = useCalm();
  const [missing, setMissing] = React.useState(false);
  return (
    <View style={{ gap: 16 }}>
      {STEPS.map((s, i) => (
        <Step key={s.title} n={i + 1} title={s.title} tint="rose">
          {s.body}
        </Step>
      ))}
      <CalmButton variant="secondary" size="md" icon={ExternalLink} onPress={() => setMissing(!openApp(GOOGLE_HEALTH))} style={{ alignSelf: "flex-start" }} accessibilityLabel="Open Google Health">
        Open Google Health
      </CalmButton>
      {missing && (
        <Txt size={15} lineHeight={20} style={{ color: c.tintInk.sand }}>
          Couldn’t open Google Health. Open it from your home screen.
        </Txt>
      )}
    </View>
  );
}

function Note({ icon: Icon, children }: { icon: typeof Info; children: string }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Icon size={16} color={c.sub} strokeWidth={2} style={{ marginTop: 2 }} />
      <Txt size={14} lineHeight={19} style={{ flex: 1, color: c.sub }}>
        {children}
      </Txt>
    </View>
  );
}

function Notes() {
  return (
    <View style={{ gap: 12 }}>
      <Note icon={BatteryMedium}>
        {`Sharing uses the band’s battery, and the band takes one connection at a time: while Halo holds it, gym equipment or another app can’t connect. Halo lets go ${GRACE_WORDS} after you leave it and reconnects when you come back.`}
      </Note>
      <Note icon={Info}>Live readings are for viewing; scores use what Google Health saves.</Note>
    </View>
  );
}

// ── The sheet ────────────────────────────────────────────────────────────────

/** A band the scan found: its watch square, its name and what Halo knows of it, then "Connect". */
function DeviceRow({ d, onPress, aside }: { d: FoundDevice; onPress: () => void; aside?: string }) {
  const signal = signalWord(d.rssi);
  const detail = [d.paired ? "Paired with this phone" : d.likely ? "Likely your band" : null, signal ? `${signal} signal` : null, aside ?? null].filter(Boolean).join(" · ");
  return (
    <NavRow
      icon={Watch}
      system={d.likely ? "pink" : "blue"}
      label={d.name ?? "Unnamed device"}
      description={detail || undefined}
      value="Connect"
      onPress={onPress}
      accessibilityLabel={`Connect to ${d.name ?? "unnamed device"}${detail ? `, ${detail}` : ""}`}
    />
  );
}

/** The band section's state when there is no list to show: a row with its icon square, a title and a line or two. */
function Panel({ icon, node, system, title, body }: { icon?: LucideIcon; node?: React.ReactNode; system: "gray" | "pink" | "yellow"; title: string; body?: string | null }) {
  return (
    <InsetGroup>
      <NavRow icon={icon} iconNode={node} system={system} label={title} description={body ?? undefined} action />
    </InsetGroup>
  );
}

function secondsUntil(at: number | null, now: number) {
  return at === null ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/** The band section of the sheet: what the link is doing, or the scan's list. */
function BandState({ live, onConnect }: { live: LiveControl & LiveData; onConnect: (id: string) => void }) {
  const c = useCalm();
  const fill = useCardFill();
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
          icon={BluetoothOff}
          system="gray"
          title={live.radio === "unsupported" ? "No Bluetooth here" : "Bluetooth isn’t available"}
          body={live.radio === "unsupported" ? "This phone (or emulator) has no Bluetooth Low Energy, so live heart rate can’t work on it." : "This build of Halo can’t use Bluetooth."}
        />
      );
    return <Panel icon={BluetoothOff} system="yellow" title="Bluetooth is off" body="Turn it on to find your band." />;
  }
  if (live.status === "unauthorized")
    return (
      <Panel
        icon={Bluetooth}
        system="yellow"
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
      <View accessibilityRole="summary" style={{ flexDirection: "row", gap: 16, alignItems: "center", borderRadius: 20, backgroundColor: fill, padding: 18 }}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.tint.rose, alignItems: "center", justifyContent: "center" }}>
          <BeatingHeart bpm={live.bpm ?? 60} live={live.status === "live"} color={c.system.pink} size={26} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Num value={live.bpm === null ? MISSING : String(live.bpm)} unit="bpm" size={34} color={c.system.pink} />
          <LivePill name={live.device?.name ?? null} lost={live.status === "lost"} />
        </View>
      </View>
    );
  if (live.status === "connecting" || live.status === "lost") {
    const wait = secondsUntil(live.retryAt, now);
    return (
      <Panel
        node={<ActivityIndicator size="small" color="#ffffff" />}
        system="pink"
        title={`${live.status === "lost" ? "Reconnecting to" : "Connecting to"} ${name}…`}
        body={wait !== null && wait > 0 ? `${live.error ? `${live.error} ` : ""}Trying again in ${wait} s.` : live.error}
      />
    );
  }

  // idle / scanning: the list.
  const remembered = live.remembered && !live.found.some((d) => d.id === live.remembered!.id) ? live.remembered : null;
  return (
    <View style={{ gap: 8 }}>
      {live.status === "scanning" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 4 }}>
          <ActivityIndicator size="small" color={c.system.pink} />
          <Txt size={15} lineHeight={20} style={{ flex: 1, color: c.sub }}>
            Looking for bands sharing heart rate…
          </Txt>
        </View>
      )}
      {(live.found.length > 0 || remembered) && (
        <InsetGroup>
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
        </InsetGroup>
      )}
      {live.status === "idle" && !!live.error && (
        <Txt size={15} lineHeight={20} weight={500} accessibilityRole="alert" style={{ color: c.tintInk.sand, paddingHorizontal: 16 }}>
          {live.error}
        </Txt>
      )}
    </View>
  );
}

/** A group's header inside the sheet, iOS's small grey capitals. */
function SheetLabel({ children }: { children: string }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} accessibilityRole="header" style={{ color: c.sub, paddingHorizontal: 16, marginBottom: -4 }}>
      {children.toUpperCase()}
    </Txt>
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
        <CalmButton variant="secondary" onPress={onClose}>
          Close
        </CalmButton>
      ) : (
        <CalmButton onPress={() => void turnOn()}>Turn on Bluetooth</CalmButton>
      );
  else if (live.status === "unauthorized") footer = <CalmButton onPress={() => void live.requestPermission()}>{live.permission === "blocked" ? "Open settings" : "Allow Nearby devices"}</CalmButton>;
  else if (live.status === "live")
    footer = (
      <>
        <CalmButton onPress={onClose}>Done</CalmButton>
        <CalmButton variant="secondary" onPress={() => void live.disconnect()}>
          Disconnect
        </CalmButton>
      </>
    );
  else if (live.status === "connecting" || live.status === "lost")
    footer = (
      <CalmButton variant="secondary" onPress={() => void live.disconnect()}>
        Cancel
      </CalmButton>
    );
  else if (live.status === "scanning")
    footer = (
      <CalmButton variant="secondary" onPress={live.stopScan}>
        Stop searching
      </CalmButton>
    );
  else footer = <CalmButton onPress={() => void live.scan()}>{live.found.length || live.error ? "Search again" : "Search for my band"}</CalmButton>;

  return (
    <BottomSheet open={open} onClose={onClose} title="Live heart rate" description="Beat by beat from your band, over Bluetooth" footer={footer}>
      <View style={{ gap: 18 }}>
        <SheetLabel>How to</SheetLabel>
        <InsetGroup>
          <RowBox style={{ paddingVertical: 16 }}>
            <Steps />
          </RowBox>
        </InsetGroup>
        <SheetLabel>Your band</SheetLabel>
        <BandState live={live} onConnect={(id) => void live.connect(id)} />
        {!!btHint && live.status === "off" && (
          <Txt size={15} lineHeight={20} weight={500} style={{ color: c.tintInk.sand, paddingHorizontal: 16 }}>
            {btHint}
          </Txt>
        )}
        <SheetLabel>Good to know</SheetLabel>
        <View style={{ paddingHorizontal: 16 }}>
          <Notes />
        </View>
      </View>
    </BottomSheet>
  );
}

// ── Settings › Live heart rate ───────────────────────────────────────────────

/** The page's feature header: the Bluetooth square, the status, and while live the bpm with its beating heart. */
function LiveHead({ live }: { live: LiveControl & LiveData }) {
  const c = useCalm();
  const on = showsLive(live);
  return (
    <HeroCard
      icon={Bluetooth}
      system="blue"
      title="Live heart rate"
      status={liveStatusLabel(live)}
      statusColor={live.status === "live" ? c.system.pink : undefined}
      body="Beat by beat from your band, over Bluetooth."
    >
      {on ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <BeatingHeart bpm={live.bpm ?? 60} live={live.status === "live"} color={c.system.pink} size={26} />
          <Num value={live.bpm === null ? MISSING : String(live.bpm)} unit="bpm" size={34} color={c.system.pink} />
        </View>
      ) : null}
    </HeroCard>
  );
}

function BandGroups({ live, onFind }: { live: LiveControl & LiveData; onFind: () => void }) {
  const c = useCalm();
  const [confirmForget, setConfirmForget] = React.useState(false);
  const linked = live.status === "live" || live.status === "connecting" || live.status === "lost";
  const noRadio = live.radio === "unsupported" || live.radio === "unavailable";
  const remembered = live.remembered;
  return (
    <View style={{ gap: 28 }}>
      <InsetGroup title="Band" footer={!!live.error && !linked ? live.error : undefined}>
        <InfoRow label="Status" value={liveStatusLabel(live)} valueColor={live.status === "live" ? c.system.pink : undefined} />
        <InfoRow label="Band" value={remembered ? (remembered.name ?? "Unnamed band") : "None yet"} />
        {live.status === "live" &&
          (live.rmssd === null ? (
            <InfoRow label="HRV (RMSSD)" value={live.rrMs.length ? "Measuring…" : "Not sent by the band"} />
          ) : (
            <InfoRow label="HRV (RMSSD)" value={String(Math.round(live.rmssd))} unit="ms" numeric />
          ))}
        <SwitchRow
          label="Connect automatically"
          description="Off by default to save the band’s battery. On: Halo connects whenever it opens and the band is sharing"
          value={live.autoConnect}
          onChange={(v) => void live.setAutoConnect(v)}
          disabled={!remembered}
        />
      </InsetGroup>
      <InsetGroup>
        {linked ? (
          <ButtonRow label="Disconnect" onPress={() => void live.disconnect()} />
        ) : (
          <ButtonRow label={remembered ? "Connect" : "Find a band"} onPress={() => (remembered ? void live.connect(remembered.id) : onFind())} disabled={noRadio} />
        )}
        <ButtonRow label={remembered ? "Change band" : "How to"} onPress={onFind} />
        {remembered && <ButtonRow label="Forget this band" danger onPress={() => setConfirmForget(true)} />}
      </InsetGroup>
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
    </View>
  );
}

function Permissions({ live }: { live: LiveControl & LiveData }) {
  const c = useCalm();
  const [btHint, setBtHint] = React.useState<string | null>(null);
  const noRadio = live.radio === "unsupported" || live.radio === "unavailable";
  const permission = live.permission === "granted" ? "Allowed" : live.permission === "blocked" ? "Blocked in Android settings" : "Not allowed yet";
  const radio = live.radio === "on" ? "On" : live.radio === "off" ? "Off" : live.radio === "turning" ? "Turning on or off" : noRadio ? "Not available" : "Unknown";
  return (
    <InsetGroup title="Permissions" footer={btHint ?? "Android asks for Nearby devices (scan and connect) only. Halo never uses your location for this."}>
      <InfoRow label="Nearby devices" value={permission} valueColor={live.permission === "granted" ? undefined : c.tintInk.sand} />
      <InfoRow label="Bluetooth" value={radio} valueColor={live.radio === "on" ? undefined : c.tintInk.sand} />
      {live.permission !== "granted" && <ButtonRow label={live.permission === "blocked" ? "Open Android settings" : "Allow Nearby devices"} onPress={() => void live.requestPermission()} />}
      {live.permission === "granted" && live.radio === "off" && !noRadio && (
        <ButtonRow label="Turn on Bluetooth" onPress={() => void live.turnOnBluetooth().then((ok) => setBtHint(ok ? null : "Turn Bluetooth on from Quick Settings."))} />
      )}
    </InsetGroup>
  );
}

/** Settings › Live heart rate (`/settings?s=live`). */
export function LiveHrSection() {
  const live = useLiveBle();
  const [sheet, setSheet] = React.useState(false);
  return (
    <>
      <RiseEach>
        <LiveHead live={live} />
        <BandGroups live={live} onFind={() => setSheet(true)} />
        <Permissions live={live} />
        <InsetGroup title="How it works">
          <RowBox style={{ paddingVertical: 16 }}>
            <Steps />
          </RowBox>
          <RowBox style={{ paddingVertical: 14 }}>
            <Notes />
          </RowBox>
        </InsetGroup>
      </RiseEach>
      <GoLiveSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}
