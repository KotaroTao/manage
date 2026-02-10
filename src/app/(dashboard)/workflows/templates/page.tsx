'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getApiError } from '@/lib/utils';

interface WorkflowTemplate {
  id: string;
  name: string;
  businessId: string;
  business: { id: string; name: string; colorCode: string };
  isActive: boolean;
  steps: { id: string }[];
  createdAt: string;
  updatedAt: string;
}

interface BusinessOption {
  id: string;
  name: string;
}

export default function WorkflowTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [filterBusiness, setFilterBusiness] = useState('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterBusiness) params.set('businessId', filterBusiness);
      const res = await fetch(`/api/workflows/templates?${params.toString()}`);
      if (!res.ok) throw new Error(await getApiError(res, 'テンプレートの取得に失敗しました'));
      const json = await res.json();
      setTemplates(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [filterBusiness]);

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
    fetchTemplates();
  }, [fetchTemplates]);

  const renderSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-40 bg-gray-200 rounded-lg animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ワークフローテンプレート</h1>
          <p className="mt-1 text-sm text-gray-500">業務プロセスのテンプレートを管理</p>
        </div>
        <Button onClick={() => router.push('/workflows/templates/new')}>
          + 新規テンプレート
        </Button>
      </div>

      {/* Filter */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <Select
          label="事業で絞り込み"
          options={[{ label: 'すべての事業', value: '' }, ...businesses.map((b) => ({ label: b.name, value: b.id }))]}
          value={filterBusiness}
          onChange={(e) => setFilterBusiness(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchTemplates}>再試行</Button>
        </div>
      )}

      {/* Templates grid */}
      {loading ? renderSkeleton() : (
        <>
          {templates.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500">テンプレートがありません</p>
              <Button className="mt-4" onClick={() => router.push('/workflows/templates/new')}>
                最初のテンプレートを作成
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tpl) => (
                <Card
                  key={tpl.id}
                  hover
                  className="cursor-pointer"
                >
                  <div onClick={() => router.push(`/workflows/templates/${tpl.id}`)}>
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-base font-semibold text-gray-900">{tpl.name}</h3>
                      {tpl.isActive ? (
                        <Badge variant="success" size="sm" dot>有効</Badge>
                      ) : (
                        <Badge variant="gray" size="sm" dot>無効</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tpl.business.colorCode }}
                      />
                      <span className="text-sm text-gray-600">{tpl.business.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>{tpl.steps.length} ステップ</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
