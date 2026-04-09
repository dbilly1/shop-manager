import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { InventoryClient } from "./inventory-client"

export default async function InventoryPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  // For branch users show their branch; for consolidated show all
  let branchProductsQuery = supabase
    .from("branch_products")
    .select("*, product:products(id, name, sku, category, unit_type, units_per_box, base_price, cost_price, reorder_threshold)")
    .eq("shop_id", session.shop_id!)
    .eq("is_active", true)
    .order("product(name)")

  if (session.branch_id) {
    branchProductsQuery = branchProductsQuery.eq("branch_id", session.branch_id)
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
