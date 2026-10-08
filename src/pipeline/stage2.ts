// Stage 2: folds every day, oldest first, over the daily rows and stage 1's cached results, then
// writes only the rows and series whose JSON changed. Ported from Pulse's src/server/pipeline/stage2.ts;
// the fold, the scorer order and the journal-impact memo are the web's, the reads and writes are Store calls.
import type { ReportRow, ScoreRow, SeriesKind, Store } from "@/data/store";
import { addDays } from "@/lib/time";
import { slice, sliced } from "@/lib/yield";
import { hrvCfg, recoveryHRVLnCfg, respCfg, restingHRCfg, skinTempCfg, update } from "@/core/scoring/baselines";
import { lnHrv } from "@/core/scoring/recovery";
import { activityCost } from "@/core/algorithms/activityCost";
import { journalImpactSteps, type JournalDay, type TagImpact } from "@/core/algorithms/journalImpact";
import { buildReport, periodBounds, reportPeriods } from "@/core/algorithms/reports";
import { activityKind } from "@/queries/common";
import { BATCH_DAYS, byteOrder, type Data, groupBy, type Progress, type Segment, sha } from "./data";
import {
  type Cached,
  dayOf,
  forecastOf,
  type Inputs,
  newFold,
  recordOutcomes,
  scoreEnergyBank,
  scoreFitness,
  scoreHealthMonitor,
  scoreHealthspan,
  scoreHrvStatus,
  scoreTraining,
  scorePlanner,
  scoreRecovery,
  scoreSleep,
  scoreStrainTarget,
  scoreStress,
  scoreTrainingLoad,
} from "./scores";
import { type JournalImpactRow, type PipelineOptions, SCORING_VERSION, STAGE2_COLUMNS, type Stage2Row } from "./types";
import { emptyScoreRow } from "./stage1";

