// The Weekly Plan sheet's words (src/screens/home/WeeklyPlanCard.tsx): value and target text, the status word and
// colour, the line under each target, and Pulse Age's years. Pure, so it is tested without React.
import type { PlanStatus } from "@/core/algorithms/weeklyPlan";
import { formatValue, MISSING, NBSP } from "@/lib/format";
import type { PlanRow } from "@/queries/weeklyPlan";
import type { CalmTint } from "@/ui/calm";

/** Each status's word and its Calm ink: done mint, behind sand, missed rose; on pace the secondary grey, no data the faint. */
export const PLAN_STATUS: Record<PlanStatus, { word: string; tint: CalmTint | null; faint?: boolean }> = {
  done: { word: "Done", tint: "mint" },
  on_pace: { word: "On pace", tint: null },
  behind: { word: "Behind", tint: "sand" },
  missed: { word: "Missed", tint: "rose" },
  no_data: { word: "No data", tint: null, faint: true },
};

const plural = (n: number, one: string, many = `${one}s`) => `${formatValue("grouped", n)}${NBSP}${n === 1 ? one : many}`;

type Row = Pick<PlanRow, "key" | "value" | "target" | "format" | "status" | "expected" | "streak">;

/** The week's value so far: "80", "7,500", "--". */
export const planValueText = (it: Pick<Row, "value" | "format">) => (it.value === null ? MISSING : formatValue(it.format, it.value));

/** "of 150 min", "of 2 sessions", "of 8,000", "of 80%", "of 5 nights". */
export function planTargetText(it: Pick<Row, "key" | "target" | "format">): string {
  const t = formatValue(it.format, it.target);
  switch (it.key) {
    case "zone13":
    case "zone45":
      return `of ${t}${NBSP}min`;
    case "strength":
      return `of ${plural(it.target, "session")}`;
    case "consistency":
      return `of ${t}%`;
    case "sleepNeed":
      return `of ${plural(it.target, "night")}`;
    default:
      return `of ${t}`;
  }
}

/** What is left to the target, in the target's words: "70 min", "1 session", "500 steps a day", "2 points", "3 nights". */
function leftText(it: Row, left: number): string {
  switch (it.key) {
    case "zone13":
    case "zone45":
      return `${Math.ceil(left)}${NBSP}min`;
    case "strength":
      return plural(Math.ceil(left), "session");
    case "steps":
      return `${plural(Math.ceil(left), "step")} a day`;
    case "consistency":
      return plural(Math.ceil(left), "point");
    case "sleepNeed":
      return plural(Math.ceil(left), "night");
  }
}

/** The line under a target: how it stands, what is left, and its streak of weeks. */
export function planCaption(it: Row): string {
  const n = it.streak.current;
  const left = it.value === null ? it.target : Math.max(0, it.target - it.value);
  switch (it.status) {
    case "done":
      return n > 1 ? `Done · ${n}-week streak` : "Done this week";
    case "on_pace":
      return n > 0 ? `${leftText(it, left)} to go · ${n}-week streak on the line` : `On pace · ${leftText(it, left)} to go`;
    case "behind":
      // Totals: how far under an even pace; averages and counts: how far from the target.
      if ((it.key === "zone13" || it.key === "zone45") && it.expected !== null) return `${leftText(it, it.expected - (it.value ?? 0))} behind pace`;
      return it.key === "steps" || it.key === "consistency" ? `${leftText(it, left)} short` : `${leftText(it, left)} to go`;
    case "missed":
      return it.streak.longest > 1 ? `Missed · best run ${it.streak.longest} weeks` : "Missed this week";
    case "no_data":
      return "No data yet";
  }
}

/** Pulse Age's years for the habit: "−0.6 yr", "+1.2 yr"; null without a Pulse Age. Negative is younger (good). */
export function ageText(years: number | null): string | null {
  if (years === null) return null;
  const r = Math.round(years * 10) / 10;
  if (r === 0) return `0.0${NBSP}yr`;
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}${NBSP}yr`;
}
