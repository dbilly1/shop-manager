import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-guard"
import { createClient } from "@/lib/supabase/server"
import { getPlanForShop, isAtLimit } from "@/lib/plan-guard"
import { logAudit } from "@/lib/audit"

export async function POST(request: Request) {
  const session = await requireRole(["owner"])
  if (session instanceof NextResponse) return session

  const { name, address } = await request.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: "Branch name is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const plan = await getPlanForShop(session.shop_id!)

  const { count } = await supabase
    .from("branches")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", session.shop_id!)
    .eq("status", "active")

  if (isAtLimit(plan, "branches", count ?? 0)) {
    return NextResponse.json(
      {
        error: `Branch limit reached (${count}/${plan?.max_branches}). Upgrade your plan to add more branches.`,
      },
      { status: 403 }
    )
  }

  const { data, error } = await supabase
    .from("branches")
    .insert({
      shop_id: session.shop_id,
      name: name.trim(),
      address: address?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit({
    shopId: session.shop_id!,
    branchId: data.id,
    userId: session.user_id,
    action: "CREATE_BRANCH",
    entityType: "branch",
    entityId: data.id,
    newValues: { name: data.name, address: data.address },
  })

  return NextResponse.json(data, { status: 201 })
}
