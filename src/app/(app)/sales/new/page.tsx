import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { NewSaleForm } from "./new-sale-form"

export default async function NewSalePage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (!session.branch_id && !["owner","general_manager","general_supervisor"].includes(session.role ?? "")) {
    redirect("/sales")
  }

  const supabase = await createClient()
  const branchId = session.branch_id

  // Products available at this branch
  const productsQuery = supabase
    .from("branch_products")
    .select("*, product:products(id, name, unit_type, base_price, cost_price)")
    .eq("is_active", true)

  if (branchId) productsQuery.eq("branch_id", branchId)
  else productsQuery.eq("shop_id", session.shop_id!)

  const { data: branchProducts } = await productsQuery

  // Customers at this branch
  const customersQuery = supabase
    .from("customers")
    .select("id, name, phone")
    .order("name")

  if (branchId) customersQuery.eq("branch_id", branchId)
  else customersQuery.eq("shop_id", session.shop_id!)

  const { data: customers } = await customersQuery

  const { data: shop } = await supabase
    .from("shops")
    .select("currency, pricing_mode")
    .eq("id", session.shop_id!)
    .single()

  // Get branches for consolidated users
  let branches: { id: string; name: string }[] = []
  if (!branchId) {
    const { data } = await supabase.from("branches").select("id, name").eq("shop_id", session.shop_id!).eq("status", "active")
    branches = data ?? []
  }

  return (
    <NewSaleForm
      branchProducts={branchProducts ?? []}
      customers={customers ?? []}
      currency={shop?.currency ?? "USD"}
      pricingMode={shop?.pricing_mode ?? "uniform"}
      session={session}
      branches={branches}
    />
  )
}
