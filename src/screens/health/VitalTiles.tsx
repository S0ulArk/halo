// Health Monitor's five vital tiles and their sheet, ported from Pulse's health/monitor/VitalTiles.tsx. The web's
// `?vital=` deep-linked sheet is local state here.
import * as React from "react";
import { View } from "react-native";
import { Activity, Droplet, Heart, Thermometer, Wind, type LucideIcon } from "lucide-react-native";
import { formatValue, type FormatKey } from "@/lib/format";
import type { Vital, VitalKey } from "@/queries";
import { useApp } from "@/state/app";
import { BottomSheet, KeyStatRow, KeyStatRowSkeleton, TileRow, TrendChart } from "@/ui";
import { useCalm } from "@/ui/calm";
import { TonePill } from "@/ui/components/Meter";
import { Caption, Num, Sentence } from "@/screens/detail/calmKit";
import { useOpenChart } from "@/screens/chart/href";

/** The explorer's key for each vital. */
const CHART_KEY: Record<VitalKey, string> = { resp: "resp", spo2: "spo2", restingHr: "rhr", hrv: "hrv", skinTempDev: "skin_temp" };

const ICON: Record<VitalKey, LucideIcon> = { resp: Wind, spo2: Droplet, restingHr: Heart, hrv: Activity, skinTempDev: Thermometer };
const FORMAT: Record<VitalKey, FormatKey> = { resp: "decimal1", spo2: "int", restingHr: "int", hrv: "int", skinTempDev: "signed1" };
const NOTE = "Resting heart rate, HRV and skin temperature use the data’s own personal ranges when it brings them (Health Connect doesn’t); otherwise your range is your baseline ± 2 SD over 60 nights.";

/** The vital's lucide icon as a bare element, so the tile's AccentIcon can redraw it in the metric's accent. */
function tileIcon(k: VitalKey, color: string) {
  const I = ICON[k];
  return <I size={20} color={color} strokeWidth={1.75} />;
}

/**
 * Two tiles a row, the last a full-width strip (its range chip beside the value; the 30-night chart is in its sheet).
 * Each row is a TileRow: its two tiles share one height, and their names one height, so the readings share a line.
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
    <View style={{ marginTop: 12, paddingHorizontal: 4 }}>
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
        {vitals.map((x, i) => (
          <KeyStatRow
            key={x.key}
            variant="tile"
            wide={i === vitals.length - 1}
            icon={tileIcon(x.key, c.tintInk.sand)}
            // The reference app's tiles abbreviate the two heart metrics ("RHR", "HRV"); the sheet keeps the full name.
            label={x.key === "restingHr" || x.key === "hrv" ? x.short : x.label}
            metric={x.metric}
            unit={x.unit}
            format={FORMAT[x.key]}
            direction="none"
            chip={x.chip ?? undefined}
            onPress={() => {
              setOpen(x.key);
              setLast(x);
            }}
          />
        ))}
      </Grid>
      <Note />

      <BottomSheet open={!!current} onClose={() => setOpen(null)} title={v?.label ?? "Vital"}>
        {v && (
          <View style={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
              <Num value={formatValue(fmt, v.metric.value)} unit={v.unit} size={36} color={v.metric.value === null ? c.faint : c.tintInk.sand} />
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

const SKELETON_LABEL: [VitalKey, string][] = [
  ["resp", "Respiratory rate"],
  ["spo2", "Blood oxygen"],
  ["restingHr", "RHR"],
  ["hrv", "HRV"],
  ["skinTempDev", "Skin temp (from baseline)"],
];

/** Loading shape (spec §5.19): the same grid of five tiles and the note, with bars for the readings. */
export function VitalTilesSkeleton() {
  const c = useCalm();
  return (
    <>
      <Grid>
        {SKELETON_LABEL.map(([k, l]) => (
          <KeyStatRowSkeleton key={k} variant="tile" label={l} icon={tileIcon(k, c.tintInk.sand)} />
        ))}
      </Grid>
      <Note />
    </>
  );
}
