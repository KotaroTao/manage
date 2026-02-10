'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDate, formatCurrency, isOverdue } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  postalCode: string | null;
  representative: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  customerBusinesses: CustomerBusiness[];
  tags?: Tag[];
}

interface CustomerBusiness {
  id: string;
  status: string;
  nextActionDate: string | null;
  nextActionMemo: string | null;
  monthlyFee: number | null;
  business: {
    id: string;
    name: string;
    code: string;
    colorCode: string;
  };
  assignee: { id: string; name: string } | null;
}

interface Tag {
  id: string;
  name: string;
}

interface Business {
  id: string;
  name: string;
  code: string;
}

interface User {
  id: string;
  name: string;
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i}>
              <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="h-5 bg-gray-200 rounded w-32 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Edit Customer Modal                                                        */
/* -------------------------------------------------------------------------- */

function EditCustomerModal({
  open,
  onClose,
  customer,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  onUpdated: () => void;
}) {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: customer.name,
    company: customer.company || '',
    email: customer.email || '',
    phone: customer.phone || '',
    address: customer.address || '',
    postalCode: customer.postalCode || '',
    representative: customer.representative || '',
    status: customer.status,
    note: customer.note || '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: customer.name,
        company: customer.company || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        postalCode: customer.postalCode || '',
        representative: customer.representative || '',
        status: customer.status,
        note: customer.note || '',
      });
    }
  }, [open, customer]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('顧客名は必須です', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          company: form.company || null,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          postalCode: form.postalCode || null,
          representative: form.representative || null,
          status: form.status,
          note: form.note || null,
        }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      showToast('顧客情報を更新しました', 'success');
      onUpdated();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white rounded-xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="px-6 pt-6 pb-2 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-gray-900">顧客情報を編集</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              顧客名 <span className="text-red-500">*</span>
            </label>
            <input type="text" name="name" value={form.name} onChange={handleChange} required className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">会社名</label>
            <input type="text" name="company" value={form.company} onChange={handleChange} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メール</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
              <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号</label>
              <input type="text" name="postalCode" value={form.postalCode} onChange={handleChange} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">担当者</label>
              <input type="text" name="representative" value={form.representative} onChange={handleChange} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
            <input type="text" name="address" value={form.address} onChange={handleChange} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
            <select name="status" value={form.status} onChange={handleChange} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="ACTIVE">有効</option>
              <option value="INACTIVE">無効</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
            <textarea name="note" value={form.note} onChange={handleChange} rows={3} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              キャンセル
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {submitting && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              )}
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Add Business Modal                                                         */
/* -------------------------------------------------------------------------- */

