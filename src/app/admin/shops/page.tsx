import { createAdminClient } from "@/lib/supabase/admin"
import { AdminShopsClient } from "./admin-shops-client"

export default async function AdminShopsPage() {
  const admin = createAdminClient()

  const { data: shops } = await admin
    .from("shops")
    .select("*, plan:plans(name)")
    .order("created_at", { ascending: false })

  const { data: plans } = await admin.from("plans").select("id, name").eq("is_active", true)

  // Get branch/user counts per shop
  const { data: branchCounts } = await admin.from("branches").select("shop_id").eq("status", "active")
  const { data: memberCounts } = await admin.from("shop_members").select("shop_id").eq("status", "active")

  const bc: Record<string, number> = {}
  const mc: Record<string, number> = {}
  for (const b of branchCounts ?? []) bc[b.shop_id] = (bc[b.shop_id] ?? 0) + 1
  for (const m of memberCounts ?? []) mc[m.shop_id] = (mc[m.shop_id] ?? 0) + 1

  return (
    <AdminShopsClient
      shops={(shops ?? []).map((s) => ({
        ...s,
        plan_name: (s.plan as { name: string } | null)?.name ?? "Free",
        branch_count: bc[s.id] ?? 0,
        user_count: mc[s.id] ?? 0,
      }))}
      plans={plans ?? []}
    />
  )
}
