#!/usr/bin/env node
/**
 * Локальная симуляция: delete vs Quick Flow vs preview UI.
 * node scripts/investigate-team-total-drift.mjs [unit] [team]
 */
import { execSync } from 'node:child_process';

const unit = process.argv[2] ?? 'App&Web';
const team = process.argv[3] ?? 'Site';
const conn = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const Q2026 = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'];

function psqlJson(sql) {
  const out = execSync(`psql "${conn}" -t -A -c ${JSON.stringify(sql)}`, { encoding: 'utf8' }).trim();
  if (!out) return null;
  return JSON.parse(out);
}

function teamQuarterCostSum(rows, q) {
  return rows.reduce((s, r) => {
    const qd = r.quarterlyData[q] ?? {};
    return s + (Number(qd.cost) || 0) + (Number(qd.otherCosts) || 0);
  }, 0);
}

function teamYearSum(rows) {
  return Q2026.reduce((s, q) => s + teamQuarterCostSum(rows, q), 0);
}

function baselineTq(baseline, q) {
  const map = { '2026-Q1': baseline.q1, '2026-Q2': baseline.q2, '2026-Q3': baseline.q3, '2026-Q4': baseline.q4 };
  return map[q] ?? 0;
}

function buildQuarterlyCostsForTeam(teamRows, previewQuarters, options = {}) {
  const out = new Map();
  for (const r of teamRows) out.set(r.id, structuredClone(r.quarterlyData));
  const stubIds = teamRows.filter((r) => r.isTimelineStub).map((r) => r.id);

  const resolveTq = (q) => {
    if (options.baseline) {
      const bt = baselineTq(options.baseline, q);
      if (bt > 0) return bt;
    }
    const fixed = options.fixedTqByQuarter?.get(q);
    if (fixed !== undefined && fixed > 0) return fixed;
    return teamQuarterCostSum(teamRows, q);
  };

  const anchored = Boolean(options.baseline) || Boolean(options.fixedTqByQuarter);

  for (const q of previewQuarters) {
    const Tq = resolveTq(q);
    if (Tq <= 0) continue;
    const colEff = teamRows
      .filter((r) => !r.isTimelineStub)
      .reduce((s, r) => s + Math.min(100, Math.max(0, Number(r.quarterlyData[q]?.effortCoefficient) || 0)), 0);
    if (!anchored && colEff > 100.0001) continue;

    let nonStubSum = 0;
    for (const r of teamRows) {
      if (r.isTimelineStub) continue;
      const eff = Math.min(100, Math.max(0, Number(r.quarterlyData[q]?.effortCoefficient) || 0));
      const share = Math.max(0, Math.round((eff / 100) * Tq));
      const cur = out.get(r.id)[q] ?? {};
      const other = Number(cur.otherCosts) || 0;
      const cost = Math.max(0, share - other);
      out.get(r.id)[q] = { ...cur, cost };
      nonStubSum += cost + other;
    }
    const stubResidual = Math.max(0, Tq - nonStubSum);
    if (stubIds.length > 0) {
      const stubId = stubIds[0];
      const cur = out.get(stubId)[q] ?? {};
      const other = Number(cur.otherCosts) || 0;
      out.get(stubId)[q] = { ...cur, cost: Math.max(0, stubResidual - other), effortCoefficient: 0 };
    }
  }
  return out;
}

function frozenTeamQuarterTotals(rows, quarters) {
  const m = new Map();
  for (const q of quarters) m.set(q, teamQuarterCostSum(rows, q));
  return m;
}

function resolveTeamYearTarget(baseline, frozenTqByQuarter) {
  if (baseline && baseline.rubAll > 0) return Math.round(baseline.rubAll);
  if (frozenTqByQuarter) {
    let s = 0;
    for (const q of Q2026) s += frozenTqByQuarter.get(q) ?? 0;
    if (s > 0) return Math.round(s);
  }
  return 0;
}

