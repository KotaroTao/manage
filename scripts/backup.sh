#!/bin/bash
# ============================================================
# PostgreSQL 日次バックアップスクリプト
# cron設定例: 0 5 * * * /path/to/backup.sh
# ============================================================

set -euo pipefail

# 設定
DB_NAME="${DB_NAME:-manage_db}"
DB_USER="${DB_USER:-user}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/manage}"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# バックアップディレクトリ作成
mkdir -p "${BACKUP_DIR}"

echo "[$(date)] バックアップ開始: ${DB_NAME}"

# pg_dump → gzip 圧縮
PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-privileges \
  --format=custom \
  --compress=9 \
  > "${BACKUP_FILE}"

echo "[$(date)] バックアップ完了: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# 監査ログの別途バックアップ（不変データとして保護）
AUDIT_BACKUP="${BACKUP_DIR}/audit_${DB_NAME}_${TIMESTAMP}.sql.gz"
PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --table='"AuditLog"' \
  --table='"DataVersion"' \
  --table='"ActivityLog"' \
  --no-owner \
  --no-privileges \
  --format=custom \
  --compress=9 \
  > "${AUDIT_BACKUP}"

echo "[$(date)] 監査ログバックアップ完了: ${AUDIT_BACKUP}"

# 古いバックアップの削除（保持期間超過分）
find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] ${RETENTION_DAYS}日以上前のバックアップを削除"

# バックアップ一覧表示
echo "[$(date)] 現在のバックアップ:"
ls -lh "${BACKUP_DIR}"/*.sql.gz 2>/dev/null || echo "  バックアップなし"

echo "[$(date)] 完了"
