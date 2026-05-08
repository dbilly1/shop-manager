import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { AuditLogClient } from "./audit-log-client"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { getPlanForShop, hasFeature } from "@/lib/plan-guard"
import { canViewAuditLog } from "@/lib/permissions"

export default async function AuditPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const plan = await getPlanForShop(session.shop_id!)
  if (!hasFeature(plan, "audit_log")) redirect("/dashboard")
  if (!canViewAuditLog(session.role!)) redirect("/dashboard")

  const activeBranchId = await getActiveBranchId(session.branch_id)

  // Use admin client so RLS doesn't silently filter out rows
  const admin = createAdminClient()
  const query = admin
    .from("audit_log")
    .select("*")
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })
    .limit(200)

  if (activeBranchId) query.eq("branch_id", activeBranchId)

  const { data: logs } = await query

  // Resolve display names for all unique actors
  const userIds = [...new Set((logs ?? []).map((l) => l.user_id).filter(Boolean))] as string[]
  const userNames: Record<string, string> = {}
  if (userIds.length > 0) {
    try {
      const results = await Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id)))
      for (const { data } of results) {
        if (data?.user) {
          userNames[data.user.id] =
            (data.user.user_metadata?.full_name as string | undefined) ??
            data.user.email ??
            data.user.id.slice(0, 8)
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Resolve branch names
  const branchIds = [...new Set((logs ?? []).map((l) => l.branch_id).filter(Boolean))] as string[]
  const branchNames: Record<string, string> = {}
  if (branchIds.length > 0) {
    const { data: branches } = await admin
      .from("branches")
      .select("id, name")
      .in("id", branchIds)
    for (const b of branches ?? []) {
      branchNames[b.id] = b.name
    }
  }

  return <AuditLogClient logs={logs ?? []} userNames={userNames} branchNames={branchNames} />
}
