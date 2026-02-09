import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ data: users });
  } catch (error) {
    console.error("Users GET error:", error);
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
    const { email, name, password, role } = body;

    if (!email || typeof email !== "string" || email.trim() === "") {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "password is required and must be at least 8 characters" },
        { status: 400 },
      );
    }
    if (!role) {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    // Check email uniqueness
    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        passwordHash,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "User",
      entityId: newUser.id,
      after: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role },
      request,
    });

    await createDataVersion({
      entity: "User",
      entityId: newUser.id,
      data: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role },
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error("User POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
