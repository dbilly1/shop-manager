import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { UsersClient } from "./users-client"

export default async function UsersPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: members } = await supabase
    .from("shop_members")
    .select("*, branch:branches(name)")
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })

  // Resolve full names from auth for each member
  const membersWithNames = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await admin.auth.admin.getUserById(m.user_id)
      const full_name: string | null =
        data.user?.user_metadata?.full_name ?? data.user?.email ?? null
      return { ...m, full_name }
    })
  )

  const { data: invites } = await supabase
    .from("shop_invites")
    .select("*, branch:branches(name)")
    .eq("shop_id", session.shop_id!)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("shop_id", session.shop_id!)
    .eq("status", "active")

  return (
    <UsersClient
      members={membersWithNames}
      invites={invites ?? []}
      branches={branches ?? []}
      session={session}
    />
  )
}
