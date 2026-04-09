import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { CustomersClient } from "./customers-client"

export default async function CustomersPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const query = supabase
    .from("customers")
    .select("*")
    .eq("shop_id", session.shop_id!)
    .order("name")

  if (session.branch_id) query.eq("branch_id", session.branch_id)
  const { data: customers } = await query

  // Get outstanding credit per customer
  const { data: creditData } = await supabase
    .from("credit_sales")
    .select("customer_id, balance")
    .eq("shop_id", session.shop_id!)
    .gt("balance", 0)

  const creditByCustomer: Record<string, number> = {}
  for (const c of creditData ?? []) {
    creditByCustomer[c.customer_id] = (creditByCustomer[c.customer_id] ?? 0) + c.balance
  }

  const { data: shop } = await supabase.from("shops").select("currency").eq("id", session.shop_id!).single()

  let branches: { id: string; name: string }[] = []
  if (!session.branch_id) {
    const { data } = await supabase.from("branches").select("id, name").eq("shop_id", session.shop_id!).eq("status", "active")
    branches = data ?? []
  }

  return (
    <CustomersClient
      customers={(customers ?? []).map((c) => ({ ...c, outstanding_credit: creditByCustomer[c.id] ?? 0 }))}
      currency={shop?.currency ?? "USD"}
      session={session}
      branches={branches}
    />
  )
}
