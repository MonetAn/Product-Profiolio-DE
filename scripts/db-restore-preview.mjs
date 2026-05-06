#!/usr/bin/env node
// Поднимает выбранный бэкап в ЛОКАЛЬНЫЙ Postgres (не в прод) для просмотра.
//
// Использование:
//   node scripts/db-restore-preview.mjs                  # latest бэкап
//   node scripts/db-restore-preview.mjs 2026-05-04T20-30Z
//
// Требования:
//   • установлен Docker Desktop ИЛИ есть локальный Postgres
//   • переменная LOCAL_DB_URL в .env.local указывает на пустую локальную базу,
//     например postgresql://postgres:postgres@127.0.0.1:54322/postgres
//
// Скрипт ничего не пишет в прод. Он только заливает дамп в LOCAL_DB_URL.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PSQL = process.env.PSQL || "/opt/homebrew/opt/libpq/bin/psql";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvFile(join(ROOT, ".env.local"));
loadEnvFile(join(ROOT, ".env"));

async function findStamp(arg) {
  const backupsDir = join(ROOT, "backups");
  if (arg) return arg;
  const entries = await readdir(backupsDir, { withFileTypes: true });
  const stamps = entries
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}Z$/.test(e.name))
    .map((e) => e.name)
    .sort();
  if (stamps.length === 0) throw new Error("В backups/ нет ни одного бэкапа");
  return stamps[stamps.length - 1];
}

async function runFile(targetUrl, file) {
  console.log(`[restore] >>> ${file}`);
  const { stderr } = await execFileP(PSQL, ["--single-transaction", "--variable=ON_ERROR_STOP=1", "--dbname", targetUrl, "--file", file], {
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  if (stderr && !/^SET/m.test(stderr)) console.log(stderr);
}

async function main() {
  const targetUrl = process.env.LOCAL_DB_URL;
  if (!targetUrl) {
    console.error("ОШИБКА: LOCAL_DB_URL не задан в .env.local. Это должна быть строка к ЛОКАЛЬНОЙ базе, а не к проду.");
    process.exit(2);
  }
  if (/supabase\.com|pooler\.supabase/i.test(targetUrl)) {
    console.error("ОШИБКА: LOCAL_DB_URL указывает на Supabase. Этот скрипт должен заливать в локальную базу.");
    process.exit(2);
  }
  const stamp = await findStamp(process.argv[2]);
  const dir = join(ROOT, "backups", stamp);
  console.log(`[restore] preview ${stamp} → ${targetUrl.replace(/:[^:@/]+@/, ":***@")}`);
  await runFile(targetUrl, join(dir, `${stamp}.schema.sql`));
  await runFile(targetUrl, join(dir, `${stamp}.data.sql`));
  console.log("[restore] OK");
}

main().catch((e) => {
  console.error("[restore] FATAL:", e.message || e);
  process.exit(1);
});
