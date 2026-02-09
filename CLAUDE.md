# 業務管理システム (manage)

## プロジェクト概要
全社業務管理システム（顧客管理・タスク管理・ワークフロー・支払管理・共有ポータル）
- 会社規模: パートナー100名、年商20億、17事業
- 本番URL: https://manage.tao-dx.com
- VPS: 210.131.223.161 (Xserver VPS, Ubuntu 25.04)

## 技術スタック
- **フレームワーク**: Next.js 16 (App Router) + TypeScript
- **ORM**: Prisma v6 + PostgreSQL 17
- **認証**: NextAuth.js v5 (beta) JWT戦略
- **CSS**: Tailwind CSS v4 (@tailwindcss/postcss)
- **プロセス管理**: PM2 cluster mode (ポート8888)
- **Webサーバー**: Nginx (SSL/HTTPS, Let's Encrypt)

## 重要: Prisma v6 制約
- Prisma v7 は `url` 設定の破壊的変更あり。v6を使うこと
- `InputJsonValue` 型エラー回避: `JSON.parse(JSON.stringify(obj))` を使用
- `prisma@^6.0.0` と `@prisma/client@^6.0.0` を維持

## ビルド・実行コマンド
```bash
npm run build          # 本番ビルド
npm run dev            # 開発サーバー (localhost:3000)
npx prisma generate    # Prismaクライアント生成
npx prisma db push     # スキーマをDBに反映
npx tsx prisma/seed.ts # シードデータ投入
```

## VPS デプロイ情報
- アプリパス: `/var/www/manage`
- ポート: **8888** (dental-appが3000を使用中のため)
- PM2設定: `deploy/ecosystem.config.js`
- Nginx設定: `/etc/nginx/sites-available/manage.tao-dx.com`
- DB: `postgresql://manage_user:qkRcxuGYu7jQZ1hz442pEwYV8h0wLG@localhost:5432/manage_db`
- SSL証明書: `/etc/letsencrypt/live/manage.tao-dx.com/` (2026-05-10期限)

## VPSデプロイ手順
```bash
cd /var/www/manage
git pull --rebase origin claude/customer-task-management-eA4Ls
npm ci && npx prisma generate && npx prisma db push --skip-generate
npm run build
pm2 restart manage
```

## データベース (24テーブル)
User, Business, Customer, CustomerBusiness, Partner, WorkflowTemplate,
WorkflowStepTemplate, Workflow, WorkflowStep, Task, Payment, SharedPage,
ShareLink, ShareAccessLog, SharedPageComment, ActivityNote, Tag, EntityTag,
RecurringRule, CustomFieldDef, AuditLog, DataVersion, ActivityLog,
Notification, NotificationSetting

## ディレクトリ構成
```
src/
  app/
    (dashboard)/     # 認証済みページ (レイアウト付き)
    login/           # ログインページ
    api/             # 30 APIルート
  components/
    ui/              # 12 UIコンポーネント (button, input, modal等)
    layout/          # sidebar, header, main-layout
  lib/
    auth.ts          # NextAuth設定
    auth-helpers.ts  # getCurrentUser, requireAuth, requireRole
    audit.ts         # 監査ログ・データバージョニング
    security.ts      # レート制限, RBAC, ROLE_HIERARCHY
    workflow-engine.ts # ワークフローエンジン
    prisma.ts        # Prismaクライアント
    utils.ts         # ユーティリティ
prisma/
  schema.prisma      # 24テーブル定義
  seed.ts            # シードデータ
deploy/
  ecosystem.config.js # PM2設定 (PORT: 8888)
  nginx.conf         # Nginx設定テンプレート
scripts/
  setup-vps.sh       # VPS初期セットアップ
  setup-db-security.sql # DBトリガー (監査ログ不変化)
  backup.sh          # 日次バックアップ
```

## ログイン情報 (シードデータ)
- 管理者: admin@example.com / admin123
- マネージャー: manager@example.com / manager123
- メンバー: member@example.com / member123

## RBAC ロール階層
ADMIN > MANAGER > MEMBER > PARTNER

## セキュリティ対策
- 不変監査ログ (PostgreSQLトリガーでUPDATE/DELETE禁止)
- データバージョニング (全変更のスナップショット)
- ソフトデリート (deletedAtカラム)
- JWTで毎リクエストDB確認 (isActive チェック)
- ミドルウェアでセキュリティヘッダー付与

## 既知の注意点
- VPS上の他アプリ: dental-app(3000), mieru-clinic, zoom-backend, zoom-dashboard
- git pull時は `--rebase` フラグが必要 (divergent branches対策)
- Next.js 16で `middleware` が deprecated → `proxy` への移行が将来必要
