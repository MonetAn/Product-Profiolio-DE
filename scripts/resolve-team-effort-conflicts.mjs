/**
 * Resolve conflict coefficients from people CSV.
 *
 * Strategy:
 * - Build conflict set where people values differ for unit+team+initiative+quarter.
 * - For each conflict row compute proposal_raw = sum(person_value) / people_count_in_team_quarter.
 *   (missing person rows are treated as 0 by division over full team-quarter people count)
 * - SQL applies conflict initiatives proportionally to residual:
 *     residual = 100 - existing_sum(team, quarter)
 *   so totals trend to 100 without touching already loaded non-conflict initiatives.
 *
 * Output:
 * - scripts/out/TEAM_EFFORT_2026_CONFLICT_PREVIEW.txt
 * - scripts/out/TEAM_EFFORT_2026_CONFLICT_PROPOSALS.csv
 * - scripts/out/TEAM_EFFORT_2026_CONFLICT_APPLY.sql
 * - scripts/out/TEAM_EFFORT_2026_VERIFY_SUM_100.sql
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
    console.error('Usage: node scripts/resolve-team-effort-conflicts.mjs <people-coefficients.csv>');
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

  if (unitIdx < 0 || teamIdx < 0 || initIdx < 0 || personIdx < 0) {
    console.error('CSV headers must include: Юнит, Команда, Инициатива, ФИО');
    process.exit(1);
  }

  const qIdx = Object.fromEntries(QUARTERS.map((q) => [q, headers.findIndex((h) => h.trim() === q)]));

  const valuesByGroup = new Map(); // key unit/team/init/quarter -> values[]
  const teamQuarterPeople = new Map(); // key unit/team/quarter -> Set(person)
  const conflictValueSum = new Map(); // key unit/team/init/quarter -> sum values

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const unit = normalizeName(cells[unitIdx]);
    const team = normalizeName(cells[teamIdx]);
    const initiative = normalizeName(cells[initIdx]);
    const person = normalizeName(cells[personIdx]);
    if (!unit || !team || !initiative || !person) continue;

    for (const q of QUARTERS) {
      const col = qIdx[q];
      if (col == null || col < 0) continue;
      const n = parseNumber(cells[col]);
      if (n == null) continue;
      const p = toPercent(n);
      if (p == null) continue;

      const tq = `${unit}\t${team}\t${q}`;
      if (!teamQuarterPeople.has(tq)) teamQuarterPeople.set(tq, new Set());
      teamQuarterPeople.get(tq).add(person);

      const gk = `${unit}\t${team}\t${initiative}\t${q}`;
      if (!valuesByGroup.has(gk)) valuesByGroup.set(gk, []);
      valuesByGroup.get(gk).push(Number(p.toFixed(6)));
    }
  }

  const conflictKeys = new Set();
  for (const [gk, vals] of valuesByGroup.entries()) {
    const uniq = [...new Set(vals.map((v) => Number(v.toFixed(6))))];
    if (uniq.length > 1) conflictKeys.add(gk);
  }

  // second pass for sums over conflict keys
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const unit = normalizeName(cells[unitIdx]);
    const team = normalizeName(cells[teamIdx]);
    const initiative = normalizeName(cells[initIdx]);
    const person = normalizeName(cells[personIdx]);
    if (!unit || !team || !initiative || !person) continue;

    for (const q of QUARTERS) {
      const col = qIdx[q];
      if (col == null || col < 0) continue;
      const n = parseNumber(cells[col]);
      if (n == null) continue;
      const p = toPercent(n);
      if (p == null) continue;

      const gk = `${unit}\t${team}\t${initiative}\t${q}`;
      if (!conflictKeys.has(gk)) continue;
      conflictValueSum.set(gk, (conflictValueSum.get(gk) || 0) + Number(p.toFixed(6)));
    }
  }

  const proposals = [];
  for (const gk of conflictKeys) {
    const [unit, team, initiative, quarter] = gk.split('\t');
    const tq = `${unit}\t${team}\t${quarter}`;
    const peopleCount = teamQuarterPeople.get(tq)?.size || 0;
    if (peopleCount <= 0) continue;
    const sum = conflictValueSum.get(gk) || 0;
    const raw = sum / peopleCount;
    if (raw <= 0) continue;
    proposals.push({ unit, team, initiative, quarter, proposalRaw: Number(raw.toFixed(6)), peopleCount });
  }

  proposals.sort(
    (a, b) =>
      a.unit.localeCompare(b.unit) ||
      a.team.localeCompare(b.team) ||
      a.quarter.localeCompare(b.quarter) ||
      a.initiative.localeCompare(b.initiative)
  );

  const outDir = path.join(process.cwd(), 'scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const previewPath = path.join(outDir, 'TEAM_EFFORT_2026_CONFLICT_PREVIEW.txt');
  const proposalsPath = path.join(outDir, 'TEAM_EFFORT_2026_CONFLICT_PROPOSALS.csv');
  const applySqlPath = path.join(outDir, 'TEAM_EFFORT_2026_CONFLICT_APPLY.sql');
  const verifySqlPath = path.join(outDir, 'TEAM_EFFORT_2026_VERIFY_SUM_100.sql');

  const proposalCsv = [
    ['unit', 'team', 'initiative', 'quarter', 'proposal_raw', 'people_count_in_team_quarter'].join(','),
    ...proposals.map((r) =>
      [r.unit, r.team, r.initiative, r.quarter, r.proposalRaw, r.peopleCount].map(escCsv).join(',')
    ),
  ].join('\n');
  fs.writeFileSync(proposalsPath, proposalCsv, 'utf8');

  const inserts = proposals.map(
    (r) =>
      `INSERT INTO public._team_effort_conflict_import_2026 (unit, team, initiative, quarter, proposal_raw) VALUES ('${escSql(r.unit)}','${escSql(r.team)}','${escSql(r.initiative)}','${escSql(r.quarter)}',${r.proposalRaw});`
  );

  const applySql = `-- Generated by scripts/resolve-team-effort-conflicts.mjs\n-- Strategy: conflict proposals are distributed to team-quarter residual (100 - existing_sum).\n\nDROP TABLE IF EXISTS public._team_effort_conflict_import_2026;\nCREATE TABLE public._team_effort_conflict_import_2026 (\n  unit text NOT NULL,\n  team text NOT NULL,\n  initiative text NOT NULL,\n  quarter text NOT NULL,\n  proposal_raw numeric NOT NULL\n);\n\n${inserts.join('\n')}\n\n-- Preview: matched proposal rows in initiatives\nSELECT count(*) AS matched_rows\nFROM public._team_effort_conflict_import_2026 p\nJOIN public.initiatives i\n  ON i.unit = p.unit AND i.team = p.team AND i.initiative = p.initiative;\n\n-- Preview: unmatched proposals\nSELECT p.*\nFROM public._team_effort_conflict_import_2026 p\nLEFT JOIN public.initiatives i\n  ON i.unit = p.unit AND i.team = p.team AND i.initiative = p.initiative\nWHERE i.id IS NULL\nORDER BY p.unit, p.team, p.quarter, p.initiative\nLIMIT 300;\n\n-- Preview: residuals by team-quarter BEFORE apply\nWITH scope AS (\n  SELECT DISTINCT p.unit, p.team, p.quarter\n  FROM public._team_effort_conflict_import_2026 p\n),\nexisting_sum AS (\n  SELECT\n    s.unit,\n    s.team,\n    s.quarter,\n    SUM(COALESCE(NULLIF(i.quarterly_data->s.quarter->>'effortCoefficient', '')::numeric, 0)) AS existing_sum\n  FROM scope s\n  JOIN public.initiatives i ON i.unit = s.unit AND i.team = s.team\n  GROUP BY s.unit, s.team, s.quarter\n),\nmatched_prop AS (\n  SELECT p.unit, p.team, p.quarter, SUM(p.proposal_raw) AS proposal_sum\n  FROM public._team_effort_conflict_import_2026 p\n  JOIN public.initiatives i
    ON i.unit = p.unit AND i.team = p.team AND i.initiative = p.initiative\n  GROUP BY p.unit, p.team, p.quarter\n)\nSELECT\n  e.unit, e.team, e.quarter,\n  e.existing_sum,\n  (100 - e.existing_sum) AS residual,\n  COALESCE(m.proposal_sum, 0) AS matched_proposal_sum\nFROM existing_sum e\nLEFT JOIN matched_prop m USING (unit, team, quarter)\nORDER BY e.unit, e.team, e.quarter;\n\nDO $$\nDECLARE\n  v_overwrite boolean := false; -- keep false by default
BEGIN
  WITH matched AS (
    SELECT
      p.unit,
      p.team,
      p.quarter,
      p.proposal_raw,
      i.id,
      COALESCE(NULLIF(i.quarterly_data->p.quarter->>'effortCoefficient', '')::numeric, 0) AS current_effort
    FROM public._team_effort_conflict_import_2026 p
    JOIN public.initiatives i
      ON i.unit = p.unit AND i.team = p.team AND i.initiative = p.initiative
  ),
  scope AS (
    SELECT DISTINCT unit, team, quarter FROM matched
  ),
  existing_sum AS (
    SELECT
      s.unit,
      s.team,
      s.quarter,
      SUM(COALESCE(NULLIF(i.quarterly_data->s.quarter->>'effortCoefficient', '')::numeric, 0)) AS existing_sum
    FROM scope s
    JOIN public.initiatives i ON i.unit = s.unit AND i.team = s.team
    GROUP BY s.unit, s.team, s.quarter
  ),
  proposal_sum AS (
    SELECT unit, team, quarter, SUM(proposal_raw) AS proposal_sum
    FROM matched
    GROUP BY unit, team, quarter
  ),
  calc AS (
    SELECT
      e.unit,
      e.team,
      e.quarter,
      e.existing_sum,
      (100 - e.existing_sum) AS residual,
      p.proposal_sum
    FROM existing_sum e
    JOIN proposal_sum p USING (unit, team, quarter)
  ),
  payload AS (
    SELECT
      m.id,
      m.unit,
      m.team,
      m.quarter,
      m.current_effort,
      CASE
        WHEN c.proposal_sum <= 0 THEN NULL
        WHEN c.residual <= 0 THEN NULL
        ELSE ROUND((m.proposal_raw / c.proposal_sum) * c.residual, 6)
      END AS new_effort
    FROM matched m
    JOIN calc c USING (unit, team, quarter)
  )
  UPDATE public.initiatives i
  SET
    quarterly_data = jsonb_set(
      COALESCE(i.quarterly_data, '{}'::jsonb),
      ARRAY[p.quarter, 'effortCoefficient'],
      to_jsonb(p.new_effort),
      true
    ),
    updated_at = timezone('utc'::text, now())
  FROM payload p
  WHERE i.id = p.id
    AND p.new_effort IS NOT NULL
    AND (v_overwrite OR p.current_effort = 0)
    AND i.quarterly_data IS DISTINCT FROM jsonb_set(
      COALESCE(i.quarterly_data, '{}'::jsonb),
      ARRAY[p.quarter, 'effortCoefficient'],
      to_jsonb(p.new_effort),
      true
    );
END $$;\n\n-- Post-check: team-quarter totals for affected teams\nWITH scope AS (\n  SELECT DISTINCT unit, team, quarter FROM public._team_effort_conflict_import_2026\n)\nSELECT\n  s.unit, s.team, s.quarter,\n  ROUND(SUM(COALESCE(NULLIF(i.quarterly_data->s.quarter->>'effortCoefficient', '')::numeric, 0)), 6) AS sum_effort\nFROM scope s\nJOIN public.initiatives i ON i.unit = s.unit AND i.team = s.team\nGROUP BY s.unit, s.team, s.quarter\nORDER BY s.unit, s.team, s.quarter;\n`;
  fs.writeFileSync(applySqlPath, applySql, 'utf8');

  const verifySql = `-- Verify 2026 team-quarter effort sums are 100
WITH q AS (
  SELECT unnest(ARRAY['2026-Q1','2026-Q2','2026-Q3','2026-Q4']) AS quarter
), sums AS (
  SELECT
    i.unit,
    i.team,
    q.quarter,
    ROUND(SUM(COALESCE(NULLIF(i.quarterly_data->q.quarter->>'effortCoefficient', '')::numeric, 0)), 6) AS sum_effort
  FROM public.initiatives i
  CROSS JOIN q
  GROUP BY i.unit, i.team, q.quarter
)
SELECT
  unit,
  team,
  quarter,
  sum_effort,
  ROUND(sum_effort - 100, 6) AS delta_from_100
FROM sums
WHERE ABS(sum_effort - 100) > 0.0001
ORDER BY ABS(sum_effort - 100) DESC, unit, team, quarter;
`;
  fs.writeFileSync(verifySqlPath, verifySql, 'utf8');

  const byTeamQuarter = new Map();
  for (const r of proposals) {
    const k = `${r.unit}\t${r.team}\t${r.quarter}`;
    byTeamQuarter.set(k, (byTeamQuarter.get(k) || 0) + r.proposalRaw);
  }

  let gt100 = 0;
  let near100 = 0;
  for (const v of byTeamQuarter.values()) {
    if (v > 100.0001) gt100 += 1;
    if (Math.abs(v - 100) <= 1) near100 += 1;
  }

  const report = [
    `CSV rows parsed (excluding header): ${rows.length - 1}`,
    `Conflict initiative-quarter groups: ${conflictKeys.size}`,
    `Conflict proposals generated (non-zero): ${proposals.length}`,
    `Team-quarter groups in proposals: ${byTeamQuarter.size}`,
    `Team-quarter proposal sums near 100 (+/-1): ${near100}`,
    `Team-quarter proposal sums > 100: ${gt100}`,
    '',
    `Preview: ${previewPath}`,
    `Proposals CSV: ${proposalsPath}`,
    `Conflict apply SQL: ${applySqlPath}`,
    `Verify sums SQL: ${verifySqlPath}`,
  ];
  fs.writeFileSync(previewPath, report.join('\n'), 'utf8');
  console.log(report.join('\n'));
}

main();
