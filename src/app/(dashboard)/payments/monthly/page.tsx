'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

interface MonthlyPayment {
  partnerId: string;
  partnerName: string;
  partnerCompany: string | null;
  count: number;
  totalAmount: number;
  totalTax: number;
  grandTotal: number;
}

export default function MonthlyPaymentPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthlyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const period = `${year}-${String(month).padStart(2, '0')}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/monthly?period=${period}`);
      if (!res.ok) throw new Error('月次データの取得に失敗しました');
      const json = await res.json();
      setData(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  const totals = useMemo(() => {
    return data.reduce(
      (acc, row) => ({
        count: acc.count + row.count,
        totalAmount: acc.totalAmount + row.totalAmount,
        totalTax: acc.totalTax + row.totalTax,
        grandTotal: acc.grandTotal + row.grandTotal,
      }),
      { count: 0, totalAmount: 0, totalTax: 0, grandTotal: 0 }
    );
  }, [data]);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">月次支払いサマリー</h1>
          <p className="mt-1 text-sm text-gray-500">パートナー別月次支払い集計</p>
        </div>
        <Button variant="secondary" onClick={() => window.print()}>
          印刷
        </Button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={prevMonth}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 print:hidden"
        >
          前月
        </button>
        <h2 className="text-xl font-bold text-gray-900">
          {year}年{month}月
        </h2>
        <button
          onClick={nextMonth}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 print:hidden"
        >
          翌月
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between print:hidden">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchData}>再試行</Button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-3 print:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden print:border-black print:rounded-none">
          <table className="min-w-full divide-y divide-gray-200 print:divide-black">
            <thead className="bg-gray-50 print:bg-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase print:text-black print:font-bold">
                  パートナー名
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase print:text-black print:font-bold">
                  件数
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase print:text-black print:font-bold">
                  合計金額
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase print:text-black print:font-bold">
                  税合計
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase print:text-black print:font-bold">
                  総合計
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 print:divide-gray-400">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-sm text-gray-500">
                    該当月のデータはありません
                  </td>
                </tr>
              ) : (
                <>
                  {data.map((row) => (
                    <tr key={row.partnerId} className="hover:bg-gray-50 print:hover:bg-transparent">
                      <td className="px-6 py-3 text-sm text-gray-900">
                        <div>
                          <span className="font-medium">{row.partnerName}</span>
                          {row.partnerCompany && (
                            <span className="text-gray-500 ml-2 text-xs">({row.partnerCompany})</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-700 text-right">{row.count}</td>
                      <td className="px-6 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.totalAmount)}</td>
                      <td className="px-6 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.totalTax)}</td>
                      <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(row.grandTotal)}</td>
                    </tr>
                  ))}
                  {/* Grand total row */}
                  <tr className="bg-gray-100 font-semibold print:bg-gray-300">
                    <td className="px-6 py-3 text-sm text-gray-900">合計</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-right">{totals.count}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalAmount)}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalTax)}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-right font-bold">{formatCurrency(totals.grandTotal)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Print footer */}
      <div className="hidden print:block text-center text-xs text-gray-500 mt-8">
        出力日: {new Date().toLocaleDateString('ja-JP')}
      </div>
    </div>
  );
}
