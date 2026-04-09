import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionContext } from "@/lib/session"
import { redirect } from "next/navigation"
import { AdjustmentsClient } from "./adjustments-client"

export default async function AdjustmentsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/login")

  const supabase = await createClient()

  const query = supabase
    .from("stock_adjustments")
    .select("*, product:products(name, unit_type)")
    .eq("shop_id", session.shop_id!)
    .order("created_at", { ascending: false })
    .limit(200)

  if (session.branch_id) query.eq("branch_id", session.branch_id)

  const { data: adjustments } = await query

  const bpQuery = supabase
    .from("branch_products")
    .select("id, branch_id, product:products(id, name, unit_type)")
    .eq("shop_id", session.shop_id!)
    .eq("is_active", true)

  if (session.branch_id) bpQuery.eq("branch_id", session.branch_id)
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
      const { data: usersData } = await admin.auth.admin.listUsers({
        perPage: 500,
      })
      for (const u of usersData?.users ?? []) {
        if (adjusterIds.includes(u.id)) {
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
      branchProducts={(branchProducts ?? []) as any}
      currency={shop?.currency ?? "USD"}
      session={session}
      userNames={userNames}
    />
  )
}
