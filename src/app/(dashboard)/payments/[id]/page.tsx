'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal, ConfirmModal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/contexts/auth-context';
import { formatCurrency, formatDate, getApiError } from '@/lib/utils';

interface PaymentDetail {
  id: string;
  partnerId: string | null;
  partner: {
    id: string;
    name: string;
    company: string | null;
    bankName: string | null;
    bankBranch: string | null;
    bankAccountType: string | null;
    bankAccountNumber: string | null;
    bankAccountHolder: string | null;
  } | null;
  categoryId: string | null;
  category: {
    id: string;
    name: string;
    parentId: string | null;
    parent: { id: string; name: string } | null;
  } | null;
  amount: number;
  tax: number;
  totalAmount: number;
  withholdingTax: number;
  netAmount: number | null;
  type: string | null;
  status: string;
  period: string | null;
  dueDate: string | null;
  paidAt: string | null;
  adjustmentReason: string | null;
  note: string | null;
  workflow: { id: string; status: string } | null;
  customerBusiness: {
    customer: { id: string; name: string };
    business: { id: string; name: string };
  } | null;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
  parentId: string | null;
  children: { id: string; name: string }[];
}

interface Comment {
  id: string;
  content: string;
  user: { id: string; name: string };
  createdAt: string;
}

interface HistoryEntry {
  id: string;
  action: string;
  userName: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '下書き', PENDING: '申請中', APPROVED: '承認済', PAID: '支払済', CANCELLED: '取消',
};
const STATUS_VARIANTS: Record<string, 'gray' | 'warning' | 'info' | 'success' | 'danger'> = {
  DRAFT: 'gray', PENDING: 'warning', APPROVED: 'info', PAID: 'success', CANCELLED: 'danger',
};
const TYPE_LABELS: Record<string, string> = {
  SALARY: '給与', INVOICE: '請求書', COMMISSION: '手数料', BONUS: '賞与',
  MONTHLY: '月額', ONE_TIME: '一括', MILESTONE: 'マイルストーン', OTHER: 'その他',
};
const BANK_TYPE_LABELS: Record<string, string> = {
  ORDINARY: '普通', CURRENT: '当座', SAVINGS: '貯蓄',
};
const ACTION_LABELS: Record<string, string> = {
  CREATE: '作成', UPDATE: '更新', CANCEL: '取消', SOFT_DELETE: '削除', BATCH_UPDATE: '一括更新',
};

