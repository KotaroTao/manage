import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const partner = await prisma.partner.findFirst({
      where: { id, deletedAt: null },
      include: {
        partnerBusinesses: {
          include: {
            business: { select: { id: true, name: true, code: true } },
          },
        },
        payments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    // PARTNER ロールは自分のパートナー情報のみアクセス可
    if (user.role === "PARTNER" && partner.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Exclude bank fields unless user is ADMIN or MANAGER
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      const { bankName, bankBranch, bankAccountType, bankAccountNumber, bankAccountHolder, ...safePartner } = partner;
      return NextResponse.json({ data: safePartner });
    }

    return NextResponse.json({ data: partner });
  } catch (error) {
    logger.error("Partner GET error", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const existing = await prisma.partner.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    // PARTNER ロールはパートナー編集不可（管理者・マネージャーのみ）
    if (user.role === "PARTNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      email,
      phone,
      company,
      specialty,
      facebook,
      instagram,
      chatwork,
      line,
      slack,
      x,
      preferredContactMethods,
      bankName,
      bankBranch,
      bankAccountType,
      bankAccountNumber,
      bankAccountHolder,
      contractType,
      rate,
      status,
      note,
      businessAssignments,
    } = body;

    const updated = await prisma.partner.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(email !== undefined && { email: email || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(company !== undefined && { company: company || null }),
        ...(specialty !== undefined && { specialty: specialty || null }),
        ...(facebook !== undefined && { facebook: facebook || null }),
        ...(instagram !== undefined && { instagram: instagram || null }),
        ...(chatwork !== undefined && { chatwork: chatwork || null }),
        ...(line !== undefined && { line: line || null }),
        ...(slack !== undefined && { slack: slack || null }),
        ...(x !== undefined && { x: x || null }),
        ...(preferredContactMethods !== undefined && { preferredContactMethods: Array.isArray(preferredContactMethods) ? preferredContactMethods : [] }),
        ...(bankName !== undefined && { bankName: bankName || null }),
        ...(bankBranch !== undefined && { bankBranch: bankBranch || null }),
        ...(bankAccountType !== undefined && { bankAccountType: bankAccountType || null }),
        ...(bankAccountNumber !== undefined && { bankAccountNumber: bankAccountNumber || null }),
        ...(bankAccountHolder !== undefined && { bankAccountHolder: bankAccountHolder || null }),
        ...(contractType !== undefined && { contractType }),
        ...(rate !== undefined && { rate }),
        ...(status !== undefined && { status }),
        ...(note !== undefined && { note: note || null }),
      },
    });

    // 担当事業の更新 (businessAssignments が渡された場合)
    if (Array.isArray(businessAssignments)) {
      // 現在の PartnerBusiness を取得
      const currentPBs = await prisma.partnerBusiness.findMany({
        where: { partnerId: id },
      });

      const incomingBizIds = new Set(
        businessAssignments.map((a: { businessId: string }) => a.businessId),
      );
      const currentBizIds = new Set(currentPBs.map((pb) => pb.businessId));

      // 削除: 送信データに含まれないもの
      const toDelete = currentPBs
        .filter((pb) => !incomingBizIds.has(pb.businessId))
        .map((pb) => pb.id);

      // 追加/更新
      const upserts = businessAssignments.map(
        (a: { businessId: string; role?: string }) =>
          prisma.partnerBusiness.upsert({
            where: {
              partnerId_businessId: { partnerId: id, businessId: a.businessId },
            },
            update: { role: a.role || null, isActive: true },
            create: {
              partnerId: id,
              businessId: a.businessId,
              role: a.role || null,
              isActive: true,
            },
          }),
      );

      await prisma.$transaction([
        ...(toDelete.length > 0
          ? [prisma.partnerBusiness.deleteMany({ where: { id: { in: toDelete } } })]
          : []),
        ...upserts,
      ]);
    }

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entity: "Partner",
      entityId: id,
      before: existing,
      after: updated,
      request,
    });

    await createDataVersion({
      entity: "Partner",
      entityId: id,
      data: updated,
      changedBy: user.id,
      changeType: "UPDATE",
    });

    // 更新後のデータを partnerBusinesses 付きで返す
    const result = await prisma.partner.findUnique({
      where: { id },
      include: {
        partnerBusinesses: {
          include: {
            business: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error("Partner PUT error", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // PARTNER ロールは削除不可
    if (user.role === "PARTNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.partner.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    await prisma.partner.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog({
      userId: user.id,
      action: "SOFT_DELETE",
      entity: "Partner",
      entityId: id,
      before: existing,
      request,
    });

    return NextResponse.json({ data: null, message: "Partner deleted" });
  } catch (error) {
    logger.error("Partner DELETE error", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