const baselineRow = psqlJson(
  `SELECT row_to_json(t) FROM (SELECT unit, team, q1::float, q2::float, q3::float, q4::float, rub_all::float AS "rubAll", rub_pnl_it::float AS "rubPnlIt" FROM team_budget_baseline_2026 WHERE unit = '${unit.replace(/'/g, "''")}' AND team = '${team.replace(/'/g, "''")}') t`
);
const baseline = baselineRow
  ? {
      ...baselineRow,
      q1: Number(baselineRow.q1),
      q2: Number(baselineRow.q2),
      q3: Number(baselineRow.q3),
      q4: Number(baselineRow.q4),
      rubAll: Number(baselineRow.rubAll),
      rubPnlIt: Number(baselineRow.rubPnlIt),
    }
  : null;

const initRows = psqlJson(
  `SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT id, initiative, is_timeline_stub AS "isTimelineStub", quarterly_data AS "quarterlyData" FROM initiatives WHERE deleted_at IS NULL AND unit = '${unit.replace(/'/g, "''")}' AND team = '${team.replace(/'/g, "''")}') t`
) ?? [];

const teamRows = initRows.map((r) => ({
  id: r.id,
  initiative: r.initiative,
  isTimelineStub: Boolean(r.isTimelineStub),
  quarterlyData: r.quarterlyData ?? {},
}));

const liveYear = teamYearSum(teamRows);
const frozen = frozenTeamQuarterTotals(teamRows, Q2026);
const yearTarget = resolveTeamYearTarget(baseline, frozen);

console.log(`\n=== ${unit} / ${team} ===`);
console.log(`Live year total:          ${liveYear.toLocaleString('ru-RU')} ₽`);
console.log(`Baseline rub_all:         ${baseline?.rubAll?.toLocaleString('ru-RU') ?? 'нет'} ₽`);
console.log(`resolveTeamYearTarget:    ${yearTarget.toLocaleString('ru-RU')} ₽ (используется applyTeamYearDust при delete)`);
console.log(`Gap live − baseline:      ${(liveYear - (baseline?.rubAll ?? 0)).toLocaleString('ru-RU')} ₽`);

const nonStub = teamRows.filter((r) => !r.isTimelineStub);
if (nonStub.length === 0) {
  console.log('\nНет инициатив для симуляции delete.');
  process.exit(0);
}

const victim = nonStub.find((r) => !r.initiative.startsWith('Не распределено')) ?? nonStub[0];
const afterDelete = teamRows.filter((r) => r.id !== victim.id);
const frozenBeforeDelete = frozenTeamQuarterTotals(teamRows, Q2026);

const dbBuilt = buildQuarterlyCostsForTeam(afterDelete, Q2026, { baseline, fixedTqByQuarter: frozenBeforeDelete });
const dbTotal = teamYearSum(afterDelete.map((r) => ({ ...r, quarterlyData: dbBuilt.get(r.id) })));

const previewBuilt = buildQuarterlyCostsForTeam(afterDelete, Q2026, { baseline: null, fixedTqByQuarter: frozenBeforeDelete });
const previewTotal = teamYearSum(afterDelete.map((r) => ({ ...r, quarterlyData: previewBuilt.get(r.id) })));

const qfBuilt = buildQuarterlyCostsForTeam(teamRows, Q2026, { fixedTqByQuarter: frozen });
const qfTotal = teamYearSum(teamRows.map((r) => ({ ...r, quarterlyData: qfBuilt.get(r.id) })));

console.log(`\n--- Симуляция удаления «${victim.initiative.slice(0, 50)}» ---`);
console.log(`До delete:               ${liveYear.toLocaleString('ru-RU')} ₽`);
console.log(`Preview UI (Hub):        ${previewTotal.toLocaleString('ru-RU')} ₽  Δ ${previewTotal - liveYear}`);
console.log(`DB delete (baseline):    ${dbTotal.toLocaleString('ru-RU')} ₽  Δ ${dbTotal - liveYear}  ← должен быть 0`);
console.log(`Quick Flow redistribute: ${qfTotal.toLocaleString('ru-RU')} ₽  Δ ${qfTotal - liveYear}`);

for (const q of Q2026) {
  const colEff = teamRows
    .filter((r) => !r.isTimelineStub)
    .reduce((s, r) => s + Math.min(100, Math.max(0, Number(r.quarterlyData[q]?.effortCoefficient) || 0)), 0);
  if (colEff > 100.0001) {
    console.log(`\n⚠ ${q}: Σeffort = ${colEff.toFixed(1)}% > 100%`);
  }
}
