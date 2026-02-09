#!/bin/bash
# ============================================================
# manage.tao-dx.com 本番セットアップスクリプト
# VPS上で root として実行: bash /tmp/setup-manage.sh
# ============================================================
set -euo pipefail

echo "=========================================="
echo " 業務管理システム セットアップ開始"
echo "=========================================="

# --- 1. PostgreSQL データベース作成 ---
echo ""
echo "[1/7] PostgreSQL データベース作成..."

DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
NEXTAUTH_SECRET=$(openssl rand -base64 32)

sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='manage_user'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER manage_user WITH PASSWORD '${DB_PASSWORD}';"

sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='manage_db'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE manage_db OWNER manage_user;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE manage_db TO manage_user;"
sudo -u postgres psql -d manage_db -c "GRANT ALL ON SCHEMA public TO manage_user;"

echo "  DB: manage_db / User: manage_user 作成完了"

# --- 2. アプリケーション配置 ---
echo ""
echo "[2/7] アプリケーション配置..."

mkdir -p /var/www/manage
cd /var/www/manage

if [ ! -d ".git" ]; then
  git clone https://github.com/KotaroTao/manage.git .
else
  git pull origin main 2>/dev/null || git pull origin claude/customer-task-management-eA4Ls
fi

# ブランチを確認 (mainが無い場合はfeatureブランチを使用)
git checkout main 2>/dev/null || git checkout claude/customer-task-management-eA4Ls

# --- 3. 環境変数設定 ---
echo ""
echo "[3/7] 環境変数設定..."

cat > /var/www/manage/.env << ENVEOF
DATABASE_URL="postgresql://manage_user:${DB_PASSWORD}@localhost:5432/manage_db?schema=public"
NEXTAUTH_URL="https://manage.tao-dx.com"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NODE_ENV="production"
ENVEOF

chmod 600 /var/www/manage/.env
echo "  .env 作成完了"

# --- 4. ビルド ---
echo ""
echo "[4/7] npm install & ビルド..."

cd /var/www/manage
npm ci
npx prisma generate
npx prisma db push --skip-generate
npm run build

echo "  ビルド完了"

# --- 5. シードデータ & DBセキュリティ ---
echo ""
echo "[5/7] シードデータ投入 & DBセキュリティ設定..."

npx tsx prisma/seed.ts

# DBトリガー設定 (manage_userとして実行)
PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U manage_user -d manage_db -f scripts/setup-db-security.sql 2>/dev/null || \
  sudo -u postgres psql -d manage_db -f scripts/setup-db-security.sql || \
  echo "  ※ DBセキュリティSQL適用は手動で実行してください"

echo "  シードデータ投入完了"

# --- 6. Nginx設定 ---
echo ""
echo "[6/7] Nginx設定..."

cat > /etc/nginx/sites-available/manage.tao-dx.com << 'NGINXEOF'
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=manage_api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=manage_login:10m rate=5r/m;

server {
    listen 80;
    server_name manage.tao-dx.com;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name manage.tao-dx.com;

    # SSL (placeholder - certbot will update these)
    ssl_certificate /etc/letsencrypt/live/manage.tao-dx.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/manage.tao-dx.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Logs
    access_log /var/log/nginx/manage_access.log;
    error_log /var/log/nginx/manage_error.log;

    # Login rate limit
    location /api/auth {
        limit_req zone=manage_login burst=3 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API rate limit
    location /api {
        limit_req zone=manage_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # All other requests
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF

# Enable site
ln -sf /etc/nginx/sites-available/manage.tao-dx.com /etc/nginx/sites-enabled/

# まずHTTPのみでNginxを起動（SSL証明書取得前）
cat > /etc/nginx/sites-available/manage-temp-http << 'TMPEOF'
server {
    listen 80;
    server_name manage.tao-dx.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
TMPEOF

# 一時的にHTTPのみで起動
rm -f /etc/nginx/sites-enabled/manage.tao-dx.com
ln -sf /etc/nginx/sites-available/manage-temp-http /etc/nginx/sites-enabled/manage-temp-http
nginx -t && systemctl reload nginx
echo "  Nginx HTTP設定完了"

# --- 7. PM2起動 ---
echo ""
echo "[7/7] PM2でアプリケーション起動..."

cd /var/www/manage
pm2 delete manage 2>/dev/null || true
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup 2>/dev/null || true

sleep 3
echo ""
echo "  ヘルスチェック..."
curl -sf http://localhost:3000/login > /dev/null && echo "  ✅ アプリ起動成功!" || echo "  ⚠ アプリが応答しません。pm2 logs manage で確認してください"

# --- SSL証明書取得 ---
echo ""
echo "=========================================="
echo " セットアップ完了!"
echo "=========================================="
echo ""
echo "--- 接続情報 ---"
echo "  URL: http://manage.tao-dx.com (HTTP)"
echo ""
echo "--- ログイン情報 ---"
echo "  管理者: admin@example.com / admin123"
echo "  マネージャー: manager@example.com / manager123"
echo "  メンバー: member@example.com / member123"
echo ""
echo "--- DB情報 ---"
echo "  DATABASE_URL: postgresql://manage_user:${DB_PASSWORD}@localhost:5432/manage_db"
echo "  NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}"
echo ""
echo "--- 次のステップ ---"
echo "  1. SSL証明書を取得:"
echo "     certbot certonly --webroot -w /var/www/html -d manage.tao-dx.com"
echo ""
echo "  2. SSL取得後、Nginx設定を切り替え:"
echo "     rm /etc/nginx/sites-enabled/manage-temp-http"
echo "     ln -sf /etc/nginx/sites-available/manage.tao-dx.com /etc/nginx/sites-enabled/"
echo "     nginx -t && systemctl reload nginx"
echo ""
echo "  3. GitHub Secretsに設定:"
echo "     DATABASE_URL = postgresql://manage_user:${DB_PASSWORD}@localhost:5432/manage_db"
echo "     NEXTAUTH_SECRET = ${NEXTAUTH_SECRET}"
echo "     NEXTAUTH_URL = https://manage.tao-dx.com"
echo "     VPS_HOST = 210.131.223.161"
echo "     VPS_USER = root"
echo "     VPS_SSH_KEY = (SSH秘密鍵)"
echo ""
echo "--- バックアップcron設定 ---"
echo "  crontab -e で以下を追加:"
echo "  0 5 * * * DB_PASSWORD=${DB_PASSWORD} /var/www/manage/scripts/backup.sh"
echo ""
