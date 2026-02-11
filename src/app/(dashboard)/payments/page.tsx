'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/card';
import { Modal, ConfirmModal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/contexts/auth-context';
import { formatCurrency, formatDate, formatRelativeDate, getApiError, exportToCsv } from '@/lib/utils';

interface Payment {
  id: string;
  partnerId: string | null;
  partner: { id: string; name: string; company: string | null } | null;
  categoryId: string | null;
  category: { id: string; name: string; parentId: string | null; parent: { id: string; name: string } | null } | null;
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
  note: string | null;
  createdAt: string;
}

interface PartnerOption {
  id: string;
  name: string;
  company: string | null;
}

interface ExpenseCategory {
  id: string;
  name: string;
  parentId: string | null;
  children: { id: string; name: string }[];
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

export default function PaymentsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER' || isAdmin;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Filters
  const [filterPartner, setFilterPartner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Options
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  // Summary
  const [summary, setSummary] = useState({
    totalThisMonth: 0, pendingCount: 0, paidCount: 0, draftCount: 0,
  });

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newPayment, setNewPayment] = useState({
    partnerId: '', categoryId: '', amount: 0, tax: 0, withholdingTax: 0, withholdingEnabled: false,
    type: 'SALARY', period: '', dueDate: '', note: '',
  });

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', String(pageSize));
      if (filterPartner) params.set('partnerId', filterPartner);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPeriod) params.set('period', filterPeriod);
      if (filterType) params.set('type', filterType);
      if (filterCategory) params.set('categoryId', filterCategory);

      const res = await fetch(`/api/payments?${params.toString()}`);
      if (!res.ok) throw new Error(await getApiError(res, '支払いデータの取得に失敗しました'));
      const json = await res.json();
      setPayments(json.data);
      setTotalPages(json.pagination?.totalPages ?? 1);
      setTotalCount(json.pagination?.total ?? 0);
      if (json.summary) setSummary(json.summary);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [page, filterPartner, filterStatus, filterPeriod, filterType, filterCategory]);

  const fetchPartners = useCallback(async () => {
    try {
      const res = await fetch('/api/partners?pageSize=200&status=ACTIVE');
      if (res.ok) {
        const json = await res.json();
        setPartners((json.data || []).map((p: PartnerOption) => ({ id: p.id, name: p.name, company: p.company })));
      }
    } catch { /* silently fail */ }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/expense-categories');
      if (res.ok) {
        const json = await res.json();
        setCategories(json.data || []);
      }
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { fetchPartners(); fetchCategories(); }, [fetchPartners, fetchCategories]);
  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const calcWithholdingTax = (amount: number) => {
    if (amount <= 1000000) return Math.floor(amount * 0.1021);
    return Math.floor(1000000 * 0.1021 + (amount - 1000000) * 0.2042);
  };

  const handleAmountChange = (val: string) => {
    const amount = Number(val) || 0;
    const tax = Math.floor(amount * 0.1);
    const wht = newPayment.withholdingEnabled ? calcWithholdingTax(amount) : 0;
    setNewPayment({ ...newPayment, amount, tax, withholdingTax: wht });
  };

  const handleWithholdingToggle = (enabled: boolean) => {
    const wht = enabled ? calcWithholdingTax(newPayment.amount) : 0;
    setNewPayment({ ...newPayment, withholdingEnabled: enabled, withholdingTax: wht });
  };

  const handleCreate = async () => {
    if (!newPayment.amount) {
      showToast('金額は必須です', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId: newPayment.partnerId || null,
          categoryId: newPayment.categoryId || null,
          amount: newPayment.amount,
          tax: newPayment.tax,
          withholdingTax: newPayment.withholdingTax,
          type: newPayment.type || null,
          period: newPayment.period || null,
          dueDate: newPayment.dueDate || null,
          note: newPayment.note || null,
        }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '作成に失敗しました'));
      showToast('支払いを作成しました', 'success');
      setShowCreateModal(false);
      setNewPayment({ partnerId: '', categoryId: '', amount: 0, tax: 0, withholdingTax: 0, withholdingEnabled: false, type: 'SALARY', period: '', dueDate: '', note: '' });
      fetchPayments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '作成に失敗しました', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (paymentId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '更新に失敗しました'));
      showToast('ステータスを更新しました', 'success');
      fetchPayments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新に失敗しました', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/payments/${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await getApiError(res, '削除に失敗しました'));
      showToast('支払いを削除しました', 'success');
      setDeleteTarget(null);
      fetchPayments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '削除に失敗しました', 'error');
    }
  };

  const handleBatchAction = async () => {
    if (!batchAction || selectedIds.size === 0) return;
    setBatchProcessing(true);
    try {
      const res = await fetch('/api/payments/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIds: Array.from(selectedIds), status: batchAction }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '一括更新に失敗'));
      const json = await res.json();
      showToast(`${json.summary.success}件更新 / ${json.summary.failed}件失敗`, json.summary.failed > 0 ? 'error' : 'success');
      setBatchAction(null);
      setSelectedIds(new Set());
      fetchPayments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '一括更新に失敗', 'error');
    } finally {
      setBatchProcessing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === payments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(payments.map((p) => p.id)));
    }
  };

  const renderSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
      ))}
    </div>
  );

  const renderActions = (payment: Payment) => {
    switch (payment.status) {
      case 'DRAFT':
        return (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            {isManager && <button onClick={() => handleStatusChange(payment.id, 'PENDING')} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">申請</button>}
            {isManager && <button onClick={() => setDeleteTarget(payment.id)} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100">削除</button>}
          </div>
        );
      case 'PENDING':
        return isManager ? (
          <button onClick={(e) => { e.stopPropagation(); handleStatusChange(payment.id, 'APPROVED'); }} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">承認</button>
        ) : null;
      case 'APPROVED':
        return isAdmin ? (
          <button onClick={(e) => { e.stopPropagation(); handleStatusChange(payment.id, 'PAID'); }} className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100">支払済</button>
        ) : null;
      default:
        return null;
    }
  };

  const totalNet = (p: Payment) => p.netAmount ?? (p.totalAmount - (p.withholdingTax || 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">支払い管理</h1>
          <p className="mt-1 text-sm text-gray-500">支払いの管理・承認</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportToCsv('payments', ['パートナー名', 'カテゴリ', '金額', '消費税', '税込合計', '源泉徴収', '差引支払額', '種別', '期間', 'ステータス', '支払日', '期限'], payments.map((p) => [p.partner?.name || '-', p.category ? (p.category.parent ? `${p.category.parent.name} > ${p.category.name}` : p.category.name) : '-', p.amount, p.tax, p.totalAmount, p.withholdingTax || 0, totalNet(p), p.type ? (TYPE_LABELS[p.type] || p.type) : '-', p.period, STATUS_LABELS[p.status] || p.status, p.paidAt ? formatDate(p.paidAt) : '', p.dueDate ? formatDate(p.dueDate) : '']))}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            CSV
          </button>
          {isManager && <Button onClick={() => setShowCreateModal(true)}>+ 新規支払い</Button>}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="今月支払い合計" value={formatCurrency(summary.totalThisMonth)} />
        <StatCard title="承認待ち件数" value={summary.pendingCount} />
        <StatCard title="支払い済み件数" value={summary.paidCount} />
        <StatCard title="下書き件数" value={summary.draftCount} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Select
            options={[{ label: 'すべてのパートナー', value: '' }, ...partners.map((p) => ({ label: `${p.name}${p.company ? ` (${p.company})` : ''}`, value: p.id }))]}
            value={filterPartner}
            onChange={(e) => { setFilterPartner(e.target.value); setPage(1); }}
          />
          <Select
            options={[
              { label: 'すべてのカテゴリ', value: '' },
              ...categories.flatMap((c) => [
                { label: `■ ${c.name}`, value: c.id },
                ...c.children.map((ch) => ({ label: `　└ ${ch.name}`, value: ch.id })),
              ]),
            ]}
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          />
          <Select
            options={[
              { label: 'すべてのステータス', value: '' },
              { label: '下書き', value: 'DRAFT' }, { label: '申請中', value: 'PENDING' },
              { label: '承認済', value: 'APPROVED' }, { label: '支払済', value: 'PAID' },
              { label: '取消', value: 'CANCELLED' },
            ]}
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          />
          <Input type="month" value={filterPeriod} onChange={(e) => { setFilterPeriod(e.target.value); setPage(1); }} placeholder="期間" />
          <Select
            options={[
              { label: 'すべての種別', value: '' },
              { label: '給与', value: 'SALARY' }, { label: '請求書', value: 'INVOICE' },
              { label: '手数料', value: 'COMMISSION' }, { label: '賞与', value: 'BONUS' },
              { label: '月額', value: 'MONTHLY' }, { label: '一括', value: 'ONE_TIME' },
              { label: 'マイルストーン', value: 'MILESTONE' }, { label: 'その他', value: 'OTHER' },
            ]}
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          />
        </div>
        {(filterPartner || filterStatus || filterPeriod || filterType || filterCategory) && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={() => { setFilterPartner(''); setFilterStatus(''); setFilterPeriod(''); setFilterType(''); setFilterCategory(''); setPage(1); }} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              フィルターをリセット
            </button>
          </div>
        )}
      </div>

      {/* Batch Actions */}
      {selectedIds.size > 0 && isManager && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-700">{selectedIds.size} 件選択中</span>
          <div className="flex items-center gap-2">
            <Select
              options={[
                { label: '一括操作を選択', value: '' },
                { label: '一括申請 (DRAFT→PENDING)', value: 'PENDING' },
                { label: '一括承認 (PENDING→APPROVED)', value: 'APPROVED' },
                ...(isAdmin ? [{ label: '一括支払確定 (APPROVED→PAID)', value: 'PAID' }] : []),
              ]}
              value={batchAction || ''}
              onChange={(e) => setBatchAction(e.target.value || null)}
            />
            <Button size="sm" disabled={!batchAction} loading={batchProcessing} onClick={handleBatchAction}>実行</Button>
            <button onClick={() => setSelectedIds(new Set())} className="text-sm text-gray-500 hover:text-gray-700">解除</button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchPayments}>再試行</Button>
        </div>
      )}

      {/* Table */}
      {loading ? renderSkeleton() : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {isManager && (
                    <th className="px-3 py-3 w-10">
                      <input type="checkbox" checked={payments.length > 0 && selectedIds.size === payments.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">パートナー/対象</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">カテゴリ</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">合計</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">差引支払額</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase hidden md:table-cell">種別</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">期間</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">ステータス</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">期限/支払日</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-16 text-center text-sm text-gray-500">支払いデータはありません</td></tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/payments/${payment.id}`)}>
                      {isManager && (
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(payment.id)} onChange={() => toggleSelect(payment.id)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{payment.partner?.name || <span className="text-gray-400">-</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 hidden md:table-cell">
                        {payment.category ? (
                          <span>{payment.category.parent ? `${payment.category.parent.name} > ` : ''}{payment.category.name}</span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(payment.totalAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right hidden lg:table-cell">
                        {payment.withholdingTax > 0 ? (
                          <span className="text-green-600 font-medium">{formatCurrency(totalNet(payment))}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-center hidden md:table-cell">{payment.type ? (TYPE_LABELS[payment.type] || payment.type) : '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-center hidden lg:table-cell">{payment.period || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={STATUS_VARIANTS[payment.status] || 'gray'} size="sm">
                          {STATUS_LABELS[payment.status] || payment.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm hidden lg:table-cell">
                        {payment.paidAt ? (
                          <span className="text-green-600">{formatDate(payment.paidAt)}</span>
                        ) : payment.dueDate ? (
                          <span className={payment.status !== 'PAID' && payment.status !== 'CANCELLED' && new Date(payment.dueDate) < new Date() ? 'text-red-600 font-medium' : 'text-gray-700'}>
                            {formatDate(payment.dueDate)}
                            {payment.status !== 'PAID' && payment.status !== 'CANCELLED' && formatRelativeDate(payment.dueDate) && (
                              <span className="text-xs ml-1">({formatRelativeDate(payment.dueDate)})</span>
                            )}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">{renderActions(payment)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
              <p className="text-sm text-gray-500">
                全 <span className="font-medium">{totalCount}</span> 件中{' '}
                <span className="font-medium">{(page - 1) * pageSize + 1}</span> -{' '}
                <span className="font-medium">{Math.min(page * pageSize, totalCount)}</span> 件
              </p>
              <div className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">前へ</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pNum: number;
                  if (totalPages <= 7) pNum = i + 1;
                  else if (page <= 4) pNum = i + 1;
                  else if (page >= totalPages - 3) pNum = totalPages - 6 + i;
                  else pNum = page - 3 + i;
                  return (
                    <button key={pNum} type="button" onClick={() => setPage(pNum)} className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${pNum === page ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'}`}>{pNum}</button>
                  );
                })}
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">次へ</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="新規支払い作成"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>キャンセル</Button>
            <Button onClick={handleCreate} loading={creating}>作成</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="パートナー"
              options={[{ label: 'パートナーなし', value: '' }, ...partners.map((p) => ({ label: `${p.name}${p.company ? ` (${p.company})` : ''}`, value: p.id }))]}
              value={newPayment.partnerId}
              onChange={(e) => setNewPayment({ ...newPayment, partnerId: e.target.value })}
            />
            <Select
              label="経費カテゴリ"
              options={[
                { label: 'カテゴリなし', value: '' },
                ...categories.flatMap((c) => [
                  { label: `■ ${c.name}`, value: c.id },
                  ...c.children.map((ch) => ({ label: `　└ ${ch.name}`, value: ch.id })),
                ]),
              ]}
              value={newPayment.categoryId}
              onChange={(e) => setNewPayment({ ...newPayment, categoryId: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="報酬額" type="number" required value={newPayment.amount || ''} onChange={(e) => handleAmountChange(e.target.value)} />
            <Input label="消費税 (自動計算 10%)" type="number" value={newPayment.tax} onChange={(e) => setNewPayment({ ...newPayment, tax: Number(e.target.value) || 0 })} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">税込合計</label>
              <p className="text-lg font-bold text-gray-900 py-2">{formatCurrency(newPayment.amount + newPayment.tax)}</p>
            </div>
          </div>

          {/* Withholding tax */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">源泉徴収</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPayment.withholdingEnabled}
                  onChange={(e) => handleWithholdingToggle(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">源泉徴収あり</span>
              </label>
            </div>
            {newPayment.withholdingEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <Input label="源泉徴収税額" type="number" value={newPayment.withholdingTax} onChange={(e) => setNewPayment({ ...newPayment, withholdingTax: Number(e.target.value) || 0 })} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">差引支払額</label>
                  <p className="text-lg font-bold text-green-600 py-2">{formatCurrency(newPayment.amount + newPayment.tax - newPayment.withholdingTax)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="種別"
              options={[
                { label: '給与', value: 'SALARY' }, { label: '請求書', value: 'INVOICE' },
                { label: '手数料', value: 'COMMISSION' }, { label: '賞与', value: 'BONUS' },
                { label: '月額', value: 'MONTHLY' }, { label: '一括', value: 'ONE_TIME' },
                { label: 'マイルストーン', value: 'MILESTONE' }, { label: 'その他', value: 'OTHER' },
              ]}
              value={newPayment.type}
              onChange={(e) => setNewPayment({ ...newPayment, type: e.target.value })}
            />
            <Input label="期間" type="month" value={newPayment.period} onChange={(e) => setNewPayment({ ...newPayment, period: e.target.value })} />
            <Input label="支払期限" type="date" value={newPayment.dueDate} onChange={(e) => setNewPayment({ ...newPayment, dueDate: e.target.value })} />
          </div>
          <Input label="備考" value={newPayment.note} onChange={(e) => setNewPayment({ ...newPayment, note: e.target.value })} />
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="支払いの削除"
        message="この支払いを削除しますか？この操作は取り消せません。"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        variant="danger"
      />
    </div>
  );
}
