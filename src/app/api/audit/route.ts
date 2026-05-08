import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-guard"
import { logAudit } from "@/lib/audit"
import type { AuditAction } from "@/lib/audit"

export async function POST(req: NextRequest) {
  const session = await requireRole()
  if (session instanceof NextResponse) return session

  const {
    branchId,
    action,
    entityType,
    entityId,
    newValues,
    oldValues,
  }: {
    branchId?: string | null
    action: AuditAction
    entityType: string
    entityId: string
    newValues?: Record<string, unknown> | null
    oldValues?: Record<string, unknown> | null
  } = await req.json()

  if (!session.shop_id) {
    return NextResponse.json({ ok: false, error: "session has no shop_id" }, { status: 400 })
  }

  try {
    await logAudit({
      shopId: session.shop_id,
      userId: session.user_id,
      branchId,
      action,
      entityType,
      entityId,
      newValues,
      oldValues,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[audit] insert failed:", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
