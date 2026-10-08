// Home's "Heart rate" card. Two sources:
//
// - Live, over Bluetooth (src/state/liveBle.tsx): while the band shares heart rate and Pulse is connected, the card
//   shows the band's own bpm with the heart beating at that rate, a "Live · Fitbit Air" pill, the last 2 minutes as a
//   trace and the live RMSSD when the band sends RR intervals. Display-only: scores never see these readings.
// - Otherwise the newest reading Health Connect holds, which is as live as the Google Health sync makes it (the web's
//   LiveHeartRate hero, cut down to a card). The app state's foreground ticker refreshes it every minute; the heart
//   beats at the reading's rate while it is under 5 minutes old, and past 10 minutes a line says where the number
//   comes from, so a stale reading never passes for a live one. A "Go live" button opens the Bluetooth sheet.
import * as React from "react";
import { View } from "react-native";
import { minuteMeanHr } from "@/core/algorithms/stress";
import { ago, clock, MISSING } from "@/lib/format";
import { localDay } from "@/lib/time";
import { RECENT_MINUTES } from "@/health/live";
import { useApp, useLiveHr } from "@/state/app";
import { showsLive, useLiveBle, type LiveControl, type LiveData } from "@/state/liveBle";
import { SectionShell, SkeletonText, Sparkline, Txt, useTheme, ValueUnit } from "@/ui";
import { BeatingHeart, GoLiveButton, GoLiveSheet, LivePill, LiveTrace, rmssdLine } from "../settings/liveHr";
import { useNow } from "./status";

/** A reading this recent counts as live: the band, the phone and Health Connect take a minute or three between them. */
const LIVE_MS = 5 * 60_000;
/** Older than this, the card says the number is a sync, not a pulse. */
const STALE_MS = 10 * 60_000;

/** "2 minutes ago" under an hour; "Updated 14:32" later the same day; "14 hours ago" / "2 days ago" beyond. */
export function readingAge(ts: number, now: number, timeZone: string) {
  const ms = ts * 1000;
  if (now - ms < 60 * 60_000) return ago(ms, now);
  if (localDay(ts, timeZone) === localDay(Math.floor(now / 1000), timeZone)) return `Updated ${clock(ms, timeZone)}`;
  return ago(ms, now);
}

/** Minute means of the 30 minutes ending at the newest sample's minute; a minute without a sample is a gap. */
export function recentMinutes(samples: { ts: number; bpm: number }[], latestTs: number): (number | null)[] {
  const end = Math.floor(latestTs / 60) * 60 + 60;
  const start = end - RECENT_MINUTES * 60;
  return minuteMeanHr(samples, start, end).map((v) => (v === null ? null : Math.round(v)));
}

/** The live body: the band's bpm, the pill, the 2-minute trace and the HRV line. */
function LiveBody({ live }: { live: LiveControl & LiveData }) {
  const { c } = useTheme();
  // A band that goes quiet is caught by the controller (15 s without a beat → "lost", reconnecting).
  const lost = live.status !== "live";
  const name = live.device?.name ?? null;
  const note = live.contact === false ? "No skin contact: wear the band snug." : rmssdLine(live);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={{ flexShrink: 0, maxWidth: "55%" }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            accessible
            accessibilityLabel={`${lost ? "Reconnecting. Last live reading" : "Live heart rate"} ${live.bpm ?? "unknown"} beats per minute${name ? ` from ${name}` : ""}`}
          >
            <BeatingHeart bpm={live.bpm ?? 60} live={!lost} color={c.heart} />
            <ValueUnit value={live.bpm === null ? MISSING : String(live.bpm)} unit="bpm" role="valueXl" size={36} lineHeight={40} color={lost ? c.mutedForeground : undefined} />
          </View>
          <LivePill name={name} lost={lost} style={{ marginTop: 6 }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <LiveTrace history={live.history} />
        </View>
      </View>
      {!!note && (
        <Txt role="caption" color={live.contact === false ? "warning" : "mutedForeground"} style={{ marginTop: 10, fontVariant: ["tabular-nums"] }}>
          {note}
        </Txt>
      )}
    </View>
  );
}

/**
 * The card. `phoneOnly` is Home's "no band, phone steps only" day (spec §11 CD2): with no reading at all the card
 * stays out of the way there, as the monitor cards do, unless the band is live. Tapping refreshes the Health Connect
 * reading and opens the Heart rate screen.
 */
export function HeartRateCard({ phoneOnly, onOpen }: { phoneOnly?: boolean; onOpen: () => void }) {
  const app = useApp();
  const liveHrCtx = useLiveHr();
  const live = useLiveBle();
  const { c } = useTheme();
  const now = useNow(30_000);
  const { latest, recent, updatedAt, error } = liveHrCtx.liveHr;
  const demo = app.source === "demo";
  const isLive = showsLive(live);
  const [sheet, setSheet] = React.useState(false);
  const open = () => {
    void app.refreshLiveHr();
    onOpen();
  };

  if (!latest && phoneOnly && !isLive) return null;

  let body: React.ReactNode;
  if (isLive) {
    body = <LiveBody live={live} />;
  } else if (latest) {
    const age = now - latest.ts * 1000;
    const fresh = age < LIVE_MS;
    const values = recentMinutes(recent, latest.ts);
    const note =
      age >= STALE_MS
        ? demo
          ? "Demo data; nothing is read from Health Connect."
          : app.source === "google"
            ? "From Google Health; your Fitbit uploads it every 15–20 minutes."
            : "From Health Connect; Google Health syncs it every 15–20 minutes."
        : null;
    body = (
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View style={{ flexShrink: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <BeatingHeart bpm={latest.bpm} live={fresh} color={c.strain} />
              <ValueUnit value={String(latest.bpm)} unit="bpm" role="valueXl" size={36} lineHeight={40} />
            </View>
            <Txt role="caption" style={{ marginTop: 2, fontVariant: ["tabular-nums"] }} accessibilityLabel={`${fresh ? "Recent, " : ""}${readingAge(latest.ts, now, app.timeZone)}`}>
              {readingAge(latest.ts, now, app.timeZone)}
            </Txt>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Sparkline values={values} color={c.strain} caption={`Last ${RECENT_MINUTES} min`} style={{ height: 56 }} />
          </View>
        </View>
        {note && (
          <Txt role="caption" style={{ marginTop: 10 }}>
            {note}
          </Txt>
        )}
      </View>
    );
  } else if (updatedAt === null) {
    // Before the first live read: the value's shape, nothing to say yet.
    body = (
      <View importantForAccessibility="no-hide-descendants" style={{ gap: 6 }}>
        <SkeletonText role="valueXl" size={36} lineHeight={40} chars={3} />
        <SkeletonText role="caption" width={112} />
      </View>
    );
  } else {
    const reason = error ?? (demo ? "The demo has no readings yet." : app.source === "google" ? "Nothing from Google Health yet." : "Nothing synced from Health Connect yet.");
    body = (
      <View style={{ gap: 2 }}>
        <Txt role="bodyMedium">No heart rate yet</Txt>
        <Txt role="caption">{reason}</Txt>
      </View>
    );
  }

  return (
    <>
      {/* No "refreshing" affordance: the ticker's read takes a blink every minute, and a flicker there would read as a change. */}
      <SectionShell variant="card" title="Heart rate" onPress={open}>
        {body}
        {!isLive && <GoLiveButton onPress={() => setSheet(true)} style={{ marginTop: 12 }} />}
      </SectionShell>
      {/* Outside the card: the sheet's touches would otherwise bubble up to the card's press. */}
      <GoLiveSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}
