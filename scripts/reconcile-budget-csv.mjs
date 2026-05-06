/**
 * Сверка выгрузки «Инициативы 2.0 по бюджету» (CSV) с данными из БД и генерация SQL для правки cost.
 *
 * Источник истины CSV: колонки Инициатива, Департамент, SUM из Q1–Q4 (итог cost+other по строке).
 * В БД сопоставление: initiative + unit + team. Департамент из CSV режется на unit/team:
 *   — если есть «.» → unit = до первой точки, team = остаток (как в типичном «IT.App & Web.Core»);
 *   — иначе первая «словообразная» часть до пробела = unit, остальное = team («IT Drinkit.Tech» → IT / Drinkit.Tech).
 *
 * Восстановление: для каждого квартала new_cost = truth_total − COALESCE(otherCosts,0), прочие поля квартала сохраняются.
 *
 * Запуск:
 *   node scripts/reconcile-budget-csv.mjs "/path/to/Данные.csv"
 *
 * Опционально — дифф с выгрузкой из Supabase (JSON массив строк):
 *   node scripts/reconcile-budget-csv.mjs "/path/to/Данные.csv" --db-json ./initiatives-export.json
 *
 * Выгрузку для --db-json: scripts/sql/budget_truth_export_initiatives_json.sql
 * Альтернатива без JSON: после *-truth-insert.sql выполните scripts/sql/budget_truth_apply_updates.sql в Supabase.
 *
 * Полная перезапись под CSV: залить *-truth-insert.sql, затем
 *   scripts/sql/budget_truth_full_replace_from_csv.sql (TRUNCATE разбивки + quarterly_data).
 *   Устаревший частичный вариант: budget_truth_sync_allocations.sql + budget_truth_sync_quarterly_from_allocations.sql.
 */

import fs from 'fs';
import path from 'path';

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

