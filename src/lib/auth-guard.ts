import { NextResponse } from "next/server"
import { getSessionContext } from "@/lib/session"
import type { Role, SessionContext } from "@/types"

/**
 * Guard for API routes. Returns either a SessionContext (authorised) or a
 * NextResponse to short-circuit with 401/403.
 *
 * Usage:
 *   const guard = await requireRole(["owner", "general_manager"])
 *   if (guard instanceof NextResponse) return guard
 *   const session = guard
 */
export async function requireRole(
  allowedRoles?: Role[]
): Promise<SessionContext | NextResponse> {
  const session = await getSessionContext()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (allowedRoles && allowedRoles.length > 0) {
    if (!session.role || !allowedRoles.includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }
  return session
}

/**
 * Guard requiring super-admin status.
 */
export async function requireSuperAdmin(): Promise<SessionContext | NextResponse> {
  const session = await getSessionContext()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!session.is_super_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return session
}
