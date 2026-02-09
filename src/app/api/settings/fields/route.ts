import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const businessId = searchParams.get("businessId") || undefined;

    const where: Record<string, unknown> = {};
    if (businessId) where.businessId = businessId;

    const fields = await prisma.customFieldDef.findMany({
      where,
      include: {
        business: { select: { id: true, name: true } },
      },
      orderBy: [{ businessId: "asc" }, { sortOrder: "asc" }],
    });

    return NextResponse.json({ data: fields });
  } catch (error) {
    console.error("CustomFieldDefs GET error:", error);
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

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }

    const body = await request.json();
    const { businessId, fieldKey, fieldLabel, fieldType, entity, options, isRequired, sortOrder } = body;

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }
    if (!fieldKey || typeof fieldKey !== "string" || fieldKey.trim() === "") {
      return NextResponse.json({ error: "fieldKey is required" }, { status: 400 });
    }
    if (!fieldLabel || typeof fieldLabel !== "string" || fieldLabel.trim() === "") {
      return NextResponse.json({ error: "fieldLabel is required" }, { status: 400 });
    }
    if (!fieldType) {
      return NextResponse.json({ error: "fieldType is required" }, { status: 400 });
    }

    // Check uniqueness
    const existing = await prisma.customFieldDef.findUnique({
      where: { businessId_fieldKey: { businessId, fieldKey: fieldKey.trim() } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Field key already exists for this business" },
        { status: 400 },
      );
    }

    const field = await prisma.customFieldDef.create({
      data: {
        businessId,
        fieldKey: fieldKey.trim(),
        fieldLabel: fieldLabel.trim(),
        fieldType,
        entity: entity || "customerBusiness",
        options: options || [],
        isRequired: isRequired ?? false,
        sortOrder: sortOrder ?? 0,
      },
      include: {
        business: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "CustomFieldDef",
      entityId: field.id,
      after: field,
      request,
    });

    await createDataVersion({
      entity: "CustomFieldDef",
      entityId: field.id,
      data: field,
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json({ data: field }, { status: 201 });
  } catch (error) {
    console.error("CustomFieldDef POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
