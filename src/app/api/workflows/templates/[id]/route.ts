import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const template = await prisma.workflowTemplate.findUnique({
      where: { id },
      include: {
        business: { select: { id: true, name: true, code: true } },
        steps: { orderBy: { sortOrder: "asc" } },
        _count: { select: { workflows: true } },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Workflow template not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("WorkflowTemplate GET error:", error);
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

    const existing = await prisma.workflowTemplate.findUnique({
      where: { id },
      include: { steps: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Workflow template not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { name, description, isActive, steps } = body;

    // Update template
    const updatedTemplate = await prisma.workflowTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description || null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // Update steps if provided
    if (steps && Array.isArray(steps)) {
      const existingStepIds = existing.steps.map((s) => s.id);
      const incomingStepIds = steps
        .filter((s: Record<string, unknown>) => s.id)
        .map((s: Record<string, unknown>) => s.id as string);

      // Delete removed steps
      const stepsToDelete = existingStepIds.filter(
        (sid) => !incomingStepIds.includes(sid),
      );
      if (stepsToDelete.length > 0) {
        await prisma.workflowStepTemplate.deleteMany({
          where: { id: { in: stepsToDelete } },
        });
      }

      // Upsert steps
      for (const step of steps) {
        const stepData = {
          title: (step.title as string).trim(),
          description: (step.description as string) || null,
          sortOrder: step.sortOrder as number,
          daysFromStart: (step.daysFromStart as number) ?? null,
          daysFromPrevious: (step.daysFromPrevious as number) ?? null,
          assigneeRole: (step.assigneeRole as string) || null,
          isRequired: step.isRequired !== false,
        };

        if (step.id && existingStepIds.includes(step.id)) {
          await prisma.workflowStepTemplate.update({
            where: { id: step.id },
            data: stepData,
          });
        } else {
          await prisma.workflowStepTemplate.create({
            data: {
              ...stepData,
              templateId: id,
            },
          });
        }
      }
    }

    const result = await prisma.workflowTemplate.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { sortOrder: "asc" } },
        business: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entity: "WorkflowTemplate",
      entityId: id,
      before: existing as unknown as Record<string, unknown>,
      after: result as unknown as Record<string, unknown> | null,
      request,
    });

    if (result) {
      await createDataVersion({
        entity: "WorkflowTemplate",
        entityId: id,
        data: result as unknown as Record<string, unknown>,
        changedBy: user.id,
        changeType: "UPDATE",
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("WorkflowTemplate PUT error:", error);
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

    const existing = await prisma.workflowTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Workflow template not found" },
        { status: 404 },
      );
    }

    // Deactivate instead of delete
    await prisma.workflowTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    await writeAuditLog({
      userId: user.id,
      action: "DEACTIVATE",
      entity: "WorkflowTemplate",
      entityId: id,
      before: existing,
      request,
    });

    return NextResponse.json({ message: "Workflow template deactivated", id });
  } catch (error) {
    console.error("WorkflowTemplate DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
