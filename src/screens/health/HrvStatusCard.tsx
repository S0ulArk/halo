// The Health tab's HRV Status card (version 19): Garmin-style HRV Status, your 7-day average of overnight HRV against
// your usual range, as an Apple Health Summary card. The head (glyph, name, info, chevron), the 7-day average large with
// its status in colour, the status line, last night and the usual range, then the last 4 weeks' nights as capsule bars
// (the last 7 at full colour, the rest at 35 %) over the usual range's soft band and the dashed Low line, growing in
// from the floor once. The whole card opens HRV in the chart explorer.
import * as React from "react";
import { View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { Activity } from "lucide-react-native";
import { formatValue } from "@/lib/format";
import type { HrvStatusVM } from "@/queries";
import type { Metric } from "@/lib/reasons";
import { alpha } from "@/lib/utils";
import { InfoButton, ReasonPlaceholder, Txt, type InfoContent } from "@/ui";
import { useCalm } from "@/ui/calm";
import { GUIDE_DASH } from "@/ui/components/ChartFrame";
import { Caption, Num, Sentence, toneInk } from "@/screens/detail/calmKit";
import { SOURCE_NOTE } from "@/screens/detail/info";
import { Grow, HealthCard } from "./kit";

function P({ children }: { children: React.ReactNode }) {
  return <Txt role="body">{children}</Txt>;
}

export const HRV_STATUS_INFO: InfoContent = {
  title: "HRV Status",
  body: (
    <>
      <P>
        Your average overnight HRV over the last 7 nights, against your usual range, in the manner of Garmin’s HRV Status. Your usual range comes from the
        60 nights before that, on a log scale, and needs 21 nights to form.
      </P>
      <P>
        Balanced: the 7-day average sits in your usual range. Unbalanced: above it, or a little below. Low: well below it, often a sign of strain, illness or
        poor sleep. A single night doesn’t move it much; a trend over days does.
      </P>
      <P>Garmin also shows Poor when your usual range is low for your age; Halo leaves that out until it has a published age norm to compare with.</P>
      {SOURCE_NOTE}
    </>
  ),
};

const H = 72;

/**
 * The last 28 nights as capsule bars against the usual range (a soft band) and the Low line (dashed). Inside the card's
 * one button, whose label says what it shows, so it is not a stop of its own for a screen reader.
 */
function Nights({ vm }: { vm: HrvStatusVM }) {
  const c = useCalm();
  const values = vm.nights.map((p) => p.v).filter((v): v is number => v != null);
  const lo = Math.min(vm.lowLine, ...values) * 0.9;
  const hi = Math.max(vm.band.high, ...values) * 1.05;
  const y = (v: number) => ((v - lo) / Math.max(1e-6, hi - lo)) * H;
  const ink = toneInk(c, vm.tone);
  const fill = vm.tone === "neutral" ? c.system.blue : ink;
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ height: H, justifyContent: "flex-end" }}>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: y(vm.band.low), height: Math.max(2, y(vm.band.high) - y(vm.band.low)), borderRadius: 6, backgroundColor: alpha(c.system.green, 0.14) }} />
      <Svg width="100%" height={2} style={{ position: "absolute", left: 0, right: 0, bottom: y(vm.lowLine) - 1 }}>
        <Line x1="0" y1="1" x2="100%" y2="1" stroke={alpha(c.ink, 0.3)} strokeWidth={1} strokeDasharray={GUIDE_DASH} />
      </Svg>
      <Grow style={{ height: H }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: H }}>
          {vm.nights.map((p, i) => (
            <View key={i} style={{ flex: 1, height: p.v == null ? 0 : Math.max(4, y(p.v)), borderRadius: 99, backgroundColor: p.v == null ? "transparent" : fill, opacity: i >= vm.nights.length - 7 ? 1 : 0.35 }} />
          ))}
        </View>
      </Grow>
    </View>
  );
}

export function HrvStatusCard({ m, onOpen }: { m: Metric<HrvStatusVM> | undefined; onOpen: () => void }) {
  const c = useCalm();
  const info = <InfoButton info={HRV_STATUS_INFO} label="HRV Status" variant="card" />;
  // While it loads, the card holds its place (a bar for the average), so the cards under it never jump.
  if (m === undefined) return <HealthCard tint="sky" icon={Activity} title="HRV Status" when="Last 7 nights" action={info} loading onPress={onOpen} accessibilityLabel="HRV Status. Open HRV in the chart explorer" />;
  const v = m.value;
  if (v === null)
    return (
      <HealthCard tint="sky" icon={Activity} title="HRV Status" action={info} onPress={onOpen} accessibilityLabel="HRV Status: not yet. Open HRV in the chart explorer">
        <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" copy={m.reason === "calibrating" ? "HRV Status needs 21 nights of HRV to learn your usual range." : undefined} style={{ paddingVertical: 12 }} />
      </HealthCard>
    );
  const ink = toneInk(c, v.tone);
  const label = `HRV Status ${v.status}: 7-day average ${Math.round(v.weekAverage)} milliseconds, ${v.lastNight == null ? "no HRV last night" : `last night ${Math.round(v.lastNight)}`}, usual range ${Math.round(v.band.low)} to ${Math.round(v.band.high)}, with the last 4 weeks of nightly HRV drawn against it. Open HRV in the chart explorer`;
  return (
    <HealthCard
      tint="sky"
      icon={Activity}
      title="HRV Status"
      when="Last 7 nights"
      action={info}
      value={formatValue("int", v.weekAverage)}
      unit="ms"
      valueColor={ink}
      context={
        <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
          <Txt size={15} lineHeight={20} weight={600} style={{ color: ink }}>
            {v.status}
          </Txt>
          {" · 7-day average"}
        </Txt>
      }
      onPress={onOpen}
      accessibilityLabel={label}
    >
      <View style={{ gap: 14 }}>
        <Sentence size={13}>{v.line}</Sentence>
        {/* Two columns: each number with its label under it. */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Num value={v.lastNight == null ? "--" : formatValue("int", v.lastNight)} unit={v.lastNight == null ? undefined : "ms"} size={20} color={v.lastNight == null ? c.faint : c.ink} />
            <Caption>Last night</Caption>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Num value={`${formatValue("int", v.band.low)}–${formatValue("int", v.band.high)}`} unit="ms" size={20} />
            <Caption>Usual range</Caption>
          </View>
        </View>
        <Nights vm={v} />
      </View>
    </HealthCard>
  );
}
