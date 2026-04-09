import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { SalesPageClient } from "./sales-page-client"

export default async function SalesPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const ninetyDaysAgo = new Date(Date.now() - 89 * 86400000).toISOString().split("T")[0]

  // Sales (last 90 days)
  const salesQuery = supabase
    .from("sales")
    .select("sale_date, total_amount, payment_method")
    .eq("shop_id", session.shop_id!)
    .gte("sale_date", ninetyDaysAgo)
    .order("sale_date", { ascending: false })
  if (session.branch_id) salesQuery.eq("branch_id", session.branch_id)
  const { data: salesRaw } = await salesQuery

  // Reconciliations (last 90 days) — indexed by date
  const reconQuery = supabase
    .from("reconciliations")
    .select("reconciliation_date, cash_variance, mobile_variance, status")
    .eq("shop_id", session.shop_id!)
    .gte("reconciliation_date", ninetyDaysAgo)
  if (session.branch_id) reconQuery.eq("branch_id", session.branch_id)
  const { data: reconRaw } = await reconQuery

  const reconByDate: Record<string, { cash_variance: number; mobile_variance: number; status: string }> = {}
  for (const r of reconRaw ?? []) {
    reconByDate[r.reconciliation_date] = r
  }

  // Aggregate sales by date
  const byDate: Record<string, { total: number; cash: number; mobile: number; credit: number; count: number }> = {}
  for (const s of salesRaw ?? []) {
    if (!byDate[s.sale_date]) byDate[s.sale_date] = { total: 0, cash: 0, mobile: 0, credit: 0, count: 0 }
    byDate[s.sale_date].total += s.total_amount
    byDate[s.sale_date][s.payment_method as "cash" | "mobile" | "credit"] += s.total_amount
    byDate[s.sale_date].count++
  }

  const summaries = Object.entries(byDate)
    .map(([date, v]) => ({ sale_date: date, ...v, recon: reconByDate[date] ?? null }))
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date))

  // Branch products (for sale form)
  let bpQuery = supabase
    .from("branch_products")
    .select("id, branch_id, override_price, current_stock_kg, current_stock_units, current_stock_boxes, product:products(id, name, unit_type, units_per_box, base_price, cost_price)")
    .eq("shop_id", session.shop_id!)
    .eq("is_active", true)
  if (session.branch_id) bpQuery = bpQuery.eq("branch_id", session.branch_id)
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

  return (
    <SalesPageClient
      summaries={summaries}
      branchProducts={(branchProducts ?? []) as any}
      customers={customers ?? []}
      currency={shop?.currency ?? "USD"}
      session={session}
      branches={branches}
    />
  )
}
