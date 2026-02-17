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

    const body = await request.json();
    const {
      name,
      email,
      phone,
      company,
      specialty,
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

    const updated = await prisma.partner.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(email !== undefined && { email: email || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(company !== undefined && { company: company || null }),
        ...(specialty !== undefined && { specialty: specialty || null }),
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

    return NextResponse.json({ data: updated });
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
