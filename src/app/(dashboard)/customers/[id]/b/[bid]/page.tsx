'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatDate, formatDateTime, formatCurrency, isOverdue, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CBDetail {
  id: string;
  status: string;
  nextActionDate: string | null;
  nextActionMemo: string | null;
  customFields: Record<string, unknown>;
  contractStartDate: string | null;
  contractEndDate: string | null;
  monthlyFee: number | null;
  note: string | null;
  customer: { id: string; name: string; company: string | null };
  business: { id: string; name: string; code: string; colorCode: string };
  assignee: { id: string; name: string } | null;
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

interface Workflow {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  template: { id: string; name: string };
  steps: WorkflowStep[];
}

interface WorkflowStep {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sortOrder: number;
  dueDate: string;
  completedAt: string | null;
  note: string | null;
  assignee: { id: string; name: string };
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string;
  completedAt: string | null;
  assignee: { id: string; name: string };
}

interface ActivityNote {
  id: string;
  type: string;
  title: string;
  content: string | null;
  contactedAt: string;
  createdAt: string;
  user: { id: string; name: string };
}

interface SharedPage {
  id: string;
  type: string;
  title: string;
  content: string;
  isPublished: boolean;
  slug: string;
  createdAt: string;
}

interface FlowTemplate {
  id: string;
  name: string;
  description: string | null;
}

interface User {
  id: string;
  name: string;
}

type TabId = 'overview' | 'workflows' | 'tasks' | 'activity' | 'shared';

/* -------------------------------------------------------------------------- */
/*  Tab definitions                                                            */
/* -------------------------------------------------------------------------- */

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: '概要' },
  { id: 'workflows', label: '業務フロー' },
  { id: 'tasks', label: 'タスク' },
  { id: 'activity', label: '対応履歴' },
  { id: 'shared', label: '共有' },
];

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="h-6 bg-gray-200 rounded w-64 mb-4" />
        <div className="h-4 bg-gray-200 rounded w-48 mb-6" />
        <div className="flex gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded w-20" />
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Activity type helpers                                                      */
/* -------------------------------------------------------------------------- */

const activityTypeMap: Record<string, { label: string; icon: string; color: string }> = {
  CALL: { label: '電話', icon: '\u260E', color: 'bg-green-100 text-green-700' },
  EMAIL: { label: 'メール', icon: '\u2709', color: 'bg-blue-100 text-blue-700' },
  MEETING: { label: '会議', icon: '\u{1F465}', color: 'bg-purple-100 text-purple-700' },
  VISIT: { label: '訪問', icon: '\u{1F3E2}', color: 'bg-amber-100 text-amber-700' },
  MEMO: { label: 'メモ', icon: '\u{1F4DD}', color: 'bg-gray-100 text-gray-700' },
};

