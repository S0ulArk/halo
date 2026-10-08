# WHOOP and Garmin: what they show, how they compute it, and how Halo should align

Research date: 2026-10-09. Scope: the products as they ship now: WHOOP 5.0 / MG (launched May 2025) with its 2026 software, and Garmin Connect / Connect+ with watches up to the Fenix 9 (Aug 2026) and the Q3-2026 feature update. Halo's code was read at `src/core`, `src/pipeline`, `src/queries`, `src/live` (SCORING_VERSION 14).

**Data Halo has (Health Connect, from a Fitbit):**
- Heart rate samples, 1–5 s apart in exercise and a few minutes apart otherwise.
- Nightly values: resting HR, HRV (RMSSD), SpO2, respiratory rate, skin temperature.
- Sleep sessions with stages.
- Steps, distance, floors and calories.
- Exercise sessions with a type.
- Fitbit's VO2max estimate, weight, body fat, nutrition and hydration.
- Live beat-to-beat RR intervals from a paired Bluetooth strap (`src/health/bleHr.ts`). These are display-only and never stored.

**Data Halo does not have:** an accelerometer stream, a GPS track, power, or stored beat-to-beat intervals.

**Confidence tags used throughout**
- **[PUB]**: published by the vendor, in a vendor patent, or in a vendor white paper.
- **[INF]**: inferred. This means reverse-engineered by others, read off a published figure, or deduced from vendor examples.
- **[GUESS]**: our approximation, to be calibrated.
- **(older)**: a source from before 2025. It is used only where a current vendor page says the method still applies.

