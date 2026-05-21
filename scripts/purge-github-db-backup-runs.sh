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

if [ -z "$ids" ]; then
  echo "Нет runs db-backup (уже чисто или workflow удалён с main)."
else
  count=0
  for id in $ids; do
    gh run delete "$id" --repo "$REPO" --confirm
    count=$((count + 1))
  done
  echo "Удалено runs: $count"
fi

echo ""
echo "Проверь вручную (Settings → Secrets → Actions), что удалены:"
echo "  SUPABASE_DB_URL, SUPABASE_DB_PASSWORD, SUPABASE_DB_DIRECT_URL"
