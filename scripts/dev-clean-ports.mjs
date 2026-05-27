#!/usr/bin/env node
/** Освободить 8080/8081 от зависшего Vite и сбросить кэш prebundle (macOS / Linux). */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ports = [8080, 8081];
for (const port of ports) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (const pid of pids) {
      console.log(`Kill PID ${pid} on port ${port}`);
      process.kill(Number(pid), 'SIGKILL');
    }
  } catch {
    // lsof exit 1 — порт свободен
  }
}
console.log("Ports 8080–8081 cleared (if anything was listening).");

const viteCache = join(root, "node_modules", ".vite");
try {
  rmSync(viteCache, { recursive: true, force: true });
  console.log("Removed node_modules/.vite (stale dep optimizer cache).");
} catch (e) {
  console.warn("Could not remove node_modules/.vite:", e?.message ?? e);
}
