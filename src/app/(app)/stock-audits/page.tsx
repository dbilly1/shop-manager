import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { canManageStockAudits } from "@/lib/permissions"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { StockAuditsClient } from "./stock-audits-client"

export default async function StockAuditsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (!canManageStockAudits(session.role!)) redirect("/dashboard")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  // Branch products — for creating new audits (snapshot stock)
  const bpQuery = supabase
    .from("branch_products")
    .select("id, branch_id, current_stock_kg, current_stock_units, product:products(id, name, unit_type, units_per_box)")
    .eq("shop_id", session.shop_id!)
    .eq("is_active", true)
    .order("product(name)")

  if (activeBranchId) bpQuery.eq("branch_id", activeBranchId)
  const { data: branchProducts } = await bpQuery

  // Past audits with items
  const auditQuery = supabase
    .from("stock_audits")
    .select(`
      id, branch_id, audit_type, status, notes,
      conducted_by_name, completed_at, created_at,
      stock_audit_items (
        id, product_id, system_stock, physical_count, is_adjusted, adjustment_id,
        product:products(name, unit_type, units_per_box, audit_threshold_pct)
      )
    `)
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })
    .limit(100)

  if (activeBranchId) auditQuery.eq("branch_id", activeBranchId)
  const { data: audits } = await auditQuery

  // Branches list for display (branch name in audit header)
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
    <StockAuditsClient
      audits={(audits ?? []) as unknown as Parameters<typeof StockAuditsClient>[0]["audits"]}
      branchProducts={(branchProducts ?? []) as unknown as Parameters<typeof StockAuditsClient>[0]["branchProducts"]}
      branches={branches ?? []}
      session={session}
      currency={shop?.currency ?? "GHS"}
      activeBranchId={activeBranchId}
    />
  )
}
