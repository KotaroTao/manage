# GCP移行ガイド: Cloud SQL + Cloud Run

## 概要

VPS (Xserver) → GCP への移行構成:

```
GitHub (main push)
  → Cloud Build (Docker build)
    → Artifact Registry (イメージ保存)
      → Cloud Run (アプリ実行)
        → Cloud SQL PostgreSQL 17 (データベース)
```

## 前提条件

- GCP プロジェクト作成済み
- `gcloud` CLI インストール済み
- 課金有効化済み

```bash
# プロジェクト設定
export PROJECT_ID="your-project-id"
export REGION="asia-northeast1"
gcloud config set project $PROJECT_ID
```

---

## Step 1: GCP API 有効化

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

## Step 2: Artifact Registry リポジトリ作成

```bash
gcloud artifacts repositories create manage \
  --repository-format=docker \
  --location=$REGION \
  --description="manage app images"
```

## Step 3: Cloud SQL インスタンス作成

```bash
# PostgreSQL 17 インスタンス作成
gcloud sql instances create manage-db \
  --database-version=POSTGRES_17 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --availability-type=zonal \
  --database-flags=log_min_duration_statement=1000

# データベース作成
gcloud sql databases create manage_db \
  --instance=manage-db

# ユーザー作成
gcloud sql users create manage_user \
  --instance=manage-db \
  --password="$(openssl rand -base64 32)"
```

**注意**: パスワードは安全に保管すること。

### 接続名の確認

```bash
gcloud sql instances describe manage-db --format="value(connectionName)"
# → your-project-id:asia-northeast1:manage-db
```

## Step 4: Secret Manager にシークレット登録

```bash
# DATABASE_URL (Cloud SQL Auth Proxy 経由の接続)
echo -n "postgresql://manage_user:YOUR_PASSWORD@localhost:5432/manage_db?host=/cloudsql/PROJECT_ID:asia-northeast1:manage-db" | \
  gcloud secrets create DATABASE_URL --data-file=-

# JWT_SECRET
echo -n "$(openssl rand -base64 64)" | \
  gcloud secrets create JWT_SECRET --data-file=-
```

### Cloud Build / Cloud Run にシークレットアクセス権付与

```bash
# Cloud Build サービスアカウント
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding JWT_SECRET \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 5: Cloud Build トリガー作成

```bash
# GitHub リポジトリ接続 (初回のみ、Console から実施推奨)
# https://console.cloud.google.com/cloud-build/triggers/connect

# トリガー作成
gcloud builds triggers create github \
  --name="manage-deploy" \
  --repo-name="manage" \
  --repo-owner="KotaroTao" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --substitutions="_REGION=${REGION},_SERVICE_NAME=manage,_CLOUD_SQL_CONNECTION=${PROJECT_ID}:${REGION}:manage-db"
```

### Cloud Build に Cloud Run デプロイ権限を付与

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding \
  ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Cloud SQL Client 権限
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

## Step 6: 初回デプロイ

```bash
# 手動ビルド＆デプロイ
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions="_REGION=${REGION},_SERVICE_NAME=manage,_CLOUD_SQL_CONNECTION=${PROJECT_ID}:${REGION}:manage-db"
```

## Step 7: データベースマイグレーション

Cloud SQL Auth Proxy 経由でローカルからスキーマを適用する。

```bash
# Auth Proxy 起動 (別ターミナル)
cloud-sql-proxy ${PROJECT_ID}:${REGION}:manage-db --port=5433

# 別ターミナルでスキーマ適用
DATABASE_URL="postgresql://manage_user:YOUR_PASSWORD@localhost:5433/manage_db" \
  npx prisma db push

# シードデータ投入 (必要な場合)
DATABASE_URL="postgresql://manage_user:YOUR_PASSWORD@localhost:5433/manage_db" \
  npx tsx prisma/seed.ts

# セキュリティトリガー適用
PGPASSWORD=YOUR_PASSWORD psql -h localhost -p 5433 -U manage_user -d manage_db \
  -f scripts/setup-db-security.sql
```

## Step 8: カスタムドメイン設定

```bash
# Cloud Run にドメインマッピング
gcloud run domain-mappings create \
  --service=manage \
  --domain=manage.tao-dx.com \
  --region=$REGION
```

DNS 設定で表示される CNAME レコードをドメインの DNS に追加する。
SSL 証明書は Google が自動管理する (Let's Encrypt 不要)。

---

## VPS からのデータ移行

### 1. VPS から PostgreSQL ダンプ取得

```bash
# VPS 上で実行
pg_dump -h localhost -U manage_user -d manage_db \
  --no-owner --no-privileges \
  -F c -f manage_db_backup.dump
```

### 2. Cloud SQL にリストア

```bash
# ダンプファイルを GCS にアップロード
gsutil cp manage_db_backup.dump gs://${PROJECT_ID}-backups/

# Cloud SQL にインポート
gcloud sql import sql manage-db \
  gs://${PROJECT_ID}-backups/manage_db_backup.dump \
  --database=manage_db --user=manage_user
```

**注意**: `pg_dump` の custom format (`-Fc`) は `gcloud sql import` で直接使えない場合がある。
その場合は plain format (`-Fp`) で再取得するか、Cloud SQL Auth Proxy 経由で `pg_restore` を使用:

```bash
# Auth Proxy 経由で直接リストア
cloud-sql-proxy ${PROJECT_ID}:${REGION}:manage-db --port=5433 &
PGPASSWORD=YOUR_PASSWORD pg_restore -h localhost -p 5433 -U manage_user \
  -d manage_db --no-owner --no-privileges manage_db_backup.dump
```

---

## コスト概算 (月額)

| サービス | スペック | 月額概算 |
|---------|---------|---------|
| Cloud SQL | db-f1-micro (共有vCPU, 0.6GB RAM) | ~$10 |
| Cloud Run | 1 vCPU, 1GB RAM, min 0 instances | ~$0-30 (従量課金) |
| Artifact Registry | イメージ保存 | ~$1 |
| Secret Manager | 2 シークレット | ~$0 |
| **合計** | | **~$11-41/月** |

**注意**: Cloud Run は min-instances=0 でアイドル時のコストをゼロにできるが、
コールドスタートが発生する (5-10秒)。常時起動が必要な場合は `min-instances=1` に設定。

### スケールアップ時の目安

本番環境で安定運用する場合:
- Cloud SQL: `db-custom-1-3840` (1 vCPU, 3.75GB) → ~$50/月
- Cloud Run: `min-instances=1` → ~$30-60/月

---

## ローカル開発 (Docker Compose)

```bash
# 起動
docker compose up -d

# ログ確認
docker compose logs -f app

# DBスキーマ適用 (初回)
docker compose exec app npx prisma db push

# シードデータ (初回)
docker compose exec app npx tsx prisma/seed.ts

# 停止
docker compose down

# データも含めて完全削除
docker compose down -v
```

---

## トラブルシューティング

### Cloud Run からCloud SQL に接続できない

1. Cloud SQL Admin API が有効か確認
2. Cloud Run サービスアカウントに `roles/cloudsql.client` 権限があるか確認
3. `--add-cloudsql-instances` フラグが正しいか確認
4. DATABASE_URL の `?host=/cloudsql/CONNECTION_NAME` 形式が正しいか確認

### コールドスタートが遅い

- `min-instances=1` に変更して常時1インスタンスを起動
- `startup-cpu-boost: true` (cloud-run-service.yaml で設定済み)

### Prisma v6 関連

- Prisma v7 にアップグレードしないこと (破壊的変更あり)
- `prisma generate` はビルド時に実行される (Dockerfile で設定済み)
