// Info-card copy for Home, ported from the web's src/app/(app)/_lib/info.tsx and (home)/page.tsx. The web's copy is
// final; only the lines that name the web's data path (Fitbit app → Google Health) are reworded for the phone, where
// data reaches Pulse through Health Connect (the Google Health app writes it there).
import * as React from "react";
import { alpha } from "@/lib/utils";
import { InfoRows, Txt, useTheme, type ColorToken, type InfoContent } from "@/ui";

const NBSP = " ";

/** One paragraph of info copy: the light grey brighter than the secondary tier (spec §11 F22), as InfoDialog's own. */
function P({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Txt role="body" color={alpha(c.foreground, 0.85)}>
      {children}
    </Txt>
  );
}

/** The web's `Rows` with a band swatch per line. */
function BandRows({ rows }: { rows: [ColorToken, string][] }) {
  const { c } = useTheme();
  return <InfoRows rows={rows.map(([token, text]) => [c[token], text] as [string, string])} />;
}

export const TONIGHT_INFO: InfoContent = {
  title: "Tonight’s sleep",
  body: (
    <P>
      Bedtimes are worked back from your typical wake time, how long you usually take to fall asleep and how efficiently you sleep. Peak gets you 100% of
      tonight’s need, Perform 85%, Get by 70%.
    </P>
  ),
};

export const ENERGY_INFO: InfoContent = {
  title: "Energy Bank",
  body: (
    <>
      <P>
        Energy Bank estimates your energy reserve around the clock, from 5 to 100, in the manner of Garmin’s Body Battery: sleep fills it, more after a restful
        night, and the waking day spends it through exertion, stressful stretches and time awake, while calm, still periods give a little back. Each day
        carries on from where the last one ended. It is Halo’s own estimate, not a measurement and not Garmin’s number.
      </P>
      <BandRows
        rows={[
          ["recoveryGreen", "76-100: high."],
          ["recoveryGreen", "51-75: medium."],
          ["recoveryYellow", "26-50: low."],
          ["recoveryRed", "5-25: very low."],
        ]}
      />
    </>
  ),
};

export const STRAIN_RECOVERY_INFO: InfoContent = {
  title: "Strain & recovery",
  body: (
    <>
      <P>Your last 7{NBSP}days side by side: Day Strain in blue on the left scale, from 0 to 21, and Recovery on the right scale, from 0 to 100%.</P>
      <P>High strain on one day often shows up as lower Recovery the next morning. Days without a score are left as gaps.</P>
    </>
  ),
};

/** Web: "…from Fitbit through Google Health… log the workout in the Fitbit app". On the phone workouts come from Health Connect. */
export const ADD_ACTIVITY_INFO: InfoContent = {
  title: "Add an activity",
  body: (
    <>
      <P>Halo reads your workouts from Health Connect, so it cannot add one here.</P>
      <P>Start or log the workout in the Google Health app, which writes it to Health Connect. It appears in your activities after the next sync, with its Strain.</P>
    </>
  ),
};

/** Web: "Until your Fitbit syncs". On the phone the band's data arrives through Health Connect. */
export const NO_BAND_INFO: InfoContent = {
  title: "No band data yet",
  body: (
    <>
      <P>Sleep, Recovery and Strain are scored from your Fitbit’s heart rate, which your phone can’t measure.</P>
      <P>Until your Fitbit’s data reaches Health Connect, Home shows what your phone counts: steps, distance, calories and active minutes.</P>
    </>
  ),
};

/** Web: "Workouts appear after Fitbit syncs them." */
export const NO_ACTIVITIES_TODAY = "No activities yet today. Workouts appear once they reach Health Connect.";
export const NO_ACTIVITIES = "No activities on this day.";
