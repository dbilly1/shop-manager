import { createAdminClient } from "@/lib/supabase/admin"

export type AuditAction =
  // ── Sales ──────────────────────────────────────────────────────────────────
  | "CREATE_SALE"
  | "UPDATE_SALE"
  | "DELETE_SALE"
  // ── Products / Inventory ───────────────────────────────────────────────────
  | "CREATE_PRODUCT"
  | "UPDATE_PRODUCT"
  | "RESTOCK_PRODUCT"
  | "DISCONTINUE_PRODUCT"
  // ── Stock adjustments ──────────────────────────────────────────────────────
  | "CREATE_ADJUSTMENT"
  | "APPROVE_ADJUSTMENT"
  | "REJECT_ADJUSTMENT"
  // ── Stock transfers ────────────────────────────────────────────────────────
  | "CREATE_TRANSFER"
  | "APPROVE_TRANSFER"
  | "REJECT_TRANSFER"
  // ── Expenses ───────────────────────────────────────────────────────────────
  | "CREATE_EXPENSE"
  | "UPDATE_EXPENSE"
  | "DELETE_EXPENSE"
  // ── Credit payments ────────────────────────────────────────────────────────
  | "RECORD_CREDIT_PAYMENT"
  | "EDIT_CREDIT_PAYMENT"
  | "DELETE_CREDIT_PAYMENT"
  // ── Customers ──────────────────────────────────────────────────────────────
  | "ADD_CUSTOMER"
  | "UPDATE_CUSTOMER"
  | "DELETE_CUSTOMER"
  // ── Reconciliation ─────────────────────────────────────────────────────────
  | "SUBMIT_RECONCILIATION"
  // ── Stock audits ───────────────────────────────────────────────────────────
  | "CREATE_STOCK_AUDIT"
  | "COMPLETE_STOCK_AUDIT"
  | "CANCEL_STOCK_AUDIT"
  // ── Org / settings ─────────────────────────────────────────────────────────
  | "CREATE_BRANCH"
  | "TRANSACTIONAL_RESET"
  | "FULL_RESET"

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