export async function stage2(store: Store, data: Data, opts: PipelineOptions, onProgress?: Progress) {
  const { timeZone: tz } = opts;
  const { days } = data;
  const { inputs, journal, storedImpact, storedRows } = await readInputs(store, data);
  const stillHr = new Map<string, (number | null)[]>();
  const loadSeries = new Map<string, (number | null)[]>();
  Object.assign(inputs, { stillHr, loadSeries });

  const f = newFold();
  const out = new Map<string, Omit<Stage2Row, "journal_impact">>();
  // Stress and Energy Bank series go out in batches during the fold rather than all at the end, so memory
  // doesn't grow with history. They are idempotent upserts.
  let pending: { day: string; stress: (number | null)[]; energy: (number | null)[] | null }[] = [];
  const flush = async () => {
    const batch = pending;
    pending = [];
    for (const p of batch) {
      await putSeriesIfChanged(store, p.day, "stress", p.stress);
      // An empty series removes a stale Energy Bank curve (the web deleted the row).
      await putSeriesIfChanged(store, p.day, "energy_bank", p.energy ?? []);
    }
  };

  onProgress?.("stage2", 0, days.length);
  // Order matters: each scorer reads the fold as earlier scorers left it for today. The scorers are synchronous; the
  // loops here await slice() between days and between a day's scorers, so a run gives the JS thread back to the screen
  // every few milliseconds (src/lib/yield.ts). Nothing else touches the fold meanwhile, so the results don't change.
  for (let i = 0; i < days.length; i++) {
    await slice();
    const day = days[i];
    if (i % BATCH_DAYS === 0) {
      // The per-minute series the scorers read, a batch of days at a time: the scorers stay synchronous and memory
      // stays flat in history length.
      await flush();
      onProgress?.("stage2", i, days.length);
      const batch = days.slice(i, i + BATCH_DAYS);
      stillHr.clear();
      loadSeries.clear();
      for (const d of batch) {
        const [still, load] = await Promise.all([store.getSeries(d, "still_hr"), store.getSeries(d, "load")]);
        if (still) stillHr.set(d, still);
        if (load) loadSeries.set(d, load);
      }
    }
    const d = dayOf(data, inputs, day, opts);
    const sleep = scoreSleep(data, inputs, f, d, tz);
    const recovery = scoreRecovery(f, d, sleep);
    const trainingLoad = scoreTrainingLoad(f, d, recovery);
    const strainTarget = scoreStrainTarget(f, recovery);
    const planner = scorePlanner(f, d, sleep, tz);
    recovery.forecast = forecastOf(f, d, recovery, planner.plan, planner.tonightNeed);
    await slice();
    const stress = scoreStress(f, d, inputs);
    const energy = scoreEnergyBank(data, inputs, f, d, recovery, sleep, stress.minutes);
    pending.push({ day, stress: stress.series, energy: energy.curve });
    await slice();
    const hrvStatusRow = scoreHrvStatus(f, recovery);
    const training = scoreTraining(data, f, d, recovery, sleep, trainingLoad, stress.row, stress.minutes, hrvStatusRow, opts);
    const healthMonitor = scoreHealthMonitor(f, d, inputs, recovery);
    const healthspan = scoreHealthspan(data, f, d, sleep, opts, recovery);
    const fitness = scoreFitness(f, d, opts);
    recordOutcomes(f, d, recovery, sleep, trainingLoad);
    out.set(day, {
      recovery,
      sleep,
      training_load: trainingLoad,
      strain_target: strainTarget,
      sleep_planner: planner.row,
      energy_bank: energy.row,
      stress: stress.row,
      health_monitor: healthMonitor,
      healthspan,
      fitness,
      hrv_status: hrvStatusRow,
      training,
    });

    // Fold today's nightly values into the baselines (after scoring today).
    f.hrvB = update(f.hrvB, recovery.inputs.hrv, hrvCfg);
    f.hrvLnB = update(f.hrvLnB, lnHrv(recovery.inputs.hrv), recoveryHRVLnCfg);
    f.rhrB = update(f.rhrB, recovery.inputs.rhr, restingHRCfg);
    f.respB = update(f.respB, recovery.inputs.resp, respCfg);
    f.skinB = update(f.skinB, d.dm?.nightlyTempC ?? null, skinTempCfg);
    f.efforts.push(d.s1.effort);
    f.prevAcwr = trainingLoad.acwr;
  }
  await flush();
  onProgress?.("stage2", days.length, days.length);
  await putActivityCost(store, data, out);

  // ── Journal impact: as of each day, memoised on its inputs ────────────────
  onProgress?.("journal", 0, days.length);
  const entries: JournalDay[] = [...journal].map(([day, es]) => ({ day, tags: Object.fromEntries(es.map((e) => [e.tag, e.value])) }));
  const rows = new Map<string, Stage2Row>();
  const impactsAsOf = new Map<string, TagImpact[]>();
  for (let i = 0; i < days.length; i++) {
    await slice();
    const day = days[i];
    const from = addDays(day, -90);
    const inWindow = entries.filter((e) => e.day >= from && e.day < day);
    const outWindow = f.outcomes.filter((o) => o.day > from && o.day <= day);
    const key = sha(JSON.stringify([inWindow, outWindow]));
    const prior = storedImpact.get(day);
    const impacts = prior?.key === key ? prior.impacts : await sliced(journalImpactSteps(inWindow, outWindow, day));
    impactsAsOf.set(day, impacts);
    rows.set(day, { ...out.get(day)!, journal_impact: { key, impacts } });
    if (i % BATCH_DAYS === BATCH_DAYS - 1) onProgress?.("journal", i + 1, days.length);
  }
  onProgress?.("journal", days.length, days.length);

  // ── Writes ────────────────────────────────────────────────────────────────
  // Only rows whose version or JSON changed are written, so an unchanged run writes nothing.
  for (const day of days) {
    await slice();
    const row = rows.get(day)!;
    const prev = storedRows.get(day) ?? emptyScoreRow(day);
    const next: ScoreRow = { ...prev, day, scoringVersion: SCORING_VERSION };
    for (const k of STAGE2_COLUMNS) (next as Record<string, unknown>)[k] = row[k];
    if (prev.scoringVersion !== SCORING_VERSION || STAGE2_COLUMNS.some((k) => !sameJson(prev[k], next[k]))) await store.putScores(next);
  }
  const periods = reportPeriods(f.reportRows);
  const reportRows: ReportRow[] = [];
  for (const period of periods) {
    await slice();
    const { end } = periodBounds(period);
    const asOf = end < data.last ? end : data.last;
    reportRows.push({ period, data: buildReport(period, f.reportRows, impactsAsOf.get(asOf) ?? []) });
  }
  await store.putReports(reportRows);
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Mobile: Activity Cost over all history (activityCost.ts), each kind of workout (the screens' run, ride, walk, strength,
 * workout) against the day's Recovery; written only when it changed.
 */
async function putActivityCost(store: Store, data: Data, out: Map<string, Pick<Stage2Row, "recovery">>) {
  const recovery = new Map<string, number>();
  for (const [day, row] of out) if (row.recovery.value != null) recovery.set(day, row.recovery.value);
  const daysByKind = new Map<string, Set<string>>();
  for (const e of data.exercises) {
    const kind = activityKind(e.type);
    daysByKind.set(kind, (daysByKind.get(kind) ?? new Set()).add(e.day));
  }
  const next = activityCost(daysByKind, recovery);
  if (!sameJson(await store.getActivityCost(), next)) await store.putActivityCost(next);
}

/** Writes a per-minute series only when it differs from what is stored (an empty one when nothing should be). */
async function putSeriesIfChanged(store: Store, day: string, kind: SeriesKind, data: (number | null)[]) {
  const prev = await store.getSeries(day, kind);
  if (data.length ? prev && sameJson(prev, data) : !prev) return;
  await store.putSeries(day, kind, data);
}

/** Stage 1's cached rows, hypnograms, the journal and the stored journal impact. */
async function readInputs(store: Store, data: Data) {
  const [scored, segmentRows, entryRows] = await Promise.all([
    store.scoresIn({ from: data.first, to: data.last }),
    store.segmentsFor(data.sessions.map((s) => s.id)),
    store.allJournal(),
  ]);
  const segments = segmentRows.slice().sort((a, b) => a.startTs - b.startTs);
  // Tags in byte order, as SQLite sorted them: their order is part of journal impact's memo key.
  const entries = entryRows.slice().sort((a, b) => byteOrder(a.day, b.day) || byteOrder(a.tag, b.tag));
  const storedRows = new Map(scored.map((r) => [r.day, r]));
  const cached = new Map(
    scored.flatMap((r): [string, Cached][] =>
      r.strain
        ? [[r.day, { s1: r.strain, activities: r.activities ?? [], sessionRhr: r.sessionRhrBpm, recovery: r.recovery ?? null }]]
        : [],
    ),
  );
  const storedImpact = new Map(scored.map((r): [string, JournalImpactRow | null] => [r.day, r.journal_impact ?? null]));
  const journal = groupBy(entries, (e) => e.day);
  const inputs: Inputs = {
    cached,
    // Filled a batch of days at a time by stage2.
    stillHr: new Map(),
    loadSeries: new Map(),
    segments: groupBy(segments as Segment[], (s) => s.sessionId),
    tagOn: (day, tag) => (journal.get(day) ?? []).some((e) => e.tag === tag && e.value > 0),
  };
  return { inputs, journal, storedImpact, storedRows };
}
