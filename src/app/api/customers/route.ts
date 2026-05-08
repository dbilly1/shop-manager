import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth-guard"
import { createClient } from "@/lib/supabase/server"
import { getPlanForShop, isAtLimit } from "@/lib/plan-guard"
import { logAudit } from "@/lib/audit"

export async function POST(request: Request) {
  // owner → branch_supervisor (mirrors canManageCredit — broadest customer-related permission)
  const session = await requireRole(["owner", "general_manager", "general_supervisor", "branch_manager", "branch_supervisor"])
  if (session instanceof NextResponse) return session

  const { name, phone, email, address, branch_id } = await request.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 })
  }
  if (!branch_id) {
    return NextResponse.json({ error: "Branch is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const plan = await getPlanForShop(session.shop_id!)

  const { count } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", session.shop_id!)

  if (isAtLimit(plan, "customers", count ?? 0)) {
    return NextResponse.json(
      {
        error: `Customer limit reached (${count}/${plan?.max_customers}). Upgrade your plan to add more customers.`,
      },
      { status: 403 }
    )
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      shop_id: session.shop_id,
      branch_id,
      name: name.trim(),
      phone: phone || null,
      email: email || null,
      address: address || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit({
    shopId: session.shop_id!,
    branchId: branch_id,
    userId: session.user_id,
    action: "ADD_CUSTOMER",
    entityType: "customer",
    entityId: data.id,
    newValues: { name: data.name, phone: data.phone },
  })

  return NextResponse.json(data, { status: 201 })
}
