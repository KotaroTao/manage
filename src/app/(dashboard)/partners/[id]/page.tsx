'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatCurrency, formatDate, getApiError } from '@/lib/utils';
import type { PartnerFormData } from '@/types';

interface PartnerDetail {
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
  updatedAt: string;
  partnerBusinesses: PartnerBusiness[];
}

interface PartnerBusiness {
  id: string;
  business: { id: string; name: string; colorCode: string };
  role: string | null;
  rate: number | null;
  startDate: string | null;
  endDate: string | null;
}

interface Payment {
  id: string;
  amount: number;
  tax: number;
  totalAmount: number;
  type: string;
  status: string;
  period: string | null;
  paidAt: string | null;
  dueDate: string | null;
  note: string | null;
  createdAt: string;
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  CONTRACT: '業務委託',
  DISPATCH: '派遣',
  OTHER: 'その他',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: '下書き',
  PENDING: '申請中',
  APPROVED: '承認済',
  PAID: '支払済',
};

const PAYMENT_STATUS_VARIANTS: Record<string, 'gray' | 'warning' | 'info' | 'success'> = {
  DRAFT: 'gray',
  PENDING: 'warning',
  APPROVED: 'info',
  PAID: 'success',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  MONTHLY: '月額',
  ONE_TIME: '一括',
  MILESTONE: 'マイルストーン',
  OTHER: 'その他',
};

