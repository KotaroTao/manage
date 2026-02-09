import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const category = searchParams.get("category") || undefined;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;

    const tags = await prisma.tag.findMany({
      where,
      include: {
        _count: { select: { entityTags: true } },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(tags);
  } catch (error) {
    console.error("Tags GET error:", error);
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
    const { name, category, color } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!category) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }

    // Check uniqueness
    const existing = await prisma.tag.findUnique({
      where: { name_category: { name: name.trim(), category } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Tag with this name and category already exists" },
        { status: 400 },
      );
    }

    const tag = await prisma.tag.create({
      data: {
        name: name.trim(),
        category,
        color: color || "#6B7280",
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "Tag",
      entityId: tag.id,
      after: tag,
      request,
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error("Tag POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 },
      );
    }

    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Cascade delete is handled by Prisma schema (onDelete: Cascade on EntityTag)
    await prisma.tag.delete({ where: { id } });

    await writeAuditLog({
      userId: user.id,
      action: "DELETE",
      entity: "Tag",
      entityId: id,
      before: existing,
      request,
    });

    return NextResponse.json({ message: "Tag deleted", id });
  } catch (error) {
    console.error("Tag DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
