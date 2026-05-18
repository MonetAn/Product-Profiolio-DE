#!/usr/bin/env node
/** Pre-backup + PnL scale COMMIT via psql (.env.local). */

import { readFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PSQL = process.env.PSQL || '/opt/homebrew/opt/libpq/bin/psql';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, '.env.local'));

function dbUrl() {
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.password = process.env.SUPABASE_DB_PASSWORD;
  return u.toString();
}

async function runSqlFile(relPath) {
  const file = join(ROOT, relPath);
  const { stdout, stderr } = await execFileP(PSQL, ['--dbname', dbUrl(), '-v', 'ON_ERROR_STOP=1', '-f', file], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return (stdout || '') + (stderr || '');
}

async function verify() {
  const q = `
SELECT json_build_object(
  'main_backup_split_rows', (SELECT count(*)::int FROM public._backup_split_20260518),
  'main_backup_sum_split', (SELECT round(sum(q1+q2+q3+q4))::bigint FROM public._backup_split_20260518),
  'pre_pnl_backup_rows', (SELECT count(*)::int FROM public._backup_split_pre_pnl_20260518),
  'anchor_pnl', (SELECT truth_pnl_it_rub FROM public.budget_portfolio_anchor_2026 WHERE id=1),
  'sum_split_pnl', (SELECT round(sum(b.q1+b.q2+b.q3+b.q4))::bigint
    FROM public.initiative_budget_department_2026 b
    JOIN public.initiatives i ON i.id=b.initiative_id AND i.deleted_at IS NULL WHERE b.is_in_pnl_it),
  'sum_split_all', (SELECT round(sum(b.q1+b.q2+b.q3+b.q4))::bigint
    FROM public.initiative_budget_department_2026 b
    JOIN public.initiatives i ON i.id=b.initiative_id AND i.deleted_at IS NULL),
  'sum_quarterly', (SELECT round(sum(
    COALESCE((quarterly_data #>> '{2026-Q1,cost}')::numeric,0)
    +COALESCE((quarterly_data #>> '{2026-Q2,cost}')::numeric,0)
    +COALESCE((quarterly_data #>> '{2026-Q3,cost}')::numeric,0)
    +COALESCE((quarterly_data #>> '{2026-Q4,cost}')::numeric,0)
  ))::bigint FROM public.initiatives WHERE deleted_at IS NULL)
);
`;
  const { stdout } = await execFileP(PSQL, ['--dbname', dbUrl(), '-t', '-A', '-c', q], { maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout.trim());
}

async function main() {
  console.log('1) Pre-PnL split backup…');
  console.log(await runSqlFile('scripts/sql/budget_2026_backup_split_pre_pnl_scale.sql'));

  console.log('2) PnL scale → anchor COMMIT…');
  console.log(await runSqlFile('scripts/sql/budget_2026_scale_pnl_split_to_anchor.sql'));

  const v = await verify();
  console.log('3) Verify:', JSON.stringify(v, null, 2));

  if (v.sum_split_pnl !== v.anchor_pnl) {
    console.error('FAIL: sum_split_pnl !== anchor_pnl');
    process.exit(1);
  }
  if (v.main_backup_split_rows !== 1121) {
    console.warn('WARN: main backup row count changed?', v.main_backup_split_rows);
  }
  console.log('OK');
}

main().catch((e) => {
  console.error(e.stderr || e.message || e);
  process.exit(1);
});
