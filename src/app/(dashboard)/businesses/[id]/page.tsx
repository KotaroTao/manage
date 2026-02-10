'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal, ConfirmModal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatCurrency, isOverdue, cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface BusinessDetail {
  id: string;
  name: string;
  code: string;
  description: string | null;
  colorCode: string;
  isActive: boolean;
  manager: { id: string; name: string } | null;
}

interface CustomerBizRow {
  id: string;
  status: string;
  nextActionDate: string | null;
  monthlyFee: number | null;
  customFields: Record<string, unknown>;
  customer: { id: string; name: string; company: string | null };
  assignee: { id: string; name: string } | null;
}

interface FlowTemplate {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count?: { steps: number };
}

interface CustomFieldDef {
  id: string;
  name: string;
  key: string;
  fieldType: string;
  options: string[] | null;
  isRequired: boolean;
  sortOrder: number;
}

interface UserOption {
  id: string;
  name: string;
}

type TabId = 'customers' | 'templates' | 'fields';

const tabs: { id: TabId; label: string }[] = [
  { id: 'customers', label: '顧客一覧' },
  { id: 'templates', label: 'フローテンプレート' },
  { id: 'fields', label: 'カスタムフィールド' },
];

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="h-4 bg-gray-200 rounded w-32" />
      <div className="flex gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded w-24" />
        ))}
      </div>
      <div className="h-64 bg-gray-200 rounded-lg" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function BusinessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const businessId = params.id as string;

  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [customerBizzes, setCustomerBizzes] = useState<CustomerBizRow[]>([]);
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('customers');

  // Filters for customers tab
  const [searchCustomer, setSearchCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Edit business modal
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    description: '',
    managerId: '',
    colorCode: '',
  });

  // Add field modal
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [fieldForm, setFieldForm] = useState({
    name: '',
    key: '',
    fieldType: 'TEXT',
    options: '',
    isRequired: false,
  });
  const [savingField, setSavingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bizRes, usersRes] = await Promise.all([
        fetch(`/api/businesses/${businessId}`),
        fetch('/api/settings/users?pageSize=100'),
      ]);
      if (!bizRes.ok) throw new Error('事業データの取得に失敗しました');
      const bizJson = await bizRes.json();
      const d = bizJson.data || bizJson;
      setBusiness(d);
      setCustomerBizzes(d.customerBusinesses || []);
      setTemplates(d.templates || []);
      setFieldDefs(d.customFieldDefs || []);
      setEditForm({
        name: d.name || '',
        code: d.code || '',
        description: d.description || '',
        managerId: d.manager?.id || '',
        colorCode: d.colorCode || '#3B82F6',
      });

      if (usersRes.ok) {
        const usersJson = await usersRes.json();
        setUsers((usersJson.data || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          code: editForm.code,
          description: editForm.description || null,
          managerId: editForm.managerId || null,
          colorCode: editForm.colorCode,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `更新に失敗しました (${res.status})`);
      }
      showToast('事業情報を更新しました', 'success');
      setShowEdit(false);
      fetchAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveField = async () => {
    if (!fieldForm.name || !fieldForm.key) {
      showToast('フィールド名とキーは必須です', 'error');
      return;
    }
    setSavingField(true);
    try {
      const url = editingFieldId
        ? `/api/settings/fields/${editingFieldId}`
        : '/api/settings/fields';
      const method = editingFieldId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          name: fieldForm.name,
          key: fieldForm.key,
          fieldType: fieldForm.fieldType,
          options: fieldForm.options ? fieldForm.options.split(',').map((s) => s.trim()) : null,
          isRequired: fieldForm.isRequired,
        }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      showToast(editingFieldId ? 'フィールドを更新しました' : 'フィールドを追加しました', 'success');
      setShowFieldModal(false);
      setFieldForm({ name: '', key: '', fieldType: 'TEXT', options: '', isRequired: false });
      setEditingFieldId(null);
      fetchAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSavingField(false);
    }
  };

  const handleDeleteFieldConfirm = async () => {
    if (!deleteFieldTarget) return;
    try {
      const res = await fetch(`/api/settings/fields/${deleteFieldTarget}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
      showToast('フィールドを削除しました', 'success');
      setDeleteFieldTarget(null);
      fetchAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    }
  };

  const openEditField = (def: CustomFieldDef) => {
    setEditingFieldId(def.id);
    setFieldForm({
      name: def.name,
      key: def.key,
      fieldType: def.fieldType,
      options: def.options?.join(', ') || '',
      isRequired: def.isRequired,
    });
    setShowFieldModal(true);
  };

  // Filter customer bizzes
  const filteredCBs = customerBizzes.filter((cb) => {
    if (searchCustomer && !cb.customer.name.toLowerCase().includes(searchCustomer.toLowerCase()) &&
        !(cb.customer.company || '').toLowerCase().includes(searchCustomer.toLowerCase())) {
      return false;
    }
    if (filterStatus && cb.status !== filterStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <PageSkeleton />
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 mb-4">{error || 'データが見つかりません'}</p>
          <Button variant="secondary" onClick={fetchAll}>再試行</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/businesses" className="hover:text-blue-600">事業一覧</Link>
            <span>/</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="w-5 h-5 rounded-full shrink-0"
              style={{ backgroundColor: business.colorCode || '#6B7280' }}
            />
            <h1 className="text-2xl font-bold text-gray-900">{business.name}</h1>
            <span className="text-sm text-gray-400">({business.code})</span>
            {!business.isActive && <Badge variant="gray" size="sm">無効</Badge>}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            管理者: {business.manager?.name || '未設定'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setShowEdit(true)}>編集</Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: 顧客一覧 */}
      {activeTab === 'customers' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl">
              <Input
                placeholder="顧客名で検索"
                value={searchCustomer}
                onChange={(e) => setSearchCustomer(e.target.value)}
              />
              <Select
                options={[
                  { label: 'すべてのステータス', value: '' },
                  { label: '有効', value: 'ACTIVE' },
                  { label: '無効', value: 'INACTIVE' },
                ]}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">顧客名</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">次回対応日</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">担当者</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">ステータス</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">月額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCBs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-sm text-gray-500">
                        顧客が見つかりません
                      </td>
                    </tr>
                  ) : (
                    filteredCBs.map((cb) => {
                      const overdue = cb.nextActionDate && isOverdue(cb.nextActionDate);
                      return (
                        <tr
                          key={cb.id}
                          className={cn(
                            'hover:bg-gray-50 cursor-pointer transition-colors',
                            overdue && 'bg-red-50 hover:bg-red-100'
                          )}
                          onClick={() => router.push(`/customers/${cb.customer.id}/b/${cb.id}`)}
                        >
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {cb.customer.name}
                            {cb.customer.company && (
                              <span className="text-xs text-gray-400 ml-2">({cb.customer.company})</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className={overdue ? 'text-red-600 font-medium' : !cb.nextActionDate ? 'text-orange-500' : 'text-gray-700'}>
                              {cb.nextActionDate ? formatDate(cb.nextActionDate) : '未設定'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 hidden md:table-cell">
                            {cb.assignee?.name || '未設定'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge variant={cb.status === 'ACTIVE' ? 'success' : 'gray'} size="sm">
                              {cb.status === 'ACTIVE' ? '有効' : '無効'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 text-right hidden lg:table-cell">
                            {cb.monthlyFee != null ? formatCurrency(cb.monthlyFee) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: フローテンプレート */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => router.push('/workflows/templates/new')}>+ 新規テンプレート</Button>
          </div>
          {templates.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-sm text-gray-400">
              テンプレートがありません
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
              {templates.map((tpl) => (
                <Link
                  key={tpl.id}
                  href={`/workflows/templates/${tpl.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                    {tpl.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {tpl._count?.steps ?? 0} ステップ
                    </span>
                    <Badge variant={tpl.isActive ? 'success' : 'gray'} size="sm">
                      {tpl.isActive ? '有効' : '無効'}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: カスタムフィールド */}
      {activeTab === 'fields' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => {
              setEditingFieldId(null);
              setFieldForm({ name: '', key: '', fieldType: 'TEXT', options: '', isRequired: false });
              setShowFieldModal(true);
            }}>
              + 追加
            </Button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">フィールド名</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">キー</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">タイプ</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">必須</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">順序</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {fieldDefs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-500">
                        カスタムフィールドがありません
                      </td>
                    </tr>
                  ) : (
                    [...fieldDefs]
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((def) => (
                        <tr key={def.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{def.name}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 font-mono">{def.key}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{def.fieldType}</td>
                          <td className="px-6 py-4 text-sm text-center">
                            {def.isRequired ? (
                              <Badge variant="danger" size="sm">必須</Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-center text-gray-600">{def.sortOrder}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditField(def)}
                                className="text-xs px-2 py-1 text-blue-600 hover:text-blue-800 font-medium"
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteFieldTarget(def.id)}
                                className="text-xs px-2 py-1 text-red-600 hover:text-red-800 font-medium"
                              >
                                削除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Business Modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="事業情報を編集"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(false)}>キャンセル</Button>
            <Button onClick={handleSaveEdit} loading={saving}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="事業名"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
            <Input
              label="コード"
              required
              value={editForm.code}
              onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
            />
          </div>
          <Textarea
            label="説明"
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="管理者"
              options={[
                { label: '未設定', value: '' },
                ...users.map((u) => ({ label: u.name, value: u.id })),
              ]}
              value={editForm.managerId}
              onChange={(e) => setEditForm({ ...editForm, managerId: e.target.value })}
            />
            <Input
              label="カラーコード"
              type="color"
              value={editForm.colorCode}
              onChange={(e) => setEditForm({ ...editForm, colorCode: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* Field Modal */}
      <Modal
        open={showFieldModal}
        onClose={() => { setShowFieldModal(false); setEditingFieldId(null); }}
        title={editingFieldId ? 'フィールドを編集' : 'カスタムフィールドを追加'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowFieldModal(false); setEditingFieldId(null); }}>キャンセル</Button>
            <Button onClick={handleSaveField} loading={savingField}>
              {editingFieldId ? '更新' : '追加'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="フィールド名"
              required
              value={fieldForm.name}
              onChange={(e) => setFieldForm({ ...fieldForm, name: e.target.value })}
              placeholder="例: 申告種類"
            />
            <Input
              label="キー"
              required
              value={fieldForm.key}
              onChange={(e) => setFieldForm({ ...fieldForm, key: e.target.value })}
              placeholder="例: declaration_type"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="フィールドタイプ"
              options={[
                { label: 'テキスト', value: 'TEXT' },
                { label: '数値', value: 'NUMBER' },
                { label: '日付', value: 'DATE' },
                { label: 'セレクト', value: 'SELECT' },
                { label: 'チェックボックス', value: 'CHECKBOX' },
                { label: 'テキストエリア', value: 'TEXTAREA' },
              ]}
              value={fieldForm.fieldType}
              onChange={(e) => setFieldForm({ ...fieldForm, fieldType: e.target.value })}
            />
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fieldForm.isRequired}
                  onChange={(e) => setFieldForm({ ...fieldForm, isRequired: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">必須フィールド</span>
              </label>
            </div>
          </div>
          {fieldForm.fieldType === 'SELECT' && (
            <Input
              label="選択肢 (カンマ区切り)"
              value={fieldForm.options}
              onChange={(e) => setFieldForm({ ...fieldForm, options: e.target.value })}
              placeholder="例: 法人, 個人, その他"
            />
          )}
        </div>
      </Modal>

      {/* Delete Field Confirm Modal */}
      <ConfirmModal
        open={!!deleteFieldTarget}
        onClose={() => setDeleteFieldTarget(null)}
        onConfirm={handleDeleteFieldConfirm}
        title="フィールドの削除"
        message="このフィールドを削除しますか？"
        confirmLabel="削除"
        cancelLabel="キャンセル"
        variant="danger"
      />
    </div>
  );
}
