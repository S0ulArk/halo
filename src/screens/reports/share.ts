// A report as plain text for the share sheet (React Native's Share API; no PDF without expo-print): the period, the
// headline averages against the period before, sleep against need, activity, the biggest changes and the focus
// points. After noop's shareable trends report (ui/TrendsReport.kt), as text. Pure, so it is tested without React.
import { DAY, formatDay, formatValue, hmm, rangeLabel, type FormatKey } from "@/lib/format";
import type { KeyStat } from "@/queries";
import type { ReportPageVM } from "@/queries/reports";

/** How each report stat prints: its format and, for hours, the scale to minutes. Shared with the report screen. */
export const STAT_FORMAT: Record<string, { format: FormatKey; unit?: string; scale?: number }> = {
  recovery: { format: "int", unit: "%" },
  strain: { format: "decimal1" },
  sleepPerf: { format: "int", unit: "%" },
  sleepHours: { format: "duration", scale: 60 },
  consistency: { format: "int", unit: "%" },
  hrv: { format: "int", unit: "ms" },
  rhr: { format: "int", unit: "bpm" },
};

/** The headline averages the text leads with (hours and consistency go under Sleep). */
const HEADLINE = ["recovery", "strain", "sleepPerf", "hrv", "rhr"];

const formatOf = (s: KeyStat) => STAT_FORMAT[s.key] ?? { format: s.format ?? "decimal1", unit: s.unit };
const unitText = (unit: string | undefined) => (!unit ? "" : unit === "%" ? "%" : ` ${unit}`);

/** A change in the stat's own format, signed: "+5", "−0.8", "+0:25", "+1,200". */
function signedText(format: FormatKey, d: number): string {
  if (format === "duration") return `${d > 0 ? "+" : "−"}${hmm(Math.abs(d))}`;
  if (format === "grouped") return `${d > 0 ? "+" : ""}${formatValue("grouped", d)}`;
  return formatValue(format === "int" ? "signedInt" : "signed1", d);
}

/** "Recovery 64% (+5)"; null when the stat has no value. */
export function statLine(s: KeyStat, suffix = ""): string | null {
  const v = s.metric.value;
  if (v === null) return null;
  const f = formatOf(s);
  const k = f.scale ?? 1;
  const value = `${formatValue(f.format, v * k)}${unitText(f.unit ?? s.unit)}${suffix}`;
  const d = s.average === null ? null : (v - s.average) * k;
  // A change that rounds to nothing in the stat's format is left out.
  const change = d === null || formatValue(f.format, Math.abs(d)) === formatValue(f.format, 0) ? "" : ` (${signedText(f.format, d)})`;
  return `${s.label} ${value}${change}`;
}

const SUFFIX: Record<string, string> = { slept: " a night", zone13: " a week", zone45: " a week", strength: " a week", steps: " a day" };

/** The report's period as a title line: "Sep 21 - Sep 27, 2026" or "September 2026". */
export const periodText = (vm: Pick<ReportPageVM, "kind" | "start" | "end">) =>
  vm.kind === "week" ? `${rangeLabel(vm.start, vm.end)}, ${vm.end.slice(0, 4)}` : formatDay(vm.start, DAY.monthYear);

/** The whole report as text, sections separated by a blank line. */
export function reportShareText(vm: ReportPageVM): string {
  const word = vm.kind === "week" ? "week" : "month";
  const p = vm.performance;
  const bullets = (lines: (string | null)[]) => lines.filter((l): l is string => l !== null).map((l) => `• ${l}`);
  const section = (title: string, lines: string[]) => (lines.length ? [title, ...lines].join("\n") : null);
  const nights = p.sleep.find((s) => s.key === "nightsMet");

  const parts = [
    [`Halo · ${vm.kind === "week" ? "Weekly" : "Monthly"} performance assessment`, `${periodText(vm)}${vm.partial ? " (so far)" : ""}`].join("\n"),
    section(
      `Averages vs last ${word}`,
      bullets(vm.averages.filter((s) => HEADLINE.includes(s.key)).map((s) => statLine(s))),
    ),
    section(
      "Sleep",
      bullets(
        p.sleep.map((s) => {
          if (s.key === "nightsMet") return nights?.metric.value == null ? null : `${s.label} ${nights.metric.value} ${s.unit ?? ""}`.trimEnd();
          const line = statLine(s, SUFFIX[s.key] ?? "");
          return line && s.key === "slept" && s.caption ? `${line} · ${s.caption.toLowerCase()}` : line;
        }),
      ),
    ),
    section(
      "Activity",
      bullets(p.activity.map((s) => statLine(s, SUFFIX[s.key] ?? ""))),
    ),
    section("Biggest changes", [...p.improved.map((c) => `↑ ${c.label} ${c.text}`), ...p.declined.map((c) => `↓ ${c.label} ${c.text}`)]),
    section("Focus", bullets(p.focus)),
  ];
  return parts.filter((x): x is string => x !== null).join("\n\n");
}
