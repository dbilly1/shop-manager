import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AdminSettingsClient } from "./admin-settings-client"

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = createAdminClient()
  const { data: superAdmin } = await admin.from("super_admins").select("id").eq("user_id", user.id).single()
  if (!superAdmin) redirect("/login")

  const { count: totalShops } = await admin.from("shops").select("*", { count: "exact", head: true })
  const { count: totalUsers } = await admin.from("shop_members").select("*", { count: "exact", head: true }).eq("status", "active")
  const { count: activeSubscriptions } = await admin.from("shop_subscriptions").select("*", { count: "exact", head: true }).eq("status", "active")

  return (
    <AdminSettingsClient
      stats={{
        totalShops: totalShops ?? 0,
        totalUsers: totalUsers ?? 0,
        activeSubscriptions: activeSubscriptions ?? 0,
      }}
    />
  )
}
