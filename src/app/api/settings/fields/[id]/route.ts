import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }

    const { id } = await context.params;

    const existing = await prisma.customFieldDef.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Custom field definition not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { fieldLabel, fieldType, options, isRequired, sortOrder } = body;

    const updated = await prisma.customFieldDef.update({
      where: { id },
      data: {
        ...(fieldLabel !== undefined && { fieldLabel: fieldLabel.trim() }),
        ...(fieldType !== undefined && { fieldType }),
        ...(options !== undefined && { options }),
        ...(isRequired !== undefined && { isRequired }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
      include: {
        business: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entity: "CustomFieldDef",
      entityId: id,
      before: existing,
      after: updated,
      request,
    });

    await createDataVersion({
      entity: "CustomFieldDef",
      entityId: id,
      data: updated,
      changedBy: user.id,
      changeType: "UPDATE",
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("CustomFieldDef PUT error:", error);
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

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }

    const { id } = await context.params;

    const existing = await prisma.customFieldDef.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Custom field definition not found" },
        { status: 404 },
      );
    }

    await prisma.customFieldDef.delete({ where: { id } });

    await writeAuditLog({
      userId: user.id,
      action: "DELETE",
      entity: "CustomFieldDef",
      entityId: id,
      before: existing,
      request,
    });

    return NextResponse.json({ message: "Custom field definition deleted", id });
  } catch (error) {
    console.error("CustomFieldDef DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
