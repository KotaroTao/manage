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
    const customerBusinessId = searchParams.get("customerBusinessId");

    if (!customerBusinessId) {
      return NextResponse.json(
        { error: "customerBusinessId query parameter is required" },
        { status: 400 },
      );
    }

    const notes = await prisma.activityNote.findMany({
      where: { customerBusinessId },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { contactedAt: "desc" },
    });

    return NextResponse.json({ data: notes });
  } catch (error) {
    logger.error("ActivityNotes GET error", error, request);
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

    const body = await request.json();
    const { customerBusinessId, title, type, content, contactedAt } = body;

    if (!customerBusinessId) {
      return NextResponse.json(
        { error: "customerBusinessId is required" },
        { status: 400 },
      );
    }
    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 },
      );
    }
    if (!type) {
      return NextResponse.json(
        { error: "type is required" },
        { status: 400 },
      );
    }

    // Verify customerBusiness exists
    const cb = await prisma.customerBusiness.findFirst({
      where: { id: customerBusinessId, deletedAt: null },
    });

    if (!cb) {
      return NextResponse.json(
        { error: "CustomerBusiness not found" },
        { status: 404 },
      );
    }

    const note = await prisma.activityNote.create({
      data: {
        customerBusinessId,
        title: title.trim(),
        type,
        content: content || "",
        contactedAt: contactedAt ? new Date(contactedAt) : new Date(),
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "ActivityNote",
      entityId: note.id,
      after: note,
      request,
    });

    await createDataVersion({
      entity: "ActivityNote",
      entityId: note.id,
      data: note,
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json({ data: note }, { status: 201 });
  } catch (error) {
    logger.error("ActivityNote POST error", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
