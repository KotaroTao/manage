'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

interface WorkflowStep {
  id: string;
  title: string;
  sortOrder: number;
  status: string;
  dueDate: string;
  completedAt: string | null;
  assignee: { id: string; name: string };
}

interface ActiveWorkflow {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  template: { id: string; name: string };
  customerBusiness: {
    id: string;
    customer: { id: string; name: string };
    business: { id: string; name: string; colorCode: string };
  };
  steps: WorkflowStep[];
}

interface BusinessOption {
  id: string;
  name: string;
}

const STEP_STATUS_LABELS: Record<string, string> = {
  PENDING: '未着手',
  WAITING: '待機中',
  ACTIVE: '対応中',
  DONE: '完了',
  SKIPPED: 'スキップ',
};

const STEP_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-300',
  WAITING: 'bg-amber-400',
  ACTIVE: 'bg-blue-500',
  DONE: 'bg-green-500',
  SKIPPED: 'bg-gray-400',
};

export default function ActiveWorkflowsPage() {
  const [workflows, setWorkflows] = useState<ActiveWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  const [filterBusiness, setFilterBusiness] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('status', 'ACTIVE');
      if (filterBusiness) params.set('businessId', filterBusiness);
      if (filterCustomer) params.set('customer', filterCustomer);
      const res = await fetch(`/api/workflows?${params.toString()}`);
      if (!res.ok) throw new Error('ワークフローの取得に失敗しました');
      const json = await res.json();
      setWorkflows(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [filterBusiness, filterCustomer]);

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
  }, [fetchBusinesses]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const getProgress = (wf: ActiveWorkflow) => {
    const total = wf.steps.length;
    if (total === 0) return { completed: 0, total: 0, percent: 0 };
    const completed = wf.steps.filter((s) => s.status === 'DONE' || s.status === 'SKIPPED').length;
    return { completed, total, percent: Math.round((completed / total) * 100) };
  };

  const getCurrentStep = (wf: ActiveWorkflow): string => {
    const active = wf.steps.find((s) => s.status === 'ACTIVE');
    if (active) return active.title;
    const pending = wf.steps.find((s) => s.status === 'PENDING');
    if (pending) return pending.title;
    return '全ステップ完了';
  };

  const renderSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 bg-gray-200 rounded animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">進行中のワークフロー</h1>
        <p className="mt-1 text-sm text-gray-500">アクティブなワークフローの進捗管理</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg">
          <Select
            options={[{ label: 'すべての事業', value: '' }, ...businesses.map((b) => ({ label: b.name, value: b.id }))]}
            value={filterBusiness}
            onChange={(e) => setFilterBusiness(e.target.value)}
          />
          <input
            type="text"
            placeholder="顧客名で検索"
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchWorkflows}>再試行</Button>
        </div>
      )}

      {/* Table */}
      {loading ? renderSkeleton() : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">顧客名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">事業</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">フロー名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">進捗</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">開始日</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">現在のステップ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {workflows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-500">
                      進行中のワークフローはありません
                    </td>
                  </tr>
                ) : (
                  workflows.map((wf) => {
                    const progress = getProgress(wf);
                    const isExpanded = expandedRow === wf.id;
                    return (
                      <React.Fragment key={wf.id}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedRow(isExpanded ? null : wf.id)}
                        >
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {wf.customerBusiness.customer.name}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: wf.customerBusiness.business.colorCode }}
                              />
                              {wf.customerBusiness.business.name}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 hidden md:table-cell">
                            {wf.template.name}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: `${progress.percent}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {progress.completed}/{progress.total}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 hidden md:table-cell">
                            {formatDate(wf.startedAt)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 hidden lg:table-cell">
                            {getCurrentStep(wf)}
                          </td>
                        </tr>
                        {/* Expanded steps */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                              <div className="space-y-2">
                                {[...wf.steps]
                                  .sort((a, b) => a.sortOrder - b.sortOrder)
                                  .map((step) => (
                                    <div
                                      key={step.id}
                                      className="flex items-center gap-3 p-2 rounded bg-white border border-gray-100"
                                    >
                                      <span
                                        className={`w-3 h-3 rounded-full flex-shrink-0 ${STEP_STATUS_COLORS[step.status] || 'bg-gray-300'}`}
                                      />
                                      <span className="text-sm font-medium text-gray-900 flex-1">
                                        {step.sortOrder}. {step.title}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {step.assignee.name}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {formatDate(step.dueDate)}
                                      </span>
                                      <Badge
                                        variant={
                                          step.status === 'DONE' ? 'success' :
                                          step.status === 'ACTIVE' ? 'primary' :
                                          step.status === 'WAITING' ? 'warning' : 'default'
                                        }
                                        size="sm"
                                      >
                                        {STEP_STATUS_LABELS[step.status] || step.status}
                                      </Badge>
                                    </div>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
