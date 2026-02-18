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
- **コンテナ**: Docker (multi-stage build, node:20-alpine)
- **ログ**: 構造化JSON (`src/lib/logger.ts`) → Cloud Run Cloud Logging 連携
- **プロセス管理**: PM2 cluster mode (ポート8888) ※VPS環境のみ
- **Webサーバー**: Nginx (SSL/HTTPS, Let's Encrypt) ※VPS環境のみ
- **デプロイ**: GitHub Actions → VPS (main push), Cloud Build → Cloud Run

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

### VPS デプロイ (本番: manage.tao-dx.com)
mainブランチにpushすれば GitHub Actions で自動デプロイされる。
手動デプロイが必要な場合:
```bash
cd /var/www/manage
git pull --rebase origin main
npm ci && npx prisma generate && npx prisma db push --skip-generate
npm run build
pm2 restart manage
```

### Cloud Run デプロイ (GCP)
Cloud Shell または gcloud CLI から:
```bash
gcloud run deploy manage --source . --region asia-northeast1
```
Cloud Build トリガー設定済み (`cloudbuild.yaml`): mainブランチpush → 自動ビルド&デプロイ

## GCP Cloud Run 情報
- **GCPプロジェクト**: `manage-487702`
- **リージョン**: `asia-northeast1` (東京)
- **サービス名**: `manage`
- **URL**: https://manage-187944751364.asia-northeast1.run.app
- **ポート**: 8080 (Dockerfile で設定)
- **スペック**: CPU 1, メモリ 1Gi, min 0 / max 5 インスタンス
- **Dockerfile**: `Dockerfile` (multi-stage: deps → builder → runner)
- **Cloud Build設定**: `cloudbuild.yaml`
- **Artifact Registry**: `asia-northeast1-docker.pkg.dev/manage-487702/manage/manage`
- **シークレット (Secret Manager)**:
  - `manage-database-url` → `DATABASE_URL` (VPS PostgreSQL への外部接続URL)
  - `manage-jwt-secret` → `JWT_SECRET`
- **DB接続**: `postgresql://manage_user:qkRcxuGYu7jQZ1hz442pEwYV8h0wLG@210.131.223.161:5432/manage_db`
  - VPS PostgreSQL に外部接続 (5432ポート開放済み, `pg_hba.conf` で `0.0.0.0/0` 許可)
- **ログ確認**: `gcloud run services logs read manage --region asia-northeast1 --limit 30`

## VPS デプロイ情報
- アプリパス: `/var/www/manage`
- ポート: **8888** (dental-appが3000を使用中のため)
- PM2設定: `deploy/ecosystem.config.js`
- Nginx設定: `/etc/nginx/sites-available/manage.tao-dx.com`
- DB (ローカル接続): `postgresql://manage_user:qkRcxuGYu7jQZ1hz442pEwYV8h0wLG@localhost:5432/manage_db`
- DB (外部接続): `postgresql://manage_user:qkRcxuGYu7jQZ1hz442pEwYV8h0wLG@210.131.223.161:5432/manage_db`
- PostgreSQL外部接続: 5432ポート開放済み (`ufw allow 5432/tcp`, `listen_addresses = '*'`)
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
    logger.ts        # 構造化JSONログ (Cloud Run / Cloud Logging 対応)
    prisma.ts        # Prismaクライアント
    utils.ts         # ユーティリティ
prisma/
  schema.prisma      # 24テーブル定義
  seed.ts            # シードデータ
deploy/
  ecosystem.config.js # PM2設定 (PORT: 8888)
  nginx.conf         # Nginx設定テンプレート
Dockerfile           # Cloud Run 用マルチステージビルド
.dockerignore        # Docker ビルド除外設定
cloudbuild.yaml      # Cloud Build → Cloud Run 自動デプロイ設定
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
- パートナー: partner@example.com / partner123

## RBAC ロール階層
ADMIN > MANAGER > MEMBER > PARTNER

## ログシステム
- **ユーティリティ**: `src/lib/logger.ts` (info / warn / error)
- **形式**: JSON構造化ログ → Cloud Run の Cloud Logging で自動パース
- **記録情報**: timestamp, level, message, method, path, IP, user-agent, error (name/message/stack), meta
- **適用範囲**: 全46 APIルート + ミドルウェア
- **使い方**:
```typescript
import { logger } from "@/lib/logger";
logger.error("Login failed", error, request);
logger.info("User created", request, { userId: "abc" });
```

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
- Cloud Run はコールドスタート時にDB接続に時間がかかる場合あり (min-instances=0)
- VPS PostgreSQL 5432ポートが外部公開済み (Cloud Run接続用、パスワード認証で保護)
- Cloud Run の Cookie `secure: true` (NODE_ENV=production) → HTTPS必須

## パートナー×担当事業アクセス制御 実装計画

### 既存インフラ（実装済み）
- `PartnerBusiness` モデル（permissions[], canEdit, isActive）
- `getPartnerAccess()` / `getBusinessIdFilter()` / `canEditInBusiness()`（`src/lib/access-control.ts`）
- サイドバー `hideForPartner` + `hasContentAccess` フィルタ
- `/api/auth/me` が partnerAccess を返却
- 顧客API / タスクAPI / 事業API にBusiness単位フィルタ済み

### P0: 必須（コア機能）
1. **パートナー編集で担当事業選択UI** — 編集モーダルに事業チェックボックス + 役割入力
   - `PUT /api/partners/[id]` に `businessAssignments[]` パラメータ追加
   - PartnerBusiness の upsert/delete をトランザクションで処理
2. **Partner-User紐付け** — Partner に PARTNER ロール User を作成・紐付け
   - seed.ts にパートナーユーザー追加 (partner@example.com / partner123)
   - Partner.userId を設定
3. **ミドルウェア PARTNER 制限見直し** + API アクセス制御
   - `/partners` のブロック維持、PARTNERは自分のプロフィールのみ閲覧可能に
   - `/api/partners` GET: PARTNER は自分のみ返却
   - `/api/partners/[id]` GET: PARTNER は自分のIDのみ許可

### P1: データ漏洩防止
4. ワークフローAPI にBusiness単位フィルタ追加
5. 支払いAPI を Business 単位フィルタに強化
6. `/api/partners` 一覧: PARTNER は自分だけ返す
7. `/api/partners/[id]` 詳細: PARTNER は自分のIDのみアクセス可

### P2: UX改善
8. ダッシュボードの PARTNER 対応（担当事業のみのサマリー）
9. 顧客UI の canEdit 制御（読み取り専用）

### P3: セキュリティ強化
10. PartnerBusiness.canEdit の API 実装
11. 監査ログの PARTNER 操作記録強化
