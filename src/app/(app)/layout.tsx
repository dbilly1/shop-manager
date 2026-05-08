import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/session"
import { AppShell } from "./app-shell"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (session.is_super_admin) redirect("/admin/dashboard")
  if (!session.shop_id) redirect("/onboarding")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ""

  const now = new Date().toISOString()

  const [{ data: shop }, { data: branches }, { data: announcements }, { data: subscription }] = await Promise.all([
    supabase.from("shops").select("*").eq("id", session.shop_id).single(),
    supabase
      .from("branches")
      .select("*")
      .eq("shop_id", session.shop_id)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("announcements")
      .select("*")
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("starts_at", { ascending: false }),
    supabase
      .from("shop_subscriptions")
      .select("plan:plans(feature_flags)")
      .eq("shop_id", session.shop_id)
      .single(),
  ])

  const featureFlags: Record<string, boolean> =
    ((subscription?.plan as unknown as Record<string, unknown> | null)?.feature_flags as Record<string, boolean>) ?? {}

  // Resolve initial selected branch from cookie (shop-level users) or session (branch-scoped)
  const cookieStore = await cookies()
  const cookieBranch = cookieStore.get("sm_branch")?.value || null

  let initialSelectedBranchId: string | null = null
  if (session.branch_id) {
    initialSelectedBranchId = session.branch_id
  } else if (cookieBranch && branches?.find((b) => b.id === cookieBranch)) {
    initialSelectedBranchId = cookieBranch
  }

  return (
    <AppShell
      session={session}
      shop={shop ?? null}
      branches={branches ?? []}
      announcements={announcements ?? []}
      initialSelectedBranchId={initialSelectedBranchId}
      userEmail={userEmail}
      featureFlags={featureFlags}
    >
      {children}
    </AppShell>
  )
}
