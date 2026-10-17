// Today's Heart Rate card, the first of the Pinned cards: Apple Health's highlight card for the newest heart rate. Two
// sources:
//
// - Live, over Bluetooth (src/state/liveBle.tsx): while the band shares heart rate and Halo is connected, the card says
//   "Live", shows the band's own bpm, the RMSSD line when the band sends RR intervals (or the skin-contact warning), and
//   the last 2 minutes as a line whose "now" dot breathes. Display-only: scores never see these readings.
// - Otherwise the newest reading Health Connect holds, as live as the Google Health sync makes it, refreshed by the
//   app's foreground ticker every minute: how long ago it was taken, the low and high of the last 30 minutes, and those
//   minutes as heart-rate range capsules (Health's min-max bars). Past 10 minutes a line says where the number comes
//   from, so a stale reading never passes for a live one.
//
// "Go live" (or "Stop live") sits at the card's foot today; the Bluetooth sheet is drawn outside the card, so its
// touches never reach the card's press. The card opens the Heart rate screen (today only, as before).
import * as React from "react";
import { View } from "react-native";
import { Heart } from "lucide-react-native";
import { RECENT_MINUTES } from "@/health/live";
import { useApp, useLiveHr } from "@/state/app";
import { showsLive, useLiveBle } from "@/state/liveBle";
import { useCalm } from "@/ui/calm";
import { HeartTrace } from "@/ui/components/BandHero";
import { SkeletonText } from "@/ui";
import { GoLiveButton, GoLiveSheet, rmssdLine, StopLiveButton } from "../settings/liveHr";
import { rangeSlots, readingAge, type BpmRange } from "./heartRange";
import { MINI_H, MINI_W, MiniCapsules } from "./miniCharts";
import { HealthCard, HealthContext, HealthValue } from "./pinned";
import { useNow } from "./status";

/** Older than this, the card says the number is a sync, not a pulse. */
const STALE_MS = 10 * 60_000;
/** The capsules: the last 30 minutes in stretches of 5. */
const SLOTS = 6;

export function HeartRateCard({ today, onOpen }: { today: boolean; onOpen: () => void }) {
  const c = useCalm();
  const app = useApp();
  const { liveHr, refreshLiveHr } = useLiveHr();
  const live = useLiveBle();
  const now = useNow(30_000);
  const streaming = showsLive(live);
  const [sheet, setSheet] = React.useState(false);
  const { latest, recent, updatedAt, error } = liveHr;
  const color = c.tintInk.rose;

  const ranges = React.useMemo(() => (latest ? rangeSlots(recent, latest.ts, SLOTS, RECENT_MINUTES) : []), [recent, latest]);
  const trace = React.useMemo(() => (streaming ? live.history.map((h) => ({ t: h.t / 1000, bpm: h.bpm })) : []), [streaming, live.history]);
  const lows = ranges.filter((r): r is BpmRange => r !== null);
  const lo = lows.length ? Math.min(...lows.map((r) => r.min)) : null;
  const hi = lows.length ? Math.max(...lows.map((r) => r.max)) : null;

  const bpm = streaming ? live.bpm : (latest?.bpm ?? null);
  const lost = streaming && live.status !== "live";
  const when = streaming ? (lost ? "Reconnecting" : "Live") : latest ? readingAge(latest.ts, now, app.timeZone) : null;
  const stale = !streaming && !!latest && now - latest.ts * 1000 >= STALE_MS;
  const source =
    app.source === "demo" ? "Demo data; nothing is read from Health Connect." : app.source === "google" ? "From Google Health; your Fitbit uploads it every 15–20 minutes." : "From Health Connect; Google Health syncs it every 15–20 minutes.";

  let context: React.ReactNode;
  if (streaming) {
    const note = live.contact === false ? "No skin contact: wear the band snug." : rmssdLine(live);
    context = <HealthContext color={live.contact === false ? c.tintInk.sand : undefined}>{note ?? `Live from ${live.device?.name ?? "your band"}`}</HealthContext>;
  } else if (latest && lo !== null && hi !== null) {
    context = <HealthContext>{`${lo}–${hi} last ${RECENT_MINUTES} min`}</HealthContext>;
  } else if (!latest && updatedAt === null) {
    // Before the first read: the line's shape, nothing to say yet.
    context = <SkeletonText size={14} lineHeight={19} width={120} />;
  } else if (!latest) {
    context = <HealthContext>{error ?? (app.source === "demo" ? "The demo has no readings yet." : app.source === "google" ? "Nothing from Google Health yet." : "Nothing synced from Health Connect yet.")}</HealthContext>;
  }

  const chart = streaming ? (
    trace.length > 1 ? <HeartTrace width={MINI_W} height={MINI_H} points={trace} live={!lost} /> : null
  ) : ranges.some((r) => r !== null) ? (
    <MiniCapsules ranges={ranges} color={color} />
  ) : null;

  const spoken = bpm
    ? `Heart rate ${bpm} beats per minute, ${streaming ? (lost ? "reconnecting to the band" : "live from your band") : when}${lo !== null && !streaming ? `. ${lo} to ${hi} over the last ${RECENT_MINUTES} minutes` : ""}`
    : "Heart rate, no reading yet";
  return (
    <>
      <HealthCard
        icon={Heart}
        filled
        color={color}
        title="Heart Rate"
        when={when}
        onPress={
          today
            ? () => {
                void refreshLiveHr();
                onOpen();
              }
            : undefined
        }
        accessibilityLabel={today ? `${spoken}. Opens heart rate` : spoken}
        value={<HealthValue text={bpm ? String(bpm) : null} unit="BPM" color={lost ? c.sub : undefined} />}
        context={context}
        chart={chart}
        footer={today ? <View style={{ flexDirection: "row" }}>{streaming ? <StopLiveButton /> : <GoLiveButton onPress={() => setSheet(true)} />}</View> : undefined}
      >
        {stale && (
          <View style={{ marginTop: 8 }}>
            <HealthContext>{source}</HealthContext>
          </View>
        )}
      </HealthCard>
      {today && <GoLiveSheet open={sheet} onClose={() => setSheet(false)} />}
    </>
  );
}
