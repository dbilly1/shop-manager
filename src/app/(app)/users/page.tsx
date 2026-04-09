import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { UsersClient } from "./users-client"

export default async function UsersPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const { data: members } = await supabase
    .from("shop_members")
    .select("*, branch:branches(name)")
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })

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
      members={members ?? []}
      invites={invites ?? []}
      branches={branches ?? []}
      session={session}
    />
  )
}
