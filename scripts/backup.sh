#!/bin/bash
# ============================================================
# 全体バックアップスクリプト (DB + ファイル + 設定)
# 毎日午前3時に自動実行 + 手動実行可能
#
# 自動: crontab -e → 0 3 * * * /var/www/manage/scripts/backup.sh
# 手動: /var/www/manage/scripts/backup.sh
# 復元: /var/www/manage/scripts/backup.sh --restore 20260210
# ============================================================

set -euo pipefail

# === 設定 ===
APP_DIR="/var/www/manage"
DB_NAME="${DB_NAME:-manage_db}"
DB_USER="${DB_USER:-manage_user}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_PASSWORD="${DB_PASSWORD:-qkRcxuGYu7jQZ1hz442pEwYV8h0wLG}"
BACKUP_ROOT="/var/backups/manage"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_TAG=$(date +%Y%m%d)
BACKUP_DIR="${BACKUP_ROOT}/${DATE_TAG}"
LOG_FILE="/var/log/manage-backup.log"

# === ログ関数 ===
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

# === 復元モード ===
if [[ "${1:-}" == "--restore" ]]; then
  RESTORE_DATE="${2:-}"
  if [[ -z "${RESTORE_DATE}" ]]; then
    echo "使い方: $0 --restore YYYYMMDD"
    echo ""
    echo "利用可能なバックアップ:"
    ls -d "${BACKUP_ROOT}"/20* 2>/dev/null | sort -r | while read -r dir; do
      date_dir=$(basename "$dir")
      db_size=$(du -sh "$dir/db" 2>/dev/null | cut -f1 || echo "N/A")
      files_size=$(du -sh "$dir/files" 2>/dev/null | cut -f1 || echo "N/A")
      echo "  ${date_dir}  (DB: ${db_size}, Files: ${files_size})"
    done
    exit 0
  fi

  RESTORE_DIR="${BACKUP_ROOT}/${RESTORE_DATE}"
  if [[ ! -d "${RESTORE_DIR}" ]]; then
    echo "エラー: バックアップ ${RESTORE_DATE} が見つかりません"
    exit 1
  fi

  echo "=========================================="
  echo "  復元: ${RESTORE_DATE} のバックアップ"
  echo "=========================================="
  echo ""
  echo "以下を復元します:"
  [[ -f "${RESTORE_DIR}/db/full.dump" ]] && echo "  - データベース (full.dump)"
  [[ -f "${RESTORE_DIR}/db/audit.dump" ]] && echo "  - 監査ログ (audit.dump)"
  [[ -f "${RESTORE_DIR}/files/uploads.tar.gz" ]] && echo "  - アップロードファイル"
  [[ -f "${RESTORE_DIR}/files/env.tar.gz" ]] && echo "  - 環境設定 (.env)"
  [[ -f "${RESTORE_DIR}/files/nginx.tar.gz" ]] && echo "  - Nginx設定"
  [[ -f "${RESTORE_DIR}/files/pm2.tar.gz" ]] && echo "  - PM2設定"
  echo ""
  read -rp "復元を実行しますか？ (yes/no): " confirm
  if [[ "${confirm}" != "yes" ]]; then
    echo "キャンセルしました"
    exit 0
  fi

  # PM2停止
  log "復元開始: ${RESTORE_DATE}"
  pm2 stop manage 2>/dev/null || true

  # DB復元
  if [[ -f "${RESTORE_DIR}/db/full.dump" ]]; then
    log "DB復元中..."
    PGPASSWORD="${DB_PASSWORD}" pg_restore \
      -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
      -d "${DB_NAME}" \
      --clean --if-exists --no-owner --no-privileges \
      "${RESTORE_DIR}/db/full.dump" 2>&1 | tee -a "${LOG_FILE}" || true
    log "DB復元完了"
  fi

  # アップロードファイル復元
  if [[ -f "${RESTORE_DIR}/files/uploads.tar.gz" ]]; then
    log "アップロードファイル復元中..."
    tar xzf "${RESTORE_DIR}/files/uploads.tar.gz" -C "${APP_DIR}"
    log "アップロードファイル復元完了"
  fi

  # .env復元
  if [[ -f "${RESTORE_DIR}/files/env.tar.gz" ]]; then
    log ".env復元中..."
    tar xzf "${RESTORE_DIR}/files/env.tar.gz" -C "${APP_DIR}"
    log ".env復元完了"
  fi

  # Nginx設定復元
  if [[ -f "${RESTORE_DIR}/files/nginx.tar.gz" ]]; then
    log "Nginx設定復元中..."
    tar xzf "${RESTORE_DIR}/files/nginx.tar.gz" -C /
    nginx -t && systemctl reload nginx
    log "Nginx設定復元完了"
  fi

  # 再ビルド＆起動
  log "アプリ再ビルド中..."
  cd "${APP_DIR}"
  npx prisma generate
  npm run build
  pm2 restart manage || pm2 start deploy/ecosystem.config.js
  pm2 save

  log "復元完了: ${RESTORE_DATE}"
  echo ""
  echo "復元が完了しました。動作確認してください:"
  echo "  curl -sf http://localhost:8888/login | grep -o '<title>[^<]*</title>'"
  exit 0
