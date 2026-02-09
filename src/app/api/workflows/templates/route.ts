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
    const isActive = searchParams.get("isActive");

    const where: Record<string, unknown> = {};
    if (businessId) where.businessId = businessId;
    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const templates = await prisma.workflowTemplate.findMany({
      where,
      include: {
        business: { select: { id: true, name: true, code: true } },
        steps: { orderBy: { sortOrder: "asc" } },
        _count: { select: { workflows: true } },
      },
      orderBy: [{ businessId: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("WorkflowTemplates GET error:", error);
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
    const { name, businessId, description, steps } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json(
        { error: "steps array is required and must not be empty" },
        { status: 400 },
      );
    }

    // Validate each step
    for (const step of steps) {
      if (!step.title || typeof step.title !== "string") {
        return NextResponse.json(
          { error: "Each step must have a title" },
          { status: 400 },
        );
      }
      if (step.sortOrder === undefined || step.sortOrder === null) {
        return NextResponse.json(
          { error: "Each step must have a sortOrder" },
          { status: 400 },
        );
      }
    }

    const template = await prisma.workflowTemplate.create({
      data: {
        name: name.trim(),
        businessId,
        description: description || null,
        steps: {
          create: steps.map((step: Record<string, unknown>) => ({
            title: (step.title as string).trim(),
            description: (step.description as string) || null,
            sortOrder: step.sortOrder as number,
            daysFromStart: (step.daysFromStart as number) ?? null,
            daysFromPrevious: (step.daysFromPrevious as number) ?? null,
            assigneeRole: (step.assigneeRole as string) || null,
            isRequired: step.isRequired !== false,
          })),
        },
      },
      include: {
        steps: { orderBy: { sortOrder: "asc" } },
        business: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "WorkflowTemplate",
      entityId: template.id,
      after: template,
      request,
    });

    await createDataVersion({
      entity: "WorkflowTemplate",
      entityId: template.id,
      data: template,
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("WorkflowTemplate POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
