import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";
import bcrypt from "bcryptjs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }

    const { id } = await context.params;

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        notificationSetting: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ data: targetUser });
  } catch (error) {
    console.error("User GET error:", error);
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

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }

    const { id } = await context.params;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const { email, name, password, role, isActive } = body;

    const updateData: Record<string, unknown> = {};
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (name !== undefined) updateData.name = name.trim();
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (password && typeof password === "string") {
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 },
        );
      }
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    // Check email uniqueness if changing email
    if (email && email.trim().toLowerCase() !== existing.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
      if (emailExists) {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      before: { email: existing.email, name: existing.name, role: existing.role, isActive: existing.isActive },
      after: { email: updated.email, name: updated.name, role: updated.role, isActive: updated.isActive },
      request,
    });

    await createDataVersion({
      entity: "User",
      entityId: id,
      data: { email: updated.email, name: updated.name, role: updated.role, isActive: updated.isActive },
      changedBy: user.id,
      changeType: "UPDATE",
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("User PUT error:", error);
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

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (id === user.id) {
      return NextResponse.json(
        { error: "Cannot deactivate your own account" },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await writeAuditLog({
      userId: user.id,
      action: "DEACTIVATE",
      entity: "User",
      entityId: id,
      before: { isActive: existing.isActive },
      after: { isActive: false },
      request,
    });

    return NextResponse.json({ data: null, message: "User deactivated" });
  } catch (error) {
    console.error("User DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