fi

# === バックアップモード ===
log "========== バックアップ開始 =========="

# ディレクトリ作成
mkdir -p "${BACKUP_DIR}/db"
mkdir -p "${BACKUP_DIR}/files"

# --- 1. データベース完全バックアップ ---
log "DB完全バックアップ中..."
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-privileges \
  --format=custom \
  --compress=9 \
  > "${BACKUP_DIR}/db/full.dump"

DB_SIZE=$(du -h "${BACKUP_DIR}/db/full.dump" | cut -f1)
log "DB完全バックアップ完了: ${DB_SIZE}"

# --- 2. 監査ログ別途バックアップ (不変データ保護) ---
log "監査ログバックアップ中..."
PGPASSWORD="${DB_PASSWORD}" pg_dump \
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
  > "${BACKUP_DIR}/db/audit.dump"

AUDIT_SIZE=$(du -h "${BACKUP_DIR}/db/audit.dump" | cut -f1)
log "監査ログバックアップ完了: ${AUDIT_SIZE}"

# --- 3. アップロードファイル ---
if [[ -d "${APP_DIR}/public/uploads" ]]; then
  log "アップロードファイルバックアップ中..."
  tar czf "${BACKUP_DIR}/files/uploads.tar.gz" -C "${APP_DIR}" public/uploads
  UPLOADS_SIZE=$(du -h "${BACKUP_DIR}/files/uploads.tar.gz" | cut -f1)
  log "アップロードファイル完了: ${UPLOADS_SIZE}"
else
  log "アップロードディレクトリなし (スキップ)"
fi

# --- 4. 環境設定ファイル (.env) ---
log "環境設定バックアップ中..."
tar czf "${BACKUP_DIR}/files/env.tar.gz" -C "${APP_DIR}" .env 2>/dev/null || log ".envファイルなし (スキップ)"

# --- 5. Nginx設定 ---
log "Nginx設定バックアップ中..."
tar czf "${BACKUP_DIR}/files/nginx.tar.gz" \
  /etc/nginx/sites-available/manage.tao-dx.com \
  /etc/nginx/nginx.conf \
  2>/dev/null || log "Nginx設定バックアップ一部スキップ"

# --- 6. PM2設定 ---
log "PM2設定バックアップ中..."
tar czf "${BACKUP_DIR}/files/pm2.tar.gz" -C "${APP_DIR}" deploy/ecosystem.config.js

# --- 7. 古いバックアップの削除 (7日超過分) ---
log "古いバックアップ削除中 (${RETENTION_DAYS}日超過)..."
find "${BACKUP_ROOT}" -maxdepth 1 -mindepth 1 -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;

# === 結果サマリ ===
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
log "========== バックアップ完了 =========="
log "保存先: ${BACKUP_DIR}"
log "合計サイズ: ${TOTAL_SIZE}"
log ""
log "現在のバックアップ一覧:"
ls -d "${BACKUP_ROOT}"/20* 2>/dev/null | sort -r | while read -r dir; do
  dir_name=$(basename "$dir")
  dir_size=$(du -sh "$dir" | cut -f1)
  log "  ${dir_name}  ${dir_size}"
done
