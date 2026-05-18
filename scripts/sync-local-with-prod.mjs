#!/usr/bin/env node
/**
 * Подтянуть локальный клон к тому же состоянию, что и прод (GitHub Pages из main).
 * Запуск: npm run sync:prod
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

function runOut(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
}

console.log('=== Sync local with production (main) ===\n');

run('git fetch origin');
run('git checkout main');
run('git pull origin main');

const sha = runOut('git rev-parse --short HEAD');
const branch = runOut('git branch --show-current');
console.log(`\nBranch: ${branch}`);
console.log(`Commit: ${sha} (сверьте с подписью «Сборка» в админке на проде после деплоя)`);

const detailDialog = path.join(root, 'src/components/admin/InitiativeDetailDialog.tsx');
const src = fs.readFileSync(detailDialog, 'utf8');
if (src.includes('Заглушка в таймлайне')) {
  console.error(
    '\nОШИБКА: в коде всё ещё есть переключатель «Заглушка в таймлайне». Вы на устаревшем коммите или не на main.'
  );
  process.exit(1);
}
console.log('\nOK: переключатель заглушки в InitiativeDetailDialog отсутствует (как на проде).');

for (const dir of ['node_modules/.vite', 'dist']) {
  const p = path.join(root, dir);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`Removed ${dir}/`);
  }
}

console.log('\nГотово. Запустите: npm run dev');
console.log('В админке (супер-админ) в шапке должна совпасть «Сборка» с продом после git pull.\n');
