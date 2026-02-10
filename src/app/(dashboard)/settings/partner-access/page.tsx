'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/contexts/auth-context';
import { getApiError } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

const CONTENT_TYPES = {
  customers: '顧客管理',
  tasks: 'タスク管理',
  workflows: '業務フロー',
  payments: '支払い管理',
  reports: 'レポート',
} as const;

type ContentType = keyof typeof CONTENT_TYPES;
const ALL_CONTENT_TYPES = Object.keys(CONTENT_TYPES) as ContentType[];

interface BusinessAccess {
  id: string;
  businessId: string;
  isActive: boolean;
  permissions: string[];
  canEdit: boolean;
  business: {
    id: string;
    name: string;
    code: string;
    colorCode: string;
  };
}

interface PartnerWithAccess {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  userId: string | null;
  status: string;
  partnerBusinesses: BusinessAccess[];
}

interface BusinessOption {
  id: string;
  name: string;
  code: string;
  colorCode: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function PartnerAccessPage() {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [partners, setPartners] = useState<PartnerWithAccess[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit modal
  const [editingPartner, setEditingPartner] = useState<PartnerWithAccess | null>(null);
  const [editAccesses, setEditAccesses] = useState<{
    businessId: string;
    permissions: string[];
    canEdit: boolean;
    isActive: boolean;
  }[]>([]);
  const [saving, setSaving] = useState(false);

  // Add business modal
  const [showAddBiz, setShowAddBiz] = useState(false);
  const [selectedBizId, setSelectedBizId] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [partnersRes, bizRes] = await Promise.all([
        fetch('/api/settings/partner-access'),
        fetch('/api/businesses'),
      ]);
      if (partnersRes.ok) {
        const json = await partnersRes.json();
        setPartners(json.data || []);
      }
      if (bizRes.ok) {
        const json = await bizRes.json();
        setBusinesses((json.data || []).map((b: BusinessOption & { stats?: unknown }) => ({
          id: b.id,
          name: b.name,
          code: b.code,
          colorCode: b.colorCode,
        })));
      }
    } catch {
      showToast('データの取得に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 権限チェック
  if (user && user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    return (
      <div className="p-8 text-center text-gray-500">
        この機能にアクセスする権限がありません
      </div>
    );
  }

  const openEditModal = (partner: PartnerWithAccess) => {
    setEditingPartner(partner);
    setEditAccesses(
      partner.partnerBusinesses.map((pb) => ({
        businessId: pb.businessId,
        permissions: [...pb.permissions],
        canEdit: pb.canEdit,
        isActive: pb.isActive,
      })),
    );
  };

  const togglePermission = (bizIdx: number, perm: ContentType) => {
    setEditAccesses((prev) => {
      const next = [...prev];
      const current = next[bizIdx];
      if (current.permissions.includes(perm)) {
        current.permissions = current.permissions.filter((p) => p !== perm);
      } else {
        current.permissions = [...current.permissions, perm];
      }
      return next;
    });
  };

  const toggleAllPermissions = (bizIdx: number) => {
    setEditAccesses((prev) => {
      const next = [...prev];
      const current = next[bizIdx];
      if (current.permissions.length === ALL_CONTENT_TYPES.length) {
        current.permissions = [];
      } else {
        current.permissions = [...ALL_CONTENT_TYPES];
      }
      return next;
    });
  };

  const toggleCanEdit = (bizIdx: number) => {
    setEditAccesses((prev) => {
      const next = [...prev];
      next[bizIdx] = { ...next[bizIdx], canEdit: !next[bizIdx].canEdit };
      return next;
    });
  };

  const removeBusiness = (bizIdx: number) => {
    setEditAccesses((prev) => prev.filter((_, i) => i !== bizIdx));
  };

  const addBusiness = () => {
    if (!selectedBizId) return;
    if (editAccesses.some((a) => a.businessId === selectedBizId)) {
      showToast('この事業は既に追加されています', 'error');
      return;
    }
    setEditAccesses((prev) => [
      ...prev,
      {
        businessId: selectedBizId,
        permissions: [...ALL_CONTENT_TYPES],
        canEdit: false,
        isActive: true,
      },
    ]);
    setSelectedBizId('');
    setShowAddBiz(false);
  };

  const handleSave = async () => {
    if (!editingPartner) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/partner-access/${editingPartner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accesses: editAccesses }),
      });
      if (!res.ok) throw new Error(await getApiError(res, '保存に失敗しました'));
      showToast('アクセス設定を保存しました', 'success');
      setEditingPartner(null);
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getBizName = (bizId: string): string => {
    return businesses.find((b) => b.id === bizId)?.name || bizId;
  };

  const getBizColor = (bizId: string): string => {
    return businesses.find((b) => b.id === bizId)?.colorCode || '#6B7280';
  };

  const availableBusinesses = businesses.filter(
    (b) => !editAccesses.some((a) => a.businessId === b.id),
  );

  /* --- Skeleton --- */
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">パートナーアクセス設定</h1>
          <p className="mt-1 text-sm text-gray-500">パートナーの事業・コンテンツアクセス権限を管理</p>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/settings" className="text-sm text-blue-600 hover:text-blue-800">
              設定
            </Link>
            <span className="text-sm text-gray-400">/</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">パートナーアクセス設定</h1>
          <p className="mt-1 text-sm text-gray-500">
            パートナーごとにアクセス可能な事業とコンテンツを設定します
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">アクセス制御の仕組み</p>
            <ul className="list-disc ml-4 space-y-0.5 text-blue-700">
              <li>管理者・マネージャー・メンバーはすべての事業・コンテンツにアクセス可能</li>
              <li>パートナーは下記で設定された事業・コンテンツにのみアクセス可能</li>
              <li>ユーザーアカウント(userId)が紐付いているパートナーのみ表示されます</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Partner list */}
      {partners.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <p className="text-gray-500 mb-2">ログイン可能なパートナーがいません</p>
          <p className="text-sm text-gray-400">
            パートナー管理からパートナーにユーザーアカウントを紐付けてください
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {partners.map((partner) => {
            const activeAccesses = partner.partnerBusinesses.filter((pb) => pb.isActive);
            return (
              <div
                key={partner.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600">
                        {partner.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{partner.name}</h3>
                        <p className="text-sm text-gray-500">
                          {partner.company && <span>{partner.company} / </span>}
                          {partner.email || 'メールなし'}
                        </p>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => openEditModal(partner)}>
                      権限を編集
                    </Button>
                  </div>

                  {/* Current access summary */}
                  <div className="mt-4">
                    {activeAccesses.length === 0 ? (
                      <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        アクセス可能な事業が設定されていません
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {activeAccesses.map((pb) => (
                          <div
                            key={pb.id}
                            className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2"
                          >
                            <div
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: pb.business.colorCode }}
                            />
                            <span className="text-sm font-medium text-gray-700 min-w-[120px]">
                              {pb.business.name}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {pb.permissions.map((perm) => (
                                <Badge key={perm} variant="default" size="sm">
                                  {CONTENT_TYPES[perm as ContentType] || perm}
                                </Badge>
                              ))}
                              {pb.canEdit && (
                                <Badge variant="warning" size="sm">編集可</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        open={!!editingPartner}
        onClose={() => setEditingPartner(null)}
        title={`${editingPartner?.name || ''} のアクセス設定`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingPartner(null)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} loading={saving}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Business access list */}
          {editAccesses.length === 0 ? (
            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
              事業が割り当てられていません。下の「事業を追加」ボタンから追加してください。
            </p>
          ) : (
            editAccesses.map((access, idx) => (
              <div
                key={access.businessId}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getBizColor(access.businessId) }}
                    />
                    <span className="font-semibold text-gray-900">
                      {getBizName(access.businessId)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBusiness(idx)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    削除
                  </button>
                </div>

                {/* Content permissions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      コンテンツアクセス
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleAllPermissions(idx)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {access.permissions.length === ALL_CONTENT_TYPES.length
                        ? 'すべて解除'
                        : 'すべて選択'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_CONTENT_TYPES.map((ct) => {
                      const active = access.permissions.includes(ct);
                      return (
                        <button
                          key={ct}
                          type="button"
                          onClick={() => togglePermission(idx, ct)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                            active
                              ? 'bg-blue-100 text-blue-700 border-blue-300'
                              : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {CONTENT_TYPES[ct]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Edit toggle */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={access.canEdit}
                      onChange={() => toggleCanEdit(idx)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      編集・作成権限を付与
                    </span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6 mt-0.5">
                    有効にするとこの事業内でデータの作成・編集が可能になります
                  </p>
                </div>
              </div>
            ))
          )}

          {/* Add business */}
          {showAddBiz ? (
            <div className="border border-dashed border-blue-300 rounded-lg p-4 bg-blue-50/50">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Select
                    label="追加する事業"
                    options={[
                      { label: '事業を選択...', value: '' },
                      ...availableBusinesses.map((b) => ({
                        label: `${b.name} (${b.code})`,
                        value: b.id,
                      })),
                    ]}
                    value={selectedBizId}
                    onChange={(e) => setSelectedBizId(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 pb-0.5">
                  <Button size="sm" onClick={addBusiness} disabled={!selectedBizId}>
                    追加
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAddBiz(false);
                      setSelectedBizId('');
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddBiz(true)}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + 事業を追加
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