function parseMoney(s) {
  if (s == null || s === '') return 0;
  const cleaned = String(s).replace(/[\s\u00A0]/g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Департамент → unit / team (должно совпасть с initiatives.unit / team в БД). */
function splitDepartment(dep) {
  const d = dep.trim();
  if (!d) return { unit: '', team: '' };
  // Только «IT <без точки сразу>»: ловим IT Drinkit.Tech (не путать с Dodo Pizza.…, где первая точка — граница юнит/команда).
  if (d.startsWith('IT ') && !d.startsWith('IT .')) {
    const rest = d.slice(3).trim();
    return { unit: 'IT', team: rest };
  }
  const firstDot = d.indexOf('.');
  if (firstDot !== -1) {
    return { unit: d.slice(0, firstDot).trim(), team: d.slice(firstDot + 1).trim() };
  }
  const firstSpace = d.indexOf(' ');
  if (firstSpace !== -1) {
    return { unit: d.slice(0, firstSpace).trim(), team: d.slice(firstSpace + 1).trim() };
  }
  return { unit: d, team: '' };
}

// Keys in initiatives.quarterly_data; при смене бюджетного года обновите здесь и в budget_truth_reconcile.sql.
const QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'];

function rowKey(initiative, unit, team) {
  return `${initiative}\t${unit}\t${team}`;
}

/** Ключ строки CSV: одна строка = одна пара (инициатива, департамент как в файле). */
function rowKeyDept(initiative, budgetDepartment) {
  return `${initiative}\t${budgetDepartment}`;
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const csvPath = args.find((a) => !a.startsWith('--'));
  const dbJsonIdx = args.indexOf('--db-json');
  const dbJsonPath = dbJsonIdx >= 0 ? args[dbJsonIdx + 1] : null;

  if (!csvPath) {
    console.error('Usage: node scripts/reconcile-budget-csv.mjs <path-to-truth.csv> [--db-json initiatives-export.json]');
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    console.error('CSV empty');
    process.exit(1);
  }

  const headers = rows[0].map((h) => h.trim());
  const iniIdx = headers.findIndex((h) => /инициатива/i.test(h));
  const depIdx = headers.findIndex((h) => /департамент/i.test(h));
  const pnlIdx = headers.findIndex((h) => /pnl\s*it/i.test(h) || /есть\s+в\s+pnl\s+it/i.test(h));
  const qIdx = [1, 2, 3, 4].map((q) => {
    const j = headers.findIndex(
      (h) => /sum\s*из/i.test(h) && new RegExp(`Q${q}(\\b|[?])`, 'i').test(h)
    );
    return j;
  });

  if (iniIdx < 0 || depIdx < 0) {
    console.error('Headers must include Инициатива and Департамент', headers);
    process.exit(1);
  }

  const truthMap = new Map();
  const dupKeys = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const initiative = (cells[iniIdx] || '').trim();
    const dep = cells[depIdx] || '';
    const budgetDepartment = dep.trim();
    if (!initiative) continue;
    const { unit, team } = splitDepartment(dep);
    const key = rowKeyDept(initiative, budgetDepartment);
    const qv = qIdx.map((col, qi) => {
      const colIdx =
        col >= 0
          ? col
          : headers.findIndex((h) => new RegExp(`Q${qi + 1}`, 'i').test(h) && /sum|итог/i.test(h));
      return colIdx >= 0 ? parseMoney(cells[colIdx]) : 0;
    });
    if (truthMap.has(key)) dupKeys.push(key);
    truthMap.set(key, {
      initiative,
      unit,
      team,
      budget_department: budgetDepartment,
      department: budgetDepartment,
      q: qv,
      is_in_pnl_it: pnlIdx >= 0 ? /^(да|true|yes|1)$/i.test((cells[pnlIdx] || '').trim()) : true,
    });
  }

  const outDir = path.join(process.cwd(), 'scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const baseName = path.basename(csvPath, path.extname(csvPath));
  const reportPath = path.join(outDir, `${baseName}-reconcile-report.txt`);
  const sqlTruthPath = path.join(outDir, `${baseName}-truth-insert.sql`);
  const sqlDiffPath = path.join(outDir, `${baseName}-updates.sql`);

  let report = [];
  report.push(`Parsed rows: ${truthMap.size}`);
  report.push(`Duplicate keys in CSV (same initiative+department): ${dupKeys.length}`);
  if (dupKeys.length) report.push(dupKeys.slice(0, 20).join('\n'));
  const totalByQuarter = [0, 0, 0, 0];
  const pnlItByQuarter = [0, 0, 0, 0];
  for (const v of truthMap.values()) {
    for (let i = 0; i < 4; i++) {
      totalByQuarter[i] += v.q[i];
      if (v.is_in_pnl_it) pnlItByQuarter[i] += v.q[i];
    }
  }
  const totalAll = totalByQuarter.reduce((a, b) => a + b, 0);
  const totalPnlIt = pnlItByQuarter.reduce((a, b) => a + b, 0);
  report.push(`Total Q1..Q4: ${totalAll}`);
  report.push(`Total PnL IT Q1..Q4: ${totalPnlIt}`);

  // Одна строка CREATE — в SQL Editor часто ломали многострочный DDL, вставляя «;» после запятой (team text NOT NULL,;).
  const truthTableDdl = [
    `-- _budget_truth_csv: DDL одной строкой (избегаем опечатки «,;» между колонками).`,
    `DROP TABLE IF EXISTS public._budget_truth_csv;`,
    `CREATE TABLE public._budget_truth_csv (initiative text NOT NULL, budget_department text NOT NULL, unit text NOT NULL, team text NOT NULL, q1 bigint NOT NULL, q2 bigint NOT NULL, q3 bigint NOT NULL, q4 bigint NOT NULL, is_in_pnl_it boolean NOT NULL DEFAULT true, PRIMARY KEY (initiative, budget_department));`,
  ];

  const insertRows = [];
  for (const v of truthMap.values()) {
    const esc = (s) => String(s).replace(/'/g, "''");
    insertRows.push(
      `INSERT INTO public._budget_truth_csv (initiative, budget_department, unit, team, q1, q2, q3, q4, is_in_pnl_it) VALUES ('${esc(v.initiative)}','${esc(v.budget_department)}','${esc(v.unit)}','${esc(v.team)}',${v.q[0]},${v.q[1]},${v.q[2]},${v.q[3]},${v.is_in_pnl_it ? 'true' : 'false'});`
    );
  }

  const truthSqlText = `${truthTableDdl.join('\n')}\n${insertRows.join('\n')}`;
  fs.writeFileSync(sqlTruthPath, truthSqlText, 'utf8');
  report.push(`\nWrote: ${sqlTruthPath}`);

  const applyWithRulesPath = path.join(process.cwd(), 'scripts', 'sql', 'budget_2026_full_apply_from_truth_with_rules.sql');
  const ensureDodoPath = path.join(process.cwd(), 'scripts', 'sql', 'budget_2026_ensure_is_dodo_employee.sql');
  if (fs.existsSync(applyWithRulesPath)) {
    const applyWithRules = fs.readFileSync(applyWithRulesPath, 'utf8');
    const ensureDodo = fs.existsSync(ensureDodoPath)
      ? fs.readFileSync(ensureDodoPath, 'utf8')
      : '-- WARNING: missing scripts/sql/budget_2026_ensure_is_dodo_employee.sql\n';
    const ensureSplitTable = `CREATE TABLE IF NOT EXISTS public.initiative_budget_department_2026 (
  initiative_id uuid NOT NULL REFERENCES public.initiatives (id) ON DELETE CASCADE,
  budget_department text NOT NULL,
  q1 numeric NOT NULL DEFAULT 0,
  q2 numeric NOT NULL DEFAULT 0,
  q3 numeric NOT NULL DEFAULT 0,
  q4 numeric NOT NULL DEFAULT 0,
  is_in_pnl_it boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (initiative_id, budget_department)
);

CREATE INDEX IF NOT EXISTS idx_initiative_budget_dept_2026_initiative
  ON public.initiative_budget_department_2026 (initiative_id);

ALTER TABLE public.initiative_budget_department_2026
  ADD COLUMN IF NOT EXISTS is_in_pnl_it boolean NOT NULL DEFAULT true;

ALTER TABLE public.initiative_budget_department_2026
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.initiative_budget_department_2026
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.initiative_budget_department_2026 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated initiative_budget_department_2026"
  ON public.initiative_budget_department_2026;
DROP POLICY IF EXISTS "Dodo employees can view initiative_budget_department_2026"
  ON public.initiative_budget_department_2026;
DROP POLICY IF EXISTS "Dodo employees can insert initiative_budget_department_2026"
  ON public.initiative_budget_department_2026;
DROP POLICY IF EXISTS "Dodo employees can update initiative_budget_department_2026"
  ON public.initiative_budget_department_2026;
DROP POLICY IF EXISTS "Dodo employees can delete initiative_budget_department_2026"
  ON public.initiative_budget_department_2026;

CREATE POLICY "Dodo employees can view initiative_budget_department_2026"
  ON public.initiative_budget_department_2026 FOR SELECT TO authenticated
  USING (public.is_dodo_employee());

CREATE POLICY "Dodo employees can insert initiative_budget_department_2026"
  ON public.initiative_budget_department_2026 FOR INSERT TO authenticated
  WITH CHECK (public.is_dodo_employee());

CREATE POLICY "Dodo employees can update initiative_budget_department_2026"
  ON public.initiative_budget_department_2026 FOR UPDATE TO authenticated
  USING (public.is_dodo_employee());

CREATE POLICY "Dodo employees can delete initiative_budget_department_2026"
  ON public.initiative_budget_department_2026 FOR DELETE TO authenticated
  USING (public.is_dodo_employee());`;
    const onePastePath = path.join(outDir, `${baseName}-one-paste-with-rules.sql`);
    const onePasteHeader = [
      '-- =============================================================================',
      '-- ONE-PASTE SQL: full budget 2026 refresh with mapping rules',
      `-- Source CSV: ${csvPath}`,
      '-- Control totals from CSV:',
      `--   all rows Q1+Q2+Q3+Q4 = ${totalAll.toLocaleString('ru-RU')}`,
      `--   PnL IT rows only      = ${totalPnlIt.toLocaleString('ru-RU')}`,
      `-- Generated by: node scripts/reconcile-budget-csv.mjs`,
      '-- Supabase SQL Editor: run this entire file as postgres.',
      '-- =============================================================================',
      '',
    ].join('\n');
    const onePasteBody = `${onePasteHeader}${ensureDodo}\n\n-- 1) Таблица разбивки + RLS (нужна is_dodo_employee выше).\n${ensureSplitTable}\n\n-- 2) _budget_truth_csv из CSV.\n${truthSqlText}\n\n-- 3) Правила MAP/CREATE/… + полная перезапись split + quarterly_data.\n${applyWithRules}\n`;
    fs.writeFileSync(onePastePath, onePasteBody, 'utf8');
    report.push(`Wrote: ${onePastePath}`);
    const stableOnePastePath = path.join(outDir, 'BUDGET_2026_ONE_PASTE_READY.sql');
    fs.writeFileSync(stableOnePastePath, onePasteBody, 'utf8');
    report.push(`Wrote: ${stableOnePastePath} (копия с простым именем)`);
  }

  let updateSql = [];

  if (dbJsonPath && fs.existsSync(dbJsonPath)) {
    const dbRows = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
    if (!Array.isArray(dbRows)) {
      console.error('--db-json must be a JSON array');
      process.exit(1);
    }

    const dbByKey = new Map();
    for (const row of dbRows) {
      const initiative = (row.initiative || '').trim();
      const unit = (row.unit || '').trim();
      const team = (row.team || '').trim();
      const key = rowKey(initiative, unit, team);
      if (!dbByKey.has(key)) dbByKey.set(key, []);
      dbByKey.get(key).push(row);
    }

    const missingInDb = [];
    const missingInCsv = [];
    const matched = [];
    const ambiguous = [];

    for (const [, v] of truthMap) {
      const key = rowKey(v.initiative, v.unit, v.team);
      const rowsDb = dbByKey.get(key);
      if (!rowsDb?.length) missingInDb.push(v);
      else if (rowsDb.length > 1) ambiguous.push({ key, n: rowsDb.length });
      else matched.push({ truth: v, row: rowsDb[0] });
    }

    const csvHrkKeys = new Set(
      [...truthMap.values()].map((v) => rowKey(v.initiative, v.unit, v.team))
    );
    for (const key of dbByKey.keys()) {
      if (!csvHrkKeys.has(key)) missingInCsv.push(key);
    }

    report.push(`\n--- DB JSON ---`);
    report.push(`Matched: ${matched.length}`);
    report.push(`Truth rows missing in DB (check department split / typos): ${missingInDb.length}`);
    report.push(`DB rows missing in CSV: ${missingInCsv.length}`);
    report.push(`Ambiguous duplicate keys in DB: ${ambiguous.length}`);

    const escSql = (s) => String(s).replace(/'/g, "''");

    for (const { truth, row } of matched) {
      const qd = row.quarterly_data || {};
      let needs = false;
      const parts = [];
      for (let i = 0; i < 4; i++) {
        const qk = QUARTERS[i];
        const truthTotal = truth.q[i];
        const quarter = qd[qk] || {};
        const other = Number(quarter.otherCosts) || 0;
        const cost = Number(quarter.cost) || 0;
        const curTotal = cost + other;
        if (Math.abs(curTotal - truthTotal) > 1) needs = true;
        const newCost = Math.max(0, Math.round(truthTotal - other));
        parts.push({ qk, newCost, truthTotal, curTotal });
      }
      if (!needs) continue;

      let expr = 'quarterly_data';
      for (const { qk, newCost } of parts) {
        expr = `jsonb_set(
  ${expr},
  ARRAY['${qk}','cost'],
  to_jsonb(${newCost}::numeric),
  true
)`;
        expr = `jsonb_set(
  ${expr},
  ARRAY['${qk}','costFinanceConfirmed'],
  'true'::jsonb,
  true
)`;
      }

      updateSql.push(
        `UPDATE public.initiatives SET quarterly_data = ${expr}, updated_at = timezone('utc'::text, now()) WHERE id = '${row.id}'::uuid; -- ${escSql(truth.initiative)} / ${escSql(truth.unit)} / ${escSql(truth.team)} | ${escSql(truth.budget_department)}`
      );
    }

    if (missingInDb.length) {
      report.push('\n--- Sample missing in DB (first 15) ---');
      for (const v of missingInDb.slice(0, 15)) {
        report.push(`${v.initiative} | ${v.unit} | ${v.team} | dep=${v.department}`);
      }
    }

    fs.writeFileSync(sqlDiffPath, updateSql.join('\n\n'), 'utf8');
    report.push(`\nUPDATE statements: ${updateSql.length} → ${sqlDiffPath}`);
  } else {
    report.push('\n(No --db-json: only truth INSERT was generated. Export initiatives JSON and re-run.)');
  }

  report.push(
    '\n--- Полная перезапись БД под этот CSV (как в успешном прогоне с правилами MAP/…) ---\n' +
      `Один вставкой: scripts/out/${baseName}-one-paste-with-rules.sql\n` +
      'Или два шага: 1) этот *-truth-insert.sql, 2) scripts/sql/budget_2026_full_apply_from_truth_with_rules.sql\n' +
      'Без согласованных правил (только уникальные имена): scripts/sql/budget_truth_full_replace_from_csv.sql'
  );

  fs.writeFileSync(reportPath, report.join('\n'), 'utf8');
  console.log(report.join('\n'));
  console.log(`\nReport: ${reportPath}`);
}

main();
