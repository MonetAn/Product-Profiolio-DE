#!/usr/bin/env node
// Поднимает выбранный бэкап в ЛОКАЛЬНЫЙ Postgres (не в прод) для просмотра.
//
// Использование:
//   node scripts/db-restore-preview.mjs                  # latest бэкап, только public data
//   node scripts/db-restore-preview.mjs 2026-05-04T20-30Z
//   node scripts/db-restore-preview.mjs --full            # schema + data (только для пустого Postgres без Supabase)
//
// Для локального Supabase (`supabase start`) используйте режим по умолчанию:
//   npm run db:reset && npm run db:restore-preview
// Схема auth/storage уже есть в Docker-стеке — полный schema.sql из прода конфликтует.

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
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

function parseArgs(argv) {
  const positional = [];
  let full = false;
  for (const a of argv) {
    if (a === "--full") full = true;
    else positional.push(a);
  }
  return { full, stampArg: positional[0] };
}

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

/** Только INSERT/COPY в public.* — без auth, storage, _backup_* и прочего. */
function isPublicAppLine(line) {
  const insert = /^INSERT INTO "public"\."([^"]+)"/i.exec(line);
  if (insert) {
    const table = insert[1];
    if (table.startsWith("_")) return false;
    return true;
  }
  const copy = /^COPY "public"\."([^"]+)"/i.exec(line);
  if (copy) {
    const table = copy[1];
    if (table.startsWith("_")) return false;
    return true;
  }
  return false;
}

async function runPublicDataFile(targetUrl, dataFile) {
  console.log(`[restore] >>> ${dataFile} (только public.*, без temp _*)`);
  const rl = createInterface({ input: createReadStream(dataFile), crlfDelay: Infinity });
  let batch = [];
  let lineCount = 0;
  let batchCount = 0;
  let inCopyBlock = false;

  const flush = () =>
    new Promise((resolveFlush, rejectFlush) => {
      if (batch.length === 0) return resolveFlush();
      const sql = batch.join("\n");
      batch = [];
      batchCount += 1;
      const child = spawn(PSQL, ["--single-transaction", "--variable=ON_ERROR_STOP=1", "--dbname", targetUrl], {
        env: process.env,
        stdio: ["pipe", "inherit", "inherit"],
      });
      child.stdin.write(sql);
      child.stdin.end();
      child.on("close", (code) => (code === 0 ? resolveFlush() : rejectFlush(new Error(`psql exit ${code}`))));
      child.on("error", rejectFlush);
    });

  for await (const rawLine of rl) {
    lineCount += 1;
    const line = rawLine;

    if (inCopyBlock) {
      batch.push(line);
      if (line === "\\.") {
        inCopyBlock = false;
        if (batch.length >= 400) await flush();
      }
      continue;
    }

    if (isPublicAppLine(line)) {
      batch.push(line);
      if (/^COPY "public"\./i.test(line)) inCopyBlock = true;
      if (!inCopyBlock && batch.length >= 200) await flush();
    }
  }
  await flush();
  console.log(`[restore] public data: ${lineCount} lines scanned, ${batchCount} batches`);
}

async function main() {
  const { full, stampArg } = parseArgs(process.argv.slice(2));
  const targetUrl = process.env.LOCAL_DB_URL;
  if (!targetUrl) {
    console.error("ОШИБКА: LOCAL_DB_URL не задан в .env.local. Это должна быть строка к ЛОКАЛЬНОЙ базе, а не к проду.");
    process.exit(2);
  }
  if (/supabase\.com|pooler\.supabase/i.test(targetUrl)) {
    console.error("ОШИБКА: LOCAL_DB_URL указывает на Supabase. Этот скрипт должен заливать в локальную базу.");
    process.exit(2);
  }
  const stamp = await findStamp(stampArg);
  const dir = join(ROOT, "backups", stamp);
  const schemaFile = join(dir, `${stamp}.schema.sql`);
  const dataFile = join(dir, `${stamp}.data.sql`);

  console.log(`[restore] preview ${stamp} → ${targetUrl.replace(/:[^:@/]+@/, ":***@")}`);
  if (full) {
    console.log("[restore] режим --full: schema + data (не для supabase start без db:reset на чистый Postgres)");
    await runFile(targetUrl, schemaFile);
    await runFile(targetUrl, dataFile);
  } else {
    console.log("[restore] режим supabase-local: только public data (сначала: npm run db:reset)");
    await runPublicDataFile(targetUrl, dataFile);
  }
  console.log("[restore] OK");
}

main().catch((e) => {
  console.error("[restore] FATAL:", e.message || e);
  process.exit(1);
});
