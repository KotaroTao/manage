'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface OverdueItem {
  id: string;
  type: 'task' | 'workflowStep';
  title: string;
  dueDate: string;
  daysOverdue: number;
  assignee: { id: string; name: string };
  customerBusiness?: {
    id: string;
    customer: { id: string; name: string };
    business: { id: string; name: string };
  };
}

interface ApproachingItem {
  id: string;
  type: 'task' | 'workflowStep' | 'nextAction';
  title: string;
  dueDate: string;
  daysUntilDue: number;
  assignee: { id: string; name: string } | null;
  customerBusiness?: {
    id: string;
    customer: { id: string; name: string };
    business: { id: string; name: string };
  };
}

interface MissingActionItem {
  id: string;
  customerName: string;
  businessName: string;
  customerId?: string;
  status: string;
  assignee: { id: string; name: string } | null;
}

interface TodayAction {
  id: string;
  customerName: string;
  businessName: string;
  customerId: string;
  businessId: string;
  nextActionMemo: string | null;
  assignee: { id: string; name: string } | null;
}

interface WeekScheduleDay {
  date: string;
  dayLabel: string;
  count: number;
}

interface BusinessSummary {
  id: string;
  name: string;
  colorCode: string;
  customerCount: number;
  activeWorkflows: number;
  missingNextAction: number;
}

interface PaymentSummary {
  id: string;
  partnerName: string;
  amount: number;
  status: string;
  dueDate: string | null;
}

interface DashboardResponse {
  stats: {
    customerCount: number;
    activeWorkflows: number;
    monthlyPayments: number;
    overdueCount: number;
  };
  overdueTasks: OverdueItem[];
  approachingDeadlines: ApproachingItem[];
  missingNextAction: MissingActionItem[];
  todayActions: TodayAction[];
  weekSchedule: WeekScheduleDay[];
  businessSummaries: BusinessSummary[];
  paymentSummaries: PaymentSummary[];
}

/* -------------------------------------------------------------------------- */
/*  Loading skeleton                                                           */
/* -------------------------------------------------------------------------- */

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
      {/* Sections */}
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
          <div className="space-y-3">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-4 bg-gray-200 rounded w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Alert Modal                                                                */
/* -------------------------------------------------------------------------- */

