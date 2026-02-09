# 業務管理システム (manage)

## プロジェクト概要
全社業務管理システム（顧客管理・タスク管理・ワークフロー・支払管理・共有ポータル）
- 会社規模: パートナー100名、年商20億、17事業
- 本番URL: https://manage.tao-dx.com
- VPS: 210.131.223.161 (Xserver VPS, Ubuntu 25.04)

## 技術スタック
- **フレームワーク**: Next.js 16 (App Router) + TypeScript
- **ORM**: Prisma v6 + PostgreSQL 17
- **認証**: カスタムJWT (jose) + httpOnly Cookie (`auth_token`)
- **CSS**: Tailwind CSS v4 (@tailwindcss/postcss)
- **プロセス管理**: PM2 cluster mode (ポート8888)
- **Webサーバー**: Nginx (SSL/HTTPS, Let's Encrypt)
- **デプロイ**: GitHub Actions (mainブランチpush → 自動デプロイ)

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

## デプロイ
mainブランチにpushすれば GitHub Actions で自動デプロイされる。
手動デプロイが必要な場合:
```bash
cd /var/www/manage
git pull --rebase origin main
npm ci && npx prisma generate && npx prisma db push --skip-generate
npm run build
pm2 restart manage
```

## VPS デプロイ情報
- アプリパス: `/var/www/manage`
- ポート: **8888** (dental-appが3000を使用中のため)
- PM2設定: `deploy/ecosystem.config.js`
- Nginx設定: `/etc/nginx/sites-available/manage.tao-dx.com`
- DB: `postgresql://manage_user:qkRcxuGYu7jQZ1hz442pEwYV8h0wLG@localhost:5432/manage_db`
- SSL証明書: `/etc/letsencrypt/live/manage.tao-dx.com/` (2026-05-10期限)

## 認証システム
- **方式**: カスタムJWT (jose HS256) + httpOnly Cookie
- **Cookie名**: `auth_token` (secure: 本番のみ, sameSite: lax, 有効期限: 7日)
- **環境変数**: `JWT_SECRET`（フォールバック: `NEXTAUTH_SECRET`）
- **API**: `/api/auth/login` (POST), `/api/auth/logout` (POST), `/api/auth/me` (GET)
- **クライアント**: `useAuth()` フック (`src/contexts/auth-context.tsx`)
- **サーバー**: `getSession()` / `getCurrentUser()` (`src/lib/auth.ts`, `src/lib/auth-helpers.ts`)
- **ミドルウェア**: jose `jwtVerify` で直接検証 (`src/middleware.ts`)

## API レスポンス規約
**必ず守ること**: フロントエンドは `json.data` でデータにアクセスする
```typescript
// 一覧取得 (GET)
return NextResponse.json({ data: items });
// ページネーション付き
return NextResponse.json({ data: items, pagination: { ... } });
// 単体取得 (GET)
return NextResponse.json({ data: item });
// 作成 (POST)
return NextResponse.json({ data: created }, { status: 201 });
// エラー
return NextResponse.json({ error: "メッセージ" }, { status: 4xx });
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
    api/             # APIルート
  components/
    ui/              # UIコンポーネント (button, input, modal等)
    layout/          # sidebar, header, main-layout
  contexts/
    auth-context.tsx # AuthProvider, useAuth
  lib/
    auth.ts          # JWT生成・検証, getSession
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
- ミドルウェアでJWT検証 + isActiveチェック
- ミドルウェアでセキュリティヘッダー付与
- IPベースレート制限 (ログイン: 15分間30回)

## 既知の注意点
- VPS上の他アプリ: dental-app(3000), mieru-clinic, zoom-backend, zoom-dashboard
- git pull時は `--rebase` フラグが必要 (divergent branches対策)
- Next.js 16で `middleware` が deprecated → `proxy` への移行が将来必要
