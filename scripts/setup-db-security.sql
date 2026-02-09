-- ============================================================
-- PostgreSQL セキュリティ設定
-- 悪意あるパートナーからのデータ保護
-- ============================================================

-- 1. 監査ログテーブルの保護（DELETE/UPDATE禁止）
-- アプリケーションユーザーからのDELETE/UPDATEを防止するトリガー

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '監査ログの変更・削除は禁止されています';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- AuditLog の UPDATE/DELETE を禁止
DROP TRIGGER IF EXISTS protect_audit_log ON "AuditLog";
CREATE TRIGGER protect_audit_log
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- DataVersion の UPDATE/DELETE を禁止
DROP TRIGGER IF EXISTS protect_data_version ON "DataVersion";
CREATE TRIGGER protect_data_version
  BEFORE UPDATE OR DELETE ON "DataVersion"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- 2. 重要テーブルの変更を自動記録するトリガー

CREATE OR REPLACE FUNCTION auto_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO "AuditLog" (id, action, entity, "entityId", before, "createdAt")
    VALUES (gen_random_uuid(), 'DELETE', TG_TABLE_NAME, OLD.id::text, row_to_json(OLD), NOW());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "AuditLog" (id, action, entity, "entityId", before, after, "createdAt")
    VALUES (gen_random_uuid(), 'UPDATE', TG_TABLE_NAME, NEW.id::text, row_to_json(OLD), row_to_json(NEW), NOW());
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO "AuditLog" (id, action, entity, "entityId", after, "createdAt")
    VALUES (gen_random_uuid(), 'INSERT', TG_TABLE_NAME, NEW.id::text, row_to_json(NEW), NOW());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Customer テーブルの自動監査
DROP TRIGGER IF EXISTS audit_customer ON "Customer";
CREATE TRIGGER audit_customer
  AFTER INSERT OR UPDATE OR DELETE ON "Customer"
  FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

-- CustomerBusiness テーブルの自動監査
DROP TRIGGER IF EXISTS audit_customer_business ON "CustomerBusiness";
CREATE TRIGGER audit_customer_business
  AFTER INSERT OR UPDATE OR DELETE ON "CustomerBusiness"
  FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

-- Partner テーブルの自動監査
DROP TRIGGER IF EXISTS audit_partner ON "Partner";
CREATE TRIGGER audit_partner
  AFTER INSERT OR UPDATE OR DELETE ON "Partner"
  FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

-- Payment テーブルの自動監査
DROP TRIGGER IF EXISTS audit_payment ON "Payment";
CREATE TRIGGER audit_payment
  AFTER INSERT OR UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

-- Workflow テーブルの自動監査
DROP TRIGGER IF EXISTS audit_workflow ON "Workflow";
CREATE TRIGGER audit_workflow
  AFTER INSERT OR UPDATE OR DELETE ON "Workflow"
  FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

-- WorkflowStep テーブルの自動監査
DROP TRIGGER IF EXISTS audit_workflow_step ON "WorkflowStep";
CREATE TRIGGER audit_workflow_step
  AFTER INSERT OR UPDATE OR DELETE ON "WorkflowStep"
  FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

-- Task テーブルの自動監査
DROP TRIGGER IF EXISTS audit_task ON "Task";
CREATE TRIGGER audit_task
  AFTER INSERT OR UPDATE OR DELETE ON "Task"
  FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

-- SharedPage テーブルの自動監査
DROP TRIGGER IF EXISTS audit_shared_page ON "SharedPage";
CREATE TRIGGER audit_shared_page
  AFTER INSERT OR UPDATE OR DELETE ON "SharedPage"
  FOR EACH ROW EXECUTE FUNCTION auto_audit_trigger();

-- 3. パフォーマンス用インデックス（Prismaで定義しきれないもの）

-- JSONB カスタムフィールド検索用GINインデックス
CREATE INDEX IF NOT EXISTS idx_cb_custom_fields
  ON "CustomerBusiness" USING GIN ("customFields" jsonb_path_ops);

-- 複合インデックス（ダッシュボード高速化）
CREATE INDEX IF NOT EXISTS idx_ws_active_due
  ON "WorkflowStep" ("assigneeId", "dueDate")
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_task_active_due
  ON "Task" ("assigneeId", "dueDate")
  WHERE status = 'ACTIVE' AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_cb_next_action_null
  ON "CustomerBusiness" ("assigneeId")
  WHERE "nextActionDate" IS NULL AND "deletedAt" IS NULL AND status = 'ACTIVE';

-- 4. Row-Level Security (パートナーアクセス制限)
-- ※ アプリケーションレベルでも制御するが、DB層でも防御

-- パートナーユーザー用の制限ポリシー（将来的にRLS有効化時に使用）
-- ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "CustomerBusiness" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;

-- 5. パスワードポリシー確認用関数
CREATE OR REPLACE FUNCTION check_password_strength(password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- 最低8文字
  IF LENGTH(password) < 8 THEN
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_password_strength IS 'パスワード強度チェック（アプリ側でも検証）';