function AddBusinessModal({
  open,
  onClose,
  customerId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  onAdded: () => void;
}) {
  const { showToast } = useToast();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ businessId: '', assigneeId: '' });

  useEffect(() => {
    if (!open) return;
    fetch('/api/businesses?pageSize=100')
      .then((r) => r.json())
      .then((json) => setBusinesses(json.data || []))
      .catch(() => {});
    fetch('/api/settings/users')
      .then((r) => r.json())
      .then((json) => setUsers(json.data || []))
      .catch(() => {});
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessId) {
      showToast('事業を選択してください', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          businessId: form.businessId,
          assigneeId: form.assigneeId || undefined,
          status: 'ACTIVE',
        }),
      });
      if (!res.ok) throw new Error('登録に失敗しました');
      showToast('事業を追加しました', 'success');
      setForm({ businessId: '', assigneeId: '' });
      onAdded();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-xl shadow-xl">
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">事業を追加</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              事業 <span className="text-red-500">*</span>
            </label>
            <select
              value={form.businessId}
              onChange={(e) => setForm((f) => ({ ...f, businessId: e.target.value }))}
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">選択してください</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">担当者</label>
            <select
              value={form.assigneeId}
              onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">未設定</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              キャンセル
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {submitting && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              )}
              追加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;
  const { showToast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddBiz, setShowAddBiz] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  const fetchCustomer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json = await res.json();
      setCustomer(json.data || json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    setAddingTag(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTag.trim() }),
      });
      if (!res.ok) throw new Error('タグの追加に失敗しました');
      showToast('タグを追加しました', 'success');
      setNewTag('');
      fetchCustomer();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setAddingTag(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    try {
      const res = await fetch(`/api/customers/${customerId}/tags/${tagId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('タグの削除に失敗しました');
      showToast('タグを削除しました', 'success');
      fetchCustomer();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
          <p className="text-red-600 mb-4">{error || '顧客が見つかりません'}</p>
          <button type="button" onClick={fetchCustomer} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            再試行
          </button>
        </div>
      </div>
    );
  }

  const statusBadge = customer.status === 'ACTIVE'
    ? { text: '有効', cls: 'bg-green-50 text-green-700 border-green-200' }
    : { text: '無効', cls: 'bg-gray-50 text-gray-600 border-gray-200' };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/customers" className="hover:text-blue-600">顧客一覧</Link>
            <span>/</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            {customer.company && (
              <span className="text-sm text-gray-500">({customer.company})</span>
            )}
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${statusBadge.cls}`}>
              {statusBadge.text}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowEdit(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          編集
        </button>
      </div>

      {/* Contact Info Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">連絡先情報</h2>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">メール</p>
            <p className="text-sm text-gray-900">{customer.email || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">電話番号</p>
            <p className="text-sm text-gray-900">{customer.phone || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">担当者</p>
            <p className="text-sm text-gray-900">{customer.representative || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">郵便番号</p>
            <p className="text-sm text-gray-900">{customer.postalCode || '-'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-gray-500 mb-1">住所</p>
            <p className="text-sm text-gray-900">{customer.address || '-'}</p>
          </div>
          {customer.note && (
            <div className="sm:col-span-3">
              <p className="text-xs text-gray-500 mb-1">備考</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.note}</p>
            </div>
          )}
        </div>
      </div>

      {/* Registered Businesses */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">登録事業</h2>
          <button
            type="button"
            onClick={() => setShowAddBiz(true)}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            事業を追加
          </button>
        </div>
        <div className="p-5">
          {customer.customerBusinesses.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">登録事業はありません</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customer.customerBusinesses.map((cb) => {
                const overdue = cb.nextActionDate && isOverdue(cb.nextActionDate);
                const missing = !cb.nextActionDate;

                return (
                  <Link
                    key={cb.id}
                    href={`/customers/${customerId}/b/${cb.id}`}
                    className="block rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: cb.business.colorCode || '#6B7280' }}
                        />
                        <span className="font-medium text-gray-900">{cb.business.name}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        cb.status === 'ACTIVE'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}>
                        {cb.status === 'ACTIVE' ? '有効' : cb.status}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">次回対応日</span>
                        <span className={
                          overdue
                            ? 'text-red-600 font-bold'
                            : missing
                            ? 'text-orange-500 font-medium'
                            : 'text-gray-900'
                        }>
                          {cb.nextActionDate ? formatDate(cb.nextActionDate) : '未設定'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">担当者</span>
                        <span className="text-gray-900">{cb.assignee?.name || '未設定'}</span>
                      </div>
                      {cb.monthlyFee != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">月額</span>
                          <span className="text-gray-900">{formatCurrency(cb.monthlyFee)}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">タグ</h2>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2 mb-4">
            {(customer.tags?.length || 0) === 0 ? (
              <p className="text-sm text-gray-400">タグなし</p>
            ) : (
              customer.tags!.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full border border-blue-200"
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag.id)}
                    className="ml-0.5 hover:text-red-600 transition-colors"
                    aria-label="タグを削除"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="タグ名を入力"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleAddTag}
              disabled={addingTag || !newTag.trim()}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {addingTag && (
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              )}
              追加
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showEdit && (
        <EditCustomerModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          customer={customer}
          onUpdated={fetchCustomer}
        />
      )}
      <AddBusinessModal
        open={showAddBiz}
        onClose={() => setShowAddBiz(false)}
        customerId={customerId}
        onAdded={fetchCustomer}
      />
    </div>
  );
}
