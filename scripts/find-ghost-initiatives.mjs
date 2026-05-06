#!/usr/bin/env node
/**
 * Ищет инициативы, у которых в БД 2026 cost > 0, но в CSV коэффициентов
 * либо вообще нет строки, либо все коэффициенты у всех людей по 4-м кварталам = 0.
 *
 * Это и есть «менеджмент-ghost'ы»: им в CSV бюджета приписана управленческая аллокация,
 * но реально никто из людей в команде не работает по ним в 2026.
 *
 * Использование:
 *   node scripts/find-ghost-initiatives.mjs "<path-to-coefficients.csv>" [> scripts/out/ghosts_2026.csv]
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') {
      if (inQuotes && t[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) { row.push(field); field = ''; }
    else if (c === '\n' && !inQuotes) {
      row.push(field);
      if (row.some(x => x.length > 0)) rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some(x => x.length > 0)) rows.push(row);
  return rows;
}

function parseRu(s) {
  if (!s) return 0;
  const v = String(s).trim().replace(',', '.');
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const norm = (s) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const coeffPath = process.argv[2];
if (!coeffPath) {
  console.error('Usage: node scripts/find-ghost-initiatives.mjs <path-to-coefficients.csv>');
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(coeffPath, 'utf8'));
const header = rows[0].map(h => h.trim());
const idx = (key) => header.findIndex(h => h.toLowerCase().includes(key));
const iUnit = idx('юнит');
const iTeam = idx('команда');
const iIni  = idx('инициатив');
const iName = idx('фио');
const iQ = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'].map(k => header.findIndex(h => h.includes(k)));

if (iUnit < 0 || iTeam < 0 || iIni < 0 || iQ.some(j => j < 0)) {
  console.error('Не нашёл нужных колонок в CSV. Header:', header);
  process.exit(1);
}

/** map: ключ "юнит\u0000команда\u0000инициатива" → { anyNonzero: bool, totalRecords: number } */
const live = new Map();

for (let r = 1; r < rows.length; r++) {
  const cells = rows[r];
  if (!cells || cells.length < 4) continue;
  const unit = cells[iUnit] ?? '';
  const team = cells[iTeam] ?? '';
  const ini  = cells[iIni] ?? '';
  if (!ini.trim()) continue;
  const sum = iQ.reduce((s, j) => s + parseRu(cells[j]), 0);
  // ключ матчинга: только инициатива (уникальная) + дополнительно по unit+team если возможно
  const keyByName = norm(ini);
  const cur = live.get(keyByName) ?? { anyNonzero: false, totalRecords: 0 };
  cur.totalRecords += 1;
  if (sum > 0) cur.anyNonzero = true;
  live.set(keyByName, cur);
}

console.error(`[ghost] CSV коэффициентов: ${rows.length - 1} строк, уникальных инициатив (по имени): ${live.size}`);

// Берём из БД список НЕ-stub инициатив с y2026_cost > 0.
const psqlPath = process.env.PSQL || '/opt/homebrew/opt/libpq/bin/psql';
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
const dbUrl = env.SUPABASE_DB_URL;
const pwd = env.SUPABASE_DB_PASSWORD;
if (!dbUrl || !pwd) { console.error('Нет SUPABASE_DB_URL/PASSWORD в .env.local'); process.exit(2); }

const sql = `
SELECT i.id, i.unit, i.team, i.initiative,
       ROUND(SUM(b.q1+b.q2+b.q3+b.q4))::bigint AS y2026_cost,
       string_agg(DISTINCT b.budget_department, ' | ' ORDER BY b.budget_department) AS depts
FROM public.initiatives i
LEFT JOIN public.initiative_budget_department_2026 b ON b.initiative_id=i.id
WHERE COALESCE(i.is_timeline_stub,false)=false
GROUP BY i.id, i.unit, i.team, i.initiative
HAVING SUM(b.q1+b.q2+b.q3+b.q4) > 0
ORDER BY i.unit, i.team, i.initiative;
`;

const out = execFileSync(psqlPath, ['-At', '-F', '\t', dbUrl, '-c', sql], {
  env: { ...env, PGPASSWORD: pwd },
  encoding: 'utf8',
});

let totalDb = 0, ghosts = 0, ghostMoney = 0;
const ghostByUnit = new Map();
const lines = out.split('\n').filter(Boolean);
const ghostsList = [];

for (const line of lines) {
  const [id, unit, team, ini, costStr, depts] = line.split('\t');
  totalDb += 1;
  const key = norm(ini);
  const csvEntry = live.get(key);
  const isGhost = !csvEntry || !csvEntry.anyNonzero;
  if (isGhost) {
    ghosts += 1;
    const cost = Number(costStr);
    ghostMoney += cost;
    ghostByUnit.set(unit, (ghostByUnit.get(unit) ?? 0) + cost);
    ghostsList.push({ id, unit, team, ini, cost, depts: depts || '', csvPresent: !!csvEntry, csvRecords: csvEntry?.totalRecords ?? 0 });
  }
}

console.error(`[ghost] всего инициатив с cost>0 в БД: ${totalDb}, ghost-кандидатов: ${ghosts}, общая ghost-money: ${ghostMoney.toLocaleString('ru-RU')} ₽`);
for (const [u, m] of [...ghostByUnit.entries()].sort()) {
  console.error(`[ghost]   ${u}: ${m.toLocaleString('ru-RU')} ₽`);
}

const csvHeader = 'unit\tteam\tinitiative\ty2026_cost\tcsv_present\tcsv_records\tdepts\tinitiative_id';
console.log(csvHeader);
ghostsList.sort((a, b) =>
  a.unit.localeCompare(b.unit, 'ru') ||
  a.team.localeCompare(b.team, 'ru') ||
  (b.cost - a.cost) ||
  a.ini.localeCompare(b.ini, 'ru'),
);
for (const g of ghostsList) {
  console.log([g.unit, g.team, g.ini, g.cost, g.csvPresent ? 'yes' : 'no', g.csvRecords, g.depts, g.id].join('\t'));
}
