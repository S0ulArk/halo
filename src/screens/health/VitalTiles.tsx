// Health Monitor's five vital tiles and their sheet, ported from Pulse's health/monitor/VitalTiles.tsx, as Apple's
// Vitals: two tiles a row (the last a full-width strip), each the vital's glyph and name in its colour, last night's
// reading large with its unit (its digits rolling in) and its chip ("Within range" in a green capsule). A tile opens the
// vital's sheet: the reading, the chip, your normal range and the last 30 nights (the web's `?vital=` deep-linked sheet
// is local state here).
import * as React from "react";
import { View } from "react-native";
import { Activity, Droplet, Heart, Thermometer, Wind, type LucideIcon } from "lucide-react-native";
import { formatValue, spoken, type FormatKey } from "@/lib/format";
import type { Vital, VitalKey } from "@/queries";
import { useApp } from "@/state/app";
import { BottomSheet, TileRow, TrendChart } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { TonePill } from "@/ui/components/Meter";
import { Caption, Num, Sentence } from "@/screens/detail/calmKit";
import { useOpenChart } from "@/screens/chart/href";
import { VitalTile } from "./kit";

/** The explorer's key for each vital. */
const CHART_KEY: Record<VitalKey, string> = { resp: "resp", spo2: "spo2", restingHr: "rhr", hrv: "hrv", skinTempDev: "skin_temp" };

const ICON: Record<VitalKey, LucideIcon> = { resp: Wind, spo2: Droplet, restingHr: Heart, hrv: Activity, skinTempDev: Thermometer };
/** Each vital's system colour, as Apple colours its vitals: breathing indigo, oxygen and HRV blue, heart pink, skin orange. */
const TINT: Record<VitalKey, CalmTint> = { resp: "lavender", spo2: "sky", restingHr: "rose", hrv: "sky", skinTempDev: "peach" };
const FORMAT: Record<VitalKey, FormatKey> = { resp: "decimal1", spo2: "int", restingHr: "int", hrv: "int", skinTempDev: "signed1" };
const NOTE = "Resting heart rate, HRV and skin temperature use the data’s own personal ranges when it brings them (Health Connect doesn’t); otherwise your range is your baseline ± 2 SD over 60 nights.";

/** A tile's name: the reference app's tiles abbreviate the two heart metrics ("RHR", "HRV"); the sheet keeps the full name. */
const tileName = (x: { key: VitalKey; short: string; label: string }) => (x.key === "restingHr" || x.key === "hrv" ? x.short : x.label);

/**
 * Two tiles a row, the last a full-width strip. Each row is a TileRow: its two tiles share one height, and their names
 * one height, so the readings share a line.
 */
function Grid({ children }: { children: React.ReactNode[] }) {
  const rows: React.ReactNode[][] = [];
  const paired = children.slice(0, -1);
  for (let i = 0; i < paired.length; i += 2) rows.push(paired.slice(i, i + 2));
  if (children.length) rows.push(children.slice(-1));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((row, i) => (
        <TileRow key={i} gap={12}>
          {row}
        </TileRow>
      ))}
    </View>
  );
}

function Note() {
  return (
    <View style={{ marginTop: 10, paddingHorizontal: 4 }}>
      <Sentence size={13}>{NOTE}</Sentence>
    </View>
  );
}

/** The five vital tiles, each opening its vital sheet (journey 6), plus the ranges note. */
export function VitalTiles({ vitals }: { vitals: Vital[] }) {
  const c = useCalm();
  const { today } = useApp();
  const [open, setOpen] = React.useState<VitalKey | null>(null);
  const [last, setLast] = React.useState<Vital | null>(null);
  const openChart = useOpenChart();
  const current = vitals.find((x) => x.key === open);
  const v = current ?? last;
  const fmt = v ? FORMAT[v.key] : "int";
  // Ranges always show one decimal, as the chips do, so a whole-number reading never looks equal to its bound.
  const rangeFmt = v?.key === "skinTempDev" ? "signed1" : "decimal1";

  return (
    <>
      <Grid>
        {vitals.map((x, i) => {
          const value = x.metric.value === null ? null : formatValue(FORMAT[x.key], x.metric.value);
          return (
            <VitalTile
              key={x.key}
              wide={i === vitals.length - 1}
              tint={TINT[x.key]}
              icon={ICON[x.key]}
              name={tileName(x)}
              value={value}
              unit={x.unit}
              chip={x.chip && value !== null ? <TonePill tone={x.chip.tone}>{x.chip.text}</TonePill> : null}
              alert={value !== null && (x.status === "high" || x.status === "low")}
              onPress={() => {
                setOpen(x.key);
                setLast(x);
              }}
              accessibilityLabel={`${x.label}: ${value === null ? "no reading" : spoken(value, x.unit)}${x.chip && value !== null ? `, ${x.chip.text}` : ""}. Open ${x.label}`}
            />
          );
        })}
      </Grid>
      <Note />

      <BottomSheet open={!!current} onClose={() => setOpen(null)} title={v?.label ?? "Vital"}>
        {v && (
          <View style={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
              <Num value={formatValue(fmt, v.metric.value)} unit={v.unit} size={36} color={v.metric.value === null ? c.faint : c.ink} />
              {v.chip && v.metric.value !== null && <TonePill tone={v.chip.tone}>{v.chip.text}</TonePill>}
            </View>
            {v.range && (
              <View accessible accessibilityLabel={`Your normal range: ${formatValue(rangeFmt, v.range.low)} to ${v.key === "spo2" ? 100 : formatValue(rangeFmt, v.range.high)} ${v.unit}`}>
                <Num value={`${formatValue(rangeFmt, v.range.low)} - ${v.key === "spo2" ? 100 : formatValue(rangeFmt, v.range.high)}`} unit={v.unit} size={20} />
                <Caption style={{ marginTop: 4 }}>Your normal range</Caption>
              </View>
            )}
            <TrendChart
              // The sheet closes first, so the explorer opens over the screen, not under the sheet.
              onPress={() => {
                setOpen(null);
                openChart({ metric: CHART_KEY[v.key], r: "m" });
              }}
              label={v.label}
              data={{ value: v.trend.points.map((p) => ({ date: p.day, value: p.value })), reason: null, provisional: false }}
              unit={v.unit}
              format={fmt}
              colorBy="single"
              fixedRange="6m"
              baseline={v.trend.baseline}
              today={today}
            />
          </View>
        )}
      </BottomSheet>
    </>
  );
}

const SKELETON: [VitalKey, string][] = [
  ["resp", "Respiratory rate"],
  ["spo2", "Blood oxygen"],
  ["restingHr", "RHR"],
  ["hrv", "HRV"],
  ["skinTempDev", "Skin temp (from baseline)"],
];

/** Loading shape (spec §5.19): the same grid of five tiles and the note, with bars for the readings. */
export function VitalTilesSkeleton() {
  return (
    <>
      <Grid>
        {SKELETON.map(([k, l], i) => (
          <VitalTile key={k} wide={i === SKELETON.length - 1} tint={TINT[k]} icon={ICON[k]} name={l} value={null} loading accessibilityLabel={l} />
        ))}
      </Grid>
      <Note />
    </>
  );
}
