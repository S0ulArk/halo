// "How Halo works" (More): one explainer per score, written from src/core and docs/algorithms. Every number here
// is the code's; when the code changes, change this file.
// Copied verbatim from the web app's src/app/(app)/more/how-it-works/content.ts (src/core is shared unchanged).
export type HowRow = { term: string; detail: string }
export type HowSection = { title: string; paragraphs?: string[]; rows?: HowRow[] }
export type ScoreDoc = {
  /** URL segment: /more/how-it-works/<slug>. */
  slug: string
  /** Display name, e.g. "Recovery", "Halo Age". */
  name: string
  /** One short sentence (max ~70 characters) shown as the page intro and as a caption. */
  summary: string
  /** The in-app screen where the score lives, e.g. "/recovery", "/health/healthspan"; null if none. */
  href: string | null
  /** In this order: "What goes in", "How it is weighted", "What the bands mean", "Limits". Omit a section only if it truly does not apply (say so in Limits instead). */
  sections: HowSection[]
}
export const SCORE_DOCS: ScoreDoc[] = [
  {
    slug: "recovery",
    name: "Recovery",
    summary: "How ready your body is to take on strain today, from 0 to 100%.",
    href: "/recovery",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Halo scores Recovery each morning from last night’s main sleep, comparing each vital with your own baseline: a running average of recent nights that clips extreme nights. The inputs are the ones WHOOP lists for its Recovery in 2026; skin temperature and SpO2 are shown in Health Monitor, not scored.",
        ],
        rows: [
          { term: "Heart rate variability", detail: "Fitbit’s nightly HRV, in ms, compared on a log scale, so a high night counts by how many times higher it is, not by raw ms. Its baseline leans on about the last month. Higher is better." },
          { term: "Resting heart rate", detail: "Fitbit’s daily resting heart rate from Health Connect, in bpm; the lowest 5-minute average during sleep only on a day Health Connect has none. Lower is better." },
          { term: "Sleep performance", detail: "Last night’s Sleep Performance. 85% is neutral." },
          { term: "Respiratory rate", detail: "Breaths per minute asleep. It only ever counts against you: when it is up, not when it is down." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each input is measured in units of your usual night-to-night swing from baseline; sleep moves one unit per 12\u00a0points away from 85%. A missing input’s weight is shared among the rest. WHOOP doesn’t publish its weights; these are Halo’s.",
        ],
        rows: [
          { term: "HRV", detail: "58%" },
          { term: "Resting heart rate", detail: "22%" },
          { term: "Sleep performance", detail: "20%" },
          { term: "Respiratory rate", detail: "More than 1 swing above your baseline takes 0.15 of a unit off per swing beyond, twice that when the rest of your night already points down." },
        ],
      },
      {
        title: "What the bands mean",
        paragraphs: [
          "The weighted average goes through an S-shaped curve (slope 1.6). Every input at baseline lands at about 58%; a quarter of a swing above reaches green, 0.6 below drops into red.",
        ],
        rows: [
          { term: "67-100%", detail: "Green: your body is primed for strain." },
          { term: "34-66%", detail: "Yellow: you are maintaining; moderate strain fits." },
          { term: "0-33%", detail: "Red: your body needs rest." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Recovery needs 7\u00a0nights of HRV before the first score and is Provisional until 14. The other vitals join once each has 4\u00a0nights of baseline. A night Fitbit could not stage has no HRV, so it gets no score rather than a guess, and after more than 14\u00a0nights without HRV the first night back is not scored. Fitbit’s HRV is a whole-night value, not WHOOP’s deepest-sleep reading. Recovery is Halo’s own implementation of WHOOP’s published inputs, an estimate from a wrist sensor: it reads your body, not your plans or how you feel.",
        ],
      },
    ],
  },
  {
    slug: "strain",
    name: "Strain",
    summary: "The cardiovascular and muscular load of your day, from 0 to 21.",
    href: "/strain",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Heart rate", detail: "Every reading from local midnight to midnight. Each reading covers the gap to the next one, up to 2\u00a0minutes; between two quiet readings (both under half your reserve) up to 10, since Fitbit’s resting readings come a few minutes apart." },
          { term: "Resting heart rate", detail: "Fitbit’s daily value from Health Connect, else last night’s sleeping resting heart rate, else your last known value (up to 30\u00a0days), else an estimate from the day’s still heart rate, and only then 60\u00a0bpm." },
          { term: "Max heart rate", detail: "The value in Settings; else the higher of 208 − 0.7 × your age and the max Halo learns from your workouts: the 99.5th percentile of the last year’s workout heart rate, checked weekly. It only ever rises, by 2\u00a0bpm or more." },
          { term: "Workout type", detail: "Strength-type workouts add a muscular load for their length, as WHOOP has since 2026, because lifting barely raises heart rate." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each minute earns load by how hard your heart works, as a share of your heart-rate reserve (the gap between your resting and max heart rate). The load rises smoothly and steeply with effort (Banister’s TRIMP), so there are no zone steps and a brisk walk counts a little. For a man (a woman’s curve is slightly higher):",
        ],
        rows: [
          { term: "30% of reserve", detail: "0.34 a minute" },
          { term: "50%", detail: "0.84 a minute" },
          { term: "75%", detail: "2.0 a minute" },
          { term: "90%", detail: "3.2 a minute" },
          { term: "Outside workouts", detail: "Your usual still waking heart rate is taken off every minute first: the median of your last 14\u00a0days, at most 40% of your reserve. Ordinary waking hours then add little; inside a workout every beat counts." },
          { term: "Muscular load", detail: "0.6 a minute for lifting, HIIT, boot camp and calisthenics; 0.35 for climbing, rowing and paddling; 0.25 for yoga and Pilates." },
        ],
      },
      {
        title: "What the bands mean",
        paragraphs: [
          "The day’s load goes on a log scale: Strain = 5.05 × ln(1 + 0.09 × load), at most 21. Halo fitted the two numbers to WHOOP’s published member averages (an hour’s walk about 6.5, an hour’s run about 12, an hour of functional fitness about 10.1, a marathon about 20.4). On Halo’s scale an hour’s run at 75% of your reserve scores about 12.5 and an hour’s walk about 5.3. Doubling a big load adds only about 3.5, so each point is harder to earn than the last.",
        ],
        rows: [
          { term: "0-9.9", detail: "Light" },
          { term: "10.0-13.9", detail: "Moderate" },
          { term: "14.0-17.9", detail: "Strenuous" },
          { term: "18.0-21.0", detail: "All out" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Strain needs at least 600 heart-rate readings, or 20 spread over at least 10\u00a0minutes; otherwise the day shows Not enough data. Today’s Strain is a running total until midnight. Each activity also gets its own Strain from its own heart rate (nothing taken off) plus its muscular load. Activity strains don’t add up: the day’s Strain is the day’s whole load on the same scale.",
          "Muscular load is estimated from a workout’s type and length only; Halo can’t see sets or weights. The zone chart uses WHOOP’s current five zones on your heart-rate reserve: Zone 1 from 40%, then 60, 70, 80 and 90%. Strain follows WHOOP’s published method as Halo’s own implementation; it is not WHOOP’s number, and its constants are fitted, not WHOOP’s.",
        ],
      },
    ],
  },
  {
    slug: "strain-target",
    name: "Strain Target",
    summary: "A Strain range for today, set by your Recovery and recent load.",
    href: "/strain",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Today’s Recovery", detail: "Picks the band. Without a Recovery score there is no target." },
          { term: "Your last 28\u00a0days of Strain", detail: "The average of the days with Strain, today not included, is your base." },
          { term: "Training balance", detail: "Your load ratio (Garmin’s acute ÷ chronic load) up to yesterday." },
        ],
      },
      {
        title: "How it is weighted",
        rows: [
          { term: "Green Recovery", detail: "Base × 1.0 to base × 1.25" },
          { term: "Yellow Recovery", detail: "Base × 0.8 to base × 1.0" },
          { term: "Red Recovery", detail: "Base × 0.5 to base × 0.75" },
        ],
        paragraphs: [
          "If your load ratio is above 1.5 (Garmin’s High), the top of the range is capped at your base, since load is already climbing fast. Below 0.8, both ends rise by 10%. The range is then kept between 4 and 19 and at least 2 wide; a range that is too narrow widens downwards. A base of 12 on a green day gives 12.0 - 15.0.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Below the range", detail: "A lighter day than your body can take today." },
          { term: "Inside the range", detail: "Training builds fitness without digging a recovery hole." },
          { term: "Above the range", detail: "More strain than today’s Recovery suggests; expect it to show tomorrow." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "With fewer than 14\u00a0days of Strain in the last 28, Halo uses a starting range for your band, marked as an estimate: green 14.0 - 18.0, yellow 10.0 - 14.0, red 6.0 - 10.0. The target does not know your training plan, races or injuries. It is a guide, not a prescription.",
        ],
      },
    ],
  },
  {
    slug: "sleep",
    name: "Sleep Performance",
    summary: "How well last night’s sleep met your need, from 0 to 100%.",
    href: "/sleep",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Halo scores sleep on the four parts WHOOP has used since May 2025. Restorative sleep (deep plus REM) is shown beside the score but is not part of it, as at WHOOP.",
        ],
        rows: [
          { term: "Hours vs. needed", detail: "Your main sleep against last night’s full need: the need the Sleep Planner set the evening before (your baseline, plus your Strain and sleep debt, minus naps). Naps are not counted here." },
          { term: "Sleep consistency", detail: "How closely the last 24\u00a0hours of sleep and wake match each of the 4\u00a0days before." },
          { term: "Sleep efficiency", detail: "Time asleep as a share of time in bed." },
          { term: "Sleep stress", detail: "The share of your asleep minutes when your heart rate stayed well above that night’s calm level." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "WHOOP doesn’t publish its weights, so these are Halo’s, chosen so hours against need drive the score as they did before 2025. A missing part’s weight is shared among the rest.",
        ],
        rows: [
          { term: "Hours vs. needed, 70%", detail: "Full marks at 100% of your need." },
          { term: "Consistency, 10%", detail: "Scored as the consistency percentage." },
          { term: "Efficiency, 10%", detail: "Full marks at 95% and above." },
          { term: "Sleep stress, 10%", detail: "100 minus the sleep-stress percentage." },
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "85-100%", detail: "Optimal" },
          { term: "70-84%", detail: "Sufficient" },
          { term: "0-69%", detail: "Poor" },
        ],
        paragraphs: [
          "The key statistics use their own marks for optimal and sufficient: hours vs. needed 85% and 70%, efficiency 85% and 75%, restorative 40% and 30%, consistency 80% and 70%, sleep stress under 10% and under 20%.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Sleep Performance scores the main sleep only, once Fitbit has processed it. WHOOP measures sleep stress from heart-rate variability and breathing; Halo has only your heart rate during sleep, so its sleep stress is a heart-rate stand-in: a stretch of 3\u00a0minutes or more at least 6\u00a0bpm (or 8% of your heart-rate reserve, if more) above the night’s calm level, its 20th percentile. A night without stages or with under an hour of sleeping heart rate has no sleep stress, and its weight goes to the other parts. Sleep stages come from a wrist sensor and are an estimate. This is Halo’s own implementation of WHOOP’s published method, not WHOOP’s score.",
        ],
      },
    ],
  },
  {
    slug: "sleep-planner",
    name: "Sleep Planner",
    summary: "Tonight’s sleep need, and the bedtimes that meet it.",
    href: "/sleep",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Your baseline need", detail: "The upper quartile of your last 28\u00a0nights, between 8 and 9.5\u00a0hours." },
          { term: "Today’s Strain", detail: "Harder days add to the need, more steeply the higher the Strain." },
          { term: "Sleep debt", detail: "What you owe from your last 28\u00a0nights." },
          { term: "Naps", detail: "Today’s naps take time off tonight’s need." },
          { term: "Your last 14 main sleeps", detail: "Your usual wake time, your sleep efficiency and how long you usually take to fall asleep." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Tonight’s need = your baseline need + a Strain term + half your sleep debt (at most 1\u00a0hour) − today’s nap time, kept between 6.5 and 11\u00a0hours. This is the structure in WHOOP’s sleep-need patent. The Strain term is 1.7\u00a0hours ÷ (1 + e^((17 − Strain) ÷ 3.5)): about 7\u00a0minutes at Strain 8, 16 at 11, 30 at 14, 58 at 18 and 77 at 21.",
          "Sleep debt runs over your last 28\u00a0nights with sleep. Each night, debt becomes 55% of (need + the debt so far − sleep), with the previous day’s naps counted as sleep; anything under 10\u00a0minutes clears to zero.",
          "Bedtimes count back from your median wake time on recent weekday or weekend mornings, to match tomorrow: the minutes you usually take to fall asleep, then the sleep itself at your usual efficiency once asleep (90% until known). Last night’s Sleep Performance was scored against the need set here the evening before.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Peak", detail: "100% of tonight’s need." },
          { term: "Perform", detail: "85% of tonight’s need." },
          { term: "Get by", detail: "70% of tonight’s need." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "The planner needs 7 main sleeps before it gives bedtimes. It assumes tomorrow looks like your recent mornings and cannot see alarms or plans. Strain and naps later today change tonight’s need. WHOOP doesn’t publish where its debt term stops; Halo’s half-the-debt, at most an hour, is its own choice. It is a guide, not a prescription.",
        ],
      },
    ],
  },
  {
    slug: "pulse-age",
    name: "Halo Age",
    summary: "How old your body behaves, and how fast that is changing.",
    href: "/health/healthspan",
    sections: [
      {
        title: "What goes in",
        paragraphs: ["Nine habits and vitals, averaged over the days with data in the last 6\u00a0months, each against WHOOP’s recommendation for your age and sex."],
        rows: [
          { term: "VO2 max", detail: "A measured value (a lab or field test) from the last 90\u00a0days counts in full; Fitbit’s estimate counts half, and with neither, so does Halo’s own estimate from resting heart rate and activity. 13% lower mortality per 3.5\u00a0ml/kg/min (Kodama 2009). Reference: WHOOP’s minimum for your age, 46 for men and 40 for women at 25, falling with age." },
          { term: "Resting heart rate", detail: "Fitbit’s daily value from Health Connect. 9% higher mortality per 10\u00a0bpm above 45 (Zhang 2016). Reference 60\u00a0bpm for men, 64 for women." },
          { term: "Steps", detail: "Only days with 12\u00a0hours of heart rate. Lower mortality up to about 10,900 a day (Paluch 2022). Reference 8,000 a day under 60, 5,600 from 60." },
          { term: "Sleep hours", detail: "Main sleep. 29% higher mortality at 5\u00a0hours than at 7 (Saint-Maurice 2024); 7\u00a0hours or more all score the same. Reference 7\u00a0hours." },
          { term: "Sleep consistency", detail: "Your 7-night Sleep Regularity Index (Windred 2024). Reference 75.6." },
          { term: "Moderate activity", detail: "Time in heart-rate zones 1-3, 40-80% of your heart-rate reserve (a brisk walk counts), inside workouts or in stretches of 10\u00a0minutes or more, each minute once as WHOOP counts it. 20% lower mortality at 75\u00a0minutes a week, levelling off past 300 (Arem 2015). Reference 100\u00a0minutes a week at 30, falling to 70 at 70." },
          { term: "Heart rate zones 4-5", detail: "Time at 80% of your heart-rate reserve and above, counted the same way. 36% lower mortality at about 55\u00a0minutes a week (Ahmadi 2022). Reference 10\u00a0minutes a week at 30, 7 at 70." },
          { term: "Strength activity", detail: "Strength training, weightlifting, calisthenics, HIIT, boot camp, yoga and Pilates workouts, as WHOOP’s list counts them. Lowest risk from 40\u00a0minutes a week (Momma 2022); more earns nothing extra and costs nothing. Reference 40\u00a0minutes a week." },
          { term: "Lean body mass", detail: "100% minus your body fat. 11% higher mortality per 10 points of body fat (Jayedi 2022), credit stopping 5 points under the reference, and no effect from 60. Reference 20% body fat for men, 33% for women. With weight but no body fat reading, body fat comes from your BMI (Deurenberg 1991) and counts half. Lean and fat mass in kg and per m² of height are shown beside it." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each input maps to a change in mortality risk from its study. Halo adds the changes, weighting estimates by half, and turns them into years as WHOOP does: mortality rises about 10% a year of age, so a 10% higher risk is about a year. Because the inputs overlap (a fit person tends to have a low resting heart rate too), the total is scaled by 0.477, a factor fitted to the four example profiles in WHOOP’s white paper. A missing input neither adds nor takes away years. A resting heart rate of 70\u00a0bpm, all else at reference, adds about 0.5\u00a0years.",
          "Pace of Aging asks how much your Halo Age would move in 6\u00a0months if your last 30\u00a0days continued: 1 + (30-day years − 6-month years) ÷ 0.5. As at WHOOP it updates weekly, on Mondays.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Younger than your age", detail: "Your inputs beat the reference on balance." },
          { term: "Older than your age", detail: "They fall short of the recommendations." },
          { term: "Pace below 1.0x", detail: "Your last 30\u00a0days look younger than your 6\u00a0months." },
          { term: "Pace above 1.0x", detail: "They look older. Pace runs from −1.0x to 3.0x." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Time in zones is counted by Halo from your heart rate, on the same zones as Strain. Body fat comes from a scale or your own entry, and a few points of error in it moves the lean-mass input a little. Activity inputs (moderate, vigorous, strength and steps) count only days with at least 12\u00a0hours of heart rate, so a band left on the charger isn’t read as a lazy day. Halo Age needs 5 of the 9 inputs; it is Provisional until 20\u00a0days have data and while it rests on fewer than 7 inputs, and stays within 15\u00a0years of your age. Pace of Aging shows once 21 of the last 31\u00a0days have a Recovery score, as WHOOP requires, and is provisional until your data spans 6\u00a0months. Both rest on population studies, not a clinical test of your body.",
        ],
      },
    ],
  },
  {
    slug: "stress",
    name: "Stress Monitor",
    summary: "How far your heart rate sits above your calm level, from 0 to 3.",
    href: "/health/stress",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Minute heart rate", detail: "The average heart rate of each minute." },
          { term: "Steps", detail: "Only still minutes count: no steps in that minute or the 2 either side." },
          { term: "Workouts and sleep", detail: "Minutes inside them are left out." },
          { term: "Your calm baseline", detail: "Your resting daytime heart rate, from earlier days." },
        ],
        paragraphs: [
          "Each day’s calm heart rate is the 10th percentile of its hourly averages between 06:00 and 22:00, using hours with at least 15 still minutes. It feeds the next day’s baseline.",
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each still minute’s distance above your baseline is measured in your usual spread, never less than 3.76\u00a0bpm, and mapped onto 0 to 3 on an S-shaped curve. At your baseline it reads 0.3, 1.5 spreads above reads 1.5, and 3 spreads above reads 2.7. Today Halo shows the latest scored minute; past days show the day’s average.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "0-0.9", detail: "Low: calm." },
          { term: "1.0-1.9", detail: "Medium: heart rate above your calm level." },
          { term: "2.0-3.0", detail: "High: well above your calm level while you are still." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Stress is Provisional until 4\u00a0days have set your baseline; until then it uses a fixed spread of 7.65\u00a0bpm, so 15\u00a0bpm above your calm level reads 2.0. It reads heart rate alone, so caffeine, heat, illness or recovering from exercise raise it too. It is not a measure of how you feel.",
        ],
      },
    ],
  },
  {
    slug: "energy-bank",
    name: "Energy Bank",
    summary: "An estimate of your energy reserve, around the clock, from 5 to 100.",
    href: "/",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Energy Bank is Halo’s own implementation of Garmin’s published Body Battery idea: one reserve that sleep fills and the waking day spends, carried on from one day to the next.",
        ],
        rows: [
          { term: "Sleep", detail: "Every asleep minute, main sleep and naps, by stage: deep sleep restores most, an awake minute in bed nothing. A night with HRV above your baseline restores more." },
          { term: "Activity", detail: "Each minute’s training load, as Day Strain counts it." },
          { term: "Stress", detail: "Still minutes above a resting level drain; calm, still minutes give a little back." },
          { term: "Time awake", detail: "A steady sleep pressure, as in Garmin’s method." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each day carries on from midnight at the level the day before ended. The very first day, or after a gap without data, starts at wake at 60% of Recovery plus 40% of Sleep Performance. Then, minute by minute:",
        ],
        rows: [
          { term: "Asleep", detail: "A night as long as your sleep need, with typical stages and HRV at your baseline, restores about 65. Deep counts 1.2, light 1.0, REM 0.9, awake 0, times a night quality of 0.6 + 0.4 × last night’s HRV ÷ your baseline (0.5 to 1.3)." },
          { term: "Awake", detail: "−3 an hour of sleep pressure, about 48 over 16\u00a0hours." },
          { term: "Activity", detail: "−0.17 for each point of training load: an hour’s hard run costs about 20." },
          { term: "Stress", detail: "Halo’s stress (0-3) on Garmin’s 0-100 scale: under 25, up to +2.5 an hour; over 25, up to −9 an hour at the top." },
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "76-100", detail: "High." },
          { term: "51-75", detail: "Medium." },
          { term: "26-50", detail: "Low." },
          { term: "5-25", detail: "Very low." },
        ],
        paragraphs: ["Garmin’s bands. The level stays between 5 and 100. The three biggest drains are listed by name."],
      },
      {
        title: "Limits",
        paragraphs: [
          "Garmin reads beat-to-beat HRV all day; Halo has heart rate only, so stress here is the heart-rate Stress Monitor. Garmin’s rates are unpublished: Halo’s are its own, set so a good night restores about 65 and a typical day spends about as much (waking near 90 and ending the day near 35 on average). A day without heart rate or sleep has no value, and the next day starts again from Recovery. It cannot see mental effort that leaves heart rate unchanged, food or caffeine. It is an estimate, not a measurement.",
        ],
      },
    ],
  },
  {
    slug: "health-monitor",
    name: "Health Monitor",
    summary: "Last night’s five vitals against your own normal ranges.",
    href: "/health/monitor",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Resting heart rate", detail: "Fitbit’s daily resting heart rate from Health Connect, in bpm." },
          { term: "Heart rate variability", detail: "Fitbit’s nightly HRV, in ms." },
          { term: "Respiratory rate", detail: "Breaths per minute asleep, in rpm." },
          { term: "SpO2", detail: "Blood oxygen overnight, in %." },
          { term: "Skin temperature", detail: "Last night against the skin-temperature baseline that comes with it from Health Connect, in °C." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Resting heart rate and HRV use the data’s own personal ranges when it comes with them (the demo data does), and skin temperature uses ± 2 of its 30-night standard deviation around its baseline; Health Connect carries neither, so with your own data every range is Halo’s. Otherwise, and always for respiratory rate and SpO2, a normal range is your baseline ± 2 of your usual night-to-night swings, built from earlier nights only. Halo’s narrowest ranges are about ±5\u00a0bpm, ±12.5\u00a0ms, ±1.25\u00a0rpm, ±1.25\u00a0points of SpO2 and ±0.75\u00a0°C. SpO2 is one-sided: below 95% is always low, and a high value is never flagged.",
          "The illness signal compares resting heart rate, HRV, skin temperature and respiratory rate with your 30\u00a0nights before. A vital fires at 2 standard deviations in the unwell direction and adds 22\u00a0points per extra deviation, up to 40. With at least 2 vitals firing, 25\u00a0points is mild and 50 is raised. If you logged alcohol, sauna or travel the day before, Halo takes that as the likely cause instead.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Within range", detail: "Inside your normal range." },
          { term: "Elevated or Low", detail: "Outside it; the chip names the bound you crossed." },
          { term: "Below 95%", detail: "SpO2 under 95%, whatever your range." },
          { term: "Illness signal", detail: "Several vitals moved together, a pattern often seen early in illness." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "A range that comes with the data (the demo’s) is there at once. Halo’s own range needs 4 earlier nights and lapses after 14\u00a0nights without a value. Skin temperature arrives from Health Connect already as a deviation from your band’s baseline, so its range also needs 4 earlier nights. The illness signal stays quiet until 14 of your last 30\u00a0nights have resting heart rate or HRV. A flagged vital is a prompt to notice, not a diagnosis.",
        ],
      },
    ],
  },
  {
    slug: "fitness",
    name: "Fitness level",
    summary: "Your VO2 max compared with people of your age and sex.",
    href: "/health/fitness",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "VO2 max", detail: "Your latest measured value (a lab or field test) from the last 90\u00a0days; otherwise Fitbit’s latest daily estimate; otherwise Halo’s own estimate from your resting heart rate and activity. Estimates are marked Provisional." },
          { term: "Age and sex", detail: "From your profile." },
          { term: "Fitness Age", detail: "The age whose typical fitness matches yours, from your median resting heart rate and a HUNT activity index built from your last 7\u00a0days of zone time (Nes 2011, the HUNT study, ported from noop). The VO2 max it estimates uses your waist when you add it in Profile, otherwise the ratio of your max to resting heart rate (Uth 2004). Good to about 5\u00a0years." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Halo places your VO2 max in the FRIEND reference table (Kaminsky 2015): lab treadmill tests from 7,783 adults without heart disease, by sex and age decade. It reads between the published percentiles and keeps the result between the 5th and the 95th. Under 20 uses the 20-29 row; 80 and over uses 70-79. The categories use Garmin’s cut-offs (the Cooper Institute percentiles in Garmin’s 2026 manual). A man of 35 at 45.0\u00a0ml/kg/min sits just under the 60th percentile: Fair.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "95th percentile and up", detail: "Superior" },
          { term: "80th-94th", detail: "Excellent" },
          { term: "60th-79th", detail: "Good" },
          { term: "40th-59th", detail: "Fair" },
          { term: "Below the 40th", detail: "Poor" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Fitbit’s VO2 max is an estimate, while the table is lab-measured, so treat the percentile as approximate. The 2015 table runs 1.5-4.6\u00a0ml/kg/min higher than its 2022 update, so you may place a little low. Halo Age scores VO2 max against WHOOP’s recommendation for your age instead. Garmin reads its cut-offs on the Cooper Institute’s table; Halo reads them on FRIEND’s, so the same VO2 max can land in a different category.",
        ],
      },
    ],
  },
  {
    slug: "training-balance",
    name: "Training balance",
    summary: "Whether your recent training load is above or below what you are used to.",
    href: "/health/fitness",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Your daily training load: the load behind your Day Strain, before the log scale (Banister’s TRIMP, with your strength workouts’ muscular load), so a day twice as hard counts twice. A day without enough heart rate is skipped. Today’s load so far counts toward today’s ratio.",
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Halo follows Garmin’s published model. Acute load: each day’s load counts in full and fades out over the next 10\u00a0days (weights 1.0, 0.9 … 0.1), scaled to a 7-day total; a missing day is left out. Chronic load: the average of your acute load over the last 28\u00a0days. The load ratio is acute ÷ chronic: 1.00 means your recent training matches your usual. Reports use the last day of the week or month that has a ratio; Fitness shows today’s.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Below 0.80", detail: "Low (Detraining on Fitness): load dropped below your usual." },
          { term: "0.80-1.49", detail: "Optimal: the usual range." },
          { term: "1.50-1.99", detail: "High (Pushing): load is rising faster than you are used to." },
          { term: "2.00 and up", detail: "Very high (High risk): load jumped well above your usual." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "The acute load needs 7 of its 10\u00a0days, and the ratio 14\u00a0days of acute load. It compares you with yourself, so it says nothing about whether your usual load suits your goals. The bands are Garmin’s 2026 ones; Garmin’s own load comes from EPOC, Halo’s from heart rate through TRIMP, so the numbers are Halo’s, not Garmin’s.",
        ],
      },
    ],
  },
  {
    slug: "journal-impact",
    name: "Behaviour insights",
    summary: "How each behaviour you log goes with your next day’s scores.",
    href: "/journal/insights",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Journal check-ins", detail: "Each behaviour you answered yes or no, over the last 90\u00a0days." },
          { term: "Next-day scores", detail: "The next morning’s Recovery and HRV, and that night’s Sleep Performance." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "For each behaviour, Halo compares the days you answered yes with the days you answered no: the difference in average next-day score. HRV shows as the change in standard deviations from your baseline. To see how sure that difference is, Halo resamples your days 1,000 times and keeps the middle 90% of the results.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Positive or negative", detail: "That whole 90% range sits above or below zero: a clear effect." },
          { term: "No clear effect", detail: "The range crosses zero." },
          { term: "Needs more data", detail: "Fewer than 5 yes days or 5 no days." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "This is an association, not proof of cause. It does not adjust for other behaviours or training, so a tag you tend to log on hard days can look harmful. About 1 in 10 behaviours with no real effect will still show a clear one by chance. Days without an answer are left out.",
        ],
      },
    ],
  },
  {
    slug: "sleep-consistency",
    name: "Sleep consistency",
    summary: "How closely your sleep and wake times repeat from day to day.",
    href: "/sleep",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Sleep sessions", detail: "Main sleeps and naps, minute by minute." },
          { term: "Band wear", detail: "A day counts only if the band recorded heart rate for at least half of it and some sleep was recorded." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Halo splits the days into noon-to-noon minutes, each asleep or awake, and compares the last 24\u00a0hours with each of the 4\u00a0days before, minute for minute, as WHOOP’s Sleep Consistency does. The score is −100 + 200 × the share that match, shown from 0 to 100%: 100 means an identical schedule, around 0 a random one. Last night counts in every comparison, so it matters most.",
          "It makes up 10% of Sleep Performance. Halo Age keeps the Sleep Regularity Index (Phillips 2017) instead: each day against the next over 7\u00a0days, which is what its mortality evidence measured. The two read a little differently on the same nights.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "80-100%", detail: "Optimal" },
          { term: "70-79%", detail: "Sufficient" },
          { term: "0-69%", detail: "Poor" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs last night and at least one of the 4\u00a0days before; otherwise there is no value. Days without the band are skipped rather than counted as awake. Fitbit’s sleep sessions leave out brief wakes, so this reads somewhat higher than a lab measure. On the night the clocks change, times are compared 1\u00a0hour apart.",
        ],
      },
    ],
  },
  {
    slug: "recovery-forecast",
    name: "Recovery forecast",
    summary: "An estimate of tomorrow morning’s Recovery.",
    href: "/recovery",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Recent Recovery", detail: "Your last 14\u00a0scores." },
          { term: "Today’s Strain", detail: "So far, against your average over the last 14\u00a0days." },
          { term: "Tonight’s sleep", detail: "Halo assumes you sleep tonight’s Peak need." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: ["The forecast starts from your 14-day average Recovery and adds three nudges:"],
        rows: [
          { term: "Strain", detail: "About 3.6\u00a0points off for each Strain point above your 14-day average, or on for each below, up to 12." },
          { term: "Sleep", detail: "Planned sleep 10% above your usual need adds 1.4\u00a0points, up to 3.5; less than your need takes points off." },
          { term: "Trend", detail: "If Recovery has been climbing or falling, it eases back by the daily slope, up to 8\u00a0points." },
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "67-100%", detail: "Green, as for Recovery." },
          { term: "34-66%", detail: "Yellow." },
          { term: "0-33%", detail: "Red." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "The forecast starts after 14\u00a0nights of Recovery. Its uncertainty is the spread of your last 14\u00a0scores, at least ±8\u00a0points, so read it as a rough guide. It cannot know tonight’s alcohol, stress or illness, or whether you actually sleep the plan.",
        ],
      },
    ],
  },
  {
    slug: "training-load",
    name: "Fitness, fatigue and form",
    summary: "Your long-term and short-term training load, and the gap between them.",
    href: "/health/fitness",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Your daily training load: the load behind your Day Strain before the log scale (Banister’s TRIMP), so a hard day counts in proportion. A day without enough heart rate breaks the run.",
        ],
      },
      {
        title: "How it is weighted",
        rows: [
          { term: "Fitness", detail: "A rolling average of daily load that fades with a 42-day time constant." },
          { term: "Fatigue", detail: "The same with a 7-day time constant, so it reacts faster." },
          { term: "Form", detail: "Fitness minus Fatigue." },
        ],
        paragraphs: ["Both averages start from your mean load over the first 7\u00a0days."],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Form above 0", detail: "Your recent load is lighter than your longer-term load: you are fresher." },
          { term: "Form below 0", detail: "You are carrying fatigue from recent training." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs 14\u00a0days in a row with Strain data, and a day without the band starts the run again. It settles after about 42\u00a0days. Heart rate is its only input, so load that barely raises heart rate is missed.",
        ],
      },
    ],
  },
  {
    slug: "hr-recovery",
    name: "Heart rate recovery",
    summary: "How far your heart rate drops in the minute after a workout.",
    href: null,
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "End heart rate", detail: "The highest reading in the last 30\u00a0seconds of the activity." },
          { term: "One minute later", detail: "The median reading 45-75 seconds after the end, from at least 3\u00a0readings." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Heart rate recovery = end heart rate − heart rate one minute later, in bpm. It is measured only after a hard enough finish: at least 2\u00a0minutes in a row at 70% or more of your max heart rate within the last 5\u00a0minutes.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "20\u00a0bpm or more", detail: "Good" },
          { term: "12-19 bpm", detail: "Typical" },
          { term: "Below 12\u00a0bpm", detail: "Low" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs dense heart rate around the end of the activity, which Fitbit does not always record; otherwise it shows Not enough heart-rate data. Moving about in that first minute, or stopping the activity late, lowers the drop. Compare it across similar workouts, not between different sports.",
        ],
      },
    ],
  },
  {
    slug: "hrv-status",
    name: "HRV Status",
    summary: "Your 7-day HRV against your usual range, in Garmin’s manner.",
    href: "/health",
    sections: [
      {
        title: "What goes in",
        paragraphs: ["Fitbit’s nightly HRV (RMSSD, in ms), one value a night."],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Halo averages the natural log of your HRV over the last 7\u00a0nights (it needs 4 of them) and compares it with the mean and spread of the 60\u00a0nights before. Your usual range is the mean ± 0.75 of a spread; the Low line is 1.5 spreads under the mean. The log scale is the one HRV research uses, so a night twice your usual counts as much above as half your usual counts below.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Balanced", detail: "Your 7-day average is in your usual range." },
          { term: "Unbalanced", detail: "Above your usual range, or a little below it." },
          { term: "Low", detail: "Well below your usual range: often strain, illness or poor sleep." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs 21\u00a0nights of HRV first. Garmin reads HRV across the whole night from its own sensor and adds a Poor status when your range is low for your age; Halo uses Fitbit’s nightly value and leaves Poor out until it has a published age norm. The spread and the 0.75 and 1.5 lines are Halo’s choices: Garmin doesn’t publish its own. This is Halo’s implementation of Garmin’s published idea, not Garmin’s number.",
        ],
      },
    ],
  },
  {
    slug: "training-readiness",
    name: "Training Readiness",
    summary: "How ready you are for hard training today, from 1 to 100.",
    href: "/tab-activity",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Last night’s sleep", detail: "Sleep Performance." },
          { term: "Recovery time", detail: "Hours left before your next hard session (below)." },
          { term: "HRV Status", detail: "Balanced, Unbalanced above or below, or Low." },
          { term: "Load ratio", detail: "Garmin’s acute against chronic load." },
          { term: "Sleep history", detail: "Sleep Performance over the last 3\u00a0nights." },
          { term: "Stress history", detail: "Your average awake stress over the last 3\u00a0days." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each factor is scored 0 to 100: recovery time as 100 × (1 − hours ÷ 72)^1.3; HRV Balanced 100, Unbalanced above 75, below 55, Low 25; load ratio 100 from 0.8 to 1.5, falling to 30 at 2.0, and 90 under 0.8; stress 100 less 50 for each point of average stress above 0.75.",
          "Readiness = 25% sleep + 25% recovery time + 15% HRV + 15% load + 10% sleep history + 10% stress history, a missing factor’s weight shared among the rest. It is never more than the weakest factor + 30, and a day of more than 18\u00a0hours awake before last night’s sleep takes 10 off.",
          "Recovery time: each workout adds 72 × ((Training Effect − 1) ÷ 4)^2.32 hours (about 24 at 3.5, 72 at 5); on top of time left, the larger plus a quarter of the smaller, up to 96, and 15% more with a load ratio of 1.5 or more. It counts down an hour an hour, 1.4 asleep after a night of 85% or better, 0.7 in a stressed hour or after a night under 70%.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "95-100", detail: "Prime" },
          { term: "75-94", detail: "High" },
          { term: "50-74", detail: "Moderate" },
          { term: "25-49", detail: "Low" },
          { term: "1-24", detail: "Poor" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Garmin publishes the factors, that sleep and recovery time count most, and the bands; it doesn’t publish weights or recovery-time constants, so these are Halo’s, fitted to Garmin’s published recovery-time table. It is set at wake and drops after training. It needs a scored night and three of its factors. It is a guide for today’s training, not a medical reading.",
        ],
      },
    ],
  },
  {
    slug: "training-effect",
    name: "Training Effect",
    summary: "How much a workout improves your aerobic fitness, from 0 to 5.",
    href: null,
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Heart rate in the workout", detail: "As a share of your heart-rate reserve, turned into a share of your VO2 max." },
          { term: "VO2 max", detail: "Fitbit’s or a measured one from the last 90\u00a0days; else Uth’s estimate, 15.3 × max ÷ resting heart rate." },
          { term: "Your training background", detail: "An activity class from 0 to 10: from your VO2 max, age, BMI and sex (Jackson 1990), or from your weekly workout hours over the last 4\u00a0weeks, whichever is higher." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Halo estimates the workout’s EPOC, the extra oxygen your body uses afterwards to recover, second by second: it rises with intensity and fades when you ease off, on curves fitted to Firstbeat’s published figures (an hour at 70% of VO2 max is about 137\u00a0ml/kg). The peak is compared with the EPOC that makes each Training Effect level for your activity class (Firstbeat’s published lines), linearly between them.",
          "The main benefit comes from the effect and your time by share of max heart rate: Recovery under 2; VO2 max at 4 or more with over 10\u00a0minutes above 90%; Threshold when most of it was at 80% or more; Tempo when a quarter or more was; else Base.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "0-0.9", detail: "No benefit" },
          { term: "1.0-1.9", detail: "Minor" },
          { term: "2.0-2.9", detail: "Maintaining" },
          { term: "3.0-3.9", detail: "Improving" },
          { term: "4.0-4.9", detail: "Highly improving" },
          { term: "5.0", detail: "Overreaching" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Garmin estimates EPOC with beat-to-beat data and unpublished constants; Halo’s comes from heart rate alone, so read it as an estimate. There is no anaerobic Training Effect, which needs pace or power. A workout without enough heart rate has none. This is Halo’s implementation of Garmin’s published method, not Garmin’s number.",
        ],
      },
    ],
  },
  {
    slug: "training-status",
    name: "Training Status",
    summary: "What your recent training is doing to your fitness.",
    href: "/tab-activity",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Load ratio", detail: "Garmin’s acute against chronic load, and whether the acute load is falling (under 90% of a week ago)." },
          { term: "VO2 max trend", detail: "Fitbit’s VO2 max over the last 28\u00a0days, recent days weighted more, as a change a month." },
          { term: "HRV Status", detail: "Today’s, and the last 3\u00a0days’." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Rules, in order, the first that fits: Detraining, acute load under 20% of your 12-week median for 7\u00a0days; Strained, HRV Low, or Unbalanced below for 3\u00a0days, at a ratio of 0.8 or more; Overreaching, a ratio of 1.5 or more with VO2 max falling 1.5 a month or more or HRV Low; Recovery, a ratio under 0.8 and load falling; Peaking, VO2 max rising 1.5 a month or more while load falls; Productive, a ratio from 0.8 to 1.5 with VO2 max rising, or HRV Balanced at 1.0 or more; Unproductive, that ratio with VO2 max falling; otherwise Maintaining.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Productive, Peaking", detail: "Training is paying off." },
          { term: "Maintaining, Recovery", detail: "Holding fitness, or recovering for more." },
          { term: "Unproductive, Strained, Detraining", detail: "Something is off: recovery, or too little load." },
          { term: "Overreaching", detail: "Load is high enough to cost you. Ease off." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs about 3\u00a0weeks of training data and a VO2 max or an HRV Status. Fitbit’s VO2 max is an estimate that moves slowly, so Halo reads its trend over 28\u00a0days rather than Garmin’s 14. Garmin’s Paused status (time off for illness or injury) isn’t detected. This is Halo’s implementation of the rules in Firstbeat’s published patent, not Garmin’s number.",
        ],
      },
    ],
  },
]
