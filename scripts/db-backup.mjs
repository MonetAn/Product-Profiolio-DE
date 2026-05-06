#!/usr/bin/env node
// Регулярный бэкап Supabase Postgres через pg_dump.
//
// Делает три файла на запуск:
//   backups/<stamp>/<stamp>.schema.sql   — pg_dump --schema-only
//   backups/<stamp>/<stamp>.data.sql     — pg_dump --data-only --column-inserts
//   backups/<stamp>/<stamp>.roles.sql    — pg_dumpall --roles-only (если задан DIRECT URL)
//
// Дополнительно:
//   backups/.log              — append-only журнал с результатом каждого запуска
//   backups/latest -> <stamp> — symlink на последний успешный бэкап
//
// Ротация: оставляет KEEP_LAST последних успешных бэкапов, остальные удаляет.
//
// Источники конфигурации (по приоритету):
//   1) .env.local
//   2) .env
//   3) переменные окружения процесса
//
// Обязательные переменные:
//   SUPABASE_DB_URL           — connection string без пароля или с паролем
//   SUPABASE_DB_PASSWORD      — пароль БД (Dashboard → Project Settings → Database)
// Опционально:
//   SUPABASE_DB_DIRECT_URL    — direct connection для pg_dumpall --roles-only
//   BACKUPS_DIR               — куда складывать (по умолчанию ./backups)
//   BACKUPS_KEEP_LAST         — сколько хранить (по умолчанию 20)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, stat, rm, symlink, unlink, appendFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PG_DUMP = process.env.PG_DUMP || "/opt/homebrew/opt/libpq/bin/pg_dump";
const PG_DUMPALL = process.env.PG_DUMPALL || "/opt/homebrew/opt/libpq/bin/pg_dumpall";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, ".env.local"));
loadEnvFile(join(ROOT, ".env"));

function withPassword(url, password) {
  if (!url) throw new Error("SUPABASE_DB_URL is required");
  if (!password) return url;
  const u = new URL(url);
  u.password = encodeURIComponent(password).replaceAll("%40", "@");
  // URL уже сам кодирует, поэтому используем встроенный setter.
  u.password = password;
  return u.toString();
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    "-" + pad(d.getUTCMonth() + 1) +
    "-" + pad(d.getUTCDate()) +
    "T" + pad(d.getUTCHours()) +
    "-" + pad(d.getUTCMinutes()) +
    "Z"
  );
}

async function runDump(args, outFile) {
  const start = Date.now();
  const { stdout, stderr } = await execFileP(PG_DUMP, args, {
    maxBuffer: 1024 * 1024 * 1024, // 1 GB на всякий случай
    env: process.env,
  });
  await writeFile(outFile, stdout);
  const ms = Date.now() - start;
  return { ms, bytes: Buffer.byteLength(stdout), warnings: stderr || "" };
}

