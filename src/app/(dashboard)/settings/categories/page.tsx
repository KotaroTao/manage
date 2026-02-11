'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { getApiError } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  budgetTarget: boolean;
  children: Category[];
}

export default function CategoriesPage() {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', parentId: '', description: '', budgetTarget: true });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/expense-categories');
      if (res.ok) {
        const json = await res.json();
        setCategories(json.data || []);
        // 全展開
        setExpandedIds(new Set((json.data || []).map((c: Category) => c.id)));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const openCreate = (parentId?: string) => {
    setEditing(null);
    setForm({ name: '', parentId: parentId || '', description: '', budgetTarget: true });
    setShowModal(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({ name: cat.name, parentId: cat.parentId || '', description: cat.description || '', budgetTarget: cat.budgetTarget });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('名前は必須です', 'error'); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/settings/expense-categories/${editing.id}` : '/api/settings/expense-categories';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, parentId: form.parentId || null, description: form.description || null, budgetTarget: form.budgetTarget }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '保存に失敗'));
      showToast(editing ? '更新しました' : '作成しました', 'success');
      setShowModal(false);
      fetchCategories();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラー', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このカテゴリを無効化しますか？')) return;
    try {
      const res = await fetch(`/api/settings/expense-categories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await getApiError(res, '削除に失敗'));
      showToast('無効化しました', 'success');
      fetchCategories();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラー', 'error');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">経費カテゴリ管理</h1>
          <p className="mt-1 text-sm text-gray-500">大分類・小分類の追加・編集・無効化</p>
        </div>
        <Button onClick={() => openCreate()}>+ 大分類を追加</Button>
      </div>

      <div className="space-y-2">
        {categories.map((major) => (
          <div key={major.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {/* 大分類ヘッダー */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button onClick={() => toggleExpand(major.id)} className="text-gray-400 hover:text-gray-600">
                  <svg className={`w-4 h-4 transition-transform ${expandedIds.has(major.id) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
                <span className="font-semibold text-gray-900">{major.name}</span>
                <span className="text-xs text-gray-400">{major.children.length}件</span>
                {major.budgetTarget && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">予算管理</span>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openCreate(major.id)} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">+ 小分類</button>
                <button onClick={() => openEdit(major)} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">編集</button>
                <button onClick={() => handleDelete(major.id)} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">無効化</button>
              </div>
            </div>

            {/* 小分類リスト */}
            {expandedIds.has(major.id) && major.children.length > 0 && (
              <div className="divide-y divide-gray-100">
                {major.children.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between px-5 py-2.5 pl-12">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">{sub.name}</span>
                      {sub.description && <span className="text-xs text-gray-400">({sub.description})</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(sub)} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded">編集</button>
                      <button onClick={() => handleDelete(sub.id)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded">無効化</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'カテゴリ編集' : (form.parentId ? '小分類を追加' : '大分類を追加')}
        footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>キャンセル</Button><Button onClick={handleSave} loading={saving}>保存</Button></>}
      >
        <div className="space-y-4">
          <Input label="名前" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="説明 (任意)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {!form.parentId && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.budgetTarget} onChange={(e) => setForm({ ...form, budgetTarget: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm text-gray-700">予算管理対象</span>
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
