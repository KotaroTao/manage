import type {
  Role,
  CBStatus,
  CustomerStatus,
  PartnerStatus,
  WorkflowStatus,
  StepStatus,
  TaskStatus,
  Priority,
  PaymentStatus,
  PaymentType,
  NotificationType,
  SharedPageType,
  ActivityNoteType,
  Frequency,
  FieldType,
} from "@prisma/client";
import type { NextRequest } from "next/server";

// Re-export enums for convenience
export type {
  Role,
  CBStatus,
  CustomerStatus,
  PartnerStatus,
  WorkflowStatus,
  StepStatus,
  TaskStatus,
  Priority,
  PaymentStatus,
  PaymentType,
  NotificationType,
  SharedPageType,
  ActivityNoteType,
  Frequency,
  FieldType,
};

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ============================================================
// Auth Types
// ============================================================

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
}

export interface LoginFormData {
  email: string;
  password: string;
}

// ============================================================
// Customer Types
// ============================================================

export interface CustomerFormData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  postalCode?: string;
  representative?: string;
  status: CustomerStatus;
  note?: string;
}

export interface CustomerWithBusinesses {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  postalCode: string | null;
  representative: string | null;
  status: CustomerStatus;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  customerBusinesses: CustomerBusinessSummary[];
}

// ============================================================
// CustomerBusiness Types
// ============================================================

export interface CustomerBusinessFormData {
  customerId: string;
  businessId: string;
  status: CBStatus;
  nextActionDate?: string | null;
  nextActionMemo?: string;
  assigneeId?: string;
  customFields?: Record<string, unknown>;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  monthlyFee?: number | null;
  note?: string;
}

export interface CustomerBusinessSummary {
  id: string;
  status: CBStatus;
  nextActionDate: Date | null;
  nextActionMemo: string | null;
  monthlyFee: number | null;
  business: {
    id: string;
    name: string;
    code: string;
    colorCode: string;
  };
  assignee: {
    id: string;
    name: string;
  } | null;
  customer: {
    id: string;
    name: string;
    company: string | null;
  };
}

// ============================================================
// Business Types
// ============================================================

export interface BusinessFormData {
  name: string;
  code: string;
  description?: string;
  managerId?: string;
  colorCode?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// ============================================================
// Partner Types
// ============================================================

export interface PartnerFormData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  specialty?: string;
  facebook?: string;
  instagram?: string;
  chatwork?: string;
  line?: string;
  slack?: string;
  x?: string;
  preferredContactMethods?: string[];
  bankName?: string;
  bankBranch?: string;
  bankAccountType?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  contractType: string;
  rate?: number;
  note?: string;
}

// ============================================================
// Task Types
// ============================================================

export interface TaskFormData {
  title: string;
  description?: string;
  customerBusinessId?: string;
  businessId?: string;
  assigneeId: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
}

export interface TaskWithRelations {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: Date;
  completedAt: Date | null;
  createdAt: Date;
  assignee: { id: string; name: string };
  business: { id: string; name: string; colorCode: string } | null;
  customerBusiness: {
    id: string;
    customer: { id: string; name: string; company: string | null };
    business: { id: string; name: string };
  } | null;
}

// ============================================================
// Workflow Types
// ============================================================

export interface StartWorkflowParams {
  templateId: string;
  customerBusinessId: string;
  startDate: Date;
  assigneeId: string;
}

export interface WorkflowWithSteps {
  id: string;
  status: WorkflowStatus;
  startedAt: Date;
  completedAt: Date | null;
  template: {
    id: string;
    name: string;
  };
  customerBusiness: {
    id: string;
    customer: { id: string; name: string };
    business: { id: string; name: string };
  };
  steps: WorkflowStepDetail[];
}

export interface WorkflowStepDetail {
  id: string;
  title: string;
  description: string | null;
  status: StepStatus;
  sortOrder: number;
  dueDate: Date;
  completedAt: Date | null;
  note: string | null;
  assignee: { id: string; name: string };
}

// ============================================================
// Payment Types
// ============================================================

export interface PaymentFormData {
  partnerId: string;
  workflowId?: string;
  customerBusinessId?: string;
  amount: number;
  tax: number;
  totalAmount: number;
  type: PaymentType;
  status: PaymentStatus;
  period?: string;
  dueDate?: string;
  note?: string;
}

// ============================================================
// SharedPage Types
// ============================================================

export interface SharedPageFormData {
  customerBusinessId: string;
  type: SharedPageType;
  title: string;
  content: string;
  isPublished: boolean;
}

// ============================================================
// Dashboard Types
// ============================================================

export interface DashboardData {
  overdueTasks: OverdueItem[];
  approachingDeadlines: ApproachingItem[];
  missingNextAction: MissingActionItem[];
  activeWorkflows: number;
  totalCustomerBusinesses: number;
  recentActivity: RecentActivityItem[];
}

export interface OverdueItem {
  id: string;
  type: "task" | "workflowStep";
  title: string;
  dueDate: Date;
  daysOverdue: number;
  assignee: { id: string; name: string };
  customerBusiness?: {
    id: string;
    customer: { name: string };
    business: { name: string };
  };
}

export interface ApproachingItem {
  id: string;
  type: "task" | "workflowStep" | "nextAction";
  title: string;
  dueDate: Date;
  daysUntilDue: number;
  assignee: { id: string; name: string } | null;
  customerBusiness?: {
    id: string;
    customer: { name: string };
    business: { name: string };
  };
}

export interface MissingActionItem {
  id: string;
  customerName: string;
  businessName: string;
  status: CBStatus;
  assignee: { id: string; name: string } | null;
}

export interface RecentActivityItem {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
  user: { id: string; name: string };
}

// ============================================================
// Notification / Alert Types
// ============================================================

export interface LoginAlert {
  type: "overdue" | "approaching" | "missingAction";
  title: string;
  message: string;
  count: number;
  items: AlertItem[];
}

export interface AlertItem {
  id: string;
  label: string;
  dueDate?: Date | null;
  entityType?: string;
  entityId?: string;
}

// ============================================================
// Audit Types
// ============================================================

export interface AuditLogParams {
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Pass the NextRequest to auto-extract IP and User-Agent */
  request?: NextRequest;
}

export interface DataVersionParams {
  entity: string;
  entityId: string;
  data: Record<string, unknown>;
  changedBy?: string;
  changeType: string;
}

// ============================================================
// Filter / Search Types
// ============================================================

export interface CustomerSearchParams extends PaginationParams {
  query?: string;
  status?: CustomerStatus;
  businessId?: string;
}

export interface TaskSearchParams extends PaginationParams {
  assigneeId?: string;
  status?: TaskStatus;
  priority?: Priority;
  businessId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export interface PaymentSearchParams extends PaginationParams {
  partnerId?: string;
  status?: PaymentStatus;
  period?: string;
  type?: PaymentType;
}

// ============================================================
// User Management Types
// ============================================================

export interface UserFormData {
  email: string;
  name: string;
  password?: string;
  role: Role;
  isActive: boolean;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}
