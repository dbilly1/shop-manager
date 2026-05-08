import { createAdminClient } from "@/lib/supabase/admin"

export type AuditAction =
  | "CREATE_SALE"
  | "DELETE_SALE"
  | "EDIT_SALE"
  | "UPDATE_SALE"
  | "CREATE_PRODUCT"
  | "UPDATE_PRODUCT"
  | "CREATE_BRANCH"
  | "CREATE_ADJUSTMENT"
  | "APPROVE_ADJUSTMENT"
  | "SUBMIT_RECONCILIATION"
  | "CREATE_EXPENSE"
  | "ADD_CUSTOMER"
  | "RECORD_CREDIT_PAYMENT"
  | "CREATE_TRANSFER"
  | "APPROVE_TRANSFER"
  | "CREATE_STOCK_AUDIT"
  | "COMPLETE_STOCK_AUDIT"
  | "CANCEL_STOCK_AUDIT"

export interface LogAuditParams {
  shopId: string
  branchId?: string | null
  userId: string
  action: AuditAction
  entityType: string
  entityId: string
  newValues?: Record<string, unknown> | null
  oldValues?: Record<string, unknown> | null
}

/**
 * Write an audit log entry using the admin client (bypasses RLS).
 * Server-side only. Never throws — audit failures are silent so they
 * never break the calling operation.
 */
export async function logAudit({
  shopId,
  branchId,
  userId,
  action,
  entityType,
  entityId,
  newValues,
  oldValues,
}: LogAuditParams): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("audit_log").insert({
    shop_id: shopId,
    branch_id: branchId ?? null,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    old_values: oldValues ?? null,
    new_values: newValues ?? null,
  })
  if (error) throw new Error(error.message)
}
