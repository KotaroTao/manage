'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/modal';
import { getApiError } from '@/lib/utils';

interface TemplateStep {
  id?: string;
  _tempId?: string;
  sortOrder: number;
  title: string;
  description: string;
  daysFromPrevious: number;
  assigneeRole: string;
  isRequired: boolean;
}

interface TemplateDetail {
  id: string;
  name: string;
  businessId: string;
  business: { id: string; name: string; colorCode: string };
  isActive: boolean;
  steps: TemplateStep[];
}

interface BusinessOption {
  id: string;
  name: string;
}

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const templateId = params.id as string;
  const isNew = templateId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  // Template state
  const [name, setName] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [steps, setSteps] = useState<TemplateStep[]>([]);

  const fetchTemplate = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/templates/${templateId}`);
      if (!res.ok) throw new Error(await getApiError(res, 'テンプレートの取得に失敗しました'));
      const json = await res.json();
      const tpl: TemplateDetail = json.data;
      setName(tpl.name);
      setBusinessId(tpl.businessId);
      setSteps(
        tpl.steps
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => ({
            id: s.id,
            sortOrder: s.sortOrder,
            title: s.title,
            description: s.description || '',
            daysFromPrevious: s.daysFromPrevious,
            assigneeRole: s.assigneeRole || '',
            isRequired: s.isRequired,
          }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [templateId, isNew]);

  const fetchBusinesses = useCallback(async () => {
    try {
      const res = await fetch('/api/businesses?pageSize=100');
      if (res.ok) {
        const json = await res.json();
        setBusinesses((json.data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchBusinesses();
    fetchTemplate();
  }, [fetchBusinesses, fetchTemplate]);

  // Step management
  const addStep = () => {
    setSteps([
      ...steps,
      {
        _tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        sortOrder: steps.length + 1,
        title: '',
        description: '',
        daysFromPrevious: 0,
        assigneeRole: '',
        isRequired: true,
      },
    ]);
  };

  const removeStep = (index: number) => {
    const updated = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, sortOrder: i + 1 }));
    setSteps(updated);
  };

  const updateStep = (index: number, field: keyof TemplateStep, value: string | number | boolean) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === steps.length - 1) return;
    const updated = [...steps];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
    setSteps(updated.map((s, i) => ({ ...s, sortOrder: i + 1 })));
  };

  const handleSave = async () => {
    if (!name) {
      showToast('テンプレート名は必須です', 'error');
      return;
    }
    if (!businessId) {
      showToast('事業を選択してください', 'error');
      return;
    }
    setSaving(true);
    try {
      const url = isNew ? '/api/workflows/templates' : `/api/workflows/templates/${templateId}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, businessId, steps }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '保存に失敗しました'));
      showToast('テンプレートを保存しました', 'success');
      if (isNew) {
        const json = await res.json();
        router.push(`/workflows/templates/${json.data.id}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      const res = await fetch(`/api/workflows/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '無効化に失敗しました'));
      showToast('テンプレートを無効化しました', 'success');
      setShowDeleteConfirm(false);
      router.push('/workflows/templates');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '無効化に失敗しました', 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="h-48 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-96 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700">{error}</p>
        <Button variant="secondary" className="mt-4" onClick={fetchTemplate}>再試行</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => router.push('/workflows/templates')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              テンプレート一覧
            </button>
            <span className="text-gray-400">/</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? '新規テンプレート作成' : 'テンプレート編集'}
          </h1>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>テンプレート削除</Button>
          )}
          <Button onClick={handleSave} loading={saving}>保存</Button>
        </div>
      </div>

      {/* Template Info */}
      <Card>
        <CardHeader title="テンプレート基本情報" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="テンプレート名"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Select
              label="事業"
              required
              options={[
                { label: '事業を選択', value: '' },
                ...businesses.map((b) => ({ label: b.name, value: b.id })),
              ]}
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      {/* Visual flow diagram */}
      {steps.length > 0 && (
        <Card>
          <CardHeader title="フロー図" />
          <CardBody>
            <div className="flex items-center gap-2 overflow-x-auto py-2">
              {steps.map((step, i) => (
                <React.Fragment key={step.id || step._tempId || i}>
                  <div className="flex-shrink-0 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-center min-w-[120px]">
                    <p className="text-xs text-blue-500 mb-0.5">ステップ {step.sortOrder}</p>
                    <p className="text-sm font-medium text-blue-800 truncate max-w-[150px]">
                      {step.title || '(未入力)'}
                    </p>
                    {step.daysFromPrevious > 0 && (
                      <p className="text-xs text-blue-400 mt-0.5">+{step.daysFromPrevious}日</p>
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </React.Fragment>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Steps list */}
      <Card>
        <CardHeader
          title="ステップ一覧"
          action={
            <Button size="sm" onClick={addStep}>+ ステップ追加</Button>
          }
        />
        <CardBody>
          {steps.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">ステップがまだありません</p>
              <Button onClick={addStep}>最初のステップを追加</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {steps.map((step, index) => (
                <div
                  key={step.id || step._tempId || index}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">
                        {step.sortOrder}
                      </span>
                      <span className="text-sm font-medium text-gray-700">
                        ステップ {step.sortOrder}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveStep(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="上に移動"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveStep(index, 'down')}
                        disabled={index === steps.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="下に移動"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => removeStep(index)}
                        className="p-1 text-red-400 hover:text-red-600 ml-2"
                        title="削除"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      label="タイトル"
                      required
                      value={step.title}
                      onChange={(e) => updateStep(index, 'title', e.target.value)}
                      inputSize="sm"
                    />
                    <Input
                      label="説明"
                      value={step.description}
                      onChange={(e) => updateStep(index, 'description', e.target.value)}
                      inputSize="sm"
                    />
                    <Input
                      label="前ステップからの日数"
                      type="number"
                      min={0}
                      value={step.daysFromPrevious}
                      onChange={(e) => updateStep(index, 'daysFromPrevious', Number(e.target.value))}
                      inputSize="sm"
                    />
                    <Input
                      label="担当ロール"
                      value={step.assigneeRole}
                      onChange={(e) => updateStep(index, 'assigneeRole', e.target.value)}
                      inputSize="sm"
                      placeholder="例: MANAGER"
                    />
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={step.isRequired}
                          onChange={(e) => updateStep(index, 'isRequired', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">必須ステップ</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        title="テンプレートの無効化"
        message="このテンプレートを無効化しますか？"
        confirmLabel="無効化"
        cancelLabel="キャンセル"
        variant="danger"
      />
    </div>
  );
}
