import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { CreditClient } from "./credit-client"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { canManageCredit } from "@/lib/permissions"

export default async function CreditPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (!canManageCredit(session.role!)) redirect("/dashboard")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  const csQuery = supabase
    .from("credit_sales")
    .select("*, customer:customers(id, name, phone), sale:sales(sale_date)")
    .eq("shop_id", session.shop_id!)
    .gt("balance", 0)
    .order("created_at", { ascending: false })

  if (activeBranchId) csQuery.eq("branch_id", activeBranchId)

  const { data: creditSales } = await csQuery
  const { data: shop } = await supabase.from("shops").select("currency, credit_overdue_days").eq("id", session.shop_id!).single()

  return (
    <CreditClient
      creditSales={creditSales ?? []}
      currency={shop?.currency ?? "USD"}
      overdueThreshold={shop?.credit_overdue_days ?? 30}
      session={session}
    />
  )
}
