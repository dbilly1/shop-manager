import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { AuditLogClient } from "./audit-log-client"
import { getActiveBranchId } from "@/lib/branch-cookie"

export default async function AuditPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  const query = supabase
    .from("audit_log")
    .select("*")
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })
    .limit(200)

  if (activeBranchId) query.eq("branch_id", activeBranchId)

  const { data: logs } = await query

  return <AuditLogClient logs={logs ?? []} />
}
