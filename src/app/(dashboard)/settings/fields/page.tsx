'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { getApiError } from '@/lib/utils';

interface BusinessOption {
  id: string;
  name: string;
}

interface CustomFieldDef {
  id: string;
  businessId: string;
  fieldLabel: string;
  fieldKey: string;
  fieldType: string;
  options: string[] | null;
  isRequired: boolean;
  sortOrder: number;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: 'テキスト',
  NUMBER: '数値',
  DATE: '日付',
  SELECT: '選択',
  CHECKBOX: 'チェックボックス',
  TEXTAREA: 'テキストエリア',
};

export default function FieldsSettingsPage() {
  const { showToast } = useToast();

  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    fieldKey: '',
    fieldLabel: '',
    fieldType: 'TEXT',
    options: '',
    isRequired: false,
  });

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [editForm, setEditForm] = useState({
    fieldKey: '',
    fieldLabel: '',
    fieldType: 'TEXT',
    options: '',
    isRequired: false,
  });
  const [saving, setSaving] = useState(false);

  const fetchBusinesses = useCallback(async () => {
    try {
      const res = await fetch('/api/businesses?pageSize=100');
      if (res.ok) {
        const json = await res.json();
        const list = (json.data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }));
        setBusinesses(list);
        if (list.length > 0 && !selectedBusiness) {
          setSelectedBusiness(list[0].id);
        }
      }
    } catch {
      // silently fail
    }
  }, [selectedBusiness]);

  const fetchFields = useCallback(async () => {
    if (!selectedBusiness) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/fields?businessId=${selectedBusiness}`);
      if (!res.ok) throw new Error(await getApiError(res, 'フィールドの取得に失敗しました'));
      const json = await res.json();
      setFields(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [selectedBusiness]);

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  const handleCreate = async () => {
    if (!form.fieldKey || !form.fieldLabel) {
      showToast('フィールドキーとラベルは必須です', 'error');
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        businessId: selectedBusiness,
        fieldKey: form.fieldKey,
        fieldLabel: form.fieldLabel,
        fieldType: form.fieldType,
        isRequired: form.isRequired,
        sortOrder: fields.length + 1,
      };
      if (form.fieldType === 'SELECT' && form.options) {
        body.options = form.options.split(',').map((o) => o.trim()).filter(Boolean);
      }
      const res = await fetch('/api/settings/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await getApiError(res, '作成に失敗しました'));
      showToast('フィールドを追加しました', 'success');
      setShowCreateModal(false);
      setForm({ fieldKey: '', fieldLabel: '', fieldType: 'TEXT', options: '', isRequired: false });
      fetchFields();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '作成に失敗しました', 'error');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (field: CustomFieldDef) => {
    setEditingField(field);
    setEditForm({
      fieldKey: field.fieldKey,
      fieldLabel: field.fieldLabel,
      fieldType: field.fieldType,
      options: field.options ? field.options.join(', ') : '',
      isRequired: field.isRequired,
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingField) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        fieldKey: editForm.fieldKey,
        fieldLabel: editForm.fieldLabel,
        fieldType: editForm.fieldType,
        isRequired: editForm.isRequired,
      };
      if (editForm.fieldType === 'SELECT' && editForm.options) {
        body.options = editForm.options.split(',').map((o) => o.trim()).filter(Boolean);
      }
      const res = await fetch(`/api/settings/fields/${editingField.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await getApiError(res, '更新に失敗しました'));
      showToast('フィールドを更新しました', 'success');
      setShowEditModal(false);
      fetchFields();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (fieldId: string) => {
    if (!confirm('このフィールドを削除しますか？')) return;
    try {
      const res = await fetch(`/api/settings/fields/${fieldId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await getApiError(res, '削除に失敗しました'));
      showToast('フィールドを削除しました', 'success');
      fetchFields();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '削除に失敗しました', 'error');
    }
  };

  const renderSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">カスタムフィールド管理</h1>
          <p className="mt-1 text-sm text-gray-500">事業ごとのカスタムフィールドを定義</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} disabled={!selectedBusiness}>
          + フィールド追加
        </Button>
      </div>

      {/* Business selector */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <Select
          label="事業を選択"
          options={businesses.map((b) => ({ label: b.name, value: b.id }))}
          value={selectedBusiness}
          onChange={(e) => setSelectedBusiness(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchFields}>再試行</Button>
        </div>
      )}

      {/* Table */}
      {!selectedBusiness ? (
        <div className="text-center py-16 text-sm text-gray-500">事業を選択してください</div>
      ) : loading ? (
        renderSkeleton()
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ラベル</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">キー</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">タイプ</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">必須</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">順序</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {fields.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-500">
                      カスタムフィールドはありません
                    </td>
                  </tr>
                ) : (
                  [...fields].sort((a, b) => a.sortOrder - b.sortOrder).map((field) => (
                    <tr key={field.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{field.fieldLabel}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 font-mono">{field.fieldKey}</td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="info" size="sm">
                          {FIELD_TYPE_LABELS[field.fieldType] || field.fieldType}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {field.isRequired ? (
                          <Badge variant="danger" size="sm">必須</Badge>
                        ) : (
                          <span className="text-xs text-gray-400">任意</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-700">{field.sortOrder}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(field)}
                            className="text-xs px-2 py-1 text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(field.id)}
                            className="text-xs px-2 py-1 text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
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
      )}

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="フィールド追加"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>キャンセル</Button>
            <Button onClick={handleCreate} loading={creating}>追加</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="フィールドキー"
            required
            value={form.fieldKey}
            onChange={(e) => setForm({ ...form, fieldKey: e.target.value })}
            hint="英数字とアンダースコア (例: contract_number)"
          />
          <Input
            label="フィールドラベル"
            required
            value={form.fieldLabel}
            onChange={(e) => setForm({ ...form, fieldLabel: e.target.value })}
            hint="画面上に表示される名前"
          />
          <Select
            label="フィールドタイプ"
            options={[
              { label: 'テキスト', value: 'TEXT' },
              { label: '数値', value: 'NUMBER' },
              { label: '日付', value: 'DATE' },
              { label: '選択', value: 'SELECT' },
              { label: 'チェックボックス', value: 'CHECKBOX' },
              { label: 'テキストエリア', value: 'TEXTAREA' },
            ]}
            value={form.fieldType}
            onChange={(e) => setForm({ ...form, fieldType: e.target.value })}
          />
          {form.fieldType === 'SELECT' && (
            <Input
              label="選択肢"
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
              hint="カンマ区切りで入力 (例: オプションA, オプションB, オプションC)"
            />
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isRequired}
              onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">必須フィールド</span>
          </label>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="フィールド編集"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>キャンセル</Button>
            <Button onClick={handleSaveEdit} loading={saving}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="フィールドキー"
            required
            value={editForm.fieldKey}
            onChange={(e) => setEditForm({ ...editForm, fieldKey: e.target.value })}
          />
          <Input
            label="フィールドラベル"
            required
            value={editForm.fieldLabel}
            onChange={(e) => setEditForm({ ...editForm, fieldLabel: e.target.value })}
          />
          <Select
            label="フィールドタイプ"
            options={[
              { label: 'テキスト', value: 'TEXT' },
              { label: '数値', value: 'NUMBER' },
              { label: '日付', value: 'DATE' },
              { label: '選択', value: 'SELECT' },
              { label: 'チェックボックス', value: 'CHECKBOX' },
              { label: 'テキストエリア', value: 'TEXTAREA' },
            ]}
            value={editForm.fieldType}
            onChange={(e) => setEditForm({ ...editForm, fieldType: e.target.value })}
          />
          {editForm.fieldType === 'SELECT' && (
            <Input
              label="選択肢"
              value={editForm.options}
              onChange={(e) => setEditForm({ ...editForm, options: e.target.value })}
              hint="カンマ区切りで入力"
            />
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editForm.isRequired}
              onChange={(e) => setEditForm({ ...editForm, isRequired: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">必須フィールド</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
