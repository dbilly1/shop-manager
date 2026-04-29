import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { redirect } from "next/navigation"
import { ReportsClient } from "./reports-client"

export default async function ReportsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  // Default: last 30 days
  const today = new Date()
  const endDate = today.toISOString().split("T")[0]
  const startDate = new Date(today.getTime() - 29 * 86400000).toISOString().split("T")[0]

  const salesQuery = supabase
    .from("sales")
    .select("sale_date, total_amount, payment_method")
    .eq("shop_id", session.shop_id!)
    .gte("sale_date", startDate)
    .lte("sale_date", endDate)
  if (activeBranchId) salesQuery.eq("branch_id", activeBranchId)
  const { data: sales } = await salesQuery

  const expensesQuery = supabase
    .from("expenses")
    .select("expense_date, amount, category")
    .eq("shop_id", session.shop_id!)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
  if (activeBranchId) expensesQuery.eq("branch_id", activeBranchId)
  const { data: expenses } = await expensesQuery

  const saleItemsQuery = supabase
    .from("sale_items")
    .select("product_id, quantity_kg, quantity_units, quantity_boxes, unit_price, line_total, cost_price_at_sale, product:products(name)")
    .eq("shop_id", session.shop_id!)
  if (activeBranchId) saleItemsQuery.eq("branch_id", activeBranchId)
  const { data: saleItems } = await saleItemsQuery

  const creditQuery = supabase
    .from("credit_sales")
    .select("balance, amount_paid")
    .eq("shop_id", session.shop_id!)
  if (activeBranchId) creditQuery.eq("branch_id", activeBranchId)
  const { data: creditData } = await creditQuery

  const { data: shop } = await supabase.from("shops").select("currency").eq("id", session.shop_id!).single()

  type SbSaleItem = {
    product_id: string
    quantity_kg: number
    quantity_units: number
    quantity_boxes: number
    unit_price: number
    line_total: number
    cost_price_at_sale: number
    product: { name: string } | null
  }

  return (
    <ReportsClient
      sales={sales ?? []}
      expenses={expenses ?? []}
      saleItems={(saleItems ?? []) as unknown as SbSaleItem[]}
      creditData={creditData ?? []}
      currency={shop?.currency ?? "USD"}
      startDate={startDate}
      endDate={endDate}
    />
  )
}
