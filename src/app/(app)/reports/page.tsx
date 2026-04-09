import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { ReportsClient } from "./reports-client"

export default async function ReportsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  // Default: last 30 days
  const endDate = new Date().toISOString().split("T")[0]
  const startDate = new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0]

  const salesQuery = supabase
    .from("sales")
    .select("sale_date, total_amount, payment_method")
    .eq("shop_id", session.shop_id!)
    .gte("sale_date", startDate)
    .lte("sale_date", endDate)
  if (session.branch_id) salesQuery.eq("branch_id", session.branch_id)
  const { data: sales } = await salesQuery

  const expensesQuery = supabase
    .from("expenses")
    .select("expense_date, amount, category")
    .eq("shop_id", session.shop_id!)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
  if (session.branch_id) expensesQuery.eq("branch_id", session.branch_id)
  const { data: expenses } = await expensesQuery

  const saleItemsQuery = supabase
    .from("sale_items")
    .select("product_id, quantity_kg, quantity_units, quantity_boxes, unit_price, line_total, cost_price_at_sale, product:products(name)")
    .eq("shop_id", session.shop_id!)
  if (session.branch_id) saleItemsQuery.eq("branch_id", session.branch_id)
  const { data: saleItems } = await saleItemsQuery

  const { data: creditData } = await supabase
    .from("credit_sales")
    .select("balance, amount_paid")
    .eq("shop_id", session.shop_id!)

  const { data: shop } = await supabase.from("shops").select("currency").eq("id", session.shop_id!).single()

  let branches: { id: string; name: string }[] = []
  if (!session.branch_id) {
    const { data } = await supabase.from("branches").select("id, name").eq("shop_id", session.shop_id!).eq("status", "active")
    branches = data ?? []
  }

  return (
    <ReportsClient
      sales={sales ?? []}
      expenses={expenses ?? []}
      saleItems={(saleItems ?? []) as any}
      creditData={creditData ?? []}
      currency={shop?.currency ?? "USD"}
      startDate={startDate}
      endDate={endDate}
      session={session}
      branches={branches}
    />
  )
}