Every source has a date; see §5. In the text, sources are cited as [W#] for WHOOP and [G#] for Garmin.

---

## 0. What's new in 2025–2026

### WHOOP

| Date | Change | Matters for Halo? |
|---|---|---|
| 2024-11-21 | HR zones moved from % of max HR to **% of heart-rate reserve**: Z1 40–60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 90–100. Resting HR is a 14-day value [W12]. | **Yes.** Halo's `zones.ts` still starts Z1 at 50%. |
| 2025-03 | Passive VO2max estimate. Updated weekly; needs ≥14 recoveries in 21 days [W16]. | Halo uses Fitbit's VO2max instead. |
| 2025-05-05/08 | **Sleep Performance became a four-part score**: Hours vs Needed, Sleep Consistency, Sleep Efficiency and Sleep Stress. Before this it was simply hours ÷ need [W19, W27]. New sleep-staging model trained on polysomnography. | **Yes.** Halo's score uses different parts. |
| 2025-05-08 | WHOOP 5.0/MG launched with three tiers (One / Peak / Life). It brought **Healthspan (WHOOP Age, Pace of Aging)**, Heart Screener ECG and irregular-rhythm notifications (MG), and Blood Pressure Insights (beta) [W11, W17, W18, W19]. | Healthspan already exists in Halo as Halo Age. ECG and blood pressure are not computable. |
| 2025 | Women's Hormonal Insights (cycle phases, pregnancy). Weekly Plan revamp [W19, W23]. | Partly computable. |
| 2025-09 to 2025-11 | Advanced Labs (65 biomarkers via Quest). Labs uploads made free [W19]. | Display only. |
| 2026-01-08 to 2026-04-22 | **Passive muscular load ("Passive MSK")**. Strain now includes an estimated muscular load for strength-type activities, based on **activity type and duration**, with no logging needed. Extended to about 34 activity types. Strength workouts now score higher Strain and push Sleep Need up [W14, W24]. | **Yes.** Computable from exercise type and duration. |
| 2026-02-25 | New heart-rate signal-processing algorithm. Strain shifted slightly for some members [W25]. | No. This is a sensor change. |
| 2026-02 | Sleep Need now also uses "typical sleep patterns" from the last 28 days (bed and wake times, duration, efficiency) and smooths weekday/weekend shifts, travel and time-zone changes [W5]. | **Yes**, for the sleep planner. |
| 2026-03-13 | Jet-lag coaching added to WHOOP AI [W20]. | Possible, low priority. |
| 2026-03-25 | Behavior Trends and Insights. Needs ≥5 "yes" and ≥5 "no" logs in 90 days [W20]. | **Already matched** by `journalImpact.ts`. |
| 2026-04-30 to 05 | Voice journal, "My Memory", proactive check-ins (AI) [W20]. | Halo has its own coach. |
| 2026-05-08 | On-demand clinician video visits announced for the US [W26]. | Not applicable. |
| 2026-08 | Natural Cycles integration (shares skin temperature). Galleri cancer test in Advanced Labs. Labs available without a membership [W20]. | Not applicable. |

### Garmin

| Date | Change | Matters for Halo? |
|---|---|---|
| 2022 (still current) | **Acute Load** changed from a plain 7-day sum to a **10-day decaying sum normalised to 7 days**. Training Status started using HRV and gained "Strained" [G2-training-load, G10]. | **Yes.** This is the load model to copy. |
| 2023 (still current) | Load Ratio display (acute ÷ chronic). Training Readiness (2022) [G1]. | Yes. |
| 2025-03-27 | Garmin Connect+ subscription: Active Intelligence (AI insights at wake, after workouts and in the evening), Performance Dashboard [G15]. | Halo's coach covers this. |
| 2025-05 | Forerunner 570/970 with the HRM 600 chest strap brought **Running Tolerance**, **Running Economy**, **Step Speed Loss**, Evening Report and projected race time [G2, G15]. | Mostly not computable: these need running dynamics or pace. |
| 2025-06-18 | Index Sleep Monitor (upper-arm band) [G15]. | No. |
| 2025-09-17 | Venu 4 brought **Health Status** (five overnight vitals against baseline), **Lifestyle Logging**, **Sleep Alignment / Sleep Consistency**, Garmin Fitness Coach and fall detection [G15, G13]. | Health Status and Lifestyle Logging are already close to Halo's. |
| 2025-11 / 2026-02-24 | Health Status reached more watches. The Q1-2026 update brought Sleep Alignment (an optimal sleep window from sleep history and skin temperature), on-watch lifestyle logging, "Training Readiness enhancements" (Instinct, not documented) and an evening suggested bedtime [G11, G12]. | Sleep Alignment is partly computable. |
| current | **Sleep Coach need range widened to 6.5–9.5 h** (it was 7–9 h) [G3-sleep-coach]. | Yes. Halo caps need at 9.5 h. |
| current (2026 manual) | **Load Ratio bands: Low < 0.8, Optimal 0.8–1.4, High 1.5–1.9, Very High ≥ 2.0** [G1]. Third-party pages from 2023 still say 0.8–1.3 and > 1.5. | **Yes.** Halo bands at 0.8 / 1.3 / 1.5. |
| 2026-06-02 | Health Status History (trends against baseline) [G15]. | Yes, cheap to add. |
| 2026-08-25 | Fenix 9 brought **Stamina Zones (5) / Endurance Time / Stamina Curve**, rowing VO2max and lactate threshold, and Garmin Epic. Training Readiness, Training Status, Load, HRV Status, Body Battery and Sleep Score are **unchanged from the Fenix 8** (DC Rainmaker, 2026-09) [G14, G16]. | Stamina needs pace or power, so it is not computable. |
| 2026-09-01 | Q3-2026 update: "OK Garmin" voice control, fall detection on Venu 4, low-volume and run-walk Run Coach plans, Quick Workout [G13]. | No. |
| 2025-05-02 | Firstbeat Analytics renamed Garmin Jyväskylä Oy; Firstbeat patents reassigned to it [G10]. | This is why the Firstbeat papers still describe Garmin's methods. |

**What these changes mean for Halo**
1. Halo's HR zones are pre-November-2024 WHOOP zones.
2. Halo's sleep performance mixes in restorative sleep. WHOOP's 2025 score instead uses hours vs need, consistency, efficiency and sleep stress.
3. WHOOP Strain now gives credit for strength sessions; Halo's does not.
4. Halo's load ratio uses old bands, and it is computed on log-compressed Effort rather than on a linear load.

---

## 1. Full feature list

Computable is judged against the data Halo has. **Y** = can be computed. **P** = an approximation or proxy only. **N** = needs a sensor or data Halo doesn't have.

### 1a. WHOOP

| Feature | What it shows | Computable | Halo counterpart today |
|---|---|---|---|
| Cycle (the "day") | Sleep-onset to sleep-onset day carrying one Recovery, one main sleep and Day Strain | Y | Calendar day (local midnight) |
| Day Strain (0–21) | Total cardiovascular plus muscular load, on a log scale | Y | `strain.ts` Effort ×0.21 |
| Activity Strain | Strain of one activity | Y | `stage1.ts` activities[].effort |
| Cardiovascular load | Heart-rate part of Strain | Y | Same |
| Muscular load / Passive MSK (2026) | Musculoskeletal part of Strain, estimated from activity type and duration | P | None |
| Strength Trainer (logged sets / inertial sensor) | Volume, intensity, PRs, AI workouts | N (needs the inertial sensor); manual logs only | None |
| Strain Target / Coach | Recommended strain (Restoring / Optimal / Overreaching) shown live | Y | `strainTarget.ts`, `src/live/liveStrain.ts` |
| HR zones 1–5 (+ zone 0) | Time in % heart-rate-reserve zones | Y | `zones.ts` |
| Recovery (0–100 %) | Readiness from HRV, resting HR, sleep performance and respiratory rate | Y | `recovery.ts` |
| HRV, resting HR, respiratory rate | Nightly values and trends | Y | Health Connect + baselines |
| Sleep Performance (0–100 %) | Four-part score (since 2025-05) | Y (sleep stress as a proxy) | `sleep.ts` rest() |
| Hours vs Needed | Asleep ÷ need | Y | Duration part of rest() |
| Sleep Need (and its parts) | Baseline + strain + debt − naps | Y | `sleep.ts` personalizedNeedHours, `sleepPlanner.ts` |
| Sleep Debt | Accumulated shortfall | Y | `sleep.ts` ledger |
| Sleep Consistency | Agreement of sleep/wake timing, last 24 h vs previous 4 days | Y | `sleepRegularity.ts` (7-day SRI) |
| Sleep Efficiency | Asleep ÷ in bed | Y | `hypnogramMetrics` |
| Restorative Sleep | Deep + REM, hours and % | Y | Restorative part of rest() |
| Sleep Stress | % of sleep time in a high-stress state | P (heart rate only) | None |
| Sleep stages, disturbances, cycles | Hypnogram | Y (stages from Fitbit) | `hypnogramMetrics` |
| Sleep Planner | Bedtime for Peak 100 % / Perform 85 % / Get By 70 % of need; weekly goals | Y | `sleepPlanner.ts` |
| Smart haptic alarm | Wakes you at a time, when the goal is met, or when in the green | P (phone alarm only) | None |
| Stress Monitor (0–3) | Live stress from HR + HRV vs a 14-day baseline | P (heart rate only) | `stress.ts` |
| Breathwork | Paced breathing sessions | Y (with a strap) | `src/live/breath.ts` |
| Health Monitor | Five vitals vs typical range | Y | `healthMonitor.ts` |
| Health Report (PDF) | 30 / 180-day summary | Y | Reports (no PDF) |
| Healthspan: WHOOP Age, Pace of Aging | Biological-age estimate from nine behaviours and vitals | Y | `healthspan.ts` (Halo Age) |
| VO2max (estimate) | Weekly VO2max | P (Fitbit's value) | `fitnessLevel.ts` |
| Steps | Daily steps | Y | Health Connect |
| Calories (kJ) | Per cycle and per workout | Y (from Health Connect) | Health Connect |
| Journal | Daily behaviour logging | Y | Journal |
| Behavior Insights / Impact | Effect of each behaviour on Recovery | Y | `journalImpact.ts` |
| Monthly / Weekly Performance Assessment | Period review and focus points | Y | `reports.ts` assessPeriod |
| Weekly Plan | Weekly goals for strain, sleep and strength | Y | `weeklyPlan.ts` |
| Workout auto-detect | Detect unlogged workouts (minimum 10 min since 2026-01) | Y | `autoWorkout.ts` (12 min minimum) |
| Women's Hormonal Insights, Pregnancy | Cycle phases overlaid on metrics | P (skin temperature + logs) | None |
| Jet-lag coaching (AI) | Time-zone shift plan | P | None |
| WHOOP AI (coach, memory, check-ins) | Chat coach | Y | `src/coach` |
| Heart Screener (ECG) | 30-second ECG | N | None |
| Irregular rhythm notifications | AFib screen from beat-to-beat intervals | N | None |
| Blood Pressure Insights | Morning blood-pressure range from the pulse waveform | N | None |
| Advanced Labs | Blood biomarkers | P (manual upload / display) | None |
| Clinician access | Video visits | N/A | None |

### 1b. Garmin

| Feature | What it shows | Computable | Halo counterpart today |
|---|---|---|---|
| Body Battery (5–100) | Energy reserve: charged by rest and sleep, drained by stress, activity and time awake | Y (approximation) | `energyBank.ts` |
| Stress (0–100) | HRV-based stress when inactive | P (heart rate only + nightly HRV) | `stress.ts` (0–3) |
| HRV Status | 7-day average vs a personal baseline band; Balanced / Unbalanced / Low / Poor | Y | None |
| Training Readiness (1–100) | Readiness from sleep, recovery time, HRV, acute load, sleep history and stress history | Y | `readiness.ts` (categories only) |
| Sleep Score (0–100) | Duration + quality (stages, sleep stress, interruptions) | Y | `rest()` (WHOOP-style) |
| Sleep Coach (sleep need) | Need of 6.5–9.5 h, adjusted for activity, HRV, sleep history and naps | Y | `sleepPlanner.ts` |
| Sleep Alignment / Optimal Sleep Window (2025-26) | Circadian window from sleep history + skin temperature | P (nightly skin temperature only) | `sleepRegularity.ts` |
| Nap detection | Naps reduce sleep need | Y | Naps handled |
| Acute Load | 10-day decaying sum of exercise load, normalised to 7 days | Y | `trainingLoad.ts` ATL (EWMA on Effort) |
| Chronic Load / Load Ratio | 28-day average of acute load; ratio bands | Y | `readiness.ts` ACWR |
| Load Focus | Four-week low-aerobic / high-aerobic / anaerobic split vs targets | P | None |
| Training Status | Productive / Maintaining / … from VO2max trend, load and HRV | P | None |
| Aerobic Training Effect (0–5) | Session impact from peak EPOC | Y (approximation) | None |
| Anaerobic Training Effect (0–5) | High-intensity interval impact | P (weak without pace or power) | None |
| Primary Benefit label | Recovery / Base / Tempo / Threshold / VO2max / Anaerobic / Sprint | P | None |
| EPOC | Excess post-exercise oxygen consumption, ml/kg | Y (approximation) | None |
| Recovery Time (h, up to 96) | Hours until ready for hard training | Y (approximation) | None |
| VO2max | From HR vs pace or power | P (Fitbit's value) | `fitnessLevel.ts` |
| Performance Condition (±20) | Real-time deviation from VO2max | N (needs pace) | None |
| Fitness Age | From age, resting HR, BMI / body fat and vigorous activity | Y | `fitnessLevel.ts` fitnessAge |
| Intensity Minutes | Moderate + 2× vigorous; 150 per week goal | Y | `src/health/derive.ts` Active Zone Minutes, weekly plan |
| HR zones | Default % of max HR 50/60/70/80/90; HRR and threshold-HR options | Y | `zones.ts` |
| Endurance Score | VO2max + training history (in the thousands) | P | None |
| Hill Score | VO2max + hill strength and endurance | N (needs elevation and pace) | None |
| Race Predictor | VO2max + training history | P (VO2max-only Daniels) | None |
| Real-time Stamina; Stamina Zones / Curve (2026) | Remaining energy during an activity | N (needs pace or power) | None |
| Lactate Threshold | Threshold HR and pace | P (HR estimate only) | None |
| Running Economy, Step Speed Loss, Running Tolerance (2025) | Running efficiency and impact load | N (Tolerance P from distance) | None |
| Heat / altitude acclimation | Acclimation % | N | None |
| Respiration | All-day and sleep breathing rate | Y (nightly) | Health Connect |
| Pulse Ox | SpO2 spot, all-day or sleep | Y (nightly) | Health Monitor |
| Breathing variations | Sleep SpO2 dips | N (needs an SpO2 stream) | None |
| Health Status (2025) | Five overnight vitals vs baseline (blue / orange) | Y | `healthMonitor.ts` |
| Health Snapshot | Two-minute HR, HRV, respiration and SpO2 spot reading | P (strap HRV only) | `src/live/spotHrv.ts` |
| Morning Report / Evening Report | Summary screens at wake and before bed | Y | Home screen |
| Lifestyle Logging (2025) | Behaviour → effect on sleep, resting HR, HRV, stress | Y | Journal + `journalImpact.ts` |
| Daily Suggested Workouts / Fitness Coach | Workouts from load, recovery and VO2max | P | Coach suggestions |
| Recovery heart rate | HR drop 2 min after a workout | Y | `hrRecovery.ts` |
| Calories (active / resting) | Firstbeat energy expenditure | Y (from Health Connect) | Health Connect |
| Hydration | Goal + sweat estimate | P | Health Connect hydration |
| Jet Lag Adviser | Risk + adaptation plan | P (phone time zone) | None |
| Women's health | Cycle phases, pregnancy | P | None |
| Abnormal HR alerts, move alert | Alerts | P (background job) | None |
| Connect+ Active Intelligence | AI insights | Y | `src/coach` |
| Fall detection, voice, gear tracking, Epic | Device features | N/A | None |

---

## 2. Method specifications

Each item gives inputs, formula, constants, scale, how often it updates, the baseline window, sources and confidence.

### 2A. WHOOP

#### W-1 Cycle

- **[PUB]** Days are physiological cycles (sleep, wake, sleep), not calendar days [W28].
- **[INF]** A cycle runs from one main sleep onset to the next. The cycle's Recovery comes from the sleep that opens it, and Day Strain builds until the next main sleep starts.

#### W-2 Strain (Day Strain and Activity Strain)

**Published facts [PUB] [W1, 2026-02-10]**
- Scale 0–21, logarithmic, "inspired by Borg". Bands: Light 0–9, Moderate 10–13, High 14–17, All out 18–21.
- Cardiovascular load plus (since 2026) muscular load.
- Activity strains do **not** add up. A marathon takes the day to 20.4; a second marathon only to 20.6.
- Member averages:
  - a day: 11.0
  - 1 h run: about 12.0
  - 1 h walk: about 6.5
  - 1 h functional fitness: about 10.1
  - 90-minute hike: 10–11 for an average person, 5–6 for a fit one
- Strain "accumulates faster on low-Recovery days": 9.5 might become 10.5 in the red.

**Patent pipeline [PUB]** (US12318226B2, granted 2025-06-03, priority 2017; same text in US11627946B2 [W30])
1. v = (HR − RHR)/(HRmax − RHR).
2. Weight w(v): 0 at 0; 1 up to the anaerobic threshold; 18 up to a higher "CPT" threshold; 42 above that.
3. I = ∫ w dt.
4. Normalise: N = I / (w(1)·24 h).
5. Strain = 21·0.5·(arctan(N_s·(N − p))/(π/2) + 1), with N_s and p fitted to canonical workouts.
- The thresholds and constants are not published.
- With these literal weights a walk would score about 1.3, so production uses a smoother weighting [INF].

**HR inputs [PUB]** [W12, W13]
- RHR is a 14-day value.
- HRmax is learned from your data, starting from 220 − age, Tanaka or Gulati. The user can override it.

**Best re-implementation [GUESS, fitted here]**
- Banister TRIMP per sample: x = clamp(%HRR, 0, 1).
  - rate = x·0.64·e^(1.92x) per minute for men; x·0.86·e^(1.67x) for women.
  - TRIMP = Σ rate·Δt.
- Map: **Strain = min(21, 5.05·ln(1 + 0.09·TRIMP))**.
  - Least-squares fit to WHOOP's anchors (1 h walk at 30 % HRR, 1 h run at 75 %, 1 h functional at 60 %, 90-minute hike at 55 %, marathon 230 min at 80 %, double marathon). RMSE 0.69 strain points.
  - The other agent's fit, 4.90·ln(1 + 0.105·T), is equivalent within 0.3.
  - Other shapes fit worse: 21·(1 − (1 + T/145)^−1.6) RMSE 1.26; arctan-of-log RMSE 2.0.
- Fitted values:

  | Session | Fitted | WHOOP |
  |---|---|---|
  | Walk | 5.3 | 6.5 |
  | Run | 12.5 | 12.0 |
  | Functional | 10.2 | 10.1 |
  | Hike | 11.2 | 10.5 |
  | Marathon | 19.8 | 20.4 |
  | Double marathon | 21 (cap) | 20.6 |

- **Day Strain** = the same map over the whole cycle's TRIMP, never the sum of activity strains.
- Day Strain needs a **waking-baseline subtraction**. Without it, about 16 h of ordinary awake HR (around 180 TRIMP) would score about 14.
  - OpenStrap [W29] subtracts the rate at the person's median waking %HRR q (rolling, capped at 0.40) from every awake minute, floored at zero.
  - Activity Strain uses the activity's own TRIMP without that floor.
- **Muscular load [GUESS]** (WHOOP's 2026 passive estimate is driven by activity type and duration [W14]):
  - TRIMP_msk = minutes × k_type.
  - The research agent's first proposal was k ≈ 1.2 for weightlifting / HIIT / functional (the Banister rate at x = 0.6) and k ≈ 0.45 for yoga / Pilates / barre.
  - Combined with the cardio TRIMP from the C2 map, those values put a 1 h lift at about 12. **Recommended: k = 0.6 and 0.25** (C3), which gives about 10.5, in line with WHOOP's 1 h functional-fitness average of 10.1.
  - Add it to that session's cardiovascular TRIMP before the log map, and show the cardio : muscular split.
  - WHOOP has not published how it combines the two [W24].
- **Low-Recovery multiplier [GUESS]**: TRIMP × 1.26 in the red, × 1.1 in the yellow, × 1.0 in the green. This reproduces WHOOP's 9.5 → 10.5 example.
- **Update cadence**: live. Activity Strain is fixed when the activity ends.

#### W-3 HR zones

- **[PUB]** [W12, 2024-11-21; W11]: % of heart-rate reserve. Z1 40–60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 90–100. Below Z1 is zone 0.
- Resting HR is a 14-day value.
- **Change**: until 2024-11 the zones were % of max HR (50–60 … 90–100).

#### W-4 Strain Target / Strain Coach

- **[PUB]** [W2, 2026-01-30]: target is set from today's Recovery and the strain already built up. The default is Optimal; the user can choose Restoring or Overreaching. Shown live with zone and calories.
- **[PUB, older]** [W21, 2018-07-16]: the zones on the Recovery × Day Strain grid were fit to about 1 million days so that Optimal leaves next-day HRV unchanged from baseline, Restoring raises it and Overreaching lowers it.
- **[PUB]** [W30]: cycle-phase adjustment. More strain is allowed in the early follicular phase and less in the late luteal phase.
- No numeric bands are published.
- **[GUESS] personal fit**: regress next-day Δ ln(RMSSD) (vs baseline) on Day Strain within each Recovery decile. Optimal = the strain where the predicted Δ = 0, ±1.

#### W-5 Recovery

- **[PUB]** [W3, 2026-01-30]: inputs are HRV, RHR, Sleep Performance and respiratory rate.
  - SpO2 and skin temperature are shown in Health Monitor and are **not** part of Recovery. The older developer page still lists them.
  - Bands: green 67–100, yellow 34–66, red 0–33. Member mean about 58 %.
  - Computed once at wake; fixed unless the sleep is edited.
- **[PUB, older]** [W4, 2020-07-27]: respiratory rate only adjusts Recovery when it is **elevated**, especially when Recovery is already suppressed. It is a one-sided penalty.
- **[PUB]** HRV is RMSSD measured in the deepest sleep. The patent describes the last slow-wave sleep episode before waking, and comparing 7-day and 3-day moving averages [W30].
  - Recovery is "a weighted combination of HRV, RHR, sleep score, and recent strain" [W30].
- **[INF]** About 4 nights before the first score; about 30 days to full calibration.
- **[GUESS]**:
  - z_HRV = (ln RMSSD − μ₃₀)/σ₃₀
  - z_RHR = −(RHR − μ)/σ
  - z_SP = (SP − 85)/12
  - z = 0.55·z_HRV + 0.25·z_RHR + 0.20·z_SP
  - Respiratory rate: if z_RR > 1.5, z −= 0.3·(z_RR − 1.5), doubled when z < 0.
  - Recovery = 100·Φ(z/1.1) or a logistic, calibrated so the mean is about 58 and the 34/67 cut-offs give about 15 % red and 40 % green.

#### W-6 Sleep Need, Sleep Debt, naps

- **[PUB]** Patent [W30]: Need = Baseline + f₁(strain) + f₂(debt) − naps.
  - **f₁(S) = 1.7 / (1 + e^((17 − S)/3.5)) hours**, with S on 0–21. The patent says "minutes", but only hours give sensible values [INF].
  - Values: S = 11 → 16 min; 14 → 30 min; 18 → 58 min; 21 → 77 min.
  - Debt is accumulated shortfall vs the baseline over previous cycles, **capped**.
  - Naps since the last main sleep are subtracted minute for minute.
- **[PUB]** [W5, 2026-02-12]: the inputs are baseline, strain, debt and naps.
  - Since 2026 it also uses typical bed and wake times, duration and efficiency from the last 28 days, with smoothing for weekday/weekend shifts and travel.
  - Member average need is 8 h 34 min; actual sleep averages 7 h 03 min (men) and 7 h 20 min (women).
  - The API splits need into four parts: baseline, sleep debt, recent strain and recent naps [W28].
- **[GUESS]**:
  - Baseline: EWMA (about 28 days) of sleep on nights not in debt and not after high strain, clamped to 6.5–9.5 h, starting at 7.75–8 h.
  - Debt: Dₜ = min(2 h, 0.5·Dₜ₋₁ + max(0, needₜ₋₁ − sleptₜ₋₁)).

#### W-7 Sleep Performance (2025 version)

- **[PUB]** [W27, 2025-05; W19]: four parts — Hours vs Needed, Sleep Consistency, Sleep Efficiency, Sleep Stress. Weights not published.
- **[INF]** Tiers ≥ 85 Optimal, 70–84 Sufficient, < 70 Poor. These match the planner's 100 / 85 / 70 %.
- **[GUESS]** SP = 0.70·min(100, 100·asleep/need) + 0.10·Consistency + 0.10·min(100, 100·efficiency/0.95) + 0.10·(100 − SleepStress%).
- **Change**: before 2025-05, SP was hours ÷ need. Restorative sleep is shown separately and is **not** one of the four parts.

#### W-8 Sleep Consistency, Efficiency, Restorative sleep, Sleep Stress

- **Consistency [PUB]** [W11, W6 2026-05-22]: compares sleep and wake times in the last 24 h with the previous 4 days.
  - Member average 67.9 %. Aim ≥ 80 %. Healthspan threshold 70 %.
  - It reads "slightly lower than SRI because of the longer baseline".
- **Consistency [INF]**: an SRI-style measure over the four lag pairs (today vs each of the previous four days): max(0, −100 + 200·same/compared).
- **Efficiency [PUB]** [W7, 2026-06-15]: asleep / in bed. Member average 89.4 %; target above 85 %.
- **Restorative [PUB]** (older, 2023): deep + REM, in hours and %.
- **Sleep Stress [PUB/INF]** (2025): % of sleep time in a high-stress state, from HRV and respiratory disturbance.
- **Sleep Stress [GUESS]**: % of sleep epochs with stress ≥ 2 (see W-10).

#### W-9 Sleep Planner

- **[PUB]** [W8, 2025-04-02; W5 2026]: goals per weekday — Peak 100 %, Perform 85 %, Get By 70 % of need. Uses circadian rhythm, previous sleep, naps and strain. Needs 3 days.
  - Sends a nightly bedtime notification. Haptic alarm can wake you at a time, when the goal is met, or when in the green.
  - 2026: goal modes "Weekly Plan / Improve My Sleep / Reach My Sleep Need" and a wake target.
- **[INF]** bedtime = wake target − goal%·need / efficiency₂₈ − typical sleep-onset latency, nudged toward the four-day median midpoint.

#### W-10 Stress Monitor (0–3)

- **[PUB]** [W9, 2023-03-29 (older, restated 2026-04-30)]: live HR and HRV against a 14-day baseline. Motion separates exercise from stress. 0 = low, 3 = peak.
- **[PUB]** Patent WO2024129679A2 [W31], computed every 1–5 min:
  - S = α·f(motion)·[w·HRscore + (1 − w)·HRVscore]
  - HRscore maps HR between the 14-day median RHR and HRmax onto 0–3.
  - HRVscore is the percentile of current HRV within the 14-day log distribution, onto 0–3.
  - The HR weight w rises toward 1 as HR approaches resting, is about 0.5 above 100 bpm, and goes up when HRV quality is low.
  - Bands: 0–1 calm, 1–2 neutral, 2–3 stressed.
  - A "simplified model may rely exclusively on motion and HR".
- **[GUESS]** heart-rate-only version: HRRR = (HR − RHR₁₄)/(HRmax − RHR₁₄), computed only on low-step minutes outside exercise. Stress = 3 × percentile of HRRR within the 14-day distribution of such minutes, smoothed by a 5-minute EWMA.

#### W-11 Health Monitor

- **[PUB]** [W10, 2026-05-15]: last night's respiratory rate, RHR, HRV, SpO2 and skin temperature, plus live HR. A check mark means within the typical range; "!" means outside it. Health Report PDF for 30 or 180 days.
- **[GUESS]** Range = 30-night median ± 2 robust SD.

#### W-12 Healthspan: WHOOP Age and Pace of Aging (fully published)

Sources: white paper (2025-09-04) and Locker pages (2026-01-21, 2026-04-23) [W11].

- **Window**: 6 months.
- **WHOOP Age** = age + Σ age impact, where impact = 10·ln(HR) (Gompertz: mortality rises about 10 % per year).
  - The reference person meets the guidelines. An average American scores about +6 to +7.5 years.
  - Overlap between correlated metrics is removed with a structural equation model.
- **Pace of Aging**: −1.0× to 3.0×, updated **weekly**.
  - Pace = (age projected 6 months ahead from the last-30-day averages − current)/0.5.
  - Labels: > 1 accelerated, 1 steady, 0–1 slowing, < 0 reversing.
  - Unlocks after 21 recoveries in 31 days.

| Input | Target | Hazard evidence cited |
|---|---|---|
| Sleep consistency | ≥ 70 % | |
| Sleep duration | 7–9 h (< 7 h adds years; > 9 h has no effect) | |
| Zone 1–3 time | ≥ 100 min/week at 30, falling to 70 with age | |
| Zone 4–5 time | ≥ 10 min/week at 30, falling to 7 with age | |
| Strength activity time | > 40 min/week; no extra benefit beyond 2 h | |
| Steps | 8,000 (5,600 for older adults) | |
| VO2max | Age/sex table (in Halo already) | −13 % mortality per MET |
| Resting HR | Neutral at 60 (men) / 64 (women) | +10 bpm → HR 1.09 |
| Lean mass | ≥ 80 % (men) / ≥ 67 % (women) | +10 % fat → HR 1.11 |

- **Strength activity types counted**: Strength Trainer, weightlifting, powerlifting, barre, Barre3, Pilates, yoga, hot yoga, functional fitness, Barry's, F45, box fitness, HIIT, baby/toddler wearing, rucking, solidcore.
- **Member medians at age 30 (men)**: Z1–3 141 min, Z4–5 6 min, strength 46 min, steps 10.9k.

#### W-13 VO2max

- **[PUB]** [W16, 2026-05-29]: passive, GPS-augmented and lab-calibrated tiers. Within 3.3–3.7 ml/kg/min of lab tests. Updated weekly on Tuesdays.

#### W-14 Journal, Behaviour Impact, Assessments, Weekly Plan

- **[PUB]** [W20]: Behavior Insights need ≥ 5 "yes" and ≥ 5 "no" logs in 90 days.
- **[PUB, older]** [W22, 2021-08-31]: the Monthly Performance Assessment shows each behaviour's *isolated* effect on Recovery, controlling for sleep, workouts and other behaviours, using up to a year of data. Labels are significant / regular / negligible. No estimate when behaviours always co-occur.
- **[INF]** A per-user regression: next-day Recovery ~ behaviours + Day Strain + Sleep Performance.
- **[PUB]** Weekly Plan (2025, strength goal added 2026-02-20): adaptive goals for strain, sleep and strength time.

#### W-15 Not computable (listed for completeness)

- Blood Pressure Insights: pulse-waveform model with 3 cuff calibrations [W17].
- Heart Screener ECG [W18].
- Irregular-rhythm notifications: need beat-to-beat intervals.
- Strength Trainer sets/reps: need the inertial sensor.
- Advanced Labs: blood tests.

### 2B. Garmin (Firstbeat)

#### G-1 EPOC: the engine behind Training Effect, load, recovery time and status

**[PUB]** Patent US7192401 (older) and EPOC white paper (2005/2012, older); Garmin's current EPOC page says it is still "the core" [G2-epoc].
- EPOC(t) = f(EPOC(t−1), %VO2max(t), Δt). It rises with intensity and decays with rest.
- The patent's form: an upslope y(t) = c₁t + c₂, with c's ∝ intensity; a downslope 1/c^Δt; blended by a Z-shaped weight on intensity; then max(decay, blend).
- The constants are unpublished.

**[INF]** Read off white-paper Figure 5 (EPOC in ml/kg at constant intensity):

| %VO2max | 10 min | 30 min | 60 min |
|---|---|---|---|
| 90 % | 88 | ≈ 250 | – |
| 80 % | 55 | 155 | – |
| 70 % | 33 | 85 | 137 |
| 60 % | 20 | 43 | 60 |
| 50 % | 11 | 21 | 25 |

- After stopping, EPOC left ≈ 1/(1 + t/2.5 min).

**[GUESS] ODE that reproduces Figure 5 within about ±3 ml/kg**
- dE/dt = a(I) − k(I)·E
- a(I) = 13.2·e^(4.2(I − 1)) ml/kg/min
- k(I) by linear interpolation:

  | I | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1.0 |
  |---|---|---|---|---|---|---|---|---|
  | k (per min) | 0.14 | 0.10 | 0.065 | 0.035 | 0.020 | 0.007 | 0.002 | 0 |

**Intensity from HR [PUB literature / INF]**
- %VO2R ≈ %HRR (ACSM / Swain).
- I = %VO2max = %HRR·(1 − 1/METmax) + 1/METmax, where METmax = VO2max/3.5.
- Firstbeat cites Londeree: %VO2max = 1.408·%HRmax − 45.1.

**Validation [PUB]**: r² 0.79 against measured EPOC; mean absolute error about 14 ml/kg.

**Typical values [PUB]**: 60 min easy run 40–90; 1 h brisk walk 10–25; 10 km race 120–260 ml/kg.

#### G-2 Aerobic and Anaerobic Training Effect (0–5)

**Labels [PUB]** [G1, 2026 manual]:

| TE | Label |
|---|---|
| 0–0.9 | No benefit |
| 1.0–1.9 | Minor |
| 2.0–2.9 | Maintaining |
| 3.0–3.9 | Improving ("Impacts") |
| 4.0–4.9 | Highly improving |
| 5.0 | Overreaching |

**Aerobic TE = f(peak EPOC, activity class AC 0–10) [PUB]**

**[INF]** Lines read from white-paper Figure 2, EPOC in ml/kg:

| TE | EPOC |
|---|---|
| 2.0 | 3 + 2.4·AC |
| 3.0 | 6 + 7.8·AC |
| 4.0 | 10 + 18.2·AC |
| 5.0 | 15 + 28.7·AC |

- TE 1.0 ≈ 0.3 × the TE 2.0 line [GUESS].
- TE is linear between lines. This is checked: the patent's "TE 3.0 = 62 ml/kg at AC 7" vs the line's 60.6; and the white paper's peak of 190 at AC ≈ 7 → 4.71, against a published 4.7.

**Activity class [PUB, older table]**
- 0–7 from the Jackson/Ross physical-activity scale.
- 7.5–10 from weekly training hours: 5–7 h, 7–9, 9–11, 11–13, 13–15, > 15.
- Current devices use AC = max(AC from VO2max, AC from 28-day load) [G10, 2023 patent].
- **[INF]** AC from VO2max by inverting Jackson 1990: PA-R = (VO2max − 56.363 + 0.381·age + 0.754·BMI − 10.987·male)/1.921, clamped to 0–7.

**Anaerobic TE [PUB]** [G10, 2023 patent]
- Interval detection: ≥ 15 s, peak > ~73 % VO2max, HR ≥ 80 % HRmax, recovery ≥ 30 s between intervals.
- Shorter, harder intervals starting from a lower HR score higher. Repeats of 10–120 s score best.
- Needs pace or power for accuracy.
- **[GUESS]** HR-only: bouts where HR rises ≥ 15 % of HRR within 60 s to above 85 % HRmax.

**Primary benefit [PUB]** [G10]: anaerobic label if anaerobic TE ≥ 3 and ≥ aerobic TE − 0.5. Otherwise the higher TE. Low vs high aerobic split at about 80 % HRmax.

#### G-3 Acute Load, Chronic Load, Load Ratio

- **[PUB]** [G2-training-load, current]: each activity's load (its peak EPOC) is added in full, then "gradually expires during the next 10 days"; the total is normalised to a 7-day window.
- **[INF]** Reverse-engineered on the Garmin forum [G17]; matches Connect within about ±2:
  - **ATL(d) = (7/5.5)·Σᵢ₌₀..₉ (1 − 0.1·i)·L(d − i)**
- **[PUB/INF]** Chronic = 28-day average of acute: CTL(d) = mean(ATL(d−27…d)).
- **Ratio = ATL/CTL [PUB]** [G1]:

  | Status | Ratio |
  |---|---|
  | Low | < 0.8 |
  | Optimal | 0.8–1.4 |
  | High | 1.5–1.9 |
  | Very High | ≥ 2.0 |

  - Shown after 2 weeks of data.
- The acute-load gauge's optimal range depends on fitness and history; values are unpublished.
- **[GUESS]** Optimal acute load ≈ 1.5–3.5 × the TE 4.0 EPOC line for the user's AC.

#### G-4 Load Focus

- **[PUB]** [G1, G10]: four-week low-aerobic, high-aerobic and anaerobic sums against targets, as % of a monthly reference "MTL 3.0":

  | Category | Minimum | Target |
  |---|---|---|
  | Low aerobic | 12.5 % | 25–55 % |
  | High aerobic | 15 % | 30–60 % |
  | Anaerobic | 5 % | 10–30 % (0 if AC ≤ 7) |

  - "Below targets" when the total < 65 %; "Above targets" when ≥ 145 %.
  - Nine feedback labels.
- **[GUESS]** Split each session's load by its time below and above 80 % HRmax. Count the anaerobic share ∝ anaerobic TE.

#### G-5 Training Status

- **Labels [PUB]** [G1, G2]: No Status, Paused, Detraining, Recovery, Maintaining, Productive, Peaking, Overreaching, Unproductive, Strained.
- **Inputs [PUB]**: VO2max trend, acute load / ratio, HRV status, and load focus in some cases. Needs about 2 weeks of data.
  - With HRV it can be "productive if HRV stays balanced during heavier training".
  - Strained = HRV low or unbalanced.
- **Logic [PUB, 2018 patent, older]** [G10]:
  - VO2max trend from a recency-weighted 14-day fit. Monthly change ≤ −1.5 = decreasing; ≥ +1.5 = increasing.
  - Relative load 0–5.
  - Productive = VO2max ↑ with load 3–4.
  - Maintaining = VO2max steady with load 3–4.
  - Unproductive = VO2max ↓ with load 3–4.
  - Peaking = VO2max ↑ with load ↓.
  - Recovery = load 1–3 and falling.
  - Overreaching = load 5.
  - Detraining = load ≈ 0.

#### G-6 Recovery Time (hours, max 96)

- **[PUB]** [G1, G2-recovery-time]: set at the end of each activity from TE relative to fitness and history, the time already left, the VO2max trend and the 7:28 load ratio. Adjusted afterwards by sleep, stress and daily activity.
- **[PUB]** 2023 patent tables [G10]:
  - Aerobic: TE 1 → 0.1 h; TE 3.5 → 24.2 h; TE 5 → 72 h.
  - Anaerobic: TE 3 → 25.8 h; TE 5 → 95.8 h.
- **[INF]** Fits to those points:
  - h_aer = 72·((TE − 1)/4)^2.25
  - h_an = 95.8·((anTE − 1)/4)^1.9
- **[GUESS]** Combining and counting down:
  - new = max(left, h) + 0.25·min(left, h)
  - Count down at 1.0 per hour; 1.4 per hour asleep after good sleep; 0.7 per hour under high stress or after poor sleep.
  - +10–20 % if the load ratio is > 1.5.

#### G-7 HRV Status

- **[PUB]** [G3-hrv, G1]:
  - Overnight RMSSD over the whole sleep in 5-minute windows.
  - Shows last night, the 5-minute high, the **7-day average** and a baseline band (needs ≥ 3 weeks; uses a few months when available).
  - Balanced (green) = 7-day average inside the band. Unbalanced (orange) = above or slightly below it. Low (red) = well below it. Poor = the baseline itself is below age norms (the band is hidden). No status = not enough data.
- **[INF]** Gadgetbridge [G18]: band = mean ± 1 SD of the last 28 nightly values; needs at least 7.
- **[GUESS]** In ln(RMSSD): μ and σ over 21–60 nights. Balanced = μ ± 0.75σ. Low = 7-day mean < μ − 1.5σ.
- **Cadence**: daily at wake.

#### G-8 Training Readiness (1–100)

- **Bands [PUB]** [G1, G2-training-readiness]:

  | Score | Label | Colour |
  |---|---|---|
  | 95–100 | Prime | purple |
  | 75–94 | High | blue |
  | 50–74 | Moderate | green |
  | 25–49 | Low | orange |
  | 1–24 | Poor | red |

- **Factors [PUB]**: sleep score, recovery time, HRV status, acute load, 3-night sleep history and 3-day awake stress history.
  - Primary drivers are last night's sleep and the remaining recovery time.
  - Very long time awake lowers it.
  - Biggest update at wake, then it rises as recovery time runs out and drops after activities.
- **Weights**: unpublished [GUESS, see Halo spec N-2].

#### G-9 Body Battery (5–100)

- **[PUB]** [G1, G3-body-battery]:
  - Bands: 5–25 very low, 26–50 low, 51–75 medium, 76–100 high.
  - Charged by rest (stress < 25) and sleep, in proportion to how relaxed you are (HR and HRV vs baseline).
  - Drained by stress > 25, by activity (∝ intensity × duration) and by **sleep pressure** (a steady drain while awake).
  - Fitness reduces relative drain. Naps charge it.
- **[PUB]** Patent US20200215299 (older): sleep pressure while awake = 100/(1440 − need_min) per minute; asleep it recharges at 100/need_min per minute.
- **[GUESS]** Rates, calibrated to: a good 8 h night +50 to +70; a stressful workday −15 to −25; a 1 h TE-3 run −15 to −25.
  - Sleep: +9.5/h × q × stage weight (deep 1.2, REM 0.9, light 1.0, awake 0), with q = clamp(0.6 + 0.4·RMSSD/baseline, 0.5, 1.3).
  - Awake and calm: +(25 − s)/25 × 2.5/h.
  - Awake and stressed: −(s − 25)/75 × 9/h.
  - Sleep pressure: −0.8/h.
  - Exercise: −0.3 × ΔEPOC.
  - Clip to 5–100.

#### G-10 Stress (0–100)

- **[PUB]** [G3-stress, G7 (older)]:
  - From HR and beat-to-beat HRV, only when inactive (grey otherwise).
  - Bands: 0–25 rest, 26–50 low, 51–75 medium, 76–100 high.
  - Personalised against your range, especially in sleep.
  - Firstbeat indices: relaxation ∝ HF power/HR; stress ∝ HR/(HF·LF).
  - About one value per 3 min.
- **Validation [PUB]**: Stress & Health, Dec 2025. Tracks HR and RMSSD; weak link to how stressed people say they feel.
- **[GUESS]** HR-only version:
  - x = (HR − P10 sleeping HR)/(P95 still daytime HR − P10 sleeping HR)
  - stress = 100·x^0.8
  - Multiply by (baseline ln RMSSD / last-night ln RMSSD)^0.5.

#### G-11 Sleep Score and Sleep Coach

**Sleep Score [PUB]** [G3-sleep]
- Duration against age recommendations, plus quality: stages, sleep stress, restlessness, awakenings over 5 min.
- Bands: 90–100 Excellent, 80–89 Good, 60–79 Fair, < 60 Poor.
- FIT sub-scores: duration, quality, recovery, deep, light, REM, awake, awakenings, interruptions, restlessness, average stress.
- **[GUESS]** Weights: Duration 30 %, Stages 25 %, Recovery (sleep stress / HRV) 25 %, Interruptions 20 %.

**Sleep Coach [PUB]** [G3-sleep-coach]
- Need **6.5–9.5 h** (widened from 7–9 h), in 10-minute steps.
- Factors: age, internal rhythm, daily and long-term activity, last night's sleep (weighted most) plus 3 more nights, naps and HRV.
- **[PUB, older]** Patent defaults: 8 h for ages 18–64, 7.5 h for 65+. Examples: +30 min after a high-load month; −15 min when relaxed.

**Sleep Alignment [PUB]** (2025-09 / Q1 2026) [G11]
- Optimal window from sleep history plus skin temperature (about 3 weeks).
- Also sleep consistency over 7 days.

#### G-12 Intensity Minutes and zones

- **[PUB]** [G3-intensity-minutes, G1]:
  - Weekly goal of 150; vigorous minutes count double.
  - Moderate and vigorous thresholds are relative to resting HR (forum: about Z3+ and Z4+).
  - The 10-minute bout rule is gone from the 2026 manual.
- **Default zones [PUB]**: % of max HR 50/60/70/80/90. Options: % HRR and % lactate-threshold HR.
- **Max HR [PUB]**: 220 − age, auto-detected upward from observed HR.

#### G-13 VO2max, Fitness Age, Endurance Score, Race Predictor

**VO2max [PUB]** [G2-vo2max, US10123730]
- HR vs pace or power on stable segments at ≥ 70 % HRmax for ≥ 10 min. Patent formula: VO2max = (−c₁·HR/HRmax + 1 + c₁)·(11.1·v + 5.33).
- Bands use the Cooper Institute percentiles: Superior ≥ 95th, Excellent ≥ 80th, Good ≥ 60th, Fair ≥ 40th, Poor below. The table is in the FR970 manual.

**Fitness Age [PUB]** [G3-fitness-age]
- Newer devices: age, RHR, BMI or body fat %, and vigorous minutes (≥ 5 vigorous minutes inside 30 min counts as a vigorous day).
- Shows an "achievable" fitness age.

**Endurance Score [PUB]** [G2]
- VO2max plus 2-week and 2–3-month training history; longest sessions weighted.
- Scale in the thousands, seven bands. Men aged 21–39: Recreational < 5,100 … Elite ≥ 8,800.

**Race Predictor [PUB]** [G2]
- VO2max plus history and mileage.
- **[INF]** Daniels–Gilbert equations: VO2(v) = −4.60 + 0.182258v + 0.000104v²; sustainable fraction %(t) = 0.8 + 0.1894393e^(−0.012778t) + 0.2989558e^(−0.1932605t).

#### G-14 Health Status, Morning / Evening Report, Lifestyle Logging, Jet Lag

- **Health Status [PUB]** [G15]: HR, HRV, respiration, skin temperature and SpO2 overnight against a 3–4 week baseline. Blue = in range, orange = out of range. History added in 2026.
- **Morning / Evening Report [PUB]**: wake and evening summaries. The evening report has a suggested bedtime (2026).
- **Lifestyle Logging [PUB]** (2025-09): behaviour → effect on sleep score, RHR, HRV and stress.
- **Jet Lag Adviser [PUB]** (2022): risk from time zones crossed and direction. East adapts more slowly; shift the body clock only for stays over 72 h.

#### G-15 Not computable

- Hill Score, Real-time Stamina, Stamina Zones, Running Economy, Step Speed Loss and Performance Condition (need pace, power or running dynamics).
- Breathing variations (need an SpO2 stream).
- Heat and altitude acclimation (need temperature and altitude).
- Running Tolerance is only a distance-based proxy.

---

## 3. Halo compared with WHOOP and Garmin

### 3.1 Feature by feature

| Halo feature (file) | What matches | What differs | Verdict |
|---|---|---|---|
| **Strain / Effort** (`core/scoring/strain.ts`, `pipeline/stage1.ts`) | Heart-rate-reserve basis; 0–21 log scale; Day Strain from total load, not a sum of activities; live strain (`live/liveStrain.ts`). | Edwards step weights from 50 % HRR give **0 credit below 50 %**: a 1 h walk at 30 % scores 0 against WHOOP's 6.5. Log map ln(T+1)/ln(7201) under-scores long hard days: a marathon is about 16.1 against 20.4. Calendar day, not cycle. No muscular load. Off-exercise samples are credited at most 2 min each, so Fitbit's few-minute cadence loses up to 60 % of daytime time. HRmax is the profile value or Tanaka and is never learned (`estimateHRmax` exists but nothing calls it). | **Change**: C2, C3, C1b, C14 |
| **HR zones** (`core/scoring/zones.ts`) | Heart-rate reserve, 5 zones, zone 0. | Z1 lower edge is 50 %; WHOOP's current edge is **40 %**. The comment "as WHOOP" is out of date. | **Change**: C1 |
| **Recovery** (`core/scoring/recovery.ts`) | Logistic over weighted z-scores; mean about 58; bands 34/67; HRV-dominant; 7-night gate; drivers. | Uses raw-ms HRV z where ln is better. **Respiratory rate is symmetric**: a low rate *adds* points, but WHOOP only penalises. **Skin temperature is a 5 % term**, but WHOOP removed it in its 2026 description. EWMA half-life 14 vs WHOOP's about 30 days. | **Change**: C6 |
| **Sleep performance** (`sleep.ts` `rest()`) | Duration vs need dominates; efficiency and consistency included. | Parts are duration 0.5 / efficiency 0.2 / **restorative 0.2** / consistency 0.1. WHOOP's 2025 parts are hours vs need, consistency, efficiency and **sleep stress**. The "need" is the bare baseline, not that night's full need (strain + debt − naps). Consistency is a 7-day SRI, not 24 h vs 4 days. | **Change**: C4 |
| **Sleep need / debt / planner** (`sleep.ts`, `sleepPlanner.ts`) | Baseline + strain + debt − naps; 100/85/70 % plans; weekday/weekend wake; median efficiency; 28-night baseline. | Strain term is linear above the 28-day mean (0.05 h per point), not WHOOP's patented sigmoid of absolute strain. Debt repaid at 20 % with no cap. No sleep-onset latency. The planner's need is not used to score the next night. | **Change**: C5 |
| **Stress** (`algorithms/stress.ts`) | 0–3 scale; still minutes only; personal daytime baseline; low < 1, medium 1–2, high ≥ 2. | Z-score against an EWMA of the P10 daytime HR (14-day half-life), not WHOOP's HRRR against a 14-day median RHR. No HRV term, although last night's RMSSD is available as context. Sleep is excluded, so there is no Sleep Stress. | **Change** (lower priority): C13 |
| **Energy Bank** (`algorithms/energyBank.ts`) | Drains from activity and stress, recharges from calm and naps; top drains. | Starts at wake from 0.6·Recovery + 0.4·sleep performance, so **no overnight charging** and no carry-over from the evening. Basal drain 2.4/h against Garmin's about 0.8/h. Range 0–100 against Garmin's 5–100; no bands. Stress drains only at ≥ 2. | **Change**: C9 |
| **Readiness / training load** (`scoring/readiness.ts`, `scoring/trainingLoad.ts`) | ACWR, monotony, CTL/ATL/TSB, HRV/RHR/respiration flags. | Load is **log-compressed Effort**, which flattens spikes: a 2× harder day is not 2× the load. ACWR = 7-day mean / 28-day mean, not Garmin's 10-day kernel over a 28-day average of acute. Bands 0.8/1.3/1.5 against Garmin 2026's **0.8/1.5/2.0**. Readiness is a category, not 1–100. | **Change**: C7; **add** N-2 |
| **Strain target** (`algorithms/strainTarget.ts`) | Recovery band × personal base; ACWR cap and lift. Reasonable, since WHOOP publishes no numbers. | ACWR cap at 1.3 (should follow the new bands). No HRV-neutral personal fit. | **Change**: C7 (cap) + optional C15 |
| **Halo Age** (`algorithms/healthspan.ts`) | Very close to WHOOP's white paper: nine inputs, 6-month window, 10·ln(HR) with a fitted overlap factor of 0.477, references, VO2max table, ±15 clamp, Pace = Δ/0.5. | Zone 1–3 minutes at 60–80 % HRR are **doubled**, while WHOOP counts time in zone. Strength types miss **yoga, Pilates, boot camp**. Pace updates daily (WHOOP: weekly) with 21 of 30 days (WHOOP: 21 recoveries in 31 days). | **Change**: C10 |
| **Fitness level / Fitness Age** (`algorithms/fitnessLevel.ts`) | FRIEND percentile; Nes/HUNT Fitness Age from RHR + activity (the same idea as Garmin's new Fitness Age); Uth fallback. | Category floors 20/40/60/80 against Garmin's 40/60/80/95 percentiles. | **Change**: C11 |
| **Health Monitor** (`algorithms/healthMonitor.ts`) | Same five vitals as WHOOP and Garmin Health Status; Google ranges when available; ±2σ; illness flag. | No "trending away" rule and no history (Garmin added history in 2026). | Small: C16 |
| **Journal impact** (`algorithms/journalImpact.ts`) | Exactly WHOOP's 5/5 in 90 days; next-day effect; bootstrap CI. | Raw difference of means. WHOOP isolates the effect while controlling for workouts and other behaviours. | **Change** (medium-low): C12 |
| **Reports / assessment / weekly plan** (`algorithms/reports.ts`, `weeklyPlan.ts`) | Weekly and monthly reviews, focus lines, WHO-based targets, strength goal: these match WHOOP's Weekly Plan and Garmin's reports. | None of note. | Keep |
| **Forecast, activity cost, HR recovery, auto-workout** | Halo-only extras. HR recovery is Garmin's "Recovery HR"; auto-workout is WHOOP's auto-detect. | Auto-detect minimum is 12 min against WHOOP's 10 (2026). | Optional: `autoWorkoutConfig.minSustainedMin = 10` |
| **Missing** | – | HRV Status, Training Readiness score, Training Effect / EPOC, Recovery Time, Training Status, Load Focus, Sleep Stress, Endurance Score, Race Predictor, Jet Lag. | **Add**: N-1 to N-8 |

### 3.2 Changes, in order of user value

Every change that alters stored scores must bump `SCORING_VERSION` in `src/pipeline/types.ts` (currently 14). Run `npx tsc --noEmit`, `npx expo lint` and the vitest suites afterwards. Several changes are coupled. Do C1 + C2 + C3 together (one version bump), then C4 + C5, then C6, then C7.

---

#### C1. Use WHOOP's current HR zones, and learn max HR from data (high value, small change)

**Why.** Every zone screen, time-in-zone figure and zone-based input is off by the old Z1 edge. A Tanaka-only HRmax under-reads fit users, which inflates %HRR, zones and Strain.

**Formula**
- `zoneEdges = [0.4, 0.6, 0.7, 0.8, 0.9]` (% of HRR; WHOOP since 2024-11-21).
- Garmin's default is % of HRmax 50/60/70/80/90. Optionally offer a "Garmin-style" zone basis setting.
- Max HR (C1b): if the user set it, use theirs. Otherwise `max(Tanaka(age), P99.5(exercise-session HR over the last 365 days))`.
  - Use only samples inside exercise sessions or detected workouts.
  - Drop samples that jump > 45 bpm within 12 s (the existing `liveStrain` artefact rule).
  - Require ≥ 600 samples. This is `estimateHRmax` in `strain.ts`, restricted to exercise.
  - Re-evaluate weekly; change the stored value only when it rises ≥ 2 bpm, so stage 1's memo keys don't churn.

**Files**
- `src/core/scoring/zones.ts` (edges, header comment)
- `src/core/scoring/strain.ts` (`edwardsZones` stays only while Edwards is used; see C2)
- `src/queries/settings.ts` and `src/queries/common.ts` (`maxHrOf` should use the learned HRmax)
- Pipeline options, where `opts.profile.maxHr` is built
- `src/health/derive.ts` (Active Zone Minutes already use 40 %; keep)

**Expected effect.** Z1 time goes up and the "below zone 1" share goes down. Fit users' %HRR drops a little, so Strain becomes less inflated.

**Tests**
- `zones.test.ts`: RHR 60 and HRmax 190 give a Z1 lower bound of 112 bpm.
- `strain.test.ts`: `estimateHRmax` with exercise samples whose P99.5 is 196 and age 40 (Tanaka 180) returns 196; non-exercise spikes are ignored.

---

#### C2. Recalibrate Strain to WHOOP's anchors: continuous TRIMP, fitted log map, waking baseline (high value)

**Why.** Halo gives no credit for walks and easy activity, and under-scores long hard days. Users comparing with WHOOP see the biggest gaps here.

**Activity Strain** (per exercise session, detected workout and live session)
- x = clamp((HR − RHR)/(HRmax − RHR), 0, 1).
- rate(x) = x·0.64·e^(1.92x) per minute for men; x·0.86·e^(1.67x) for women. This is `banisterTRIMP` with no floor.
- **Strain₂₁ = min(21, 5.05·ln(1 + 0.09·TRIMP))**, and Effort = Strain₂₁·100/21.

**Day Strain**
- TRIMP_day = Σ over the day's samples of max(0, rate(x) − rate(q))·Δt, plus muscular TRIMP (C3).
- q = the person's median waking still %HRR over the trailing 14 days, capped at 0.40. A good source is the stress module's still-minute HR: q = (P50 still HR − RHR)/(HRmax − RHR).
- Inside exercise sessions use rate(x) with no floor, so Day Strain ≥ max Activity Strain.
- Strain₂₁ = the same map.

**Sample durations (C14, done together)**
- Credit each sample min(gap, 10 min) when it and the next sample are both below 50 % HRR.
- Otherwise min(gap, 2 min), as today, so exercise-level HR is never stretched across a gap.

**Optional, WHOOP's low-recovery effect [GUESS]**: TRIMP ×1.26 when today's Recovery is red, ×1.1 when yellow. Only if this matches user feedback.

**Files**
- `src/core/scoring/strain.ts`: new `strainFromTrimp(trimp)`, `dayStrain(hr, rhr, hrmax, sex, q)`; keep `trimpToStrain` for parity tests or delete it.
- `src/pipeline/stage1.ts`: `effort:` and activities' `effort:`, plus passing q.
- `src/live/liveStrain.ts`: `effortToTrimp` needs the inverse of the new map: T = (e^(S/5.05) − 1)/0.09.
- `src/core/algorithms/energyBank.ts` `minuteLoad` (still Edwards; see C9).
- Also re-check everything that consumes Effort: strain target cold-start bands, `sleepPlanner` strain term, `forecast` `effortSpread` (12 on 0–100), and the `reports` ASSESS spread for strain (2.5).

**Expected effect**

| Session | Halo now | After |
|---|---|---|
| 1 h walk at 30 % HRR | 0 | ≈ 5.3 |
| 1 h run at 75 % | 12.3 | 12.5 |
| 90 min at 55 % | 10.7 | 11.2 |
| Marathon (230 min at 80 %) | 16.1 | 19.8 |

- A desk day with no workout should land at about 3–7. Calibrate q's cap if it doesn't.
- Mean daily strain should sit near WHOOP's member average of 11 for active users.

**Tests**
- Golden values for the four sessions above (±0.3).
- Monotonic in TRIMP.
- The cap is exactly 21.
- Two marathons in a day give 21 and never exceed it.
- A 16 h synthetic day at constant q gives Day Strain 0.
- Sparse 5-minute samples at rest give the same Day Strain as 1-minute samples ±0.3.
- `liveStrain` round-trip: effort → TRIMP → effort is the identity.

---

#### C3. Add muscular load for strength-type sessions (high value for lifters; WHOOP 2026)

**Why.** WHOOP has added strength credit automatically since February 2026. Halo under-scores lifting because HR stays moderate.

**Formula [GUESS, WHOOP's inputs are type + duration]**
- TRIMP_msk = minutes × k_type:
  - k = 0.6 for STRENGTH_TRAINING, WEIGHTLIFTING, CALISTHENICS, HIGH_INTENSITY_INTERVAL_TRAINING, BOOT_CAMP, and EXERCISE_CLASS when tagged strength.
  - k = 0.25 for PILATES and YOGA.
  - k = 0.35 for ROCK_CLIMBING, ROWING and PADDLING.
  - k = 0 otherwise.
- Add it to the session's cardiovascular TRIMP before the map, and to the day's TRIMP.
- Store `{cardioTrimp, muscularTrimp}` per activity so the UI can show WHOOP's "cardio % / muscular %" split.

**Files**
- `src/core/scoring/strain.ts` (new `muscularTrimp(type, minutes)`)
- `src/pipeline/stage1.ts` (activities)
- `src/pipeline/types.ts` (`Stage1Activity`)
- `src/queries/strain.ts` and the activity view model

**Expected effect**: a 60-minute lift at an average 45 % HRR scores:
- Halo today (Edwards, nothing below 50 %): 0
- after C2 (cardio only): 7.8
- after C2 + C3 (+36 muscular TRIMP): 10.5

WHOOP's 1 h functional-fitness average is 10.1.

**Tests**
- Type mapping table.
- A strength session's strain is greater than the cardio-only strain.
- A non-strength type is unchanged.
- The split percentages sum to 100.

---

#### C4. Rebuild Sleep Performance on WHOOP's 2025 four parts (high value)

**Why.** It is the headline sleep number and feeds Recovery, Energy Bank, journal impact and reports. Today it rewards restorative share, which WHOOP dropped and Fitbit's staging measures poorly.

**Formula [GUESS weights, PUB parts]**
- H = min(100, 100·asleep/need_tonight). need_tonight is the full planner need from C5, computed the evening before.
- C = WHOOP-style consistency = max(0, −100 + 200·same/compared), pooled over the four pairs (last 24 h vs each of the previous 4 days, noon to noon). Reuse `sriPairs` with a lag parameter.
- E = min(100, 100·efficiency/0.95).
- SS = Sleep Stress % (C13 / N-6). If it is unavailable, drop the term and renormalise.
- **SP = 0.70·H + 0.10·C + 0.10·E + 0.10·(100 − SS)**.
- Show restorative sleep (deep + REM) as a separate stat, as WHOOP does, but not in the score.
- Tiers: ≥ 85 Optimal, 70–84 Sufficient, < 70 Poor.

**Files**
- `src/core/scoring/sleep.ts` (`rest()` parts and weights; `restFromTotals`)
- `src/core/algorithms/sleepRegularity.ts` (lagged pairs)
- `src/pipeline/scores.ts` `scoreSleep` (need_tonight from the previous day's planner, held in the fold as `f.prevNeedMin`)
- `src/core/scoring/confidence.ts` `forRest`
- Recovery's `sleepPerfCenter` of 0.85 still fits

**Expected effect**
- Short nights score lower. Consistent sleepers with light deep sleep no longer lose about 10 points.
- The score is closer to WHOOP's, because hours vs need drives about 70 % of it.

**Tests**
- 8 h asleep against an 8 h need, 92 % efficiency, consistency 80, SS 10 → 0.7·100 + 8 + 9.68 + 9 = 96.7.
- 6 h against 8 h → H = 75.
- Without SS, the weights renormalise.
- Consistency with an identical schedule over 5 days = 100.
- A schedule shifted by 3 h gives a lower consistency.

---

#### C5. Sleep need from WHOOP's patented terms, and score each night against it (high value)

**Formula**
- **need = base + f₁(S) + debt_term − naps**, clamped to [6.5, 11] h:
  - f₁(S) = 1.7/(1 + e^((17 − S)/3.5)) h, where S = today's Day Strain on 0–21 (after C2). This replaces `hoursPerStrainPoint`.
  - debt_term = min(0.5·debt, 60 min) [GUESS; the patent says "capped"].
  - Keep the ledger's 0.55 carry: `sleep.ts`'s 0.55 is close to the 0.5 guess.
  - base = `personalizedNeedHours` as now (upper quartile of 28 nights, floor 8, cap 9.5). Optionally lower the floor to 7.5 so base + average f₁ (~0.27 h) + debt ≈ WHOOP's 8.5 h average.
- Show the four parts the WHOOP API shows: baseline, strain, debt and naps. The planner already returns `parts`.
- Add sleep-onset latency to bedtimes: bedtime = wake − share·need/efficiency − median latency (time from in-bed to first asleep segment, from `hypnogramMetrics.solS`, median of 14 nights).
- Use tonight's planner `needMin` when scoring the **next** night's H (C4).

**Files**
- `src/core/algorithms/sleepPlanner.ts` (strain term, debt term, latency)
- `src/core/scoring/sleep.ts` (constants)
- `src/pipeline/scores.ts` (`scorePlanner` → fold → `scoreSleep`)

**Expected effect**
- A strain-18 day adds about 58 min of need (Halo today: about 0.05 h × (18 − mean) ≈ 20 min). A strain-8 day adds about 7 min.
- Sleep performance reflects that night's real need.

**Tests**
- f₁ golden values: 11 → 0.27 h, 14 → 0.50 h, 18 → 0.97 h, 21 → 1.28 h.
- A nap of 30 min lowers need by 30.
- The debt term caps at 60 min.
- Latency moves bedtime earlier.

---

#### C6. Align Recovery's inputs with WHOOP 2026 (high value)

**Formula**
- HRV z on **ln(RMSSD)**: fold ln values with `readinessHRVLnCfg`, which `baselines.ts` already has.
- Weights: wHRV 0.58, wRHR 0.22, wSleep 0.20.
- **Remove the skin-temperature term** (`wSkinTemp`). It stays in Health Monitor and illness, which is where WHOOP shows it.
- **Respiratory rate one-sided**: z_RR = (resp − μ)/σ (higher is worse). After the weighted mean: if z_RR > 1.0, z −= 0.15·(z_RR − 1.0), and the penalty doubles if z < 0.
- Baseline centre half-life: consider raising `halfLifeB` for hrv / resting_hr from 14 to 21 (about a 30-night effective window, as WHOOP).
- Re-check calibration on the demo seed and a real export. Mean should be 55–60; red about 10–20 % of days, green about 35–45 %. Adjust `logisticZ0` if needed.

**Files**
- `src/core/scoring/recovery.ts`
- `src/core/scoring/drivers.ts` (driver rows: drop skin temperature, and respiratory rate shows only when penalising)
- `src/core/scoring/baselines.ts` (configs)
- `src/pipeline/scores.ts` `scoreRecovery` and `stage2.ts` (fold ln HRV)

**Expected effect**
- No more Recovery boost from a low breathing rate or a cool night.
- Fewer extreme scores from high-HRV outliers, because the log compresses them.
- Matches WHOOP's published input list.

**Tests**
- A low respiratory rate never raises the score.
- A high one lowers it, more when z < 0.
- Skin temperature has no effect.
- ln-domain z for 60 ms against a baseline of 50 ms gives a smaller z than the raw domain.
- Overall mean on the fixture is within 55–60.

---

#### C7. Garmin-style training load: linear load, 10-day kernel, 28-day chronic, 2026 bands (high value)

**Why.** ACWR on log-compressed Effort hides spikes, so readiness, the strain target, coaching and reports under-react to big weeks. Garmin's model is published or reverse-engineered and simple to copy.

**Formula**
- Daily load L(d) = TRIMP_day from C2 (linear, after the waking floor, plus muscular). When N-3 lands, the sum of sessions' peak EPOC can replace it.
- **ATL(d) = (7/5.5)·Σᵢ₌₀..₉ (1 − 0.1i)·L(d − i)**.
  - Missing days (no Effort) are left out and the weights renormalised.
  - Unavailable if fewer than 7 of the 10 days are present.
- **CTL(d) = mean of ATL over d−27…d**; needs ≥ 14 ATL values.
- **ratio = ATL/CTL**.
- Bands: `LOAD_RAMPING_DOWN` < 0.8; `LOAD_SWEET_SPOT` 0.8–<1.5; `LOAD_BUILDING_FAST` 1.5–<2.0; `LOAD_SPIKING` ≥ 2.0.
- Strain target: `acwrCapAbove` 1.3 → **1.5**.
- Keep CTL/ATL/TSB EWMAs (time constants 42/7) for a fitness/fatigue/form chart, but on L rather than Effort.
- Keep monotony on L.

**Files**
- `src/core/scoring/readiness.ts` (`acwrBand`, ACWR computation)
- `src/core/scoring/trainingLoad.ts`
- `src/pipeline/scores.ts` `scoreTrainingLoad` (pass TRIMP; stage 1 must store `trimpDay`)
- `src/pipeline/types.ts` (`Stage1Day.trimp`)
- `src/core/algorithms/strainTarget.ts`
- `src/core/algorithms/coaching.ts` (`loadStatus` mapping)
- `src/core/algorithms/reports.ts`

**Expected effect.** A week with two extra hard sessions now shows "building fast" instead of "sweet spot". The ratio's sensitivity matches Garmin's display.

**Tests**
- Constant L for 40 days → ATL = 7L and ratio = 1.00.
- A single-day spike decays linearly to 0 over 10 days.
- Band edges at 0.8 / 1.5 / 2.0.
- Missing days renormalise the weights.

---

#### C8. Add HRV Status (new, high value; see N-1)

Covered by the spec in §3.3. Listed here for priority.

---

#### C9. Turn Energy Bank into a 24-hour, Body Battery-style reserve (medium-high value)

**Why.** Halo's curve starts fresh each morning from a formula. Body Battery's appeal is watching the night recharge it and the day drain it continuously.

**Formula [GUESS rates, PUB structure]**

Work in 1-minute steps. Map Halo's stress (0–3) to s = 33.3·stress, giving 0–100, with rest at s < 25 (stress < 0.75).

- **Asleep (main sleep or nap)**: +(9.5/60)·q·w_stage per minute.
  - q = clamp(0.6 + 0.4·RMSSD_night/HRV_baseline, 0.5, 1.3).
  - w_stage: deep 1.2, REM 0.9, light 1.0, awake 0.
  - Scale so that `sleep_need` hours of normal sleep give ≈ +65.
- **Awake, s < 25**: +(25 − s)/25 × 2.5/60 per minute.
- **Awake, s > 25**: −(s − 25)/75 × 9/60 per minute.
- **Sleep pressure, awake**: −0.8/60 per minute.
- **Activity**: −0.17 × ΔTRIMP (linear, from C2), so 1 h at TE 3 (≈ 120 TRIMP) ≈ −20. Replace the Edwards `k1·w`.
- Clip to [5, 100].
- **Continuity**: the start of each night is the previous evening's level. The first ever day starts at 0.6·Recovery + 0.4·SP (the current formula).
- Hold the last stress value across gaps of ≤ 10 min, because Fitbit's off-exercise HR is sparse.
- Bands: 5–25 very low, 26–50 low, 51–75 medium, 76–100 high.

**Files**
- `src/core/algorithms/energyBank.ts` (config, the sleep loop, continuity)
- `src/pipeline/scores.ts` `scoreEnergyBank` (start from the previous day's last level; give the curve the main-sleep span)
- `src/pipeline/stage2.ts` (the fold carries the last level)
- Stage 1 per-minute sleep-stage series (from `segments`)

**Expected effect**
- A morning level that reflects how well you slept, rising through the night.
- Fewer days stuck near 0 by evening: about 13 points of sleep pressure versus 38 of basal drain today.

**Tests**
- An 8 h night at baseline HRV starting from 30 ends at about 95.
- A 1 h hard run drains 15–25.
- Never below 5 or above 100.
- A day of no HR data is flat apart from sleep pressure.
- Evening-to-morning continuity.

---

#### C10. Healthspan (Halo Age) parity fixes (medium value)

**Changes**
1. Count Zone 1–3 time as plain minutes, as WHOOP's definition does: zone13 = minutes at 40–80 % HRR in bouts or workouts, with no doubling of 60–80 %.
   - Keep the Arem curve's minute knots.
   - Re-fit `yearsPerLnHr` against WHOOP's Table 2 profiles. The current fit (0.477 overlap → 4.77) assumed doubling.
2. Extend `STRENGTH_TYPES` to WHOOP's list: add `PILATES|YOGA|BOOT_CAMP`. Consider `EXERCISE_CLASS` and `ROCK_CLIMBING`.
3. Pace of Aging: publish weekly (on Monday's row) and require 21 days with Recovery in the last 31. Keep the daily value internally.
4. Sleep consistency term: keep the 7-day SRI curve (its evidence is SRI-based). Show the WHOOP-style 4-day consistency (C4) on the sleep screen and note the difference.

**Files**
- `src/core/algorithms/healthspan.ts`
- `src/pipeline/scores.ts` (`zone13Sec`)
- `src/core/algorithms/weeklyPlan.ts` (zone13 already uses plain minutes)

**Tests**
- Re-run the WHOOP Table 2 profile test.
- A yoga session counts as strength.
- Pace changes only on week boundaries.

---

#### C11. Fitness level categories on Garmin's percentile cut-offs (medium-low value)

**Formula**: `categoryFloors = { fair: 40, good: 60, excellent: 80, superior: 95 }`, matching Garmin's use of the Cooper Institute percentiles.
- Keep FRIEND (measured treadmill norms), or switch to the Cooper table from the FR970 manual for exact Garmin parity. With FRIEND, "superior" needs the 95th-percentile clamp.

**File**: `src/core/algorithms/fitnessLevel.ts`.

**Tests**: a 30-year-old man at 48 ml/kg/min is at about the 71st FRIEND percentile (30–39 row). He reads "good" after the change; today he reads "excellent".

---

#### C12. Confounder-adjusted journal impact (medium-low value)

**Formula**
- For each tag, fit ridge regression: next-day Recovery ~ β·tag + γ₁·Strain(d) + γ₂·[other tags with ≥ 5/5] + intercept, with λ = 1 on standardised predictors.
- Report β, with a bootstrap CI over days (keep the current 90 % percentile bootstrap).
- Mark "can't separate" when a tag's correlation with another tag is > 0.8 (WHOOP's "always logged together").
- Do not control for sleep performance in the main estimate. It is a mediator: alcohol hurts Recovery through sleep. Show "via sleep" as a second number.

**File**: `src/core/algorithms/journalImpact.ts`.

**Tests**
- A synthetic tag that only co-occurs with high strain gives β ≈ 0.
- A true effect of −10 is recovered within the CI.

---

#### C13. Stress Monitor: WHOOP's patented normalisation and Sleep Stress (medium-low value)

**Formula**
- Anchor on HRRR = (HR − RHR₁₄)/(HRmax − RHR₁₄), where RHR₁₄ is the 14-day median resting HR.
- Personal still-waking distribution over 14 days: stress = 3·Φ((HRRR − m)/s), where m and s are the median and the 1.4826·MAD of still-waking HRRR. This keeps Halo's "baseline ≈ low" behaviour if m is shifted by −1.5s (tunable).
- HRV context: multiply by clamp((baseline ln RMSSD / last-night ln RMSSD)^0.5, 0.85, 1.15).
- **Sleep Stress**: per asleep minute with HR, sleep-stress = 1 if HR ≥ the night's P20 HR + max(6 bpm, 0.08·HRR) for ≥ 3 consecutive minutes. Sleep Stress % = flagged minutes / asleep minutes with HR. Feeds C4.

**Files**: `src/core/algorithms/stress.ts`, `src/pipeline/stage1.ts` (sleep HR series), `src/pipeline/scores.ts`.

---

#### C14. Credit sparse daytime heart rate fairly

Folded into C2; see the sample-duration rule there.

---

#### C15. Optional: personal "HRV-neutral" strain target (WHOOP's original method)

**Formula**
- After 90+ days, fit Δ ln RMSSD(d+1) − baseline ~ a_b + b_b·Strain(d) for each Recovery band b.
- Optimal centre = −a_b/b_b, clamped to the current multiplier range. Use ±1.5 as the band.
- Fall back to the current method otherwise.

**File**: `strainTarget.ts`.

---

#### C16. Health Monitor: history and a trending flag (low value, cheap)

- Flag a vital as "trending away" when it is outside range on 2 of the last 3 nights.
- Expose a 30-night history per vital, like Garmin's 2026 Health Status History.

**File**: `healthMonitor.ts`.

---

#### C17. Lower priority / optional

- **Cycle-based day (WHOOP)**: Day Strain from main-sleep onset to the next main-sleep onset. This is a large refactor of stage 1's day bounds and helps only late-evening workouts. Defer.
- **Auto-workout**: minimum 10 min, as WHOOP since 2026-01.
- **Intensity minutes (Garmin)**: Halo's Active Zone Minutes (40 % / 60 % HRR, vigorous ×2) already match. Add a weekly 150 goal card if not shown.

### 3.3 New features Halo should add (specs)

#### N-1. HRV Status (Garmin)

**Inputs**: nightly RMSSD from Health Connect.

**Formula**
- y = ln(RMSSD).
- 7-day mean m₇ over nights with a value; needs ≥ 4 in the last 7.
- Baseline μ, σ = mean and SD of y over the last 60 nights (excluding the last 7). Needs ≥ 21 nights; until then "No status — building baseline (n/21)".
- Balanced band = [e^(μ−0.75σ), e^(μ+0.75σ)] in ms.
- Status:
  - **Balanced** if m₇ is inside the band.
  - **Unbalanced** if above the band, or below it but above e^(μ−1.5σ).
  - **Low** if m₇ < e^(μ−1.5σ).
  - **Poor** if the baseline e^μ is below the age-sex 25th percentile of nightly RMSSD. A published norm table is needed first; omit Poor until one is chosen and cited.
- Show last night's value, the 7-day average, the band, a 4-week chart and a status colour (green / orange / red).

**Files**
- New `src/core/algorithms/hrvStatus.ts` (+ test)
- A `hrv_status` column in stage 2 (`scores.ts`, `types.ts` `STAGE2_COLUMNS`)
- `src/queries/health.ts` or `recovery.ts` view model

**Tests**
- Flat 50 ms history plus last week at 50 → Balanced.
- Last week at 30 ms with σ_ln = 0.15 → Low.
- Last week at 70 → Unbalanced.
- Fewer than 21 nights → building.

#### N-2. Training Readiness 1–100 (Garmin)

**Sub-scores [GUESS weights], each 0–100**
- SleepS = sleep performance (C4).
- Rec = 100·(1 − min(RT, 72)/72)^1.3, where RT is the remaining Recovery Time at wake (N-3/N-4). Before N-4 exists, use hours since the last session with Strain ≥ 14, mapped 0 h → 0 and 48 h → 100.
- HRVs: Balanced 100; Unbalanced-high 75; Unbalanced-low 55; Low 25.
- Load: ratio 0.8–1.3 → 100, falling linearly to 30 at 2.0; < 0.8 → 90.
- SleepHist = mean of the last 3 nights' SP.
- StressHist = 100 − 50·max(0, mean awake stress over 3 days − 0.75), with stress on 0–3.

**Formula**
- **TR = 0.25·SleepS + 0.25·Rec + 0.15·HRVs + 0.15·Load + 0.10·SleepHist + 0.10·StressHist**.
- Cap at min(sub-score) + 30.
- Subtract 10 if awake more than 18 h before the last sleep.
- Bands: 95–100 Prime, 75–94 High, 50–74 Moderate, 25–49 Low, 1–24 Poor.
- Updates at wake and after each activity: subtract the new Recovery Time's effect.

**Where it fits.** Show it as Halo's Garmin-style "Training Readiness" next to Recovery (WHOOP-style). Its factor rows replace today's categorical readiness `level`.

**Files**: `src/core/scoring/readiness.ts` (score + bands), `src/pipeline/scores.ts`, `src/core/algorithms/coaching.ts`.

**Tests**
- All factors ideal → ≥ 95.
- One factor at 20 caps the score at 50.
- Monotonic in each factor.

#### N-3. EPOC and Aerobic Training Effect per session (Garmin)

**Inputs**: session HR (1–5 s), RHR, HRmax, VO2max (Fitbit; or the Uth estimate), age, sex, BMI, weekly training hours.

**Formula**
- I(t) = %HRR·(1 − 3.5/VO2max) + 3.5/VO2max.
- Integrate dE/dt = a(I) − k(I)·E over the session (Δt from samples, capped at 10 s), using a(I) and k(I) from G-1.
- Peak EPOC E_pk.
- AC = max(AC_vo2 (Jackson inversion, 0–7), AC_hours); AC_hours: 5–7 h → 7.5, 7–9 → 8, 9–11 → 8.5, 11–13 → 9, 13–15 → 9.5, > 15 → 10.
- Lines: L₂ = 3 + 2.4·AC, L₃ = 6 + 7.8·AC, L₄ = 10 + 18.2·AC, L₅ = 15 + 28.7·AC, L₁ = 0.3·L₂.
- TE = k + (E_pk − L_k)/(L_{k+1} − L_k) within each band; E_pk/L₁ below L₁; capped at 5.0.
- Labels: No benefit, Minor, Maintaining, Improving, Highly improving, Overreaching.
- **Primary benefit** (aerobic only, HR-based): from time above vs below 80 % HRmax and TE — Recovery (TE < 2), Base (mostly < 80 %), Tempo, Threshold (mostly 80–90 %), VO2max (TE ≥ 4 with > 10 min at > 90 %).
- Anaerobic TE: omit, or show a "high-intensity bouts" count, because HR alone is weak.

**Files**
- New `src/core/algorithms/trainingEffect.ts` (+ test)
- `src/pipeline/stage1.ts` (per activity and detected workout: `epocPeak`, `te`)
- Activity view model in `src/queries/strain.ts`

**Tests** (Figure 5 golden points, tolerance ±5 ml/kg)
- 30 min at I = 0.8 → E ≈ 155.
- 60 min at 0.7 → ≈ 137.
- 10 min at 0.6 → ≈ 20.
- AC 7 with E_pk 190 → TE 4.7.
- E_pk 60.6 → TE 3.0.

#### N-4. Recovery Time (Garmin)

**Formula**
- At each session end: h = 72·((TE − 1)/4)^2.25 if TE > 1, else 0.
- Combine: RT_new = min(96, max(RT_left, h) + 0.25·min(RT_left, h)).
- Multiply by 1.15 if the load ratio is ≥ 1.5.
- Count down per hour: 1.0 awake; 1.4 asleep when that night's SP ≥ 85; 0.7 for hours with mean stress ≥ 2 or after SP < 70.
- Green when RT = 0.

**Files**: `trainingEffect.ts` or new `recoveryTime.ts`; stage 2 carries RT through the fold; Home card.

**Tests**
- TE 3.5 → 24 h.
- TE 5 → 72 h.
- Two sessions combine as specified.
- A good night speeds the countdown.

#### N-5. Training Status (Garmin; HRV-driven variant)

**Inputs**
- Fitbit `vo2maxDaily` trend: a recency-weighted linear fit over 28 days (Fitbit's estimate is smooth and RHR-driven, so use 28 days, not Garmin's 14).
- Load ratio (C7), ATL level relative to the person's 12-week ATL range, and HRV Status (N-1).

**Relative load**: 0 if ATL < 0.2·median ATL; 1–2 if ratio < 0.8; 3–4 if 0.8–1.4; 4.5 if 1.5–1.9; 5 if ≥ 2.0.

**Rules, applied in order**
1. **Detraining**: ATL < 0.2·median for 7+ days.
2. **Strained**: HRV Low, or Unbalanced-low for ≥ 3 days, with load ≥ 3.
3. **Overreaching**: ratio ≥ 1.5 and (VO2max slope ≤ −1.5/month or HRV Low).
4. **Recovery**: load ≤ 2 and falling.
5. **Peaking**: VO2max rising (≥ +1.5/month) and load falling.
6. **Productive**: load 3–4 and (VO2max rising, or HRV Balanced with ratio ≥ 1.0).
7. **Unproductive**: load 3–4 and VO2max falling.
8. **Maintaining**: otherwise.

Show "No status" for the first 14 days or without a VO2max in 30 days and without HRV Status.

**Files**: new `src/core/algorithms/trainingStatus.ts`; stage 2 column; Fitness screen.

**Tests**: one synthetic scenario per rule.

#### N-6. Sleep Stress

Spec in C13; feeds C4. Show it as "% of sleep in high stress" on the sleep screen.

#### N-7. Load Focus (Garmin)

**Formula**
- For each session over 4 weeks:
  - load share below 80 % HRmax → low aerobic
  - 80 %+ → high aerobic
  - time above 95 % HRmax × 3 → anaerobic (proxy)
- Total monthly load reference MTL = 4 × CTL·(7/7).
- Report each category's % of MTL against Garmin's targets: low aerobic 25–55 %, high aerobic 30–60 %, anaerobic 10–30 % (0 if AC ≤ 7).
- Labels: Balanced / … shortage / … focus / Below or Above targets (< 65 % or ≥ 145 % of MTL).

**Value**: medium-low, because the anaerobic share is crude.

#### N-8. Smaller additions

- **Race predictor** (Daniels–Gilbert from VO2max; flag as "estimate from VO2max only").
- **Endurance Score** [GUESS]: ES ≈ 125·VO2max × (0.85 + 0.15·min(1, 12-week average weekly hours/8)) × (1 + 0.05·[a session ≥ 2 h in 4 weeks]); show Garmin's band names. Low confidence, so label it "Halo estimate".
- **Jet-lag adviser**: on a phone time-zone change of ≥ 3 h, suggest shifting the planner's bedtime by 1 h/day eastward or 1.5 h/day westward, and only for stays > 72 h.
- **Optimal sleep window** (Sleep Alignment): circular median of the sleep midpoint over 28 days ± need/2. Alignment = overlap fraction of last night with the window.

### 3.4 Where Halo is deliberately different, and should stay so

- **Day boundary**: calendar day stays for now (C17). Cost is low; refactor risk is high.
- **Stress without beat-to-beat HRV**: WHOOP's patent explicitly allows a HR-only model, and Garmin's needs beat-to-beat data. Halo's still-minute masking from steps stands in for motion; keep it.
- **Halo Age curves**: Halo uses the literature dose-response curves WHOOP cites, plus a single overlap factor, because WHOOP's structural-equation adjustments are fit to member data Halo can't access. Keep them; only the input definitions change (C10).
- **VO2max**: Fitbit's estimate stands in for both vendors' estimates. GPS and pace-based VO2max, Performance Condition, Hill Score, Stamina, Running Economy and Running Tolerance are out of reach.
- **Honesty gates**: Halo's calibrating states (7 nights for Recovery, 21 for HRV Status) are stricter than or equal to the vendors'. Keep them.

### 3.5 Implementation status in Halo (2026-10-09, scoring versions 15–19)

Everything below is Halo's own implementation of the published methods; constants are labelled in the code as published, inferred or calibrated, with their source.

**Done**
- **Version 15.** C1, C2, C3 and C14:
  - Zones on WHOOP's 2024 edges.
  - Max HR learned weekly from workout heart rate. It only rises, by 2 bpm or more, and is stored as `daily_values` "latest" / `learned_max_hr`.
  - Strain on continuous Banister TRIMP through 5.05·ln(1 + 0.09·T).
  - A 14-day waking floor capped at 0.40.
  - 10-minute credit for quiet sparse readings.
  - Muscular load by type. Women's Banister coefficients corrected to 0.86 / 1.67; the earlier code used 0.64 for both sexes.
- **Version 16.** C4, C5 and N-6:
  - The four-part Sleep Performance against the night's full need.
  - WHOOP-style 4-day consistency. The 7-day SRI is kept for Halo Age.
  - Sleep Stress from sleeping heart rate.
  - The patent strain sigmoid, and a debt term at half the debt capped at 60 min, with the debt ledger over 28 nights.
  - Need kept within 6.5–11 h.
  - Bedtimes leave the median latency. The latency is taken out of the efficiency first, so it isn't counted twice.
- **Version 17.** C6:
  - ln-HRV against a 21-night-half-life ln baseline, with weights 0.58 / 0.22 / 0.20.
  - One-sided respiratory penalty; skin temperature removed.
  - Calibration on the demo seed: mean 59.3, red 15 %, green 41 %. `logisticZ0` is unchanged.
- **Version 18.** C7, C9 and C10:
  - Garmin's 10-day acute load and 28-day chronic load on the linear TRIMP, with bands 0.8 / 1.5 / 2.0. The Strain Target cap is now 1.5.
  - Energy Bank as a 24-hour 5–100 reserve.
  - Halo Age counts zone minutes once, adds yoga, Pilates and boot camp as strength, and publishes Pace of Aging on Mondays with 21 of 31 days scored for Recovery. The overlap factor 0.477 was kept: it was fitted on WHOOP's Table 2 profiles, which are already plain minutes.
- **Version 19.** N-1, N-2, N-3, N-4 and N-5:
  - HRV Status, Training Readiness, Aerobic Training Effect with primary benefit, Recovery Time and Training Status, in two new `daily_scores` columns, `hrv_status` and `training`.
  - From the lower-priority list: C11 (VO2max categories at 40 / 60 / 80 / 95) and the 10-minute auto-detect minimum from C17.

**Deviations from the specs above, and why**
- **Energy Bank sleep pressure is 3.0 an hour, not 0.8.** Calibrated on the demo seed. At 0.8, almost every morning woke at 100, because Halo's still daytime minutes mostly read as rest and charge. At 3.0 the reserve wakes at about 90 and ends the day near 35.
- **EPOC decay at 70 % of VO2max is 0.018, not 0.020.** 0.020 put 60 minutes at 70 % at 131 ml/kg; Figure 5 shows 137.
- **The Recovery Time exponent is 2.32, not 2.25.** 2.32 meets the patent's TE 3.5 → 24.2 h; 2.25 gives 25.0.
- **The activity class takes Jackson's PA-R hour steps below 5 h a week:** over 3 h → 7, 1–3 h → 6, 30–60 min → 5. Without them, a runner doing about 4.5 h a week sat near class 5 and long easy runs read Overreaching.
- **Training Readiness gives full load marks from 0.8 to 1.5, not 0.8 to 1.3,** to agree with Garmin's 2026 optimal band.
- **The HRV Status σ is floored at 0.05 ln.** Without it, a perfectly steady history has a zero-width band.

**Not done, and why**
- **Not computable from Health Connect Fitbit data** (§1, G-15, W-15):
  - Anaerobic Training Effect. Heart rate alone is too weak; it needs pace or power.
  - HRV Status "Poor". It needs a published age norm for nightly RMSSD.
  - Garmin's "Paused" Training Status. Halo cannot tell illness or injury time off from a rest block.
  - Performance Condition, Stamina, Hill Score, Running Economy and Running Tolerance.
  - ECG, blood pressure and irregular-rhythm screening.
- **Lower priority, left for later:**
  - C12, the confounder-adjusted journal impact.
  - C13's stress normalisation. Sleep Stress itself is done.
  - C15, the personal strain target.
  - C16, the Health Monitor trend flag.
  - N-7 Load Focus, and the N-8 extras.
  - The cycle-based day from C17.
  - The optional low-Recovery Strain multiplier from C2.
  - Applying the learned max HR in `maxHrOf` for queries. Screens read the max HR that stage 1 stored for the day; only the no-row fallback uses the profile or Tanaka.

---

## 4. Summary tables

**Prioritised change list**

| # | Change | Value | Effort | Version bump |
|---|---|---|---|---|
| C1 | WHOOP 2024 HRR zones (Z1 at 40 %) + learned max HR | High | S | yes |
| C2 | Strain recalibration (continuous TRIMP, 5.05·ln(1 + 0.09T), waking floor, sparse-sample credit) | High | M | yes |
| C3 | Muscular load for strength sessions (WHOOP 2026) | High | S–M | yes |
| C4 | Sleep Performance = WHOOP 2025 four parts | High | M | yes |
| C5 | Sleep need from the patent sigmoid + capped debt; score nights against full need | High | M | yes |
| C6 | Recovery: ln HRV, one-sided respiratory rate, drop skin temperature | High | S | yes |
| C7 | Garmin acute/chronic load + 2026 ratio bands on linear load | High | M | yes |
| C8 / N-1 | HRV Status | High | S | new column |
| N-2 | Training Readiness 1–100 | Med-High | M | new |
| N-3 / N-4 | EPOC, Aerobic TE, Recovery Time | Med-High | M | new |
| C9 | 24-hour Body Battery-style Energy Bank | Med-High | M | yes |
| C10 | Halo Age definitions (zone minutes, strength types, weekly pace) | Medium | S | yes |
| N-5 | Training Status | Medium | M | new |
| C11 | Fitness categories 40/60/80/95 | Med-Low | XS | yes |
| C12 | Confounder-adjusted journal impact | Med-Low | M | yes |
| C13 / N-6 | Stress normalisation + Sleep Stress | Med-Low | M | yes |
| N-7 / N-8 | Load Focus, race predictor, endurance score, jet lag, sleep window | Low | S each | new |
| C15–C17 | Personal strain target, Health Monitor trend, cycle day, 10-min auto-detect | Low | varies | some |

---

## 5. Sources (with dates)

"Older" = before 2025, used only where current vendor pages say the method is unchanged. Undated vendor pages show the date they were accessed, 2026-10.

### WHOOP

| ID | Source | Date |
|---|---|---|
| W1 | "WHOOP Strain Explained", The Locker — https://www.whoop.com/us/en/thelocker/how-does-whoop-strain-work-101/ | 2026-02-10 |
| W2 | "Strain Coach / Strain Target" — https://www.whoop.com/us/en/thelocker/strain-coach/ | 2026-01-30 |
| W3 | "Recovery 101" — https://www.whoop.com/us/en/thelocker/how-does-whoop-recovery-work-101/ | 2026-01-30 |
| W4 | "Adding respiratory rate to Recovery" — https://www.whoop.com/us/en/thelocker/adding-respiratory-rate-to-recovery/ | 2020-07-27 (older; still current per W3) |
| W5 | "How much sleep do you need" — https://www.whoop.com/us/en/thelocker/how-much-sleep-do-i-need/ | 2026-02-12 |
| W6 | "Sleep Consistency" — https://www.whoop.com/us/en/thelocker/new-feature-sleep-consistency-why-we-track-it/ | 2026-05-22 |
| W7 | "Sleep Efficiency" — https://www.whoop.com/us/en/thelocker/app-feature-improve-sleep-efficiency/ | 2026-06-15 |
| W8 | "Sleep Planner" feature update — https://www.whoop.com/us/en/thelocker/feature-update-whoop-app-sleep-planner/ | 2025-04-02 |
| W9 | "Introducing Stress Monitor" — https://www.whoop.com/us/en/thelocker/introducing-stress-monitor-a-new-way-to-monitor-manage-stress/ | 2023-03-29 (older; restated 2026-04-30) |
| W10 | "Health Monitor" — https://www.whoop.com/us/en/thelocker/health-monitor-feature/ | 2026-05-15 |
| W11 | WHOOP Healthspan white paper (PDF) — https://assets.ctfassets.net/rbzqg6pelgqa/3ONehqJslbqxI7CQlwGjfT/36429d6f66940e1fd866a772ed5bfc93/WHOOP_2025_White_Paper_Healthspan__6_.pdf | 2025-09-04 |
| W11 | Healthspan pages — https://www.whoop.com/us/en/thelocker/Healthspan-Data-Meets-Longevity/ (2026-01-21) and https://www.whoop.com/us/en/thelocker/healthspan/ (2026-04-23) | 2026 |
| W12 | "More personalized heart rate zones" — https://www.whoop.com/us/en/thelocker/more-personalized-heart-rate-zones-with-whoop/ | 2024-11-21 (older; current zone method) |
| W13 | "Calculating max heart rate" — https://www.whoop.com/us/en/thelocker/calculating-max-heart-rate/ | 2026-04-08 |
| W14 | "How WHOOP measures muscular load" — https://www.whoop.com/us/en/thelocker/how-whoop-measures-muscular-load/ | 2026-04-23 |
| W15 | "R&D behind Strength Trainer" — https://www.whoop.com/us/en/thelocker/the-research-and-development-behind-strength-trainer/ | 2023-04-26 (older) |
| W16 | "Estimate your VO2max with WHOOP" — https://www.whoop.com/us/en/thelocker/estimate-your-vo-max-with-whoop-/ | 2026-05-29 |
| W17 | "Blood Pressure Insights" — https://www.whoop.com/us/en/thelocker/blood-pressure-insights/ | 2026-04-23 |
| W18 | "Heart Screener" — https://www.whoop.com/us/en/thelocker/heart-screener/ | 2026-05-15 |
| W19 | "Everything WHOOP launched in 2025" — https://www.whoop.com/us/en/thelocker/everything-whoop-launched-in-2025/ | 2025-12-15 |
| W20 | "2026 What's New at WHOOP" (rolling) — https://www.whoop.com/us/en/thelocker/2026-whats-new/ | Page dated 2026-03-31, updated through 2026 |
| W21 | "WHOOP Training Zones" — https://www.whoop.com/us/en/thelocker/whoop-training-zones-optimal-overreaching-restoring/ | 2018-07-16 (older; basis of Strain Target) |
| W22 | Monthly Performance Assessment — https://www.whoop.com/us/en/thelocker/monthly-performance-assessment-now-features-enhanced-recovery-analysis/ | 2021-08-31 (older) |
| W23 | Women's Hormonal Insights — https://www.whoop.com/us/en/thelocker/womens-hormonal-insights/ | 2025 |
| W24 | the5krunner, "New WHOOP Strength Trainer update" — https://the5krunner.com/2026/02/28/new-whoop-strength-trainer-update/ | 2026-02-28 |
| W25 | the5krunner, "WHOOP heart rate accuracy update" — https://the5krunner.com/2026/02/28/whoop-heart-rate-accuracy-update/ | 2026-02-28 |
| W26 | CNBC, "Whoop on-demand clinician access" — https://www.cnbc.com/2026/05/08/whoop-on-demand-clinician-access.html | 2026-05-08 |
| W27 | Gadgets & Wearables, "WHOOP new sleep score metric" — https://gadgetsandwearables.com/2025/05/05/whoop-new-sleep-score-metric/ | 2025-05-05 |
| W28 | WHOOP developer docs, cycle and sleep objects (API v2) — https://developer.whoop.com/docs/developing/user-data/cycle | Undated, accessed 2026-10 |
| W29 | OpenStrap analytics (open-source WHOOP-style strain / recovery) — https://github.com/OpenStrap/analytics | Code dated 2026-08 |
| W30 | US12318226B2 (Whoop Inc.; strain, recovery, sleep need) — https://patents.google.com/patent/US12318226B2/en ; also US11627946B2 (cycle-based coaching) | Granted 2025-06-03; priority 2017 |
| W31 | WO2024129679A2, "Stress score generation" (Whoop Inc.) — https://patents.google.com/patent/WO2024129679A2/en | Published 2024; priority 2022–2023 |

### Garmin / Firstbeat

| ID | Source | Date |
|---|---|---|
| G1 | Forerunner 970 Owner's Manual (PDF) — https://www8.garmin.com/manuals/webhelp/GUID-025D75CF-3445-49E1-8D81-1AA74AB4E00F/EN-US/Forerunner_970_OM_EN-US.pdf | Build 2026-09-28 |
| G2 | Garmin running-science pages (training-readiness, training-load, training-status, epoc, recovery-time, vo2-max, endurance-score, race-time-prediction, running-tolerance, running-economy, training-effect) — https://www.garmin.com/en-US/garmin-technology/running-science/physiological-measurements/ | Live, accessed 2026-10 (undated) |
| G3 | Garmin health-science pages (body-battery, stress-tracking, hrv-status, sleep-tracking, sleep-coach, fitness-age, intensity-minutes, jet-lag-adviser, pulse-ox, respiration-rate, womens-health) — https://www.garmin.com/en-US/garmin-technology/health-science/ | Live, accessed 2026-10 (undated) |
| G4 | Firstbeat, "Indirect EPOC Prediction Method Based on Heart Rate Measurement" — https://www.firstbeat.com/wp-content/uploads/2015/10/white_paper_epoc.pdf | 2005, updated 2012 (older; still "the core" per G2) |
| G5 | Firstbeat, "EPOC Based Training Effect Assessment" — https://www.firstbeat.com/wp-content/uploads/2015/10/white_paper_training_effect.pdf | 2005, updated 2012 (older) |
| G6 | Firstbeat, "Aerobic and Anaerobic Training Effect" — https://www.firstbeat.com/wp-content/uploads/2015/10/FFW609US05-171.pdf | 2017 (older) |
| G7 | Firstbeat, "Stress and Recovery Analysis Method Based on 24-hour HRV" — https://www.firstbeat.com/wp-content/uploads/2015/10/Stress-and-recovery_white-paper_20145.pdf | 2014 (older) |
| G8 | Firstbeat, "A Sleep Analysis Method Based on HRV" — https://www.firstbeat.com/wp-content/uploads/2019/11/A-Sleep-Analysis-Method-Based-on-Heart-Rate-Variability-071119.pdf | 2019-11-07 (older) |
| G9 | Firstbeat, VO2 estimation (2005/2012) and energy expenditure (2007/2012) white papers — https://www.firstbeat.com/wp-content/uploads/2015/10/white_paper_vo2_estimation.pdf ; …/white_paper_energy_expenditure_estimation.pdf | Older |
| G10 | Patents (reassigned to Garmin Jyväskylä Oy 2025-05-02): US7192401 EPOC (2003, older); US7330752 stress (~2008); US10123730 VO2max (~2018); US20180174685A1 Training Status (2018); US20230414143A1 load focus / anaerobic TE / recovery tables (2023); US20200215299A1 sleep need and Body Resources (2020) — https://patents.google.com/ | As listed |
| G11 | the5krunner, "Garmin Q1 2026 feature update" — https://the5krunner.com/2026/02/24/garmin-q1-2026-feature-update/ | 2026-02-24 |
| G12 | Garmin, Q1 2026 feature update PDF — https://www8.garmin.com/wearables/PDF/WearablesSoftwareUpdate/2026/February2026.pdf | 2026-02 |
| G13 | Gadgets & Wearables, "Garmin Q3 2026 feature update" — https://gadgetsandwearables.com/2026/09/01/garmin-q3-2026-feature-update/ ; Garmin Q3 2026 PDF — https://res.garmin.com/shared/emea/24763/August2026.pdf | 2026-09-01 / 2026-08 |
| G14 | DC Rainmaker, "Garmin Fenix 9 Series In-Depth Review" — https://www.dcrainmaker.com/2026/09/garmin-fenix9-series-pro-inreach-solar-in-depth-review.html | 2026-09 |
| G15 | Garmin newsroom and launch coverage: Connect+ (2025-03-27), FR570/970 + HRM 600 (2025-05), Index Sleep Monitor (2025-06-18), Venu 4 (2025-09-17), Q2-2026 update (2026-06-02) | As listed |
| G16 | Garmin press release, Fenix 9 — https://www.garmin.com.my/news/press-release/news-2026-sep-fenix-9-pressroom/ ; the5krunner, "Fenix 9 features will pass to existing watches" — https://the5krunner.com/2026/08/26/fenix-9-features-will-pass-to-existing-garmin-watches/ | 2026-08/09 |
| G17 | Garmin Forums, acute-load formula threads — https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/310210/acute-training-load-calculation (~2022–23) and …/433833/acute-load-formula (~2026) | As listed |
| G18 | Gadgetbridge `ComputedHrvSummarySampleProvider.java` — https://codeberg.org/Freeyourgadget/Gadgetbridge/ | Master branch, accessed 2026-10 |
| G19 | Stress & Health validation of Garmin stress (n = 60) | 2025-12 |

### Literature used for formulas

- Banister TRIMP (Banister 1991; Morton 1990)
- Edwards TRIMP (Edwards 1993)
- Karvonen %HRR; Swain & Leutholtz 1997 (%HRR ≈ %VO2R)
- Londeree 1995 (%VO2max from %HRmax)
- Tanaka 2001 (HRmax)
- Jackson et al. 1990 (non-exercise VO2max, Med Sci Sports Exerc 22:863)
- Daniels & Gilbert 1979 (race equations)
- Phillips 2017 (Sleep Regularity Index)
- Plews 2013 (7-day ln RMSSD monitoring)
- Keytel 2005 (HR-based energy expenditure)
