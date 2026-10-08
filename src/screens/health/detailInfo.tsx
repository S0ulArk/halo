// Info-sheet copy for Healthspan, Fitness and Heart rate, ported from Pulse's health/{healthspan,fitness,heart-rate}/page.tsx.
// Final copy: do not reword, except where the web names its data path (band → Fitbit → Google Health → Pulse): on the
// phone the Google Health app writes to Health Connect, and Pulse reads it when it syncs, not every minute. Healthspan
// and Fitness describe the mobile model (WHOOP's Healthspan method; Fitness Age after noop).
import * as React from "react";
import { alpha } from "@/lib/utils";
import { AGE_LABEL } from "@/lib/format";
import { Txt, useTheme, type InfoContent } from "@/ui";

function Body({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <Txt role="body" color={alpha(c.foreground, 0.85)}>
      {children}
    </Txt>
  );
}

export const HEALTHSPAN_INFO: InfoContent = {
  title: "About Healthspan",
  body: (
    <Body>
      {`${AGE_LABEL} estimates how old your body behaves, from nine habits and vitals measured over the last 6 months, following WHOOP's Healthspan method. Each one is scored by how a published study links it to all-cause mortality (sleep: Saint-Maurice 2024 and Windred 2024; activity: Arem 2015, Ahmadi 2022, Momma 2022 and Paluch 2022; fitness: Kodama 2009, Zhang 2016 and Jayedi 2022), against a target for your age and sex. An input with no data neither adds nor takes away years. Pace of Aging compares your last 30 days with those 6 months: 1.0x means aging at the normal rate, below 1.0x slower, above 1.0x faster. It shows once 21 of the last 30 days have data. Both are estimates for personal insight, not a medical assessment.`}
    </Body>
  ),
};

export const FITNESS_INFO: InfoContent = {
  title: "About Fitness",
  body: (
    <Body>
      {`VO2 max is the most oxygen your body can use during hard exercise. Halo ranks it against people of your age and sex from the FRIEND registry. Without a VO2 max from Health Connect, Halo estimates it from your resting heart rate and activity (Nes 2011, the HUNT study, with your waist; otherwise Uth 2004) and shows your Fitness Age: the age whose typical fitness matches yours. Training load compares your last 7 days of strain with your last 28 (the acute to chronic ratio); 0.8 to 1.3 is the usual sweet spot.`}
    </Body>
  ),
};

/** Web: "Fitbit uploads it to Google Health… Pulse checks for new readings every minute". The phone reads Health Connect when it syncs. */
export const HEART_RATE_INFO: InfoContent = {
  title: "About heart rate",
  body: (
    <>
      <Body>Your band records heart rate through the day. The Google Health app writes it to Health Connect, and Halo reads it from there.</Body>
      <Body>Halo reads new readings each time it syncs: when you open the app, and when you pull down on this screen. A reading usually reaches Health Connect a few minutes after your band takes it, so the newest one is never quite now.</Body>
      <Body>The chart shows each minute’s average. Minutes without a reading, when the band was off or not syncing, stay blank.</Body>
    </>
  ),
};
