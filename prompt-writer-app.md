# Claude Code プロンプト: /writer アプリ新規構築

以下の指示に従って、新しいWebアプリケーション「writer」を構築してください。

---

## 1. プロジェクト概要

- **アプリ名**: writer
- **リポジトリ**: KotaroTao/writer (GitHub)
- **本番URL**: https://writer.tao-dx.com
- **VPS**: 210.131.223.161 (Xserver VPS, Ubuntu 25.04) ※既存アプリと同居
- **用途**: [ここにアプリの目的・機能を記述する]

---

## 2. 技術スタック (manage と完全同一)

| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 16 (App Router) + TypeScript |
| ORM | Prisma v6 + PostgreSQL 17 |
| 認証 | カスタムJWT (jose HS256) + httpOnly Cookie (`auth_token`) |
| CSS | Tailwind CSS v4 (@tailwindcss/postcss) |
| プロセス管理 | PM2 cluster mode |
| Webサーバー | Nginx (SSL/HTTPS, Let's Encrypt) |
| デプロイ | GitHub Actions (main push → 自動デプロイ) |
| バックアップ | 日次 cron (pg_dump + ファイル, 7日保持) |

---

## 3. VPS ポート割り当て (既存アプリとの共存)

| ポート | アプリ | 状態 |
|--------|--------|------|
| 3000 | dental-app | 使用中 (絶対に使わない) |
| 8888 | manage | 使用中 |
| **9999** | **writer** | **新規 (このアプリ)** |

**重要**: ポート 3000, 8888 は絶対に使わないこと。writerはポート9999を使用する。

---

## 4. 依存パッケージ (package.json)

```json
{
  "name": "writer",
  "version": "1.0.0",
  "description": "[アプリの説明]",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:seed": "npx tsx prisma/seed.ts",
    "db:studio": "prisma studio",
    "db:setup-security": "psql $DATABASE_URL -f scripts/setup-db-security.sql",
    "backup": "bash scripts/backup.sh",
    "setup": "npm install && prisma generate && prisma db push && npx tsx prisma/seed.ts"
  },
  "prisma": {
    "seed": "npx tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.19.2",
    "@tailwindcss/postcss": "^4.1.18",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^25.2.2",
    "@types/react": "^19.2.13",
    "@types/react-dom": "^19.2.3",
    "@types/uuid": "^10.0.0",
    "bcryptjs": "^3.0.3",
    "jose": "^6.1.3",
    "next": "^16.1.6",
    "postcss": "^8.5.6",
    "prisma": "^6.19.2",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "tailwindcss": "^4.1.18",
    "typescript": "^5.9.3",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0"
  }
}
```

**Prisma制約**: 必ず v6 を使うこと。v7 は `datasource` の `url` 設定に破壊的変更あり。

---

## 5. 認証システム (manage と同一方式)

NextAuth は使わない。カスタムJWT + httpOnly Cookie 方式。

### 構成ファイル

**`src/lib/auth.ts`** — JWT 生成・検証・セッション取得
```typescript
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
);
const COOKIE_NAME = "auth_token";
const MAX_AGE = 7 * 24 * 60 * 60; // 7日

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  role: string; // "ADMIN" | "MEMBER" など
  isActive: boolean;
}

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || !payload.isActive) return null;
  return { id: payload.userId, email: payload.email, name: payload.name, role: payload.role };
}
```

**API**: `/api/auth/login` (POST), `/api/auth/logout` (POST), `/api/auth/me` (GET)

**Cookie設定**:
```typescript
response.cookies.set(COOKIE_NAME, token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: MAX_AGE,
  path: "/",
});
```

**クライアント側**: `useAuth()` フック (`src/contexts/auth-context.tsx`) で `/api/auth/me` を呼び出してユーザー状態を管理。

**ミドルウェア** (`src/middleware.ts`): `jose` の `jwtVerify` で直接検証。公開パスはスキップ。無効トークンは `/login` にリダイレクト + Cookie 削除。

---

## 6. API レスポンス規約 (必須)

**全APIで `{ data: ... }` でラップすること。** フロントエンドは `json.data` でアクセスする。

```typescript
// 一覧取得 (GET)
return NextResponse.json({ data: items });

// ページネーション付き
return NextResponse.json({ data: items, pagination: { page, limit, total, totalPages } });

// 単体取得 (GET)
return NextResponse.json({ data: item });

// 作成 (POST)
return NextResponse.json({ data: created }, { status: 201 });

// 更新 (PUT) ※ PATCH は使わない
return NextResponse.json({ data: updated });

// 削除 (DELETE)
return NextResponse.json({ data: null, message: "削除しました" });

// エラー
return NextResponse.json({ error: "メッセージ" }, { status: 4xx });
```

---

## 7. ディレクトリ構成

```
writer/
├── .github/
│   └── workflows/
│       ├── ci.yml           # CI (型チェック + ビルド)
│       └── deploy.yml       # main push → VPS自動デプロイ
├── deploy/
│   └── ecosystem.config.js  # PM2設定 (PORT: 9999)
├── prisma/
│   ├── schema.prisma        # DB スキーマ
│   └── seed.ts              # シードデータ
├── scripts/
│   ├── setup-vps.sh         # VPS初期セットアップ
│   ├── setup-db-security.sql # DBトリガー (監査ログ不変化)
│   └── backup.sh            # 日次バックアップ
├── src/
│   ├── app/
│   │   ├── (dashboard)/     # 認証済みページ (レイアウト付き)
│   │   ├── login/           # ログインページ
│   │   └── api/             # APIルート
│   ├── components/
│   │   ├── ui/              # 共通UIコンポーネント (button, input, modal, toast等)
│   │   └── layout/          # sidebar, header, main-layout
│   ├── contexts/
│   │   └── auth-context.tsx  # AuthProvider, useAuth
│   ├── lib/
│   │   ├── auth.ts          # JWT生成・検証, getSession
│   │   ├── prisma.ts        # Prismaクライアント (シングルトン)
│   │   └── utils.ts         # ユーティリティ (formatCurrency, formatDate等)
│   ├── middleware.ts         # JWT検証 + セキュリティヘッダー
│   └── types/
│       └── index.ts         # 共通型定義
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── postcss.config.mjs
└── next.config.ts
```

---

## 8. PM2 設定 (`deploy/ecosystem.config.js`)

```javascript
module.exports = {
  apps: [
    {
      name: "writer",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/var/www/writer",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 9999,
      },
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/pm2/writer-error.log",
      out_file: "/var/log/pm2/writer-out.log",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
```

---

## 9. GitHub Actions

### CI (`ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - name: Build
        run: npm run build
        env:
          DATABASE_URL: "postgresql://user:pass@localhost:5432/dummy"
          JWT_SECRET: "ci-build-check-secret"
```

### Deploy (`deploy.yml`)

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - name: Build check
        run: npm run build
        env:
          DATABASE_URL: "postgresql://user:pass@localhost:5432/dummy"
          JWT_SECRET: "ci-build-check-secret"

  deploy:
    needs: ci
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to VPS via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: 22
          command_timeout: 10m
          script: |
            set -e
            cd /var/www/writer
            git stash --include-untracked || true
            git checkout main || true
            git pull --rebase origin main
            npm ci
            npx prisma generate
            npx prisma db push --skip-generate
            npm run build
            pm2 restart writer || pm2 start deploy/ecosystem.config.js
            pm2 save
            echo "=== Deploy complete: $(date) ==="

      - name: Health check
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: 22
          script: |
            sleep 5
            if curl -sf http://localhost:9999/login > /dev/null; then
              echo "Health check OK"
            else
              echo "Health check FAILED"
              exit 1
            fi
```

**GitHub Secrets に設定するもの**:
- `VPS_HOST`: 210.131.223.161
- `VPS_USER`: root
- `VPS_SSH_KEY`: SSH秘密鍵
- (DB情報は VPS の .env に直接設定するため不要)

---

## 10. Nginx 設定

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=writer_api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=writer_login:10m rate=5r/m;

server {
    listen 80;
    server_name writer.tao-dx.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name writer.tao-dx.com;

    ssl_certificate /etc/letsencrypt/live/writer.tao-dx.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/writer.tao-dx.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    access_log /var/log/nginx/writer_access.log;
    error_log /var/log/nginx/writer_error.log;

    location /api/auth {
        limit_req zone=writer_login burst=3 nodelay;
        proxy_pass http://127.0.0.1:9999;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        limit_req zone=writer_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:9999;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /_next/static {
        proxy_pass http://127.0.0.1:9999;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:9999;
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
```

---

## 11. VPS セットアップスクリプト (`scripts/setup-vps.sh`)

VPS 上で `bash /tmp/setup-writer.sh` として root 実行する想定。

手順:
1. PostgreSQL に `writer_user` / `writer_db` を作成 (パスワード自動生成)
2. `/var/www/writer` に git clone
3. `.env` を自動生成 (`DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`)
4. `npm ci && prisma generate && prisma db push && npm run build`
5. シードデータ投入 (`npx tsx prisma/seed.ts`)
6. DBセキュリティSQL適用 (`scripts/setup-db-security.sql`)
7. Nginx設定を `/etc/nginx/sites-available/writer.tao-dx.com` に作成 + シンボリックリンク
8. PM2 で起動 (`pm2 start deploy/ecosystem.config.js && pm2 save`)
9. SSL証明書取得案内を表示 (`certbot certonly --webroot -w /var/www/html -d writer.tao-dx.com`)

---

## 12. バックアップスクリプト (`scripts/backup.sh`)

manage と同じ構成:
- 保存先: `/var/backups/writer/YYYYMMDD/`
- DB完全バックアップ: `pg_dump --format=custom --compress=9`
- 監査ログ別途バックアップ
- アップロードファイル、.env、Nginx設定、PM2設定をtar.gz
- 7日超過分を自動削除
- 復元: `./backup.sh --restore YYYYMMDD` で PM2停止 → DB復元 → 再ビルド → 起動

cron設定: `0 4 * * * DB_PASSWORD=xxxx /var/www/writer/scripts/backup.sh`
(manage は 3時、writer は 4時にずらす)

---

## 13. DB セキュリティ (`scripts/setup-db-security.sql`)

- 監査ログテーブル (AuditLog, DataVersion) の UPDATE/DELETE をトリガーで禁止
- 重要テーブルの変更を自動記録するトリガー
- JSONB フィールド用 GIN インデックス (必要に応じて)

---

## 14. セキュリティ対策チェックリスト

- [ ] ミドルウェアで JWT 検証 + isActive チェック
- [ ] ミドルウェアでセキュリティヘッダー付与 (X-Frame-Options, X-Content-Type-Options 等)
- [ ] ログイン API にレート制限 (IPベース, 15分間30回)
- [ ] 全API で `getSession()` による認証チェック
- [ ] ソフトデリート (deletedAt カラム)
- [ ] 監査ログ (AuditLog テーブル + PostgreSQL トリガーで不変化)
- [ ] bcryptjs によるパスワードハッシュ化
- [ ] .env ファイルの chmod 600

---

## 15. Prisma 注意事項

- **必ず v6 を使用**: `prisma@^6.0.0` と `@prisma/client@^6.0.0`
- **JSON フィールド**: `InputJsonValue` 型エラー回避に `JSON.parse(JSON.stringify(obj))` を使用
- **NULL の @@unique**: PostgreSQL は NULL を distinct として扱うため `@@unique([name, parentId])` は parentId が null の場合に正しく動作しない → `@@index` を使うか `findFirst/create` パターンで対応
- **datasource**: `url = env("DATABASE_URL")` を使用

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

---

## 16. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## 17. CLAUDE.md テンプレート

プロジェクトルートに以下のCLAUDE.mdを作成すること:

```markdown
# writer

## プロジェクト概要
[アプリの説明]
- 本番URL: https://writer.tao-dx.com
- VPS: 210.131.223.161 (Xserver VPS, Ubuntu 25.04)

## 技術スタック
- **フレームワーク**: Next.js 16 (App Router) + TypeScript
- **ORM**: Prisma v6 + PostgreSQL 17
- **認証**: カスタムJWT (jose) + httpOnly Cookie (`auth_token`)
- **CSS**: Tailwind CSS v4 (@tailwindcss/postcss)
- **プロセス管理**: PM2 cluster mode (ポート9999)
- **Webサーバー**: Nginx (SSL/HTTPS, Let's Encrypt)
- **デプロイ**: GitHub Actions (mainブランチpush → 自動デプロイ)

## 重要: Prisma v6 制約
- Prisma v7 は `url` 設定の破壊的変更あり。v6を使うこと
- `InputJsonValue` 型エラー回避: `JSON.parse(JSON.stringify(obj))` を使用
- `prisma@^6.0.0` と `@prisma/client@^6.0.0` を維持

## ビルド・実行コマンド
npm run build          # 本番ビルド
npm run dev            # 開発サーバー (localhost:3000)
npx prisma generate    # Prismaクライアント生成
npx prisma db push     # スキーマをDBに反映
npx tsx prisma/seed.ts # シードデータ投入

## 認証システム
- **方式**: カスタムJWT (jose HS256) + httpOnly Cookie
- **Cookie名**: `auth_token` (secure: 本番のみ, sameSite: lax, 有効期限: 7日)
- **環境変数**: `JWT_SECRET`
- **API**: `/api/auth/login` (POST), `/api/auth/logout` (POST), `/api/auth/me` (GET)
- **クライアント**: `useAuth()` フック (`src/contexts/auth-context.tsx`)
- **サーバー**: `getSession()` (`src/lib/auth.ts`)
- **ミドルウェア**: jose `jwtVerify` で直接検証 (`src/middleware.ts`)

## API レスポンス規約
**必ず守ること**: フロントエンドは `json.data` でデータにアクセスする
- 一覧: `NextResponse.json({ data: items })`
- 単体: `NextResponse.json({ data: item })`
- 作成: `NextResponse.json({ data: created }, { status: 201 })`
- エラー: `NextResponse.json({ error: "メッセージ" }, { status: 4xx })`

## VPS デプロイ情報
- アプリパス: `/var/www/writer`
- ポート: **9999**
- PM2設定: `deploy/ecosystem.config.js`
- Nginx設定: `/etc/nginx/sites-available/writer.tao-dx.com`

## 既知の注意点
- VPS上の他アプリ: dental-app(3000), manage(8888), mieru-clinic, zoom-backend, zoom-dashboard
- git pull時は `--rebase` フラグが必要
```

---

## 18. シードデータ (最低限)

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 12);

  // 管理者ユーザー
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: '管理者',
      password: hashedPassword,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('シードデータ投入完了');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

ログイン情報: `admin@example.com` / `admin123`

---

## 19. VPS デプロイ手順 (手動)

```bash
# VPS に SSH 接続後
cd /var/www/writer
git pull --rebase origin main
npm ci && npx prisma generate && npx prisma db push --skip-generate
npm run build
pm2 restart writer
```

---

## 20. 構築の実行順序

Claude Code に対して以下の順序で実行を指示する:

1. **プロジェクト初期化**: `npx create-next-app@latest writer` → 上記設定で上書き
2. **依存関係インストール**: package.json を作成して `npm install`
3. **Prisma スキーマ定義**: `prisma/schema.prisma` にモデル定義
4. **認証システム構築**: auth.ts, middleware.ts, auth-context.tsx, login API
5. **共通UIコンポーネント**: button, input, modal, toast, card, badge 等
6. **レイアウト**: sidebar, header, main-layout
7. **ページ実装**: ダッシュボード、各機能ページ
8. **デプロイ設定**: ecosystem.config.js, ci.yml, deploy.yml, setup-vps.sh, backup.sh, nginx.conf
9. **CLAUDE.md 作成**
10. **ビルド確認**: `npm run build` で成功することを確認
11. **GitHub にプッシュ**: `git push -u origin main`

---

## 注意事項まとめ

- **NextAuth は使わない** (Nginx プロキシ背後で Cookie 問題が発生するため)
- **jose ライブラリで JWT を直接扱う** (SignJWT / jwtVerify)
- **Prisma は必ず v6** (v7 の破壊的変更を避ける)
- **ポートは 9999** (3000 と 8888 は既存アプリが使用中)
- **API は全て `{ data: ... }` でラップ** する
- **更新は PUT を使う** (PATCH は使わない)
- **git pull は `--rebase` フラグ必須** (VPS上でのdivergent branches対策)
