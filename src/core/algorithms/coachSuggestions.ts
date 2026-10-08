import type { ReasonCode } from "@/lib/reasons";

export type CoachSuggestion = { key: "brief" | "recovery" | "training" | "hrv" | "sleep" | "strain" | "sync"; text: string };
export type SuggestionSignals = {
  recovery: number | null;
  provisional: boolean;
  reason: ReasonCode | null;
  hrv: number | null;
  hrvBaseline: number | null;
  asleepMinutes: number | null;
  strain: number | null;
  targetHigh: number | null;
};

export function suggestionsFor(s: SuggestionSignals): CoachSuggestion[] {
  const out: CoachSuggestion[] = [{ key: "brief", text: "Today's brief" }];
  if (s.reason === "awaiting_sleep_sync") out.push({ key: "sync", text: "What can I do while last night's sleep syncs?" });
  else if (s.reason === "calibrating" || s.provisional) out.push({ key: "recovery", text: "How should I train while my Recovery is provisional?" });
  else if (s.recovery !== null) out.push({ key: "training", text: s.recovery < 34 ? "What easy activity makes sense today?" : s.recovery < 67 ? "How should I keep today's training controlled?" : "How hard can I train within today's target?" });
  if (s.strain !== null && (s.targetHigh !== null ? s.strain >= s.targetHigh : s.strain >= 14)) out.push({ key: "strain", text: "Have I done enough activity today?" });
  if (s.hrv !== null && s.hrvBaseline !== null && s.hrvBaseline > 0 && s.hrv < s.hrvBaseline * 0.85) out.push({ key: "hrv", text: "Why is my HRV below my usual range?" });
  if (s.asleepMinutes !== null && s.asleepMinutes < 360) out.push({ key: "sleep", text: "I slept poorly. How can I recover today?" });
  for (const item of [{ key: "sleep", text: "How can I improve tonight's sleep?" }, { key: "recovery", text: "What's shaping my Recovery?" }, { key: "training", text: "How should I plan today's training?" }] as CoachSuggestion[]) {
    if (!out.some((s) => s.key === item.key)) out.push(item);
  }
  return out.slice(0, 4);
}
