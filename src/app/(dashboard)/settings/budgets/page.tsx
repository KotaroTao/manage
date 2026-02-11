'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatCurrency, getApiError } from '@/lib/utils';

interface Category { id: string; name: string; parentId: string | null; }
interface Business { id: string; name: string; }
interface Budget {
  id: string;
  categoryId: string;
  businessId: string | null;
  period: string;
  amount: number;
  note: string | null;
  category: { id: string; name: string };
  business: { id: string; name: string } | null;
}

export default function BudgetsPage() {
  const { showToast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [filterPeriod, setFilterPeriod] = useState(defaultPeriod);
  const [filterBusiness, setFilterBusiness] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ categoryId: '', businessId: '', period: defaultPeriod, amount: 0, note: '' });

  // 予算実績データ
  const [analytics, setAnalytics] = useState<{ categoryId: string; categoryName: string; budget: number; actual: number; remaining: number; rate: number }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPeriod) params.set('period', filterPeriod);
      if (filterBusiness) params.set('businessId', filterBusiness);

      const [budgetRes, catRes, bizRes, analyticsRes] = await Promise.all([
        fetch(`/api/settings/budgets?${params.toString()}`),
        fetch('/api/settings/expense-categories'),
        fetch('/api/businesses'),
        fetch(`/api/analytics/budget?period=${filterPeriod}${filterBusiness ? `&businessId=${filterBusiness}` : ''}`),
      ]);

      if (budgetRes.ok) setBudgets((await budgetRes.json()).data || []);
      if (catRes.ok) {
        const all = (await catRes.json()).data || [];
        setCategories(all.filter((c: Category) => !c.parentId));
      }
      if (bizRes.ok) setBusinesses((await bizRes.json()).data || []);
      if (analyticsRes.ok) setAnalytics((await analyticsRes.json()).data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filterPeriod, filterBusiness]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setForm({ categoryId: categories[0]?.id || '', businessId: '', period: filterPeriod, amount: 0, note: '' });
    setShowModal(true);
  };

  const openEdit = (b: Budget) => {
    setEditing(b);
    setForm({ categoryId: b.categoryId, businessId: b.businessId || '', period: b.period, amount: b.amount, note: b.note || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.categoryId || !form.period || !form.amount) { showToast('カテゴリ・期間・金額は必須です', 'error'); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/settings/budgets/${editing.id}` : '/api/settings/budgets';
      const body = editing ? { amount: form.amount, note: form.note || null } : { categoryId: form.categoryId, businessId: form.businessId || null, period: form.period, amount: form.amount, note: form.note || null };
      const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await getApiError(res, '保存に失敗'));
      showToast(editing ? '更新しました' : '作成しました', 'success');
      setShowModal(false);
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラー', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この予算を削除しますか？')) return;
    try {
      const res = await fetch(`/api/settings/budgets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await getApiError(res, '削除に失敗'));
      showToast('削除しました', 'success');
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラー', 'error');
    }
  };

  const rateColor = (rate: number) => {
    if (rate >= 100) return 'text-red-600 bg-red-50';
    if (rate >= 80) return 'text-amber-600 bg-amber-50';
    return 'text-green-600 bg-green-50';
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">予算管理</h1>
          <p className="mt-1 text-sm text-gray-500">大分類×月次の予算設定・実績比較</p>
        </div>
        <Button onClick={openCreate}>+ 予算を追加</Button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input type="month" label="期間" value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} />
          <Select
            label="事業"
            options={[{ label: '全社', value: '' }, ...businesses.map((b) => ({ label: b.name, value: b.id }))]}
            value={filterBusiness}
            onChange={(e) => setFilterBusiness(e.target.value)}
          />
        </div>
      </div>

      {/* 予算実績テーブル */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">大分類</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">予算</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">実績</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">残り</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">消化率</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {analytics.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">この期間の予算データはありません</td></tr>
            ) : (
              analytics.map((row) => {
                const budget = budgets.find((b) => b.categoryId === row.categoryId);
                return (
                  <tr key={row.categoryId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.categoryName}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.budget > 0 ? formatCurrency(row.budget) : <span className="text-gray-300">未設定</span>}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(row.actual)}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={row.remaining < 0 ? 'text-red-600 font-medium' : 'text-gray-600'}>{formatCurrency(row.remaining)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.budget > 0 ? (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${rateColor(row.rate)}`}>{row.rate}%</span>
                      ) : <span className="text-xs text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {budget ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(budget)} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">編集</button>
                          <button onClick={() => handleDelete(budget.id)} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">削除</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditing(null); setForm({ categoryId: row.categoryId, businessId: filterBusiness, period: filterPeriod, amount: 0, note: '' }); setShowModal(true); }} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">予算設定</button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? '予算編集' : '予算追加'}
        footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>キャンセル</Button><Button onClick={handleSave} loading={saving}>保存</Button></>}
      >
        <div className="space-y-4">
          {!editing && (
            <>
              <Select
                label="大分類"
                required
                options={categories.map((c) => ({ label: c.name, value: c.id }))}
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              />
              <Input label="期間" type="month" required value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
              <Select
                label="事業 (任意)"
                options={[{ label: '全社', value: '' }, ...businesses.map((b) => ({ label: b.name, value: b.id }))]}
                value={form.businessId}
                onChange={(e) => setForm({ ...form, businessId: e.target.value })}
              />
            </>
          )}
          <Input label="予算額" type="number" required value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} />
          <Input label="備考" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