export default function PaymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const id = params.id as string;

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'detail' | 'comments' | 'history'>('detail');

  // Categories
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ amount: 0, tax: 0, withholdingTax: 0, note: '', dueDate: '', period: '', type: '', categoryId: '', adjustmentReason: '' });
  const [saving, setSaving] = useState(false);

  // Comment state
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Confirm modals
  const [statusAction, setStatusAction] = useState<{ status: string; label: string } | null>(null);

  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER' || isAdmin;

  const fetchPayment = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments/${id}`);
      if (!res.ok) throw new Error(await getApiError(res, '支払いの取得に失敗'));
      const json = await res.json();
      setPayment(json.data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラー', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments/${id}/history`);
      if (res.ok) {
        const json = await res.json();
        setHistory(json.data || []);
      }
    } catch { /* ignore */ }
  }, [id]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/expense-categories');
      if (res.ok) {
        const json = await res.json();
        setCategories(json.data || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPayment();
    fetchHistory();
    fetchCategories();
  }, [fetchPayment, fetchHistory, fetchCategories]);

  const startEditing = () => {
    if (!payment) return;
    setEditData({
      amount: payment.amount,
      tax: payment.tax,
      withholdingTax: payment.withholdingTax,
      note: payment.note || '',
      dueDate: payment.dueDate ? payment.dueDate.slice(0, 10) : '',
      period: payment.period || '',
      type: payment.type || '',
      categoryId: payment.categoryId || '',
      adjustmentReason: '',
    });
    setEditing(true);
  };

  const handleAmountChange = (val: string) => {
    const amount = Number(val) || 0;
    const tax = Math.floor(amount * 0.1);
    const wht = editData.withholdingTax;
    setEditData({ ...editData, amount, tax, withholdingTax: wht });
  };

  const calcWithholdingTax = (amount: number) => {
    if (amount <= 1000000) return Math.floor(amount * 0.1021);
    return Math.floor(1000000 * 0.1021 + (amount - 1000000) * 0.2042);
  };

  const handleWithholdingToggle = (enabled: boolean) => {
    if (enabled) {
      setEditData({ ...editData, withholdingTax: calcWithholdingTax(editData.amount) });
    } else {
      setEditData({ ...editData, withholdingTax: 0 });
    }
  };

  const handleSave = async () => {
    if (!payment) return;
    // PAID状態の金額変更は理由必須
    if (payment.status === 'PAID' && (editData.amount !== payment.amount || editData.tax !== payment.tax || editData.withholdingTax !== payment.withholdingTax)) {
      if (!editData.adjustmentReason.trim()) {
        showToast('支払済の金額変更には理由が必要です', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: editData.amount,
          tax: editData.tax,
          withholdingTax: editData.withholdingTax,
          note: editData.note,
          dueDate: editData.dueDate || null,
          period: editData.period || null,
          type: editData.type || null,
          categoryId: editData.categoryId || null,
          ...(editData.adjustmentReason && { adjustmentReason: editData.adjustmentReason }),
        }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '更新に失敗'));
      showToast('更新しました', 'success');
      setEditing(false);
      fetchPayment();
      fetchHistory();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新に失敗', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusAction) return;
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusAction.status }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '更新に失敗'));
      showToast(`${statusAction.label}しました`, 'success');
      setStatusAction(null);
      fetchPayment();
      fetchHistory();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラー', 'error');
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/payments/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment }),
      });
      if (!res.ok) throw new Error(await getApiError(res, 'コメント追加に失敗'));
      showToast('コメントを追加しました', 'success');
      setNewComment('');
      fetchPayment();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラー', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-64 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">支払いが見つかりません</p>
        <Button variant="secondary" className="mt-4" onClick={() => router.push('/payments')}>一覧に戻る</Button>
      </div>
    );
  }

  const netDisplay = payment.netAmount ?? (payment.totalAmount - payment.withholdingTax);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/payments')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{payment.partner ? `${payment.partner.name} への支払い` : '支払い詳細'}</h1>
            <p className="text-sm text-gray-500">
              {[
                payment.partner?.company,
                payment.category ? (payment.category.parent ? `${payment.category.parent.name} > ${payment.category.name}` : payment.category.name) : null,
                payment.type ? (TYPE_LABELS[payment.type] || payment.type) : null,
                payment.period || '期間未設定',
              ].filter(Boolean).join(' / ')}
            </p>
          </div>
        </div>
        <Badge variant={STATUS_VARIANTS[payment.status] || 'gray'} size="lg">
          {STATUS_LABELS[payment.status] || payment.status}
        </Badge>
      </div>

      {/* Status Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {payment.status === 'DRAFT' && isManager && (
          <Button size="sm" onClick={() => setStatusAction({ status: 'PENDING', label: '申請' })}>申請する</Button>
        )}
        {payment.status === 'PENDING' && isManager && (
          <Button size="sm" onClick={() => setStatusAction({ status: 'APPROVED', label: '承認' })}>承認する</Button>
        )}
        {payment.status === 'APPROVED' && isAdmin && (
          <Button size="sm" onClick={() => setStatusAction({ status: 'PAID', label: '支払確定' })}>支払確定</Button>
        )}
        {payment.status === 'PAID' && isAdmin && (
          <Button size="sm" variant="secondary" onClick={() => setStatusAction({ status: 'CANCELLED', label: '取消' })}>取消する</Button>
        )}
        {(payment.status !== 'CANCELLED') && isManager && (
          <Button size="sm" variant="secondary" onClick={startEditing}>編集</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          {(['detail', 'comments', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'detail' ? '詳細' : tab === 'comments' ? `コメント (${payment.comments.length})` : '変更履歴'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'detail' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payment Info */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">支払い情報</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">報酬額</span><p className="font-medium text-lg">{formatCurrency(payment.amount)}</p></div>
              <div><span className="text-gray-500">消費税</span><p className="font-medium text-lg">{formatCurrency(payment.tax)}</p></div>
              <div><span className="text-gray-500">税込合計</span><p className="font-bold text-lg text-blue-600">{formatCurrency(payment.totalAmount)}</p></div>
              <div>
                <span className="text-gray-500">源泉徴収税</span>
                <p className={`font-medium text-lg ${payment.withholdingTax > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {payment.withholdingTax > 0 ? `- ${formatCurrency(payment.withholdingTax)}` : 'なし'}
                </p>
              </div>
              {payment.withholdingTax > 0 && (
                <div className="col-span-2 pt-2 border-t border-gray-100">
                  <span className="text-gray-500">差引支払額</span>
                  <p className="font-bold text-xl text-green-600">{formatCurrency(netDisplay)}</p>
                </div>
              )}
            </div>
            {payment.adjustmentReason && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-700 mb-1">金額変更理由</p>
                <p className="text-sm text-amber-800">{payment.adjustmentReason}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-gray-100">
              {payment.category && (
                <div className="col-span-2">
                  <span className="text-gray-500">経費カテゴリ</span>
                  <p className="font-medium">
                    {payment.category.parent && <span className="text-gray-500">{payment.category.parent.name} &gt; </span>}
                    {payment.category.name}
                  </p>
                </div>
              )}
              <div><span className="text-gray-500">種別</span><p className="font-medium">{payment.type ? (TYPE_LABELS[payment.type] || payment.type) : '-'}</p></div>
              <div><span className="text-gray-500">期間</span><p className="font-medium">{payment.period || '-'}</p></div>
              <div><span className="text-gray-500">支払期限</span><p className="font-medium">{payment.dueDate ? formatDate(payment.dueDate) : '-'}</p></div>
              <div><span className="text-gray-500">支払日</span><p className="font-medium">{payment.paidAt ? formatDate(payment.paidAt) : '-'}</p></div>
              <div className="col-span-2"><span className="text-gray-500">備考</span><p className="font-medium whitespace-pre-wrap">{payment.note || '-'}</p></div>
            </div>
          </div>

          {/* Partner Info */}
          <div className="space-y-6">
            {payment.partner && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">パートナー情報</h2>
              <div className="text-sm space-y-2">
                <div><span className="text-gray-500">名前</span><p className="font-medium">{payment.partner.name}</p></div>
                {payment.partner.company && <div><span className="text-gray-500">会社名</span><p className="font-medium">{payment.partner.company}</p></div>}
              </div>
              {payment.partner.bankName && (
                <div className="pt-3 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">振込先口座</h3>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                    <p>{payment.partner.bankName} {payment.partner.bankBranch}</p>
                    <p>{payment.partner.bankAccountType ? BANK_TYPE_LABELS[payment.partner.bankAccountType] || payment.partner.bankAccountType : ''} {payment.partner.bankAccountNumber}</p>
                    <p className="font-medium">{payment.partner.bankAccountHolder}</p>
                  </div>
                </div>
              )}
            </div>
            )}
            {payment.customerBusiness && (
              <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-2">
                <h2 className="text-lg font-semibold text-gray-900">関連情報</h2>
                <div className="text-sm">
                  <span className="text-gray-500">顧客</span><p className="font-medium">{payment.customerBusiness.customer.name}</p>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">事業</span><p className="font-medium">{payment.customerBusiness.business.name}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'comments' && (
        <div className="space-y-4">
          {/* Add comment */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
              placeholder="コメントを入力..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <div className="flex justify-end mt-2">
              <Button size="sm" onClick={handleAddComment} loading={submittingComment} disabled={!newComment.trim()}>
                コメント追加
              </Button>
            </div>
          </div>

          {/* Comment list */}
          {payment.comments.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">コメントはありません</p>
          ) : (
            <div className="space-y-3">
              {payment.comments.map((c) => (
                <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">{c.user.name}</span>
                    <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {history.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">変更履歴はありません</p>
          ) : (
            history.map((h) => {
              const before = h.before as Record<string, unknown> | null;
              const after = h.after as Record<string, unknown> | null;
              const isCreate = h.action === 'CREATE';

              // 変更差分を検出
              const changes: { label: string; before: string; after: string }[] = [];
              if (before && after) {
                const fieldDefs: { key: string; label: string; format: (v: unknown) => string }[] = [
                  { key: 'status', label: 'ステータス', format: (v) => STATUS_LABELS[String(v)] || String(v) },
                  { key: 'amount', label: '報酬額', format: (v) => formatCurrency(Number(v)) },
                  { key: 'tax', label: '消費税', format: (v) => formatCurrency(Number(v)) },
                  { key: 'totalAmount', label: '税込合計', format: (v) => formatCurrency(Number(v)) },
                  { key: 'withholdingTax', label: '源泉徴収税', format: (v) => Number(v) ? formatCurrency(Number(v)) : 'なし' },
                  { key: 'netAmount', label: '差引支払額', format: (v) => v != null ? formatCurrency(Number(v)) : '-' },
                  { key: 'type', label: '種別', format: (v) => TYPE_LABELS[String(v)] || String(v) },
                  { key: 'period', label: '期間', format: (v) => v ? String(v) : '-' },
                  { key: 'dueDate', label: '支払期限', format: (v) => v ? formatDate(String(v)) : '-' },
                  { key: 'paidAt', label: '支払日', format: (v) => v ? formatDate(String(v)) : '-' },
                  { key: 'note', label: '備考', format: (v) => v ? String(v) : '-' },
                ];
                for (const f of fieldDefs) {
                  const bv = before[f.key];
                  const av = after[f.key];
                  if (String(bv ?? '') !== String(av ?? '')) {
                    changes.push({ label: f.label, before: f.format(bv), after: f.format(av) });
                  }
                }
              }

              // CREATE時は初期値を表示
              const createFields: { label: string; value: string }[] = [];
              if (isCreate && after) {
                createFields.push(
                  { label: 'ステータス', value: STATUS_LABELS[String(after.status)] || String(after.status) },
                  { label: '報酬額', value: formatCurrency(Number(after.amount)) },
                  { label: '消費税', value: formatCurrency(Number(after.tax)) },
                  { label: '税込合計', value: formatCurrency(Number(after.totalAmount)) },
                  { label: '種別', value: TYPE_LABELS[String(after.type)] || String(after.type) },
                );
                if (after.period) createFields.push({ label: '期間', value: String(after.period) });
                if (after.dueDate) createFields.push({ label: '支払期限', value: formatDate(String(after.dueDate)) });
                if (Number(after.withholdingTax)) createFields.push({ label: '源泉徴収税', value: formatCurrency(Number(after.withholdingTax)) });
                if (after.note) createFields.push({ label: '備考', value: String(after.note) });
              }

              // 変更理由
              const reason = after?.adjustmentReason && (!before || String(before.adjustmentReason || '') !== String(after.adjustmentReason || ''))
                ? String(after.adjustmentReason)
                : null;

              const actionVariant: Record<string, 'gray' | 'info' | 'success' | 'warning' | 'danger'> = {
                CREATE: 'info', UPDATE: 'warning', CANCEL: 'danger', SOFT_DELETE: 'danger', BATCH_UPDATE: 'warning',
              };

              return (
                <div key={h.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                      <Badge variant={actionVariant[h.action] || 'gray'} size="sm">{ACTION_LABELS[h.action] || h.action}</Badge>
                      <div className="flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <span className="text-sm font-semibold text-gray-900">{h.userName}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">{formatDate(h.createdAt)}</span>
                  </div>

                  {/* Body */}
                  <div className="px-5 py-3">
                    {/* CREATE: 初期値一覧 */}
                    {isCreate && createFields.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                        {createFields.map((f, i) => (
                          <div key={i}>
                            <span className="text-gray-400 text-xs">{f.label}</span>
                            <p className="text-gray-900 font-medium">{f.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* UPDATE/CANCEL: 変更差分テーブル */}
                    {!isCreate && changes.length > 0 && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400">
                            <th className="text-left font-medium pb-2 pr-4 w-28">項目</th>
                            <th className="text-left font-medium pb-2 pr-2">変更前</th>
                            <th className="text-center font-medium pb-2 w-8"></th>
                            <th className="text-left font-medium pb-2">変更後</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {changes.map((c, i) => (
                            <tr key={i}>
                              <td className="py-1.5 pr-4 text-gray-500 font-medium">{c.label}</td>
                              <td className="py-1.5 pr-2 text-red-600 bg-red-50/50 px-2 rounded-l">{c.before}</td>
                              <td className="py-1.5 text-center text-gray-300">→</td>
                              <td className="py-1.5 text-green-700 bg-green-50/50 px-2 rounded-r font-medium">{c.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* 変更なし */}
                    {!isCreate && changes.length === 0 && (
                      <p className="text-xs text-gray-400">変更内容の詳細は記録されていません</p>
                    )}

                    {/* 変更理由 */}
                    {reason && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <p className="text-xs font-medium text-amber-700">変更理由</p>
                        <p className="text-sm text-amber-800">{reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="支払い編集"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>キャンセル</Button>
            <Button onClick={handleSave} loading={saving}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="報酬額" type="number" required value={editData.amount || ''} onChange={(e) => handleAmountChange(e.target.value)} />
            <Input label="消費税 (自動計算 10%)" type="number" value={editData.tax} onChange={(e) => setEditData({ ...editData, tax: Number(e.target.value) || 0 })} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">税込合計</label>
              <p className="text-lg font-bold text-gray-900 py-2">{formatCurrency(editData.amount + editData.tax)}</p>
            </div>
          </div>

          {/* Withholding tax */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">源泉徴収</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editData.withholdingTax > 0}
                  onChange={(e) => handleWithholdingToggle(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">源泉徴収あり</span>
              </label>
            </div>
            {editData.withholdingTax > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <Input label="源泉徴収税額" type="number" value={editData.withholdingTax} onChange={(e) => setEditData({ ...editData, withholdingTax: Number(e.target.value) || 0 })} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">差引支払額</label>
                  <p className="text-lg font-bold text-green-600 py-2">{formatCurrency(editData.amount + editData.tax - editData.withholdingTax)}</p>
                </div>
              </div>
            )}
          </div>

          <Select
            label="経費カテゴリ"
            options={[
              { label: 'カテゴリなし', value: '' },
              ...categories.flatMap((c) => [
                { label: `■ ${c.name}`, value: c.id },
                ...c.children.map((ch) => ({ label: `　└ ${ch.name}`, value: ch.id })),
              ]),
            ]}
            value={editData.categoryId}
            onChange={(e) => setEditData({ ...editData, categoryId: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="種別"
              options={[
                { label: '種別なし', value: '' },
                { label: '給与', value: 'SALARY' }, { label: '請求書', value: 'INVOICE' },
                { label: '手数料', value: 'COMMISSION' }, { label: '賞与', value: 'BONUS' },
                { label: '月額', value: 'MONTHLY' }, { label: '一括', value: 'ONE_TIME' },
                { label: 'マイルストーン', value: 'MILESTONE' }, { label: 'その他', value: 'OTHER' },
              ]}
              value={editData.type}
              onChange={(e) => setEditData({ ...editData, type: e.target.value })}
            />
            <Input label="期間" type="month" value={editData.period} onChange={(e) => setEditData({ ...editData, period: e.target.value })} />
            <Input label="支払期限" type="date" value={editData.dueDate} onChange={(e) => setEditData({ ...editData, dueDate: e.target.value })} />
          </div>
          <Input label="備考" value={editData.note} onChange={(e) => setEditData({ ...editData, note: e.target.value })} />

          {/* Adjustment reason (for PAID payments) */}
          {payment?.status === 'PAID' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <Input
                label="金額変更理由 (必須)"
                required
                value={editData.adjustmentReason}
                onChange={(e) => setEditData({ ...editData, adjustmentReason: e.target.value })}
                placeholder="例: 源泉徴収の計算誤り修正"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Status Confirm Modal */}
      <ConfirmModal
        open={!!statusAction}
        onClose={() => setStatusAction(null)}
        onConfirm={handleStatusChange}
        title={`支払いを${statusAction?.label || ''}する`}
        message={`この支払い (${formatCurrency(payment.totalAmount)}) を${statusAction?.label || ''}しますか？`}
        confirmLabel={`${statusAction?.label || ''}する`}
        cancelLabel="キャンセル"
        variant={statusAction?.status === 'CANCELLED' ? 'danger' : 'primary'}
      />
    </div>
  );
}
