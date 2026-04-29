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

  // Supabase types nested selects as arrays — coerce to single objects for the client
  type SbMember = { id: string; user_id: string; role: string; status: string; created_at: string; shop: { name: string } | null; branch: { name: string } | null }
  type SbInvite = { id: string; email: string; role: string; expires_at: string; created_at: string; shop: { name: string } | null; branch: { name: string } | null }

  return (
    <AdminUsersClient
      members={(members ?? []) as unknown as SbMember[]}
      invites={(invites ?? []) as unknown as SbInvite[]}
    />
  )
}