const priorityMap: Record<string, { label: string; cls: string }> = {
  HIGH: { label: '高', cls: 'bg-red-50 text-red-700 border-red-200' },
  MEDIUM: { label: '中', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  LOW: { label: '低', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
};

/* -------------------------------------------------------------------------- */
/*  Overview Tab                                                               */
/* -------------------------------------------------------------------------- */

function OverviewTab({
  detail,
  fieldDefs,
  users,
  onUpdate,
}: {
  detail: CBDetail;
  fieldDefs: CustomFieldDef[];
  users: User[];
  onUpdate: () => void;
}) {
  const { showToast } = useToast();
  const [editingFields, setEditingFields] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(
    detail.customFields || {}
  );
  const [saving, setSaving] = useState(false);
  const [editMeta, setEditMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({
    contractStartDate: detail.contractStartDate || '',
    contractEndDate: detail.contractEndDate || '',
    monthlyFee: detail.monthlyFee?.toString() || '',
    note: detail.note || '',
    assigneeId: detail.assignee?.id || '',
  });

  const handleSaveFields = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${detail.customer.id}/businesses/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields: fieldValues }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      showToast('カスタムフィールドを保存しました', 'success');
      setEditingFields(false);
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMeta = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${detail.customer.id}/businesses/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractStartDate: metaForm.contractStartDate || null,
          contractEndDate: metaForm.contractEndDate || null,
          monthlyFee: metaForm.monthlyFee ? Number(metaForm.monthlyFee) : null,
          note: metaForm.note || null,
          assigneeId: metaForm.assigneeId || null,
        }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      showToast('情報を更新しました', 'success');
      setEditMeta(false);
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderFieldInput = (def: CustomFieldDef) => {
    const val = fieldValues[def.key];
    switch (def.fieldType) {
      case 'TEXT':
        return (
          <input
            type="text"
            value={(val as string) || ''}
            onChange={(e) => setFieldValues((f) => ({ ...f, [def.key]: e.target.value }))}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );
      case 'NUMBER':
        return (
          <input
            type="number"
            value={(val as string) || ''}
            onChange={(e) => setFieldValues((f) => ({ ...f, [def.key]: e.target.value }))}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );
      case 'DATE':
        return (
          <input
            type="date"
            value={(val as string) || ''}
            onChange={(e) => setFieldValues((f) => ({ ...f, [def.key]: e.target.value }))}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );
      case 'SELECT':
        return (
          <select
            value={(val as string) || ''}
            onChange={(e) => setFieldValues((f) => ({ ...f, [def.key]: e.target.value }))}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">選択してください</option>
            {def.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case 'CHECKBOX':
        return (
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!val}
              onChange={(e) => setFieldValues((f) => ({ ...f, [def.key]: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">はい</span>
          </label>
        );
      case 'TEXTAREA':
        return (
          <textarea
            value={(val as string) || ''}
            onChange={(e) => setFieldValues((f) => ({ ...f, [def.key]: e.target.value }))}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        );
      default:
        return (
          <input
            type="text"
            value={String(val || '')}
            onChange={(e) => setFieldValues((f) => ({ ...f, [def.key]: e.target.value }))}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Custom Fields */}
      {fieldDefs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">カスタムフィールド</h3>
            {!editingFields ? (
              <button type="button" onClick={() => setEditingFields(true)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                編集
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setEditingFields(false)} className="text-sm text-gray-500 hover:text-gray-700">
                  キャンセル
                </button>
                <button type="button" onClick={handleSaveFields} disabled={saving} className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 flex items-center gap-1">
                  {saving && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                  保存
                </button>
              </div>
            )}
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...fieldDefs]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((def) => (
                <div key={def.id}>
                  <label className="block text-xs text-gray-500 mb-1">
                    {def.name}
                    {def.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {editingFields ? (
                    renderFieldInput(def)
                  ) : (
                    <p className="text-sm text-gray-900">
                      {def.fieldType === 'CHECKBOX'
                        ? fieldValues[def.key] ? 'はい' : 'いいえ'
                        : String(fieldValues[def.key] || '-')}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Contract/Meta Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">契約情報</h3>
          {!editMeta ? (
            <button type="button" onClick={() => setEditMeta(true)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              編集
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEditMeta(false)} className="text-sm text-gray-500 hover:text-gray-700">
                キャンセル
              </button>
              <button type="button" onClick={handleSaveMeta} disabled={saving} className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 flex items-center gap-1">
                {saving && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                保存
              </button>
            </div>
          )}
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">契約開始日</p>
            {editMeta ? (
              <input type="date" value={metaForm.contractStartDate} onChange={(e) => setMetaForm((f) => ({ ...f, contractStartDate: e.target.value }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            ) : (
              <p className="text-sm text-gray-900">{formatDate(detail.contractStartDate) || '-'}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">契約終了日</p>
            {editMeta ? (
              <input type="date" value={metaForm.contractEndDate} onChange={(e) => setMetaForm((f) => ({ ...f, contractEndDate: e.target.value }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            ) : (
              <p className="text-sm text-gray-900">{formatDate(detail.contractEndDate) || '-'}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">月額報酬</p>
            {editMeta ? (
              <input type="number" value={metaForm.monthlyFee} onChange={(e) => setMetaForm((f) => ({ ...f, monthlyFee: e.target.value }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
            ) : (
              <p className="text-sm text-gray-900">{formatCurrency(detail.monthlyFee) || '-'}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">担当者</p>
            {editMeta ? (
              <select value={metaForm.assigneeId} onChange={(e) => setMetaForm((f) => ({ ...f, assigneeId: e.target.value }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">未設定</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-900">{detail.assignee?.name || '未設定'}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-gray-500 mb-1">備考</p>
            {editMeta ? (
              <textarea value={metaForm.note} onChange={(e) => setMetaForm((f) => ({ ...f, note: e.target.value }))} rows={3} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.note || '-'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Workflow Tab                                                               */
/* -------------------------------------------------------------------------- */

function WorkflowsTab({
  workflows,
  templates,
  cbId,
  customerId,
  onUpdate,
}: {
  workflows: Workflow[];
  templates: FlowTemplate[];
  cbId: string;
  customerId: string;
  onUpdate: () => void;
}) {
  const { showToast } = useToast();
  const [showStart, setShowStart] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [starting, setStarting] = useState(false);
  const [completingStep, setCompletingStep] = useState<string | null>(null);

  const handleStartWorkflow = async () => {
    if (!selectedTemplate) {
      showToast('テンプレートを選択してください', 'error');
      return;
    }
    setStarting(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/businesses/${cbId}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplate }),
      });
      if (!res.ok) throw new Error('フローの開始に失敗しました');
      showToast('フローを開始しました', 'success');
      setShowStart(false);
      setSelectedTemplate('');
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleCompleteStep = async (workflowId: string, stepId: string) => {
    setCompletingStep(stepId);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/businesses/${cbId}/workflows/${workflowId}/steps/${stepId}/complete`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('ステップの完了に失敗しました');
      showToast('ステップを完了しました', 'success');
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setCompletingStep(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowStart(!showStart)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          フロー開始
        </button>
      </div>

      {showStart && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-3">新しいフローを開始</h4>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-blue-700 mb-1">テンプレート</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="block w-full rounded-lg border border-blue-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">選択してください</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleStartWorkflow}
              disabled={starting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {starting && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
              開始
            </button>
          </div>
        </div>
      )}

      {workflows.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-400">
          フローはありません
        </div>
      ) : (
        workflows.map((wf) => {
          const totalSteps = wf.steps.length;
          const completedSteps = wf.steps.filter((s) => s.status === 'DONE').length;
          const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

          return (
            <div key={wf.id} className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-gray-900">{wf.template.name}</h4>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full border',
                    wf.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    wf.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' :
                    'bg-gray-50 text-gray-600 border-gray-200'
                  )}>
                    {wf.status === 'IN_PROGRESS' ? '進行中' : wf.status === 'COMPLETED' ? '完了' : wf.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">
                    {completedSteps}/{totalSteps}
                  </span>
                </div>
              </div>
              <div className="p-5">
                <div className="space-y-3">
                  {[...wf.steps]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((step) => (
                      <div key={step.id} className="flex items-start gap-3">
                        {/* Status indicator */}
                        <div className="shrink-0 mt-0.5">
                          {step.status === 'DONE' ? (
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-xs">{'\u2713'}</span>
                          ) : step.status === 'ACTIVE' ? (
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs">{'\u25CF'}</span>
                          ) : (
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-400 text-xs">{'\u25CB'}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              'text-sm font-medium',
                              step.status === 'DONE' ? 'text-gray-400 line-through' : 'text-gray-900'
                            )}>
                              {step.title}
                            </span>
                            {step.status === 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => handleCompleteStep(wf.id, step.id)}
                                disabled={completingStep === step.id}
                                className="text-xs px-2 py-1 font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                              >
                                {completingStep === step.id && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                                完了
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                            <span>期限: {formatDate(step.dueDate)}</span>
                            <span>{step.assignee.name}</span>
                            {step.completedAt && <span>完了: {formatDate(step.completedAt)}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tasks Tab                                                                  */
/* -------------------------------------------------------------------------- */

function TasksTab({
  tasks,
  cbId,
  customerId,
  users,
  onUpdate,
}: {
  tasks: Task[];
  cbId: string;
  customerId: string;
  users: User[];
  onUpdate: () => void;
}) {
  const { showToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigneeId: '',
    dueDate: '',
    priority: 'MEDIUM',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.assigneeId || !form.dueDate) {
      showToast('タイトル、担当者、期限は必須です', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/businesses/${cbId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          assigneeId: form.assigneeId,
          dueDate: form.dueDate,
          priority: form.priority,
          status: 'ACTIVE',
        }),
      });
      if (!res.ok) throw new Error('タスクの追加に失敗しました');
      showToast('タスクを追加しました', 'success');
      setShowAdd(false);
      setForm({ title: '', description: '', assigneeId: '', dueDate: '', priority: 'MEDIUM' });
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (taskId: string) => {
    setActionId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/complete`, { method: 'POST' });
      if (!res.ok) throw new Error('完了に失敗しました');
      showToast('タスクを完了しました', 'success');
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('このタスクを削除しますか？')) return;
    setActionId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
      showToast('タスクを削除しました', 'success');
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          タスク追加
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h4 className="text-sm font-bold text-gray-900 mb-4">新規タスク</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">タイトル <span className="text-red-500">*</span></label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当者 <span className="text-red-500">*</span></label>
                <select value={form.assigneeId} onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))} required className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">選択</option>
                  {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">期限 <span className="text-red-500">*</span></label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} required className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
                <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="HIGH">高</option>
                  <option value="MEDIUM">中</option>
                  <option value="LOW">低</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                {submitting && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                追加
              </button>
            </div>
          </form>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-400">
          タスクはありません
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {tasks.map((task) => {
            const p = priorityMap[task.priority] || priorityMap.MEDIUM;
            const overdue = task.status !== 'DONE' && isOverdue(task.dueDate);
            return (
              <div key={task.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-sm font-medium',
                      task.status === 'DONE' ? 'text-gray-400 line-through' : 'text-gray-900'
                    )}>
                      {task.title}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${p.cls}`}>{p.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                    <span className={overdue ? 'text-red-500 font-medium' : ''}>
                      期限: {formatDate(task.dueDate)}
                    </span>
                    <span>{task.assignee.name}</span>
                  </div>
                </div>
                {task.status !== 'DONE' && (
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => handleComplete(task.id)}
                      disabled={actionId === task.id}
                      className="text-xs px-2 py-1 font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      完了
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(task.id)}
                      disabled={actionId === task.id}
                      className="text-xs px-2 py-1 font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Activity Tab                                                               */
/* -------------------------------------------------------------------------- */

function ActivityTab({
  notes,
  cbId,
  customerId,
  onUpdate,
}: {
  notes: ActivityNote[];
  cbId: string;
  customerId: string;
  onUpdate: () => void;
}) {
  const { showToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: 'MEMO',
    title: '',
    content: '',
    contactedAt: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) {
      showToast('タイトルは必須です', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/businesses/${cbId}/activity-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('登録に失敗しました');
      showToast('対応記録を追加しました', 'success');
      setShowAdd(false);
      setForm({ type: 'MEMO', title: '', content: '', contactedAt: new Date().toISOString().split('T')[0] });
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          対応記録
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h4 className="text-sm font-bold text-gray-900 mb-4">対応記録を追加</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">種類</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="CALL">電話</option>
                  <option value="EMAIL">メール</option>
                  <option value="MEETING">会議</option>
                  <option value="VISIT">訪問</option>
                  <option value="MEMO">メモ</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">対応日</label>
                <input type="date" value={form.contactedAt} onChange={(e) => setForm((f) => ({ ...f, contactedAt: e.target.value }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">タイトル <span className="text-red-500">*</span></label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
              <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={4} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                {submitting && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                追加
              </button>
            </div>
          </form>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-400">
          対応履歴はありません
        </div>
      ) : (
        <div className="space-y-0">
          {notes.map((note, idx) => {
            const info = activityTypeMap[note.type] || activityTypeMap.MEMO;
            return (
              <div key={note.id} className="flex gap-4">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <span className={`flex items-center justify-center w-8 h-8 rounded-full text-sm shrink-0 ${info.color}`}>
                    {info.icon}
                  </span>
                  {idx < notes.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                </div>
                <div className="flex-1 pb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{note.title}</span>
                      <span className="text-xs text-gray-400 ml-2">{info.label}</span>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(note.contactedAt)}</span>
                  </div>
                  {note.content && (
                    <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{note.content}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">{note.user.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared Tab                                                                 */
/* -------------------------------------------------------------------------- */

function SharedTab({
  pages,
  cbId,
  customerId,
  onUpdate,
}: {
  pages: SharedPage[];
  cbId: string;
  customerId: string;
  onUpdate: () => void;
}) {
  const { showToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [showLink, setShowLink] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState({ scope: 'SINGLE', passcode: '', expiresInDays: '30' });
  const [form, setForm] = useState({
    type: 'REPORT',
    title: '',
    content: '',
  });

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) {
      showToast('タイトルは必須です', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/businesses/${cbId}/shared-pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          isPublished: false,
        }),
      });
      if (!res.ok) throw new Error('作成に失敗しました');
      showToast('ページを作成しました', 'success');
      setShowCreate(false);
      setForm({ type: 'REPORT', title: '', content: '' });
      onUpdate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateLink = async (pageId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/shared-pages/${pageId}/generate-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: linkForm.scope,
          passcode: linkForm.passcode || undefined,
          expiresInDays: Number(linkForm.expiresInDays) || 30,
        }),
      });
      if (!res.ok) throw new Error('リンクの生成に失敗しました');
      const json = await res.json();
      setGeneratedUrl(json.data?.url || json.url || `${window.location.origin}/shared/${pageId}`);
      showToast('共有リンクを生成しました', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast('リンクをコピーしました', 'success');
    }).catch(() => {
      showToast('コピーに失敗しました', 'error');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          ページ作成
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h4 className="text-sm font-bold text-gray-900 mb-4">新規共有ページ</h4>
          <form onSubmit={handleCreatePage} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">種類</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="REPORT">レポート</option>
                  <option value="PROPOSAL">提案書</option>
                  <option value="PORTAL">ポータル</option>
                  <option value="OTHER">その他</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">タイトル <span className="text-red-500">*</span></label>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">内容 (Markdown)</label>
              <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={8} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" placeholder="Markdownで記述..." />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                {submitting && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                作成
              </button>
            </div>
          </form>
        </div>
      )}

      {pages.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-400">
          共有ページはありません
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((page) => (
            <div key={page.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{page.title}</h4>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span>{page.type}</span>
                    <span>{formatDate(page.createdAt)}</span>
                  </div>
                </div>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full border',
                  page.isPublished
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                )}>
                  {page.isPublished ? '公開' : '下書き'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowLink(showLink === page.id ? null : page.id);
                    setGeneratedUrl(null);
                  }}
                  className="text-xs px-3 py-1.5 font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-200"
                >
                  共有リンク発行
                </button>
              </div>

              {showLink === page.id && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h5 className="text-xs font-medium text-gray-700 mb-3">共有リンク設定</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">スコープ</label>
                      <select value={linkForm.scope} onChange={(e) => setLinkForm((f) => ({ ...f, scope: e.target.value }))} className="block w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="SINGLE">単一ページ</option>
                        <option value="PORTAL">ポータル</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">パスコード</label>
                      <input type="text" value={linkForm.passcode} onChange={(e) => setLinkForm((f) => ({ ...f, passcode: e.target.value }))} placeholder="任意" className="block w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">有効期限(日)</label>
                      <input type="number" value={linkForm.expiresInDays} onChange={(e) => setLinkForm((f) => ({ ...f, expiresInDays: e.target.value }))} className="block w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateLink(page.id)}
                    disabled={submitting}
                    className="text-xs px-3 py-1.5 font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {submitting && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                    リンクを生成
                  </button>
                  {generatedUrl && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={generatedUrl}
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(generatedUrl)}
                        className="text-xs px-3 py-1.5 font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                      >
                        コピー
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function CustomerBusinessDetailPage() {
  const params = useParams();
  const customerId = params.id as string;
  const cbId = params.bid as string;
  const { showToast } = useToast();

  const [detail, setDetail] = useState<CBDetail | null>(null);
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<ActivityNote[]>([]);
  const [sharedPages, setSharedPages] = useState<SharedPage[]>([]);
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [editingNextAction, setEditingNextAction] = useState(false);
  const [nextActionDate, setNextActionDate] = useState('');
  const [savingNextAction, setSavingNextAction] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailRes, usersRes] = await Promise.all([
        fetch(`/api/customers/${customerId}/businesses/${cbId}`),
        fetch('/api/settings/users'),
      ]);
      if (!detailRes.ok) throw new Error('データの取得に失敗しました');
      const detailJson = await detailRes.json();
      const d = detailJson.data || detailJson;
      setDetail(d);
      setFieldDefs(d.fieldDefs || []);
      setWorkflows(d.workflows || []);
      setTasks(d.tasks || []);
      setNotes(d.activityNotes || []);
      setSharedPages(d.sharedPages || []);
      setTemplates(d.templates || []);
      setNextActionDate(d.nextActionDate ? d.nextActionDate.split('T')[0] : '');

      if (usersRes.ok) {
        const usersJson = await usersRes.json();
        setUsers(usersJson.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [customerId, cbId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSaveNextAction = async () => {
    setSavingNextAction(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/businesses/${cbId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextActionDate: nextActionDate || null }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      showToast('次回対応日を更新しました', 'success');
      setEditingNextAction(false);
      fetchAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'エラーが発生しました', 'error');
    } finally {
      setSavingNextAction(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <PageSkeleton />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
          <p className="text-red-600 mb-4">{error || 'データが見つかりません'}</p>
          <button type="button" onClick={fetchAll} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            再試行
          </button>
        </div>
      </div>
    );
  }

  const overdue = detail.nextActionDate && isOverdue(detail.nextActionDate);
  const missingDate = !detail.nextActionDate;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Breadcrumb / Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/customers" className="hover:text-blue-600">顧客一覧</Link>
          <span>/</span>
          <Link href={`/customers/${customerId}`} className="hover:text-blue-600">
            {detail.customer.name}
          </Link>
          <span>/</span>
          <span className="text-gray-700">{detail.business.name}</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: detail.business.colorCode || '#6B7280' }}
            />
            <h1 className="text-2xl font-bold text-gray-900">{detail.business.name}</h1>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full border',
              detail.status === 'ACTIVE'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            )}>
              {detail.status === 'ACTIVE' ? '有効' : detail.status}
            </span>
          </div>

          {/* Next Action Date */}
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
              overdue ? 'bg-red-50 border-red-200 text-red-700' :
              missingDate ? 'bg-orange-50 border-orange-200 text-orange-700' :
              'bg-gray-50 border-gray-200 text-gray-700'
            )}>
              <span className="font-medium">次回対応日:</span>
              {editingNextAction ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={nextActionDate}
                    onChange={(e) => setNextActionDate(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNextAction}
                    disabled={savingNextAction}
                    className="text-xs px-2 py-1 font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingNextAction ? '...' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingNextAction(false)}
                    className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <span className="font-bold">
                    {detail.nextActionDate
                      ? formatDate(detail.nextActionDate)
                      : '未設定'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingNextAction(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-1"
                  >
                    {detail.nextActionDate ? '変更' : '設定する'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0 -mb-px overflow-x-auto" aria-label="タブ">
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

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          detail={detail}
          fieldDefs={fieldDefs}
          users={users}
          onUpdate={fetchAll}
        />
      )}
      {activeTab === 'workflows' && (
        <WorkflowsTab
          workflows={workflows}
          templates={templates}
          cbId={cbId}
          customerId={customerId}
          onUpdate={fetchAll}
        />
      )}
      {activeTab === 'tasks' && (
        <TasksTab
          tasks={tasks}
          cbId={cbId}
          customerId={customerId}
          users={users}
          onUpdate={fetchAll}
        />
      )}
      {activeTab === 'activity' && (
        <ActivityTab
          notes={notes}
          cbId={cbId}
          customerId={customerId}
          onUpdate={fetchAll}
        />
      )}
      {activeTab === 'shared' && (
        <SharedTab
          pages={sharedPages}
          cbId={cbId}
          customerId={customerId}
          onUpdate={fetchAll}
        />
      )}
    </div>
  );
}
