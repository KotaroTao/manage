'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import type { UserFormData } from '@/types';

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理者',
  MANAGER: 'マネージャー',
  MEMBER: 'メンバー',
  PARTNER: 'パートナー',
};

const ROLE_VARIANTS: Record<string, 'danger' | 'primary' | 'info' | 'default'> = {
  ADMIN: 'danger',
  MANAGER: 'primary',
  MEMBER: 'info',
  PARTNER: 'default',
};

export default function UsersSettingsPage() {
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<UserFormData>({
    name: '',
    email: '',
    password: '',
    role: 'MEMBER' as const,
    isActive: true,
  });

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState<UserFormData>({
    name: '',
    email: '',
    role: 'MEMBER' as const,
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/users');
      if (!res.ok) throw new Error('ユーザーデータの取得に失敗しました');
      const json = await res.json();
      setUsers(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      showToast('名前、メール、パスワードは必須です', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/settings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('ユーザーの作成に失敗しました');
      showToast('ユーザーを作成しました', 'success');
      setShowCreateModal(false);
      setForm({ name: '', email: '', password: '', role: 'MEMBER' as const, isActive: true });
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '作成に失敗しました', 'error');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (user: UserItem) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role as UserFormData['role'],
      isActive: user.isActive,
    });
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      showToast('ユーザーを更新しました', 'success');
      setShowEditModal(false);
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (userId: string) => {
    if (!confirm('このユーザーを無効化しますか？')) return;
    try {
      const res = await fetch(`/api/settings/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error('無効化に失敗しました');
      showToast('ユーザーを無効化しました', 'success');
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '無効化に失敗しました', 'error');
    }
  };

  const renderSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ユーザー管理</h1>
          <p className="mt-1 text-sm text-gray-500">システムユーザーの管理 (管理者専用)</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>+ 新規ユーザー</Button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchUsers}>再試行</Button>
        </div>
      )}

      {/* Table */}
      {loading ? renderSkeleton() : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">メール</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">権限</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">ステータス</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">登録日</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-500">
                      ユーザーがいません
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{user.email}</td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant={ROLE_VARIANTS[user.role] || 'default'} size="sm">
                          {ROLE_LABELS[user.role] || user.role}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {user.isActive ? (
                          <Badge variant="success" size="sm" dot>有効</Badge>
                        ) : (
                          <Badge variant="gray" size="sm" dot>無効</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 hidden md:table-cell">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="text-xs px-2 py-1 text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                          >
                            編集
                          </button>
                          {user.isActive && (
                            <button
                              onClick={() => handleDeactivate(user.id)}
                              className="text-xs px-2 py-1 text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                            >
                              無効化
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="新規ユーザー登録"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>キャンセル</Button>
            <Button onClick={handleCreate} loading={creating}>登録</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="名前"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="メールアドレス"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="パスワード"
            type="password"
            required
            value={form.password || ''}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Select
            label="権限"
            required
            options={[
              { label: '管理者', value: 'ADMIN' },
              { label: 'マネージャー', value: 'MANAGER' },
              { label: 'メンバー', value: 'MEMBER' },
              { label: 'パートナー', value: 'PARTNER' },
            ]}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserFormData['role'] })}
          />
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="ユーザー編集"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>キャンセル</Button>
            <Button onClick={handleSave} loading={saving}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="名前"
            required
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />
          <Input
            label="メールアドレス"
            type="email"
            required
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
          />
          <Select
            label="権限"
            required
            options={[
              { label: '管理者', value: 'ADMIN' },
              { label: 'マネージャー', value: 'MANAGER' },
              { label: 'メンバー', value: 'MEMBER' },
              { label: 'パートナー', value: 'PARTNER' },
            ]}
            value={editForm.role}
            onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserFormData['role'] })}
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">有効</span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
