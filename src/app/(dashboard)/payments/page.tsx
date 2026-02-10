'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/card';
import { Modal, ConfirmModal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatCurrency, formatDate, formatRelativeDate, getApiError } from '@/lib/utils';
import type { PaginatedResponse } from '@/types';

interface Payment {
  id: string;
  partnerId: string;
  partner: { id: string; name: string; company: string | null };
  amount: number;
  tax: number;
  totalAmount: number;
  type: string;
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

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '下書き',
  PENDING: '申請中',
  APPROVED: '承認済',
  PAID: '支払済',
};

const STATUS_VARIANTS: Record<string, 'gray' | 'warning' | 'info' | 'success'> = {
  DRAFT: 'gray',
  PENDING: 'warning',
  APPROVED: 'info',
  PAID: 'success',
};

const TYPE_LABELS: Record<string, string> = {
  MONTHLY: '月額',
  ONE_TIME: '一括',
  MILESTONE: 'マイルストーン',
  OTHER: 'その他',
};

export default function PaymentsPage() {
  const { showToast } = useToast();

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

  // Options
  const [partners, setPartners] = useState<PartnerOption[]>([]);

  // Summary
  const [summary, setSummary] = useState({
    totalThisMonth: 0,
    pendingCount: 0,
    paidCount: 0,
    draftCount: 0,
  });

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newPayment, setNewPayment] = useState({
    partnerId: '',
    amount: 0,
    tax: 0,
    type: 'MONTHLY',
    period: '',
    dueDate: '',
    note: '',
  });

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (filterPartner) params.set('partnerId', filterPartner);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPeriod) params.set('period', filterPeriod);
      if (filterType) params.set('type', filterType);

      const res = await fetch(`/api/payments?${params.toString()}`);
      if (!res.ok) throw new Error(await getApiError(res, '支払いデータの取得に失敗しました'));
      const json = await res.json();
      setPayments(json.data);
      setTotalPages(json.pagination?.totalPages ?? 1);
      setTotalCount(json.pagination?.total ?? 0);

      // Use server-side summary (aggregated from all data, not just current page)
      if (json.summary) {
        setSummary(json.summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [page, filterPartner, filterStatus, filterPeriod, filterType]);

  const fetchPartners = useCallback(async () => {
    try {
      const res = await fetch('/api/partners?pageSize=200&status=ACTIVE');
      if (res.ok) {
        const json = await res.json();
        setPartners(
          (json.data || []).map((p: PartnerOption) => ({ id: p.id, name: p.name, company: p.company }))
        );
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Auto-calc tax
  const handleAmountChange = (val: string) => {
    const amount = Number(val) || 0;
    const tax = Math.floor(amount * 0.1);
    setNewPayment({ ...newPayment, amount, tax });
  };

  const handleCreate = async () => {
    if (!newPayment.partnerId || !newPayment.amount) {
      showToast('パートナーと金額は必須です', 'error');
      return;
    }
    setCreating(true);
    try {
      const totalAmount = newPayment.amount + newPayment.tax;
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newPayment, totalAmount, status: 'DRAFT' }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '作成に失敗しました'));
      showToast('支払いを作成しました', 'success');
      setShowCreateModal(false);
      setNewPayment({ partnerId: '', amount: 0, tax: 0, type: 'MONTHLY', period: '', dueDate: '', note: '' });
      fetchPayments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '作成に失敗しました', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (paymentId: string, newStatus: string) => {
    try {
      const body: Record<string, string> = { status: newStatus };
      if (newStatus === 'PAID') body.paidAt = new Date().toISOString();
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
          <div className="flex gap-1">
            <button
              onClick={() => handleStatusChange(payment.id, 'PENDING')}
              className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
            >
              申請
            </button>
            <button
              onClick={() => setDeleteTarget(payment.id)}
              className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
            >
              削除
            </button>
          </div>
        );
      case 'PENDING':
        return (
          <button
            onClick={() => handleStatusChange(payment.id, 'APPROVED')}
            className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
          >
            承認
          </button>
        );
      case 'APPROVED':
        return (
          <button
            onClick={() => handleStatusChange(payment.id, 'PAID')}
            className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100"
          >
            支払済
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">支払い管理</h1>
          <p className="mt-1 text-sm text-gray-500">パートナーへの支払いの管理・承認</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>+ 新規支払い</Button>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select
            options={[
              { label: 'すべてのパートナー', value: '' },
              ...partners.map((p) => ({ label: `${p.name}${p.company ? ` (${p.company})` : ''}`, value: p.id })),
            ]}
            value={filterPartner}
            onChange={(e) => { setFilterPartner(e.target.value); setPage(1); }}
          />
          <Select
            options={[
              { label: 'すべてのステータス', value: '' },
              { label: '下書き', value: 'DRAFT' },
              { label: '申請中', value: 'PENDING' },
              { label: '承認済', value: 'APPROVED' },
              { label: '支払済', value: 'PAID' },
            ]}
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          />
          <Input
            type="month"
            value={filterPeriod}
            onChange={(e) => { setFilterPeriod(e.target.value); setPage(1); }}
            placeholder="期間"
          />
          <Select
            options={[
              { label: 'すべての種別', value: '' },
              { label: '月額', value: 'MONTHLY' },
              { label: '一括', value: 'ONE_TIME' },
              { label: 'マイルストーン', value: 'MILESTONE' },
              { label: 'その他', value: 'OTHER' },
            ]}
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          />
        </div>
        {(filterPartner || filterStatus || filterPeriod || filterType) && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { setFilterPartner(''); setFilterStatus(''); setFilterPeriod(''); setFilterType(''); setPage(1); }}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              フィルターをリセット
            </button>
          </div>
        )}
      </div>

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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">パートナー名</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">金額</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden md:table-cell">税</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">合計</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase hidden md:table-cell">種別</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">期間</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">ステータス</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">期限/支払日</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-sm text-gray-500">
                      支払いデータはありません
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{payment.partner.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(payment.amount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right hidden md:table-cell">{formatCurrency(payment.tax)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(payment.totalAmount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-center hidden md:table-cell">
                        {TYPE_LABELS[payment.type] || payment.type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-center hidden lg:table-cell">
                        {payment.period || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={STATUS_VARIANTS[payment.status] || 'gray'} size="sm">
                          {STATUS_LABELS[payment.status] || payment.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm hidden lg:table-cell">
                        {payment.paidAt ? (
                          <span className="text-green-600">{formatDate(payment.paidAt)}</span>
                        ) : payment.dueDate ? (
                          <span className={payment.status !== 'PAID' && new Date(payment.dueDate) < new Date() ? 'text-red-600 font-medium' : 'text-gray-700'}>
                            {formatDate(payment.dueDate)}
                            {payment.status !== 'PAID' && formatRelativeDate(payment.dueDate) && (
                              <span className="text-xs ml-1">({formatRelativeDate(payment.dueDate)})</span>
                            )}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {renderActions(payment)}
                      </td>
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
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  前へ
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pNum: number;
                  if (totalPages <= 7) pNum = i + 1;
                  else if (page <= 4) pNum = i + 1;
                  else if (page >= totalPages - 3) pNum = totalPages - 6 + i;
                  else pNum = page - 3 + i;
                  return (
                    <button
                      key={pNum}
                      type="button"
                      onClick={() => setPage(pNum)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                        pNum === page
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pNum}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  次へ
                </button>
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
          <Select
            label="パートナー"
            required
            options={[
              { label: 'パートナーを選択', value: '' },
              ...partners.map((p) => ({
                label: `${p.name}${p.company ? ` (${p.company})` : ''}`,
                value: p.id,
              })),
            ]}
            value={newPayment.partnerId}
            onChange={(e) => setNewPayment({ ...newPayment, partnerId: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="金額"
              type="number"
              required
              value={newPayment.amount || ''}
              onChange={(e) => handleAmountChange(e.target.value)}
            />
            <Input
              label="税 (自動計算 10%)"
              type="number"
              value={newPayment.tax}
              onChange={(e) => setNewPayment({ ...newPayment, tax: Number(e.target.value) || 0 })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合計</label>
              <p className="text-lg font-bold text-gray-900 py-2">
                {formatCurrency(newPayment.amount + newPayment.tax)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="種別"
              options={[
                { label: '月額', value: 'MONTHLY' },
                { label: '一括', value: 'ONE_TIME' },
                { label: 'マイルストーン', value: 'MILESTONE' },
                { label: 'その他', value: 'OTHER' },
              ]}
              value={newPayment.type}
              onChange={(e) => setNewPayment({ ...newPayment, type: e.target.value })}
            />
            <Input
              label="期間"
              type="month"
              value={newPayment.period}
              onChange={(e) => setNewPayment({ ...newPayment, period: e.target.value })}
            />
            <Input
              label="支払期限"
              type="date"
              value={newPayment.dueDate}
              onChange={(e) => setNewPayment({ ...newPayment, dueDate: e.target.value })}
            />
          </div>
          <Input
            label="備考"
            value={newPayment.note}
            onChange={(e) => setNewPayment({ ...newPayment, note: e.target.value })}
          />
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
