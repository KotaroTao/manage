'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatRelativeDate, isOverdue, isApproaching, getApiError } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import type { PaginatedResponse } from '@/types';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string;
  completedAt: string | null;
  createdAt: string;
  type: 'TASK' | 'WORKFLOW_STEP';
  assignee: { id: string; name: string };
  business: { id: string; name: string; colorCode: string } | null;
  customerBusiness: {
    id: string;
    customer: { id: string; name: string; company: string | null };
    business: { id: string; name: string };
  } | null;
}

interface UserOption {
  id: string;
  name: string;
}

interface BusinessOption {
  id: string;
  name: string;
}

type ViewMode = 'list' | 'kanban' | 'calendar';

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: '緊急',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
};

const PRIORITY_VARIANTS: Record<string, 'danger' | 'warning' | 'info' | 'gray'> = {
  URGENT: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'gray',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: '未着手',
  WAITING: '待機中',
  ACTIVE: '対応中',
  DONE: '完了',
};

const KANBAN_COLUMNS = [
  { key: 'PENDING', label: '未着手', color: 'bg-gray-100' },
  { key: 'WAITING', label: '待機中', color: 'bg-amber-50' },
  { key: 'ACTIVE', label: '対応中', color: 'bg-blue-50' },
  { key: 'DONE', label: '完了', color: 'bg-green-50' },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function TasksPage() {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Data
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Options for dropdowns
  const [users, setUsers] = useState<UserOption[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  // Pagination (list view)
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Filters
  const [searchTitle, setSearchTitle] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterBusiness, setFilterBusiness] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    customerBusinessId: '',
    businessId: '',
    assigneeId: '',
    dueDate: '',
    priority: 'MEDIUM',
  });

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Inline expand for list view
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  /* --- Fetch helpers --- */
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (searchTitle) params.set('query', searchTitle);
      if (filterAssignee) params.set('assigneeId', filterAssignee);
      if (filterBusiness) params.set('businessId', filterBusiness);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);
      if (filterDateFrom) params.set('dueDateFrom', filterDateFrom);
      if (filterDateTo) params.set('dueDateTo', filterDateTo);

      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (!res.ok) throw new Error(await getApiError(res, 'タスクの取得に失敗しました'));
      const json: PaginatedResponse<TaskItem> = await res.json();
      setTasks(json.data);
      setTotalPages(json.pagination.totalPages);
      setTotalCount(json.pagination.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [page, searchTitle, filterAssignee, filterBusiness, filterStatus, filterPriority, filterDateFrom, filterDateTo]);

  const fetchOptions = useCallback(async () => {
    try {
      const [usersRes, bizRes] = await Promise.all([
        fetch('/api/settings/users?pageSize=100'),
        fetch('/api/businesses?pageSize=100'),
      ]);
      if (usersRes.ok) {
        const json = await usersRes.json();
        setUsers((json.data || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      }
      if (bizRes.ok) {
        const json = await bizRes.json();
        setBusinesses((json.data || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  /* --- Actions --- */
  const handleComplete = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DONE', completedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '更新に失敗しました'));
      showToast('タスクを完了にしました', 'success');
      fetchTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新に失敗しました', 'error');
    }
  };

  const handleChangeStatus = async (taskId: string, newStatus: string) => {
    try {
      const body: Record<string, string> = { status: newStatus };
      if (newStatus === 'DONE') body.completedAt = new Date().toISOString();
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await getApiError(res, '更新に失敗しました'));
      showToast('ステータスを更新しました', 'success');
      fetchTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新に失敗しました', 'error');
    }
  };

  const handleCreate = async () => {
    if (!newTask.title || !newTask.assigneeId || !newTask.dueDate) {
      showToast('タイトル、担当者、期限は必須です', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTask, status: 'PENDING' }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '作成に失敗しました'));
      showToast('タスクを作成しました', 'success');
      setShowCreateModal(false);
      setNewTask({ title: '', description: '', customerBusinessId: '', businessId: '', assigneeId: '', dueDate: '', priority: 'MEDIUM' });
      fetchTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '作成に失敗しました', 'error');
    } finally {
      setCreating(false);
    }
  };

  /* --- Calendar helpers --- */
  const calendarYear = calendarDate.getFullYear();
  const calendarMonth = calendarDate.getMonth();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay();
  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === calendarYear && today.getMonth() === calendarMonth && today.getDate() === day;

  const tasksByDay = useMemo(() => {
    const map: Record<number, TaskItem[]> = {};
    tasks.forEach((t) => {
      const d = new Date(t.dueDate);
      if (d.getFullYear() === calendarYear && d.getMonth() === calendarMonth) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(t);
      }
    });
    return map;
  }, [tasks, calendarYear, calendarMonth]);

  const prevMonth = () => setCalendarDate(new Date(calendarYear, calendarMonth - 1, 1));
  const nextMonth = () => setCalendarDate(new Date(calendarYear, calendarMonth + 1, 1));

  /* --- Kanban helpers --- */
  const tasksByStatus = useMemo(() => {
    const map: Record<string, TaskItem[]> = { PENDING: [], WAITING: [], ACTIVE: [], DONE: [] };
    tasks.forEach((t) => {
      if (map[t.status]) map[t.status].push(t);
    });
    return map;
  }, [tasks]);

  /* --- Skeleton --- */
  const renderSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">タスク管理</h1>
          <p className="mt-1 text-sm text-gray-500">タスク・ワークフローステップの統合管理</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>+ 新規タスク</Button>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { key: 'list', label: 'リスト' },
          { key: 'kanban', label: 'カンバン' },
          { key: 'calendar', label: 'カレンダー' },
        ] as { key: ViewMode; label: string }[]).map((v) => (
          <button
            key={v.key}
            onClick={() => setViewMode(v.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === v.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Filters bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {/* Quick filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={() => { setFilterAssignee(currentUser?.id || ''); setFilterStatus(''); setFilterPriority(''); setFilterDateFrom(''); setFilterDateTo(''); setSearchTitle(''); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              filterAssignee === currentUser?.id && !filterStatus ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            自分のタスク
          </button>
          <button
            type="button"
            onClick={() => {
              const t = new Date(); t.setHours(0,0,0,0);
              const todayStr = t.toISOString().split('T')[0];
              setFilterDateFrom(todayStr); setFilterDateTo(todayStr); setFilterAssignee(''); setFilterStatus(''); setFilterPriority(''); setSearchTitle(''); setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              filterDateFrom === filterDateTo && filterDateFrom && !filterStatus ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            今日が期限
          </button>
          <button
            type="button"
            onClick={() => { setFilterStatus('ACTIVE'); setFilterAssignee(''); setFilterPriority(''); setFilterDateFrom(''); setFilterDateTo(''); setSearchTitle(''); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              filterStatus === 'ACTIVE' && !filterAssignee ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            対応中
          </button>
          <button
            type="button"
            onClick={() => { setFilterPriority('URGENT'); setFilterAssignee(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); setSearchTitle(''); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              filterPriority === 'URGENT' && !filterAssignee ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            緊急
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3">
          <Input
            placeholder="タイトル検索"
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
          />
          <Select
            options={[{ label: 'すべての担当者', value: '' }, ...users.map((u) => ({ label: u.name, value: u.id }))]}
            value={filterAssignee}
            onChange={(e) => { setFilterAssignee(e.target.value); setPage(1); }}
          />
          <Select
            options={[{ label: 'すべての事業', value: '' }, ...businesses.map((b) => ({ label: b.name, value: b.id }))]}
            value={filterBusiness}
            onChange={(e) => { setFilterBusiness(e.target.value); setPage(1); }}
          />
          <Select
            options={[
              { label: 'すべてのステータス', value: '' },
              { label: '対応中', value: 'ACTIVE' },
              { label: '完了', value: 'DONE' },
              { label: '未着手', value: 'PENDING' },
              { label: '待機中', value: 'WAITING' },
            ]}
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          />
          <Select
            options={[
              { label: 'すべての優先度', value: '' },
              { label: '緊急', value: 'URGENT' },
              { label: '高', value: 'HIGH' },
              { label: '中', value: 'MEDIUM' },
              { label: '低', value: 'LOW' },
            ]}
            value={filterPriority}
            onChange={(e) => { setFilterPriority(e.target.value); setPage(1); }}
          />
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
            placeholder="開始日"
          />
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
            placeholder="終了日"
          />
        </div>
        {(searchTitle || filterAssignee || filterBusiness || filterStatus || filterPriority || filterDateFrom || filterDateTo) && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { setSearchTitle(''); setFilterAssignee(''); setFilterBusiness(''); setFilterStatus(''); setFilterPriority(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              フィルターをリセット
            </button>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchTasks}>再試行</Button>
        </div>
      )}

      {/* Loading */}
      {loading ? renderSkeleton() : (
        <>
          {/* ============================================================ */}
          {/* LIST VIEW                                                     */}
          {/* ============================================================ */}
          {viewMode === 'list' && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">タイトル</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">顧客名</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">事業</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">担当者</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">期限</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">優先度</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">ステータス</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">種別</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {tasks.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-16 text-center text-sm text-gray-500">
                          タスクが見つかりません
                        </td>
                      </tr>
                    ) : (
                      tasks.map((task) => {
                        const overdue = task.status !== 'DONE' && isOverdue(task.dueDate);
                        const approaching = !overdue && task.status !== 'DONE' && isApproaching(task.dueDate, 3);
                        return (
                          <React.Fragment key={task.id}>
                            <tr
                              className={`transition-colors cursor-pointer ${
                                overdue ? 'bg-red-50 hover:bg-red-100' :
                                approaching ? 'bg-amber-50 hover:bg-amber-100' :
                                'hover:bg-gray-50'
                              }`}
                              onClick={() => setExpandedRow(expandedRow === task.id ? null : task.id)}
                            >
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {task.title}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 hidden md:table-cell">
                                {task.customerBusiness?.customer.name || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 hidden md:table-cell">
                                {task.business?.name || task.customerBusiness?.business.name || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{task.assignee.name}</td>
                              <td className="px-4 py-3 text-sm whitespace-nowrap">
                                <span className={overdue ? 'text-red-600 font-medium' : approaching ? 'text-amber-600' : 'text-gray-700'}>
                                  {formatDate(task.dueDate)}
                                  {task.status !== 'DONE' && formatRelativeDate(task.dueDate) && (
                                    <span className="text-xs ml-1">({formatRelativeDate(task.dueDate)})</span>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge variant={PRIORITY_VARIANTS[task.priority] || 'gray'} size="sm">
                                  {PRIORITY_LABELS[task.priority] || task.priority}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge
                                  variant={task.status === 'DONE' ? 'success' : task.status === 'ACTIVE' ? 'primary' : 'default'}
                                  size="sm"
                                >
                                  {STATUS_LABELS[task.status] || task.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-center hidden lg:table-cell">
                                <Badge variant={task.type === 'WORKFLOW_STEP' ? 'info' : 'default'} size="sm">
                                  {task.type === 'WORKFLOW_STEP' ? 'フロー' : 'タスク'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {task.status !== 'DONE' && (
                                  <button
                                    onClick={(e) => handleComplete(task.id, e)}
                                    className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
                                  >
                                    完了
                                  </button>
                                )}
                              </td>
                            </tr>
                            {/* Expanded detail row */}
                            {expandedRow === task.id && (
                              <tr>
                                <td colSpan={9} className="px-4 py-4 bg-gray-50 border-t border-gray-100">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <p className="text-gray-500 mb-1">説明</p>
                                      <p className="text-gray-700">{task.description || '(なし)'}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500 mb-1">作成日</p>
                                      <p className="text-gray-700">{formatDate(task.createdAt)}</p>
                                      {task.completedAt && (
                                        <>
                                          <p className="text-gray-500 mb-1 mt-2">完了日</p>
                                          <p className="text-gray-700">{formatDate(task.completedAt)}</p>
                                        </>
                                      )}
                                    </div>
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
                  <p className="text-sm text-gray-500">
                    全 <span className="font-medium">{totalCount}</span> 件中{' '}
                    <span className="font-medium">{(page - 1) * pageSize + 1}</span> -{' '}
                    <span className="font-medium">{Math.min(page * pageSize, totalCount)}</span> 件
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      前へ
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pNum: number;
                      if (totalPages <= 7) pNum = i + 1;
                      else if (page <= 4) pNum = i + 1;
                      else if (page >= totalPages - 3) pNum = totalPages - 6 + i;
                      else pNum = page - 3 + i;
                      return (
                        <button
                          key={pNum}
                          type="button"
                          onClick={() => setPage(pNum)}
                          className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                            pNum === page
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pNum}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      次へ
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* KANBAN VIEW                                                   */}
          {/* ============================================================ */}
          {viewMode === 'kanban' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {KANBAN_COLUMNS.map((col) => (
                <div key={col.key} className={`rounded-lg p-3 ${col.color} min-h-[400px]`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                    <span className="text-xs text-gray-500 bg-white rounded-full px-2 py-0.5">
                      {tasksByStatus[col.key]?.length || 0}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(tasksByStatus[col.key] || []).map((task) => {
                      const overdue = task.status !== 'DONE' && isOverdue(task.dueDate);
                      return (
                        <div
                          key={task.id}
                          className={`bg-white rounded-lg p-3 shadow-sm border transition-shadow hover:shadow-md ${
                            overdue ? 'border-red-300' : 'border-gray-200'
                          }`}
                        >
                          <p className="text-sm font-medium text-gray-900 mb-1">{task.title}</p>
                          {task.customerBusiness && (
                            <p className="text-xs text-gray-500 mb-2">
                              {task.customerBusiness.customer.name}
                            </p>
                          )}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1">
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                                {task.assignee.name.charAt(0)}
                              </div>
                              <span className="text-xs text-gray-600">{task.assignee.name}</span>
                            </div>
                            <Badge variant={PRIORITY_VARIANTS[task.priority] || 'gray'} size="sm">
                              {PRIORITY_LABELS[task.priority] || task.priority}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {formatRelativeDate(task.dueDate) || formatDate(task.dueDate)}
                            </span>
                            {/* Status move buttons */}
                            <div className="flex gap-1">
                              {col.key !== 'PENDING' && (
                                <button
                                  onClick={() => handleChangeStatus(task.id, col.key === 'DONE' ? 'ACTIVE' : col.key === 'ACTIVE' ? 'WAITING' : 'PENDING')}
                                  className="text-xs px-1.5 py-0.5 bg-gray-100 rounded hover:bg-gray-200 text-gray-600"
                                  title="前のステータスへ"
                                >
                                  ←
                                </button>
                              )}
                              {col.key !== 'DONE' && (
                                <button
                                  onClick={() => handleChangeStatus(task.id, col.key === 'PENDING' ? 'WAITING' : col.key === 'WAITING' ? 'ACTIVE' : 'DONE')}
                                  className="text-xs px-1.5 py-0.5 bg-gray-100 rounded hover:bg-gray-200 text-gray-600"
                                  title="次のステータスへ"
                                >
                                  →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ============================================================ */}
          {/* CALENDAR VIEW                                                 */}
          {/* ============================================================ */}
          {viewMode === 'calendar' && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Calendar header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <button
                  onClick={prevMonth}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  前月
                </button>
                <h3 className="text-lg font-semibold text-gray-900">
                  {calendarYear}年{calendarMonth + 1}月
                </h3>
                <button
                  onClick={nextMonth}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  翌月
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
                  <div key={d} className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {/* Empty cells for days before the 1st */}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50/50" />
                ))}
                {/* Day cells */}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dayTasks = tasksByDay[day] || [];
                  const isTodayCell = isToday(day);
                  const isSelected = selectedDay === day;
                  return (
                    <div
                      key={day}
                      className={`min-h-[80px] border-b border-r border-gray-100 p-1 cursor-pointer transition-colors ${
                        isTodayCell ? 'bg-blue-50' : isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                            isTodayCell
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700'
                          }`}
                        >
                          {day}
                        </span>
                        {dayTasks.length > 0 && (
                          <span className="text-xs text-gray-400">{dayTasks.length}</span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {dayTasks.slice(0, 3).map((t) => {
                          const overdue = t.status !== 'DONE' && isOverdue(t.dueDate);
                          return (
                            <div
                              key={t.id}
                              className={`text-xs truncate rounded px-1 py-0.5 ${
                                t.status === 'DONE'
                                  ? 'bg-green-100 text-green-700'
                                  : overdue
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {t.title}
                            </div>
                          );
                        })}
                        {dayTasks.length > 3 && (
                          <p className="text-xs text-gray-400 px-1">+{dayTasks.length - 3}件</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected day detail */}
              {selectedDay !== null && (
                <div className="border-t border-gray-200 p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    {calendarYear}年{calendarMonth + 1}月{selectedDay}日のタスク
                  </h4>
                  {(tasksByDay[selectedDay] || []).length === 0 ? (
                    <p className="text-sm text-gray-500">タスクはありません</p>
                  ) : (
                    <div className="space-y-2">
                      {(tasksByDay[selectedDay] || []).map((t) => (
                        <div key={t.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex items-center gap-2">
                            <Badge variant={PRIORITY_VARIANTS[t.priority] || 'gray'} size="sm">
                              {PRIORITY_LABELS[t.priority]}
                            </Badge>
                            <span className="text-sm font-medium text-gray-900">{t.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{t.assignee.name}</span>
                            <Badge
                              variant={t.status === 'DONE' ? 'success' : t.status === 'ACTIVE' ? 'primary' : 'default'}
                              size="sm"
                            >
                              {STATUS_LABELS[t.status] || t.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Create Task Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="新規タスク作成"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>キャンセル</Button>
            <Button onClick={handleCreate} loading={creating}>作成</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="タイトル"
            required
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
          />
          <Input
            label="説明"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="事業"
              options={[{ label: '選択してください', value: '' }, ...businesses.map((b) => ({ label: b.name, value: b.id }))]}
              value={newTask.businessId}
              onChange={(e) => setNewTask({ ...newTask, businessId: e.target.value })}
            />
            <Select
              label="担当者"
              required
              options={[{ label: '選択してください', value: '' }, ...users.map((u) => ({ label: u.name, value: u.id }))]}
              value={newTask.assigneeId}
              onChange={(e) => setNewTask({ ...newTask, assigneeId: e.target.value })}
            />
            <Input
              label="期限"
              type="date"
              required
              value={newTask.dueDate}
              onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
            />
            <Select
              label="優先度"
              options={[
                { label: '緊急', value: 'URGENT' },
                { label: '高', value: 'HIGH' },
                { label: '中', value: 'MEDIUM' },
                { label: '低', value: 'LOW' },
              ]}
              value={newTask.priority}
              onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
            />
          </div>
          <Input
            label="顧客事業ID (任意)"
            value={newTask.customerBusinessId}
            onChange={(e) => setNewTask({ ...newTask, customerBusinessId: e.target.value })}
            hint="顧客事業と紐づける場合に入力"
          />
        </div>
      </Modal>
    </div>
  );
}
