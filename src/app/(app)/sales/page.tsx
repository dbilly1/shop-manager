import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { redirect } from "next/navigation"
import { SalesPageClient } from "./sales-page-client"

export default async function SalesPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  // Sales — all time, no date cap
  const salesQuery = supabase
    .from("sales")
    .select("sale_date, total_amount, payment_method, taxes_snapshot")
    .eq("shop_id", session.shop_id!)
    .order("sale_date", { ascending: false })
    .limit(10000)
  if (activeBranchId) salesQuery.eq("branch_id", activeBranchId)
  const { data: salesRaw } = await salesQuery

  // Reconciliations — all time
  const reconQuery = supabase
    .from("reconciliations")
    .select("reconciliation_date, cash_variance, mobile_variance, status")
    .eq("shop_id", session.shop_id!)
    .limit(10000)
  if (activeBranchId) reconQuery.eq("branch_id", activeBranchId)
  const { data: reconRaw } = await reconQuery

  const reconByDate: Record<string, { cash_variance: number; mobile_variance: number; status: string }> = {}
  for (const r of reconRaw ?? []) {
    reconByDate[r.reconciliation_date] = r
  }

  // Aggregate sales by date
  const byDate: Record<string, { total: number; cash: number; mobile: number; credit: number; count: number; tax: number }> = {}
  for (const s of salesRaw ?? []) {
    if (!byDate[s.sale_date]) byDate[s.sale_date] = { total: 0, cash: 0, mobile: 0, credit: 0, count: 0, tax: 0 }
    byDate[s.sale_date].total += s.total_amount
    byDate[s.sale_date][s.payment_method as "cash" | "mobile" | "credit"] += s.total_amount
    byDate[s.sale_date].count++
    const saleTax = ((s.taxes_snapshot ?? []) as { amount: number }[]).reduce((sum, t) => sum + t.amount, 0)
    byDate[s.sale_date].tax += saleTax
  }

  const summaries = Object.entries(byDate)
    .map(([date, v]) => ({ sale_date: date, ...v, recon: reconByDate[date] ?? null }))
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date))

  // Branch products (for sale form) — filtered to active branch when one is selected
  let bpQuery = supabase
    .from("branch_products")
    .select("id, branch_id, override_price, current_stock_kg, current_stock_units, current_stock_boxes, product:products(id, name, unit_type, units_per_box, base_price, cost_price)")
    .eq("shop_id", session.shop_id!)
    .eq("is_active", true)
  if (activeBranchId) bpQuery = bpQuery.eq("branch_id", activeBranchId)
  const { data: branchProducts } = await bpQuery

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", session.shop_id!)
    .order("name")

  const { data: shop } = await supabase.from("shops").select("currency, pricing_mode").eq("id", session.shop_id!).single()

  let branches: { id: string; name: string }[] = []
  if (!session.branch_id) {
    const { data } = await supabase.from("branches").select("id, name").eq("shop_id", session.shop_id!).eq("status", "active")
    branches = data ?? []
  }

  type SbBranchProduct = {
    id: string
    branch_id: string
    override_price: number | null
    current_stock_kg: number
    current_stock_units: number
    current_stock_boxes: number
    product: { id: string; name: string; unit_type: string; units_per_box: number | null; base_price: number; cost_price: number } | null
  }

  return (
    <SalesPageClient
      summaries={summaries}
      branchProducts={(branchProducts ?? []) as unknown as SbBranchProduct[]}
      customers={customers ?? []}
      currency={shop?.currency ?? "USD"}
      session={session}
      branches={branches}
      activeBranchId={activeBranchId}
    />
  )
}
