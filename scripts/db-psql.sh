#!/usr/bin/env bash
# Безопасный psql wrapper. Подхватывает .env.local + .env, не светит пароль в ps/argv.
#
# Использование:
#   scripts/db-psql.sh                    # интерактивный psql к проду
#   scripts/db-psql.sh -c "SELECT 1"      # одноразовый SQL
#   scripts/db-psql.sh -f some-script.sql # выполнить файл
#   scripts/db-psql.sh --csv -c "SELECT ..."
#
# По умолчанию подключается к SUPABASE_DB_URL (это прод). Если хочешь к локалке —
# вызови как:  scripts/db-psql.sh --local ...

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

set -a
[ -f "$ROOT/.env.local" ] && . "$ROOT/.env.local"
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a

USE_LOCAL=0
if [ "${1:-}" = "--local" ]; then
  USE_LOCAL=1
  shift
fi

if [ "$USE_LOCAL" -eq 1 ]; then
  TARGET_URL="${LOCAL_DB_URL:-}"
  PASSWORD=""
  if [ -z "$TARGET_URL" ]; then
    echo "ERROR: LOCAL_DB_URL не задан в .env.local" >&2
    exit 2
  fi
else
  TARGET_URL="${SUPABASE_DB_URL:-}"
  PASSWORD="${SUPABASE_DB_PASSWORD:-}"
  if [ -z "$TARGET_URL" ] || [ -z "$PASSWORD" ]; then
    echo "ERROR: SUPABASE_DB_URL/PASSWORD не заданы в .env.local" >&2
    exit 2
  fi
fi

PSQL="${PSQL:-/opt/homebrew/opt/libpq/bin/psql}"

exec env PGPASSWORD="$PASSWORD" "$PSQL" "$TARGET_URL" "$@"
