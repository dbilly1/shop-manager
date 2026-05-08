import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { redirect } from "next/navigation"
import { InventoryClient } from "./inventory-client"
import { canManageInventory } from "@/lib/permissions"

export default async function InventoryPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (!canManageInventory(session.role!)) redirect("/dashboard")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  // When a specific branch is selected fetch only that branch; otherwise fetch
  // all branches so the client can aggregate them into one row per product.
  let branchProductsQuery = supabase
    .from("branch_products")
    .select("*, product:products(id, name, sku, category, unit_type, units_per_box, base_price, cost_price, reorder_threshold, audit_threshold_pct)")
    .eq("shop_id", session.shop_id!)
    .eq("is_active", true)
    .order("product(name)")

  if (activeBranchId) {
    branchProductsQuery = branchProductsQuery.eq("branch_id", activeBranchId)
  }

  const { data: branchProducts } = await branchProductsQuery

  const { data: shop } = await supabase.from("shops").select("currency").eq("id", session.shop_id!).single()

  let branches: { id: string; name: string }[] = []
  if (!session.branch_id) {
    const { data } = await supabase.from("branches").select("id, name").eq("shop_id", session.shop_id!).eq("status", "active")
    branches = data ?? []
  }

  const { data: categoriesRaw } = await supabase
    .from("product_categories")
    .select("id, name")
    .eq("shop_id", session.shop_id!)
    .order("name")

  return (
    <InventoryClient
      branchProducts={branchProducts ?? []}
      currency={shop?.currency ?? "USD"}
      session={session}
      branches={branches}
      categories={categoriesRaw ?? []}
    />
  )
}
