#!/usr/bin/env bash
# Удаляет записи db_audit_log старше DAYS (по умолчанию 14).
# Запускается ежедневно через launchd.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAYS="${1:-14}"

result=$("$SCRIPT_DIR/db-psql.sh" -t -A -c "SELECT public.prune_audit_log($DAYS);")
size=$("$SCRIPT_DIR/db-psql.sh" -t -A -c "SELECT pg_size_pretty(pg_total_relation_size('public.db_audit_log'));")
db_size=$("$SCRIPT_DIR/db-psql.sh" -t -A -c "SELECT pg_size_pretty(pg_database_size(current_database()));")

echo "[$(date -u +%FT%TZ)] prune(${DAYS}d): removed=${result}, audit_log_size=${size}, db_total=${db_size}"
