// Health Monitor's Heart rhythm section, ported from Pulse's health/monitor/HeartRhythm.tsx, as an iOS grouped list: a
// caps header, one card of rows (a pink icon square, the name with its line under it, the value and a thin chevron,
// hairlines inset to the text between rows) and the disclaimer as the list's footer. ECG readings and irregular rhythm
// notifications come only from a Google account (the Google Health API); Health Connect carries neither, so with it
// `rhythm` is empty and the one quiet row shows. Each reading opens its sheet.
import * as React from "react";
import { Pressable, View } from "react-native";
import Reanimated from "react-native-reanimated";
import { Activity, HeartPulse, type LucideIcon } from "lucide-react-native";
import { DAY, formatDay, formatValue } from "@/lib/format";
import type { EcgReading, HeartRhythm as HeartRhythmVM } from "@/queries";
import { BottomSheet, Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { ChevronSlot } from "@/ui/components/calmKit";
import { TonePill } from "@/ui/components/Meter";
import { usePress, usePressStyle } from "@/ui/components/press";
import { Num, Sentence } from "@/screens/detail/calmKit";
import { Hairline, IconTile, LIST_RADIUS, SectionFooter, SectionLabel } from "@/screens/settings/calmKit";

const PressableView = Reanimated.createAnimatedComponent(Pressable);

/** Fitbit's and the reference app's notes both say "not a diagnosis" and name what ECG can't detect. */
export const RHYTHM_DISCLAIMER =
  "Not a diagnosis. ECG and irregular rhythm notifications can’t detect a heart attack, blood clots or stroke. Talk to your doctor about any result.";

const when = (e: EcgReading) => `${formatDay(e.day, DAY.short)}, ${e.time}`;
const bpm = (e: EcgReading) => (e.avgBpm === null ? "--" : formatValue("int", e.avgBpm));

/** The row's icon square, iOS Settings' 29 px, and where the hairline under a row starts (the text). */
const ICON = 29;
const INSET = 16 + ICON + 12;

/**
 * One row: the icon square, the name with its line under it, the value and the chevron's column (kept on every row, so
 * the values share one right edge); `below` hangs under the name (the latest ECG's reading). A tappable row settles and
 * dims under the finger.
 */
function Row({ icon, title, line, right, below, onPress, label }: { icon: LucideIcon; title: string; line?: string; right?: React.ReactNode; below?: React.ReactNode; onPress?: () => void; label?: string }) {
  const c = useCalm();
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { dim: 0.55 });
  const body = (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconTile icon={icon} tint="rose" size={ICON} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
            {title}
          </Txt>
          {line ? (
            <Txt size={13} lineHeight={18} style={{ color: c.sub }}>
              {line}
            </Txt>
          ) : null}
        </View>
        {right}
        <ChevronSlot shown={!!onPress} />
      </View>
      {below ? <View style={{ paddingLeft: ICON + 12, gap: 8, alignItems: "flex-start" }}>{below}</View> : null}
    </View>
  );
  const box = { minHeight: 48, paddingHorizontal: 16, paddingVertical: 10 };
  if (!onPress)
    return (
      <View accessible accessibilityLabel={label ?? [title, line].filter(Boolean).join(", ")} style={box}>
        {body}
      </View>
    );
  return (
    <PressableView onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={label} style={[box, pressed]}>
      {body}
    </PressableView>
  );
}

/**
 * The latest ECG (result, average heart rate, date), older readings as rows, and the irregular rhythm notification
 * count, as one grouped list under its header. Each reading opens its sheet. With nothing recorded it is one quiet row,
 * so a screen most owners see empty never looks broken.
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
  const [latest, ...older] = ecg;
  const empty = !ecg.length && !irn.count;

  const rows: React.ReactNode[] = empty
    ? [<Row key="none" icon={HeartPulse} title="No heart rhythm readings yet" line="ECG readings and irregular rhythm notifications from the Google Health app show up here after they sync." />]
    : [
        latest ? (
          <Row
            key="latest"
            icon={Activity}
            title="Latest ECG"
            line={when(latest)}
            onPress={() => select(latest)}
            label={`Latest ECG, ${when(latest)}: ${latest.label}, average ${bpm(latest)} bpm`}
            below={
              <>
                <Num value={bpm(latest)} unit="bpm avg" size={30} />
                <TonePill tone={latest.tone}>{latest.label}</TonePill>
              </>
            }
          />
        ) : (
          <Row key="latest" icon={Activity} title="No ECG readings yet" />
        ),
        ...older.map((e) => <Row key={e.id} icon={Activity} title={e.label} line={when(e)} onPress={() => select(e)} label={`${e.label}, ${when(e)}, ${bpm(e)} bpm`} right={<Num value={bpm(e)} unit="bpm" size={17} />} />),
        <Row
          key="irn"
          icon={HeartPulse}
          title="Irregular rhythm notifications"
          line={irn.latestDay ? `Latest ${formatDay(irn.latestDay, DAY.short)}` : "None. The check runs from time to time while you’re still, so no alert doesn’t rule out AFib."}
          right={<Num value={String(irn.count)} size={17} color={c.sub} />}
          label={`Irregular rhythm notifications: ${irn.count}. ${irn.latestDay ? `Latest ${formatDay(irn.latestDay, DAY.short)}` : "None. The check runs from time to time while you’re still, so no alert doesn’t rule out AFib."}`}
        />,
      ];

  return (
    <View style={{ gap: 7 }}>
      <SectionLabel>Heart rhythm</SectionLabel>
      <View style={{ borderRadius: LIST_RADIUS, backgroundColor: c.card, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Hairline inset={INSET} /> : null}
            {r}
          </React.Fragment>
        ))}
      </View>
      {!empty && <SectionFooter>{RHYTHM_DISCLAIMER}</SectionFooter>}

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

/** The section's loading shape: its header and one row of the card's height. */
export function HeartRhythmSkeleton() {
  const c = useCalm();
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ gap: 7 }}>
      <SectionLabel>Heart rhythm</SectionLabel>
      <View style={{ height: 64, borderRadius: LIST_RADIUS, backgroundColor: c.card }} />
    </View>
  );
}
