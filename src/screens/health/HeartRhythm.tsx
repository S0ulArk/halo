// Health Monitor's Heart rhythm section, ported from Pulse's health/monitor/HeartRhythm.tsx. ECG readings and irregular
// rhythm notifications come only from a Google account (the Google Health API); Health Connect carries neither, so with
// it `rhythm` is empty and the one quiet row shows.
import * as React from "react";
import { Pressable, View } from "react-native";
import { Activity, HeartPulse } from "lucide-react-native";
import { DAY, formatDay, formatValue } from "@/lib/format";
import type { EcgReading, HeartRhythm as HeartRhythmVM } from "@/queries";
import { BottomSheet } from "@/ui";
import { useCalm } from "@/ui/calm";
import { ChevronSlot, onBand } from "@/ui/components/calmKit";
import { TonePill } from "@/ui/components/Meter";
import { Grouped, IconTile, Num, Sentence, Title } from "@/screens/detail/calmKit";

/** Fitbit's and the reference app's notes both say "not a diagnosis" and name what ECG can't detect. */
export const RHYTHM_DISCLAIMER =
  "Not a diagnosis. ECG and irregular rhythm notifications can’t detect a heart attack, blood clots or stroke. Talk to your doctor about any result.";

const when = (e: EcgReading) => `${formatDay(e.day, DAY.short)}, ${e.time}`;
const bpm = (e: EcgReading) => (e.avgBpm === null ? "--" : formatValue("int", e.avgBpm));

/** A row's band: the 36 px tile; its title is centred on it, and the value and the chevron sit on the title's line. */
const BAND = 36;

/**
 * One row of the list: the tile, the title with its line under it, then on the title's line the value (`right`) and
 * the chevron's column (kept on every row, so the values share one right edge). A sentence that wraps grows the row
 * downward; the tile, the value and the chevron stay on the first line.
 */
function Row({ icon, children, right, onPress, label }: { icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; onPress?: () => void; label?: string }) {
  const body = (
    <View style={{ minHeight: 56, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 }}>
      {icon}
      <View style={{ flex: 1, minWidth: 0, paddingTop: onBand(BAND, 20) }}>{children}</View>
      {right && <View style={{ marginTop: onBand(BAND, 22) }}>{right}</View>}
      <ChevronSlot shown={!!onPress} style={{ marginTop: onBand(BAND, 18) }} />
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}

/**
 * The latest ECG (result, average heart rate, date), older readings as rows, and the irregular rhythm notification
 * count, as one grouped list. Each reading opens its sheet. With nothing recorded it is one quiet row, so a screen most
 * owners see empty never looks broken.
 */
export function HeartRhythm({ rhythm }: { rhythm: HeartRhythmVM }) {
  const c = useCalm();
  const [open, setOpen] = React.useState<string | null>(null);
  const [last, setLast] = React.useState<EcgReading | null>(null);
  const current = rhythm.ecg.find((e) => e.id === open);
  const shown = current ?? last;
  const select = (e: EcgReading) => {
    setOpen(e.id);
    setLast(e);
  };
  const { ecg, irn } = rhythm;
  const icon = (I: typeof Activity) => <IconTile icon={I} color={c.tintInk.rose} bg={c.tint.rose} size={36} />;

  if (!ecg.length && !irn.count)
    return (
      <Row icon={icon(HeartPulse)}>
        <Title size={15}>No heart rhythm readings yet</Title>
        <View style={{ marginTop: 2 }}>
          <Sentence size={13}>ECG readings and irregular rhythm notifications from the Google Health app show up here after they sync.</Sentence>
        </View>
      </Row>
    );

  const [latest, ...older] = ecg;
  return (
    <View style={{ gap: 12 }}>
      <Grouped inset={48}>
        {latest ? (
          <Pressable
            onPress={() => select(latest)}
            accessibilityRole="button"
            accessibilityLabel={`Latest ECG, ${when(latest)}: ${latest.label}, average ${bpm(latest)} bpm`}
            style={({ pressed }) => ({ paddingVertical: 12, gap: 12, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              {icon(Activity)}
              <View style={{ flex: 1, minWidth: 0, paddingTop: onBand(BAND, 20) }}>
                <Title size={15}>Latest ECG</Title>
              </View>
              <View style={{ marginTop: onBand(BAND, 18) }}>
                <Sentence size={13}>{when(latest)}</Sentence>
              </View>
              <ChevronSlot shown style={{ marginTop: onBand(BAND, 18) }} />
            </View>
            <View style={{ alignItems: "flex-start", gap: 8, paddingLeft: 48 }}>
              <Num value={bpm(latest)} unit="bpm avg" size={30} color={c.tintInk.rose} />
              <TonePill tone={latest.tone}>{latest.label}</TonePill>
            </View>
          </Pressable>
        ) : (
          <Row icon={icon(Activity)}>
            <Title size={15} color={c.sub}>
              No ECG readings yet
            </Title>
          </Row>
        )}
        {older.map((e) => (
          <Row key={e.id} icon={icon(Activity)} onPress={() => select(e)} label={`${e.label}, ${when(e)}, ${bpm(e)} bpm`} right={<Num value={bpm(e)} unit="bpm" size={18} />}>
            <Title size={15}>{e.label}</Title>
            <View style={{ marginTop: 2 }}>
              <Sentence size={13}>{when(e)}</Sentence>
            </View>
          </Row>
        ))}
        <Row icon={icon(HeartPulse)} right={<Num value={String(irn.count)} size={20} />}>
          <Title size={15}>Irregular rhythm notifications</Title>
          <View style={{ marginTop: 2 }}>
            <Sentence size={13}>{irn.latestDay ? `Latest ${formatDay(irn.latestDay, DAY.short)}` : "None. The check runs from time to time while you’re still, so no alert doesn’t rule out AFib."}</Sentence>
          </View>
        </Row>
      </Grouped>

      <Sentence size={13}>{RHYTHM_DISCLAIMER}</Sentence>

      <BottomSheet open={!!current} onClose={() => setOpen(null)} title="ECG reading">
        {shown && (
          <View style={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
              <Num value={bpm(shown)} unit="bpm avg" size={36} color={c.tintInk.rose} />
              <TonePill tone={shown.tone}>{shown.label}</TonePill>
            </View>
            <Sentence>{`${formatDay(shown.day, DAY.long)} at ${shown.time}`}</Sentence>
            <Sentence color={c.ink} weight={400}>
              {shown.explanation}
            </Sentence>
            <Sentence size={13}>{RHYTHM_DISCLAIMER}</Sentence>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}