async function fetchSizes(url) {
  // Лёгкий запрос размеров: общая БД + audit_log + сколько процентов от 500 MB free tier
  const psql = process.env.PSQL || "/opt/homebrew/opt/libpq/bin/psql";
  try {
    const { stdout } = await execFileP(psql, [
      "-t", "-A", "-F", "|",
      "-c",
      "SELECT pg_database_size(current_database())," +
      " COALESCE(pg_total_relation_size('public.db_audit_log'), 0)," +
      " (SELECT COUNT(*) FROM public.db_audit_log);",
      "--dbname", url,
    ], { env: process.env, maxBuffer: 1024 * 1024 });
    const [dbBytes, auditBytes, auditRows] = stdout.trim().split("|").map((s) => Number(s));
    const FREE_TIER_BYTES = 500 * 1024 * 1024;
    return {
      db_size_mb: +(dbBytes / 1024 / 1024).toFixed(2),
      db_size_pct_of_free_tier: +((dbBytes / FREE_TIER_BYTES) * 100).toFixed(1),
      audit_log_size_mb: +(auditBytes / 1024 / 1024).toFixed(2),
      audit_log_rows: auditRows,
    };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

async function runDumpAll(args, outFile) {
  const start = Date.now();
  const { stdout, stderr } = await execFileP(PG_DUMPALL, args, {
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  await writeFile(outFile, stdout);
  return { ms: Date.now() - start, bytes: Buffer.byteLength(stdout), warnings: stderr || "" };
}

async function rotate(backupsDir, keepLast) {
  const entries = await readdir(backupsDir, { withFileTypes: true });
  const stamps = entries
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}Z$/.test(e.name))
    .map((e) => e.name)
    .sort();
  const toRemove = stamps.slice(0, Math.max(0, stamps.length - keepLast));
  for (const name of toRemove) {
    await rm(join(backupsDir, name), { recursive: true, force: true });
  }
  return { kept: stamps.length - toRemove.length, removed: toRemove.length };
}

async function updateLatestSymlink(backupsDir, stamp) {
  const link = join(backupsDir, "latest");
  try {
    await unlink(link);
  } catch {}
  try {
    await symlink(stamp, link, "dir");
  } catch (err) {
    // На некоторых FS симлинки могут не работать — это не критично.
    console.warn("[backup] не удалось обновить symlink latest:", err.message);
  }
}

async function logResult(backupsDir, payload) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...payload }) + "\n";
  await appendFile(join(backupsDir, ".log"), line);
}

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const baseUrl = process.env.SUPABASE_DB_URL;
  const directUrl = process.env.SUPABASE_DB_DIRECT_URL || "";
  const backupsDir = resolve(ROOT, process.env.BACKUPS_DIR || "backups");
  const keepLast = Number.parseInt(process.env.BACKUPS_KEEP_LAST || "20", 10);

  if (!password) {
    console.error("ОШИБКА: SUPABASE_DB_PASSWORD не задан. Положи его в .env.local");
    process.exit(2);
  }
  if (!baseUrl) {
    console.error("ОШИБКА: SUPABASE_DB_URL не задан. Положи его в .env.local");
    process.exit(2);
  }

  await mkdir(backupsDir, { recursive: true });
  const stamp = nowStamp();
  const dir = join(backupsDir, stamp);
  await mkdir(dir, { recursive: true });

  const url = withPassword(baseUrl, password);
  const direct = directUrl ? withPassword(directUrl, password) : "";

  const summary = { stamp, files: {}, errors: [] };

  // 1) Schema dump
  try {
    const r = await runDump(
      [
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--quote-all-identifiers",
        "--dbname", url,
      ],
      join(dir, `${stamp}.schema.sql`)
    );
    summary.files.schema = { bytes: r.bytes, ms: r.ms };
    if (r.warnings) summary.files.schema.warnings = r.warnings;
    console.log(`[backup] schema OK  ${r.bytes} bytes  ${r.ms} ms`);
  } catch (err) {
    summary.errors.push({ step: "schema", message: String(err.message || err) });
    console.error("[backup] schema FAIL:", err.message || err);
  }

  // 2) Data dump
  try {
    const r = await runDump(
      [
        "--data-only",
        "--no-owner",
        "--no-privileges",
        "--column-inserts",
        "--disable-triggers",
        "--quote-all-identifiers",
        "--dbname", url,
      ],
      join(dir, `${stamp}.data.sql`)
    );
    summary.files.data = { bytes: r.bytes, ms: r.ms };
    if (r.warnings) summary.files.data.warnings = r.warnings;
    console.log(`[backup] data   OK  ${r.bytes} bytes  ${r.ms} ms`);
  } catch (err) {
    summary.errors.push({ step: "data", message: String(err.message || err) });
    console.error("[backup] data FAIL:", err.message || err);
  }

  // 3) Roles dump (требует direct URL и superuser; на Supabase обычно недоступен — это OK)
  if (direct) {
    try {
      const r = await runDumpAll(
        [
          "--roles-only",
          "--no-role-passwords",
          "--dbname", direct,
        ],
        join(dir, `${stamp}.roles.sql`)
      );
      summary.files.roles = { bytes: r.bytes, ms: r.ms };
      console.log(`[backup] roles  OK  ${r.bytes} bytes  ${r.ms} ms`);
    } catch (err) {
      // Не считаем фатальной ошибкой — Supabase часто не даёт pg_dumpall.
      summary.files.roles = { skipped: true, reason: String(err.message || err) };
      console.warn("[backup] roles SKIP:", err.message || err);
    }
  }

  if (summary.errors.length === 0) {
    await updateLatestSymlink(backupsDir, stamp);
    const rot = await rotate(backupsDir, keepLast);
    summary.rotation = rot;
    summary.sizes = await fetchSizes(url);
    console.log(`[backup] rotation: kept ${rot.kept}, removed ${rot.removed}`);
    if (summary.sizes && !summary.sizes.error) {
      console.log(
        `[backup] sizes: db=${summary.sizes.db_size_mb} MB ` +
        `(${summary.sizes.db_size_pct_of_free_tier}% of 500 MB free tier), ` +
        `audit_log=${summary.sizes.audit_log_size_mb} MB / ${summary.sizes.audit_log_rows} rows`
      );
    }
    await logResult(backupsDir, { ok: true, ...summary });
    console.log(`[backup] DONE → backups/${stamp}/`);
    process.exit(0);
  } else {
    await logResult(backupsDir, { ok: false, ...summary });
    console.error(`[backup] FAILED with ${summary.errors.length} error(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[backup] FATAL:", err);
  process.exit(1);
});
