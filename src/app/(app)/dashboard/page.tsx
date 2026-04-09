import { createClient } from "@/lib/supabase/server"
import { getSessionContext, canAccessConsolidatedView } from "@/lib/session"
import { redirect } from "next/navigation"
import { BranchDashboard } from "./branch-dashboard"
import { ConsolidatedDashboard } from "./consolidated-dashboard"

export default async function DashboardPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (!session.role) redirect("/login")

  if (canAccessConsolidatedView(session.role)) {
    return <ConsolidatedDashboard session={session} />
  }
  return <BranchDashboard session={session} />
}
