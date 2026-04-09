import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { ExpensesClient } from "./expenses-client"

export default async function ExpensesPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const query = supabase
    .from("expenses")
    .select("*")
    .eq("shop_id", session.shop_id!)
    .order("expense_date", { ascending: false })
    .limit(200)

  if (session.branch_id) query.eq("branch_id", session.branch_id)

  const { data: expenses } = await query
  const { data: shop } = await supabase.from("shops").select("currency").eq("id", session.shop_id!).single()

  // For shop-level users (no fixed branch), fetch branches so they can pick one
  let branches: { id: string; name: string }[] = []
  if (!session.branch_id) {
    const { data } = await supabase
      .from("branches")
      .select("id, name")
      .eq("shop_id", session.shop_id!)
      .eq("status", "active")
      .order("name")
    branches = data ?? []
  }

  return (
    <ExpensesClient
      expenses={expenses ?? []}
      currency={shop?.currency ?? "USD"}
      session={session}
      branches={branches}
    />
  )
}
