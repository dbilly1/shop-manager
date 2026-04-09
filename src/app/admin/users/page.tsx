import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AdminUsersClient } from "./admin-users-client"

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = createAdminClient()
  const { data: superAdmin } = await admin.from("super_admins").select("id").eq("user_id", user.id).single()
  if (!superAdmin) redirect("/login")

  const { data: members } = await admin
    .from("shop_members")
    .select("id, user_id, role, status, created_at, shop:shops(name), branch:branches(name)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(200)

  const { data: invites } = await admin
    .from("shop_invites")
    .select("id, email, role, expires_at, created_at, shop:shops(name), branch:branches(name)")
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .limit(100)

  return (
    <AdminUsersClient
      members={(members ?? []) as any}
      invites={(invites ?? []) as any}
    />
  )
}
