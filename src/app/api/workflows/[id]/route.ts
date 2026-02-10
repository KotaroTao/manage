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

    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: {
        template: { select: { id: true, name: true, description: true } },
        customerBusiness: {
          include: {
            customer: { select: { id: true, name: true, company: true } },
            business: { select: { id: true, name: true, code: true } },
          },
        },
        steps: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            stepTemplate: { select: { id: true, title: true, isRequired: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({ data: workflow });
  } catch (error) {
    console.error("Workflow GET error:", error);
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

    const existing = await prisma.workflow.findUnique({
      where: { id },
      include: {
        steps: {
          include: { stepTemplate: { select: { isRequired: true } } },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    // If completing, verify all required steps are done
    if (status === "COMPLETED") {
      const incompleteRequired = existing.steps.filter(
        (step) =>
          step.stepTemplate?.isRequired !== false &&
          step.status !== "DONE" &&
          step.status !== "SKIPPED",
      );

      if (incompleteRequired.length > 0) {
        return NextResponse.json(
          {
            error: "Cannot complete workflow: required steps are not done",
            incompleteSteps: incompleteRequired.map((s) => ({
              id: s.id,
              title: s.title,
              status: s.status,
            })),
          },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.workflow.update({
      where: { id },
      data: {
        status,
        ...(status === "COMPLETED" && { completedAt: new Date() }),
      },
      include: {
        template: { select: { id: true, name: true } },
        steps: {
          include: { assignee: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entity: "Workflow",
      entityId: id,
      before: { status: existing.status },
      after: { status: updated.status },
      request,
    });

    await createDataVersion({
      entity: "Workflow",
      entityId: id,
      data: updated,
      changedBy: user.id,
      changeType: "UPDATE",
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Workflow PUT error:", error);
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

    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json(
        { error: "Forbidden: Admin or Manager only" },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    const existing = await prisma.workflow.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    if (existing.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Cannot cancel a completed workflow" },
        { status: 400 },
      );
    }

    const updated = await prisma.workflow.update({
      where: { id },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "DELETE",
      entity: "Workflow",
      entityId: id,
      before: { status: existing.status },
      after: { status: updated.status },
      request,
    });

    await createDataVersion({
      entity: "Workflow",
      entityId: id,
      data: updated,
      changedBy: user.id,
      changeType: "DELETE",
    });

    return NextResponse.json({ data: null, message: "Workflow cancelled" });
  } catch (error) {
    console.error("Workflow DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
