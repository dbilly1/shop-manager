import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { SettingsClient } from "./settings-client"

export default async function SettingsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const { data: shop } = await supabase.from("shops").select("*").eq("id", session.shop_id!).single()
  const { data: branches } = await supabase.from("branches").select("*").eq("shop_id", session.shop_id!).order("name")
  const { data: subscription } = await supabase
    .from("shop_subscriptions")
    .select("*, plan:plans(*)")
    .eq("shop_id", session.shop_id!)
    .single()
  const { data: allPlans } = await supabase
    .from("plans")
    .select("id, name, price_monthly, max_branches, max_users, max_products, max_customers, feature_flags")
    .eq("is_active", true)
    .order("price_monthly")

  // Role permissions (owner-configurable)
  const { data: rolePermissionsRows } = await supabase
    .from("shop_role_permissions")
    .select("role, permissions")
    .eq("shop_id", session.shop_id!)

  // Index by role name for easy lookup
  const rolePermissions: Record<string, Record<string, boolean>> = {}
  for (const row of rolePermissionsRows ?? []) {
    rolePermissions[row.role] = (row.permissions as Record<string, boolean>) ?? {}
  }

  // Plan usage
  const [
    { count: userCount },
    { count: branchCount },
    { count: productCount },
    { count: customerCount },
  ] = await Promise.all([
    supabase.from("shop_members").select("*", { count: "exact", head: true }).eq("shop_id", session.shop_id!).eq("status", "active"),
    supabase.from("branches").select("*", { count: "exact", head: true }).eq("shop_id", session.shop_id!).eq("status", "active"),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("shop_id", session.shop_id!).eq("is_active", true),
    supabase.from("customers").select("*", { count: "exact", head: true }).eq("shop_id", session.shop_id!),
  ])

  return (
    <SettingsClient
      shop={shop}
      branches={branches ?? []}
      subscription={subscription}
      allPlans={(allPlans ?? []) as unknown as Parameters<typeof SettingsClient>[0]["allPlans"]}
      usage={{ users: userCount ?? 0, branches: branchCount ?? 0, products: productCount ?? 0, customers: customerCount ?? 0 }}
      session={session}
      rolePermissions={rolePermissions}
    />
  )
}
