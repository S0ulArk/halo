// The Health tab's HRV Status card (version 19): Garmin-style HRV Status, your 7-day average of overnight HRV against
// your usual range, with the last 4 weeks' nights drawn against that range. Built from the kit (SectionShell, TonePill,
// the calm text and number primitives); plain Views for the 28 bars, no animation of its own (the tab's cards rise with
// the page). The chart button opens HRV in the chart explorer.
import * as React from "react";
import { View } from "react-native";
import { formatValue } from "@/lib/format";
import type { HrvStatusVM } from "@/queries";
import type { Metric } from "@/lib/reasons";
import { ReasonPlaceholder, SectionShell, Txt, type InfoContent } from "@/ui";
import { useCalm } from "@/ui/calm";
import { ExpandButton } from "@/ui/components/ChartFrame";
import { TonePill } from "@/ui/components/Meter";
import { Caption, Num, Sentence, toneInk } from "@/screens/detail/calmKit";
import { SOURCE_NOTE } from "@/screens/detail/info";

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

/** The last 28 nights as bars against the usual range (a soft band) and the Low line. */
function Nights({ vm }: { vm: HrvStatusVM }) {
  const c = useCalm();
  const values = vm.nights.map((p) => p.v).filter((v): v is number => v != null);
  const lo = Math.min(vm.lowLine, ...values) * 0.9;
  const hi = Math.max(vm.band.high, ...values) * 1.05;
  const H = 72;
  const y = (v: number) => ((v - lo) / Math.max(1e-6, hi - lo)) * H;
  const ink = toneInk(c, vm.tone);
  return (
    <View
      accessible
      accessibilityLabel={`Last 4 weeks of nightly HRV against your usual range of ${Math.round(vm.band.low)} to ${Math.round(vm.band.high)} milliseconds`}
      style={{ height: H, justifyContent: "flex-end" }}
    >
      <View style={{ position: "absolute", left: 0, right: 0, bottom: y(vm.band.low), height: Math.max(2, y(vm.band.high) - y(vm.band.low)), borderRadius: 6, backgroundColor: c.tint.mint }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: y(vm.lowLine), height: 1, backgroundColor: c.line }} />
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: H }}>
        {vm.nights.map((p, i) => (
          <View key={i} style={{ flex: 1, height: p.v == null ? 0 : Math.max(3, y(p.v)), borderRadius: 2, backgroundColor: p.v == null ? "transparent" : i >= vm.nights.length - 7 ? ink : c.faint }} />
        ))}
      </View>
    </View>
  );
}

export function HrvStatusCard({ m, onOpen }: { m: Metric<HrvStatusVM> | undefined; onOpen: () => void }) {
  const c = useCalm();
  if (m === undefined) return null;
  const v = m.value;
  return (
    <SectionShell variant="card" title="HRV Status" accent="heart" info={HRV_STATUS_INFO} action={<ExpandButton onPress={onOpen} label="Open HRV in the chart explorer" />}>
      {v === null ? (
        <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" copy={m.reason === "calibrating" ? "HRV Status needs 21 nights of HRV to learn your usual range." : undefined} />
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <TonePill tone={v.tone}>{v.status}</TonePill>
            <Sentence size={13}>{v.line}</Sentence>
          </View>
          {/* Two columns at most; each number with its label under it. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 12 }}>
            <View accessible accessibilityLabel={`7-day average ${Math.round(v.weekAverage)} milliseconds`} style={{ width: "50%", gap: 2 }}>
              <Num value={formatValue("int", v.weekAverage)} unit="ms" size={28} color={toneInk(c, v.tone)} />
              <Caption>7-day average</Caption>
            </View>
            <View accessible accessibilityLabel={v.lastNight == null ? "No HRV last night" : `Last night ${Math.round(v.lastNight)} milliseconds`} style={{ width: "50%", gap: 2 }}>
              <Num value={v.lastNight == null ? "--" : formatValue("int", v.lastNight)} unit={v.lastNight == null ? undefined : "ms"} size={28} color={v.lastNight == null ? c.faint : c.ink} />
              <Caption>Last night</Caption>
            </View>
            <View accessible accessibilityLabel={`Usual range ${Math.round(v.band.low)} to ${Math.round(v.band.high)} milliseconds`} style={{ width: "50%", gap: 2 }}>
              <Num value={`${formatValue("int", v.band.low)}–${formatValue("int", v.band.high)}`} unit="ms" size={20} />
              <Caption>Usual range</Caption>
            </View>
          </View>
          <Nights vm={v} />
        </View>
      )}
    </SectionShell>
  );
}
