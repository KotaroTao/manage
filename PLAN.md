# 支払い管理 全社経費統合 実装計画

## 概要
- 2階層分類(大分類→小分類) + タグ
- 事業紐付け(既存Business)
- 予算管理(大分類×事業×月次)
- 金額閾値ベースの承認フロー
- 経営分析(予算実績比較)

## Phase 1: スキーマ変更

### 新規モデル

**ExpenseCategory (経費カテゴリ)**
- id, name, parentId?(null=大分類), description?, sortOrder, isActive, budgetTarget(予算管理対象フラグ)
- 自己参照リレーション(親子)

**Budget (予算)**
- id, categoryId(大分類), businessId?(null=全社), period("2026-01"), amount(予算額)
- @@unique([categoryId, businessId, period])

**ApprovalRule (承認ルール)**
- id, name, minAmount, maxAmount?, requiredRole(Role), autoApprove, sortOrder, isActive
- 例: 10万未満→自動承認, 10万〜100万→MANAGER, 100万超→ADMIN

### 既存モデル変更

**Payment**
- `partnerId` を Optional に変更 (パートナーなし経費対応)
- `categoryId String?` 追加 (ExpenseCategory紐付け)
- `PaymentType` enum 廃止 → categoryで管理

**TagCategory enum**
- `PAYMENT` 追加

**EntityTag**
- `payment Payment?` リレーション追加

### シードデータ (7大分類 + 小分類)
提案された分類を2階層に整理して投入

## Phase 2: API

### 新規API
1. `/api/settings/expense-categories` - GET(ツリー)/POST/PUT/DELETE
2. `/api/settings/budgets` - GET(期間・事業フィルタ)/POST/PUT/DELETE
3. `/api/settings/approval-rules` - GET/POST/PUT/DELETE
4. `/api/analytics/budget` - GET 予算実績比較(大分類×事業×期間)

### 既存API変更
5. `POST /api/payments` - partnerId任意、categoryId追加、承認ルール自動判定
6. `PUT /api/payments/[id]` - ステータス遷移時に承認ルールチェック
7. `GET /api/payments` - カテゴリフィルタ追加

## Phase 3: フロントエンド

### 設定画面 (3ページ)
8. `/settings/categories` - カテゴリ管理(ツリー表示・CRUD)
9. `/settings/budgets` - 予算管理(マトリクス表示: 大分類×月)
10. `/settings/approval-rules` - 承認ルール設定(金額閾値テーブル)
11. `/settings` ハブに3つのカードを追加

### 支払いページ更新
12. 支払い作成/編集フォームにカテゴリ選択追加(大→小のカスケード)
13. パートナー任意化(パートナーなし経費の入力)
14. 一覧にカテゴリ列追加・カテゴリフィルタ
15. 承認時に自動チェック表示

### 経営分析
16. `/reports` またはダッシュボードに予算実績グラフ追加

## 実装順序
1→2→3→5→6→7→4→8→9→10→11→12→13→14→15→16
(スキーマ→シード→API→フロントエンドの順)
