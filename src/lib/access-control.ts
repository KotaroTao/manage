import prisma from "@/lib/prisma";
import type { SessionUser } from "@/types";
import { ROLE_HIERARCHY } from "@/lib/security";

/**
 * コンテンツ種別の定義
 * PartnerBusiness.permissions に格納される値
 */
export const CONTENT_TYPES = {
  customers: "顧客管理",
  tasks: "タスク管理",
  workflows: "業務フロー",
  payments: "支払い管理",
  reports: "レポート",
} as const;

export type ContentType = keyof typeof CONTENT_TYPES;

export const ALL_CONTENT_TYPES = Object.keys(CONTENT_TYPES) as ContentType[];

/**
 * パートナーのアクセス情報
 */
export interface PartnerAccessInfo {
  partnerId: string;
  businessIds: string[];
  /** contentType → business IDs that have that permission */
  contentPermissions: Record<ContentType, string[]>;
  /** business IDs where canEdit is true */
  editableBusinessIds: string[];
}

/**
 * パートナーユーザーのアクセス情報を取得
 * PARTNER ロール以外は null を返す (全アクセス可能)
 */
export async function getPartnerAccess(
  user: SessionUser,
): Promise<PartnerAccessInfo | null> {
  if (
    ROLE_HIERARCHY[user.role] !== undefined &&
    ROLE_HIERARCHY[user.role] > ROLE_HIERARCHY.PARTNER
  ) {
    return null; // MEMBER以上は全アクセス可
  }

  const partner = await prisma.partner.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: {
      id: true,
      partnerBusinesses: {
        where: { isActive: true },
        select: {
          businessId: true,
          permissions: true,
          canEdit: true,
        },
      },
    },
  });

  if (!partner) {
    return {
      partnerId: "",
      businessIds: [],
      contentPermissions: {
        customers: [],
        tasks: [],
        workflows: [],
        payments: [],
        reports: [],
      },
      editableBusinessIds: [],
    };
  }

  const businessIds = partner.partnerBusinesses.map((pb) => pb.businessId);
  const editableBusinessIds = partner.partnerBusinesses
    .filter((pb) => pb.canEdit)
    .map((pb) => pb.businessId);

  const contentPermissions: Record<ContentType, string[]> = {
    customers: [],
    tasks: [],
    workflows: [],
    payments: [],
    reports: [],
  };

  for (const pb of partner.partnerBusinesses) {
    for (const perm of pb.permissions) {
      if (perm in contentPermissions) {
        contentPermissions[perm as ContentType].push(pb.businessId);
      }
    }
  }

  return {
    partnerId: partner.id,
    businessIds,
    contentPermissions,
    editableBusinessIds,
  };
}

/**
 * ユーザーが特定のコンテンツ種別にアクセス可能か判定
 * PARTNER以外は常にtrue
 */
export async function canAccessContent(
  user: SessionUser,
  contentType: ContentType,
): Promise<boolean> {
  const access = await getPartnerAccess(user);
  if (!access) return true; // 非パートナーは全アクセス可
  return access.contentPermissions[contentType].length > 0;
}

/**
 * ビジネスIDフィルタを返す (Prisma where句用)
 * PARTNER: アクセス可能な事業IDのみ
 * それ以外: undefined (フィルタなし)
 */
export async function getBusinessIdFilter(
  user: SessionUser,
  contentType?: ContentType,
): Promise<string[] | undefined> {
  const access = await getPartnerAccess(user);
  if (!access) return undefined; // フィルタ不要

  if (contentType) {
    return access.contentPermissions[contentType];
  }
  return access.businessIds;
}

/**
 * パートナーが特定の事業で編集権限を持つか判定
 */
export async function canEditInBusiness(
  user: SessionUser,
  businessId: string,
): Promise<boolean> {
  const access = await getPartnerAccess(user);
  if (!access) return true; // 非パートナーは全編集可
  return access.editableBusinessIds.includes(businessId);
}
