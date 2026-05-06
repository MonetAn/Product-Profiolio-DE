/**
 * Импорт коэффициентов 2026 из CSV по людям -> в командные initiatives.quarterly_data[*].effortCoefficient.
 *
 * Алгоритм:
 * 1) Группируем по unit+team+initiative+quarter (только 2026-Q1..Q4)
 * 2) Если у всех людей одинаковое значение -> кандидат
 * 3) Если различается -> конфликт (пропускаем)
 * 4) Значения 0..1 конвертируем в 0..100
 * 5) Нули по умолчанию не переносим (skip)
 *
 * Выход:
 * - scripts/out/<base>-team-effort-2026-preview.txt
 * - scripts/out/<base>-team-effort-2026-conflicts.csv
 * - scripts/out/<base>-team-effort-2026-candidates.csv
 * - scripts/out/<base>-team-effort-2026-apply.sql
 *
 * Запуск:
 *   node scripts/import-team-effort-from-people-csv.mjs "/path/to/file.csv"
 */

import fs from 'fs';
import path from 'path';

const QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if (c === '\n' && !inQuotes) {
      row.push(field.trim());
      if (row.some((f) => f.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  row.push(field.trim());
  if (row.some((f) => f.length > 0)) rows.push(row);
  return rows;
}

function parseNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = s.replace(/[\s\u00A0]/g, '').replace(/,/g, '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeName(s) {
  return String(s || '')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function toPercent(v) {
  if (v == null) return null;
  // 0..1 -> 0..100, иначе считаем что уже проценты
  const scaled = v >= 0 && v <= 1 ? v * 100 : v;
  return Math.max(0, Math.min(100, scaled));
}

function escSql(s) {
  return String(s).replace(/'/g, "''");
}

function escCsv(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/import-team-effort-from-people-csv.mjs <people-coefficients.csv>');
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    console.error('CSV empty');
    process.exit(1);
  }

  const headers = rows[0].map((h) => h.trim());
  const unitIdx = headers.findIndex((h) => /^Юнит$/i.test(h));
  const teamIdx = headers.findIndex((h) => /^Команда$/i.test(h));
  const initIdx = headers.findIndex((h) => /^Инициатива$/i.test(h));
  const personIdx = headers.findIndex((h) => /^ФИО$/i.test(h));

  if (unitIdx < 0 || teamIdx < 0 || initIdx < 0) {
    console.error('CSV headers must include: Юнит, Команда, Инициатива');
    process.exit(1);
  }

  const qIdx = Object.fromEntries(
    QUARTERS.map((q) => [q, headers.findIndex((h) => h.trim() === q)])
  );

  const valuesByGroup = new Map();
  const peopleByGroup = new Map();

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const unit = normalizeName(cells[unitIdx]);
    const team = normalizeName(cells[teamIdx]);
    const initiative = normalizeName(cells[initIdx]);
    const person = personIdx >= 0 ? normalizeName(cells[personIdx]) : '';
    if (!unit || !team || !initiative) continue;

    for (const q of QUARTERS) {
      const col = qIdx[q];
      if (col == null || col < 0) continue;
      const n = parseNumber(cells[col]);
      if (n == null) continue;
      const p = toPercent(n);
      if (p == null) continue;
      const gk = `${unit}\t${team}\t${initiative}\t${q}`;
      if (!valuesByGroup.has(gk)) valuesByGroup.set(gk, []);
      valuesByGroup.get(gk).push(Number(p.toFixed(6)));
      if (!peopleByGroup.has(gk)) peopleByGroup.set(gk, []);
      peopleByGroup.get(gk).push(person || `row#${i + 1}`);
    }
  }

  const candidatesByInitiative = new Map();
  const conflicts = [];
  let uniformPairs = 0;
  let conflictPairs = 0;
  let zeroPairs = 0;

  for (const [gk, vals] of valuesByGroup.entries()) {
    const [unit, team, initiative, quarter] = gk.split('\t');
    const uniq = [...new Set(vals.map((v) => Number(v.toFixed(6))))].sort((a, b) => a - b);
    if (uniq.length > 1) {
      conflictPairs += 1;
      conflicts.push({
        unit,
        team,
        initiative,
        quarter,
        values: uniq,
        samplePeople: (peopleByGroup.get(gk) || []).slice(0, 10),
      });
      continue;
    }
    uniformPairs += 1;
    const value = uniq[0] ?? 0;
    if (Math.abs(value) <= 1e-9) {
      zeroPairs += 1;
      continue;
    }
    const ik = `${unit}\t${team}\t${initiative}`;
    if (!candidatesByInitiative.has(ik)) {
      candidatesByInitiative.set(ik, { unit, team, initiative, q: {} });
    }
    candidatesByInitiative.get(ik).q[quarter] = Number(value.toFixed(6));
  }

  const candidates = [...candidatesByInitiative.values()]
    .filter((r) => Object.keys(r.q).length > 0)
    .sort((a, b) =>
      a.unit.localeCompare(b.unit) ||
      a.team.localeCompare(b.team) ||
      a.initiative.localeCompare(b.initiative)
    );

  const outDir = path.join(process.cwd(), 'scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(csvPath, path.extname(csvPath));

  const previewPath = path.join(outDir, `${base}-team-effort-2026-preview.txt`);
  const conflictsPath = path.join(outDir, `${base}-team-effort-2026-conflicts.csv`);
  const candidatesPath = path.join(outDir, `${base}-team-effort-2026-candidates.csv`);
  const applySqlPath = path.join(outDir, `${base}-team-effort-2026-apply.sql`);

  const stablePreviewPath = path.join(outDir, 'TEAM_EFFORT_2026_PREVIEW.txt');
  const stableConflictsPath = path.join(outDir, 'TEAM_EFFORT_2026_CONFLICTS.csv');
  const stableCandidatesPath = path.join(outDir, 'TEAM_EFFORT_2026_CANDIDATES.csv');
  const stableApplySqlPath = path.join(outDir, 'TEAM_EFFORT_2026_APPLY.sql');

  const candidateLines = [
    ['unit', 'team', 'initiative', ...QUARTERS].join(','),
    ...candidates.map((r) =>
      [
        r.unit,
        r.team,
        r.initiative,
        ...QUARTERS.map((q) => (r.q[q] == null ? '' : r.q[q])),
      ]
        .map(escCsv)
        .join(',')
    ),
  ];
  fs.writeFileSync(candidatesPath, candidateLines.join('\n'), 'utf8');
  fs.writeFileSync(stableCandidatesPath, candidateLines.join('\n'), 'utf8');

  const conflictLines = [
    ['unit', 'team', 'initiative', 'quarter', 'values', 'sample_people'].join(','),
    ...conflicts.map((c) =>
      [c.unit, c.team, c.initiative, c.quarter, c.values.join('|'), c.samplePeople.join(' | ')]
        .map(escCsv)
        .join(',')
    ),
  ];
  fs.writeFileSync(conflictsPath, conflictLines.join('\n'), 'utf8');
  fs.writeFileSync(stableConflictsPath, conflictLines.join('\n'), 'utf8');

  const inserts = candidates.map((r) => {
    const q = (k) => (r.q[k] == null ? 'NULL' : String(r.q[k]));
    return `INSERT INTO public._team_effort_import_2026 (unit, team, initiative, q1, q2, q3, q4) VALUES ('${escSql(r.unit)}','${escSql(r.team)}','${escSql(r.initiative)}',${q('2026-Q1')},${q('2026-Q2')},${q('2026-Q3')},${q('2026-Q4')});`;
  });

  const applySql = `-- Generated by scripts/import-team-effort-from-people-csv.mjs\n-- Source: ${csvPath}\n-- Mode: fill_missing_only by default (v_overwrite := false)\n\nDROP TABLE IF EXISTS public._team_effort_import_2026;\nCREATE TABLE public._team_effort_import_2026 (\n  unit text NOT NULL,\n  team text NOT NULL,\n  initiative text NOT NULL,\n  q1 numeric NULL,\n  q2 numeric NULL,\n  q3 numeric NULL,\n  q4 numeric NULL\n);\n\n${inserts.join('\n')}\n\n-- Preview before apply: what will be matched\nSELECT count(*) AS matched_rows\nFROM public._team_effort_import_2026 s\nJOIN public.initiatives i\n  ON i.unit = s.unit AND i.team = s.team AND i.initiative = s.initiative;\n\n-- Preview: not matched by exact key (unit+team+initiative)\nSELECT s.*\nFROM public._team_effort_import_2026 s\nLEFT JOIN public.initiatives i\n  ON i.unit = s.unit AND i.team = s.team AND i.initiative = s.initiative\nWHERE i.id IS NULL\nORDER BY s.unit, s.team, s.initiative\nLIMIT 200;

-- Preview: fuzzy candidates for unmatched (normalize spaces and dash variants)
WITH src_norm AS (
  SELECT
    s.*,
    lower(regexp_replace(replace(replace(replace(s.unit, '–', '-'), '—', '-'), '−', '-'), '\s+', ' ', 'g')) AS unit_n,
    lower(regexp_replace(replace(replace(replace(s.team, '–', '-'), '—', '-'), '−', '-'), '\s+', ' ', 'g')) AS team_n,
    lower(regexp_replace(replace(replace(replace(s.initiative, '–', '-'), '—', '-'), '−', '-'), '\s+', ' ', 'g')) AS initiative_n
  FROM public._team_effort_import_2026 s
  LEFT JOIN public.initiatives i
    ON i.unit = s.unit AND i.team = s.team AND i.initiative = s.initiative
  WHERE i.id IS NULL
), db_norm AS (
  SELECT
    i.id,
    i.unit,
    i.team,
    i.initiative,
    lower(regexp_replace(replace(replace(replace(i.unit, '–', '-'), '—', '-'), '−', '-'), '\s+', ' ', 'g')) AS unit_n,
    lower(regexp_replace(replace(replace(replace(i.team, '–', '-'), '—', '-'), '−', '-'), '\s+', ' ', 'g')) AS team_n,
    lower(regexp_replace(replace(replace(replace(i.initiative, '–', '-'), '—', '-'), '−', '-'), '\s+', ' ', 'g')) AS initiative_n
  FROM public.initiatives i
)
SELECT
  s.unit,
  s.team,
  s.initiative,
  d.id AS matched_id,
  d.unit AS matched_unit,
  d.team AS matched_team,
  d.initiative AS matched_initiative
FROM src_norm s
JOIN db_norm d
  ON d.unit_n = s.unit_n
 AND d.team_n = s.team_n
 AND d.initiative_n = s.initiative_n
ORDER BY s.unit, s.team, s.initiative
LIMIT 200;

DO $$
DECLARE\n  v_overwrite boolean := false; -- true => overwrite existing effortCoefficient\n  r record;\n  v_new_q1 numeric;\n  v_new_q2 numeric;\n  v_new_q3 numeric;\n  v_new_q4 numeric;\n  v_old_q1 numeric;\n  v_old_q2 numeric;\n  v_old_q3 numeric;\n  v_old_q4 numeric;\n  v_qd jsonb;\nBEGIN\n  FOR r IN\n    SELECT i.id, i.quarterly_data, s.q1, s.q2, s.q3, s.q4\n    FROM public._team_effort_import_2026 s\n    JOIN public.initiatives i\n      ON i.unit = s.unit AND i.team = s.team AND i.initiative = s.initiative\n  LOOP\n    v_qd := COALESCE(r.quarterly_data, '{}'::jsonb);\n\n    BEGIN v_old_q1 := NULLIF(v_qd->'2026-Q1'->>'effortCoefficient', '')::numeric; EXCEPTION WHEN others THEN v_old_q1 := NULL; END;\n    BEGIN v_old_q2 := NULLIF(v_qd->'2026-Q2'->>'effortCoefficient', '')::numeric; EXCEPTION WHEN others THEN v_old_q2 := NULL; END;\n    BEGIN v_old_q3 := NULLIF(v_qd->'2026-Q3'->>'effortCoefficient', '')::numeric; EXCEPTION WHEN others THEN v_old_q3 := NULL; END;\n    BEGIN v_old_q4 := NULLIF(v_qd->'2026-Q4'->>'effortCoefficient', '')::numeric; EXCEPTION WHEN others THEN v_old_q4 := NULL; END;\n\n    v_new_q1 := r.q1;\n    v_new_q2 := r.q2;\n    v_new_q3 := r.q3;\n    v_new_q4 := r.q4;\n\n    IF v_new_q1 IS NOT NULL AND (v_overwrite OR COALESCE(v_old_q1, 0) = 0) THEN\n      v_qd := jsonb_set(v_qd, ARRAY['2026-Q1','effortCoefficient'], to_jsonb(v_new_q1), true);\n    END IF;\n    IF v_new_q2 IS NOT NULL AND (v_overwrite OR COALESCE(v_old_q2, 0) = 0) THEN\n      v_qd := jsonb_set(v_qd, ARRAY['2026-Q2','effortCoefficient'], to_jsonb(v_new_q2), true);\n    END IF;\n    IF v_new_q3 IS NOT NULL AND (v_overwrite OR COALESCE(v_old_q3, 0) = 0) THEN\n      v_qd := jsonb_set(v_qd, ARRAY['2026-Q3','effortCoefficient'], to_jsonb(v_new_q3), true);\n    END IF;\n    IF v_new_q4 IS NOT NULL AND (v_overwrite OR COALESCE(v_old_q4, 0) = 0) THEN\n      v_qd := jsonb_set(v_qd, ARRAY['2026-Q4','effortCoefficient'], to_jsonb(v_new_q4), true);\n    END IF;\n\n    UPDATE public.initiatives i\n    SET quarterly_data = v_qd,\n        updated_at = timezone('utc'::text, now())\n    WHERE i.id = r.id\n      AND i.quarterly_data IS DISTINCT FROM v_qd;\n  END LOOP;\nEND $$;\n\n-- Post-check sample\nSELECT unit, team, initiative,\n  quarterly_data->'2026-Q1'->>'effortCoefficient' AS q1_effort,\n  quarterly_data->'2026-Q2'->>'effortCoefficient' AS q2_effort,\n  quarterly_data->'2026-Q3'->>'effortCoefficient' AS q3_effort,\n  quarterly_data->'2026-Q4'->>'effortCoefficient' AS q4_effort\nFROM public.initiatives\nORDER BY updated_at DESC NULLS LAST\nLIMIT 200;\n`;
  fs.writeFileSync(applySqlPath, applySql, 'utf8');
  fs.writeFileSync(stableApplySqlPath, applySql, 'utf8');

  const report = [];
  report.push(`CSV rows parsed (excluding header): ${rows.length - 1}`);
  report.push(`Groups with data (initiative+quarter): ${valuesByGroup.size}`);
  report.push(`Uniform groups: ${uniformPairs}`);
  report.push(`Conflict groups: ${conflictPairs}`);
  report.push(`Uniform zero groups skipped: ${zeroPairs}`);
  report.push(`Candidate initiatives (with >=1 non-zero quarter): ${candidates.length}`);
  report.push('');
  report.push(`Preview report: ${previewPath}`);
  report.push(`Candidates CSV: ${candidatesPath}`);
  report.push(`Conflicts CSV: ${conflictsPath}`);
  report.push(`Apply SQL: ${applySqlPath}`);
  report.push('');
  report.push(`Stable preview: ${stablePreviewPath}`);
  report.push(`Stable candidates CSV: ${stableCandidatesPath}`);
  report.push(`Stable conflicts CSV: ${stableConflictsPath}`);
  report.push(`Stable apply SQL: ${stableApplySqlPath}`);

  fs.writeFileSync(previewPath, report.join('\n'), 'utf8');
  fs.writeFileSync(stablePreviewPath, report.join('\n'), 'utf8');
  console.log(report.join('\n'));
}

main();
