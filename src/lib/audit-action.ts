"use server"

import { getSessionContext } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import type { AuditAction } from "@/lib/audit"

interface LogAuditActionParams {
  branchId?: string | null
  action: AuditAction
  entityType: string
  entityId: string
  newValues?: Record<string, unknown> | null
  oldValues?: Record<string, unknown> | null
}

/**
 * Server Action for audit logging.
 * Called directly from client components — no HTTP round-trip, no middleware.
 * shopId and userId are resolved from the server-side session.
 * Never throws.
 */
export async function logAuditAction(params: LogAuditActionParams): Promise<void> {
  try {
    const session = await getSessionContext()
    if (!session?.shop_id) return

    await logAudit({
      shopId: session.shop_id,
      userId: session.user_id,
      branchId: params.branchId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      newValues: params.newValues ?? null,
      oldValues: params.oldValues ?? null,
    })
  } catch {
    // Never break the calling operation
  }
}
