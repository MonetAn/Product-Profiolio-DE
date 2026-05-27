#!/usr/bin/env bash
# Удаляет все workflow runs workflow db-backup (и их artifacts) из GitHub.
# Требует: brew install gh && gh auth login
set -euo pipefail

REPO="${1:-MonetAn/Product-Profiolio-DE}"

if ! command -v gh >/dev/null; then
  echo "Установи GitHub CLI: brew install gh && gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Войди в GitHub: gh auth login"
  exit 1
fi

echo "Удаляю runs workflow db-backup в ${REPO}…"
ids=$(gh run list --repo "$REPO" --workflow=db-backup.yml --limit 500 --json databaseId -q '.[].databaseId' 2>/dev/null || true)

# workflow уже удалён с main — gh run list может вернуть пусто; добираем по имени
if [ -z "$ids" ]; then
  ids=$(python3 - <<'PY'
import json, urllib.request
repo = "MonetAn/Product-Profiolio-DE"
out = []
page = 1
while page <= 20:
    url = f"https://api.github.com/repos/{repo}/actions/runs?per_page=100&page={page}"
    with urllib.request.urlopen(url) as r:
        data = json.load(r)
    runs = data.get("workflow_runs", [])
    if not runs:
        break
    for run in runs:
        if run.get("name") == "db-backup":
            out.append(str(run["id"]))
    page += 1
print("\n".join(out))
PY
)
fi

if [ -z "$ids" ]; then
  echo "Нет runs db-backup — артефакты уже удалены."
else
  count=0
  for id in $ids; do
    gh run delete "$id" --repo "$REPO"
    count=$((count + 1))
  done
  echo "Удалено runs: $count"
fi

echo ""
echo "Удаляю Actions secrets (если есть)…"
for name in SUPABASE_DB_URL SUPABASE_DB_PASSWORD SUPABASE_DB_DIRECT_URL; do
  gh secret delete "$name" --repo "$REPO" 2>/dev/null && echo "  deleted $name" || true
done
