'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Business {
  id: string;
  name: string;
  code: string;
  colorCode: string;
  description: string | null;
  isActive: boolean;
  manager: { id: string; name: string } | null;
  _count?: { customerBusinesses: number; workflows: number };
}

interface UserOption {
  id: string;
  name: string;
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-4 h-4 bg-gray-200 rounded-full" />
            <div className="h-5 bg-gray-200 rounded w-32" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-48 mb-4" />
          <div className="flex gap-4">
            <div className="h-4 bg-gray-200 rounded w-16" />
            <div className="h-4 bg-gray-200 rounded w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function BusinessesPage() {
  const { showToast } = useToast();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    managerId: '',
    colorCode: '#3B82F6',
  });

  const fetchBusinesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/businesses?pageSize=100');
      if (!res.ok) throw new Error('事業の取得に失敗しました');
      const json = await res.json();
      setBusinesses(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/users?pageSize=100');
      if (res.ok) {
        const json = await res.json();
        setUsers((json.data || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchBusinesses();
    fetchUsers();
  }, [fetchBusinesses, fetchUsers]);

  const handleCreate = async () => {
    if (!form.name || !form.code) {
      showToast('事業名とコードは必須です', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          description: form.description || undefined,
          managerId: form.managerId || undefined,
          colorCode: form.colorCode,
          isActive: true,
        }),
      });
      if (!res.ok) throw new Error('作成に失敗しました');
      showToast('事業を作成しました', 'success');
      setShowCreate(false);
      setForm({ name: '', code: '', description: '', managerId: '', colorCode: '#3B82F6' });
      fetchBusinesses();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">事業一覧</h1>
          <p className="mt-1 text-sm text-gray-500">登録事業の管理</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ 新規事業</Button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchBusinesses}>再試行</Button>
        </div>
      )}

      {/* Card Grid */}
      {loading ? (
        <CardSkeleton />
      ) : businesses.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center text-sm text-gray-400">
          事業が登録されていません
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {businesses.map((biz) => (
            <Link
              key={biz.id}
              href={`/businesses/${biz.id}`}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow block"
            >
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: biz.colorCode || '#6B7280' }}
                />
                <h3 className="text-base font-bold text-gray-900 truncate">{biz.name}</h3>
                {!biz.isActive && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                    無効
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-1">コード: {biz.code}</p>
              {biz.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{biz.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                <span>担当: {biz.manager?.name || '未設定'}</span>
                <span>顧客数: {biz._count?.customerBusinesses ?? 0}</span>
                <span>フロー: {biz._count?.workflows ?? 0}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="新規事業"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>キャンセル</Button>
            <Button onClick={handleCreate} loading={creating}>作成</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="事業名"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="コード"
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="例: TAX, LABOR"
            />
          </div>
          <Input
            label="説明"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="管理者"
              options={[
                { label: '選択してください', value: '' },
                ...users.map((u) => ({ label: u.name, value: u.id })),
              ]}
              value={form.managerId}
              onChange={(e) => setForm({ ...form, managerId: e.target.value })}
            />
            <Input
              label="カラーコード"
              type="color"
              value={form.colorCode}
              onChange={(e) => setForm({ ...form, colorCode: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
