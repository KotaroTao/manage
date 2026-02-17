# GCP移行ガイド: Cloud SQL + Cloud Run

> **前提**: 既に別アプリが Cloud Run + Cloud SQL (asia-northeast1) で稼働中

## 構成

```
GitHub (main push)
  → Cloud Build (Docker build)
    → Artifact Registry (イメージ保存)
      → Cloud Run "manage" (アプリ実行, port 8080)
        → Cloud SQL "manage-db" (PostgreSQL 17, 新規インスタンス)
```

## 事前準備

```bash
export PROJECT_ID="YOUR_PROJECT_ID"   # ← ここを書き換え
export REGION="asia-northeast1"
gcloud config set project $PROJECT_ID
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
```

---

## Step 1: 不足 API の有効化確認

別アプリで Cloud Run + Cloud SQL を使っていれば大半は有効済み。念のため確認:

```bash
gcloud services list --enabled --filter="NAME:(cloudbuild OR run OR sqladmin OR artifactregistry OR secretmanager)" --format="value(NAME)"
```

不足があれば有効化:
```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

## Step 2: Artifact Registry

既存リポジトリの確認:
```bash
gcloud artifacts repositories list --location=$REGION
```

manage 用リポジトリがなければ作成:
```bash
gcloud artifacts repositories create manage \
  --repository-format=docker \
  --location=$REGION \
  --description="manage app images"
```

## Step 3: Cloud SQL 新規インスタンス作成

```bash
# PostgreSQL 17 インスタンス
gcloud sql instances create manage-db \
  --database-version=POSTGRES_17 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --availability-type=zonal \
  --database-flags=log_min_duration_statement=1000

# DB 作成
gcloud sql databases create manage_db --instance=manage-db

# ユーザー作成 (パスワードを控えておく)
DB_PASSWORD=$(openssl rand -base64 32)
echo "DB_PASSWORD: $DB_PASSWORD"   # ← 安全に保管
gcloud sql users create manage_user --instance=manage-db --password="$DB_PASSWORD"
```

接続名の確認:
```bash
gcloud sql instances describe manage-db --format="value(connectionName)"
# → YOUR_PROJECT_ID:asia-northeast1:manage-db
```

## Step 4: Secret Manager にシークレット登録

```bash
# DATABASE_URL (Cloud Run → Cloud SQL Auth Proxy 経由)
echo -n "postgresql://manage_user:${DB_PASSWORD}@localhost:5432/manage_db?host=/cloudsql/${PROJECT_ID}:${REGION}:manage-db" | \
  gcloud secrets create manage-database-url --data-file=-

# JWT_SECRET
echo -n "$(openssl rand -base64 64)" | \
  gcloud secrets create manage-jwt-secret --data-file=-
```

Cloud Run サービスアカウントにアクセス権付与:
```bash
# 既に別アプリで secretAccessor を付与済みなら不要な場合あり
# manage 専用シークレットなので念のため実行
for SECRET in manage-database-url manage-jwt-secret; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

## Step 5: IAM 権限確認

別アプリのデプロイで設定済みの可能性が高い。確認:

```bash
# Cloud Build → Cloud Run デプロイ権限
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/run.admin AND bindings.members:cloudbuild" \
  --format="value(bindings.members)"
```

空なら付与:
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding \
  ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

Cloud SQL Client 権限 (既に別インスタンスで設定済みなら不要):
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

## Step 6: Cloud Build トリガー作成

```bash
# GitHub リポジトリ接続 (別アプリで接続済みならスキップ)
# Console: https://console.cloud.google.com/cloud-build/triggers/connect

gcloud builds triggers create github \
  --name="manage-deploy" \
  --repo-name="manage" \
  --repo-owner="KotaroTao" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --substitutions="_REGION=${REGION},_SERVICE_NAME=manage,_CLOUD_SQL_CONNECTION=${PROJECT_ID}:${REGION}:manage-db"
```

## Step 7: 初回デプロイ

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions="_REGION=${REGION},_SERVICE_NAME=manage,_CLOUD_SQL_CONNECTION=${PROJECT_ID}:${REGION}:manage-db"
```

## Step 8: DB スキーマ適用 + データ移行

### 8-1. Cloud SQL Auth Proxy 起動

```bash
# 別ターミナルで起動
cloud-sql-proxy ${PROJECT_ID}:${REGION}:manage-db --port=5433
```

### 8-2. スキーマ適用

```bash
DATABASE_URL="postgresql://manage_user:${DB_PASSWORD}@localhost:5433/manage_db" \
  npx prisma db push
```

### 8-3. VPS からデータ移行

```bash
# VPS 上で実行: ダンプ取得
ssh root@210.131.223.161 \
  "PGPASSWORD=qkRcxuGYu7jQZ1hz442pEwYV8h0wLG pg_dump -h localhost -U manage_user -d manage_db --no-owner --no-privileges -Fc -f /tmp/manage_db.dump"

# ダンプをローカルに転送
scp root@210.131.223.161:/tmp/manage_db.dump ./manage_db.dump

# Auth Proxy 経由でリストア
PGPASSWORD=$DB_PASSWORD pg_restore -h localhost -p 5433 -U manage_user \
  -d manage_db --no-owner --no-privileges manage_db.dump
```

### 8-4. セキュリティトリガー適用

```bash
PGPASSWORD=$DB_PASSWORD psql -h localhost -p 5433 -U manage_user -d manage_db \
  -f scripts/setup-db-security.sql
```

## Step 9: カスタムドメイン設定

```bash
gcloud run domain-mappings create \
  --service=manage \
  --domain=manage.tao-dx.com \
  --region=$REGION
```

表示される CNAME レコードを DNS に追加。SSL は Google が自動管理。

---

## 以降のデプロイ

main ブランチに push するだけで自動デプロイされる:

```
git push origin main
  → Cloud Build が自動トリガー
    → Docker build → Artifact Registry → Cloud Run デプロイ
```

---

## ローカル開発 (Docker Compose)

```bash
docker compose up -d                              # 起動
docker compose exec app npx prisma db push        # スキーマ適用 (初回)
docker compose exec app npx tsx prisma/seed.ts    # シードデータ (初回)
docker compose logs -f app                         # ログ確認
docker compose down                                # 停止
docker compose down -v                             # 完全削除
```

---

## コスト概算 (月額、既存プロジェクト追加分)

| サービス | スペック | 月額概算 |
|---------|---------|---------|
| Cloud SQL | db-f1-micro (新規インスタンス) | ~$10 |
| Cloud Run | 1 vCPU, 1GB, min=0 | ~$0-30 |
| Artifact Registry | イメージ保存 | ~$1 |
| Secret Manager | 2 シークレット | ~$0 |
| **追加コスト合計** | | **~$11-41/月** |

min-instances=0 → コールドスタートあり (5-10秒)
min-instances=1 → 常時起動、+$30/月

---

## トラブルシューティング

### Cloud Run → Cloud SQL 接続エラー
1. `cloudsql.client` 権限があるか確認
2. `--add-cloudsql-instances` の接続名が正しいか確認
3. DATABASE_URL の `?host=/cloudsql/CONNECTION_NAME` が正しいか確認

### コールドスタートが遅い
- cloud-run-service.yaml で `startup-cpu-boost: true` 設定済み
- 必要なら `min-instances=1` に変更

### Prisma v6 制約
- **v7 にアップグレードしないこと** (破壊的変更あり)
- `prisma generate` は Dockerfile 内でビルド時に実行される
