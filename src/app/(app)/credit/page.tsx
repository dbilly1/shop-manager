import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { CreditClient } from "./credit-client"

export default async function CreditPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const csQuery = supabase
    .from("credit_sales")
    .select("*, customer:customers(id, name, phone), sale:sales(sale_date)")
    .eq("shop_id", session.shop_id!)
    .gt("balance", 0)
    .order("created_at", { ascending: false })

  if (session.branch_id) csQuery.eq("branch_id", session.branch_id)

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
