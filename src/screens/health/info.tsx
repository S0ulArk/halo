// Info-sheet copy for the Health screens, ported from Pulse's health/monitor/page.tsx and health/stress/page.tsx.
// Final copy: do not reword.
import * as React from "react";
import { alpha } from "@/lib/utils";
import { InfoRows, Txt, useTheme, type InfoContent } from "@/ui";

function Body({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <Txt role="body" color={alpha(c.foreground, 0.85)}>
      {children}
    </Txt>
  );
}

export const MONITOR_INFO: InfoContent = {
  title: "About Health Monitor",
  body: (
    <Body>
      Health Monitor compares last night’s vitals with your personal normal range: the data’s own range where it comes with one (Health Connect’s doesn’t), else your baseline plus or minus two standard deviations. Blood oxygen also flags anything below 95%. A change in several vitals at once can be an early sign of illness. Halo is not a medical device; if you feel unwell, talk to a doctor.
    </Body>
  ),
};

/** The three stress levels with their swatches (the web's LEVELS). */
export const STRESS_LEVELS = [
  { token: "stressLow", text: "Low, 0.0 - 0.9: you might be feeling calm, relaxed or sleepy." },
  { token: "stressMedium", text: "Medium, 1.0 - 1.9: neutral, alert or mildly activated." },
  { token: "stressHigh", text: "High, 2.0 - 3.0: excited, stressed or highly activated." },
] as const;

function StressLevels() {
  const { c } = useTheme();
  return <InfoRows rows={STRESS_LEVELS.map((l) => [c[l.token], l.text])} />;
}

export const STRESS_INFO: InfoContent = {
  title: "About Stress Monitor",
  body: (
    <>
      <Body>Stress Monitor scores how activated your body is, from 0 to 3, by comparing your heart rate with your daytime resting baseline.</Body>
      <StressLevels />
      <Body>Halo only scores still minutes. Movement, workouts and sleep are left out, so a walk never counts as stress.</Body>
    </>
  ),
};

/** The Health hub cards whose own screens are not in the app yet (Healthspan, Fitness). */
export const COMING_SOON: Record<"healthspan" | "fitness", InfoContent> = {
  healthspan: {
    title: "Coming soon",
    body: <Body>Healthspan’s own screen, with your Halo Age history and what moves it, is coming to the app soon.</Body>,
  },
  fitness: {
    title: "Coming soon",
    body: <Body>Fitness’s own screen, with your VO2 max history and training load, is coming to the app soon.</Body>,
  },
};
