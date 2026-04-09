import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { AuditLogClient } from "./audit-log-client"

export default async function AuditPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const query = supabase
    .from("audit_log")
    .select("*")
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })
    .limit(200)

  if (session.branch_id) query.eq("branch_id", session.branch_id)

  const { data: logs } = await query

  return <AuditLogClient logs={logs ?? []} />
}
