#!/usr/bin/env node
/**
 * Парсит «портфельные карточки» команд (как FAP Portfolio 2025-2026 - {Team}.csv) и
 * вытаскивает из них коэффициенты эффорта 2026-Q1..Q4 по каждой инициативе.
 *
 * Формат строк CSV таков, что каждая инициатива описана несколькими строками подряд,
 * 4-я колонка содержит «свойство». Нужная нам строка — где col[3] = 'Доля времени команды'.
 *   col[0] — название инициативы
 *   col[2] — название команды (НЕ используется — матчим по имени инициативы)
 *   col[8..11] — коэффициенты 2026-Q1..Q4 в виде «0,25» / «0.25» / пусто
 *
 * Использование:
 *   node scripts/parse-fap-coefficients.mjs <csv1> <csv2> ... > scripts/out/fap_coefficients.tsv
 *
 * Output (TSV):
 *   csv_team \t initiative \t q1_2026 \t q2_2026 \t q3_2026 \t q4_2026
 * Коэффициенты в процентах (0..100), целые.
 */
import fs from 'node:fs';

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
      rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function parseRu(s) {
  const v = String(s ?? '').trim().replace(',', '.');
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/parse-fap-coefficients.mjs <csv...>');
  process.exit(1);
}

const out = [];
const stats = { files: 0, totalShareRows: 0, uniqueInits: new Set() };

for (const file of files) {
  stats.files += 1;
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  for (const row of rows) {
    if (row.length < 12) continue;
    const property = (row[3] ?? '').trim();
    if (property !== 'Доля времени команды') continue;
    const initiative = (row[0] ?? '').trim();
    const team = (row[2] ?? '').trim();
    if (!initiative) continue;
    // 2026 = колонки 8,9,10,11
    const q1 = parseRu(row[8]);
    const q2 = parseRu(row[9]);
    const q3 = parseRu(row[10]);
    const q4 = parseRu(row[11]);
    const pct = (x) => Math.round(x * 100);
    stats.totalShareRows += 1;
    stats.uniqueInits.add(initiative.toLowerCase());
    out.push({ team, initiative, q1: pct(q1), q2: pct(q2), q3: pct(q3), q4: pct(q4) });
  }
}

console.error(`[fap] файлов: ${stats.files}, строк "Доля времени команды": ${stats.totalShareRows}, уникальных инициатив: ${stats.uniqueInits.size}`);

console.log('csv_team\tinitiative\tq1_2026\tq2_2026\tq3_2026\tq4_2026');
out.sort((a, b) => a.team.localeCompare(b.team, 'ru') || a.initiative.localeCompare(b.initiative, 'ru'));
for (const r of out) {
  console.log([r.team, r.initiative, r.q1, r.q2, r.q3, r.q4].join('\t'));
}
