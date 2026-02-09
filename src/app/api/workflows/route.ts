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
    const customerBusinessId = searchParams.get("customerBusinessId") || undefined;
    const status = searchParams.get("status") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "20", 10)));
    const skip = (page - 1) * perPage;

    const where: Record<string, unknown> = {};
    if (customerBusinessId) where.customerBusinessId = customerBusinessId;
    if (status) where.status = status;

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        include: {
          template: { select: { id: true, name: true } },
          customerBusiness: {
            include: {
              customer: { select: { id: true, name: true } },
              business: { select: { id: true, name: true } },
            },
          },
          steps: {
            include: { assignee: { select: { id: true, name: true } } },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage,
      }),
      prisma.workflow.count({ where }),
    ]);

    return NextResponse.json({
      data: workflows,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    console.error("Workflows GET error:", error);
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
    const { templateId, customerBusinessId, assigneeId } = body;

    if (!templateId) {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }
    if (!customerBusinessId) {
      return NextResponse.json({ error: "customerBusinessId is required" }, { status: 400 });
    }
    if (!assigneeId) {
      return NextResponse.json({ error: "assigneeId is required" }, { status: 400 });
    }

    // Get template with steps
    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      include: {
        steps: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (!template.isActive) {
      return NextResponse.json(
        { error: "Template is not active" },
        { status: 400 },
      );
    }

    // Verify customerBusiness exists
    const customerBusiness = await prisma.customerBusiness.findFirst({
      where: { id: customerBusinessId, deletedAt: null },
    });

    if (!customerBusiness) {
      return NextResponse.json(
        { error: "CustomerBusiness not found" },
        { status: 404 },
      );
    }

    const now = new Date();

    // Create workflow with steps
    const workflow = await prisma.workflow.create({
      data: {
        templateId,
        customerBusinessId,
        status: "ACTIVE",
        startedAt: now,
        steps: {
          create: template.steps.map((stepTemplate, index) => {
            // Calculate due date
            let dueDate: Date;
            if (stepTemplate.daysFromStart !== null && stepTemplate.daysFromStart !== undefined) {
              dueDate = new Date(now);
              dueDate.setDate(dueDate.getDate() + stepTemplate.daysFromStart);
            } else if (stepTemplate.daysFromPrevious !== null && stepTemplate.daysFromPrevious !== undefined) {
              // Calculate cumulative days from previous steps
              let cumulativeDays = 0;
              for (let i = 0; i <= index; i++) {
                const s = template.steps[i];
                if (s.daysFromPrevious !== null && s.daysFromPrevious !== undefined) {
                  cumulativeDays += s.daysFromPrevious;
                }
              }
              dueDate = new Date(now);
              dueDate.setDate(dueDate.getDate() + cumulativeDays);
            } else {
              // Default: index * 7 days
              dueDate = new Date(now);
              dueDate.setDate(dueDate.getDate() + index * 7);
            }

            return {
              stepTemplateId: stepTemplate.id,
              title: stepTemplate.title,
              description: stepTemplate.description,
              sortOrder: stepTemplate.sortOrder,
              assigneeId,
              status: index === 0 ? "ACTIVE" : "PENDING",
              dueDate,
            };
          }),
        },
      },
      include: {
        template: { select: { id: true, name: true } },
        customerBusiness: {
          include: {
            customer: { select: { id: true, name: true } },
            business: { select: { id: true, name: true } },
          },
        },
        steps: {
          include: { assignee: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "Workflow",
      entityId: workflow.id,
      after: workflow,
      request,
    });

    await createDataVersion({
      entity: "Workflow",
      entityId: workflow.id,
      data: workflow,
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    console.error("Workflow POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
