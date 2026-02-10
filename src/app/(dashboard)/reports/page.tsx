'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, getApiError } from '@/lib/utils';

interface BusinessCustomerCount {
  businessName: string;
  colorCode: string;
  count: number;
}

interface TaskCompletion {
  total: number;
  completed: number;
  rate: number;
}

interface MonthlyPaymentTrend {
  period: string;
  total: number;
}

interface UserTaskLoad {
  userName: string;
  taskCount: number;
}

interface ReportData {
  businessCustomerCounts: BusinessCustomerCount[];
  taskCompletion: TaskCompletion;
  monthlyPaymentTrends: MonthlyPaymentTrend[];
  userTaskLoads: UserTaskLoad[];
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) throw new Error(await getApiError(res, 'レポートデータの取得に失敗しました'));
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">レポート</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">レポート</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error || 'データの取得に失敗しました'}</p>
          <Button variant="secondary" className="mt-4" onClick={fetchReports}>再試行</Button>
        </div>
      </div>
    );
  }

  const maxCustomerCount = Math.max(...data.businessCustomerCounts.map((b) => b.count), 1);
  const maxPaymentTotal = Math.max(...data.monthlyPaymentTrends.map((m) => m.total), 1);
  const maxTaskLoad = Math.max(...data.userTaskLoads.map((u) => u.taskCount), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">レポート</h1>
        <p className="mt-1 text-sm text-gray-500">業務状況の概要レポート</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business customer count bar chart */}
        <Card>
          <CardHeader title="事業別顧客数" />
          <CardBody>
            {data.businessCustomerCounts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">データがありません</p>
            ) : (
              <div className="space-y-3">
                {data.businessCustomerCounts.map((item, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{item.businessName}</span>
                      <span className="text-sm font-medium text-gray-900">{item.count}</span>
                    </div>
                    <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(item.count / maxCustomerCount) * 100}%`,
                          backgroundColor: item.colorCode || '#3B82F6',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Task completion rate */}
        <Card>
          <CardHeader title="タスク完了率 (今月)" />
          <CardBody>
            <div className="flex flex-col items-center justify-center py-4">
              {/* Circular-ish gauge using CSS */}
              <div className="relative w-40 h-40 mb-4">
                <svg className="w-full h-full" viewBox="0 0 120 120">
                  {/* Background circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="#E5E7EB"
                    strokeWidth="12"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - data.taskCompletion.rate / 100)}`}
                    transform="rotate(-90 60 60)"
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">
                    {data.taskCompletion.rate}%
                  </span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">
                  完了: <span className="font-medium text-gray-900">{data.taskCompletion.completed}</span> /{' '}
                  全体: <span className="font-medium text-gray-900">{data.taskCompletion.total}</span>
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Monthly payment trends */}
        <Card>
          <CardHeader title="月別支払い推移 (過去6ヶ月)" />
          <CardBody>
            {data.monthlyPaymentTrends.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">データがありません</p>
            ) : (
              <div className="flex items-end gap-2 h-48">
                {data.monthlyPaymentTrends.map((item, i) => {
                  const heightPercent = (item.total / maxPaymentTotal) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                      <span className="text-xs text-gray-500 mb-1 whitespace-nowrap">
                        {formatCurrency(item.total)}
                      </span>
                      <div
                        className="w-full bg-blue-500 rounded-t transition-all duration-500 min-h-[4px]"
                        style={{ height: `${Math.max(heightPercent, 2)}%` }}
                      />
                      <span className="text-xs text-gray-500 mt-2 whitespace-nowrap">
                        {item.period.slice(5)}月
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* User task load */}
        <Card>
          <CardHeader title="担当者別タスク負荷" />
          <CardBody>
            {data.userTaskLoads.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">データがありません</p>
            ) : (
              <div className="space-y-3">
                {data.userTaskLoads.map((item, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{item.userName}</span>
                      <span className="text-sm font-medium text-gray-900">{item.taskCount} 件</span>
                    </div>
                    <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${(item.taskCount / maxTaskLoad) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
