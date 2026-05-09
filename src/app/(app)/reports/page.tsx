import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { redirect } from "next/navigation"
import { ReportsClient } from "./reports-client"
import { getPlanForShop, hasFeature } from "@/lib/plan-guard"
import { canViewReports } from "@/lib/permissions"

export default async function ReportsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const plan = await getPlanForShop(session.shop_id!)
  if (!hasFeature(plan, "advanced_reports")) redirect("/dashboard")
  if (!canViewReports(session.role!)) redirect("/dashboard")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  // Default date range shown in the filter on load: last 30 days
  const today = new Date()
  const endDate = today.toISOString().split("T")[0]
  const startDate = new Date(today.getTime() - 29 * 86400000).toISOString().split("T")[0]

  // Sales — all time; client filters to selected range and derives prior period itself
  const salesQuery = supabase
    .from("sales")
    .select("sale_date, total_amount, payment_method")
    .eq("shop_id", session.shop_id!)
    .order("sale_date", { ascending: false })
    .limit(10000)
  if (activeBranchId) salesQuery.eq("branch_id", activeBranchId)
  const { data: sales } = await salesQuery

  // Expenses — all time
  const expensesQuery = supabase
    .from("expenses")
    .select("expense_date, amount, category")
    .eq("shop_id", session.shop_id!)
    .order("expense_date", { ascending: false })
    .limit(10000)
  if (activeBranchId) expensesQuery.eq("branch_id", activeBranchId)
  const { data: expenses } = await expensesQuery

  // Sale items — all time (no server-side date filter so Products tab always has data).
  // sale_date comes from the parent sales row via join for client-side date filtering.
  const saleItemsQuery = supabase
    .from("sale_items")
    .select("product_id, quantity_kg, quantity_units, quantity_boxes, unit_price, line_total, cost_price_at_sale, product:products(name), sale:sales(sale_date)")
    .eq("shop_id", session.shop_id!)
  if (activeBranchId) saleItemsQuery.eq("branch_id", activeBranchId)
  const { data: saleItems } = await saleItemsQuery

  // Credit data
  const creditQuery = supabase
    .from("credit_sales")
    .select("balance, amount_paid")
    .eq("shop_id", session.shop_id!)
  if (activeBranchId) creditQuery.eq("branch_id", activeBranchId)
  const { data: creditData } = await creditQuery

  // Reconciliation data — all time; client filters to selected range
  const reconciliationsQuery = supabase
    .from("reconciliations")
    .select("status, cash_variance, mobile_variance, reconciliation_date")
    .eq("shop_id", session.shop_id!)
    .limit(10000)
  if (activeBranchId) reconciliationsQuery.eq("branch_id", activeBranchId)
  const { data: reconciliations } = await reconciliationsQuery

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
    sale: { sale_date: string } | null
  }

  type SbReconciliation = {
    status: string
    cash_variance: number
    mobile_variance: number
  }

  return (
    <ReportsClient
      sales={sales ?? []}
      expenses={expenses ?? []}
      saleItems={(saleItems ?? []) as unknown as SbSaleItem[]}
      creditData={creditData ?? []}
      reconciliations={(reconciliations ?? []) as unknown as SbReconciliation[]}
      currency={shop?.currency ?? "USD"}
      startDate={startDate}
      endDate={endDate}
    />
  )
}
