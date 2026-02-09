# 全社業務管理システム

顧客管理＆タスク管理を統合した自社専用業務管理システム。

## 機能一覧

- **顧客管理**: マスタ＋事業別テーブル、カスタムフィールド対応
- **事業管理**: 17事業の個別管理、事業別カスタムフィールド
- **パートナー管理**: 100名規模のパートナー情報・銀行口座管理
- **業務フロー**: テンプレート作成→顧客に適用→ステップ自動進行
- **タスク管理**: 統合一覧（リスト/カンバン/カレンダー）、担当者必須、期限管理
- **支払い管理**: パートナーへの給与・報酬管理、承認フロー
- **クライアント共有**: 議事録・レポートを共有リンクで顧客に提供
- **ダッシュボード**: ログイン時アラート、次回対応日管理、期限超過警告
- **データ保護**: 不変監査ログ、データバージョニング、自動バックアップ

## 技術スタック

- **Frontend/Backend**: Next.js (App Router) + TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **CSS**: Tailwind CSS
- **Auth**: NextAuth.js v5
- **Deploy**: Xserver VPS + Nginx + PM2

## セットアップ

```bash
# 依存パッケージインストール
npm install

# 環境変数設定
cp .env.example .env
# .env を編集してDB接続情報を設定

# Prisma クライアント生成 + DB作成
npx prisma generate
npx prisma db push

# シードデータ投入
npm run db:seed

# DBセキュリティ設定（PostgreSQL トリガー）
npm run db:setup-security

# 開発サーバー起動
npm run dev
```

## ログイン情報（開発用）

| ロール | メール | パスワード |
|--------|--------|------------|
| 管理者 | admin@example.com | admin123 |
| マネージャー | manager@example.com | manager123 |
| メンバー | member@example.com | member123 |

## 本番デプロイ（Xserver VPS）

```bash
# ビルド
npm run build

# PM2で起動
pm2 start npm --name "manage" -- start

# Nginx リバースプロキシ設定
# /etc/nginx/sites-available/manage.conf を参照
```

## バックアップ

```bash
# 手動バックアップ
npm run backup

# cron設定（毎日5:00）
0 5 * * * /path/to/scripts/backup.sh
```