function AlertModal({
  overdue,
  approaching,
  missing,
  onClose,
}: {
  overdue: OverdueItem[];
  approaching: ApproachingItem[];
  missing: MissingActionItem[];
  onClose: () => void;
}) {
  if (overdue.length === 0 && approaching.length === 0 && missing.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-bold text-gray-900">要確認事項</h2>
          <p className="text-sm text-gray-500 mt-1">以下の項目をご確認ください</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Overdue - Red */}
          {overdue.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-bold text-red-800 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full" />
                期限超過タスク ({overdue.length}件)
              </h3>
              <ul className="space-y-2">
                {overdue.map((item) => (
                  <li key={item.id} className="flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-red-900 font-medium">
                        {item.customerBusiness?.customer.name || '---'}
                      </span>
                      <span className="text-red-700 mx-1">-</span>
                      <span className="text-red-700">{item.title}</span>
                      <span className="text-red-500 ml-2 text-xs">
                        ({item.daysOverdue}日超過)
                      </span>
                    </div>
                    {item.customerBusiness && (
                      <Link
                        href={`/customers/${item.customerBusiness.customer.id}`}
                        className="shrink-0 ml-2 text-xs text-red-700 underline hover:text-red-900"
                      >
                        対応する
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Approaching - Yellow */}
          {approaching.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full" />
                期限間近 ({approaching.length}件)
              </h3>
              <ul className="space-y-2">
                {approaching.map((item) => (
                  <li key={item.id} className="flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-amber-900 font-medium">
                        {item.customerBusiness?.customer.name || '---'}
                      </span>
                      <span className="text-amber-700 mx-1">-</span>
                      <span className="text-amber-700">{item.title}</span>
                      <span className="text-amber-600 ml-2 text-xs">
                        (あと{item.daysUntilDue}日)
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing next action - Blue */}
          {missing.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                次回対応日 未設定 ({missing.length}件)
              </h3>
              <ul className="space-y-2">
                {missing.map((item) => (
                  <li key={item.id} className="flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-blue-900 font-medium">{item.customerName}</span>
                      <span className="text-blue-700 mx-1">-</span>
                      <span className="text-blue-700">{item.businessName}</span>
                    </div>
                    <Link
                      href={`/customers/${item.customerId || item.id}`}
                      className="shrink-0 ml-2 text-xs text-blue-700 underline hover:text-blue-900"
                    >
                      設定する
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            すべて確認済み - ダッシュボードへ
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stats Card                                                                 */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  color?: 'blue' | 'green' | 'amber' | 'red';
}) {
  const colorMap = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color].split(' ')[0]}`}>{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const json = await res.json();
      setData(json.data || json);
      setShowAlert(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">ダッシュボード</h1>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">ダッシュボード</h1>
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasAlerts =
    (data.overdueTasks?.length || 0) > 0 ||
    (data.approachingDeadlines?.length || 0) > 0 ||
    (data.missingNextAction?.length || 0) > 0;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Alert Modal */}
      {showAlert && hasAlerts && (
        <AlertModal
          overdue={data.overdueTasks || []}
          approaching={data.approachingDeadlines || []}
          missing={data.missingNextAction || []}
          onClose={() => setShowAlert(false)}
        />
      )}

      <h1 className="text-2xl font-bold text-gray-900 mb-6">ダッシュボード</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="顧客数" value={data.stats?.customerCount ?? 0} color="blue" />
        <StatCard label="進行中フロー" value={data.stats?.activeWorkflows ?? 0} color="green" />
        <StatCard
          label="今月支払い予定"
          value={formatCurrency(data.stats?.monthlyPayments ?? 0)}
          color="amber"
        />
        <StatCard label="期限超過タスク" value={data.stats?.overdueCount ?? 0} color="red" />
      </div>

      {/* Today's Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">本日の対応予定</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {(data.todayActions?.length || 0) === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              本日の対応予定はありません
            </div>
          ) : (
            data.todayActions.map((action) => (
              <Link
                key={action.id}
                href={`/customers/${action.customerId}/b/${action.businessId}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900">{action.customerName}</span>
                  <span className="text-gray-400 mx-2">|</span>
                  <span className="text-sm text-gray-600">{action.businessName}</span>
                  {action.nextActionMemo && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{action.nextActionMemo}</p>
                  )}
                </div>
                {action.assignee && (
                  <span className="shrink-0 text-xs text-gray-400 ml-2">{action.assignee.name}</span>
                )}
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Overdue Tasks */}
      {(data.overdueTasks?.length || 0) > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 mb-6">
          <div className="px-5 py-4 border-b border-red-100 bg-red-50 rounded-t-xl">
            <h2 className="text-base font-bold text-red-800">期限超過タスク</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {data.overdueTasks.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900">{item.title}</span>
                  {item.customerBusiness && (
                    <span className="text-xs text-gray-400 ml-2">
                      ({item.customerBusiness.customer.name})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-red-600 font-medium">
                    {item.daysOverdue}日超過
                  </span>
                  <span className="text-xs text-gray-400">{item.assignee.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* This week's schedule */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">今週のスケジュール</h2>
          </div>
          <div className="p-5">
            {(data.weekSchedule?.length || 0) === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">予定なし</p>
            ) : (
              <div className="space-y-2">
                {data.weekSchedule.map((day) => (
                  <div key={day.date} className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 w-20 shrink-0">{day.dayLabel}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((day.count / Math.max(...data.weekSchedule.map((d) => d.count), 1)) * 100, 100)}%`,
                          minWidth: day.count > 0 ? '8%' : '0%',
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-8 text-right">
                      {day.count}件
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Payment Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">今月の支払い予定</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(data.paymentSummaries?.length || 0) === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                今月の支払い予定はありません
              </div>
            ) : (
              <>
                {data.paymentSummaries.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">{p.partnerName}</span>
                      {p.dueDate && (
                        <span className="text-xs text-gray-400 ml-2">
                          期日: {formatDate(p.dueDate)}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-900 shrink-0">
                      {formatCurrency(p.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                  <span className="text-sm font-bold text-gray-700">合計</span>
                  <span className="text-sm font-bold text-gray-900">
                    {formatCurrency(
                      data.paymentSummaries.reduce((sum, p) => sum + p.amount, 0)
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Business Summary Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">事業別サマリ</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 font-medium text-gray-500">事業名</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500">顧客数</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500">進行中フロー</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500">
                  次回対応日 未設定
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data.businessSummaries?.length || 0) === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                    事業データなし
                  </td>
                </tr>
              ) : (
                data.businessSummaries.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/businesses/${b.id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: b.colorCode || '#6B7280' }}
                        />
                        <span className="font-medium text-gray-900">{b.name}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">{b.customerCount}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{b.activeWorkflows}</td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={
                          b.missingNextAction > 0
                            ? 'text-red-600 font-bold'
                            : 'text-gray-700'
                        }
                      >
                        {b.missingNextAction}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
