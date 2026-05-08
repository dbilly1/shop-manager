import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { canViewHistory } from "@/lib/permissions"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { HistoryClient } from "./history-client"

export default async function HistoryPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (!canViewHistory(session.role!)) redirect("/dashboard")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("shop_id", session.shop_id!)

  const { data: shop } = await supabase
    .from("shops")
    .select("currency")
    .eq("id", session.shop_id!)
    .single()

  return (
    <HistoryClient
      session={session}
      branches={branches ?? []}
      currency={shop?.currency ?? "GHS"}
      activeBranchId={activeBranchId}
    />
  )
}
