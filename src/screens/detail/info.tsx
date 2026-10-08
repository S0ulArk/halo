// Info-sheet copy for Recovery, Strain and Sleep, ported from the web's src/app/(app)/_lib/info.tsx (spec §7.2, §7.3,
// §7.5). Final copy: do not reword, except where the web says the data comes from Google Health (on the phone it comes
// from Health Connect, written there by the Google Health app), and where a method changed to follow WHOOP's or Garmin's
// published one (docs/research/whoop-garmin.md): the copy says what the code does now.
import * as React from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { NBSP } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { Txt, useTheme, type ColorToken, type InfoContent } from "@/ui";

/** A paragraph of info copy: the light grey a step brighter than secondary (spec §11 F22), as InfoDialog draws a string body. */
function P({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Txt role="body" color={alpha(c.foreground, 0.85)}>
      {children}
    </Txt>
  );
}

/** A swatch: a theme colour, a dashed outline (a day with no split), or none. */
type Swatch = ColorToken | "dashed" | null;

/** The web's `Rows`: a 10 px swatch before each line, on the first line's baseline. */
function Rows({ rows }: { rows: [swatch: Swatch, text: string][] }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {rows.map(([swatch, text]) => (
        <View key={text} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          {swatch === "dashed" ? (
            <Svg width={10} height={10} style={{ marginTop: 6 }}>
              <Rect x={0.5} y={0.5} width={9} height={9} rx={2} fill="none" stroke={c.mutedForeground} strokeWidth={1} strokeDasharray={[2, 2]} />
            </Svg>
          ) : (
            swatch && <View style={{ width: 10, height: 10, borderRadius: 2, marginTop: 6, backgroundColor: c[swatch] }} />
          )}
          <View style={{ flex: 1 }}>
            <P>{text}</P>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Under each score's explainer: these are Halo's own scores, not the reference apps' (brand guidelines audit); where one
 * follows WHOOP's or Garmin's published method, it is Halo's implementation of it.
 */
export const SOURCE_NOTE = (
  <Txt role="small">Halo’s own scores, computed from your Fitbit data. Where one follows WHOOP’s or Garmin’s published method, it is Halo’s implementation of that method, not their number.</Txt>
);

export const RECOVERY_INFO: InfoContent = {
  title: "How Recovery works",
  body: (
    <>
      <P>
        Recovery shows how ready your body is to take on strain, from 0 to 100%. Halo scores it each morning from WHOOP’s published inputs: last night’s
        heart rate variability (on a log scale), resting heart rate and sleep performance, each compared with your own baseline. A raised respiratory rate
        lowers it; a low one doesn’t raise it. Skin temperature is shown, not scored.
      </P>
      <Rows
        rows={[
          ["recoveryGreen", "Green, 67-100%: your body is primed for strain."],
          ["recoveryYellow", "Yellow, 34-66%: you are maintaining; moderate strain fits."],
          ["recoveryRed", "Red, 0-33%: your body needs rest."],
        ]}
      />
      <P>
        Recovery needs 7{NBSP}nights of HRV before the first score and stays provisional until 14. A day without HRV or processed sleep gets no score rather
        than a guess.
      </P>
      {SOURCE_NOTE}
    </>
  ),
};

export const STRAIN_INFO: InfoContent = {
  title: "How Strain works",
  body: (
    <>
      <P>
        Strain measures the load of your day on a 0 to 21 scale: how hard your heart works, minute by minute, on your heart-rate reserve, plus a muscular load
        for strength workouts. Outside workouts, your usual still heart rate is taken off first, so an ordinary day stays light. The scale is non-linear:
        each point is harder to earn than the last, and it follows WHOOP’s published method with constants Halo fitted to WHOOP’s published averages.
      </P>
      <Rows
        rows={[
          [null, "Light: 0 - 9.9"],
          [null, "Moderate: 10 - 13.9"],
          [null, "Strenuous: 14 - 17.9"],
          [null, "All out: 18 - 21"],
        ]}
      />
      <P>Your Strain Target is a range for today, set from your Recovery and your recent training load. Today’s Strain is a running total until midnight.</P>
      {SOURCE_NOTE}
    </>
  ),
};

export const STRAIN_TARGET_INFO: InfoContent = {
  title: "Strain Target",
  body: (
    <P>
      Your Strain Target is a range for today, set from your Recovery and your training load over the last 28{NBSP}days. Inside it, training builds fitness
      without digging a recovery hole.
    </P>
  ),
};

export const CALORIES_INFO: InfoContent = {
  title: "Calories burned",
  body: (
    <>
      <P>
        Each bar is the day’s total from Health Connect (written there by the Google Health app), split into what you burned by moving and what your body
        burned at rest. Today’s bar is a running total until midnight.
      </P>
      <Rows
        rows={[
          ["energyActive", "Active: walking, workouts and other movement."],
          ["energyResting", "Resting: the rest of the total, your body’s baseline burn."],
          ["dashed", "Dashed: a day with a total but no active figure, so Halo shows no split."],
        ]}
      />
    </>
  ),
};

export const SLEEP_INFO: InfoContent = {
  title: "How Sleep works",
  body: (
    <>
      <P>
        Sleep Performance has WHOOP’s four parts: hours slept against last night’s full need (70%), sleep consistency, sleep efficiency and sleep stress (10%
        each). Last night’s need is the one the planner set the evening before: your baseline (the upper quartile of your last 28{NBSP}nights, between 8 and
        9.5{NBSP}hours), plus your Strain and part of your sleep debt, minus naps. Restorative sleep is shown, but is not part of the score.
      </P>
      <P>
        Sleep consistency compares the last 24{NBSP}hours with each of the 4{NBSP}days before. Sleep stress is the share of sleep with your heart rate well
        above that night’s calm level, a heart-rate stand-in for WHOOP’s measure.
      </P>
      {SOURCE_NOTE}
    </>
  ),
};

export const TONIGHT_INFO: InfoContent = {
  title: "Tonight’s sleep",
  body: (
    <P>
      Bedtimes are worked back from your typical wake time, how long you usually take to fall asleep and how efficiently you sleep. Peak gets you 100% of
      tonight’s need, Perform 85%, Get by 70%.
    </P>
  ),
};