export default function PartnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const partnerId = params.id as string;

  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bank info reveal
  const [showBankInfo, setShowBankInfo] = useState(false);

  // Payment filters
  const [paymentPeriodFilter, setPaymentPeriodFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<PartnerFormData>({
    name: '',
    contractType: 'CONTRACT',
  });

  const fetchPartner = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/partners/${partnerId}`);
      if (!res.ok) throw new Error(await getApiError(res, 'パートナー情報の取得に失敗しました'));
      const json = await res.json();
      setPartner(json.data);
      setEditForm({
        name: json.data.name,
        email: json.data.email || '',
        phone: json.data.phone || '',
        company: json.data.company || '',
        specialty: json.data.specialty || '',
        bankName: json.data.bankName || '',
        bankBranch: json.data.bankBranch || '',
        bankAccountType: json.data.bankAccountType || '普通',
        bankAccountNumber: json.data.bankAccountNumber || '',
        bankAccountHolder: json.data.bankAccountHolder || '',
        contractType: json.data.contractType,
        rate: json.data.rate ?? undefined,
        note: json.data.note || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  const fetchPayments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('partnerId', partnerId);
      if (paymentPeriodFilter) params.set('period', paymentPeriodFilter);
      if (paymentStatusFilter) params.set('status', paymentStatusFilter);
      const res = await fetch(`/api/payments?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setPayments(json.data || []);
    } catch {
      // silently fail for payments
    }
  }, [partnerId, paymentPeriodFilter, paymentStatusFilter]);

  useEffect(() => {
    fetchPartner();
  }, [fetchPartner]);

  useEffect(() => {
    if (partnerId) fetchPayments();
  }, [fetchPayments, partnerId]);

  const handleSave = async () => {
    if (!editForm.name) {
      showToast('パートナー名は必須です', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error(await getApiError(res, '更新に失敗しました'));
      showToast('パートナー情報を更新しました', 'success');
      setShowEditModal(false);
      fetchPartner();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const maskString = (str: string | null) => {
    if (!str) return '-';
    if (str.length <= 2) return '**';
    return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
  };

  // Payment summary
  const currentYear = new Date().getFullYear();
  const paidThisYear = payments
    .filter((p) => p.status === 'PAID' && p.paidAt && new Date(p.paidAt).getFullYear() === currentYear)
    .reduce((sum, p) => sum + p.totalAmount, 0);
  const totalPending = payments
    .filter((p) => p.status === 'PENDING' || p.status === 'APPROVED')
    .reduce((sum, p) => sum + p.totalAmount, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-48 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-48 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="h-64 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700">{error || 'パートナーが見つかりません'}</p>
        <Button variant="secondary" className="mt-4" onClick={fetchPartner}>
          再試行
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => router.push('/partners')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              パートナー一覧
            </button>
            <span className="text-gray-400">/</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{partner.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            {partner.company && (
              <span className="text-sm text-gray-600">{partner.company}</span>
            )}
            {partner.specialty && (
              <Badge variant="info">{partner.specialty}</Badge>
            )}
            {partner.status === 'ACTIVE' ? (
              <Badge variant="success" dot>有効</Badge>
            ) : (
              <Badge variant="gray" dot>無効</Badge>
            )}
          </div>
        </div>
        <Button onClick={() => setShowEditModal(true)}>編集</Button>
      </div>

      {/* Info & Bank cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact / Contract Info */}
        <Card>
          <CardHeader title="基本情報" />
          <CardBody>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">メール</dt>
                <dd className="text-sm text-gray-900">{partner.email || '-'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">電話番号</dt>
                <dd className="text-sm text-gray-900">{partner.phone || '-'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">契約形態</dt>
                <dd className="text-sm text-gray-900">
                  {CONTRACT_TYPE_LABELS[partner.contractType] || partner.contractType}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">単価/月額</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {partner.rate != null ? formatCurrency(partner.rate) : '-'}
                </dd>
              </div>
              {partner.note && (
                <div className="pt-2 border-t border-gray-100">
                  <dt className="text-sm text-gray-500 mb-1">備考</dt>
                  <dd className="text-sm text-gray-700 whitespace-pre-wrap">{partner.note}</dd>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>

        {/* Bank Info */}
        <Card>
          <CardHeader
            title="銀行口座情報"
            action={
              <button
                onClick={() => setShowBankInfo(!showBankInfo)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showBankInfo ? '非表示' : '表示する'}
              </button>
            }
          />
          <CardBody>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">銀行名</dt>
                <dd className="text-sm text-gray-900">
                  {showBankInfo ? (partner.bankName || '-') : maskString(partner.bankName)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">支店名</dt>
                <dd className="text-sm text-gray-900">
                  {showBankInfo ? (partner.bankBranch || '-') : maskString(partner.bankBranch)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">口座種別</dt>
                <dd className="text-sm text-gray-900">
                  {showBankInfo ? (partner.bankAccountType || '-') : '***'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">口座番号</dt>
                <dd className="text-sm text-gray-900">
                  {showBankInfo ? (partner.bankAccountNumber || '-') : maskString(partner.bankAccountNumber)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">口座名義</dt>
                <dd className="text-sm text-gray-900">
                  {showBankInfo ? (partner.bankAccountHolder || '-') : maskString(partner.bankAccountHolder)}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      {/* Assigned Businesses */}
      <Card>
        <CardHeader title="担当事業" />
        <CardBody>
          {partner.partnerBusinesses && partner.partnerBusinesses.length > 0 ? (
            <div className="space-y-2">
              {partner.partnerBusinesses.map((pb) => (
                <div
                  key={pb.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: pb.business.colorCode }}
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {pb.business.name}
                    </span>
                    {pb.role && (
                      <Badge variant="default" size="sm">{pb.role}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    {pb.rate != null && <span>{formatCurrency(pb.rate)}</span>}
                    {pb.startDate && <span>{formatDate(pb.startDate)} 〜</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4 text-center">担当事業はありません</p>
          )}
        </CardBody>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader title="支払い履歴" />
        <CardBody>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-xs text-green-600 font-medium">今年の支払い合計</p>
              <p className="text-lg font-bold text-green-700 mt-1">{formatCurrency(paidThisYear)}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <p className="text-xs text-amber-600 font-medium">未払い合計</p>
              <p className="text-lg font-bold text-amber-700 mt-1">{formatCurrency(totalPending)}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="期間 (例: 2026-01)"
              value={paymentPeriodFilter}
              onChange={(e) => setPaymentPeriodFilter(e.target.value)}
              inputSize="sm"
              className="w-48"
            />
            <Select
              options={[
                { label: 'すべて', value: '' },
                { label: '下書き', value: 'DRAFT' },
                { label: '申請中', value: 'PENDING' },
                { label: '承認済', value: 'APPROVED' },
                { label: '支払済', value: 'PAID' },
              ]}
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              selectSize="sm"
              className="w-36"
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">期間</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">金額</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">税</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">合計</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">種別</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">ステータス</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">支払日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                      支払い履歴はありません
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-700">{payment.period || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 text-right">{formatCurrency(payment.amount)}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 text-right">{formatCurrency(payment.tax)}</td>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">{formatCurrency(payment.totalAmount)}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 text-center">
                        {PAYMENT_TYPE_LABELS[payment.type] || payment.type}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Badge variant={PAYMENT_STATUS_VARIANTS[payment.status] || 'gray'} size="sm">
                          {PAYMENT_STATUS_LABELS[payment.status] || payment.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {payment.paidAt ? formatDate(payment.paidAt) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="パートナー情報を編集"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} loading={saving}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="パートナー名"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
            <Input
              label="会社名"
              value={editForm.company}
              onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
            />
            <Input
              label="メールアドレス"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            <Input
              label="電話番号"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
            <Input
              label="専門分野"
              value={editForm.specialty}
              onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })}
            />
            <Select
              label="契約形態"
              required
              options={[
                { label: '業務委託', value: 'CONTRACT' },
                { label: '派遣', value: 'DISPATCH' },
                { label: 'その他', value: 'OTHER' },
              ]}
              value={editForm.contractType}
              onChange={(e) => setEditForm({ ...editForm, contractType: e.target.value })}
            />
            <Input
              label="単価/月額"
              type="number"
              value={editForm.rate ?? ''}
              onChange={(e) => setEditForm({ ...editForm, rate: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>

          <hr className="border-gray-200" />
          <h3 className="text-sm font-semibold text-gray-700">銀行口座情報</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="銀行名"
              value={editForm.bankName}
              onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
            />
            <Input
              label="支店名"
              value={editForm.bankBranch}
              onChange={(e) => setEditForm({ ...editForm, bankBranch: e.target.value })}
            />
            <Select
              label="口座種別"
              options={[
                { label: '普通', value: '普通' },
                { label: '当座', value: '当座' },
              ]}
              value={editForm.bankAccountType ?? '普通'}
              onChange={(e) => setEditForm({ ...editForm, bankAccountType: e.target.value })}
            />
            <Input
              label="口座番号"
              value={editForm.bankAccountNumber}
              onChange={(e) => setEditForm({ ...editForm, bankAccountNumber: e.target.value })}
            />
            <Input
              label="口座名義"
              value={editForm.bankAccountHolder}
              onChange={(e) => setEditForm({ ...editForm, bankAccountHolder: e.target.value })}
            />
          </div>

          <hr className="border-gray-200" />
          <Input
            label="備考"
            value={editForm.note}
            onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
}
