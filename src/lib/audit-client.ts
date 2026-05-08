"use client"

import type { AuditAction } from "@/lib/audit"

interface LogAuditClientParams {
  branchId?: string | null
  action: AuditAction
  entityType: string
  entityId: string
  newValues?: Record<string, unknown> | null
  oldValues?: Record<string, unknown> | null
}

/**
 * Client-side audit logging — POSTs to /api/audit which uses the admin
 * client server-side, bypassing RLS. shopId and userId are resolved from
 * the verified session on the server; never sent from the client.
 * Never throws.
 */
export async function logAuditClient(params: LogAuditClientParams): Promise<void> {
  try {
    const res = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error("[audit] failed:", body?.error ?? res.status)
    }
  } catch (err) {
    console.error("[audit] network error:", err)
  }
}
