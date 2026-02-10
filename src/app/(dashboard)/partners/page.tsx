'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatCurrency, getApiError } from '@/lib/utils';
import type { PaginatedResponse, PartnerFormData } from '@/types';

interface Partner {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  contractType: string;
  rate: number | null;
  status: string;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountType: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  note: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = [
  { label: 'すべて', value: '' },
  { label: '有効', value: 'ACTIVE' },
  { label: '無効', value: 'INACTIVE' },
];

const CONTRACT_TYPE_OPTIONS = [
  { label: 'すべて', value: '' },
  { label: '業務委託', value: 'CONTRACT' },
  { label: '派遣', value: 'DISPATCH' },
  { label: 'その他', value: 'OTHER' },
];

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  CONTRACT: '業務委託',
  DISPATCH: '派遣',
  OTHER: 'その他',
};

export default function PartnersPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // Data state
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Filters
  const [searchName, setSearchName] = useState('');
  const [searchCompany, setSearchCompany] = useState('');
  const [searchSpecialty, setSearchSpecialty] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterContractType, setFilterContractType] = useState('');

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PartnerFormData>({
    name: '',
    email: '',
    phone: '',
    company: '',
    specialty: '',
    bankName: '',
    bankBranch: '',
    bankAccountType: '普通',
    bankAccountNumber: '',
    bankAccountHolder: '',
    contractType: 'CONTRACT',
    rate: undefined,
    note: '',
  });

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (searchName) params.set('name', searchName);
      if (searchCompany) params.set('company', searchCompany);
      if (searchSpecialty) params.set('specialty', searchSpecialty);
      if (filterStatus) params.set('status', filterStatus);
      if (filterContractType) params.set('contractType', filterContractType);

      const res = await fetch(`/api/partners?${params.toString()}`);
      if (!res.ok) throw new Error(await getApiError(res, 'データの取得に失敗しました'));
      const json: PaginatedResponse<Partner> = await res.json();
      setPartners(json.data);
      setTotalPages(json.pagination.totalPages);
      setTotalCount(json.pagination.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [page, searchName, searchCompany, searchSpecialty, filterStatus, filterContractType]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const handleSearch = () => {
    setPage(1);
  };

  const handleCreate = async () => {
    if (!form.name) {
      showToast('パートナー名は必須です', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await getApiError(res, '作成に失敗しました'));
      showToast('パートナーを作成しました', 'success');
      setShowCreateModal(false);
      setForm({
        name: '',
        email: '',
        phone: '',
        company: '',
        specialty: '',
        bankName: '',
        bankBranch: '',
        bankAccountType: '普通',
        bankAccountNumber: '',
        bankAccountHolder: '',
        contractType: 'CONTRACT',
        rate: undefined,
        note: '',
      });
      fetchPartners();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '作成に失敗しました', 'error');
    } finally {
      setCreating(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'ACTIVE') return <Badge variant="success" dot>有効</Badge>;
    return <Badge variant="gray" dot>無効</Badge>;
  };

  // Skeleton loader
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
          <h1 className="text-2xl font-bold text-gray-900">パートナー一覧</h1>
          <p className="mt-1 text-sm text-gray-500">
            登録パートナーの管理・検索
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          + 新規パートナー
        </Button>
      </div>

      {/* Search & Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Input
            placeholder="パートナー名"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Input
            placeholder="会社名"
            value={searchCompany}
            onChange={(e) => setSearchCompany(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Input
            placeholder="専門分野"
            value={searchSpecialty}
            onChange={(e) => setSearchSpecialty(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Select
            options={STATUS_OPTIONS}
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          />
          <Select
            options={CONTRACT_TYPE_OPTIONS}
            value={filterContractType}
            onChange={(e) => { setFilterContractType(e.target.value); setPage(1); }}
          />
          <Button variant="secondary" onClick={handleSearch}>
            検索
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchPartners}>
            再試行
          </Button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        renderSkeleton()
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">パートナー名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">会社名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">専門分野</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">契約形態</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">単価/月額</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {partners.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-500">
                      パートナーが見つかりません
                    </td>
                  </tr>
                ) : (
                  partners.map((partner) => (
                    <tr
                      key={partner.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/partners/${partner.id}`)}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {partner.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {partner.company || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 hidden md:table-cell">
                        {partner.specialty || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 hidden md:table-cell">
                        {CONTRACT_TYPE_LABELS[partner.contractType] || partner.contractType}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right hidden lg:table-cell">
                        {partner.rate != null ? formatCurrency(partner.rate) : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {statusBadge(partner.status)}
                      </td>
                    </tr>
                  ))
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
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                        pageNum === page
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
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

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="新規パートナー登録"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              キャンセル
            </Button>
            <Button onClick={handleCreate} loading={creating}>
              登録
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="パートナー名"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="会社名"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
            <Input
              label="メールアドレス"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="電話番号"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              label="専門分野"
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
            />
            <Select
              label="契約形態"
              required
              options={[
                { label: '業務委託', value: 'CONTRACT' },
                { label: '派遣', value: 'DISPATCH' },
                { label: 'その他', value: 'OTHER' },
              ]}
              value={form.contractType}
              onChange={(e) => setForm({ ...form, contractType: e.target.value })}
            />
            <Input
              label="単価/月額"
              type="number"
              value={form.rate ?? ''}
              onChange={(e) => setForm({ ...form, rate: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>

          <hr className="border-gray-200" />
          <h3 className="text-sm font-semibold text-gray-700">銀行口座情報</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="銀行名"
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
            <Input
              label="支店名"
              value={form.bankBranch}
              onChange={(e) => setForm({ ...form, bankBranch: e.target.value })}
            />
            <Select
              label="口座種別"
              options={[
                { label: '普通', value: '普通' },
                { label: '当座', value: '当座' },
              ]}
              value={form.bankAccountType ?? '普通'}
              onChange={(e) => setForm({ ...form, bankAccountType: e.target.value })}
            />
            <Input
              label="口座番号"
              value={form.bankAccountNumber}
              onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
            />
            <Input
              label="口座名義"
              value={form.bankAccountHolder}
              onChange={(e) => setForm({ ...form, bankAccountHolder: e.target.value })}
            />
          </div>

          <hr className="border-gray-200" />
          <Input
            label="備考"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
}
