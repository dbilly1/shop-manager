import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { AlertsClient } from "./alerts-client"

export default async function AlertsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const query = supabase
    .from("alerts")
    .select("*, branch:branches(name)")
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })
    .limit(100)

  if (session.branch_id) query.eq("branch_id", session.branch_id)

  const { data: alerts } = await query

  return <AlertsClient alerts={alerts ?? []} session={session} />
}
