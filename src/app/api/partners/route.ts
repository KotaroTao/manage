import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "20", 10)));
    const skip = (page - 1) * perPage;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    // PARTNER ロールは自分自身のパートナー情報のみ
    if (user.role === "PARTNER") {
      where.userId = user.id;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
          specialty: true,
          contractType: true,
          rate: true,
          status: true,
          note: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          payments: {
            where: { deletedAt: null },
            select: {
              totalAmount: true,
              status: true,
            },
          },
          _count: {
            select: { partnerBusinesses: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage,
      }),
      prisma.partner.count({ where }),
    ]);

    const partnersWithTotals = partners.map((partner) => {
      const paidTotal = partner.payments
        .filter((p) => p.status === "PAID")
        .reduce((sum, p) => sum + p.totalAmount, 0);
      const pendingTotal = partner.payments
        .filter((p) => p.status !== "PAID")
        .reduce((sum, p) => sum + p.totalAmount, 0);

      const { payments, ...partnerData } = partner;
      return {
        ...partnerData,
        paymentTotals: { paidTotal, pendingTotal },
      };
    });

    return NextResponse.json({
      data: partnersWithTotals,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    logger.error("Partners GET error", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // PARTNER ロールは作成不可
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
    } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const partner = await prisma.partner.create({
      data: {
        name: name.trim(),
        email: email || null,
        phone: phone || null,
        company: company || null,
        specialty: specialty || null,
        facebook: facebook || null,
        instagram: instagram || null,
        chatwork: chatwork || null,
        line: line || null,
        slack: slack || null,
        x: x || null,
        preferredContactMethods: Array.isArray(preferredContactMethods) ? preferredContactMethods : [],
        bankName: bankName || null,
        bankBranch: bankBranch || null,
        bankAccountType: bankAccountType || null,
        bankAccountNumber: bankAccountNumber || null,
        bankAccountHolder: bankAccountHolder || null,
        contractType: contractType || "OUTSOURCING",
        rate: rate ?? null,
        status: status || "ACTIVE",
        note: note || null,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "Partner",
      entityId: partner.id,
      after: partner,
      request,
    });

    await createDataVersion({
      entity: "Partner",
      entityId: partner.id,
      data: partner,
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json({ data: partner }, { status: 201 });
  } catch (error) {
    logger.error("Partner POST error", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
