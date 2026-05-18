#!/usr/bin/env node
/** Освободить 8080/8081 от зависшего Vite (macOS / Linux). */
import { execSync } from 'node:child_process';

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
console.log('Ports 8080–8081 cleared (if anything was listening).');
