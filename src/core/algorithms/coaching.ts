export type CoachingSignals = {
  recovery: number | null;
  provisional: boolean;
  sleepPerformance: number | null;
  strain: number | null;
  targetHigh: number | null;
  loadStatus: "detraining" | "optimal" | "pushing" | "high_risk" | null;
};

export function trainingGuidance(s: CoachingSignals) {
  const readiness = s.recovery === null || s.provisional ? "uncertain" : s.recovery < 34 ? "low" : s.recovery < 67 ? "moderate" : "high";
  const constraints: string[] = [];
  if (s.sleepPerformance !== null && s.sleepPerformance < 70) constraints.push("poor_sleep");
  if (s.loadStatus === "pushing" || s.loadStatus === "high_risk") constraints.push("elevated_load");
  if (s.strain !== null && s.targetHigh !== null && s.strain >= s.targetHigh) constraints.push("target_reached");
  const training = constraints.includes("target_reached") ? "no_extra_load" : s.loadStatus === "high_risk" || readiness === "low" ? "rest_or_easy" : readiness === "uncertain" ? "ask_and_go_cautiously" : readiness === "moderate" || constraints.length ? "controlled" : "build_within_target";
  return { readiness, training, constraints };
}
