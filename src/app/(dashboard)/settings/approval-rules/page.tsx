'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatCurrency, getApiError } from '@/lib/utils';

interface ApprovalRule {
  id: string;
  name: string;
  minAmount: number;
  maxAmount: number | null;
  requiredRole: string;
  autoApprove: boolean;
  sortOrder: number;
  isActive: boolean;
}

const ROLE_LABELS: Record<string, string> = { ADMIN: '管理者', MANAGER: 'マネージャー', MEMBER: 'メンバー', PARTNER: 'パートナー' };
const ROLE_VARIANTS: Record<string, 'danger' | 'warning' | 'info' | 'gray'> = { ADMIN: 'danger', MANAGER: 'warning', MEMBER: 'info', PARTNER: 'gray' };

export default function ApprovalRulesPage() {
  const { showToast } = useToast();
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ApprovalRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', minAmount: 0, maxAmount: '' as string | number, requiredRole: 'MANAGER', autoApprove: false, sortOrder: 0 });

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/approval-rules');
      if (res.ok) setRules((await res.json()).data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', minAmount: 0, maxAmount: '', requiredRole: 'MANAGER', autoApprove: false, sortOrder: rules.length + 1 });
    setShowModal(true);
  };

  const openEdit = (r: ApprovalRule) => {
    setEditing(r);
    setForm({ name: r.name, minAmount: r.minAmount, maxAmount: r.maxAmount ?? '', requiredRole: r.requiredRole, autoApprove: r.autoApprove, sortOrder: r.sortOrder });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('名前は必須です', 'error'); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/settings/approval-rules/${editing.id}` : '/api/settings/approval-rules';
      const body = {
        name: form.name,
        minAmount: form.minAmount,
        maxAmount: form.maxAmount !== '' ? Number(form.maxAmount) : null,
        requiredRole: form.requiredRole,
        autoApprove: form.autoApprove,
        sortOrder: form.sortOrder,
      };
      const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await getApiError(res, '保存に失敗'));
      showToast(editing ? '更新しました' : '作成しました', 'success');
      setShowModal(false);
      fetchRules();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラー', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このルールを無効化しますか？')) return;
    try {
      const res = await fetch(`/api/settings/approval-rules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await getApiError(res, '削除に失敗'));
      showToast('無効化しました', 'success');
      fetchRules();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラー', 'error');
    }
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">承認ルール設定</h1>
          <p className="mt-1 text-sm text-gray-500">金額閾値ベースの承認フロー設定</p>
        </div>
        <Button onClick={openCreate}>+ ルールを追加</Button>
      </div>

      {/* 説明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        支払い金額に応じて承認に必要な権限が変わります。自動承認ONの場合、支払い作成時に即「承認済」になります。
      </div>

      {/* ルール一覧 */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-sm text-gray-400">
            承認ルールが設定されていません。全支払いにデフォルトの承認フローが適用されます。
          </div>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className="bg-white border border-gray-200 rounded-lg p-5 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">{rule.name}</span>
                  {rule.autoApprove && <Badge variant="success" size="sm">自動承認</Badge>}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>
                    金額: {formatCurrency(rule.minAmount)} 〜 {rule.maxAmount ? formatCurrency(rule.maxAmount) : '上限なし'}
                  </span>
                  <span className="flex items-center gap-1">
                    必要権限: <Badge variant={ROLE_VARIANTS[rule.requiredRole] || 'gray'} size="sm">{ROLE_LABELS[rule.requiredRole] || rule.requiredRole}</Badge>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(rule)} className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded">編集</button>
                <button onClick={() => handleDelete(rule.id)} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded">無効化</button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'ルール編集' : 'ルール追加'}
        footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>キャンセル</Button><Button onClick={handleSave} loading={saving}>保存</Button></>}
      >
        <div className="space-y-4">
          <Input label="ルール名" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 10万円未満は自動承認" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="最小金額" type="number" required value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) || 0 })} />
            <Input label="最大金額 (空欄=上限なし)" type="number" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} />
          </div>
          <Select
            label="必要な承認権限"
            required
            options={[
              { label: 'メンバー', value: 'MEMBER' },
              { label: 'マネージャー', value: 'MANAGER' },
              { label: '管理者 (Admin)', value: 'ADMIN' },
            ]}
            value={form.requiredRole}
            onChange={(e) => setForm({ ...form, requiredRole: e.target.value })}
          />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.autoApprove} onChange={(e) => setForm({ ...form, autoApprove: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">自動承認 (作成時に即「承認済」にする)</span>
          </label>
          <Input label="並び順" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })} />
        </div>
      </Modal>
    </div>
  );
}
