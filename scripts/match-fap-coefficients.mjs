#!/usr/bin/env node
/**
 * Матчит результаты parse-fap-coefficients.mjs к БД и показывает:
 *   - совпавшие инициативы (с текущим состоянием — cost, effortCoefficient);
 *   - не совпавшие по имени инициативы;
 *   - инициативы, у которых по новому CSV есть ненулевой коэффициент 2026, но в БД cost=0
 *     (значит, мы их ранее зря обнулили в ghost-cleanup);
 *   - инициативы, у которых cost>0 в БД, но по CSV все коэффициенты 0 (могут быть кандидаты в ghost).
 *
 * Использование: node scripts/match-fap-coefficients.mjs scripts/out/fap_coefficients.tsv
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const norm = (s) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const tsvPath = process.argv[2];
if (!tsvPath) { console.error('Usage: node scripts/match-fap-coefficients.mjs <fap-coefficients.tsv>'); process.exit(1); }

const tsv = fs.readFileSync(tsvPath, 'utf8').trim().split('\n');
tsv.shift(); // header
const fapInits = tsv.map((line) => {
  const [team, initiative, q1, q2, q3, q4] = line.split('\t');
  return { csv_team: team, initiative, q1: +q1, q2: +q2, q3: +q3, q4: +q4 };
});

// --- DB ---
const env = { ...process.env };
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in env)) env[key] = val;
  }
}
const psql = process.env.PSQL || '/opt/homebrew/opt/libpq/bin/psql';
const sql = `
SELECT i.id, i.unit, i.team, i.initiative, COALESCE(i.is_timeline_stub,false) AS stub,
       ROUND(COALESCE((i.quarterly_data->'2026-Q1'->>'cost')::numeric,0)
            +COALESCE((i.quarterly_data->'2026-Q2'->>'cost')::numeric,0)
            +COALESCE((i.quarterly_data->'2026-Q3'->>'cost')::numeric,0)
            +COALESCE((i.quarterly_data->'2026-Q4'->>'cost')::numeric,0))::bigint AS y26_cost,
       COALESCE((i.quarterly_data->'2026-Q1'->>'effortCoefficient')::numeric,0)::int AS db_q1,
       COALESCE((i.quarterly_data->'2026-Q2'->>'effortCoefficient')::numeric,0)::int AS db_q2,
       COALESCE((i.quarterly_data->'2026-Q3'->>'effortCoefficient')::numeric,0)::int AS db_q3,
       COALESCE((i.quarterly_data->'2026-Q4'->>'effortCoefficient')::numeric,0)::int AS db_q4
FROM public.initiatives i
WHERE i.unit='FAP'
ORDER BY i.team, i.initiative;
`;

const out = execFileSync(psql, ['-At', '-F', '\t', env.SUPABASE_DB_URL, '-c', sql], {
  env: { ...env, PGPASSWORD: env.SUPABASE_DB_PASSWORD }, encoding: 'utf8',
});

// Group by initiative name (case-insensitive trim).
const dbByName = new Map();
for (const line of out.split('\n').filter(Boolean)) {
  const [id, unit, team, initiative, stub, cost, q1, q2, q3, q4] = line.split('\t');
  const key = norm(initiative);
  const arr = dbByName.get(key) ?? [];
  arr.push({ id, unit, team, initiative, stub: stub === 't', cost: +cost, db_q1: +q1, db_q2: +q2, db_q3: +q3, db_q4: +q4 });
  dbByName.set(key, arr);
}

const matches = [], unmatched = [], wronglyKilled = [], maybeGhost = [];
for (const r of fapInits) {
  const sumCsv = r.q1 + r.q2 + r.q3 + r.q4;
  const candidates = (dbByName.get(norm(r.initiative)) ?? []).filter((d) => !d.stub);
  if (candidates.length === 0) {
    unmatched.push(r);
    continue;
  }
  // если несколько — берём первый non-stub
  const db = candidates[0];
  matches.push({ ...r, db });
  if (sumCsv > 0 && db.cost === 0) wronglyKilled.push({ ...r, db });
  if (sumCsv === 0 && db.cost > 0) maybeGhost.push({ ...r, db });
}

console.error(`[match] FAP инициатив в CSV: ${fapInits.length}`);
console.error(`[match] совпало по имени: ${matches.length}`);
console.error(`[match] НЕ совпало по имени: ${unmatched.length}`);
console.error(`[match] cost=0 в БД, но в CSV есть коэф (зря обнулили): ${wronglyKilled.length}`);
console.error(`[match] cost>0 в БД, но в CSV все 0 (кандидат в ghost): ${maybeGhost.length}`);

const lines = [['where','csv_team','initiative','csv_q1','csv_q2','csv_q3','csv_q4','db_unit','db_team','db_cost_y26','db_q1','db_q2','db_q3','db_q4','db_id'].join('\t')];

for (const r of matches) {
  lines.push(['MATCH', r.csv_team, r.initiative, r.q1, r.q2, r.q3, r.q4, r.db.unit, r.db.team, r.db.cost, r.db.db_q1, r.db.db_q2, r.db.db_q3, r.db.db_q4, r.db.id].join('\t'));
}
for (const r of unmatched) {
  lines.push(['UNMATCH', r.csv_team, r.initiative, r.q1, r.q2, r.q3, r.q4, '', '', '', '', '', '', '', ''].join('\t'));
}

console.log(lines.join('\n'));

if (wronglyKilled.length > 0) {
  console.error(`\n=== "ЗРЯ ОБНУЛЕНЫ" (cost=0 в БД, но коэффициенты есть в CSV) ===`);
  for (const r of wronglyKilled) {
    console.error(`  ${r.db.team} :: ${r.initiative} :: csv ${r.q1}/${r.q2}/${r.q3}/${r.q4}`);
  }
}

if (unmatched.length > 0) {
  console.error(`\n=== НЕ СОВПАЛИ ПО ИМЕНИ (нет в DB FAP) ===`);
  for (const r of unmatched) {
    console.error(`  [${r.csv_team}] "${r.initiative}" csv ${r.q1}/${r.q2}/${r.q3}/${r.q4}`);
  }
}

if (maybeGhost.length > 0) {
  console.error(`\n=== "ВОЗМОЖНО GHOST" (cost>0 в БД, но в CSV все коэф=0) ===`);
  for (const r of maybeGhost) {
    console.error(`  ${r.db.team} :: ${r.initiative} :: db_cost=${r.db.cost} csv 0/0/0/0`);
  }
}
