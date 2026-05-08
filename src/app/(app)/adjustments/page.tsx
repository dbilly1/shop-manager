import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { AdjustmentsClient } from "./adjustments-client"
import { getActiveBranchId } from "@/lib/branch-cookie"
import { canManageInventory } from "@/lib/permissions"

export default async function AdjustmentsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")
  if (!canManageInventory(session.role!)) redirect("/dashboard")

  const supabase = await createClient()
  const activeBranchId = await getActiveBranchId(session.branch_id)

  const query = supabase
    .from("stock_adjustments")
    .select("*, product:products(name, unit_type)")
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })
    .limit(200)

  if (activeBranchId) query.eq("branch_id", activeBranchId)

  const { data: adjustments } = await query

  const bpQuery = supabase
    .from("branch_products")
    .select("id, branch_id, product:products(id, name, unit_type)")
    .eq("shop_id", session.shop_id!)
    .eq("is_active", true)

  if (activeBranchId) bpQuery.eq("branch_id", activeBranchId)
  const { data: branchProducts } = await bpQuery

  const { data: shop } = await supabase
    .from("shops")
    .select("currency")
    .eq("id", session.shop_id!)
    .single()

  // Resolve display names for all unique adjusters via auth admin
  const adjusterIds = [
    ...new Set((adjustments ?? []).map((a) => a.adjusted_by).filter(Boolean)),
  ] as string[]

  const userNames: Record<string, string> = {}

  if (adjusterIds.length > 0) {
    try {
      const admin = createAdminClient()
      // Resolve each user by ID — more reliable than paginating listUsers
      const results = await Promise.all(
        adjusterIds.map((id) => admin.auth.admin.getUserById(id))
      )
      for (const { data } of results) {
        const u = data?.user
        if (u) {
          userNames[u.id] =
            (u.user_metadata?.full_name as string | undefined) ??
            u.email ??
            u.id.slice(0, 8)
        }
      }
    } catch {
      // Non-fatal: fall back to name stored on the record
    }
  }

  return (
    <AdjustmentsClient
      adjustments={adjustments ?? []}
      branchProducts={(branchProducts ?? []) as unknown as Parameters<typeof AdjustmentsClient>[0]["branchProducts"]}
      currency={shop?.currency ?? "USD"}
      session={session}
      userNames={userNames}
    />
  )
}
